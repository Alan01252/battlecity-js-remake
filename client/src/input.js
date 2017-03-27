/**
 * Created by alan on 27/03/17.
 */


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
        down = keyboard(40);


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
}