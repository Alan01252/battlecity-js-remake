import * as mapBuilder from "./src/mapBuilder";
import {play} from './src/play';
import {RESOLUTION_X} from "./src/constants";
import {RESOLUTION_Y} from "./src/constants";
import {MAX_HEALTH} from "./src/constants";

import {setupKeyboardInputs} from './src/input/input-keyboard';
import {setupMouseInputs} from './src/input/input-mouse';

import {drawGround} from "./src/draw/draw-ground";
import {drawTiles} from "./src/draw/draw-tiles";
import {drawChanging} from "./src/draw/draw-changing"

import BuildingFactory from "./src/factories/BuildingFactory";
import BulletFactory from "./src/factories/BulletFactory"
import ItemFactory from "./src/factories/ItemFactory";


import SocketListener from "./src/SocketListener"
import {setupBuildingMenu} from "./src/draw/draw-building-interface";
import {drawBuilding} from "./src/draw/draw-building-interface";
import {CAN_BUILD} from "./src/constants";
import {CANT_BUILD} from "./src/constants";
import {drawItems} from "./src/draw/draw-items";
import {ITEM_TYPE_TURRET} from "./src/constants";
import {drawPanelInterface} from "./src/draw/draw-panel-interface";


var type = "WebGL";

if (!PIXI.utils.isWebGLSupported()) {
    type = "canvas"
}


var app = new PIXI.Application(RESOLUTION_X, RESOLUTION_Y);

document.getElementById("game").appendChild(app.view);

var stats = new Stats();
stats.showPanel(0);
document.getElementById("game").appendChild(stats.dom);

var objectContainer = new PIXI.Container();
var panelContainer = new PIXI.Container();
var groundTiles = null;
var backgroundTiles = null;
var itemTiles = null;

var menuContainer = null;

const game = {
    map: [],
    tiles: [],
    tick: 0,
    lastTick: 0,
    timePassed: 0,
    staticTick: 0,
    textures: [],
    maxMapX: RESOLUTION_X - 200,
    maxMapY: RESOLUTION_Y,
    otherPlayers: {},
    showBuildMenu: false,
    buildMenuOffset: {
        x: ((RESOLUTION_X - 200) / 2),
        y: (RESOLUTION_Y / 2)
    },
    buildings: {},
    player: {
        id: -1,
        city: {
            canBuild: {
                CAN_BUILD_HOUSE: CAN_BUILD,
                CAN_BUILD_LASER_RESEARCH: CAN_BUILD,
                CAN_BUILD_TURRET_RESEARCH: CAN_BUILD,
                CAN_BUILD_LASER_FACTORY: CANT_BUILD,
                CAN_BUILD_TURRET_FACTORY: CANT_BUILD
            }
        },
        health: MAX_HEALTH,
        isTurning: 0,
        timeTurn: 0,
        direction: 0,
        defaultOffset: {
            x: ((RESOLUTION_X - 200) / 2),
            y: (RESOLUTION_Y / 2)
        },
        offset: {
            x: 1600,
            y: 1800,
            vx: 0,
            vy: 0
        }
    },
    stage: app.stage,
    objectContainer: objectContainer
};
game.bulletFactory = new BulletFactory(game);
game.buildingFactory = new BuildingFactory(game);
game.socketListener = new SocketListener(game);
game.itemFactory = new ItemFactory(game);

PIXI.loader
    .add([
        "data/imgTanks.png",
        "data/imgGround.png",
        "data/imgLava.png",
        "data/imgRocks.png",
        "data/imgbullets.png",
        "data/imgInterface.png",
        "data/imgInterfaceBottom.png",
        "data/imgHealth.png",
        "data/imgBuildings.png",
        "data/imgBuildIcons.png",
        "data/imgIcons.png",
        "data/imgitems.png",
        {url: "data/map.dat", loadType: 1, xhrType: "arraybuffer"}
    ])
    .on("progress", loadProgressHandler)
    .load(setup);


function loadProgressHandler(loader, resource) {

    console.log("loading: " + resource.url);
    console.log("progress: " + loader.progress + "%");
}


function setup() {
    console.log("loaded");


    var mapData = PIXI.loader.resources["data/map.dat"].data;
    mapBuilder.build(game, mapData);

    game.textures['groundTexture'] = PIXI.utils.TextureCache["data/imgGround.png"];
    game.textures['tankTexture'] = PIXI.utils.TextureCache["data/imgTanks.png"];
    game.textures['rockTexture'] = PIXI.utils.TextureCache["data/imgRocks.png"];
    game.textures['lavaTexture'] = PIXI.utils.TextureCache["data/imgLava.png"];
    game.textures['bulletTexture'] = PIXI.utils.TextureCache["data/imgbullets.png"];
    game.textures['interfaceTop'] = PIXI.utils.TextureCache["data/imgInterface.png"];
    game.textures['interfaceBottom'] = PIXI.utils.TextureCache["data/imgInterfaceBottom.png"];
    game.textures['health'] = PIXI.utils.TextureCache["data/imgHealth.png"];
    game.textures['buildings'] = PIXI.utils.TextureCache["data/imgBuildings.png"];
    game.textures['buildingIcons'] = PIXI.utils.TextureCache["data/imgBuildIcons.png"];
    game.textures['imageIcons'] = PIXI.utils.TextureCache["data/imgIcons.png"];
    game.textures['imageItems'] = PIXI.utils.TextureCache["data/imgitems.png"];


    setupKeyboardInputs(game);
    setupMouseInputs(game);

    game.socketListener.listen();
    game.socketListener.on("connected", () => {
        game.player.id = game.socketListener.enterGame();
        console.log("Connected starting game");
    });


    groundTiles = new PIXI.tilemap.CompositeRectTileLayer(0, game.textures['groundTexture'], true);
    backgroundTiles = new PIXI.tilemap.CompositeRectTileLayer(0, null, true);
    itemTiles = new PIXI.tilemap.CompositeRectTileLayer(0, game.textures['imageItems'], true);


    app.stage.addChild(groundTiles);
    app.stage.addChild(backgroundTiles);
    app.stage.addChild(itemTiles);
    app.stage.addChild(objectContainer);
    app.stage.addChild(panelContainer);


    game.itemFactory.newItem(null, 1600, 1800, ITEM_TYPE_TURRET);

    setupBuildingMenu(game);

    game.forceDraw = true;
    drawGround(game, groundTiles);
    drawTiles(game, backgroundTiles);
    drawItems(game, itemTiles);
    drawPanelInterface(game, panelContainer);


    game.forceDraw = false;


    gameLoop();
}


function gameLoop() {

    stats.begin();


    game.lastTick = game.tick;
    game.tick = new Date().getTime();
    game.timePassed = (game.tick - game.lastTick);

    game.bulletFactory.cycle();
    game.socketListener.cycle();

    setupBuildingMenu(game);
    drawGround(game, groundTiles);
    drawTiles(game, backgroundTiles);
    drawItems(game, itemTiles);
    drawChanging(game);
    drawBuilding(game);
    drawPanelInterface(game, panelContainer);
    play(game);


    game.forceDraw = false;


    stats.end();
    requestAnimationFrame(gameLoop);

}


