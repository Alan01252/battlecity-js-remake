import {Graphics} from '../node_modules/pixi.js/dist/pixi.min';
import {Sprite} from '../node_modules/pixi.js/dist/pixi.min';
import {Rectangle} from '../node_modules/pixi.js/dist/pixi.min';

import {MAP_SQUARE_LAVA, MAP_SQUARE_ROCK} from './constants'
import {MAX_HEALTH} from "./constants";


var cachedTextures = [];

var drawGround = (game, stage, groundOffsetX, groundOffsetY) => {
    for (var i = -12; i < 12; i++) {
        for (var j = -12; j < 12; j++) {
            var imgGround = new Sprite(game.textures['groundTexture']);
            imgGround.x = (128 * i);
            imgGround.y = (128 * j);
            stage.addChild(imgGround);
        }
    }
};

var drawTiles = (game, stage, exactX, exactY) => {

    for (var i = -16; i < 16; i++) {
        for (var j = -16; j < 16; j++) {

            var tileX = Math.floor(exactX + i);
            var tileY = Math.floor(exactY + j);


            if (tileX >= 0 && tileY >= 0 && tileX <= 512 && tileY <= 512) {

                if (game.map[tileX][tileY] == MAP_SQUARE_LAVA) {

                    if (!cachedTextures['lava' + tileX + "_" + tileY]) {
                        var tmpText = game.textures['lavaTexture'].clone();
                        var lavaRectangle = new Rectangle(game.tiles[tileX][tileY], 0, 48, 48);
                        tmpText.frame = lavaRectangle;
                        cachedTextures['lava' + tileX + "_" + tileY] = tmpText;
                    }

                    var tile = new Sprite(cachedTextures['lava' + tileX + "_" + tileY]);
                    tile.x = (48 * i) + 376;
                    tile.y = (48 * j) + 376;
                    stage.addChild(tile);
                }
                // Else if the map square is Rock, draw Rock
                else if (game.map[tileX][tileY] == MAP_SQUARE_ROCK) {

                    if (!cachedTextures['rock' + tileX + "_" + tileY]) {
                        var tmpText = game.textures['rockTexture'].clone();
                        var lavaRectangle = new Rectangle(game.tiles[tileX][tileY], 0, 48, 48);
                        tmpText.frame = lavaRectangle;
                        cachedTextures['rock' + tileX + "_" + tileY] = tmpText;
                    }

                    var tile = new Sprite(cachedTextures['rock' + tileX + "_" + tileY]);
                    tile.x = (48 * i) + 376;
                    tile.y = (48 * j) + 376;
                    stage.addChild(tile);
                }

            }
            else {
                var rectangle = new Graphics();
                rectangle.beginFill(0x000);
                rectangle.drawRect(0, 0, 48, 48);
                rectangle.endFill();
                rectangle.x = (48 * i) + 376;
                rectangle.y = (48 * j) + 376;
                stage.addChild(rectangle);
            }
        }
    }
};

var drawTank = (game, stage) => {

    var tmpText = game.textures['tankTexture'].clone();
    var tankRect = new Rectangle(Math.floor((game.player.direction / 2)) * 48, 0, 48, 48);
    tmpText.frame = tankRect;
    var playerTank = new Sprite(tmpText);
    playerTank.x = game.player.defaultOffset.x;
    playerTank.y = game.player.defaultOffset.y;

    stage.addChild(playerTank);
};

var drawBullets = (game, stage) => {
    var bullet = game.bulletFactory.getHead();


    while (bullet) {


        if (!cachedTextures['bullet']) {
            var tmpText = game.textures['bulletTexture'].clone();
            var bulletRect = new Rectangle(bullet.animation * 8, 0, 8, 8);
            tmpText.frame = bulletRect;
            cachedTextures['bullet'] = tmpText;
        }

        var sprite = new Sprite(cachedTextures['bullet']);
        sprite.x = ((bullet.x + 52) + (376 - game.player.offset.x));
        sprite.y = ((bullet.y + 24) + (376 - game.player.offset.y));

        console.log(sprite.x);
        console.log("draw b " + bullet.x + " " + game.player.offset.x);

        bullet.animation++;
        if (bullet.animation > 3) {
            bullet.animation = 0;
        }

        stage.addChild(sprite);

        bullet = bullet.next;
    }
};

var drawPanel = (game, stage) => {

    var interfaceTop = new Sprite(game.textures["interfaceTop"]);
    interfaceTop.x = game.maxMapX;
    interfaceTop.y = 0;
    stage.addChild(interfaceTop);

    var interfaceBottom = new Sprite(game.textures["interfaceBottom"]);
    interfaceBottom.x = game.maxMapX;
    interfaceBottom.y = 430;
    stage.addChild(interfaceBottom);
};

var drawHealth = (game, stage) => {

    var percent = game.player.health / MAX_HEALTH;


    var tmpText = game.textures['health'].clone();
    var healthPercent = new Rectangle(0, 0, 38, percent * 87);
    tmpText.frame = healthPercent;

    var health = new Sprite(tmpText);
    health.anchor = {x:1, y:1};
    health.x = game.maxMapX + (137 + 38);
    health.y = 160 + 87;


    stage.addChild(health);
};

export const draw = (game) => {

    var stage = game.stage;


    for (var i = stage.children.length - 1; i >= 0; i--) {
        stage.children[i].destroy();
        stage.removeChild(stage.children[i]);
    }


    var groundOffsetX = game.player.offset.x % 128; // Number of tank tiles on x axis
    var groundOffsetY = game.player.offset.y % 128; // Number of tank tiles on y axis

    var exactX = game.player.offset.x / 48;
    var exactY = game.player.offset.y / 48;


    drawGround(game, stage, groundOffsetX, groundOffsetY);
    drawTiles(game, stage, exactX, exactY);
    drawTank(game, stage);
    drawBullets(game, stage);
    drawPanel(game, stage);
    drawHealth(game, stage)
};
