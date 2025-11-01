"use strict";

const { TILE_SIZE, DAMAGE_MINE, DAMAGE_BOMB, BOMB_TIMER_MS, BOMB_EXPLOSION_TILE_RADIUS, TIMER_DFG } = require("../gameplay/constants");
const { rectangleCollision } = require("../gameplay/geometry");

const HAZARD_TYPES = {
    MINE: "mine",
    BOMB: "bomb",
    DFG: "dfg"
};

const ITEM_TYPE_MAP = {
    3: HAZARD_TYPES.BOMB,
    4: HAZARD_TYPES.MINE,
    7: HAZARD_TYPES.DFG
};

class HazardManager {

    constructor(game, playerFactory) {
        this.game = game;
        this.playerFactory = playerFactory;
        this.io = null;
        this.hazards = new Map();
        this.pendingIdsBySocket = new Map();
    }

    setIo(io) {
        this.io = io;
    }

    sendSnapshot(socket) {
        if (!socket) {
            return;
        }
        for (const hazard of this.hazards.values()) {
            socket.emit('hazard:spawn', JSON.stringify({
                id: hazard.id,
                type: hazard.type,
                x: hazard.x,
                y: hazard.y,
                ownerId: hazard.ownerId,
                teamId: hazard.teamId,
                active: !!hazard.active,
                armed: !!hazard.armed,
                detonateAt: hazard.detonateAt || null
            }));
        }
    }

    parsePayload(payload) {
        if (payload === null || payload === undefined) {
            return null;
        }
        if (typeof payload === "string") {
            try {
                return JSON.parse(payload);
            } catch (error) {
                return null;
            }
        }
        if (typeof payload === "object") {
            return payload;
        }
        return null;
    }

    getHazardTypeFromItem(type) {
        return ITEM_TYPE_MAP[type] || null;
    }

    sanitizeSpawn(socket, payload) {
        if (!payload) {
            return null;
        }
        const type = this.getHazardTypeFromItem(payload.type ?? payload.itemType);
        if (!type) {
            return null;
        }
        const x = Number(payload.x);
        const y = Number(payload.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }
        const hazard = {
            id: (typeof payload.id === "string" && payload.id.length > 0) ? payload.id : `${socket.id}_${Date.now()}`,
            ownerId: socket.id,
            teamId: this.playerFactory?.getPlayerTeam(socket.id) ?? null,
            type,
            x,
            y,
            createdAt: Date.now(),
            active: type === HAZARD_TYPES.MINE,
            armed: type === HAZARD_TYPES.MINE,
            detonateAt: null
        };

        if (type === HAZARD_TYPES.BOMB) {
            const armed = payload.armed === true;
            hazard.armed = armed;
            hazard.active = armed;
            hazard.detonateAt = armed ? hazard.createdAt + BOMB_TIMER_MS : null;
        } else if (type === HAZARD_TYPES.DFG) {
            hazard.active = true;
            hazard.armed = true;
        }
        return hazard;
    }

    spawnHazard(socket, payload) {
        const parsed = this.parsePayload(payload);
        if (!parsed) {
            return null;
        }
        const hazard = this.sanitizeSpawn(socket, parsed);
        if (!hazard) {
            return null;
        }

        if (this.hazards.has(hazard.id)) {
            return this.hazards.get(hazard.id);
        }

        this.hazards.set(hazard.id, hazard);

        if (!this.pendingIdsBySocket.has(socket.id)) {
            this.pendingIdsBySocket.set(socket.id, new Set());
        }
        this.pendingIdsBySocket.get(socket.id).add(hazard.id);

        this.broadcastHazard("hazard:spawn", hazard);
        return hazard;
    }

