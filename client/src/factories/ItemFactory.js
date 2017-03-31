import {ITEM_TYPE_TURRET} from "../constants";
import {ITEM_TYPE_PLASMA} from "../constants";
import {ITEM_TYPE_WALL} from "../constants";
import {ITEM_TYPE_SLEEPER} from "../constants";

class ItemFactory {

    constructor(game) {
        this.game = game;
        this.itemListHead = null;
        this.calculateTick = 0;

        this.validIcons = [
            ITEM_TYPE_TURRET,
            ITEM_TYPE_PLASMA,
            ITEM_TYPE_SLEEPER,
            ITEM_TYPE_WALL
        ];

        this.validShooters = [
            ITEM_TYPE_TURRET,
            ITEM_TYPE_PLASMA,
            ITEM_TYPE_SLEEPER,
        ];
    }

    cycle() {

        if (this.game.tick > this.calculateTick) {
            this.calculateTick = this.game.tick + 200;
            var item = this.getHead();
            while (item) {
                this.targetNearestPlayer(item);
                this.fireBullet(item);
                item = item.next;
            }
        }
    }

    fireBullet(item) {
        if (this.validShooters.includes(item.type)) {

            if (this.game.tick > item.lastFired && item.target) {
                item.lastFired = this.game.tick + 250;

                var angle = ((item.angle) * 3.14) / 180;
                var direction = -((32 / 6) * angle);


                var x = (Math.sin((item.angle * 3.14)/180));
                var y = (Math.cos((item.angle * 3.14)/180) * -1);

                var x2 = ((item.x) - 16) + (x * 23);
                var y2 = ((item.y) - 24) + (y * 23);

                this.game.bulletFactory.newBullet(this.game.player.id, x2, y2, 0, direction);
            }
        }
    }

    targetNearestPlayer(item) {
        // loop through all players here at the moment we'll just make it target our selves

        var x = this.game.player.offset.x;
        var y = this.game.player.offset.y;
        var xDistanceFromPlayer = ((x - item.x) * (x - item.x));
        var yDistanceFromPlayer = ((y - item.y) * (y - item.y));

        var playerDistance = Math.sqrt(xDistanceFromPlayer + (yDistanceFromPlayer));
        item.target = this.game.player;


        if (item.target != null) {
            item.angle = Math.atan2(x - item.x, y - item.y);
            item.angle = Math.ceil((item.angle * 180 / 3.14));

            // We always need to have a positive angle in degrees to get the right image from the texture
            if (x >= item.x) {
                item.angle = 180 - item.angle
            }
            else if (x <= item.x) {
                item.angle = item.angle * -1 + 170
            }
        }
    }

    newItem(owner, x, y, type) {

        if (!this.validIcons.includes(type)) {
            return null;
        }

        var item = {
            "owner": owner,
            "x": x,
            "y": y,
            "target": null,
            "type": type,
            "lastFired": 0,
            "next": null,
            "previous": null

        };


        if (this.itemListHead) {
            this.itemListHead.previous = item;
            item.next = this.itemListHead
        }

        console.log("Created item");
        console.log(item);
        this.game.forceDraw = true;


        this.itemListHead = item;
        return item;
    }


    deleteItem(item) {
        var returnItem = item.next;

        if (item.next) {
            item.next.previous = item.previous;
        }

        if (item.previous) {
            item.previous.next = item.next
        } else {
            this.itemListHead = item.next;
        }

        return returnItem;
    }


    getHead() {
        return this.itemListHead;
    }
}


export default ItemFactory;
