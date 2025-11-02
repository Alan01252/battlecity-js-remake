#!/usr/bin/env node
"use strict";

const { io } = require("socket.io-client");
const path = require("path");
const { loadMapData } = require("../server/src/utils/mapLoader");
const {
    TILE_SIZE,
    MAX_HEALTH,
    PLAYER_HITBOX_GAP
} = require("../server/src/gameplay/constants");
const citySpawns = require("../shared/citySpawns.json");

const MAP_SIZE_TILES = 512;
const MAP_PIXEL_SIZE = MAP_SIZE_TILES * TILE_SIZE;
const PLAYER_RECT_SIZE = TILE_SIZE - (PLAYER_HITBOX_GAP * 2);
const BLOCKING_TILE_VALUES = new Set([1, 2, 3]);
const DEFAULT_SERVER_URL = process.env.BATTLECITY_SERVER || "http://localhost:8021";
const DEFAULT_STEP_PX = 28;
const STEP_PER_TICK_PX = Number.isFinite(Number(process.env.BOT_STEP_PX))
    ? Number(process.env.BOT_STEP_PX)
    : DEFAULT_STEP_PX;
const TICK_INTERVAL_MS = Number(process.env.BOT_TICK_MS) || 120;
const TARGET_RADIUS_TILES = 10;
const STALL_TIMEOUT_MS = 2000;
const TARGET_REACH_RADIUS_PX = TILE_SIZE * 0.75;
const PATH_JITTER_PX = TILE_SIZE * 0.18;

const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) {
        return min;
    }
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

const distanceSquared = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return (dx * dx) + (dy * dy);
};

const wrapDirection = (direction) => {
    if (!Number.isFinite(direction)) {
        return 0;
    }
    const normalized = Math.round(direction);
    return ((normalized % 32) + 32) % 32;
};

const vectorToDirection = (dx, dy, fallback = 0) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return fallback;
    }
    const lengthSq = (dx * dx) + (dy * dy);
    if (lengthSq < 1e-6) {
        return fallback;
    }
    const theta = Math.atan2(dx, dy);
    let direction = Math.round((-theta / Math.PI) * 16);
    direction %= 32;
    if (direction < 0) {
        direction += 32;
    }
    return direction;
};

const stepDirectionTowards = (from, to, maxStep = 1) => {
    const current = wrapDirection(from);
    const target = wrapDirection(to);
    let diff = target - current;
    diff = ((diff + 16) % 32) - 16;
    const bounded = Math.max(-Math.abs(maxStep), Math.min(Math.abs(maxStep), diff));
    return wrapDirection(current + bounded);
};

const createPlayerRect = (x, y) => ({
    x: Math.floor(x + PLAYER_HITBOX_GAP),
    y: Math.floor(y + PLAYER_HITBOX_GAP),
    w: PLAYER_RECT_SIZE,
    h: PLAYER_RECT_SIZE
});

class BotClient {
    constructor(options = {}) {
        this.serverUrl = options.serverUrl || DEFAULT_SERVER_URL;
        this.cityPreference = Number.isFinite(options.city) ? Math.max(0, Math.floor(options.city)) : null;
        this.rolePreference = (options.role && typeof options.role === "string")
            ? options.role.toLowerCase()
            : 'recruit';
        this.name = options.name || `bot-${Math.floor(Math.random() * 9999)}`;
        this.socket = null;
        this.loopHandle = null;
        this.target = null;
        this.lastProgressAt = Date.now();
        this.spawnPoint = null;
        this.ready = false;

        this.mapData = this.loadMap();

        this.player = {
            id: null,
            city: this.cityPreference ?? 0,
            isMayor: false,
            health: MAX_HEALTH,
            direction: 16,
            isTurning: 0,
            isMoving: 0,
            bombsArmed: false,
            isCloaked: false,
            cloakExpiresAt: 0,
            isFrozen: false,
            frozenUntil: 0,
            sequence: 0,
            offset: {
                x: 0,
                y: 0
            },
            motionSeed: Math.random()
        };
    }

    log(...args) {
        console.log(`[${new Date().toISOString()}][${this.name}]`, ...args);
    }

    warn(...args) {
        console.warn(`[${new Date().toISOString()}][${this.name}]`, ...args);
    }

