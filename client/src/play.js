import {MOVEMENT_SPEED_PLAYER} from './constants';

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
    var x = velocity;

    velocity = (Math.cos((fDir / 16) * 3.14) * game.player.isMoving) * (game.timePassed * MOVEMENT_SPEED_PLAYER);
    if (velocity > 20) {
        velocity = 20;
    }
    if (velocity < -20) {
        velocity = -20;
    }

    var y = velocity;
    console.log(x + " " + y);
    console.log("players x" + game.player.offset.x + " players y " + game.player.offset.y);

    game.player.offset.x += x;
    game.player.offset.y += y;
};

export const play = (game) => {
    if (game.player.isTurning) {
        turnPlayer(game)
    }

    if (game.player.isMoving) {
        movePlayer(game);
    }
};
