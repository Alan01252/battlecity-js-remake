import {rectangleCollision} from "./collision-helpers";
import {getPlayerRect} from "./collision-helpers";


import {MAP_SQUARE_ROCK} from "../constants";


var collidedWithPlayer = (playerRect, bullet)=> {

    var bulletRect = {
        x: bullet.x,
        y: bullet.y,
        w: 4,
        h: 4
    };

    return rectangleCollision(playerRect, bulletRect);
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

export const collidedWithAnotherPlayer = (game, bullet) => {

    return Object.keys(game.otherPlayers).some((id) => {
        return collidedWithPlayer(getPlayerRect(game.otherPlayers[id]), bullet)
    });
};

export const collidedWithCurrentPlayer = (game, bullet) => {
    return collidedWithPlayer(getPlayerRect(game.player), bullet);
};