    spawnSystemHazard(payload) {
        if (!payload) {
            return null;
        }
        const typeInput = payload.type ?? payload.hazardType ?? payload.itemType;
        let type = null;
        if (typeof typeInput === "string") {
            const normalised = typeInput.toLowerCase();
            if (normalised === HAZARD_TYPES.MINE) {
                type = HAZARD_TYPES.MINE;
            } else if (normalised === HAZARD_TYPES.BOMB) {
                type = HAZARD_TYPES.BOMB;
            } else if (normalised === HAZARD_TYPES.DFG) {
                type = HAZARD_TYPES.DFG;
            }
        } else {
            type = this.getHazardTypeFromItem(typeInput);
        }
        if (!type) {
            return null;
        }
        const x = Number(payload.x);
        const y = Number(payload.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }
        const hazard = {
            id: (typeof payload.id === "string" && payload.id.length > 0)
                ? payload.id
                : `system_${type}_${Date.now()}_${Math.random().toString(16).slice(-6)}`,
            ownerId: payload.ownerId || 'system',
            teamId: payload.teamId ?? null,
            type,
            x,
            y,
            createdAt: Date.now(),
            active: type === HAZARD_TYPES.MINE ? true : !!payload.active,
            armed: type === HAZARD_TYPES.MINE ? true : !!payload.armed,
            detonateAt: null
        };

        if (type === HAZARD_TYPES.BOMB) {
            const armed = hazard.armed;
            hazard.active = armed;
            hazard.detonateAt = armed ? hazard.createdAt + BOMB_TIMER_MS : null;
        } else if (type === HAZARD_TYPES.DFG) {
            hazard.active = true;
            hazard.armed = true;
        }

        if (this.hazards.has(hazard.id)) {
            return this.hazards.get(hazard.id);
        }

        this.hazards.set(hazard.id, hazard);
        this.broadcastHazard("hazard:spawn", hazard);
        return hazard;
    }

    handleArm(socket, payload) {
        if (!payload || !payload.id) {
            return;
        }
        const hazard = this.hazards.get(payload.id);
        if (!hazard || hazard.ownerId !== socket.id) {
            return;
        }

        if (hazard.type !== HAZARD_TYPES.BOMB) {
            return;
        }

        const armed = !!payload.armed;
        hazard.armed = armed;
        hazard.active = armed;
        hazard.detonateAt = armed ? Date.now() + BOMB_TIMER_MS : null;
        this.broadcastHazard("hazard:update", hazard);
    }

    handleRemove(socket, payload) {
        if (!payload || !payload.id) {
            return;
        }
        const hazard = this.hazards.get(payload.id);
        if (!hazard || hazard.ownerId !== socket.id) {
            return;
        }
        this.removeHazard(payload.id, "owner_removed");
    }

    onDisconnect(socketId) {
        const owned = Array.from(this.hazards.values()).filter((hazard) => hazard.ownerId === socketId);
        owned.forEach((hazard) => {
            this.removeHazard(hazard.id, "owner_disconnected");
        });
        this.pendingIdsBySocket.delete(socketId);
    }

    removeHazard(id, reason) {
        const hazard = this.hazards.get(id);
        if (!hazard) {
            return;
        }
        this.hazards.delete(id);
        const payload = Object.assign({ reason }, hazard);
        this.broadcastHazard("hazard:remove", payload);
    }

    broadcastHazard(event, hazard) {
        if (!this.io) {
            return;
        }
        const payload = {
            id: hazard.id,
            type: hazard.type,
            x: hazard.x,
            y: hazard.y,
            ownerId: hazard.ownerId,
            teamId: hazard.teamId,
            active: !!hazard.active,
            armed: !!hazard.armed,
            detonateAt: hazard.detonateAt || null,
            reason: hazard.reason || undefined
        };
        this.io.emit(event, JSON.stringify(payload));
    }

    update(deltaMs) {
        if (this.hazards.size === 0) {
            return;
        }

        const now = Date.now();

        for (const hazard of Array.from(this.hazards.values())) {
            if (hazard.type === HAZARD_TYPES.BOMB) {
                this.updateBomb(hazard, now);
            } else if (hazard.type === HAZARD_TYPES.MINE) {
                this.updateMine(hazard);
            } else if (hazard.type === HAZARD_TYPES.DFG) {
                this.updateDFG(hazard);
            }
        }
    }

