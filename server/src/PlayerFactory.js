/*jslint node: true */
"use strict";

var Player = require("./Player");
var PlayerStateValidator = require("./validation/PlayerStateValidator");

var debug = require('debug')('BattleCity:PlayerFactory');
var { TILE_SIZE, MAX_HEALTH, TIMER_CLOAK, TIMER_DFG } = require('./gameplay/constants');
var citySpawns = require('../../shared/citySpawns.json');

const HALF_TILE = TILE_SIZE / 2;
const COMMAND_CENTER_WIDTH_TILES = 3;
const COMMAND_CENTER_HEIGHT_TILES = 2;
const COMMAND_CENTER_FRONT_OFFSET = TILE_SIZE / 2;
const PLAYER_SPRITE_SIZE = 48;
const PLAYER_SPRITE_HALF = PLAYER_SPRITE_SIZE / 2;
const PLAYER_SPAWN_ADJUST_X = 6.5;
const PLAYER_SPAWN_ADJUST_Y = 5.5;

const toFiniteNumber = (value, fallback = null) => {
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
};

const normaliseCityIdValue = (value, fallback = null) => {
    const numeric = toFiniteNumber(value, fallback);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(0, Math.floor(numeric));
};

const normaliseRoleValue = (value) => {
    if (!value) {
        return null;
    }
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        return null;
    }
    if (trimmed === 'mayor' || trimmed === 'm') {
        return 'mayor';
    }
    if (trimmed === 'recruit' || trimmed === 'commando' || trimmed === 'r') {
        return 'recruit';
    }
    if (trimmed === 'auto' || trimmed === 'any') {
        return 'auto';
    }
    return null;
};

