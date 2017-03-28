import {Graphics} from '../node_modules/pixi.js/dist/pixi.min';
import {Sprite} from '../node_modules/pixi.js/dist/pixi.min';
import {Rectangle} from '../node_modules/pixi.js/dist/pixi.min';

import {MAP_SQUARE_LAVA, MAP_SQUARE_ROCK} from './constants'
import {MAX_HEALTH} from "./constants";


var cachedTextures = [];

var drawGround = (game, stage) => {


    var groundOffsetX = game.player.offset.x % 128; // Number of tank tiles on x axis
    var groundOffsetY = game.player.offset.y % 128; // Number of tank tiles on y axis

    for (var i = 0; i < 12; i++) {
        for (var j = 0 ; j < 12; j++) {

            var imgGround = new Sprite(game.textures['groundTexture']);
            imgGround.x = (128 * i - groundOffsetX);
            imgGround.y = (128 * j - groundOffsetY);
            stage.addChild(imgGround);
        }
    }
};

var drawTiles = (game, stage) => {


    var exactX = Math.floor(game.player.offset.x / 48);
    var exactY = Math.floor(game.player.offset.y / 48);
    var offTileX = Math.floor(game.player.offset.x % 48);
    var offTileY = Math.floor(game.player.offset.y % 48);





    for (var i = -16; i < 16; i++) {
        for (var j = -16; j < 16; j++) {

            var tileX = exactX + i;
            var tileY = exactY + j;


            if (tileX >= 0 && tileY >= 0 && tileX < 512 && tileY < 512) {

                if (game.map[tileX][tileY] == MAP_SQUARE_LAVA) {

                    if (!cachedTextures['lava' + tileX + "_" + tileY]) {
                        var tmpText = game.textures['lavaTexture'].clone();
                        var lavaRectangle = new Rectangle(game.tiles[tileX][tileY], 0, 48, 48);
                        tmpText.frame = lavaRectangle;
                        cachedTextures['lava' + tileX + "_" + tileY] = tmpText;
                    }

                    var tile = new Sprite(cachedTextures['lava' + tileX + "_" + tileY]);
                    tile.x = (48 * i) + game.player.defaultOffset.x - offTileX;
                    tile.y = (48 * j) + game.player.defaultOffset.y - offTileY;
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
                    tile.x = (48 * i) + game.player.defaultOffset.x - offTileX;
                    tile.y = (48 * j) + game.player.defaultOffset.y - offTileY;
                    stage.addChild(tile);
                }

            }
            else {
                var rectangle = new Graphics();
                rectangle.beginFill(0x000);
                rectangle.drawRect(0, 0, 48, 48);
                rectangle.endFill();
                rectangle.x = (48 * i) + game.player.defaultOffset.x - offTileX;
                rectangle.y = (48 * j) + game.player.defaultOffset.y - offTileY;
                stage.addChild(rectangle);
            }
        }
    }
};

var drawPlayer = (game, stage) => {

    var tmpText = game.textures['tankTexture'].clone();
    var tankRect = new Rectangle(Math.floor((game.player.direction / 2)) * 48, 0, 48, 48);
    tmpText.frame = tankRect;
    var playerTank = new Sprite(tmpText);
    playerTank.x = game.player.defaultOffset.x;
    playerTank.y = game.player.defaultOffset.y;

    stage.addChild(playerTank);
};

var drawOtherPlayers = (game, stage) => {



    Object.keys(game.otherPlayers).forEach((id) => {

        var player = game.otherPlayers[id];

        var tmpText = game.textures['tankTexture'].clone();
        var tankRect = new Rectangle(Math.floor((player.direction / 2)) * 48, 48 * 2, 48, 48);
        tmpText.frame = tankRect;
        var playerTank = new Sprite(tmpText);


        playerTank.x = ((player.offset.x) + (game.player.defaultOffset.x -(game.player.offset.x/48) * 48));
        playerTank.y = ((player.offset.y) + (game.player.defaultOffset.y -(game.player.offset.y/48) * 48));



        stage.addChild(playerTank);
    });
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
        sprite.x = ((bullet.x + 48) + (game.player.defaultOffset.x - (game.player.offset.x)));
        sprite.y = ((bullet.y + 48) + (game.player.defaultOffset.y - game.player.offset.y));
        sprite.anchor = {x: 1, y: 1};


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
    health.anchor = {x: 1, y: 1};
    health.x = game.maxMapX + (137 + 38);
    health.y = 160 + 87;


    stage.addChild(health);
};

export const draw = (game) => {

    var stage = game.stage;
    stage.removeChildren();

    drawGround(game, stage);
    drawTiles(game, stage);
    drawPlayer(game, stage);
    drawOtherPlayers(game, stage);
    drawBullets(game, stage);
    drawPanel(game, stage);
    drawHealth(game, stage)

};
