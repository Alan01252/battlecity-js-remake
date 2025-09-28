import {MAP_SQUARE_LAVA} from "./constants";
import {MAP_SQUARE_ROCK} from "./constants";
import {MAP_SQUARE_BUILDING} from "./constants";
import {BUILDING_COMMAND_CENTER} from "./constants";

function createMap(game) {
    for (var i = 0; i < 512; i++) {
        game.map[i] = [];
        for (var j = 0; j < 512; j++) {
            game.map[i][j] = 0
        }
    }
}

function createTiles(game) {
    for (var i = 0; i < 512; i++) {
        game.tiles[i] = [];
        for (var j = 0; j < 512; j++) {
            game.tiles[i][j] = 0
        }
    }
}

/**
 *
 * Calculates the correct tile to return based on adjacent tiles
 *
 * Examples If calculating middle tiles picture
 * 010
 * 111   = 0
 * 010
 *
 * 000
 * 010  = 720
 * 000
 *
 * 000
 * 011  = 670 etc etc
 * 000
 *
 * @type {number}
 */
function populateTiles(game, mapData) {


    var view = new Uint8Array(mapData);

    for (var i = 0; i <= 511; i++) {
        for (var j = 0; j <= 511; j++) {
            game.map[i][j] = view[i + j * 512];

        }
    }

    // i == y axis
    for (var j = 0; j < game.map.length; j++) {
        // j === x axis
        for (var i = 0; i < game.map.length; i++) {

            if ((game.map[i][j] == MAP_SQUARE_BUILDING)) {
                game.buildingFactory.newBuilding(null, i, j, BUILDING_COMMAND_CENTER, {
                    notifyServer: false,
                    city: 0,
                    updateCity: false,
                    itemsLeft: 0,
                });
            }
            else if ((game.map[i][j] == MAP_SQUARE_LAVA) || (game.map[i][j] == MAP_SQUARE_ROCK)) {

                var currentTile = game.map[i][j];
                if (currentTile == MAP_SQUARE_LAVA || currentTile == MAP_SQUARE_ROCK) {

                    var isLeft = (i == 0 || game.map[i - 1][j] != currentTile) | 0;
                    var isRight = ((i == 511 || game.map[i + 1][j] != currentTile)) | 0;
                    var isUp = (i == 0 || game.map[i][j - 1] != currentTile) | 0;
                    var isDown = (j == 511 || game.map[i][j + 1] != currentTile) | 0;
                    game.tiles[i][j] = (isLeft + isRight * 2 + isDown * 4 + isUp * 8) * 48;
                }
            }
        }
    }

}

export const build = (game, mapData) => {
    createMap(game);
    createTiles(game);
    populateTiles(game, mapData);

};
