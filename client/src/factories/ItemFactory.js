import {ITEM_TYPE_TURRET} from "../constants";
import {ITEM_TYPE_PLASMA} from "../constants";
import {ITEM_TYPE_WALL} from "../constants";
import {ITEM_TYPE_SLEEPER} from "../constants";
class ItemFactory {

    constructor(game) {
        this.game = game;
        this.itemListHead = null;

        this.validIcons = [
            ITEM_TYPE_TURRET,
            ITEM_TYPE_PLASMA,
            ITEM_TYPE_SLEEPER,
            ITEM_TYPE_WALL
        ];
    }

    cycle() {
    }

    newItem(owner, x, y, type) {

        if (!this.validIcons.includes(type)) {
            return null;
        }

        var item = {
            "owner": owner,
            "x": x,
            "y": y,
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
