class Player {

    constructor(id, player) {
        this.id = id;
        this.update(player);
    }

    update(player) {
        this.x = player.x;
        this.y = player.y;
        this.direction = player.direction;
        this.isTurning = player.isTurning;
        this.isMoving = player.isMoving;
        this.offset = player.offset;
    }

    cycle() {

    }
}

module.exports = Player;