    updateMine(hazard) {
        if (!hazard.active) {
            return;
        }

        const players = this.game.players;
        const bulletRect = {
            x: hazard.x,
            y: hazard.y,
            w: TILE_SIZE,
            h: TILE_SIZE
        };

        for (const [socketId, player] of Object.entries(players)) {
            if (!this.shouldDamagePlayer(hazard, socketId, player)) {
                continue;
            }
            if (this.playerIntersectsRect(player, bulletRect)) {
                this.applyDamage(socketId, DAMAGE_MINE, {
                    type: hazard.type,
                    hazardId: hazard.id,
                    ownerId: hazard.ownerId
                });
                this.removeHazard(hazard.id, "mine_triggered");
                break;
            }
        }
    }

    updateBomb(hazard, now) {
        if (!hazard.armed || !hazard.active) {
            return;
        }

        if (hazard.detonateAt && now >= hazard.detonateAt) {
            this.detonateBomb(hazard);
        }
    }

    detonateBomb(hazard) {
        const centerTileX = Math.floor((hazard.x + TILE_SIZE / 2) / TILE_SIZE);
        const centerTileY = Math.floor((hazard.y + TILE_SIZE / 2) / TILE_SIZE);

        for (const [socketId, player] of Object.entries(this.game.players)) {
            if (!this.shouldDamagePlayer(hazard, socketId, player)) {
                continue;
            }
            const playerTileX = Math.floor((player.offset?.x ?? 0 + TILE_SIZE / 2) / TILE_SIZE);
            const playerTileY = Math.floor((player.offset?.y ?? 0 + TILE_SIZE / 2) / TILE_SIZE);
            if (Math.abs(playerTileX - centerTileX) <= BOMB_EXPLOSION_TILE_RADIUS &&
                Math.abs(playerTileY - centerTileY) <= BOMB_EXPLOSION_TILE_RADIUS) {
                this.applyDamage(socketId, DAMAGE_BOMB, {
                    type: hazard.type,
                    hazardId: hazard.id,
                    ownerId: hazard.ownerId
                });
            }
        }

        this.removeHazard(hazard.id, "bomb_detonated");
    }

    shouldDamagePlayer(hazard, socketId, player) {
        if (!player || !player.offset) {
            return false;
        }
        if (socketId === hazard.ownerId) {
            return false;
        }
        const hazardTeam = hazard.teamId ?? null;
        const playerTeam = this.playerFactory?.getPlayerTeam(socketId) ?? null;
        if (hazardTeam !== null && hazardTeam === playerTeam) {
            return false;
        }
        return true;
    }

    updateDFG(hazard) {
        if (!hazard.active) {
            return;
        }

        const players = this.game.players;
        const hazardRect = {
            x: hazard.x,
            y: hazard.y,
            w: TILE_SIZE,
            h: TILE_SIZE
        };

        for (const [socketId, player] of Object.entries(players)) {
            if (!this.shouldDamagePlayer(hazard, socketId, player)) {
                continue;
            }
            if (this.playerIntersectsRect(player, hazardRect)) {
                if (this.playerFactory && typeof this.playerFactory.applyFreeze === 'function') {
                    this.playerFactory.applyFreeze(socketId, TIMER_DFG, {
                        source: 'dfg',
                        hazardId: hazard.id,
                        ownerId: hazard.ownerId
                    });
                }
                hazard.triggeredBy = player.id;
                hazard.triggeredTeam = this.playerFactory?.getPlayerTeam(socketId) ?? null;
                this.removeHazard(hazard.id, "dfg_triggered");
                break;
            }
        }
    }

    playerIntersectsRect(player, rect) {
        const px = player.offset?.x ?? 0;
        const py = player.offset?.y ?? 0;
        const playerRect = {
            x: px + 8,
            y: py + 8,
            w: TILE_SIZE - 16,
            h: TILE_SIZE - 16
        };
        return rectangleCollision(playerRect, rect);
    }

    applyDamage(socketId, amount, meta) {
        if (!this.playerFactory) {
            return;
        }
        this.playerFactory.applyDamage(socketId, amount, meta);
    }

    removeHazardsForTeam(teamId, reason = "city_destroyed") {
        if (teamId === null || teamId === undefined) {
            return 0;
        }
        let removed = 0;
        for (const hazard of Array.from(this.hazards.values())) {
            if ((hazard.teamId ?? null) !== teamId) {
                continue;
            }
            this.removeHazard(hazard.id, reason);
            removed += 1;
        }
        return removed;
    }
}

module.exports = HazardManager;
