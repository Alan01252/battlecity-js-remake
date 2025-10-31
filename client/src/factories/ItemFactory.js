import {ITEM_TYPE_TURRET} from "../constants";
import {ITEM_TYPE_PLASMA} from "../constants";
import {ITEM_TYPE_WALL} from "../constants";
import {ITEM_TYPE_SLEEPER} from "../constants";
import {ITEM_TYPE_MINE} from "../constants";
import {ITEM_TYPE_BOMB} from "../constants";
import {TIMER_BOMB} from "../constants";
import {BOMB_EXPLOSION_TILE_RADIUS} from "../constants";
import {BOMB_ITEM_TILE_RADIUS} from "../constants";
import {MAX_HEALTH} from "../constants";
import {DAMAGE_BOMB} from "../constants";

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
            ITEM_TYPE_MINE,
            ITEM_TYPE_BOMB
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
        this.processBombs();
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

        let adjustedX = x;
        let adjustedY = y;
        if (type === ITEM_TYPE_BOMB) {
            adjustedX = Math.floor(x / 48) * 48;
            adjustedY = Math.floor(y / 48) * 48;
        }

        var item = {
            "owner": ownerId,
            "ownerId": ownerId,
            "teamId": ownerTeam,
            "city": ownerTeam,
            "x": adjustedX,
            "y": adjustedY,
            "target": null,
            "targetTeam": null,
            "type": type,
            "lastFired": 0,
            "active": type !== ITEM_TYPE_BOMB,
            "detonateTick": null,
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

        if (type === ITEM_TYPE_BOMB) {
            this.armBomb(item, this.game.player?.bombsArmed ?? false);
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

    processBombs() {
        var item = this.getHead();
        while (item) {
            if (item.type === ITEM_TYPE_BOMB && item.active) {
                if (!item.detonateTick) {
                    this.armBomb(item, true);
                } else if (this.game.tick >= item.detonateTick) {
                    item = this.detonateBomb(item);
                    continue;
                }
            }
            item = item.next;
        }
    }

    armBomb(item, armed) {
        if (!item || item.type !== ITEM_TYPE_BOMB) {
            return;
        }
        item.active = armed;
        if (armed) {
            item.detonateTick = (this.game.tick || Date.now()) + TIMER_BOMB;
        } else {
            item.detonateTick = null;
        }
    }

    detonateBomb(item) {
        const centerTileX = Math.floor((item.x + 24) / 48);
        const centerTileY = Math.floor((item.y + 24) / 48);

        console.log(`Bomb detonated at tile ${centerTileX}, ${centerTileY}`);

        let nextItem = this.deleteItem(item);

        // Remove nearby items
        let node = this.getHead();
        while (node) {
            const next = node.next;
            const tileX = Math.floor((node.x + 24) / 48);
            const tileY = Math.floor((node.y + 24) / 48);
            if (Math.abs(tileX - centerTileX) <= BOMB_ITEM_TILE_RADIUS &&
                Math.abs(tileY - centerTileY) <= BOMB_ITEM_TILE_RADIUS) {
                this.deleteItem(node);
            }
            node = next;
        }

        // Damage buildings
        let building = this.game.buildingFactory.getHead();
        while (building) {
            const diffX = Math.floor(building.x) - centerTileX;
            const diffY = Math.floor(building.y) - centerTileY;
            if (Math.abs(diffX) <= BOMB_EXPLOSION_TILE_RADIUS &&
                Math.abs(diffY) <= BOMB_EXPLOSION_TILE_RADIUS) {
                building = this.game.buildingFactory.deleteBuilding(building);
                continue;
            }
            building = building.next;
        }

        this.damagePlayersInRadius(centerTileX, centerTileY);
        this.game.forceDraw = true;
        return nextItem;
    }

    damagePlayersInRadius(tileX, tileY) {
        const checkPlayer = (player, applyHealth) => {
            if (!player) {
                return;
            }
            const px = player.offset?.x ?? player.x ?? 0;
            const py = player.offset?.y ?? player.y ?? 0;
            const playerTileX = Math.floor((px + 24) / 48);
            const playerTileY = Math.floor((py + 24) / 48);
            if (Math.abs(playerTileX - tileX) <= BOMB_ITEM_TILE_RADIUS &&
                Math.abs(playerTileY - tileY) <= BOMB_ITEM_TILE_RADIUS) {
                applyHealth(player);
            }
        };

        checkPlayer(this.game.player, (player) => {
            player.health = Math.max(0, player.health - DAMAGE_BOMB);
        });

        Object.keys(this.game.otherPlayers).forEach((id) => {
            checkPlayer(this.game.otherPlayers[id], (player) => {
                const currentHealth = player.health ?? MAX_HEALTH;
                player.health = Math.max(0, currentHealth - DAMAGE_BOMB);
                player.isDead = player.health <= 0;
            });
        });
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
