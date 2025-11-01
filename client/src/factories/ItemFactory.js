import {ITEM_TYPE_TURRET} from "../constants";
import {ITEM_TYPE_PLASMA} from "../constants";
import {ITEM_TYPE_WALL} from "../constants";
import {ITEM_TYPE_SLEEPER} from "../constants";
import {ITEM_TYPE_MINE} from "../constants";
import {ITEM_TYPE_BOMB} from "../constants";
import {BOMB_EXPLOSION_TILE_RADIUS} from "../constants";
import {BOMB_ITEM_TILE_RADIUS} from "../constants";
import {ITEM_TYPE_ORB} from "../constants";

class ItemFactory {

    constructor(game) {
        this.game = game;
        this.itemListHead = null;
        this.calculateTick = 0;
        this.itemsById = new Map();
        this.pendingHazards = new Set();
        this.socketBound = false;
        this.nextLocalId = 0;

        this.validIcons = [
            ITEM_TYPE_TURRET,
            ITEM_TYPE_PLASMA,
            ITEM_TYPE_SLEEPER,
            ITEM_TYPE_WALL,
            ITEM_TYPE_MINE,
            ITEM_TYPE_BOMB,
            ITEM_TYPE_ORB
        ];

        this.validShooters = [
            ITEM_TYPE_TURRET,
            ITEM_TYPE_PLASMA,
            ITEM_TYPE_SLEEPER,
        ];

        this.pendingOrbItems = [];

        if (this.game.socketListener) {
            this.bindSocketEvents(this.game.socketListener);
        }
    }

    bindSocketEvents(socketListener) {
        if (!socketListener || this.socketBound) {
            return;
        }
        this.socketBound = true;
        socketListener.on('hazard:spawn', (hazard) => this.onHazardSpawn(hazard));
        socketListener.on('hazard:update', (hazard) => this.onHazardUpdate(hazard));
        socketListener.on('hazard:remove', (hazard) => this.onHazardRemove(hazard));
        socketListener.on('orb:result', (result) => this.onOrbResult(result));
    }

    generateHazardId() {
        this.nextLocalId += 1;
        const base = this.game.socketListener?.io?.id ?? 'local';
        return `hazard_${base}_${Date.now()}_${this.nextLocalId}`;
    }

    insertItem(item) {
        if (this.itemListHead) {
            this.itemListHead.previous = item;
            item.next = this.itemListHead;
        }
        this.itemListHead = item;
        this.itemsById.set(item.id, item);
        this.game.forceDraw = true;
    }

