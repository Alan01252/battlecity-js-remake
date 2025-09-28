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

var drawLava = (game, backgroundTiles, i, j, tileX, tileY) => {
    var tmpText = new PIXI.Texture(
        game.textures['lavaTexture'].baseTexture,
        new PIXI.Rectangle(game.tiles[tileX][tileY], 0, 48, 48)
    );

    backgroundTiles.addFrame(tmpText, i * 48, j * 48);
};


var drawRocks = (game, backgroundTiles, i, j, tileX, tileY) => {
    var tmpText = new PIXI.Texture(
        game.textures['rockTexture'].baseTexture,
        new PIXI.Rectangle(game.tiles[tileX][tileY], 0, 48, 48)
    );
    backgroundTiles.addFrame(tmpText, i * 48, j * 48);
};


var drawBuilding = (game, backgroundTiles, i, j, tileX, tileY) => {


    var type = game.tiles[tileX][tileY];
    var subType = type % 100;
    var baseType = parseInt(type / 100);

    const building = game.buildingFactory.getBuildingByCoord(tileX, tileY);



    var tmpText = new PIXI.Texture(
        game.textures['buildings'].baseTexture,
        new PIXI.Rectangle(0, baseType * 144, 144, 144, 144)
    );

    backgroundTiles.addFrame(tmpText, i * 48, j * 48, 1, 0);

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
                backgroundTiles.addFrame(buildingOverlayTexture, (i * 48) + 14, (j * 48) + 100);
                break;
            case BUILDING_FACTORY:
                backgroundTiles.addFrame(buildingOverlayTexture, (i * 48) + 56, (j * 48) + 52);
                break;
        }
    }

    if (building && building.population > 0 && game.textures['population']) {
        const frameWidth = 48;
        const frameHeight = 48;
        const columns = 7;
        const totalFrames = columns * 2;
        const isHouseBuilding = baseType === BUILDING_HOUSE;
        const maxPop = isHouseBuilding ? POPULATION_MAX_HOUSE : POPULATION_MAX_NON_HOUSE;
        if (maxPop > 0) {
            const clampedPop = Math.max(0, Math.min(maxPop, building.population));
            const frameIndex = Math.min(totalFrames - 1, Math.floor((clampedPop / maxPop) * (totalFrames - 1)));
            const frameColumn = frameIndex % columns;
            const frameRow = Math.floor(frameIndex / columns);

            const populationTexture = new PIXI.Texture(
                game.textures['population'].baseTexture,
                new PIXI.Rectangle(frameColumn * frameWidth, frameRow * frameHeight, frameWidth, frameHeight)
            );

            let offsetX = 96;
            let offsetY = 48;

            switch (baseType) {
                case BUILDING_COMMAND_CENTER:
                    offsetY = 49;
                    break;
                case BUILDING_FACTORY:
                    offsetY = 48;
                    break;
                case BUILDING_REPAIR:
                    offsetX = 92;
                    offsetY = 92;
                    break;
                case BUILDING_HOUSE:
                    offsetY = 90;
                    break;
                case BUILDING_RESEARCH:
                    offsetY = 90;
                    break;
                default:
                    offsetX = 96;
                    offsetY = 48;
            }

            const overlayX = (i * 48) + offsetX;
            const overlayY = (j * 48) + offsetY;

            backgroundTiles.addFrame(populationTexture, overlayX, overlayY);
        }
    }

    if (baseType === BUILDING_FACTORY && building && building.smokeActive && game.textures['smoke']) {
        const smokeFrame = Math.max(0, (building.smokeFrame || 1) - 1);
        const smokeTexture = new PIXI.Texture(
            game.textures['smoke'].baseTexture,
            new PIXI.Rectangle(0, smokeFrame * 60, 180, 60)
        );
        const smokeX = (i * 48) + 6;
        const smokeY = (j * 48) - 15;
        backgroundTiles.addFrame(smokeTexture, smokeX, smokeY);
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
            backgroundTiles.addFrame(digitTexture, (i * 48) + offsetX, (j * 48) + 84);
        };

        addDigit(tens, 56);
        addDigit(ones, 72);
    }


};

var setRedrawBoundaries = (game) => {
    minTX = (game.player.offset.x / 48) - 20;
    maxTX = (game.player.offset.x / 48) + 20;
    minTY = (game.player.offset.y / 48) - 20;
    maxTY = (game.player.offset.y / 48) + 20;
};

var needToRedraw = (game) => {

    if (game.forceDraw) {
        return true;
    }

    if ((game.player.offset.x / 48) >= maxTX
        || (game.player.offset.x / 48) <= minTX
        || (game.player.offset.y / 48) >= maxTY
        || (game.player.offset.y / 48) <= minTY
    ) {
        return true;
    }
    return false;
};


export const drawTiles = (game, backgroundTiles) => {


    var offTileX = Math.floor(game.player.offset.x % 48);
    var offTileY = Math.floor(game.player.offset.y % 48);


    if (needToRedraw(game)) {

        setRedrawBoundaries(game);

        backgroundTiles.clear();

        var exactX = Math.floor(game.player.offset.x / 48);
        var exactY = Math.floor(game.player.offset.y / 48);

        for (var i = -40; i < 40; i++) {
            for (var j = -40; j < 40; j++) {

                var tileX = exactX + i;
                var tileY = exactY + j;


                if (tileX >= 0 && tileY >= 0 && tileX < 512 && tileY < 512) {

                    if (game.map[tileX][tileY] == MAP_SQUARE_LAVA) {
                        drawLava(game, backgroundTiles, i, j, tileX, tileY);
                    }

                    if (game.map[tileX][tileY] == MAP_SQUARE_ROCK) {
                        drawRocks(game, backgroundTiles, i, j, tileX, tileY);
                    }

                    if (game.map[tileX][tileY] >= MAP_SQUARE_BUILDING) {
                        drawBuilding(game, backgroundTiles, i, j, tileX, tileY);
                    }
                }
            }
        }

        backgroundTiles.position.set(game.player.defaultOffset.x + game.player.offset.x - offTileX, game.player.defaultOffset.y + game.player.offset.y - offTileY);
    }

    backgroundTiles.pivot.set(game.player.offset.x, game.player.offset.y);
};
