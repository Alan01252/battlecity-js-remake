import {TIMER_SHOOT_LASER} from "../constants";
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


export const setupKeyboardInputs = (game) => {    //Capture the keyboard arrow keys
    var left = keyboard(37),
        up = keyboard(38),
        right = keyboard(39),
        down = keyboard(40),
        shift = keyboard(16),
        u = keyboard(85),
        o = keyboard(79),
        d = keyboard(68);


    left.press = function () {
        game.player.isTurning = -1;
    };

    left.release = function () {
        game.player.isTurning = 0;
    };

    right.press = function () {
        game.player.isTurning = 1;
    };
    right.release = function () {
        game.player.isTurning = 0;
    };

    up.press = function () {
        game.player.isMoving = -1;
    };
    up.release = function () {
        game.player.isMoving = 0;
    };

    down.press = function () {
        game.player.isMoving = +1;
    };
    down.release = function () {
        game.player.isMoving = 0;
    };

    u.press = function () {
        game.iconFactory.pickupIcon();
    };

    d.press = function () {

        var icon = game.iconFactory.dropSelectedIcon();


        var angle = -game.player.direction;
        var x = (Math.sin((angle / 16) * 3.14) * -1);
        var y = (Math.cos((angle / 16) * 3.14) * -1);

        var x2 = ((game.player.offset.x)) + (x * 20);
        var y2 = ((game.player.offset.y) + 20) + (y * 20);

        if (icon) {
            var item = game.itemFactory.newItem(icon, x2, y2, icon.type);
            if (item) {
                game.player.offset.x += 30;
                game.player.offset.x += 30;
            }
            // It's not been converted to an item and so is able to be picked up again
            if (!item) {
                game.iconFactory.newIcon(game.player.id, x2, y2, icon.type)
            }
        }

    };

    shift.press = function () {
        console.log("shift key pressed");
        if (game.tick > lastShot) {
            lastShot = game.tick + TIMER_SHOOT_LASER;

            var angle = game.player.direction;
            var angleInDegrees = (angle / 32) * 360;

            var x = (Math.sin((angleInDegrees * 3.14)/180));
            var y = (Math.cos((angleInDegrees * 3.14)/180) * -1);

            var x2 = ((game.player.offset.x) + 24) + (x * 30);
            var y2 = ((game.player.offset.y) + 24) + (y * 30);

            game.bulletFactory.newBullet(game.player.id, x2, y2, 0, -angle);
            game.socketListener.sendBulletShot({shooter: game.player.id, x: x2, y: y2, type: 0, angle: -angle});

        }

    }
};