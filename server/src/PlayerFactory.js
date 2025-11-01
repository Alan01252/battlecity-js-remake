/*jslint node: true */
"use strict";

var Player = require("./Player");
var PlayerStateValidator = require("./validation/PlayerStateValidator");

var debug = require('debug')('BattleCity:PlayerFactory');
var { TILE_SIZE } = require('./gameplay/constants');
var citySpawns = require('../../shared/citySpawns.json');

const HALF_TILE = TILE_SIZE / 2;
const COMMAND_CENTER_WIDTH_TILES = 3;
const COMMAND_CENTER_HEIGHT_TILES = 2;
const COMMAND_CENTER_FRONT_OFFSET = TILE_SIZE / 2;
const PLAYER_SPRITE_SIZE = 48;
const PLAYER_SPRITE_HALF = PLAYER_SPRITE_SIZE / 2;
const PLAYER_SPAWN_ADJUST_X = 6.5;
const PLAYER_SPAWN_ADJUST_Y = 5.5;

class PlayerFactory {

    constructor(game) {
        this.game = game;
        this.validator = new PlayerStateValidator();
        this.io = null;
        this.cityRosters = new Map();
        this.cityCursor = 0;
        this.maxRecruitsPerCity = 3;
        const spawnKeys = Object.keys(citySpawns || {})
            .map((key) => Number(key))
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => a - b);
        this.defaultCityPool = spawnKeys.length ? spawnKeys : [0, 1];
        this.citySpawns = citySpawns || {};
    }

    listen(io) {

        debug("Starting Server");
        this.io = io;

        io.on("connection", (socket) => {


            socket.on('enter_game', (player) => {
                debug("Player entered game " + socket.id);
                const existing = this.game.players[socket.id];
                if (existing) {
                    this.releaseSlot(existing);
                    delete this.game.players[socket.id];
                }

                const parsedPlayer = this.safeParse(player);
                const assignment = this.assignCityAndRole(socket.id);
                if (assignment.overflow) {
                    debug(`No available city slots for player ${socket.id}, rejecting entry`);
                    socket.emit('player:rejected', JSON.stringify({
                        reasons: ['cities_full'],
                        flags: ['wait_for_slot']
                    }));
                    return;
                }
                const spawn = this.getSpawnForCity(assignment.city);

                const normalized = Object.assign({}, parsedPlayer, {
                    city: assignment.city,
                    isMayor: assignment.isMayor
                });
                if (spawn) {
                    normalized.offset = {
                        x: spawn.x,
                        y: spawn.y
                    };
                }
                var validation = this.validator.initializePlayerState(normalized, { now: Date.now() });
                validation.sanitized.city = assignment.city;
                validation.sanitized.isMayor = assignment.isMayor;
                if (spawn) {
                    validation.sanitized.offset = {
                        x: spawn.x,
                        y: spawn.y
                    };
                }

                var newPlayer = new Player(socket.id, validation.sanitized, validation.timestamp);
                newPlayer.city = assignment.city;
                newPlayer.isMayor = assignment.isMayor;
                if (spawn) {
                    newPlayer.offset.x = spawn.x;
                    newPlayer.offset.y = spawn.y;
                }
                this.game.players[socket.id] = newPlayer;
                this.registerAssignment(newPlayer, assignment);

                debug(`Assigned player ${socket.id} -> city ${assignment.city} (${assignment.isMayor ? 'mayor' : 'recruit'})${assignment.overflow ? ' [overflow]' : ''}`);

                socket.emit('player', JSON.stringify(newPlayer));
                socket.emit('players:snapshot', JSON.stringify(this.serializePlayers(socket.id)));
                io.emit('enter_game', JSON.stringify(newPlayer));
                io.emit('player', JSON.stringify(newPlayer));
            });

            socket.on('player', (player) => {
                var existingPlayer = this.game.players[socket.id];
                if (!existingPlayer) {
                    return;
                }

                var parsedPlayer = this.safeParse(player);
                var validation = this.validator.validatePlayerUpdate(existingPlayer, parsedPlayer, { now: Date.now() });
                if (!validation) {
                    return;
                }

                if (validation.sanitized) {
                    validation.sanitized.city = existingPlayer.city;
                    validation.sanitized.isMayor = existingPlayer.isMayor;
                }

                if (existingPlayer.sequence !== undefined &&
                    validation.sanitized &&
                    validation.sanitized.sequence !== undefined &&
                    validation.sanitized.sequence <= existingPlayer.sequence) {
                    debug("Ignoring out-of-order update from " + socket.id + " sequence " + validation.sanitized.sequence);
                    return;
                }

                if (!validation.valid) {
                    debug("Rejected player update for " + socket.id + " reasons: " + validation.reasons.join(","));
                    socket.emit('player:rejected', JSON.stringify({
                        reasons: validation.reasons,
                        flags: validation.flags,
                        player: existingPlayer
                    }));
                    socket.emit('player', JSON.stringify(existingPlayer));
                    return;
                }

                existingPlayer.update(validation.sanitized, validation.timestamp);
                io.emit('player', JSON.stringify(existingPlayer));
            });

            socket.on('disconnect', () => {
                var removedPlayer = this.game.players[socket.id];
                if (!removedPlayer) {
                    return;
                }
                this.releaseSlot(removedPlayer);
                delete this.game.players[socket.id];
                io.emit('player:removed', JSON.stringify({id: removedPlayer.id}));
            });
        });
    }

    getPlayerTeam(socketId) {
        const player = this.game.players[socketId];
        if (!player) {
            return null;
        }
        if (Number.isFinite(player.city)) {
            return player.city;
        }
        return null;
    }

    applyDamage(socketId, amount, meta) {
        const player = this.game.players[socketId];
        if (!player) {
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return;
        }

        const previousHealth = player.health;
        player.health = Math.max(0, previousHealth - Math.floor(amount));

        const payload = {
            id: player.id,
            health: player.health,
            previousHealth: previousHealth,
            source: meta || null
        };

        if (this.io) {
            this.io.emit('player:health', JSON.stringify(payload));
        }

        if (player.health <= 0) {
            debug("Player " + socketId + " eliminated by " + JSON.stringify(meta));
            if (this.io) {
                this.io.emit('player:dead', JSON.stringify({
                    id: player.id,
                    reason: meta || null
                }));
            }
        }
    }

    safeParse(payload) {
        if (!payload) {
            return {};
        }
        if (typeof payload !== 'string') {
            return payload;
        }
        try {
            return JSON.parse(payload);
        } catch (error) {
            debug("Failed to parse incoming player payload: " + error.message);
            return {};
        }
    }

    serializePlayers(excludeId) {
        var players = [];
        Object.keys(this.game.players).forEach((id) => {
            if (excludeId && id === excludeId) {
                return;
            }
            var player = this.game.players[id];
            if (player) {
                players.push(player);
            }
        });
        return players;
    }

    getSpawnForCity(cityId) {
        const numeric = Number(cityId);
        const computeFallbackSpawn = (name) => {
            if (!Number.isFinite(numeric)) {
                return {
                    x: HALF_TILE,
                    y: HALF_TILE,
                    name: name || null
                };
            }
            const tileX = 479 - ((numeric % 8) * 64);
            const tileY = 479 - (Math.floor(numeric / 8) * 64);
            const baseX = tileX * TILE_SIZE;
            const baseY = tileY * TILE_SIZE;
            const centerX = baseX + (COMMAND_CENTER_WIDTH_TILES * TILE_SIZE) / 2;
            const centerY = baseY + (COMMAND_CENTER_HEIGHT_TILES * TILE_SIZE) + COMMAND_CENTER_FRONT_OFFSET;
            return {
                x: centerX - PLAYER_SPRITE_HALF - PLAYER_SPAWN_ADJUST_X,
                y: centerY - PLAYER_SPRITE_HALF - PLAYER_SPAWN_ADJUST_Y,
                name: name || null
            };
        };

        if (!Number.isFinite(numeric)) {
            return computeFallbackSpawn(null);
        }

        const key = String(Math.max(0, Math.floor(numeric)));
        const entry = this.citySpawns && this.citySpawns[key];
        if (entry && typeof entry === 'object') {
            const pixelX = Number(entry.pixelX);
            const pixelY = Number(entry.pixelY);
            const tileX = Number(entry.tileX);
            const tileY = Number(entry.tileY);
            const hasPixelX = Number.isFinite(pixelX);
            const hasPixelY = Number.isFinite(pixelY);
            const hasTileX = Number.isFinite(tileX);
            const hasTileY = Number.isFinite(tileY);

            if (hasPixelX && hasPixelY) {
                return {
                    x: pixelX,
                    y: pixelY,
                    name: entry.name || null
                };
            }

            if (hasTileX && hasTileY) {
                const baseX = tileX * TILE_SIZE;
                const baseY = tileY * TILE_SIZE;
                const centerX = baseX + (COMMAND_CENTER_WIDTH_TILES * TILE_SIZE) / 2;
                const centerY = baseY + (COMMAND_CENTER_HEIGHT_TILES * TILE_SIZE) + COMMAND_CENTER_FRONT_OFFSET;
                return {
                    x: centerX - PLAYER_SPRITE_HALF - PLAYER_SPAWN_ADJUST_X,
                    y: centerY - PLAYER_SPRITE_HALF - PLAYER_SPAWN_ADJUST_Y,
                    name: entry.name || null
                };
            }

            return computeFallbackSpawn(entry.name || null);
        }

        return computeFallbackSpawn(null);
    }

    assignCityAndRole(socketId) {
        const cityIds = this.getCityCandidates();
        if (!cityIds.length) {
            return { city: 0, isMayor: false, overflow: true };
        }

        const totalCities = cityIds.length;
        const startIndex = this.cityCursor % totalCities;
        const maxPerCity = 1 + this.maxRecruitsPerCity;

        for (let offset = 0; offset < totalCities; offset += 1) {
            const index = (startIndex + offset) % totalCities;
            const cityId = cityIds[index];
            const roster = this.ensureCityRoster(cityId);
            const rosterCount = roster.recruits.length + (roster.mayor ? 1 : 0);

            if (!roster.mayor) {
                this.cityCursor = (index + 1) % totalCities;
                return { city: cityId, isMayor: true, overflow: false };
            }

            if (rosterCount < maxPerCity) {
                this.cityCursor = (index + 1) % totalCities;
                return { city: cityId, isMayor: false, overflow: false };
            }
        }

        const overflowCity = cityIds[startIndex];
        this.cityCursor = (startIndex + 1) % totalCities;
        return { city: overflowCity, isMayor: false, overflow: true };
    }

    getCityCandidates() {
        const candidates = [];
        const cityList = this.game && Array.isArray(this.game.cities) ? this.game.cities : null;

        if (cityList) {
            for (let index = 0; index < cityList.length; index += 1) {
                const entry = cityList[index];
                if (!entry && entry !== 0) {
                    continue;
                }
                const id = Number.isFinite(entry?.id) ? entry.id : index;
                if (!candidates.includes(id)) {
                    candidates.push(id);
                }
            }
        }

        if (!candidates.length) {
            return this.defaultCityPool.slice();
        }

        candidates.sort((a, b) => a - b);
        return candidates;
    }

    ensureCityRoster(cityId) {
        const id = Number.isFinite(cityId) ? cityId : 0;
        if (!this.cityRosters.has(id)) {
            this.cityRosters.set(id, {
                mayor: null,
                recruits: []
            });
        }
        return this.cityRosters.get(id);
    }

    registerAssignment(player, assignment) {
        if (!player) {
            return;
        }
        const roster = this.ensureCityRoster(player.city);

        if (assignment.isMayor) {
            roster.mayor = player.id;
            roster.recruits = roster.recruits.filter((id) => id !== player.id);
        } else if (!assignment.overflow) {
            if (!roster.recruits.includes(player.id)) {
                roster.recruits.push(player.id);
            }
        }
    }

    releaseSlot(player) {
        if (!player) {
            return;
        }

        const roster = this.cityRosters.get(player.city);
        if (!roster) {
            return;
        }

        if (roster.mayor === player.id) {
            roster.mayor = null;
            const promotedId = roster.recruits.shift();
            if (promotedId) {
                roster.mayor = promotedId;
                const promotedPlayer = this.game.players[promotedId];
                if (promotedPlayer) {
                    promotedPlayer.isMayor = true;
                    if (this.io) {
                        this.io.emit('player', JSON.stringify(promotedPlayer));
                    }
                }
            }
        } else {
            roster.recruits = roster.recruits.filter((id) => id !== player.id);
        }
    }
}


module.exports = PlayerFactory;
