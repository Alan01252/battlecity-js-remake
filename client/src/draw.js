import {Graphics} from '../node_modules/pixi.js/dist/pixi.min';
import {Sprite} from '../node_modules/pixi.js/dist/pixi.min';
import {Rectangle} from '../node_modules/pixi.js/dist/pixi.min';

import {MAP_SQUARE_LAVA, MAP_SQUARE_ROCK} from './constants'

var spriteCache = [];

var drawGround = (game, stage, groundOffsetX, groundOffsetY) => {
    for (var i = -6; i < 6; i++) {
        for (var j = -6; j < 6; j++) {
            var imgGround = new Sprite(game.textures['groundTexture']);
            imgGround.x = (128 * i) + groundOffsetX;
            imgGround.y = (128 * j) + groundOffsetY;
            stage.addChild(imgGround);
        }
    }
};


var cachedTextures = [];

export const draw = (game) => {

    var stage = game.stage;



    for (var i = stage.children.length - 1; i >= 0; i--) {
        stage.children[i].destroy();
        stage.removeChild(stage.children[i]);
    }

    var offsetX = game.player.offset.x % 48; // Number of tank tiles on x axis
    var offsetY = game.player.offset.y % 48; // Number of tank tiles on y axis

    var groundOffsetX = game.player.offset.x % 128; // Number of tank tiles on x axis
    var groundOffsetY = game.player.offset.y % 128; // Number of tank tiles on y axis

    var exactX = game.player.offset.x / 48;
    var exactY = game.player.offset.y / 48;


    drawGround(game, stage, groundOffsetX, groundOffsetY);


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

    var tmpText = game.textures['tankTexture'].clone();
    var tankRect = new Rectangle(Math.floor((game.player.direction / 2)) * 48, 0, 48, 48);
    tmpText.frame = tankRect;
    var playerTank = new Sprite(tmpText);
    playerTank.x = game.player.defaultOffset.x;
    playerTank.y = game.player.defaultOffset.y;
    stage.addChild(playerTank);

};
