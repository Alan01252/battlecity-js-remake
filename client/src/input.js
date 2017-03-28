import {TIMER_SHOOT_LASER} from "./constants";
/**
 * Created by alan on 27/03/17.
 */


var lastShot = 0;

var keyboard = (keyCode) => {
    var key = {};
    key.code = keyCode;
    key.isDown = false;
    key.isUp = true;
    key.press = undefined;
    key.release = undefined;
    //The `downHandler`
    key.downHandler = function (event) {
        if (event.keyCode === key.code) {
            if (key.isUp && key.press) key.press();
            key.isDown = true;
            key.isUp = false;
        }
        event.preventDefault();
    };

    //The `upHandler`
    key.upHandler = function (event) {
        if (event.keyCode === key.code) {
            if (key.isDown && key.release) key.release();
            key.isDown = false;
            key.isUp = true;
        }
        event.preventDefault();
    };

    //Attach event listeners
    window.addEventListener(
        "keydown", key.downHandler.bind(key), false
    );
    window.addEventListener(
        "keyup", key.upHandler.bind(key), false
    );
    return key;
};


export const setupInputs = (game) => {    //Capture the keyboard arrow keys
    var left = keyboard(37),
        up = keyboard(38),
        right = keyboard(39),
        down = keyboard(40),
        shift = keyboard(16)


    //Left arrow key `press` method
    left.press = function () {
        game.player.isTurning = -2;
    };

    //Left arrow key `release` method
    left.release = function () {
        game.player.isTurning = 0;
    };

    //Right
    right.press = function () {
        game.player.isTurning = 2;
    };
    right.release = function () {
        game.player.isTurning = 0;
    };

    //Up
    up.press = function () {
        game.player.isMoving = -1;
    };
    up.release = function () {
        game.player.isMoving = 0;
    };

    //Down
    down.press = function () {
        game.player.isMoving = +1;
    };
    down.release = function () {
        game.player.isMoving = 0;
    };

    shift.press = function () {
        console.log("shift key pressed");
        if (game.tick > lastShot) {
            lastShot = game.tick + TIMER_SHOOT_LASER;

            console.log("Player fired shot ");


            var angle = -game.player.direction;

            var x = (Math.sin((angle / 16) * 3.14) * -1);
            var y = (Math.cos((angle / 16) * 3.14) * -1);

            var x2 = ((game.player.offset.x) - 20 ) + (x * 20);
            var y2 = ((game.player.offset.y) - 20 ) + (y * 20);

            var bullet = game.bulletFactory.newBullet(game.player.id, x2, y2, 0, angle);
            game.socketListener.sendBulletShot({shooter: game.player.id, x: x2, y: y2, type: 0, angle: angle});

        }

    }
};