import { io } from 'socket.io-client';
import { EventEmitter2 } from 'eventemitter2';
import { getCitySpawn } from './utils/citySpawns';

class SocketListener extends EventEmitter2 {

    constructor(game) {
        super();
        this.game = game;
        this.sequenceCounter = 0;
        this.lastServerSequence = 0;
    }

    listen() {
        this.io = io("http://localhost:8021", {
            transports: ['websocket']
        });
        this.io.on("connect", () => {
            console.log("connected");
            this.sequenceCounter = 0;
            this.lastServerSequence = 0;
            this.emit("connected");
        });
        this.io.on("connect_error", (err) => {
            console.error("socket connect_error", err?.message ?? err);
        });
        this.io.on("disconnect", (reason) => {
            console.warn("socket disconnected", reason);
            this.lastServerSequence = 0;
        });

        this.io.on("enter_game", (player) => {
            const normalised = this.normalisePlayerPayload(player);
            if (!normalised) {
                return;
            }
            this.applyPlayerUpdate(normalised, { source: 'enter_game' });
        });

        this.io.on("player", (player) => {
            const normalised = this.normalisePlayerPayload(player);
            if (!normalised) {
                return;
            }
            this.applyPlayerUpdate(normalised, { source: 'player' });
        });

        this.io.on("players:snapshot", (payload) => {
            const snapshot = this.safeParse(payload);
            if (!Array.isArray(snapshot)) {
                return;
            }
            snapshot.forEach((entry) => {
                const normalised = this.normalisePlayerPayload(entry);
                if (!normalised) {
                    return;
                }
                this.applyPlayerUpdate(normalised, { source: 'snapshot' });
            });
        });

        this.io.on("player:removed", (payload) => {
            const data = this.safeParse(payload);
            if (!data || !data.id) {
                return;
            }
            if (this.io?.id && data.id === this.io.id) {
                return;
            }
            delete this.game.otherPlayers[data.id];
        });

        this.io.on("player:rejected", (payload) => {
            const rejection = this.safeParse(payload);
            if (!rejection) {
                return;
            }
            if (Array.isArray(rejection.reasons) && rejection.reasons.length) {
                console.warn("Authoritative server rejected player update", rejection.reasons);
            }
            if (rejection.player) {
                const normalised = this.normalisePlayerPayload(rejection.player);
                if (!normalised) {
                    return;
                }
                this.applyPlayerUpdate(normalised, { source: 'rejected' });
            }
        });

        this.io.on("bullet_shot", (bullet) => {
            var bullet = JSON.parse(bullet);
            this.game.bulletFactory.newBullet(bullet.shooter, bullet.x, bullet.y, bullet.type, bullet.angle, bullet.team ?? null)
        });

        this.io.on("new_icon", (icon) => {
            var icon = JSON.parse(icon);
            this.game.iconFactory.newIcon(null, icon.x, icon.y, icon.type)
        });

        this.io.on("new_building", (payload) => {
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                if (data) {
                    data.type = Number(data.type);
                    data.population = data.population || 0;
                    data.ownerId = data.ownerId || data.owner || null;
                    data.attachedHouseId = data.attachedHouseId ?? null;
                    data.city = data.city ?? 0;
                    data.itemsLeft = data.itemsLeft || 0;
                    data.smokeActive = !!data.smokeActive;
                    data.smokeFrame = data.smokeFrame || 0;
                }
                this.emit('building:new', data);
            } catch (error) {
                console.warn('Failed to parse new_building payload', error);
            }
        });

        this.io.on("population:update", (update) => {
            try {
                const data = typeof update === 'string' ? JSON.parse(update) : update;
                if (data) {
                    data.type = Number(data.type);
                    data.population = data.population || 0;
                    data.attachedHouseId = data.attachedHouseId ?? null;
                    data.city = data.city ?? 0;
                    data.smokeActive = !!data.smokeActive;
                    data.smokeFrame = data.smokeFrame || 0;
                    data.itemsLeft = data.itemsLeft || 0;
                }
                this.emit('population:update', data);
            } catch (error) {
                console.warn('Failed to parse population update', error);
            }
        });

