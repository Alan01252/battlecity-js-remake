"use strict";

const citySpawns = require("../../../shared/citySpawns.json");

const CHAT_MAX_HISTORY = 50;
const CHAT_MAX_LENGTH = 240;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/g;

const RATE_LIMITS = {
    team: {
        windowMs: 6000,
        max: 5
    },
    global: {
        windowMs: 15000,
        max: 3
    }
};

const DEFAULT_SCOPE = "team";

const toFiniteNumber = (value, fallback = null) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const normaliseCityId = (cityId) => {
    const numeric = toFiniteNumber(cityId, null);
    if (numeric === null || !Number.isFinite(numeric)) {
        return null;
    }
    return Math.max(0, Math.floor(numeric));
};

const getCityDisplayName = (cityId) => {
    const id = normaliseCityId(cityId);
    if (id === null) {
        return "City";
    }
    const entry = citySpawns && citySpawns[id] ? citySpawns[id] : null;
    if (entry && typeof entry.name === "string" && entry.name.trim().length) {
        return entry.name.trim();
    }
    return `City ${id + 1}`;
};

const shortenId = (value) => {
    if (!value || typeof value !== "string") {
        return null;
    }
    if (value.length <= 8) {
        return value;
    }
    return `${value.slice(0, 4)}...${value.slice(-2)}`;
};

class ChatManager {
    constructor({ game, playerFactory }) {
        this.game = game;
        this.playerFactory = playerFactory;
        this.io = null;
        this.rateLimitBuckets = new Map();
        this.history = [];
    }

    listen(io) {
        this.io = io;
        io.on("connection", (socket) => {
            this.handleConnection(socket);
        });
    }

    handleConnection(socket) {
        this.rateLimitBuckets.set(socket.id, {
            team: [],
            global: []
        });

        this.sendHistoryForSocket(socket);

        socket.on("chat:message", (payload) => {
            this.handleChatMessage(socket, payload);
        });

        socket.on("disconnect", () => {
            this.rateLimitBuckets.delete(socket.id);
        });
    }

    handleChatMessage(socket, payload) {
        const normalized = this.normaliseIncomingPayload(payload);
        if (!normalized) {
            return;
        }

        const player = this.game && this.game.players ? this.game.players[socket.id] : null;
        if (!player) {
            return;
        }

        const scope = normalized.scope;
        if (this.isRateLimited(socket.id, scope)) {
            const retryAt = this.getNextAllowedAt(socket.id, scope);
            socket.emit("chat:rate_limit", JSON.stringify({
                scope,
                retryAt
            }));
            return;
        }

        this.recordMessageUsage(socket.id, scope);

        const messagePayload = this.buildMessagePayload({
            player,
            text: normalized.message,
            scope
        });

        this.pushHistory(messagePayload);
        this.dispatchMessage(messagePayload);
    }

    normaliseIncomingPayload(payload) {
        if (payload === null || payload === undefined) {
            return null;
        }
        let parsed = payload;
        if (typeof payload === "string") {
            try {
                parsed = JSON.parse(payload);
            } catch (_error) {
                return null;
            }
        }
        if (!parsed || typeof parsed !== "object") {
            return null;
        }
        const scope = this.normaliseScope(parsed.scope);
        const message = this.sanitiseMessage(parsed.message ?? parsed.text ?? "");
        if (!message) {
            return null;
        }
        return {
            scope,
            message
        };
    }

    sanitiseMessage(message) {
        if (message === null || message === undefined) {
            return "";
        }
        let text = String(message);
        text = text.replace(CONTROL_CHAR_PATTERN, "");
        text = text.replace(/\s+/g, " ").trim();
        if (!text.length) {
            return "";
        }
        if (text.length > CHAT_MAX_LENGTH) {
            text = text.slice(0, CHAT_MAX_LENGTH);
        }
        return text;
    }

    normaliseScope(scope) {
        if (typeof scope === "string") {
            const trimmed = scope.trim().toLowerCase();
            if (trimmed === "global" || trimmed === "all") {
                return "global";
            }
            if (trimmed === "team" || trimmed === "city") {
                return "team";
            }
        }
        return DEFAULT_SCOPE;
    }

    isRateLimited(socketId, scope) {
        const bucket = this.rateLimitBuckets.get(socketId);
        if (!bucket) {
            return false;
        }
        const limit = RATE_LIMITS[scope] || RATE_LIMITS[DEFAULT_SCOPE];
        const windowStart = Date.now() - limit.windowMs;
        const entries = bucket[scope] || [];
        const recent = entries.filter((timestamp) => timestamp > windowStart);
        bucket[scope] = recent;
        this.rateLimitBuckets.set(socketId, bucket);
        return recent.length >= limit.max;
    }

    getNextAllowedAt(socketId, scope) {
        const bucket = this.rateLimitBuckets.get(socketId);
        if (!bucket) {
            return Date.now();
        }
        const limit = RATE_LIMITS[scope] || RATE_LIMITS[DEFAULT_SCOPE];
        const entries = bucket[scope] || [];
        if (!entries.length) {
            return Date.now();
        }
        const oldest = entries.reduce((min, timestamp) => Math.min(min, timestamp), entries[0]);
        return oldest + limit.windowMs;
    }

