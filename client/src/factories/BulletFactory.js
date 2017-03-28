import {MOVEMENT_SPEED_BULLET} from "../constants";
import {BULLET_ALIVE} from "../constants";
import {BULLET_DEAD} from "../constants";
import {collidedWithRock} from "../collision-bullet";

class BulletFactory {

    constructor(game) {
        this.game = game
        this.bulletListHead = null;
    }

    cycle() {
        var bullet = this.bulletListHead;
        while (bullet) {

            var fDir = bullet.angle;


            var x = (Math.sin((fDir / 16) * 3.14) * -1 ) * this.game.timePassed * MOVEMENT_SPEED_BULLET;
            var y = (Math.cos((fDir / 16) * 3.14) * -1) * this.game.timePassed * MOVEMENT_SPEED_BULLET;

            bullet.x += x;
            bullet.y += y;

            if ( bullet.x < 0 || bullet.y < 0) {
                bullet.life = BULLET_DEAD;
            }

            if (collidedWithRock(this.game, bullet)) {
                console.log("Bullet collided");
                bullet.life = BULLET_DEAD;
            }

            if (bullet.life == BULLET_DEAD) {
                bullet = this.deleteBullet(bullet)
            }
            else {
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
            "life": BULLET_ALIVE,
            "animation": 0,
            "type": type,
            "angle": angle,
            "next": null,
            "previous": null
        };


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
