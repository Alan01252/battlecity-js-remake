import {MAP_SQUARE_ROCK} from "./constants";

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
