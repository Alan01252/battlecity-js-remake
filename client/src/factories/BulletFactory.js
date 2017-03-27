import {MOVEMENT_SPEED_BULLET} from "../constants";

class BulletFactory {

    constructor(game) {
        this.game = game
        this.bulletListHead = null;
    }

    cycle() {
        var bullet = this.bulletListHead;
        while (bullet) {

            var fDir = bullet.angle;


            var x = (Math.sin((fDir / 16) * 3.14)) * this.game.timePassed * MOVEMENT_SPEED_BULLET;
            var y = ((Math.cos((fDir / 16) * 3.14)) * -1) * this.game.timePassed * MOVEMENT_SPEED_BULLET;

            bullet.x += x;
            bullet.y += y;


            if (bullet.x > 1000 || bullet.y > 1000 || bullet.x < -1000 || bullet.y < -1000) {
                bullet = this.deleteBullet(bullet)
            } else {
                bullet = bullet.next;
            }
        }
    }

    deleteBullet(bullet) {
        var returnBullet = bullet.next;

        if (bullet.next) {
            bullet.next.previous = bullet.previous;
        }

        if (bullet.previous) {
            bullet.previous.next = bullet.next
        } else {
            this.bulletListHead = bullet.next;
        }

        return returnBullet;
    }

    newBullet(x, y, type, angle) {

        var bullet = {
            "x": x,
            "y": y,
            "animation": 0,
            "type": type,
            "angle": angle,
            "next": null,
            "previous": null
        };

        console.log("Adding bullet");
        console.log(bullet);

        if (this.bulletListHead) {
            this.bulletListHead.previous = bullet;
            bullet.next = this.bulletListHead
        }

        this.bulletListHead = bullet;

        return bullet;
    }

    getHead() {
        return this.bulletListHead;
    }
}


export default BulletFactory;
