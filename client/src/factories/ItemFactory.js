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