    loadMap() {
        try {
            const data = loadMapData();
            if (data && Array.isArray(data.map)) {
                this.log(`Loaded map.dat (${data.map.length} columns)`);
                return data.map;
            }
        } catch (error) {
            this.warn(`Unable to load map data: ${error.message}`);
        }
        return [];
    }

    connect() {
        this.socket = io(this.serverUrl, {
            transports: ["websocket"],
            reconnection: true
        });

        this.socket.on("connect", () => {
            this.log(`Connected as ${this.socket.id}`);
            this.player.id = this.socket.id;
            if (this.cityPreference !== null) {
                const spawn = this.resolveCitySpawn(this.cityPreference);
                if (spawn) {
                    this.spawnPoint = spawn;
                    this.player.offset.x = spawn.x;
                    this.player.offset.y = spawn.y;
                }
            }
            this.sendEnterGame();
            this.startLoop();
        });

        this.socket.on("disconnect", (reason) => {
            this.warn(`Disconnected: ${reason}`);
            this.ready = false;
            this.stopLoop();
        });

        this.socket.on("player", (payload) => this.onPlayerPayload(payload, { source: "player" }));
        this.socket.on("enter_game", (payload) => this.onPlayerPayload(payload, { source: "enter_game" }));
        this.socket.on("players:snapshot", (payload) => this.onPlayersSnapshot(payload));
        this.socket.on("lobby:assignment", (payload) => this.onAssignment(payload));
        this.socket.on("player:rejected", (payload) => this.onRejected(payload));
        this.socket.on("lobby:denied", (payload) => this.onLobbyDenied(payload));
        this.socket.on("connect_error", (err) => {
            this.warn(`Connection error: ${err?.message || err}`);
        });
    }

    stopLoop() {
        if (this.loopHandle) {
            clearInterval(this.loopHandle);
            this.loopHandle = null;
        }
    }

    startLoop() {
        this.stopLoop();
        this.loopHandle = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    }

    sendEnterGame() {
        if (!this.socket || this.socket.disconnected) {
            return;
        }
        const payload = {
            id: this.player.id,
            city: this.cityPreference ?? this.player.city ?? 0,
            isMayor: false,
            health: this.player.health,
            direction: wrapDirection(this.player.direction),
            isTurning: this.player.isTurning || 0,
            isMoving: 0,
            bombsArmed: false,
            isCloaked: false,
            cloakExpiresAt: 0,
            isFrozen: false,
            frozenUntil: 0,
            sequence: 0,
            offset: {
                x: Math.round(this.player.offset.x),
                y: Math.round(this.player.offset.y)
            }
        };
        if (this.cityPreference !== null) {
            payload.requestedCity = this.cityPreference;
        }
        const role = this.rolePreference || 'recruit';
        payload.requestedRole = role;
        payload.role = role;
        this.log(`Requesting entry (city=${payload.requestedCity ?? "auto"}, role=${payload.requestedRole ?? "auto"})`);
        this.socket.emit("enter_game", JSON.stringify(payload));
    }

    onPlayersSnapshot(payload) {
        const data = this.safeParse(payload);
        if (!Array.isArray(data)) {
            return;
        }
        data.forEach((entry) => this.onPlayerPayload(entry, { source: "snapshot" }));
    }

    onAssignment(payload) {
        const data = this.safeParse(payload);
        if (!data) {
            return;
        }
        if (Number.isFinite(data.city)) {
            this.player.city = Math.max(0, Math.floor(data.city));
            const spawn = this.resolveCitySpawn(this.player.city);
            if (spawn) {
                this.spawnPoint = spawn;
            }
            this.log(`Assigned to city ${this.player.city} (${spawn ? `${spawn.x.toFixed(1)},${spawn.y.toFixed(1)}` : "spawn unknown"})`);
            if (this.spawnPoint && this.player.offset.x === 0 && this.player.offset.y === 0) {
                this.player.offset.x = this.spawnPoint.x;
                this.player.offset.y = this.spawnPoint.y;
            }
        }
        if (typeof data.role === "string") {
            this.player.isMayor = data.role === "mayor";
        }
    }

    onRejected(payload) {
        const data = this.safeParse(payload);
        if (!data) {
            return;
        }
        this.warn("Player update rejected:", data.reasons || data);
    }

