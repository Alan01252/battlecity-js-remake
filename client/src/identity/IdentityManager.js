const STORAGE_KEY = 'battlecity.identity';
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 32;

const resolveEnvServerUrl = () => {
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SERVER_URL) {
            return String(import.meta.env.VITE_SERVER_URL);
        }
    } catch (error) {
        // ignore
    }
    return null;
};

const computeDefaultServerUrl = () => {
    if (typeof window !== 'undefined' && window.location) {
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const hostname = window.location.hostname || 'localhost';
        return `${protocol}//${hostname}:8021`;
    }
    return 'http://localhost:8021';
};

const resolveEnvGoogleClientIds = () => {
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            const env = import.meta.env;
            const explicit = env.VITE_GOOGLE_CLIENT_IDS || env.VITE_GOOGLE_CLIENT_ID || null;
            if (explicit) {
                return String(explicit);
            }
        }
    } catch (error) {
        // ignore env access errors
    }
    return null;
};

const sanitizeName = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }
    const compacted = value.replace(/\s+/g, ' ').trim();
    if (!compacted.length || compacted.length < MIN_NAME_LENGTH) {
        return null;
    }
    const cleaned = compacted
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .slice(0, MAX_NAME_LENGTH)
        .trim();
    if (cleaned.length < MIN_NAME_LENGTH) {
        return null;
    }
    return cleaned;
};

class IdentityManager {
    constructor(game, options = {}) {
        this.game = game;
        this.identity = null;
        const envBase = resolveEnvServerUrl();
        const candidateBase = options.apiBase || envBase || computeDefaultServerUrl();
        this.apiBase = this._normaliseBase(candidateBase);
        this.storageKey = options.storageKey || STORAGE_KEY;
        this.socketListener = null;
        const envGoogleIds = resolveEnvGoogleClientIds();
        const optionGoogleIds = Array.isArray(options.googleClientIds)
            ? options.googleClientIds
            : (options.googleClientId || null);
        this.googleClientIds = this._normaliseClientIds(optionGoogleIds) || [];
        if (this.googleClientIds.length === 0) {
            this.googleClientIds = this._normaliseClientIds(envGoogleIds);
        }
        this.googleClientId = this.googleClientIds.length ? this.googleClientIds[0] : null;
        this.handleSocketConnected = this.handleSocketConnected.bind(this);
        this.handleIdentityAck = this.handleIdentityAck.bind(this);
    }

    _normaliseBase(value) {
        if (!value || typeof value !== 'string') {
            return computeDefaultServerUrl();
        }
        const trimmed = value.trim().replace(/\/$/, '');
        if (!trimmed.length) {
            return computeDefaultServerUrl();
        }
        return trimmed;
    }

