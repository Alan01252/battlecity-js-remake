import {MAP_SQUARE_ROCK} from "./constants";


var rectangleCollision = (rect1, rect2) => {
    rect1.w += rect1.x;
    rect1.h += rect1.y;
    rect2.w += rect2.x;
    rect2.h += rect2.y;

    if (rect1.w < rect2.x)
        return false;
    if (rect2.w < rect1.x)
        return false;

    if (rect1.h < rect2.y)
        return false;
    if (rect2.h < rect1.y)
        return false;

    return 1;

};

export const collidedWithRock = (game, bullet) => {

    console.log("bulletx " + bullet.x);
    console.log("bullety " + bullet.y);

    var tileX = Math.floor((bullet.x + 40) / 48);
    var tileY = Math.floor((bullet.y + 40) / 48);

    console.log(tileX + " " + tileY);

    if (tileX > 0 && tileY > 0) {
        console.log(tileX + " " + tileY);
        console.log(game.map[tileX][tileY]);
        return game.map[tileX][tileY] == MAP_SQUARE_ROCK;
    }
    return false;
};

export const collidedWithCurrentPlayer = (game, bullet) => {

    if (bullet.shooter === game.player.id) {
        return false;
    }

    var playerRect = {
        x: parseInt(game.player.offset.x),
        y: parseInt(game.player.offset.y),
        w: 48,
        h: 48
    };

    var bulletRect = {
        x: bullet.x,
        y: bullet.y,
        w: 4,
        h: 4
    };

    return rectangleCollision(playerRect, bulletRect);
};