    onLobbyDenied(payload) {
        const data = this.safeParse(payload);
        if (!data) {
            return;
        }
        this.warn("Lobby denied:", data.reason || data);
    }

    onPlayerPayload(payload, context = {}) {
        const data = this.safeParse(payload);
        if (!data || !data.id) {
            return;
        }
        if (!this.socket || !this.socket.id || data.id !== this.socket.id) {
            return;
        }

        if (Number.isFinite(data.city)) {
            this.player.city = Math.max(0, Math.floor(data.city));
        }
        if (typeof data.isMayor === "boolean") {
            this.player.isMayor = data.isMayor;
        }
        if (data.offset && Number.isFinite(data.offset.x) && Number.isFinite(data.offset.y)) {
            this.player.offset.x = data.offset.x;
            this.player.offset.y = data.offset.y;
        }
        if (Number.isFinite(data.direction)) {
            this.player.direction = wrapDirection(data.direction);
        }
        if (Number.isFinite(data.sequence)) {
            this.player.sequence = data.sequence;
        }
        this.player.health = Number.isFinite(data.health) ? data.health : this.player.health;
        this.ready = true;
        if (!this.spawnPoint) {
            const spawn = this.resolveCitySpawn(this.player.city);
            if (spawn) {
                this.spawnPoint = spawn;
            }
        }
        if (!this.target) {
            this.pickNewTarget("init");
        }
        if (context.source === "enter_game") {
            this.log("Successfully entered game");
        }
    }

    tick() {
        if (!this.socket || this.socket.disconnected || !this.ready) {
            return;
        }
        if (!this.target || this.reachedTarget()) {
            this.pickNewTarget("reached");
        }
        const moved = this.seekTowardsTarget();
        const now = Date.now();
        if (moved) {
            this.lastProgressAt = now;
        } else if (now - this.lastProgressAt >= STALL_TIMEOUT_MS) {
            this.pickNewTarget("stalled");
            this.lastProgressAt = now;
        }
        this.emitPlayerUpdate();
    }

    reachedTarget() {
        if (!this.target) {
            return true;
        }
        const distSq = distanceSquared(this.player.offset.x, this.player.offset.y, this.target.x, this.target.y);
        return distSq <= (TARGET_REACH_RADIUS_PX * TARGET_REACH_RADIUS_PX);
    }

