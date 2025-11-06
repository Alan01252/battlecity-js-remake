"use strict";

const fs = require("fs");
const path = require("path");
const { randomUUID, randomBytes } = require("crypto");
const { execFileSync } = require("child_process");

const DEFAULT_DB_PATH = path.join(__dirname, "../../data/scores.db");
const LEGACY_JSON_PATH = path.join(__dirname, "../../data/users.json");
const SQLITE_BIN = process.env.SQLITE3_PATH || "sqlite3";

const NAME_MAX_LENGTH = 32;
const NAME_MIN_LENGTH = 2;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/g;

const clampTimestamp = (value, fallback) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    const floored = Math.floor(numeric);
    return floored < 0 ? fallback : floored;
};

const escapeValue = (value) => {
    if (value === null || value === undefined) {
        return "NULL";
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(Math.floor(value));
    }
    const stringValue = String(value)
        .replace(CONTROL_CHAR_PATTERN, "")
        .replace(/'/g, "''");
    return `'${stringValue}'`;
};

class UserStore {
    constructor(options = {}) {
        this.dbPath = options.dbPath || DEFAULT_DB_PATH;
        this.legacyFilePath = options.legacyFilePath || LEGACY_JSON_PATH;
        this.users = new Map();
        this.providerIndex = new Map();
        this._initialiseDatabase();
        this._loadFromDatabase();
    }

    register(name) {
        const sanitisedName = this._sanitizeName(name);
        if (!sanitisedName) {
            return null;
        }
        const now = Date.now();
        const id = this._generateId();
        const entry = {
            id,
            name: sanitisedName,
            provider: "local",
            providerId: id,
            email: null,
            createdAt: now,
            updatedAt: now
        };
        const persisted = this._persistEntry(entry);
        return Object.assign({}, persisted);
    }

    update(id, name) {
        const key = this._normaliseId(id);
        if (!key) {
            return null;
        }
        const existing = this.get(key);
        if (!existing) {
            return null;
        }
        const sanitisedName = this._sanitizeName(name);
        if (!sanitisedName) {
            return null;
        }
        if (existing.name === sanitisedName) {
            return Object.assign({}, existing);
        }
        const updated = Object.assign({}, existing, {
            name: sanitisedName,
            updatedAt: Date.now()
        });
        const persisted = this._persistEntry(updated);
        return Object.assign({}, persisted);
    }

    get(id) {
        const key = this._normaliseId(id);
        if (!key) {
            return null;
        }
        if (this.users.has(key)) {
            const cached = this.users.get(key);
            return cached ? Object.assign({}, cached) : null;
        }
        const rows = this._query(`
            SELECT
                id,
                name,
                provider,
                provider_id AS providerId,
                email,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM users
            WHERE id = ${escapeValue(key)}
            LIMIT 1;
        `);
        if (!rows || !rows.length) {
            return null;
        }
        const entry = this._mapRow(rows[0]);
        this._cacheEntry(entry);
        return Object.assign({}, entry);
    }

    sanitize(name) {
        return this._sanitizeName(name);
    }

    findByProvider(provider, providerId) {
        const normalizedProvider = this._normaliseProvider(provider);
        const normalizedProviderId = this._normaliseProviderId(providerId);
        if (!normalizedProvider || !normalizedProviderId) {
            return null;
        }
        const mapKey = `${normalizedProvider}:${normalizedProviderId}`;
        const cachedId = this.providerIndex.get(mapKey);
        if (cachedId) {
            return this.get(cachedId);
        }
        const rows = this._query(`
            SELECT
                id,
                name,
                provider,
                provider_id AS providerId,
                email,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM users
            WHERE provider = ${escapeValue(normalizedProvider)}
                AND provider_id = ${escapeValue(normalizedProviderId)}
            LIMIT 1;
        `);
        if (!rows || !rows.length) {
            return null;
        }
        const entry = this._mapRow(rows[0]);
        this._cacheEntry(entry);
        return Object.assign({}, entry);
    }

    registerWithProvider(details = {}) {
        const provider = this._normaliseProvider(details.provider);
        const providerId = this._normaliseProviderId(details.providerId);
        if (!provider || !providerId) {
            return null;
        }

        const existing = this.findByProvider(provider, providerId);
        const sanitisedName = this._sanitizeName(details.name) || this._deriveFallbackName(provider, providerId, details);
        const sanitizedEmail = this._sanitizeEmail(details.email);

        if (existing) {
            let changed = false;
            const updated = Object.assign({}, existing);
            if (sanitisedName && sanitisedName !== existing.name) {
                updated.name = sanitisedName;
                changed = true;
            }
            if ((sanitizedEmail || null) !== (existing.email || null)) {
                updated.email = sanitizedEmail || null;
                changed = true;
            }
            if (changed) {
                updated.updatedAt = Date.now();
                const persisted = this._persistEntry(updated);
                return Object.assign({}, persisted);
            }
            return Object.assign({}, existing);
        }

        if (!sanitisedName) {
            return null;
        }

        const now = Date.now();
        const entry = {
            id: this._generateId(),
            name: sanitisedName,
            provider,
            providerId,
            email: sanitizedEmail || null,
            createdAt: now,
            updatedAt: now
        };
        const persisted = this._persistEntry(entry);
        return Object.assign({}, persisted);
    }

    _initialiseDatabase() {
        try {
            const directory = path.dirname(this.dbPath);
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
            }
            const schema = `
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    provider_id TEXT NOT NULL,
                    email TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider
                    ON users(provider, provider_id);
                CREATE INDEX IF NOT EXISTS idx_users_updated_at
                    ON users(updated_at DESC);
            `;
            this._execute(schema);
        } catch (error) {
            console.warn("[users] Failed to initialise user database:", error.message);
        }
    }

    _execute(sql) {
        if (!sql || !sql.trim()) {
            return;
        }
        try {
            execFileSync(SQLITE_BIN, [this.dbPath, sql], {
                encoding: "utf8",
                stdio: ["ignore", "ignore", "pipe"]
            });
        } catch (error) {
            const stderr = error && error.stderr ? error.stderr.toString() : error.message;
            console.warn("[users] SQLite command failed:", stderr);
        }
    }

    _query(sql) {
        if (!sql || !sql.trim()) {
            return [];
        }
        try {
            const output = execFileSync(SQLITE_BIN, [this.dbPath, "-cmd", ".mode json", sql], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"]
            });
            const trimmed = output ? output.trim() : "";
            if (!trimmed) {
                return [];
            }
            return JSON.parse(trimmed);
        } catch (error) {
            const stderr = error && error.stderr ? error.stderr.toString() : error.message;
            console.warn("[users] SQLite query failed:", stderr);
            return [];
        }
    }

    _cacheEntry(entry) {
        if (!entry || !entry.id) {
            return;
        }
        const copy = Object.assign({}, entry);
        this.users.set(copy.id, copy);
        const providerKey = this._resolveProviderIndexKey(copy.provider, copy.providerId);
        if (providerKey) {
            this.providerIndex.set(providerKey, copy.id);
        }
    }

    _persistEntry(entry) {
        const sanitized = this._sanitizeEntry(entry);
        const sql = `
            INSERT INTO users (
                id, name, provider, provider_id, email, created_at, updated_at
            ) VALUES (
                ${escapeValue(sanitized.id)},
                ${escapeValue(sanitized.name)},
                ${escapeValue(sanitized.provider)},
                ${escapeValue(sanitized.providerId)},
                ${escapeValue(sanitized.email)},
                ${sanitized.createdAt},
                ${sanitized.updatedAt}
            ) ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                provider = excluded.provider,
                provider_id = excluded.provider_id,
                email = excluded.email,
                updated_at = excluded.updated_at;
        `;
        this._execute(sql);
        this._cacheEntry(sanitized);
        return Object.assign({}, sanitized);
    }

    _sanitizeEntry(entry) {
        const now = Date.now();
        const id = this._normaliseId(entry.id) || this._generateId();
        const provider = this._normaliseProvider(entry.provider) || "local";
        const providerId = this._normaliseProviderId(entry.providerId) || id;
        const sanitizedName = this._sanitizeName(entry.name) || this._deriveFallbackName(provider, providerId, entry) || "Pilot";
        const sanitizedEmail = this._sanitizeEmail(entry.email);
        const createdAt = clampTimestamp(entry.createdAt, now);
        const updatedAt = clampTimestamp(entry.updatedAt, now);
        return {
            id,
            name: sanitizedName,
            provider,
            providerId,
            email: sanitizedEmail || null,
            createdAt,
            updatedAt
        };
    }

    _mapRow(row) {
        return this._sanitizeEntry({
            id: row.id,
            name: row.name,
            provider: row.provider,
            providerId: row.providerId,
            email: row.email,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        });
    }

    _loadFromDatabase() {
        const rows = this._query(`
            SELECT
                id,
                name,
                provider,
                provider_id AS providerId,
                email,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM users;
        `);
        if (rows && rows.length) {
            rows.forEach((row) => {
                const entry = this._mapRow(row);
                this._cacheEntry(entry);
            });
            return;
        }
        this._loadLegacyFile();
    }

    _loadLegacyFile() {
        if (!this.legacyFilePath) {
            return;
        }
        try {
            const raw = fs.readFileSync(this.legacyFilePath, "utf8");
            const parsed = JSON.parse(raw);
            const list = Array.isArray(parsed?.users) ? parsed.users : [];
            list.forEach((legacy) => {
                const entry = {
                    id: legacy.id,
                    name: legacy.name,
                    provider: legacy.provider || "local",
                    providerId: legacy.providerId || legacy.id,
                    email: legacy.email || null,
                    createdAt: legacy.createdAt,
                    updatedAt: legacy.updatedAt
                };
                this._persistEntry(entry);
            });
        } catch (error) {
            if (error.code !== "ENOENT") {
                console.warn("[users] Failed to load legacy users.json:", error.message);
            }
        }
    }

    _resolveProviderIndexKey(provider, providerId) {
        const normalisedProvider = this._normaliseProvider(provider);
        const normalisedProviderId = this._normaliseProviderId(providerId);
        if (!normalisedProvider || !normalisedProviderId) {
            return null;
        }
        return `${normalisedProvider}:${normalisedProviderId}`;
    }

    _generateId() {
        if (typeof randomUUID === "function") {
            return randomUUID();
        }
        return randomBytes(16).toString("hex");
    }

    _normaliseId(value) {
        if (value === null || value === undefined) {
            return null;
        }
        const stringValue = String(value).trim();
        return stringValue.length ? stringValue : null;
    }

    _normaliseProvider(value) {
        if (!value || typeof value !== "string") {
            return null;
        }
        const trimmed = value.trim().toLowerCase();
        return trimmed.length ? trimmed : null;
    }

    _normaliseProviderId(value) {
        if (value === null || value === undefined) {
            return null;
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            return trimmed.length ? trimmed : null;
        }
        const stringified = String(value);
        return stringified.trim().length ? stringified : null;
    }

    _normalizeWhitespace(value) {
        return value.replace(/\s+/g, " ").trim();
    }

    _sanitizeName(value) {
        if (!value || typeof value !== "string") {
            return null;
        }
        const trimmed = this._normalizeWhitespace(value);
        if (trimmed.length < NAME_MIN_LENGTH) {
            return null;
        }
        const clean = trimmed
            .replace(CONTROL_CHAR_PATTERN, "")
            .slice(0, NAME_MAX_LENGTH)
            .trim();
        if (clean.length < NAME_MIN_LENGTH) {
            return null;
        }
        return clean;
    }

    _sanitizeEmail(value) {
        if (!value || typeof value !== "string") {
            return null;
        }
        const trimmed = value.trim();
        if (!trimmed.includes("@")) {
            return null;
        }
        return trimmed.slice(0, 254);
    }

    _deriveFallbackName(provider, providerId, details = {}) {
        const attempts = [];
        if (details && typeof details.name === "string") {
            attempts.push(details.name);
        }
        if (details && typeof details.given_name === "string") {
            attempts.push(details.given_name);
        }
        if (details && typeof details.family_name === "string") {
            attempts.push(details.family_name);
        }
        if (details && typeof details.email === "string") {
            const emailLocal = details.email.split("@")[0];
            attempts.push(emailLocal);
        }
        const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "Pilot";
        const tail = providerId && providerId.length >= 4
            ? providerId.slice(-4)
            : Math.random().toString(36).slice(-4);
        attempts.push(`${providerLabel} ${tail}`);
        for (const candidate of attempts) {
            const sanitized = this._sanitizeName(candidate);
            if (sanitized) {
                return sanitized;
            }
        }
        return null;
    }
}

module.exports = UserStore;
