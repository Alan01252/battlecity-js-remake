import {ITEM_TYPE_BOMB, ITEM_TYPE_LIMITS} from "../constants";

class IconFactory {

    constructor(game) {
        this.game = game;
        this.iconListHead = null;
    }

    cycle() {
    }

    getLimitForType(type) {
        const limit = ITEM_TYPE_LIMITS?.[type];
        return typeof limit === 'number' ? limit : Infinity;
    }

    getOwnedQuantity(ownerId, type) {
        if (ownerId === null || ownerId === undefined) {
            return 0;
        }
        let total = 0;
        let node = this.getHead();
        while (node) {
            if (node.owner === ownerId && node.type === type) {
                const quantity = Number.isFinite(node.quantity) ? node.quantity : parseInt(node.quantity, 10) || 1;
                total += Math.max(1, quantity);
            }
            node = node.next;
        }
        return total;
    }

    getAllowedQuantity(ownerId, type, requestedQuantity) {
        const desired = Math.max(1, parseInt(requestedQuantity, 10) || 1);
        if (ownerId === null || ownerId === undefined) {
            return desired;
        }
        const limit = this.getLimitForType(type);
        if (!Number.isFinite(limit)) {
            return desired;
        }
        const owned = this.getOwnedQuantity(ownerId, type);
        const remaining = limit - owned;
        if (remaining <= 0) {
            return 0;
        }
        return Math.min(desired, remaining);
    }

    newIcon(owner, x, y, type, options = {}) {
        const requestedQuantity = options.quantity !== undefined ? options.quantity : 1;
        let quantity = Math.max(1, parseInt(requestedQuantity, 10) || 1);
        if (owner !== null && owner !== undefined) {
            const allowed = this.getAllowedQuantity(owner, type, quantity);
            if (allowed <= 0) {
                return null;
            }
            quantity = allowed;
        }

        const resolvedCity = (options.city !== undefined)
            ? options.city
            : ((owner !== null && owner !== undefined && owner === this.game.player?.id)
                ? this.game.player.city ?? null
                : null);
        const resolvedTeam = (options.teamId !== undefined)
            ? options.teamId
            : ((owner !== null && owner !== undefined && owner === this.game.player?.id)
                ? this.game.player.city ?? null
                : null);

        var icon = {
            "owner": owner,
            "x": x,
            "y": y,
            "type": type,
            "next": null,
            "previous": null,
            "sourceBuildingId": options.sourceBuildingId ?? null,
            "quantity": quantity,
            "selected": !!options.selected,
            "armed": !!options.armed,
            "city": resolvedCity,
            "teamId": resolvedTeam

        };

        console.log("creating icon");
        console.log(icon);
        this.game.forceDraw = true;

        if (this.iconListHead) {
            this.iconListHead.previous = icon;
            icon.next = this.iconListHead
        }


        this.iconListHead = icon;
        icon.quantity = Math.max(1, parseInt(icon.quantity, 10) || 1);

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
        if (icon.owner === this.game.player?.id && icon.selected) {
            let node = this.iconListHead;
            while (node) {
                if (node !== icon && node.owner === icon.owner) {
                    node.selected = false;
                    if (node.type === ITEM_TYPE_BOMB) {
                        node.armed = false;
                    }
                }
                node = node.next;
            }
            if (icon.type === ITEM_TYPE_BOMB) {
                icon.armed = !!icon.armed;
                this.game.player.bombsArmed = icon.armed;
            }
            this.game.forceDraw = true;
        }
        return icon;
    }