    pickNewTarget(reason = "random") {
        const origin = this.spawnPoint || this.player.offset;
        const maxAttempts = 12;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const angle = Math.random() * Math.PI * 2;
            const radius = (Math.random() * TARGET_RADIUS_TILES + 2) * TILE_SIZE;
            const candidate = {
                x: clamp(origin.x + (Math.cos(angle) * radius), 0, MAP_PIXEL_SIZE - TILE_SIZE),
                y: clamp(origin.y + (Math.sin(angle) * radius), 0, MAP_PIXEL_SIZE - TILE_SIZE)
            };
            if (!this.isBlocked(candidate.x, candidate.y)) {
                this.target = candidate;
                return;
            }
        }
        this.target = {
            x: clamp(origin.x + (Math.random() - 0.5) * TILE_SIZE * 2, 0, MAP_PIXEL_SIZE - TILE_SIZE),
            y: clamp(origin.y + (Math.random() - 0.5) * TILE_SIZE * 2, 0, MAP_PIXEL_SIZE - TILE_SIZE)
        };
        this.log(`Using fallback target after failed attempts (${reason})`);
    }

    seekTowardsTarget() {
        if (!this.target) {
            this.player.isMoving = 0;
            return false;
        }
        const dx = this.target.x - this.player.offset.x;
        const dy = this.target.y - this.player.offset.y;
        const distance = Math.sqrt((dx * dx) + (dy * dy));
        if (!Number.isFinite(distance) || distance < 1) {
            this.player.isMoving = 0;
            this.player.isTurning = 0;
            return false;
        }

        const step = Math.min(STEP_PER_TICK_PX, distance);
        const normX = dx / distance;
        const normY = dy / distance;
        const nextX = this.player.offset.x + (normX * step);
        const nextY = this.player.offset.y + (normY * step);

        if (this.isBlocked(nextX, nextY)) {
            this.player.isMoving = 0;
            this.player.isTurning = 0;
            return false;
        }

        const targetDirection = vectorToDirection(normX, normY, this.player.direction);
        const steppedDirection = stepDirectionTowards(this.player.direction, targetDirection, 4);
        const delta = ((steppedDirection - this.player.direction + 16) % 32) - 16;
        this.player.isTurning = delta === 0 ? 0 : Math.sign(delta);
        this.player.direction = steppedDirection;

        this.player.offset.x = nextX;
        this.player.offset.y = nextY;
        this.player.isMoving = 1;
        return true;
    }

    emitPlayerUpdate() {
        if (!this.socket || this.socket.disconnected) {
            return;
        }
        this.player.sequence += 1;
        const payload = {
            id: this.player.id,
            city: this.player.city,
            isMayor: this.player.isMayor,
            health: this.player.health,
            direction: wrapDirection(this.player.direction),
            isTurning: 0,
            isMoving: this.player.isMoving,
            bombsArmed: false,
            isCloaked: false,
            cloakExpiresAt: 0,
            isFrozen: false,
            frozenUntil: 0,
            sequence: this.player.sequence,
            offset: {
                x: Math.round(this.player.offset.x),
                y: Math.round(this.player.offset.y)
            }
        };
        this.socket.emit("player", JSON.stringify(payload));
    }

    resolveCitySpawn(cityId) {
        if (!Number.isFinite(cityId)) {
            return null;
        }
        const entry = citySpawns && citySpawns[String(cityId)];
        if (!entry) {
            return null;
        }
        const tileX = Number(entry.tileX);
        const tileY = Number(entry.tileY);
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
            return null;
        }
        return {
            x: ((tileX + 0.5) * TILE_SIZE),
            y: ((tileY + 0.5) * TILE_SIZE)
        };
    }

    getMapValue(tileX, tileY) {
        if (!Array.isArray(this.mapData) || !Array.isArray(this.mapData[tileX])) {
            return 0;
        }
        return this.mapData[tileX][tileY] || 0;
    }

    isBlocked(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return true;
        }
        if (x < 0 || y < 0) {
            return true;
        }
        if (x > MAP_PIXEL_SIZE - TILE_SIZE || y > MAP_PIXEL_SIZE - TILE_SIZE) {
            return true;
        }
        const rect = createPlayerRect(x, y);
        const startTileX = Math.max(0, Math.floor(rect.x / TILE_SIZE));
        const endTileX = Math.min(MAP_SIZE_TILES - 1, Math.floor((rect.x + rect.w - 1) / TILE_SIZE));
        const startTileY = Math.max(0, Math.floor(rect.y / TILE_SIZE));
        const endTileY = Math.min(MAP_SIZE_TILES - 1, Math.floor((rect.y + rect.h - 1) / TILE_SIZE));

        for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
            for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
                const value = this.getMapValue(tileX, tileY);
                if (BLOCKING_TILE_VALUES.has(value)) {
                    return true;
                }
            }
        }
        return false;
    }

    safeParse(payload) {
        if (payload === null || payload === undefined) {
            return null;
        }
        if (typeof payload === "object") {
            return payload;
        }
        if (typeof payload !== "string") {
            return null;
        }
        try {
            return JSON.parse(payload);
        } catch (error) {
            this.warn("Failed to parse payload:", error.message);
            return null;
        }
    }
}

const parseArgs = () => {
    const args = process.argv.slice(2);
    const options = {};
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--server" && args[index + 1]) {
            options.serverUrl = args[index + 1];
            index += 1;
        } else if ((arg === "--city" || arg === "-c") && args[index + 1]) {
            const value = Number(args[index + 1]);
            if (Number.isFinite(value)) {
                options.city = Math.max(0, Math.floor(value));
            }
            index += 1;
        } else if ((arg === "--role" || arg === "-r") && args[index + 1]) {
            options.role = args[index + 1].toLowerCase();
            index += 1;
        } else if ((arg === "--name" || arg === "-n") && args[index + 1]) {
            options.name = args[index + 1];
            index += 1;
        }
    }
    return options;
};

if (require.main === module) {
    const options = parseArgs();
    const bot = new BotClient(options);
    bot.connect();

    const shutdown = () => {
        bot.log("Shutting down");
        bot.stopLoop();
        if (bot.socket && bot.socket.connected) {
            bot.socket.disconnect();
        }
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

module.exports = { BotClient };
