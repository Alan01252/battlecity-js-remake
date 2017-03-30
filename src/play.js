import {checkPlayerCollision} from "./collision/collision-player";

import {MOVEMENT_SPEED_PLAYER} from './constants';
import {COLLISION_MAP_EDGE_LEFT} from "./constants";
import {COLLISION_MAP_EDGE_RIGHT} from "./constants";
import {COLLISION_MAP_EDGE_TOP} from "./constants";
import {COLLISION_MAP_EDGE_BOTTOM} from "./constants";
import {COLLISION_BLOCKING} from "./constants";

var turnPlayer = (game) => {
    if (game.tick > game.player.timeTurn) {

        game.player.direction += game.player.isTurning;

        if (game.player.direction < 0) {
            game.player.direction = 31;
        }

        if (game.player.direction > 31) {
            game.player.direction = 0;
        }

        game.player.timeTurn = game.tick + 50;
    }
};


var movePlayer = (game) => {

    var fDir = -game.player.direction;
    var velocity = (Math.sin((fDir / 16) * 3.14) * game.player.isMoving) * (game.timePassed * MOVEMENT_SPEED_PLAYER);
    if (velocity > 20) {
        velocity = 20;
    }
    if (velocity < -20) {
        velocity = -20;
    }


    var preUpdate = game.player.offset.x;
    game.player.offset.x += velocity;

    //console.log("position" + checkPlayerCollision(game));

    switch (checkPlayerCollision(game)) {
        case COLLISION_MAP_EDGE_LEFT:
            game.player.offset.x = 0;
            break;
        case COLLISION_MAP_EDGE_RIGHT:
            game.player.offset.x = (511) * 48;
            break;
        case COLLISION_BLOCKING:
            console.log("blocking");
            game.player.offset.x = preUpdate;
            break;
        case 0:
            break;
    }

    velocity = (Math.cos((fDir / 16) * 3.14) * game.player.isMoving) * (game.timePassed * MOVEMENT_SPEED_PLAYER);
    if (velocity > 20) {
        velocity = 20;
    }
    if (velocity < -20) {
        velocity = -20;
    }


    var preUpdate = game.player.offset.y;
    game.player.offset.y += velocity;


    switch (checkPlayerCollision(game)) {
        case COLLISION_MAP_EDGE_TOP:
            game.player.offset.y = 0;
            break;
        case COLLISION_MAP_EDGE_BOTTOM:
            game.player.offset.y = (511) * 48;
            break;
        case COLLISION_BLOCKING:
            console.log("blocking y");
            game.player.offset.y = preUpdate;
            break;
        case 0:
            break;
    }

    //console.log("moved player to x " + game.player.offset.x);
    //console.log("moved player to y " + game.player.offset.y);

};

var killPlayer = (game) => {
    game.player.offset.x = 0;
    game.player.offset.y = 0;
};

export const play = (game) => {
    if (game.player.isTurning) {
        turnPlayer(game)
    }

    if (game.player.isMoving) {
        movePlayer(game);
    }

    if (game.player.health === 0) {
        killPlayer(game);
    }
};
