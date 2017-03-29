import {
    utils,
    Rectangle,
    Container,
    TextureCache,
    Sprite,
    resources,
    loader
} from './node_modules/pixi.js/dist/pixi.min';

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

if (!utils.isWebGLSupported()) {
    type = "canvas"
}


var app = new PIXI.Application(RESOLUTION_X, RESOLUTION_Y);
document.body.appendChild(app.view);

var stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

var backgroundContainer = new PIXI.Container();
var tileContainer = new PIXI.Container();
var lavaContainer = new PIXI.particles.ParticleContainer();
var rockContainer = new PIXI.particles.ParticleContainer();
var objectContainer = new PIXI.Container();


app.stage.addChild(backgroundContainer);
app.stage.addChild(tileContainer);
app.stage.addChild(lavaContainer);
app.stage.addChild(rockContainer);
app.stage.addChild(objectContainer);


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


    var mapData = PIXI.loader.resources["data/map.dat"].data;
    mapBuilder.build(game, mapData);

    game.textures['groundTexture'] = TextureCache["data/imgGround.png"];
    game.textures['tankTexture'] = TextureCache["data/imgTanks.png"];
    game.textures['rockTexture'] = TextureCache["data/imgRocks.png"];
    game.textures['lavaTexture'] = TextureCache["data/imgLava.png"];
    game.textures['bulletTexture'] = TextureCache["data/imgbullets.png"];
    game.textures['interfaceTop'] = TextureCache["data/imgInterface.png"];
    game.textures['interfaceBottom'] = TextureCache["data/imgInterfaceBottom.png"];
    game.textures['health'] = TextureCache["data/imgHealth.png"];

    var tankRectangle = new Rectangle(0, 0, 48, 48);
    game.textures['tankTexture'].frame = tankRectangle;
    var playersTank = new Sprite(game.textures['tankTexture']);
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


function gameLoop() {

    stats.begin();

    game.lastTick = game.tick;
    game.tick = new Date().getTime();
    game.timePassed = (game.tick - game.lastTick);

    game.bulletFactory.cycle();
    game.socketListener.cycle();

    drawChanging(game);
    play(game);

    stats.end();
    requestAnimationFrame(gameLoop);

}

