"use strict";

const fs = require('fs');
const path = require('path');
const { randomUUID, randomBytes } = require('crypto');

const DEFAULT_FILENAME = path.join(__dirname, '../../data/users.json');
const NAME_MAX_LENGTH = 32;
const NAME_MIN_LENGTH = 2;

class UserStore {
    constructor(options = {}) {
        this.filePath = options.filePath || DEFAULT_FILENAME;
        this.users = new Map();
        this.providerIndex = new Map();
        this._loadFromDisk();
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
            provider: 'local',
            providerId: id,
            email: null,
            createdAt: now,
            updatedAt: now
        };
        this.users.set(id, entry);
        this._indexProviderMapping(entry);
        this._persist();
        return Object.assign({}, entry);
    }

    update(id, name) {
        const key = this._normaliseId(id);
        if (!key || !this.users.has(key)) {
            return null;
        }
        const sanitisedName = this._sanitizeName(name);
        if (!sanitisedName) {
            return null;
        }
        const existing = this.users.get(key);
        if (existing.name === sanitisedName) {
            this._indexProviderMapping(existing);
            return Object.assign({}, existing);
        }
        const updated = Object.assign({}, existing, {
            name: sanitisedName,
            updatedAt: Date.now()
        });
        this.users.set(key, updated);
        this._persist();
        return Object.assign({}, updated);
    }

    get(id) {
        const key = this._normaliseId(id);
        if (!key || !this.users.has(key)) {
            return null;
        }
        const entry = this.users.get(key);
        return entry ? Object.assign({}, entry) : null;
    }

    sanitize(name) {
        return this._sanitizeName(name);
    }

    findByProvider(provider, providerId) {
        const key = this._normaliseProvider(provider);
        const externalId = this._normaliseProviderId(providerId);
        if (!key || !externalId) {
            return null;
        }
        const mapKey = `${key}:${externalId}`;
        const internalId = this.providerIndex.get(mapKey);
        if (!internalId) {
            return null;
        }
        return this.get(internalId);
    }

    registerWithProvider(details = {}) {
        const provider = this._normaliseProvider(details.provider);
        const providerId = this._normaliseProviderId(details.providerId);
        if (!provider || !providerId) {
            return null;
        }

        const now = Date.now();
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
                updated.updatedAt = now;
                this.users.set(updated.id, updated);
                this._persist();
                this._indexProviderMapping(updated);
                return Object.assign({}, updated);
            }
            return Object.assign({}, existing);
        }

        if (!sanitisedName) {
            return null;
        }

        const id = this._generateId();
        const entry = {
            id,
            name: sanitisedName,
            provider,
            providerId,
            email: sanitizedEmail || null,
            createdAt: now,
            updatedAt: now
        };
        this.users.set(id, entry);
        this._indexProviderMapping(entry);
        this._persist();
        return Object.assign({}, entry);
    }

    _normalizeWhitespace(value) {
        return value.replace(/\s+/g, ' ').trim();
    }

    _sanitizeName(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }
        const trimmed = this._normalizeWhitespace(value);
        if (trimmed.length < NAME_MIN_LENGTH) {
            return null;
        }
        const clean = trimmed
            .replace(/[\u0000-\u001F\u007F]/g, '')
            .slice(0, NAME_MAX_LENGTH)
            .trim();
        if (clean.length < NAME_MIN_LENGTH) {
            return null;
        }
        return clean;
    }

    _normaliseId(value) {
        if (!value) {
            return null;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed.length ? trimmed : null;
        }
        return String(value);
    }

    _loadFromDisk() {
        try {
            const raw = fs.readFileSync(this.filePath, 'utf8');
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw);
            const list = Array.isArray(parsed?.users) ? parsed.users : [];
            list.forEach((entry) => {
                if (!entry || typeof entry !== 'object') {
                    return;
                }
                const key = this._normaliseId(entry.id);
                const name = this._sanitizeName(entry.name);
                if (!key || !name) {
                    return;
                }
                this.users.set(key, {
                    id: key,
                    name,
                    provider: this._normaliseProvider(entry.provider) || 'local',
                    providerId: this._normaliseProviderId(entry.providerId) || key,
                    email: this._sanitizeEmail(entry.email) || null,
                    createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
                    updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : Date.now()
                });
                const stored = this.users.get(key);
                this._indexProviderMapping(stored);
            });
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('[users] Failed to load users.json:', error.message);
            }
        }
    }

    _persist() {
        const directory = path.dirname(this.filePath);
        try {
            fs.mkdirSync(directory, { recursive: true });
        } catch (error) {
            console.warn('[users] Failed to ensure data directory:', error.message);
            return;
        }
        const payload = {
            users: Array.from(this.users.values()).map((entry) => Object.assign({}, entry))
        };
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf8');
        } catch (error) {
            console.warn('[users] Failed to persist users.json:', error.message);
        }
    }

    _generateId() {
        if (typeof randomUUID === 'function') {
            return randomUUID();
        }
        return randomBytes(16).toString('hex');
    }

    _normaliseProvider(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }
        const trimmed = value.trim().toLowerCase();
        return trimmed.length ? trimmed : null;
    }

    _normaliseProviderId(value) {
        if (value === null || value === undefined) {
            return null;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed.length ? trimmed : null;
        }
        const stringified = String(value);
        return stringified.trim().length ? stringified : null;
    }

    _sanitizeEmail(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }
        const trimmed = value.trim();
        if (!trimmed.includes('@')) {
            return null;
        }
        return trimmed.slice(0, 254);
    }

    _deriveFallbackName(provider, providerId, details = {}) {
        const attempts = [];
        if (details && typeof details.name === 'string') {
            attempts.push(details.name);
        }
        if (details && typeof details.given_name === 'string') {
            attempts.push(details.given_name);
        }
        if (details && typeof details.family_name === 'string') {
            attempts.push(details.family_name);
        }
        if (details && typeof details.email === 'string') {
            const emailLocal = details.email.split('@')[0];
            attempts.push(emailLocal);
        }
        const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Pilot';
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

    _indexProviderMapping(entry) {
        if (!entry) {
            return;
        }
        const provider = this._normaliseProvider(entry.provider);
        const providerId = this._normaliseProviderId(entry.providerId);
        if (!provider || !providerId) {
            return;
        }
        const key = `${provider}:${providerId}`;
        this.providerIndex.set(key, entry.id);
    }
}

module.exports = UserStore;
