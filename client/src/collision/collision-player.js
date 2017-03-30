import {COLLISION_MAP_EDGE_LEFT} from "../constants";
import {COLLISION_MAP_EDGE_RIGHT} from "../constants";
import {COLLISION_MAP_EDGE_TOP} from "../constants";
import {COLLISION_MAP_EDGE_BOTTOM} from "../constants";
import {COLLISION_BLOCKING} from "../constants";

import {getPlayerRect} from "./collision-helpers";
import {rectangleCollision} from "./collision-helpers";


var checkEdges = (player) => {
    if (player.offset.x < 0) return COLLISION_MAP_EDGE_LEFT;
    if (player.offset.x > (510 * 48)) return COLLISION_MAP_EDGE_RIGHT;
    if (player.offset.y < 0) return COLLISION_MAP_EDGE_TOP;
    if (player.offset.y > (510 * 48)) return COLLISION_MAP_EDGE_BOTTOM;

    return 0;
};

var checkTiles = (game, playerRect) => {

    var map = game["map"];

    var left = Math.floor((playerRect.x) / 48);
    var right = Math.floor((playerRect.x + playerRect.w) / 48);
    var top = Math.floor((playerRect.y) / 48);
    var bottom = Math.floor((playerRect.y + playerRect.h) / 48);


    if (left && right && top && bottom) {
        //Map Terrain (lava, rocks, top left of CC)
        if (map[left][top] != 0) return COLLISION_BLOCKING;
        if (map[right][top] != 0) return COLLISION_BLOCKING; //top right corner
        if (map[right][bottom] != 0) return COLLISION_BLOCKING; //bottom right corner
        if (map[left][bottom] != 0) return COLLISION_BLOCKING; //bottom left corner
    }

    return 0;
};

var checkBuildings = (game) => {
    var building = game.buildingFactory.getHead();

    console.log((game.player.offset.x / 48) * 48);
    console.log((game.player.offset.y / 48) * 48);

    while (building) {

        var buildingRect = {
            x: (building.x) * 48,
            y: (building.y) * 48,
            w: 144,
            h: 96,
        };

        console.log("checking building");
        console.log("building x" + building.x * 48);
        console.log("building y" + building.y * 48);

        if (rectangleCollision(getPlayerRect(game.player), buildingRect)) {
            return COLLISION_BLOCKING;
        }

        building = building.next;
    }
};

var printToConsole = (game) => {

    for (var i = parseInt(game.player.offset.x / 48) - 3; i < parseInt(game.player.offset.x / 48) + 3; i++) {

        var out = [];
        for (var j = parseInt(game.player.offset.y / 48) - 3; j < parseInt(game.player.offset.y / 48) + 3; j++) {
            if (parseInt(game.player.offset.x / 48) == i && parseInt(game.player.offset.y / 48) == j) {

                out.push("p");
            } else {

                out.push(game.map[i][j]);
            }
        }
        console.log(out.join(","));
    }
};


export const checkPlayerCollision = (game) => {


    var collision = checkEdges(game.player);
    if (!collision) {
        collision = checkTiles(game, getPlayerRect(game.player));
    }
    if (!collision) {
        collision = checkBuildings(game)
    }


    return collision;
};