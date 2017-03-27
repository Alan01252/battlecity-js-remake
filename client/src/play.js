import {checkPlayerCollision} from "./collision";

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
    game.player.offset.x += velocity;

    console.log("position" + checkPlayerCollision(game));

    switch (checkPlayerCollision(game)) {
        case COLLISION_MAP_EDGE_LEFT:
            game.player.offset.x = 0;
            break;
        case COLLISION_MAP_EDGE_RIGHT:
            game.player.offset.y = (511) * 48;

            break;
        case COLLISION_BLOCKING:
            game.player.offset.x -= velocity;
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


    game.player.offset.y += velocity;


    switch (checkPlayerCollision(game)) {
        case COLLISION_MAP_EDGE_TOP:
            game.player.offset.y = 0;
            break;
        case COLLISION_MAP_EDGE_BOTTOM:
            game.player.offset.y = (511) * 48;
            break;
        case COLLISION_BLOCKING:
            game.player.offset.y -= velocity;
            break;
        case 0:
            break;
    }

    console.log("players x" + game.player.offset.x + " players y " + game.player.offset.y);
    console.log("players ground x" + ((game.player.groundOffset.x + game.player.offset.x)
        + " players ground y " + (game.player.groundOffset.y + game.player.offset.y)));

};

export const play = (game) => {
    if (game.player.isTurning) {
        turnPlayer(game)
    }

    if (game.player.isMoving) {
        movePlayer(game);
    }
};
