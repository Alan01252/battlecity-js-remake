import {
    utils,
    Rectangle,
    Container,
    TextureCache,
    Sprite,
    resources,
    loader
} from './node_modules/pixi.js/dist/pixi.min';

import {draw} from './src/draw'
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

PIXI.glCore.VertexArrayObject.FORCE_NATIVE = true;
PIXI.settings.SPRITE_MAX_TEXTURES = 1;

var app = new PIXI.Application(RESOLUTION_X, RESOLUTION_Y, {transparent: true, antialias: true, legacy: true});
document.body.appendChild(app.view);

const game = {
    map: [],
    tiles: [],
    tick: 0,
    lastTick: 0,
    timePassed: 0,
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
            x: ((RESOLUTION_X - 200) / 2) - 24,
            y: (RESOLUTION_Y / 2) - 24
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
    stage: app.stage
};
game.bulletFactory = new BulletFactory(game);
game.socketListener = new SocketListener(game);

PIXI.loader
    .add([
        "data/imgTanks.bmp",
        "data/imgGround.bmp",
        "data/imgLava.bmp",
        "data/imgRocks.bmp",
        "data/imgbullets.bmp",
        "data/imgInterface.bmp",
        "data/imgInterfaceBottom.bmp",
        "data/imgHealth.bmp",
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

    game.textures['groundTexture'] = TextureCache["data/imgGround.bmp"];
    game.textures['tankTexture'] = TextureCache["data/imgTanks.bmp"];
    game.textures['rockTexture'] = TextureCache["data/imgRocks.bmp"];
    game.textures['lavaTexture'] = TextureCache["data/imgLava.bmp"];
    game.textures['bulletTexture'] = TextureCache["data/imgbullets.bmp"];
    game.textures['interfaceTop'] = TextureCache["data/imgInterface.bmp"];
    game.textures['interfaceBottom'] = TextureCache["data/imgInterfaceBottom.bmp"];
    game.textures['health'] = TextureCache["data/imgHealth.bmp"];

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
        game.socketListener.enterGame();
        console.log("Connected starting game");
        gameLoop();
    });


}


function gameLoop() {


    game.lastTick = game.tick;
    game.tick = new Date().getTime();
    game.timePassed = (game.tick - game.lastTick);

    game.bulletFactory.cycle();
    game.socketListener.cycle();

    draw(game);
    play(game);

    requestAnimationFrame(gameLoop);

}


