import {MAP_SQUARE_LAVA} from "./constants";
import {MAP_SQUARE_ROCK} from "./constants";
var minTX = 0;
var maxTX = 0;
var minTY = 0;
var maxTY = 0;

export const drawTiles = (game, backgroundTiles) => {


    var offTileX = Math.floor(game.player.offset.x % 48);
    var offTileY = Math.floor(game.player.offset.y % 48);


    backgroundTiles.pivot.set(game.player.offset.x, game.player.offset.y);

    if ((game.player.offset.x / 48) >= maxTX
        || (game.player.offset.x / 48) <= minTX
        || (game.player.offset.y / 48) >= maxTY
        || (game.player.offset.y / 48) <= minTY
    ) {


        minTX = (game.player.offset.x / 48) - 20;
        maxTX = (game.player.offset.x / 48) + 20;
        minTY = (game.player.offset.y / 48) - 20;
        maxTY = (game.player.offset.y / 48) + 20;
        backgroundTiles.clear();

        var exactX = Math.floor(game.player.offset.x / 48);
        var exactY = Math.floor(game.player.offset.y / 48);

        for (var i = -40; i < 40; i++) {
            for (var j = -40; j < 40; j++) {

                var tileX = exactX + i;
                var tileY = exactY + j;


                if (tileX >= 0 && tileY >= 0 && tileX < 512 && tileY < 512) {

                    if (game.map[tileX][tileY] == MAP_SQUARE_LAVA) {
                        var tmpText = new PIXI.Texture(
                            game.textures['lavaTexture'].baseTexture,
                            new PIXI.Rectangle(game.tiles[tileX][tileY], 0, 48, 48)
                        );
                        backgroundTiles.addFrame(tmpText, i * 48, j * 48);
                    }
                    // Else if the map square is Rock, draw Rock
                    else if (game.map[tileX][tileY] == MAP_SQUARE_ROCK) {
                        var tmpText = new PIXI.Texture(
                            game.textures['rockTexture'].baseTexture,
                            new PIXI.Rectangle(game.tiles[tileX][tileY], 0, 48, 48)
                        );
                        backgroundTiles.addFrame(tmpText, i * 48, j * 48);
                    }
                }
            }
        }
        backgroundTiles.position.set(game.player.defaultOffset.x + game.player.offset.x - offTileX, game.player.defaultOffset.y + game.player.offset.y - offTileY);
    }
};
