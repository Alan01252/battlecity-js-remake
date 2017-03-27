import {Graphics} from '../node_modules/pixi.js/dist/pixi.min';
import {Sprite} from '../node_modules/pixi.js/dist/pixi.min';
import {Rectangle} from '../node_modules/pixi.js/dist/pixi.min';

import {MAP_SQUARE_LAVA, MAP_SQUARE_ROCK} from './constants'

export const draw = (game) => {

    var stage = game.stage;

    for (var i = stage.children.length - 1; i >= 0; i--) {
        stage.removeChild(stage.children[i]);
    }


    for (var i = 0; i < 6; i++) {
        for (var j = 0; j < 6; j++) {
            var imgGround = new Sprite(game.textures['groundTexture']);
            imgGround.x = 128 * i;
            imgGround.y = 128 * j;
            stage.addChild(imgGround);
        }
    }

    for (var i = -16; i < 16; i++) {
        for (var j = -16; j < 16; j++) {
            var tileX = Math.floor(game.player.offset.x + i);
            var tileY = Math.floor(game.player.offset.y + j);


            if (tileX > 0 && tileY > 0 && tileX <= 512 && tileY <= 512) {


                if (game.map[tileX][tileY] == MAP_SQUARE_LAVA) {


                    var tmpText = game.textures['lavaTexture'].clone();
                    var lavaRectangle = new Rectangle(game.tiles[tileX][tileY], 0, 48, 48);
                    tmpText.frame = lavaRectangle;
                    var lava = new Sprite(tmpText);
                    lava.x = 48 * i;
                    lava.y = 48 * j;
                    stage.addChild(lava);
                }
                // Else if the map square is Rock, draw Rock
                else if (game.map[tileX][tileY] == MAP_SQUARE_ROCK) {

                    var tmpText = game.textures['rockTexture'].clone();
                    var rockRectangle = new Rectangle(game.tiles[tileX][tileY], 0, 48, 48);
                    tmpText.frame = rockRectangle;
                    var rock = new Sprite(tmpText);
                    rock.x = 48 * i;
                    rock.y = 48 * j;
                    stage.addChild(rock);

                }
            }
            else {
                var rectangle = new Graphics();
                rectangle.beginFill(0x000);
                rectangle.drawRect(0, 0, 48, 48);
                rectangle.endFill();
                rectangle.x = 48 * i;
                rectangle.y = 48 * j;
                stage.addChild(rectangle);
            }
        }
    }

    var tmpText = game.textures['tankTexture'].clone();
    var tankRect = new Rectangle(Math.floor((game.player.direction / 2)) * 48, 0, 48, 48);
    tmpText.frame = tankRect;
    var playerTank = new Sprite(tmpText);
    playerTank.x = 400;
    playerTank.y = 400;
    stage.addChild(playerTank);

};
