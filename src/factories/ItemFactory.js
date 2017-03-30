class ItemFactory {

    constructor(game) {
        this.game = game;
        this.itemListHead = null;
    }

    cycle() {
    }

    newItem(owner, x, y, type) {

        var item = {
            "owner": owner,
            "x": x,
            "y": y,
            "type": type,
            "next": null,
            "previous": null

        };


        if (this.itemListHead) {
            this.itemListHead.previous = building;
            item.next = this.itemListHead
        }


        this.itemListHead = item;
        return item;
    }


    pickupItem() {
        var item = this.findItemByLocation();
        if (item) {
            item.owner = this.game.player.id;
            this.game.forceDraw = true;
        }
    }

    findItemByLocation() {

        var item = this.getHead();
        var range = 24;

        while (item) {

            if (item.x >= (this.game.player.offset.x - range)
                && item.x <= (this.game.player.offset.x + range)
                && item.y >= (this.game.player.offset.y - range)
                && item.y <= (this.game.player.offset.y + range)
            ) {
                return item;
            }

            item = item.next;
        }
        return  null;
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