const shortenId = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }
    if (value.length <= 8) {
        return value;
    }
    return `${value.slice(0, 4)}...${value.slice(-2)}`;
};

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
        this.lobbyVersion = 0;
    }

    listen(io) {

        debug("Starting Server");
        this.io = io;

        io.on("connection", (socket) => {

            this.emitLobbySnapshot(socket);

            socket.on('lobby:refresh', () => {
                this.emitLobbySnapshot(socket);
            });

            socket.on('enter_game', (player) => {
                debug("Player entered game " + socket.id);
                const existing = this.game.players[socket.id];
                if (existing) {
                    this.releaseSlot(existing);
                    delete this.game.players[socket.id];
                }

                const parsedPlayer = this.safeParse(player);
                const preferences = this.extractAssignmentPreferences(parsedPlayer);
                const assignment = this.assignCityAndRole(socket.id, preferences);
                if (assignment.overflow) {
                    debug(`No available city slots for player ${socket.id}, rejecting entry`);
                    socket.emit('player:rejected', JSON.stringify({
                        reasons: ['cities_full'],
                        flags: ['wait_for_slot']
                    }));
                    socket.emit('lobby:denied', JSON.stringify({
                        reason: 'cities_full',
                        requestedCity: preferences.city,
                        requestedRole: preferences.role
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

                debug(`Assigned player ${socket.id} -> city ${assignment.city} (${assignment.isMayor ? 'mayor' : 'recruit'})${assignment.overflow ? ' [overflow]' : ''} (${assignment.source || 'auto'})`);

                if (preferences.requested && assignment.source === 'fallback') {
                    socket.emit('lobby:denied', JSON.stringify({
                        reason: 'slot_unavailable',
                        requestedCity: preferences.city,
                        requestedRole: preferences.role
                    }));
                }

                socket.emit('lobby:assignment', JSON.stringify({
                    city: assignment.city,
                    role: assignment.isMayor ? 'mayor' : 'recruit',
                    source: assignment.source
                }));

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

            socket.on('item:use', (payload) => {
                this.handleItemUse(socket, payload);
            });

            socket.on('disconnect', () => {
                var removedPlayer = this.game.players[socket.id];
                if (!removedPlayer) {
                    return;
                }
                if (this.game.buildingFactory &&
                    this.game.buildingFactory.cityManager &&
                    typeof this.game.buildingFactory.cityManager.releaseOrbHolder === 'function') {
                    this.game.buildingFactory.cityManager.releaseOrbHolder(socket.id, { consume: true });
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

    getPlayer(socketId) {
        if (!socketId) {
            return null;
        }
        return this.game.players[socketId] || null;
    }

    getSocket(socketId) {
        const sockets = this.io && this.io.sockets && this.io.sockets.sockets;
        if (!sockets) {
            return null;
        }
        if (typeof sockets.get === 'function') {
            return sockets.get(socketId) || null;
        }
        if (typeof sockets[socketId] !== 'undefined') {
            return sockets[socketId];
        }
        return null;
    }

    evictCityPlayers(cityId, options = {}) {
        const numericCity = Number(cityId);
        if (!Number.isFinite(numericCity)) {
            return 0;
        }

        const toEvict = [];
        Object.entries(this.game.players).forEach(([socketId, player]) => {
            if (!player) {
                return;
            }
            const playerCity = Number(player.city);
            if (!Number.isFinite(playerCity) || playerCity !== numericCity) {
                return;
            }
            toEvict.push({ socketId, player });
        });

        if (!toEvict.length) {
            return 0;
        }

        const reason = options.reason || 'orb';
        const attackerCity = options.attackerCity ?? null;
        const points = options.points ?? null;

        toEvict.forEach(({ socketId, player }) => {
            const socket = (this.io && this.io.sockets && this.io.sockets.sockets)
                ? this.io.sockets.sockets.get(socketId)
                : null;

            if (socket) {
                socket.emit('lobby:evicted', JSON.stringify({
                    city: numericCity,
                    reason,
                    attackerCity,
                    points
                }));
            }

            this.releaseSlot(player);
            delete this.game.players[socketId];
            if (this.io) {
                this.io.emit('player:removed', JSON.stringify({ id: player.id }));
            }
        });

        return toEvict.length;
    }

    applyDamage(socketId, amount, meta) {
        const player = this.game.players[socketId];
        if (!player) {
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return;
        }

        if (player.isCloaked) {
            this.clearCloak(socketId);
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
            this.handlePlayerDeath(socketId, player, meta);
        }
    }

    handleItemUse(socket, payload) {
        if (!socket) {
            return;
        }
        const data = this.safeParse(payload);
        if (!data) {
            return;
        }
        const typeRaw = data.type;
        const type = (typeof typeRaw === 'string') ? typeRaw.trim().toLowerCase() : typeRaw;
        if (!type) {
            return;
        }
        const socketId = socket.id;
        if (!this.game.players[socketId]) {
            return;
        }

        switch (type) {
            case 'medkit':
                this.applyHealing(socketId, MAX_HEALTH, { type: 'medkit', iconId: data.iconId ?? null });
                break;
            case 'cloak':
                this.applyCloak(socketId, Number.isFinite(data.duration) ? data.duration : TIMER_CLOAK);
                break;
            default:
                break;
        }
    }

    applyHealing(socketId, targetHealth, meta) {
        const player = this.game.players[socketId];
        if (!player) {
            return;
        }
        const previousHealth = player.health;
        const resolvedHealth = Number.isFinite(targetHealth) ? targetHealth : MAX_HEALTH;
        const clamped = Math.min(MAX_HEALTH, Math.max(previousHealth, Math.floor(resolvedHealth)));
        if (clamped <= previousHealth) {
            return;
        }
        player.health = clamped;
        if (this.io) {
            this.io.emit('player:health', JSON.stringify({
                id: player.id,
                health: player.health,
                previousHealth,
                source: meta || null
            }));
        }
    }

    applyCloak(socketId, durationMs = TIMER_CLOAK) {
        const player = this.game.players[socketId];
        if (!player) {
            return;
        }
        const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : TIMER_CLOAK;
        player.isCloaked = true;
        player.cloakExpiresAt = Date.now() + duration;
        this.emitStatusUpdate(player);
    }

    clearCloak(socketId) {
        const player = this.game.players[socketId];
        if (!player || !player.isCloaked) {
            return;
        }
        player.isCloaked = false;
        player.cloakExpiresAt = 0;
        this.emitStatusUpdate(player);
    }

    applyFreeze(socketId, durationMs = TIMER_DFG, options = {}) {
        const player = this.game.players[socketId];
        if (!player) {
            return;
        }
        const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : TIMER_DFG;
        player.isFrozen = true;
        player.frozenUntil = Date.now() + duration;
        player.frozenBy = options.source ?? null;
        this.emitStatusUpdate(player);
    }

    emitStatusUpdate(player, extra = {}) {
        if (!player || !this.io) {
            return;
        }
        const payload = Object.assign({
            id: player.id,
            isCloaked: !!player.isCloaked,
            cloakExpiresAt: player.cloakExpiresAt || 0,
            isFrozen: !!player.isFrozen,
            frozenUntil: player.frozenUntil || 0,
            frozenBy: player.frozenBy || null
        }, extra || {});
        this.io.emit('player:status', JSON.stringify(payload));
    }

    handlePlayerDeath(socketId, player, meta) {
        debug("Player " + socketId + " eliminated by " + JSON.stringify(meta));
        this.clearCloak(socketId);
        if (player.isFrozen) {
            player.isFrozen = false;
            player.frozenUntil = 0;
            player.frozenBy = null;
            this.emitStatusUpdate(player);
        }
        if (this.io) {
            this.io.emit('player:dead', JSON.stringify({
                id: player.id,
                reason: meta || null
            }));
        }

        const socket = this.getSocket(socketId);
        const attackerId = meta && typeof meta === 'object' ? meta.shooterId ?? null : null;
        let attackerCity = null;
        if (attackerId) {
            const attacker = this.game.players[attackerId];
            if (attacker) {
                const attackerCityNumeric = Number(attacker.city);
                if (Number.isFinite(attackerCityNumeric)) {
                    attackerCity = Math.floor(attackerCityNumeric);
                }
            }
        }
        if (attackerCity === null && meta && typeof meta === 'object') {
            const metaTeam = Number(meta.teamId);
            if (Number.isFinite(metaTeam)) {
                attackerCity = Math.floor(metaTeam);
            }
        }
        const playerCityNumeric = Number(player.city);
        const playerCityId = Number.isFinite(playerCityNumeric) ? Math.floor(playerCityNumeric) : null;

        this.releaseSlot(player);
        delete this.game.players[socketId];

        if (this.io) {
            this.io.emit('player:removed', JSON.stringify({ id: player.id }));
        }

        if (socket) {
            socket.emit('lobby:evicted', JSON.stringify({
                city: playerCityId,
                reason: 'death',
                attackerCity,
                points: null
            }));
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

    cycle(now = Date.now()) {
        Object.values(this.game.players).forEach((player) => {
            if (!player) {
                return;
            }
            let statusChanged = false;
            if (player.isCloaked && player.cloakExpiresAt && now >= player.cloakExpiresAt) {
                player.isCloaked = false;
                player.cloakExpiresAt = 0;
                statusChanged = true;
            }
            if (player.isFrozen && player.frozenUntil && now >= player.frozenUntil) {
                player.isFrozen = false;
                player.frozenUntil = 0;
                player.frozenBy = null;
                statusChanged = true;
            }
            if (statusChanged) {
                this.emitStatusUpdate(player);
            }
        });
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

    extractAssignmentPreferences(payload) {
        if (!payload || typeof payload !== 'object') {
            return { city: null, role: null, requested: false };
        }

        const citySources = [
            payload.requestedCity,
            payload.desiredCity,
            payload.cityPreference,
            payload.cityId,
            payload.city
        ];

        if (payload.assignment && typeof payload.assignment === 'object') {
            citySources.push(payload.assignment.cityId);
            citySources.push(payload.assignment.city);
        }

        let city = null;
        for (const source of citySources) {
            const id = normaliseCityIdValue(source, null);
            if (Number.isFinite(id)) {
                city = id;
                break;
            }
        }

        const roleSources = [
            payload.requestedRole,
            payload.desiredRole,
            payload.role
        ];

        if (payload.assignment && typeof payload.assignment === 'object') {
            roleSources.push(payload.assignment.role);
        }

        let role = null;
        for (const source of roleSources) {
            const normalised = normaliseRoleValue(source);
            if (normalised) {
                role = normalised;
                break;
            }
        }

        const requested = (city !== null && city !== undefined) || (role && role !== 'auto');
        return {
            city: city !== null ? city : null,
            role,
            requested
        };
    }

    assignCityAndRole(socketId, preferences) {
        const prefs = preferences || { city: null, role: null, requested: false };
        const cityIds = this.getCityCandidates();
        if (!cityIds.length) {
            return { city: 0, isMayor: false, overflow: true, source: 'auto' };
        }

        const requested = this.resolveRequestedAssignment(prefs, cityIds);
        if (requested) {
            requested.overflow = false;
            requested.source = prefs.requested ? 'requested' : 'auto';
            return requested;
        }

        const assignment = this.assignCityAndRoleAuto(cityIds);
        assignment.source = prefs.requested ? 'fallback' : 'auto';
        return assignment;
    }

    assignCityAndRoleAuto(cityIds) {
        const ids = Array.isArray(cityIds) && cityIds.length ? cityIds : this.getCityCandidates();
        if (!ids.length) {
            return { city: 0, isMayor: false, overflow: true, source: 'auto' };
        }

        const totalCities = ids.length;
        const startIndex = this.cityCursor % totalCities;

        for (let offset = 0; offset < totalCities; offset += 1) {
            const index = (startIndex + offset) % totalCities;
            const cityId = ids[index];
            const state = this.computeCityState(cityId);

            if (state && state.openMayor) {
                this.updateCityCursor(ids, cityId);
                return { city: cityId, isMayor: true, overflow: false };
            }

            if (state && state.openRecruits > 0) {
                this.updateCityCursor(ids, cityId);
                return { city: cityId, isMayor: false, overflow: false };
            }
        }

        const overflowCity = ids[startIndex];
        this.updateCityCursor(ids, overflowCity);
        return { city: overflowCity, isMayor: false, overflow: true };
    }

    resolveRequestedAssignment(preferences, cityIds) {
        if (!preferences) {
            return null;
        }
        const cityId = normaliseCityIdValue(preferences.city, null);
        if (cityId === null || cityId === undefined) {
            return null;
        }
        const ids = Array.isArray(cityIds) ? cityIds : this.getCityCandidates();
        if (!ids.includes(cityId)) {
            return null;
        }
        const state = this.computeCityState(cityId);
        if (!state) {
            return null;
        }

        const desiredRole = normaliseRoleValue(preferences.role);

        if (desiredRole === 'mayor') {
            if (!state.openMayor) {
                return null;
            }
            this.updateCityCursor(ids, cityId);
            return { city: cityId, isMayor: true };
        }

        if (desiredRole === 'recruit') {
            if (state.openRecruits <= 0) {
                return null;
            }
            this.updateCityCursor(ids, cityId);
            return { city: cityId, isMayor: false };
        }

        if (!state.openMayor && state.openRecruits <= 0) {
            return null;
        }

        const assignMayor = state.openMayor;
        this.updateCityCursor(ids, cityId);
        return { city: cityId, isMayor: assignMayor };
    }

    updateCityCursor(cityIds, selectedCityId) {
        const ids = Array.isArray(cityIds) ? cityIds : this.getCityCandidates();
        if (!ids.length) {
            return;
        }
        const index = ids.indexOf(selectedCityId);
        if (index === -1) {
            return;
        }
        this.cityCursor = (index + 1) % ids.length;
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
                if (entry && entry.isFake) {
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

    computeCityState(cityId) {
        const id = normaliseCityIdValue(cityId, null);
        if (id === null || id === undefined) {
            return null;
        }
        const roster = this.ensureCityRoster(id);
        const players = Object.values(this.game.players || {}).filter((player) => normaliseCityIdValue(player && player.city, null) === id);
        const mayorPlayer = players.find((player) => player && player.isMayor);
        const mayorId = mayorPlayer ? mayorPlayer.id : (roster.mayor || null);
        const hasMayor = !!mayorId;
        const playerCount = players.length;
        const capacity = 1 + this.maxRecruitsPerCity;
        const recruitCount = hasMayor ? Math.max(0, playerCount - 1) : playerCount;
        const openMayor = !hasMayor;
        const openRecruits = Math.max(0, capacity - playerCount);
        return {
            cityId: id,
            roster,
            players,
            mayorId,
            playerCount,
            recruitCount,
            openMayor,
            openRecruits,
            capacity
        };
    }

    buildLobbyEntry(cityId) {
        const state = this.computeCityState(cityId);
        if (!state) {
            return null;
        }
        const spawn = this.citySpawns && this.citySpawns[String(state.cityId)];
        const cityState = this.game.cities ? this.game.cities[state.cityId] : null;
        const displayName = (cityState && (cityState.nameOverride || cityState.name))
            || (spawn && spawn.name)
            || `City ${state.cityId + 1}`;
        return {
            id: state.cityId,
            name: displayName,
            mayorId: state.mayorId || null,
            mayorLabel: shortenId(state.mayorId || null),
            playerCount: state.playerCount,
            recruitCount: state.recruitCount,
            capacity: state.capacity,
            openMayor: state.openMayor,
            openRecruits: state.openRecruits,
            hasRecruitVacancy: state.openRecruits > 0,
            maxRecruits: this.maxRecruitsPerCity,
            score: (() => {
                const city = this.game.cities ? this.game.cities[state.cityId] : null;
                return city ? Number(city.score) || 0 : 0;
            })(),
            orbs: (() => {
                const city = this.game.cities ? this.game.cities[state.cityId] : null;
                return city ? Number(city.orbs) || 0 : 0;
            })()
        };
    }

    buildLobbySnapshot() {
        const cityIds = this.getCityCandidates();
        const entries = cityIds.map((id) => this.buildLobbyEntry(id)).filter((entry) => !!entry);
        return {
            cities: entries,
            maxRecruitsPerCity: this.maxRecruitsPerCity,
            updatedAt: Date.now()
        };
    }

    emitLobbySnapshot(targetSocket) {
        const snapshot = this.buildLobbySnapshot();
        this.lobbyVersion += 1;
        snapshot.version = this.lobbyVersion;
        if (targetSocket) {
            targetSocket.emit('lobby:snapshot', JSON.stringify(snapshot));
            return;
        }
        if (this.io) {
            this.io.emit('lobby:update', JSON.stringify(snapshot));
        }
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
        this.emitLobbySnapshot();
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
        this.emitLobbySnapshot();
    }
}


module.exports = PlayerFactory;