    detachItem(item) {
        if (!item) {
            return;
        }
        if (item.next) {
            item.next.previous = item.previous;
        }
        if (item.previous) {
            item.previous.next = item.next;
        } else if (this.itemListHead === item) {
            this.itemListHead = item.next;
        }
        item.next = null;
        item.previous = null;
        this.itemsById.delete(item.id);
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

    newItem(owner, x, y, type, options = {}) {

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
        if (type === ITEM_TYPE_BOMB || type === ITEM_TYPE_MINE) {
            adjustedX = Math.floor(x / 48) * 48;
            adjustedY = Math.floor(y / 48) * 48;
        }

        const hazardTypes = [ITEM_TYPE_MINE, ITEM_TYPE_BOMB];
        const isHazard = hazardTypes.includes(type);
        const notifyServer = options.notifyServer !== false && isHazard;
        const hazardId = options.id || (isHazard ? this.generateHazardId() : null);

        const bombArmed = owner && typeof owner === 'object' && owner.armed !== undefined
            ? !!owner.armed
            : (this.game.player?.bombsArmed ?? false);

        const item = {
            id: hazardId || `item_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            owner: ownerId,
            ownerId,
            teamId: ownerTeam,
            city: ownerTeam,
            x: adjustedX,
            y: adjustedY,
            target: null,
            targetTeam: null,
            type: type,
            lastFired: 0,
            active: type === ITEM_TYPE_BOMB ? bombArmed : true,
            armed: type === ITEM_TYPE_BOMB ? bombArmed : true,
            detonateTick: options.detonateTick || null,
            next: null,
            previous: null,
            synced: !notifyServer
        };

        this.insertItem(item);

        if (type === ITEM_TYPE_ORB && notifyServer !== false) {
            this.queueOrbDrop(item, {
                ownerId,
                teamId: ownerTeam
            });
        }

        if (notifyServer && this.game.socketListener) {
            this.pendingHazards.add(item.id);
            this.game.socketListener.spawnHazard({
                id: item.id,
                type,
                x: item.x,
                y: item.y,
                armed: item.active,
                ownerId: ownerId,
                teamId: ownerTeam
            });
        }

        if (type === ITEM_TYPE_BOMB) {
            this.armBomb(item, item.active, { notifyServer: false });
        }

        return item;
    }


    deleteItem(item) {
        if (!item) {
            return null;
        }
        const returnItem = item.next;
        if (Array.isArray(this.pendingOrbItems)) {
            const index = this.pendingOrbItems.indexOf(item);
            if (index !== -1) {
                this.pendingOrbItems.splice(index, 1);
            }
        }
        this.detachItem(item);
        this.pendingHazards.delete(item.id);
        return returnItem;
    }

    processBombs() {
        // Bomb timers and detonations are handled by the server.
    }

    armBomb(item, armed, options = {}) {
        if (!item || item.type !== ITEM_TYPE_BOMB) {
            return;
        }
        item.active = armed;
        item.armed = armed;
        if (options.notifyServer !== false && this.game.socketListener && item.id) {
            this.game.socketListener.updateHazard({ id: item.id, armed: !!armed });
        }
    }

    detonateBomb(item, options = {}) {
        const notifyServer = options.notifyServer !== undefined ? !!options.notifyServer : true;
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
                building = this.game.buildingFactory.deleteBuilding(building, notifyServer);
                continue;
            }
            building = building.next;
        }

        this.damagePlayersInRadius(centerTileX, centerTileY);
        this.game.forceDraw = true;
        return nextItem;
    }

    damagePlayersInRadius() {
        // Damage is applied authoritatively on the server.
    }

    queueOrbDrop(item, metadata = {}) {
        if (!item || !this.game || !this.game.socketListener) {
            return;
        }
        const localPlayerId = this.game.player?.id ?? null;
        const ownerId = metadata.ownerId ?? item.ownerId ?? localPlayerId;
        if (!localPlayerId || ownerId !== localPlayerId) {
            return;
        }

        if (!Array.isArray(this.pendingOrbItems)) {
            this.pendingOrbItems = [];
        }
        this.pendingOrbItems.push(item);
        item.pendingOrbCheck = true;

        const payload = {
            id: item.id,
            x: item.x,
            y: item.y,
            ownerId,
            city: metadata.teamId ?? item.teamId ?? this.game.player?.city ?? null,
            type: ITEM_TYPE_ORB
        };
        this.game.socketListener.sendOrbDrop(payload);
    }

    triggerMine(item) {
        if (!item || item.type !== ITEM_TYPE_MINE) {
            return;
        }
        item.active = false;
        item.hidden = true;
        this.game.forceDraw = true;
    }

    onHazardSpawn(hazard) {
        if (!hazard || !hazard.id) {
            return;
        }

        let item = this.itemsById.get(hazard.id);
        if (!item) {
            const type = this.resolveItemType(hazard.type);
            item = this.newItem(null, hazard.x, hazard.y, type, {
                id: hazard.id,
                notifyServer: false,
                detonateTick: hazard.detonateAt ? hazard.detonateAt : null
            });
            if (!item) {
                return;
            }
        }

        this.applyHazardState(item, hazard);
        item.synced = true;
        this.pendingHazards.delete(hazard.id);
    }

    onHazardUpdate(hazard) {
        if (!hazard || !hazard.id) {
            return;
        }
        const item = this.itemsById.get(hazard.id);
        if (!item) {
            this.onHazardSpawn(hazard);
            return;
        }
        this.applyHazardState(item, hazard);
    }

    onHazardRemove(hazard) {
        if (!hazard || !hazard.id) {
            return;
        }
        const item = this.itemsById.get(hazard.id);
        if (!item) {
            return;
        }

        if (hazard.reason === 'bomb_detonated') {
            this.spawnExplosion(hazard.x ?? item.x, hazard.y ?? item.y);
        }
        this.deleteItem(item);
        this.game.forceDraw = true;
    }

    onOrbResult(result) {
        if (!Array.isArray(this.pendingOrbItems) || !this.pendingOrbItems.length) {
            return;
        }
        const item = this.pendingOrbItems.shift();
        if (!item) {
            return;
        }
        item.pendingOrbCheck = false;

        const payload = result || {};
        if (payload.status !== 'detonated') {
            return;
        }

        this.spawnExplosion(item.x, item.y);
        this.deleteItem(item);
        this.game.forceDraw = true;
    }

    applyHazardState(item, hazard) {
        item.x = this.toFiniteNumber(hazard.x, item.x);
        item.y = this.toFiniteNumber(hazard.y, item.y);
        if (hazard.active !== undefined) {
            item.active = !!hazard.active;
        }
        if (hazard.armed !== undefined) {
            item.armed = !!hazard.armed;
        }
        if (hazard.detonateAt) {
            item.detonateTick = hazard.detonateAt;
        }
    }

    resolveItemType(hazardType) {
        if (hazardType === 'mine' || hazardType === ITEM_TYPE_MINE || hazardType === 4) {
            return ITEM_TYPE_MINE;
        }
        if (hazardType === 'bomb' || hazardType === ITEM_TYPE_BOMB || hazardType === 3) {
            return ITEM_TYPE_BOMB;
        }
        return ITEM_TYPE_MINE;
    }

    spawnExplosion(x, y) {
        if (!this.game || !Array.isArray(this.game.explosions)) {
            return;
        }
        this.game.explosions.push({
            x,
            y,
            frame: 0,
            nextFrameTick: null
        });
    }

    toFiniteNumber(value, fallback) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return fallback;
    }


    getHead() {
        return this.itemListHead;
    }
}


export default ItemFactory;
