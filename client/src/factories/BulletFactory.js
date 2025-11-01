import {MOVEMENT_SPEED_BULLET, MOVEMENT_SPEED_FLARE} from "../constants";
import {BULLET_ALIVE} from "../constants";
import {BULLET_DEAD} from "../constants";
import {DAMAGE_LASER} from "../constants";
import {DAMAGE_ROCKET} from "../constants";
import {DAMAGE_FLARE} from "../constants";

import {collidedWithRock} from "../collision/collision-bullet";
import {collidedWithCurrentPlayer} from "../collision/collision-bullet";
import {collidedWithAnotherPlayer} from "../collision/collision-bullet";
import {collidedWithBuilding} from "../collision/collision-bullet";
import {collidedWithItem} from "../collision/collision-bullet";

const BULLET_DAMAGE_BY_TYPE = {
    0: DAMAGE_LASER,
    1: DAMAGE_ROCKET,
    3: DAMAGE_FLARE,
};

const BULLET_SPEED_BY_TYPE = {
    0: MOVEMENT_SPEED_BULLET,
    1: MOVEMENT_SPEED_BULLET,
    3: MOVEMENT_SPEED_FLARE,
};

const getBulletDamage = (type) => {
    if (Object.prototype.hasOwnProperty.call(BULLET_DAMAGE_BY_TYPE, type)) {
        return BULLET_DAMAGE_BY_TYPE[type];
    }
    return DAMAGE_LASER;
};

const getBulletSpeed = (type) => {
    if (Object.prototype.hasOwnProperty.call(BULLET_SPEED_BY_TYPE, type)) {
        return BULLET_SPEED_BY_TYPE[type];
    }
    return MOVEMENT_SPEED_BULLET;
};

class BulletFactory {

    constructor(game) {
        this.game = game
        this.bulletListHead = null;
    }

    cycle() {
        var bullet = this.bulletListHead;
        while (bullet) {

            var fDir = bullet.angle;

            const speed = bullet.speed ?? getBulletSpeed(bullet.type);

            var x = (Math.sin((fDir / 16) * 3.14) * -1 ) * this.game.timePassed * speed;
            var y = (Math.cos((fDir / 16) * 3.14) * -1) * this.game.timePassed * speed;

            bullet.x += x;
            bullet.y += y;

            // Offscreen
            if (bullet.x < 0 || bullet.x > 24576 || bullet.y < 0 || bullet.y > 24576) {
                bullet.life = BULLET_DEAD;
            }

            if (collidedWithRock(this.game, bullet)) {
                console.log("Bullet collided with rock");
                bullet.life = BULLET_DEAD;
            }

            if (collidedWithItem(this.game, bullet)) {
                console.log("Bullet collided with item");
                bullet.life = BULLET_DEAD;
            }

            if (collidedWithBuilding(this.game, bullet)) {
                bullet.life = BULLET_DEAD;
            }

            if (collidedWithAnotherPlayer(this.game, bullet)) {
                console.log("Bullet collided with someone else");
                bullet.life = BULLET_DEAD;
            }


            if (collidedWithCurrentPlayer(this.game, bullet)) {
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

    newBullet(shooter, x, y, type, angle, team = null) {
        const bulletType = Number.isFinite(type) ? type : 0;

        var bullet = {
            "shooter": shooter,
            "x": x,
            "y": y,
            "life": BULLET_ALIVE,
            "damage": getBulletDamage(bulletType),
            "animation": 0,
            "type": bulletType,
            "angle": angle,
            "team": team,
            "speed": getBulletSpeed(bulletType),
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
