class IconFactory {

    constructor(game) {
        this.game = game;
        this.iconListHead = null;
    }

    cycle() {
    }

    newIcon(owner, x, y, type, options = {}) {

        var icon = {
            "owner": owner,
            "x": x,
            "y": y,
            "type": type,
            "next": null,
            "previous": null,
            "sourceBuildingId": options.sourceBuildingId ?? null

        };

        console.log("creating icon");
        console.log(icon);
        this.game.forceDraw = true;

        if (this.iconListHead) {
            this.iconListHead.previous = icon;
            icon.next = this.iconListHead
        }


        this.iconListHead = icon;
        if (this.game.buildingFactory && icon.owner == null) {
            if (!icon.sourceBuildingId && typeof this.game.buildingFactory.assignIconSource === 'function') {
                const building = this.game.buildingFactory.assignIconSource(icon);
                if (building) {
                    icon.sourceBuildingId = building.id;
                }
            }
            if (!options.skipProductionUpdate && typeof this.game.buildingFactory.handleIconProduced === 'function') {
                this.game.buildingFactory.handleIconProduced(icon);
            }
        }
        if (this.game.player && icon.owner === this.game.player.id && this.game.persistence && typeof this.game.persistence.saveInventory === 'function') {
            this.game.persistence.saveInventory();
        }
        return icon;
    }


    pickupIcon() {
        var icon = this.findIconByLocation();
        if (icon) {
            icon.owner = this.game.player.id;
            icon.city = this.game.player.city ?? null;
            this.game.forceDraw = true;
            if (this.game.buildingFactory && typeof this.game.buildingFactory.handleIconCollected === 'function') {
                this.game.buildingFactory.handleIconCollected(icon);
            }
            if (this.game.persistence && typeof this.game.persistence.saveInventory === 'function') {
                this.game.persistence.saveInventory();
            }
        }
    }

    dropSelectedIcon() {
        var icon = this.getHead();
        var selectedIcon = null;
        while (icon) {
            if (icon.owner == this.game.player.id && icon.selected) {
                this.game.forceDraw = true;
                selectedIcon = icon;
                this.deleteIcon(icon);
            }
            icon = icon.next;
        }
        if (this.game.persistence && typeof this.game.persistence.saveInventory === 'function') {
            this.game.persistence.saveInventory();
        }
        return selectedIcon;
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
        if (this.game.persistence && typeof this.game.persistence.saveInventory === 'function') {
            this.game.persistence.saveInventory();
        }
    }

    findIconByLocation() {

        var icon = this.getHead();
        var range = 24;

        while (icon) {

            if (icon.owner == null &&
                icon.x >= (this.game.player.offset.x - range)
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

        if (icon.owner !== null && icon.owner !== undefined &&
            this.game.player && icon.owner === this.game.player.id &&
            this.game.persistence && typeof this.game.persistence.saveInventory === 'function') {
            this.game.persistence.saveInventory();
        }

        return returnIcon;
    }


    getHead() {
        return this.iconListHead;
    }

    countUnownedIconsNear(x, y, type, radius = 48) {
        let count = 0;
        let icon = this.getHead();
        while (icon) {
            if (icon.owner == null && icon.type === type) {
                const dx = Math.abs(icon.x - x);
                const dy = Math.abs(icon.y - y);
                if (dx <= radius && dy <= radius) {
                    count++;
                }
            }
            icon = icon.next;
        }
        return count;
    }

    removeUnownedIconsNear(x, y, type, amount, radius = 48) {
        let removed = 0;
        let icon = this.getHead();
        while (icon && removed < amount) {
            const next = icon.next;
            if (icon.owner == null && icon.type === type) {
                const dx = Math.abs(icon.x - x);
                const dy = Math.abs(icon.y - y);
                if (dx <= radius && dy <= radius) {
                    this.deleteIcon(icon);
                    removed++;
                }
            }
            icon = next;
        }
        return removed;
    }
}


export default IconFactory;
