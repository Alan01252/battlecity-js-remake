class IconFactory {

    constructor(game) {
        this.game = game;
        this.iconListHead = null;
    }

    cycle() {
    }

    newIcon(owner, x, y, type) {

        var icon = {
            "owner": owner,
            "x": x,
            "y": y,
            "type": type,
            "next": null,
            "previous": null

        };


        if (this.iconListHead) {
            this.iconListHead.previous = building;
            icon.next = this.iconListHead
        }


        this.iconListHead = icon;
        return icon;
    }


    pickupIcon() {
        var icon = this.findIconByLocation();
        if (icon) {
            icon.owner = this.game.player.id;
            this.game.forceDraw = true;
        }
    }

    /**
     *
     * @param selectedIcon
     */
    toggleSelected(selectedIcon) {
        selectedIcon.selected = !selectedIcon.selected;

        var icon = this.getHead();
        while (icon) {
            if (icon.owner == selectedIcon.owner && icon != selectedIcon) {
                console.log("setting other icons selected to false");
                icon.selected = false;
            }
            icon = icon.next;
        }
    }

    findIconByLocation() {

        var icon = this.getHead();
        var range = 24;

        while (icon) {

            if (icon.x >= (this.game.player.offset.x - range)
                && icon.x <= (this.game.player.offset.x + range)
                && icon.y >= (this.game.player.offset.y - range)
                && icon.y <= (this.game.player.offset.y + range)
            ) {
                return icon;
            }

            icon = icon.next;
        }
        return null;
    }


    deleteIcon(icon) {
        var returnIcon = icon.next;

        if (icon.next) {
            icon.next.previous = icon.previous;
        }

        if (icon.previous) {
            icon.previous.next = icon.next
        } else {
            this.iconListHead = icon.next;
        }

        return returnIcon;
    }


    getHead() {
        return this.iconListHead;
    }
}


export default IconFactory;