    recordMessageUsage(socketId, scope) {
        const limit = RATE_LIMITS[scope] || RATE_LIMITS[DEFAULT_SCOPE];
        const now = Date.now();
        const windowStart = now - limit.windowMs;
        const bucket = this.rateLimitBuckets.get(socketId) || { team: [], global: [] };
        const entries = bucket[scope] || [];
        const recent = entries.filter((timestamp) => timestamp > windowStart);
        recent.push(now);
        bucket[scope] = recent;
        this.rateLimitBuckets.set(socketId, bucket);
    }

    buildMessagePayload({ player, text, scope }) {
        const createdAt = Date.now();
        const senderCity = normaliseCityId(player.city);
        return {
            id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
            scope,
            text,
            createdAt,
            senderId: player.id,
            senderCity,
            senderCallsign: this.resolveCallsign(player),
            senderDisplay: this.resolveDisplayName(player, senderCity)
        };
    }

    resolveCallsign(player) {
        if (!player) {
            return null;
        }
        if (player.callsign && typeof player.callsign === "string" && player.callsign.trim().length) {
            return player.callsign.trim().slice(0, 48);
        }
        if (this.playerFactory && this.playerFactory.callsigns && typeof this.playerFactory.callsigns.get === "function") {
            const registryName = this.playerFactory.callsigns.get(player.id);
            if (registryName) {
                return registryName;
            }
        }
        return null;
    }

    resolveDisplayName(player, senderCity) {
        const callsign = this.resolveCallsign(player);
        if (callsign) {
            return callsign;
        }
        const shortId = shortenId(player && player.id ? String(player.id) : "");
        if (shortId) {
            return shortId;
        }
        const cityLabel = getCityDisplayName(senderCity);
        return `${cityLabel} Recruit`;
    }

    pushHistory(message) {
        if (!message) {
            return;
        }
        this.history.push(message);
        if (this.history.length > CHAT_MAX_HISTORY) {
            this.history.splice(0, this.history.length - CHAT_MAX_HISTORY);
        }
    }

    dispatchMessage(message) {
        if (!this.io || !message) {
            return;
        }
        if (message.scope === "global") {
            this.io.emit("chat:message", JSON.stringify(message));
            return;
        }
        const cityId = normaliseCityId(message.senderCity);
        const players = this.game && this.game.players ? Object.values(this.game.players) : [];
        for (const target of players) {
            if (!target || normaliseCityId(target.city) !== cityId) {
                continue;
            }
            this.emitToSocket(target.id, "chat:message", message);
        }
    }

    broadcastSystemMessage(text) {
        if (!text || !text.toString().trim().length) {
            return;
        }
        const sanitized = this.sanitiseMessage(String(text));
        if (!sanitized) {
            return;
        }
        const payload = {
            id: `system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            scope: "global",
            text: sanitized,
            createdAt: Date.now(),
            senderId: null,
            senderCity: null,
            senderCallsign: "System",
            senderDisplay: "System"
        };
        this.pushHistory(payload);
        if (this.io) {
            this.io.emit("chat:message", JSON.stringify(payload));
        }
    }

    sendHistoryForSocket(socketOrId) {
        if (!this.history.length) {
            return;
        }
        const socketId = this.resolveSocketId(socketOrId);
        if (!socketId) {
            return;
        }
        const history = this.collectHistoryForSocket(socketId);
        if (!history.length) {
            return;
        }
        if (socketOrId && typeof socketOrId.emit === "function") {
            socketOrId.emit("chat:history", JSON.stringify(history));
            return;
        }
        this.emitToSocket(socketId, "chat:history", history);
    }

    resolveSocketId(socketOrId) {
        if (!socketOrId) {
            return null;
        }
        if (typeof socketOrId === "string") {
            return socketOrId;
        }
        if (typeof socketOrId.id === "string") {
            return socketOrId.id;
        }
        return null;
    }

    collectHistoryForSocket(socketId) {
        const cityId = this.getPlayerCity(socketId);
        return this.history.filter((message) => {
            if (!message) {
                return false;
            }
            if (message.scope === "global") {
                return true;
            }
            if (message.scope !== "team") {
                return false;
            }
            const senderCity = normaliseCityId(message.senderCity);
            if (cityId === null) {
                return false;
            }
            return senderCity === cityId;
        });
    }

    getPlayerCity(socketId) {
        if (!socketId || !this.game || !this.game.players) {
            return null;
        }
        const player = this.game.players[socketId];
        if (!player) {
            return null;
        }
        return normaliseCityId(player.city);
    }

    emitToSocket(socketId, event, payload) {
        if (!this.io || !socketId) {
            return;
        }
        const socket = this.io.sockets && this.io.sockets.sockets
            ? this.io.sockets.sockets.get(socketId)
            : null;
        if (!socket) {
            return;
        }
        socket.emit(event, JSON.stringify(payload));
    }
}

module.exports = ChatManager;