    loadFromStorage() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return null;
        }
        try {
            const raw = window.localStorage.getItem(this.storageKey);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return null;
            }
            if (typeof parsed.id === 'string' && typeof parsed.name === 'string') {
                const identity = {
                    id: parsed.id,
                    name: parsed.name,
                    provider: typeof parsed.provider === 'string' ? parsed.provider : null,
                    email: typeof parsed.email === 'string' ? parsed.email : null,
                    createdAt: parsed.createdAt ?? null,
                    updatedAt: parsed.updatedAt ?? null
                };
                this.identity = identity;
                this.applyIdentity(identity);
                return identity;
            }
        } catch (error) {
            if (window?.localStorage) {
                window.localStorage.removeItem(this.storageKey);
            }
        }
        return null;
    }

    getIdentity() {
        return this.identity ? Object.assign({}, this.identity) : null;
    }

    isGoogleAuthEnabled() {
        return Array.isArray(this.googleClientIds) && this.googleClientIds.length > 0;
    }

    getGoogleClientId() {
        return this.googleClientId;
    }

    async saveName(rawName) {
        const name = sanitizeName(rawName);
        if (!name) {
            throw new Error('Name must be between 2 and 32 characters.');
        }
        let response;
        if (this.identity && this.identity.id) {
            response = await this._request('PUT', `/api/users/${encodeURIComponent(this.identity.id)}`, { name });
        } else {
            response = await this._request('POST', '/api/users/register', { name });
        }
        this.identity = {
            id: response.id,
            name: response.name,
            provider: response.provider ?? (this.identity?.provider || 'local'),
            email: response.email ?? this.identity?.email ?? null,
            createdAt: response.createdAt ?? null,
            updatedAt: response.updatedAt ?? null
        };
        this._persistIdentity();
        this.applyIdentity(this.identity);
        this.notifySocket();
        return Object.assign({}, this.identity);
    }

    async authenticateWithGoogle(credential) {
        if (!credential || typeof credential !== 'string') {
            throw new Error('Missing Google credential.');
        }
        const response = await this._request('POST', '/api/auth/google', { credential });
        this.identity = {
            id: response.id,
            name: response.name,
            provider: response.provider ?? 'google',
            email: response.email ?? null,
            createdAt: response.createdAt ?? null,
            updatedAt: response.updatedAt ?? null
        };
        this._persistIdentity();
        this.applyIdentity(this.identity);
        this.notifySocket();
        return Object.assign({}, this.identity);
    }

    async refresh() {
        if (!this.identity || !this.identity.id) {
            return null;
        }
        try {
            const response = await this._request('GET', `/api/users/${encodeURIComponent(this.identity.id)}`);
            this.identity = {
                id: response.id,
                name: response.name,
                provider: response.provider ?? this.identity.provider ?? null,
                email: response.email ?? this.identity.email ?? null,
                createdAt: response.createdAt ?? this.identity.createdAt ?? null,
                updatedAt: response.updatedAt ?? Date.now()
            };
            this._persistIdentity();
            this.applyIdentity(this.identity);
            return Object.assign({}, this.identity);
        } catch (error) {
            return null;
        }
    }

    bindSocket(socketListener) {
        this.socketListener = socketListener;
        if (!socketListener || typeof socketListener.on !== 'function') {
            return;
        }
        socketListener.on('connected', this.handleSocketConnected);
        socketListener.on('identity:ack', this.handleIdentityAck);
    }

    handleSocketConnected() {
        this.notifySocket();
        if (this.identity && this.identity.id) {
            this.refresh();
        }
    }

    handleIdentityAck(payload) {
        if (!payload || payload.status !== 'ok') {
            return;
        }
        if (payload.id && payload.name) {
            this.identity = {
                id: payload.id,
                name: payload.name,
                createdAt: this.identity?.createdAt ?? null,
                updatedAt: Date.now()
            };
            this._persistIdentity();
            this.applyIdentity(this.identity);
        }
    }

    notifySocket(force = false) {
        if (!this.socketListener || typeof this.socketListener.sendIdentityUpdate !== 'function') {
            return;
        }
        if (!force && (!this.identity || !this.identity.id)) {
            return;
        }
        this.socketListener.sendIdentityUpdate(this.identity || null);
    }

    applyIdentity(identity) {
        if (!this.game) {
            return;
        }
        if (identity) {
            this.game.identity = {
                id: identity.id,
                name: identity.name,
                provider: identity.provider ?? null,
                email: identity.email ?? null
            };
            if (this.game.player) {
                this.game.player.userId = identity.id;
                this.game.player.callsign = identity.name;
            }
        } else {
            this.game.identity = null;
            if (this.game.player) {
                this.game.player.userId = null;
            }
        }
        if (this.game.lobby && typeof this.game.lobby.updateIdentityDisplay === 'function') {
            this.game.lobby.updateIdentityDisplay(this.game.identity);
        }
    }

    clearIdentity() {
        this.identity = null;
        this._persistIdentity();
        this.applyIdentity(null);
        this.notifySocket(true);
    }

    async _request(method, path, body) {
        const url = `${this.apiBase}${path}`;
        const headers = { 'Content-Type': 'application/json' };
        const options = {
            method,
            headers,
        };
        if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(url, options);
        if (!response.ok) {
            let message = 'Unable to save name.';
            try {
                const data = await response.json();
                if (data && typeof data === 'object' && data.error) {
                    if (data.error === 'invalid_name') {
                        message = 'Name must be between 2 and 32 characters.';
                    } else if (data.error === 'not_found') {
                        message = 'Registration record not found.';
                    } else if (data.error === 'invalid_id') {
                        message = 'Registration identifier was invalid.';
                    } else if (data.error === 'invalid_credential') {
                        message = 'Google sign-in could not be verified.';
                    } else if (data.error === 'audience_mismatch') {
                        message = 'Google sign-in is not configured for this server.';
                    } else if (data.error === 'registration_failed') {
                        message = 'We were unable to save your Google profile.';
                    } else if (data.error === 'upstream_unavailable') {
                        message = 'Google services are currently unavailable. Please try again later.';
                    } else if (data.error === 'missing_credential') {
                        message = 'Google response was missing required data.';
                    }
                }
            } catch (error) {
                // ignore parse errors
            }
            throw new Error(message);
        }
        if (response.status === 204) {
            return null;
        }
        const data = await response.json();
        return data;
    }

    _persistIdentity() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return;
        }
        if (!this.identity) {
            window.localStorage.removeItem(this.storageKey);
            return;
        }
        const payload = {
            id: this.identity.id,
            name: this.identity.name,
            provider: this.identity.provider ?? null,
            email: this.identity.email ?? null,
            createdAt: this.identity.createdAt ?? Date.now(),
            updatedAt: this.identity.updatedAt ?? Date.now()
        };
        window.localStorage.setItem(this.storageKey, JSON.stringify(payload));
    }

    _normaliseClientIds(source) {
        if (!source) {
            return [];
        }
        if (Array.isArray(source)) {
            return source
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter((value) => value.length > 0);
        }
        if (typeof source === 'string') {
            return source
                .split(/[;,]/)
                .map((value) => value.trim())
                .filter((value) => value.length > 0);
        }
        return [];
    }
}

export { sanitizeName };
export default IdentityManager;