        this.io.on("city:finance", (payload) => {
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                if (data) {
                    this.emit('city:finance', data);
                }
            } catch (error) {
                console.warn('Failed to parse finance update', error);
            }
        });

        this.io.on("city:info", (payload) => {
            const data = this.safeParse(payload);
            if (!data || typeof data !== 'object') {
                return;
            }
            if (data.cityId === undefined && data.city !== undefined) {
                data.cityId = this.toFiniteNumber(data.city, data.city);
            } else if (data.cityId !== undefined) {
                data.cityId = this.toFiniteNumber(data.cityId, data.cityId);
            }
            this.emit('city:info', data);
        });

        this.io.on("build:denied", (payload) => {
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                if (data) {
                    this.emit('build:denied', data);
                }
            } catch (error) {
                console.warn('Failed to parse build denied payload', error);
            }
        });

        this.io.on("demolish_building", (payload) => {
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                if (data && data.id && this.game.buildingFactory?.removeBuildingById) {
                    this.game.buildingFactory.removeBuildingById(data.id);
                }
            } catch (error) {
                console.warn('Failed to handle demolish payload', error);
            }
        });

        this.io.on("player:health", (payload) => {
            const data = this.safeParse(payload);
            if (!data || !data.id) {
                return;
            }
            this.applyHealthUpdate(data);
        });

        this.io.on("player:dead", (payload) => {
            const data = this.safeParse(payload);
            if (!data || !data.id) {
                return;
            }
            this.applyHealthUpdate({ id: data.id, health: 0, source: data.reason });
        });

        this.io.on("hazard:spawn", (payload) => {
            const hazard = this.normaliseHazardPayload(payload);
            if (!hazard) {
                return;
            }
            this.emit('hazard:spawn', hazard);
        });

        this.io.on("hazard:update", (payload) => {
            const hazard = this.normaliseHazardPayload(payload);
            if (!hazard) {
                return;
            }
            this.emit('hazard:update', hazard);
        });

        this.io.on("hazard:remove", (payload) => {
            const hazard = this.normaliseHazardPayload(payload);
            if (!hazard) {
                return;
            }
            this.emit('hazard:remove', hazard);
        });
    }

    sendNewBuilding(building) {
        if (this.io && !this.io.disconnected) {
            this.io.emit("new_building", JSON.stringify(building));
        }
    }

    sendDemolishBuilding(buildingId) {
        if (!this.io || this.io.disconnected || !buildingId) {
            return;
        }
        this.io.emit('demolish_building', JSON.stringify({ id: buildingId }));
    }

    requestCityInfo(cityId) {
        if (!this.io || this.io.disconnected) {
            return;
        }
        const numericId = this.toFiniteNumber(cityId, null);
        if (!Number.isFinite(numericId)) {
            return;
        }
        const normalised = Math.max(0, Math.floor(numericId));
        this.io.emit('city:inspect', JSON.stringify({ city: normalised }));
    }

    sendBulletShot(bullet) {
        if (this.io && !this.io.disconnected) {
            this.io.emit("bullet_shot", JSON.stringify(bullet));
        }
    }

    enterGame() {
        console.log("Telling server we've entered the game");
        if (this.io && !this.io.disconnected) {
            this.sequenceCounter = 0;
            this.game.player.sequence = 0;
            const payload = this.createPlayerPayload();
            this.io.emit("enter_game", JSON.stringify(payload));
            return this.io.id;
        }
        return null;
    }

    cycle() {
        if (this.io && !this.io.disconnected) {
            this.sequenceCounter += 1;
            this.game.player.sequence = this.sequenceCounter;
            const payload = this.createPlayerPayload();
            this.io.emit("player", JSON.stringify(payload));
        }
    }

    spawnHazard(hazard) {
        if (!this.io || this.io.disconnected) {
            return;
        }
        this.io.emit('hazard:spawn', JSON.stringify(hazard));
    }

    updateHazard(hazard) {
        if (!this.io || this.io.disconnected) {
            return;
        }
        this.io.emit('hazard:arm', JSON.stringify(hazard));
    }

    removeHazard(id) {
        if (!this.io || this.io.disconnected || !id) {
            return;
        }
        this.io.emit('hazard:remove', JSON.stringify({ id }));
    }

    createPlayerPayload() {
        const player = this.game.player;
        const isMovingValue = Number.isFinite(player.isMoving) ? player.isMoving : Number(player.isMoving);
        const normalizedMoving = Number.isFinite(isMovingValue) ? Math.max(-1, Math.min(1, isMovingValue)) : 0;
        const isTurningValue = Number.isFinite(player.isTurning) ? player.isTurning : Number(player.isTurning);
        const normalizedTurning = Number.isFinite(isTurningValue) ? Math.max(-1, Math.min(1, Math.round(isTurningValue))) : 0;
        return {
            id: player.id,
            city: player.city,
            isMayor: player.isMayor,
            health: player.health,
            direction: ((Math.round(player.direction) % 32) + 32) % 32,
            isTurning: normalizedTurning,
            isMoving: normalizedMoving,
            bombsArmed: !!player.bombsArmed,
            sequence: player.sequence,
            offset: {
                x: player.offset?.x ?? 0,
                y: player.offset?.y ?? 0
            }
        };
    }

    applyPlayerUpdate(player, context) {
        if (!player || !player.id) {
            return;
        }
        const myId = this.io?.id;
        if (myId && player.id === myId) {
            this.syncLocalPlayer(player, context);
            return;
        }
        const existing = this.game.otherPlayers[player.id];
        if (existing && existing.sequence !== undefined && player.sequence !== undefined) {
            if (player.sequence <= existing.sequence) {
                return;
            }
        }
        this.game.otherPlayers[player.id] = player;
    }

    syncLocalPlayer(player) {
        if (!player || !this.game || !this.game.player) {
            return;
        }
        const me = this.game.player;
        if (player.sequence !== undefined && player.sequence < this.lastServerSequence && this.lastServerSequence !== 0) {
            const dxOutdated = Math.abs(player.offset.x - me.offset.x);
            const dyOutdated = Math.abs(player.offset.y - me.offset.y);
            const outdatedThreshold = 96;
            if (dxOutdated < outdatedThreshold && dyOutdated < outdatedThreshold) {
                return;
            }
        }

        if (player.sequence !== undefined) {
            this.lastServerSequence = Math.max(this.lastServerSequence, player.sequence);
        }

        me.id = player.id ?? me.id;
        const previousCity = Number.isFinite(me.city) ? me.city : null;
        const nextCity = this.toFiniteNumber(player.city, me.city);
        const cityChanged = previousCity !== nextCity;
        if (player.offset && typeof player.offset === 'object') {
            const serverX = this.toFiniteNumber(player.offset.x, me.offset.x);
            const serverY = this.toFiniteNumber(player.offset.y, me.offset.y);
            const diffX = serverX - me.offset.x;
            const diffY = serverY - me.offset.y;
            const diffDistanceSq = (diffX * diffX) + (diffY * diffY);
            const snapThresholdSq = 96 * 96;
            const lerpAlpha = 0.1;
            if (diffDistanceSq > snapThresholdSq) {
                me.offset.x = serverX;
                me.offset.y = serverY;
            } else {
                me.offset.x += diffX * lerpAlpha;
                me.offset.y += diffY * lerpAlpha;
            }
            if (me.lastSafeOffset) {
                me.lastSafeOffset.x = me.offset.x;
                me.lastSafeOffset.y = me.offset.y;
            }
        }
        me.city = nextCity;
        if (cityChanged) {
            const spawn = getCitySpawn(nextCity);
            if (spawn) {
                me.offset.x = spawn.x;
                me.offset.y = spawn.y;
            } else {
                const city = this.game.cities?.[nextCity];
                if (city) {
                    me.offset.x = city.x + 48;
                    me.offset.y = city.y + 100;
                }
            }
            if (me.lastSafeOffset) {
                me.lastSafeOffset.x = me.offset.x;
                me.lastSafeOffset.y = me.offset.y;
            }
        }
        me.isMayor = !!player.isMayor;
        me.health = this.toFiniteNumber(player.health, me.health);
        const serverDirection = Math.round(this.toFiniteNumber(player.direction, me.direction));
        if (Number.isFinite(serverDirection)) {
            const normalizedDirection = ((serverDirection % 32) + 32) % 32;
            const currentDirection = Number.isFinite(me.direction) ? ((Math.round(me.direction) % 32) + 32) % 32 : normalizedDirection;
            const directionDiff = Math.min(
                Math.abs(normalizedDirection - currentDirection),
                32 - Math.abs(normalizedDirection - currentDirection)
            );
            if (directionDiff > 4) {
                me.direction = normalizedDirection;
            }
        }
        if (player.sequence !== undefined) {
            me.sequence = player.sequence;
        }
    }

    normalisePlayerPayload(payload) {
        const data = this.safeParse(payload);
        if (!data || typeof data !== 'object') {
            return null;
        }

        const player = Object.assign({}, data);
        if (!player.id) {
            if (payload && payload.id) {
                player.id = payload.id;
            } else {
                return null;
            }
        }

        const offset = (player.offset && typeof player.offset === 'object') ? player.offset : {};
        player.offset = {
            x: this.toFiniteNumber(offset.x, 0),
            y: this.toFiniteNumber(offset.y, 0)
        };
        player.city = this.toFiniteNumber(player.city, 0);
        player.isMayor = !!player.isMayor;
        const healthValue = this.toFiniteNumber(player.health, this.game?.player?.health ?? 0);
        player.health = Number.isFinite(healthValue) ? Math.max(0, healthValue) : 0;
        const directionValue = this.toFiniteNumber(player.direction, 0);
        if (Number.isFinite(directionValue)) {
            player.direction = ((Math.round(directionValue) % 32) + 32) % 32;
        } else {
            player.direction = 0;
        }
        const turningValue = this.toFiniteNumber(player.isTurning, 0);
        player.isTurning = Math.max(-1, Math.min(1, Math.round(Number.isFinite(turningValue) ? turningValue : 0)));
        const movingValue = this.toFiniteNumber(player.isMoving, 0);
        if (!Number.isFinite(movingValue)) {
            player.isMoving = 0;
        } else if (movingValue > 1) {
            player.isMoving = 1;
        } else if (movingValue < -1) {
            player.isMoving = -1;
        } else {
            player.isMoving = movingValue;
        }
        player.sequence = Math.max(0, Math.round(this.toFiniteNumber(player.sequence, 0)));

        return player;
    }

    normaliseHazardPayload(payload) {
        const data = this.safeParse(payload);
        if (!data || typeof data !== 'object' || !data.id) {
            return null;
        }
        return {
            id: data.id,
            type: data.type,
            x: this.toFiniteNumber(data.x, 0),
            y: this.toFiniteNumber(data.y, 0),
            ownerId: data.ownerId ?? null,
            teamId: data.teamId ?? null,
            active: !!data.active,
            armed: !!data.armed,
            detonateAt: data.detonateAt ?? null,
            reason: data.reason ?? null
        };
    }

    applyHealthUpdate(update) {
        const healthValue = this.toFiniteNumber(update.health, null);
        if (!update.id || healthValue === null) {
            return;
        }
        const myId = this.io?.id;
        if (myId && update.id === myId) {
            this.game.player.health = Math.max(0, healthValue);
            return;
        }
        if (!this.game.otherPlayers[update.id]) {
            this.game.otherPlayers[update.id] = { id: update.id };
        }
        this.game.otherPlayers[update.id].health = Math.max(0, healthValue);
    }

    safeParse(payload) {
        if (payload === null || payload === undefined) {
            return null;
        }
        if (typeof payload !== 'string') {
            return payload;
        }
        try {
            return JSON.parse(payload);
        } catch (error) {
            console.warn("Failed to parse payload from server", error);
            return null;
        }
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
        if (fallback !== undefined) {
            return fallback;
        }
        return 0;
    }


}


export default SocketListener;
