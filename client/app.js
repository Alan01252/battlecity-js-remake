import {drawChanging} from './src/drawChanging'

import {play} from './src/play';
import * as mapBuilder from "./src/mapBuilder";
import BulletFactory from "./src/factories/BulletFactory"
import SocketListener from "./src/SocketListener"
import {RESOLUTION_X} from "./src/constants";
import {RESOLUTION_Y} from "./src/constants";
import {MAX_HEALTH} from "./src/constants";
import {setupInputs} from './src/input';


var type = "WebGL";

if (!PIXI.utils.isWebGLSupported()) {
    type = "canvas"
}


var app = new PIXI.Application(RESOLUTION_X, RESOLUTION_Y);
var renderer = PIXI.autoDetectRenderer(800, 600);

document.getElementById("game").appendChild(app.view);

var stats = new Stats();
stats.showPanel(0);
document.getElementById("game").appendChild(stats.dom);

var backgroundContainer = new PIXI.Container();
var tileContainer = new PIXI.Container();
var lavaContainer = new PIXI.particles.ParticleContainer();
var rockContainer = new PIXI.particles.ParticleContainer();
var objectContainer = new PIXI.Container();
var groundTiles = null;

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
            x: 0,
            y: 0,
            vx: 0,
            vy: 0
        }
    },
    stage: app.stage,
    backgroundContainer: backgroundContainer,
    tileContainer: tileContainer,
    rockContainer: rockContainer,
    lavaContainer: lavaContainer,
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
    console.log("everything loaded");


    groundTiles = new PIXI.tilemap.CompositeRectTileLayer(0, game.textures['groundTexture'], true);
    for (var i = -10; i < 10; i++) {
        for (var j = 0; j < 10; j++) {
            groundTiles.addFrame("data/imgGround.png", i * 128, j * 128);
        }
    }
    groundTiles.position.set(game.player.defaultOffset.x, game.player.defaultOffset.y);

    app.stage.addChild(groundTiles);
    app.stage.addChild(backgroundContainer);
    app.stage.addChild(tileContainer);
    app.stage.addChild(lavaContainer);
    app.stage.addChild(rockContainer);
    app.stage.addChild(objectContainer);

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

    gameLoop();


}

var max = 0;
var minX = 0;
var maxX = 0;
var minY = 0;
var maxY = 0;


function buildGroundTiles(groundTiles) {

    if (parseInt(game.player.offset.x / 128) > maxX
        || parseInt(game.player.offset.x / 128) < minX
        || parseInt(game.player.offset.y / 128) > maxY
        || parseInt(game.player.offset.y / 128) < minY
    )
    {
        minX = (game.player.offset.x/128) -5;
        maxX = (game.player.offset.x/128) + 5;
        minY = (game.player.offset.y/128) - 5;
        maxY = (game.player.offset.y/128) + 5;
        groundTiles.clear();
        groundTiles.position.set(game.player.defaultOffset.x + game.player.offset.x, game.player.defaultOffset.y + game.player.offset.y);
        for (var i = -12; i < 12; i++) {
            for (var j = -12; j < 12; j++) {
                groundTiles.addFrame(game.textures["groundTexture"], i * 128, j * 128);
            }
        }
    }
    groundTiles.pivot.set(game.player.offset.x, game.player.offset.y)
}

function gameLoop() {

    stats.begin();

    game.lastTick = game.tick;
    game.tick = new Date().getTime();
    game.timePassed = (game.tick - game.lastTick);

    game.bulletFactory.cycle();
    game.socketListener.cycle();


    buildGroundTiles(groundTiles)
    drawChanging(game);
    play(game);

    stats.end();
    requestAnimationFrame(gameLoop);

}


