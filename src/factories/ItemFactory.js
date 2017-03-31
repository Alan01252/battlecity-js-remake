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
    }

    cycle() {

        if (this.game.tick > this.calculateTick) {
            console.log("drawing");
            this.calculateTick = this.game.tick + 200;

            var item = this.getHead();
            while (item) {
                this.targetNearestPlayer(item);
                item = item.next;
            }
        }
    }

    targetNearestPlayer(item) {
        // loop through all players here at the moment we'll just make it target outselves

        var x = this.game.player.offset.x;
        var y = this.game.player.offset.y;
        var xDistanceFromPlayer = ((x - item.x) * (x - item.x));
        var yDistanceFromPlayer = ((y - item.y) * (y - item.y));
        console.log(xDistanceFromPlayer);

        var playerDistance = Math.sqrt(xDistanceFromPlayer + (yDistanceFromPlayer));
        console.log(playerDistance);
        var target = this.game.player;


        var atan = Math.atan2(x - item.x, y - item.y);

        if (target != null) {
            item.angle = atan;
            item.angle = (item.angle * 180 / 3.14);

            // We always need to have a positive angle in degrees to get the right image from the texture
            if (x > item.x) {
                item.angle = 180 - item.angle
            }
            else if (x < item.x) {
                item.angle = item.angle * -1 + 180
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
