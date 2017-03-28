import {Graphics} from '../node_modules/pixi.js/dist/pixi.min';
import {Sprite} from '../node_modules/pixi.js/dist/pixi.min';
import {Rectangle} from '../node_modules/pixi.js/dist/pixi.min';

import {MAP_SQUARE_LAVA, MAP_SQUARE_ROCK} from './constants'
import {MAX_HEALTH} from "./constants";


var playerTank = null;

var drawGround = (game, stage) => {


    var groundOffsetX = game.player.offset.x % 128; // Number of tank tiles on x axis
    var groundOffsetY = game.player.offset.y % 128; // Number of tank tiles on y axis

    for (var i = 0; i < 12; i++) {
        for (var j = 0; j < 12; j++) {

            var imgGround = new Sprite(game.textures['groundTexture']);
            imgGround.x = (128 * i - groundOffsetX);
            imgGround.y = (128 * j - groundOffsetY);
            stage.addChild(imgGround);
        }
    }
};

var drawTiles = (game) => {


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

                    var tmpText = game.textures['lavaTexture'].clone();
                    var lavaRectangle = new Rectangle(game.tiles[tileX][tileY], 0, 48, 48);
                    tmpText.frame = lavaRectangle;
                    var tile = new Sprite(tmpText);
                    tile.x = (48 * i) + game.player.defaultOffset.x - offTileX;
                    tile.y = (48 * j) + game.player.defaultOffset.y - offTileY;
                    game.lavaContainer.addChild(tile);
                }
                // Else if the map square is Rock, draw Rock
                else if (game.map[tileX][tileY] == MAP_SQUARE_ROCK) {

                    var tmpText = game.textures['rockTexture'].clone();
                    var lavaRectangle = new Rectangle(game.tiles[tileX][tileY], 0, 48, 48);
                    tmpText.frame = lavaRectangle;
                    var tile = new Sprite(tmpText);
                    tile.x = (48 * i) + game.player.defaultOffset.x - offTileX;
                    tile.y = (48 * j) + game.player.defaultOffset.y - offTileY;
                    game.rockContainer.addChild(tile);
                }

            }
            else {
                var rectangle = new Graphics();
                rectangle.beginFill(0x000);
                rectangle.drawRect(0, 0, 48, 48);
                rectangle.endFill();
                rectangle.x = (48 * i) + game.player.defaultOffset.x - offTileX;
                rectangle.y = (48 * j) + game.player.defaultOffset.y - offTileY;
                game.tileContainer.addChild(rectangle);
            }
        }
    }
};



var drawOtherPlayers = (game, stage) => {


    Object.keys(game.otherPlayers).forEach((id) => {

        var player = game.otherPlayers[id];

        var tmpText = game.textures['tankTexture'].clone();
        var tankRect = new Rectangle(Math.floor((player.direction / 2)) * 48, 48 * 2, 48, 48);
        tmpText.frame = tankRect;
        var playerTank = new Sprite(tmpText);


        playerTank.x = ((player.offset.x) + (game.player.defaultOffset.x - (game.player.offset.x / 48) * 48));
        playerTank.y = ((player.offset.y) + (game.player.defaultOffset.y - (game.player.offset.y / 48) * 48));


        stage.addChild(playerTank);
    });
};

var drawBullets = (game, stage) => {
    var bullet = game.bulletFactory.getHead();


    while (bullet) {

        var tmpText = game.textures['bulletTexture'].clone();
        var bulletRect = new Rectangle(bullet.animation * 8, 0, 8, 8);
        tmpText.frame = bulletRect;

        var sprite = new Sprite(tmpText);
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

var drawPlayer = (game, stage) => {

    var tmpText = game.textures['tankTexture'].clone();
    var tankRect = new Rectangle(Math.floor((game.player.direction / 2)) * 48, 0, 48, 48);
    tmpText.frame = tankRect;
    playerTank = new Sprite(tmpText);
    playerTank.x = game.player.defaultOffset.x;
    playerTank.y = game.player.defaultOffset.y;

    stage.addChild(playerTank);
};




export const drawChanging = (game) => {


    game.tileContainer.removeChildren();
    game.lavaContainer.removeChildren();
    game.backgroundContainer.removeChildren();
    game.rockContainer.removeChildren();
    game.objectContainer.removeChild(playerTank);

    drawPlayer(game, game.objectContainer);
    drawGround(game, game.backgroundContainer);
    drawTiles(game, game.tileContainer);

    drawOtherPlayers(game, game.tileContainer);
    drawBullets(game, game.tileContainer);



};
