import PIXI from '../pixi';

import {MAP_SQUARE_LAVA} from "../constants";
import {MAP_SQUARE_ROCK} from "../constants";
import {MAP_SQUARE_BUILDING} from "../constants";
import {BUILDING_COMMAND_CENTER} from "../constants";
import {BUILDING_FACTORY} from "../constants";
import {BUILDING_RESEARCH} from "../constants";
import {BUILDING_HOUSE} from "../constants";
import {BUILDING_REPAIR} from "../constants";
import {POPULATION_MAX_HOUSE} from "../constants";
import {POPULATION_MAX_NON_HOUSE} from "../constants";

var minTX = 0;
var maxTX = 0;
var minTY = 0;
var maxTY = 0;

const TILE_SIZE = 48;
const REDRAW_RADIUS_TILES = 24;
const VIEW_RADIUS_TILES = 40;

const ensureLayers = (backgroundTiles) => {
    if (!backgroundTiles.tileLayer) {
        backgroundTiles.tileLayer = new PIXI.tilemap.CompositeRectTileLayer(0, null, true);
        backgroundTiles.addChild(backgroundTiles.tileLayer);
    }
    if (!backgroundTiles.edgeOverlay) {
        const overlay = new PIXI.Graphics();
        overlay.alpha = 1;
        backgroundTiles.edgeOverlay = overlay;
        backgroundTiles.addChild(overlay);
    } else if (!backgroundTiles.edgeOverlay.parent) {
        backgroundTiles.addChild(backgroundTiles.edgeOverlay);
    }
};

var drawLava = (game, tileLayer, i, j, tileX, tileY) => {
    var tmpText = new PIXI.Texture(
        game.textures['lavaTexture'].baseTexture,
        new PIXI.Rectangle(game.tiles[tileX][tileY], 0, TILE_SIZE, TILE_SIZE)
    );

    tileLayer.addFrame(tmpText, i * TILE_SIZE, j * TILE_SIZE);
};


var drawRocks = (game, tileLayer, i, j, tileX, tileY) => {
    var tmpText = new PIXI.Texture(
        game.textures['rockTexture'].baseTexture,
        new PIXI.Rectangle(game.tiles[tileX][tileY], 0, TILE_SIZE, TILE_SIZE)
    );
    tileLayer.addFrame(tmpText, i * TILE_SIZE, j * TILE_SIZE);
};


var drawBuilding = (game, tileLayer, i, j, tileX, tileY) => {


    var type = game.tiles[tileX][tileY];
    var subType = type % 100;
    var baseType = parseInt(type / 100, 10);

    const building = game.buildingFactory.getBuildingByCoord(tileX, tileY);



    var tmpText = new PIXI.Texture(
        game.textures['buildings'].baseTexture,
        new PIXI.Rectangle(0, baseType * 144, 144, 144, 144)
    );

    tileLayer.addFrame(tmpText, i * TILE_SIZE, j * TILE_SIZE, 1, 0);

    let buildingOverlayTexture = null;
    try {
        buildingOverlayTexture = new PIXI.Texture(
            game.textures['imageItems'].baseTexture,
            new PIXI.Rectangle(subType * 32, 0, 32, 32)
        );
    } catch (ex) {
        buildingOverlayTexture = null;
    }

    if (buildingOverlayTexture) {
        switch (baseType) {
            case BUILDING_RESEARCH:
                tileLayer.addFrame(buildingOverlayTexture, (i * TILE_SIZE) + 14, (j * TILE_SIZE) + 98);
                break;
            case BUILDING_FACTORY:
                tileLayer.addFrame(buildingOverlayTexture, (i * TILE_SIZE) + 56, (j * TILE_SIZE) + 52);
                break;
        }
    }

    if (building && building.population > 0 && game.textures['population']) {
        const frameWidth = TILE_SIZE;
        const frameHeight = TILE_SIZE;
        const columns = 7;
        const maxStage = columns - 1; // stages 0-6 per original sprite sheet
        const buildingFamily = building ? Math.floor(Number(building.type) / 100) : baseType;
        const isHouseBuilding = buildingFamily === BUILDING_HOUSE;
        const isCommandCenter = buildingFamily === BUILDING_COMMAND_CENTER;
        const maxPop = isHouseBuilding ? POPULATION_MAX_HOUSE : POPULATION_MAX_NON_HOUSE;
        if (maxPop > 0) {
            const clampedPop = Math.max(0, Math.min(maxPop, building.population));
            const frameIndex = Math.min(maxStage, Math.floor((clampedPop * maxStage) / maxPop));
            const frameColumn = frameIndex; // single row progression (0-6)
            const frameRow = isCommandCenter ? 1 : 0;

            const populationTexture = new PIXI.Texture(
                game.textures['population'].baseTexture,
                new PIXI.Rectangle(frameColumn * frameWidth, frameRow * frameHeight, frameWidth, frameHeight)
            );

            const populationOffsets = {
                [BUILDING_COMMAND_CENTER]: { x: 96, y: 49 },
                [BUILDING_FACTORY]: { x: 96, y: 48 },
                [BUILDING_REPAIR]: { x: 96, y: 48 },
                [BUILDING_HOUSE]: { x: 96, y: 90 },
                [BUILDING_RESEARCH]: { x: 96, y: 90 },
            };

            const { x: offsetX = 96, y: offsetY = 48 } =
                populationOffsets[buildingFamily] ||
                populationOffsets[baseType] ||
                { x: 96, y: 48 };

            const overlayX = (i * TILE_SIZE) + offsetX;
            const overlayY = (j * TILE_SIZE) + offsetY;

            tileLayer.addFrame(populationTexture, overlayX, overlayY);
        }
    }

    if (baseType === BUILDING_FACTORY && building && building.smokeActive && game.textures['smoke']) {
        const smokeFrame = Math.max(0, (building.smokeFrame || 1) - 1);
        const smokeTexture = new PIXI.Texture(
            game.textures['smoke'].baseTexture,
            new PIXI.Rectangle(0, smokeFrame * 60, 180, 60)
        );
        const smokeX = (i * TILE_SIZE) + 6;
        const smokeY = (j * TILE_SIZE) - 15;
        tileLayer.addFrame(smokeTexture, smokeX, smokeY);
    }

    if (baseType === BUILDING_FACTORY && building && typeof building.itemsLeft === 'number' && game.textures['blackNumbers']) {
        const cappedValue = Math.max(0, Math.min(99, Math.floor(building.itemsLeft)));
        const tens = Math.floor(cappedValue / 10);
        const ones = cappedValue % 10;

        const addDigit = (digit, offsetX) => {
            const digitTexture = new PIXI.Texture(
                game.textures['blackNumbers'].baseTexture,
                new PIXI.Rectangle(digit * 16, 0, 16, 16)
            );
            tileLayer.addFrame(digitTexture, (i * TILE_SIZE) + offsetX, (j * TILE_SIZE) + 84);
        };

        addDigit(tens, 56);
        addDigit(ones, 72);
    }


};

