/*jslint node: true */
"use strict";

class Player {

    constructor(id, player) {
        this.id = id;
        this.city = 0;
        this.isMayor = false;
        this.update(player);
    }

    update(player) {
        this.x = player.x;
        this.y = player.y;
        this.direction = player.direction;
        this.isTurning = player.isTurning;
        this.isMoving = player.isMoving;
        this.offset = player.offset;
        if (player.city !== undefined) {
            this.city = player.city;
        }
        if (player.isMayor !== undefined) {
            this.isMayor = !!player.isMayor;
        }
    }

    cycle() {

    }
}

module.exports = Player;
