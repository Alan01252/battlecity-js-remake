/**
 * Created by alan on 28/03/17.
 */

class Bullet {

    constructor(id, bullet) {
        this.shooter = id;
        this.update(bullet);
    }

    update(bullet) {
        this.x = bullet.x;
        this.y = bullet.y;
        this.angle = bullet.angle;
    }

    cycle() {

    }
}

module.exports = Bullet;
