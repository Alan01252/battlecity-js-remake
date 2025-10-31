import {ITEM_TYPE_TURRET} from "../constants";
import {ITEM_TYPE_PLASMA} from "../constants";
import {ITEM_TYPE_WALL} from "../constants";
import {ITEM_TYPE_SLEEPER} from "../constants";
import {ITEM_TYPE_MINE} from "../constants";

class ItemFactory {

    constructor(game) {
        this.game = game;
        this.itemListHead = null;
        this.calculateTick = 0;

        this.validIcons = [
            ITEM_TYPE_TURRET,
            ITEM_TYPE_PLASMA,
            ITEM_TYPE_SLEEPER,
            ITEM_TYPE_WALL,
            ITEM_TYPE_MINE
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
                if (this.validShooters.includes(item.type)) {
                    this.targetNearestPlayer(item);
                    this.fireBullet(item);
                }
                item = item.next;
            }
        }
    }

    fireBullet(item) {
        if (!this.validShooters.includes(item.type)) {
            return;
        }

        if (this.game.tick > item.lastFired && item.target) {
            item.lastFired = this.game.tick + 250;

            var angle = ((item.angle) * 3.14) / 180;
            var direction = -((32 / 6) * angle);

            var x = (Math.sin((item.angle * 3.14) / 180));
            var y = (Math.cos((item.angle * 3.14) / 180) * -1);

            var x2 = ((item.x) + 20) + (x * 23);
            var y2 = ((item.y) + 24) + (y * 23);

            const shooterId = item.ownerId ?? item.owner ?? this.game.player.id;
            const shooterTeam = item.teamId ?? this.game.player.city ?? null;

            this.game.bulletFactory.newBullet(shooterId, x2, y2, 0, direction, shooterTeam);
        }
    }

    targetNearestPlayer(item) {
        var nearest = null;
        const itemTeam = item.teamId ?? null;

        const considerPlayer = (playerRef, id) => {
            if (!playerRef || !playerRef.offset) {
                return;
            }

            const playerTeam = playerRef.city ?? null;
            if (itemTeam !== null && playerTeam === itemTeam) {
                return;
            }

            var dx = (playerRef.offset.x - item.x);
            var dy = (playerRef.offset.y - item.y);

            var distance = Math.sqrt((dx * dx) + (dy * dy));
            if (distance > 400) {
                return;
            }

            if (!nearest || distance < nearest.distance) {
                nearest = {
                    id: id,
                    x: playerRef.offset.x,
                    y: playerRef.offset.y,
                    distance: distance,
                    team: playerTeam
                };
            }
        };

        considerPlayer(this.game.player, this.game.player.id);
        Object.keys(this.game.otherPlayers).forEach((id) => {
            considerPlayer(this.game.otherPlayers[id], id);
        });

        if (nearest) {
            item.target = nearest.id;
            item.targetTeam = nearest.team ?? null;

            var angle = Math.atan2(nearest.x - item.x, nearest.y - item.y);
            angle = Math.ceil((angle * 180 / 3.14));

            if (nearest.x >= item.x) {
                item.angle = 180 - angle;
            } else if (nearest.x <= item.x) {
                item.angle = (angle * -1) + 170;
            } else {
                item.angle = angle;
            }
        } else {
            item.target = null;
            item.targetTeam = null;
        }
    }

    newItem(owner, x, y, type) {

        if (!this.validIcons.includes(type)) {
            return null;
        }

        let ownerId = null;
        let ownerTeam = null;

        if (owner && typeof owner === 'object') {
            ownerId = owner.owner ?? owner.id ?? null;
            ownerTeam = owner.city ?? null;
        } else if (owner !== undefined) {
            ownerId = owner;
        }

        if (ownerTeam === null && ownerId !== null) {
            ownerTeam = this.game.player?.city ?? null;
        }

        var item = {
            "owner": ownerId,
            "ownerId": ownerId,
            "teamId": ownerTeam,
            "city": ownerTeam,
            "x": x,
            "y": y,
            "target": null,
            "targetTeam": null,
            "type": type,
            "lastFired": 0,
            "active": true,
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

    triggerMine(item) {
        if (!item || item.type !== ITEM_TYPE_MINE) {
            return;
        }
        item.active = false;
        this.deleteItem(item);
        this.game.forceDraw = true;
    }


    getHead() {
        return this.itemListHead;
    }
}


export default ItemFactory;
