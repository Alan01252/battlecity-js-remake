import {COLLISION_MAP_EDGE_LEFT} from "./constants";
import {COLLISION_MAP_EDGE_RIGHT} from "./constants";
import {COLLISION_MAP_EDGE_TOP} from "./constants";
import {COLLISION_MAP_EDGE_BOTTOM} from "./constants";
import {COLLISION_BLOCKING} from "./constants";


var gap = 8;

var checkEdges = (player) => {
    if (player.offset.x < 0) return COLLISION_MAP_EDGE_LEFT;
    if (player.offset.y > (511 * 48)) return COLLISION_MAP_EDGE_RIGHT;
    if (player.offset.y < 0) return COLLISION_MAP_EDGE_TOP;
    if (player.offset.y > (511 * 48)) return COLLISION_MAP_EDGE_BOTTOM;

    return 0;
};

var checkTiles = (game, playerRect) => {

    var map = game["map"];

    var left = Math.floor((playerRect.x) / 48);
    var right = Math.floor((playerRect.x + playerRect.w) / 48);
    var top = Math.floor((playerRect.y) / 48);
    var bottom = Math.floor((playerRect.y + playerRect.h) / 48);

    if (left && right && top && bottom) {
        //Map Terrain (lava, rocks, CC corners)
        if (map[left][top] != 0) return COLLISION_BLOCKING;
        if (map[right][top] != 0) return COLLISION_BLOCKING; //top right corner
        if (map[right][bottom] != 0) return COLLISION_BLOCKING; //bottom right corner
        if (map[left][bottom] != 0) return COLLISION_BLOCKING; //bottom left corner
    }

    return 0;

};


export const checkPlayerCollision = (game) => {

    /**
     * Image doesn't take up all of sprint make box smaller
     *
     * @type {{x: *, y: *, w: number, h: number}}
     */
    var playerRect = {
        x: parseInt(game.player.offset.x - gap),
        y: parseInt(game.player.offset.y - gap),
        w: 48 - gap - gap,
        h: 48 - gap - gap
    };

    var collision = checkEdges(game.player);
    if (!collision) {
        collision = checkTiles(game, playerRect);
    }

    console.log(collision);

    return collision;
};