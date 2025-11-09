const STORAGE_KEY = 'battlecity.identity';
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 32;

const resolveEnvServerUrl = () => {
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            const env = import.meta.env;
            const explicit = env.VITE_SOCKET_URL || env.VITE_SERVER_URL || null;
            if (explicit) {
                return String(explicit);
            }
        }
    } catch (_error) {
        // ignore
    }
    return null;
};

const computeDefaultServerUrl = () => {
    if (typeof window !== 'undefined' && window.location) {
        const { protocol, hostname } = window.location;
        const normalisedProtocol = protocol === 'https:' ? 'https:' : 'http:';
        const lowerHost = (hostname || '').toLowerCase();
        const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(lowerHost);
        if (isLocalhost) {
            return `${normalisedProtocol}//${hostname}:8021`;
        }
        if (window.location.origin) {
            return window.location.origin;
        }
        const portSegment = window.location.port ? `:${window.location.port}` : '';
        return `${normalisedProtocol}//${hostname}${portSegment}`;
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
    } catch (_error) {
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
        this._initialisePromise = null;
        this.handleSocketConnected = this.handleSocketConnected.bind(this);
        this.handleIdentityAck = this.handleIdentityAck.bind(this);
    }

    _normaliseProvider(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }
        const trimmed = value.trim();
        if (!trimmed.length) {
            return null;
        }
        return trimmed.toLowerCase();
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
                    provider: typeof parsed.provider === 'string' ? this._normaliseProvider(parsed.provider) : null,
                    email: typeof parsed.email === 'string' ? parsed.email : null,
                    createdAt: parsed.createdAt ?? null,
                    updatedAt: parsed.updatedAt ?? null
                };
                this.identity = identity;
                this.applyIdentity(identity);
                return identity;
            }
        } catch (_error) {
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

    initialise() {
        if (this._initialisePromise) {
            return this._initialisePromise;
        }
        this._initialisePromise = this._loadRemoteConfig().catch((error) => {
            this._initialisePromise = null;
            throw error;
        });
        return this._initialisePromise;
    }

    async saveName(rawName) {
        const name = sanitizeName(rawName);
        if (!name) {
            throw new Error('Name must be between 2 and 32 characters.');
        }
        const currentProvider = this._normaliseProvider(this.identity?.provider) || null;
        let response;
        if (this.identity && this.identity.id) {
            response = await this._request(
                'PUT',
                `/api/users/${encodeURIComponent(this.identity.id)}`,
                { name },
                { fallbackMessage: 'Unable to save name.' }
            );
        } else {
            response = await this._request(
                'POST',
                '/api/users/register',
                { name },
                { fallbackMessage: 'Unable to save name.' }
            );
        }
        this.identity = {
            id: response.id,
            name: response.name,
            provider: this._normaliseProvider(response.provider) || currentProvider || 'local',
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
        const response = await this._request(
            'POST',
            '/api/auth/google',
            { credential },
            { fallbackMessage: 'Google sign-in failed.' }
        );
        const provider = this._normaliseProvider(response.provider) || 'google';
        this.identity = {
            id: response.id,
            name: response.name,
            provider,
            email: response.email ?? null,
            createdAt: response.createdAt ?? null,
            updatedAt: response.updatedAt ?? null
        };
        this._persistIdentity();
        this.applyIdentity(this.identity);
        this.notifySocket();
        const refreshed = await this.refresh();
        return refreshed || Object.assign({}, this.identity);
    }

    async refresh() {
        if (!this.identity || !this.identity.id) {
            return null;
        }
        try {
            const response = await this._request(
                'GET',
                `/api/users/${encodeURIComponent(this.identity.id)}`,
                undefined,
                { fallbackMessage: 'Unable to refresh identity.' }
            );
            this.identity = {
                id: response.id,
                name: response.name,
                provider: this._normaliseProvider(response.provider) ?? this._normaliseProvider(this.identity.provider) ?? null,
                email: response.email ?? this.identity.email ?? null,
                createdAt: response.createdAt ?? this.identity.createdAt ?? null,
                updatedAt: response.updatedAt ?? Date.now()
            };
            this._persistIdentity();
            this.applyIdentity(this.identity);
            return Object.assign({}, this.identity);
        } catch (_error) {
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
            const provider = this._normaliseProvider(this.identity?.provider) ?? null;
            this.identity = {
                id: payload.id,
                name: payload.name,
                provider,
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
                provider: this._normaliseProvider(identity.provider) ?? null,
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

    async _request(method, path, body, options = {}) {
        const url = `${this.apiBase}${path}`;
        const headers = { 'Content-Type': 'application/json' };
        const requestOptions = {
            method,
            headers,
        };
        if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
            requestOptions.body = JSON.stringify(body);
        }
        const fallbackMessage = options && typeof options.fallbackMessage === 'string'
            ? options.fallbackMessage
            : 'Request failed.';
        let response;
        try {
            response = await fetch(url, requestOptions);
        } catch (_networkError) {
            throw new Error(fallbackMessage);
        }
        if (!response.ok) {
            let message = fallbackMessage;
            try {
                const data = await response.json();
                if (data && typeof data === 'object' && data.error) {
                    if (data.error === 'invalid_name') {
                        message = 'Name must be between 2 and 32 characters.';
                    } else if (data.error === 'name_taken') {
                        message = 'That name is already taken.';
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
                    } else if (data.error === 'save_failed') {
                        message = 'Unable to save your identity. Please try again.';
                    } else if (data.error === 'upstream_unavailable') {
                        message = 'Google services are currently unavailable. Please try again later.';
                    } else if (data.error === 'missing_credential') {
                        message = 'Google response was missing required data.';
                    }
                }
            } catch (_error) {
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

    async _loadRemoteConfig() {
        const response = await this._request(
            'GET',
            '/api/identity/config',
            undefined,
            { fallbackMessage: 'Unable to load identity configuration.' }
        );
        if (!response || typeof response !== 'object') {
            return null;
        }
        const googleConfig = response.google || {};
        const remoteIds = this._normaliseClientIds(
            Array.isArray(googleConfig.clientIds) && googleConfig.clientIds.length
                ? googleConfig.clientIds
                : googleConfig.clientId || []
        );
        if (!this._areClientIdListsEqual(remoteIds, this.googleClientIds)) {
            this.googleClientIds = remoteIds;
            this.googleClientId = this.googleClientIds.length > 0 ? this.googleClientIds[0] : null;
            this._notifyGoogleConfigChanged();
        }
        return response;
    }

    _notifyGoogleConfigChanged() {
        if (!this.game || !this.game.lobby) {
            return;
        }
        const lobby = this.game.lobby;
        if (typeof lobby.configureGoogleIdentity === 'function') {
            lobby.configureGoogleIdentity();
        }
        if (typeof lobby.updateIdentityDisplay === 'function') {
            lobby.updateIdentityDisplay(this.getIdentity());
        } else if (typeof lobby.updateGoogleDisplay === 'function') {
            lobby.updateGoogleDisplay(this.getIdentity());
        }
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
            provider: this._normaliseProvider(this.identity.provider) ?? null,
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

    _areClientIdListsEqual(a, b) {
        if (a === b) {
            return true;
        }
        if (!Array.isArray(a) || !Array.isArray(b)) {
            return false;
        }
        if (a.length !== b.length) {
            return false;
        }
        for (let index = 0; index < a.length; index += 1) {
            if (a[index] !== b[index]) {
                return false;
            }
        }
        return true;
    }
}

export { sanitizeName };
export default IdentityManager;
