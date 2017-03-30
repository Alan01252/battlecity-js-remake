import {drawChanging} from './src/drawChanging'

import {play} from './src/play';
import * as mapBuilder from "./src/mapBuilder";
import BulletFactory from "./src/factories/BulletFactory"
import SocketListener from "./src/SocketListener"
import {RESOLUTION_X} from "./src/constants";
import {RESOLUTION_Y} from "./src/constants";
import {MAX_HEALTH} from "./src/constants";
import {setupInputs} from './src/input';
import {drawGround} from "./src/drawGround";
import {drawTiles} from "./src/drawTiles";


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
var groundTiles = null;
var backgroundTiles = null;
var playerTank = null;

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
    player: {
        health: MAX_HEALTH,
        isTurning: 0,
        timeTurn: 0,
        direction: 0,
        defaultOffset: {
            x: ((RESOLUTION_X - 200) / 2),
            y: (RESOLUTION_Y / 2)
        },
        groundOffset: {
            x: 48,
            y: 48
        },
        offset: {
            x: 1,
            y: 1,
            vx: 0,
            vy: 0
        }
    },
    stage: app.stage,
    objectContainer: objectContainer
};
game.bulletFactory = new BulletFactory(game);
game.socketListener = new SocketListener(game);

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


    var tankRectangle = new PIXI.Rectangle(0, 0, 48, 48);
    game.textures['tankTexture'].frame = tankRectangle;
    var playersTank = new PIXI.Sprite(game.textures['tankTexture']);
    playersTank.x = game.player.groundOffset.x;
    playersTank.y = game.player.groundOffset.y;
    playersTank.vx = 0;
    playersTank.vy = 0;

    setupInputs(game);

    game.socketListener.listen();
    game.socketListener.on("connected", () => {
        game.player.id = game.socketListener.enterGame();
        console.log("Connected starting game");
    });


    groundTiles = new PIXI.tilemap.CompositeRectTileLayer(0, game.textures['groundTexture'], true);
    backgroundTiles = new PIXI.tilemap.CompositeRectTileLayer(0, null, true);


    app.stage.addChild(groundTiles);
    app.stage.addChild(backgroundTiles);
    app.stage.addChild(objectContainer);

    drawGround(game, groundTiles);
    drawTiles(game, backgroundTiles);

    var tmpText = new PIXI.Texture(
        game.textures['tankTexture'].baseTexture,
        new PIXI.Rectangle(0, 0, 48, 48)
    );

    playerTank = new PIXI.Sprite(tmpText);
    playerTank.x = game.player.defaultOffset.x;
    playerTank.y = game.player.defaultOffset.y;
    playerTank.anchor.set(0.5);


    app.stage.addChild(playerTank);

    gameLoop();


}


function gameLoop() {

    stats.begin();

    game.lastTick = game.tick;
    game.tick = new Date().getTime();
    game.timePassed = (game.tick - game.lastTick);

    game.bulletFactory.cycle();
    game.socketListener.cycle();

    playerTank.rotation = game.player.direction;


    drawGround(game, groundTiles);
    drawTiles(game, backgroundTiles);
    drawChanging(game);
    play(game);

    stats.end();
    requestAnimationFrame(gameLoop);

}


