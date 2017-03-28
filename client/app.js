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


var type = "WebGL";

if (!utils.isWebGLSupported()) {
    type = "canvas"
}

PIXI.glCore.VertexArrayObject.FORCE_NATIVE = true;
PIXI.settings.SPRITE_MAX_TEXTURES = 1;

var app = new PIXI.Application(800,800,{ transparent: true, antialias: true, legacy:true });
document.body.appendChild(app.view);

const game = {
    map: [],
    tiles: [],
    tick: 0,
    lastTick: 0,
    timePassed: 0,
    textures: [],
    maxMapX: 800,
    maxMapY: 800,
    player: {
        isTurning: 0,
        timeTurn: 0,
        direction: 0,
        defaultOffset: {
            x: (800 / 2) - 24,
            y: (800 / 2) - 24
        },
        groundOffset: {
            x: 48,
            y: 48
        },
        offset: {
            x: 340,
            y: 0,
            vx: 0,
            vy: 0
        }
    },
    stage: app.stage
};
game.bulletFactory = new BulletFactory(game);

PIXI.loader
    .add([
        "data/imgTanks.bmp",
        "data/imgGround.bmp",
        "data/imgLava.bmp",
        "data/imgRocks.bmp",
        "data/imgbullets.bmp",
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

    var tankRectangle = new Rectangle(0, 0, 48, 48);
    game.textures['tankTexture'].frame = tankRectangle;
    var playersTank = new Sprite(game.textures['tankTexture']);
    playersTank.x = game.player.groundOffset.x;
    playersTank.y = game.player.groundOffset.y;
    playersTank.vx = 0;
    playersTank.vy = 0;


    gameLoop();
}


function gameLoop() {


    game.lastTick = game.tick;
    game.tick = new Date().getTime();
    game.timePassed = (game.tick - game.lastTick);

    game.bulletFactory.cycle();



    var fDir = -game.player.direction;


    /*
    var x = (Math.sin((fDir / 16) * 3.14) * -1);
    var y = (Math.cos((fDir / 16) * 3.14) * -1);

    var x2 = ((game.player.offset.x) - 20 ) + (x * 20);
    var y2 = ((game.player.offset.y) - 20 ) + (y * 20);

    game.bulletFactory.newBullet(x2, y2, 0, game.player.direction);
     */

    draw(game);
    play(game);


    requestAnimationFrame(gameLoop);

}