    pickupIcon() {
        var icon = this.findIconByLocation();
        if (icon) {
            const ownerId = this.game.player.id;
            const quantityToAdd = icon.quantity ?? 1;
            const allowedQuantity = this.getAllowedQuantity(ownerId, icon.type, quantityToAdd);
            if (allowedQuantity <= 0 || allowedQuantity < quantityToAdd) {
                return;
            }
            const existing = this.findOwnedIconByType(ownerId, icon.type);

            icon.owner = ownerId;
            icon.city = this.game.player.city ?? null;
            icon.teamId = this.game.player.city ?? null;
            icon.quantity = quantityToAdd;
            icon.selected = false;
            icon.armed = false;

            if (this.game.buildingFactory && typeof this.game.buildingFactory.handleIconCollected === 'function') {
                this.game.buildingFactory.handleIconCollected(icon);
            }

            if (existing && existing !== icon) {
                const limit = this.getLimitForType(icon.type);
                const updatedQuantity = (existing.quantity ?? 1) + quantityToAdd;
                existing.quantity = Number.isFinite(limit)
                    ? Math.min(limit, Math.max(1, updatedQuantity))
                    : Math.max(1, updatedQuantity);
                this.deleteIcon(icon);
            }

            this.game.forceDraw = true;
        }
    }

    dropSelectedIcon() {
        var icon = this.getHead();
        var selectedIcon = null;
        while (icon) {
            if (icon.owner == this.game.player.id && icon.selected) {
                selectedIcon = icon;
                break;
            }
            icon = icon.next;
        }
        if (!selectedIcon) {
            return null;
        }

        const quantity = selectedIcon.quantity ?? 1;
        const dropInfo = {
            type: selectedIcon.type,
            armed: !!selectedIcon.armed,
            owner: this.game.player.id,
            city: this.game.player.city ?? null,
            teamId: this.game.player.city ?? null,
        };

        if (quantity > 1) {
            selectedIcon.quantity = quantity - 1;
            selectedIcon.selected = true;
        } else {
            this.deleteIcon(selectedIcon);
        }

        if (dropInfo.type === ITEM_TYPE_BOMB) {
            if (quantity > 1) {
                selectedIcon.armed = dropInfo.armed;
                this.game.player.bombsArmed = selectedIcon.armed;
            } else {
                this.game.player.bombsArmed = false;
            }
        }

        this.game.forceDraw = true;
        return dropInfo;
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
        if (selectedIcon.type === ITEM_TYPE_BOMB) {
            selectedIcon.armed = selectedIcon.selected;
            this.game.player.bombsArmed = selectedIcon.armed;
        } else if (selectedIcon.selected) {
            this.game.player.bombsArmed = false;
        }
    }

    findIconByLocation() {

        var icon = this.getHead();
        var range = 24;

        const playerCity = this.game.player?.city ?? null;
        while (icon) {
            const allowedTeam = icon.teamId === null || icon.teamId === undefined || icon.teamId === playerCity;
            if (icon.owner == null &&
                allowedTeam &&
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

    findOwnedIconByType(ownerId, type) {
        var icon = this.getHead();
        while (icon) {
            if (icon.owner === ownerId && icon.type === type) {
                return icon;
            }
            icon = icon.next;
        }
        return null;
    }

    getSelectedIcon(ownerId) {
        var icon = this.getHead();
        while (icon) {
            if (icon.owner === ownerId && icon.selected) {
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

        if (this.game.player && this.game.player.id === icon.owner && icon.type === ITEM_TYPE_BOMB) {
            this.game.player.bombsArmed = icon.armed;
        }

        return returnIcon;
    }


    getHead() {
        return this.iconListHead;
    }

    countUnownedIconsNear(x, y, type, radius = 48, teamId = null) {
        let count = 0;
        let icon = this.getHead();
        while (icon) {
            const matchesTeam = teamId === null || teamId === undefined
                || icon.teamId === null || icon.teamId === undefined
                || icon.teamId === teamId;
            if (icon.owner == null && icon.type === type && matchesTeam) {
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

    removeUnownedIconsNear(x, y, type, amount, radius = 48, teamId = null) {
        let removed = 0;
        let icon = this.getHead();
        while (icon && removed < amount) {
            const next = icon.next;
            const matchesTeam = teamId === null || teamId === undefined
                || icon.teamId === null || icon.teamId === undefined
                || icon.teamId === teamId;
            if (icon.owner == null && icon.type === type && matchesTeam) {
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