var setRedrawBoundaries = (game) => {
    const centerTileX = game.player.offset.x / TILE_SIZE;
    const centerTileY = game.player.offset.y / TILE_SIZE;
    minTX = centerTileX - REDRAW_RADIUS_TILES;
    maxTX = centerTileX + REDRAW_RADIUS_TILES;
    minTY = centerTileY - REDRAW_RADIUS_TILES;
    maxTY = centerTileY + REDRAW_RADIUS_TILES;
};

var needToRedraw = (game) => {

    if (game.forceDraw) {
        return true;
    }

    const playerTileX = game.player.offset.x / TILE_SIZE;
    const playerTileY = game.player.offset.y / TILE_SIZE;

    if (playerTileX >= maxTX
        || playerTileX <= minTX
        || playerTileY >= maxTY
        || playerTileY <= minTY
    ) {
        return true;
    }
    return false;
};


export const drawTiles = (game, backgroundTiles) => {

    if (!game || !backgroundTiles || !game.map || !game.map.length) {
        return;
    }

    ensureLayers(backgroundTiles);
    const tileLayer = backgroundTiles.tileLayer;
    const edgeOverlay = backgroundTiles.edgeOverlay;
    if (!tileLayer || !edgeOverlay) {
        return;
    }

    var offTileX = Math.floor(game.player.offset.x % TILE_SIZE);
    var offTileY = Math.floor(game.player.offset.y % TILE_SIZE);


    if (needToRedraw(game)) {

        setRedrawBoundaries(game);

        tileLayer.clear();
        edgeOverlay.clear();
        edgeOverlay.beginFill(0x000000, 1);

        var exactX = Math.floor(game.player.offset.x / TILE_SIZE);
        var exactY = Math.floor(game.player.offset.y / TILE_SIZE);
        var mapWidth = game.map.length;
        var mapHeight = Array.isArray(game.map[0]) ? game.map[0].length : 0;

        for (var i = -VIEW_RADIUS_TILES; i < VIEW_RADIUS_TILES; i++) {
            for (var j = -VIEW_RADIUS_TILES; j < VIEW_RADIUS_TILES; j++) {

                var tileX = exactX + i;
                var tileY = exactY + j;


                if (tileX < 0 || tileY < 0 || tileX >= mapWidth || tileY >= mapHeight) {
                    edgeOverlay.drawRect(i * TILE_SIZE, j * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    continue;
                }

                if (game.map[tileX][tileY] == MAP_SQUARE_LAVA) {
                    drawLava(game, tileLayer, i, j, tileX, tileY);
                }

                if (game.map[tileX][tileY] == MAP_SQUARE_ROCK) {
                    drawRocks(game, tileLayer, i, j, tileX, tileY);
                }

                if (game.map[tileX][tileY] >= MAP_SQUARE_BUILDING) {
                    drawBuilding(game, tileLayer, i, j, tileX, tileY);
                }
            }
        }
        edgeOverlay.endFill();

        backgroundTiles.position.set(
            game.player.defaultOffset.x + game.player.offset.x - offTileX,
            game.player.defaultOffset.y + game.player.offset.y - offTileY
        );
    }

    backgroundTiles.pivot.set(game.player.offset.x, game.player.offset.y);
};
