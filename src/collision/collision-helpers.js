import {COLLISION_BLOCKING} from "../constants";
import {COLLISION_MAP_EDGE_LEFT} from "../constants";
import {COLLISION_MAP_EDGE_RIGHT} from "../constants";
import {COLLISION_MAP_EDGE_TOP} from "../constants";
import {COLLISION_MAP_EDGE_BOTTOM} from "../constants";

export const rectangleCollision = (rect1, rect2) => {

    var rect1 = Object.assign({}, rect1);
    var rect2 = Object.assign({}, rect2);

    rect1.w += rect1.x;
    rect1.h += rect1.y;
    rect2.w += rect2.x;
    rect2.h += rect2.y;

    if (rect1.w <= rect2.x) {
        return false;
    }
    if (rect2.w <= rect1.x) {
        return false;
    }

    if (rect1.h <= rect2.y) {
        return false;
    }

    if (rect2.h <= rect1.y) {
        return false;
    }

    return true;

};

export const checkEdges = (rect) => {
    if (rect.x < 0) return COLLISION_MAP_EDGE_LEFT;
    if (rect.x > (510 * 48)) return COLLISION_MAP_EDGE_RIGHT;
    if (rect.y < 0) return COLLISION_MAP_EDGE_TOP;
    if (rect.y > (510 * 48)) return COLLISION_MAP_EDGE_BOTTOM;

    return false;
};

export const checkTiles = (game, rect) => {

    var map = game["map"];

    var left = Math.floor((rect.x) / 48);
    var right = Math.floor((rect.x + rect.w) / 48);
    var top = Math.floor((rect.y) / 48);
    var bottom = Math.floor((rect.y + rect.h) / 48);

    console.log("left, top ", left + "," + top );
    console.log("right, top ", right + "," + top );


    console.log("left, bottom ", left + "," + bottom );
    console.log("right, bottm ", right + "," + bottom );

    console.log(map[left][top]);
    console.log(map[right][top]);
    console.log(map[left][bottom]);
    console.log(map[right][bottom]);

    if (left && right && top && bottom) {
        //Map Terrain (lava, rocks)
        if (map[left][top] != 0 && map[left][top] != 3) return COLLISION_BLOCKING;
        if (map[left][bottom] != 0 && map[left][bottom] != 3) return COLLISION_BLOCKING;
        if (map[right][top] != 0 && map[right][top] != 3) return COLLISION_BLOCKING;
        if (map[right][bottom] != 0 && map[right][bottom] != 3) return COLLISION_BLOCKING;
    }

    return false;
};

export const getPlayerRect = (player) => {


    // Gap is because tank image doesn't take up full tile
    var gap = 8;

    return {
        x: parseInt(player.offset.x + gap),
        y: parseInt(player.offset.y + gap),
        w: 48 - gap - gap,
        h: 48 - gap - gap
    };

};
