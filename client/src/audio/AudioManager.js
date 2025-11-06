const isBrowserEnvironment = () => typeof window !== 'undefined';

const toFiniteNumber = (value, fallback = 0) => {
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

export const SOUND_IDS = {
    LASER: 'laser',
    ROCKET: 'rocket',
    TURRET: 'turret',
    FLARE: 'flare',
    ENGINE: 'engine',
    EXPLOSION: 'explosion',
    BUILD: 'build',
    DEMOLISH: 'demolish',
    HIT: 'hit',
    DIE: 'die',
    BUZZ: 'buzz',
    CLICK: 'click',
    SCREECH: 'screech',
    CLOAK: 'cloak',
    FIRE: 'fire',
};

const SOUND_DEFINITIONS = {
    [SOUND_IDS.LASER]: {
        src: new URL('../../data/wav/laser.wav', import.meta.url).href,
        volume: 0.58,
        maxDistance: 2000,
        spatial: true,
    },
    [SOUND_IDS.ROCKET]: {
        src: new URL('../../data/wav/bturr.wav', import.meta.url).href,
        volume: 0.68,
        maxDistance: 2100,
        spatial: true,
    },
    [SOUND_IDS.TURRET]: {
        src: new URL('../../data/wav/turretfire.wav', import.meta.url).href,
        volume: 0.62,
        maxDistance: 1900,
        spatial: true,
    },
    [SOUND_IDS.FLARE]: {
        src: new URL('../../data/flare.wav', import.meta.url).href,
        volume: 0.55,
        maxDistance: 1900,
        spatial: true,
    },
    [SOUND_IDS.ENGINE]: {
        src: new URL('../../data/wav/engine.wav', import.meta.url).href,
        volume: 0.3,
        loop: true,
        spatial: false,
    },
    [SOUND_IDS.EXPLOSION]: {
        src: new URL('../../data/wav/explode.wav', import.meta.url).href,
        volume: 0.7,
        maxDistance: 2400,
        spatial: true,
    },
    [SOUND_IDS.BUILD]: {
        src: new URL('../../data/wav/build.wav', import.meta.url).href,
        volume: 0.55,
        maxDistance: 1400,
        spatial: true,
    },
    [SOUND_IDS.DEMOLISH]: {
        src: new URL('../../data/wav/demo.wav', import.meta.url).href,
        volume: 0.65,
        maxDistance: 1800,
        spatial: true,
    },
    [SOUND_IDS.HIT]: {
        src: new URL('../../data/wav/hit.wav', import.meta.url).href,
        volume: 0.7,
        spatial: false,
    },
    [SOUND_IDS.DIE]: {
        src: new URL('../../data/wav/die.wav', import.meta.url).href,
        volume: 0.75,
        spatial: false,
    },
    [SOUND_IDS.BUZZ]: {
        src: new URL('../../data/wav/buzz.wav', import.meta.url).href,
        volume: 0.5,
        spatial: false,
    },
    [SOUND_IDS.CLICK]: {
        src: new URL('../../data/wav/click.wav', import.meta.url).href,
        volume: 0.5,
        spatial: false,
    },
    [SOUND_IDS.SCREECH]: {
        src: new URL('../../data/wav/screech.wav', import.meta.url).href,
        volume: 0.7,
        spatial: false,
    },
    [SOUND_IDS.CLOAK]: {
        src: new URL('../../data/cloak.wav', import.meta.url).href,
        volume: 0.6,
        spatial: false,
    },
    [SOUND_IDS.FIRE]: {
        src: new URL('../../data/wav/fire.wav', import.meta.url).href,
        volume: 0.55,
        maxDistance: 1600,
        spatial: true,
    },
};

const DEFAULT_MAX_DISTANCE = 2400;
const MINIMUM_VOLUME = 0.001;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default class AudioManager {
    constructor(options = {}) {
        this.enabled = options.enabled !== undefined ? !!options.enabled : true;
        this.defaultMaxDistance = toFiniteNumber(options.defaultMaxDistance, DEFAULT_MAX_DISTANCE);
        this.definitions = options.definitions || SOUND_DEFINITIONS;
        this.buffers = new Map();
        this.loading = new Map();
        this.loopSources = new Map();
        this.listenerPosition = { x: 0, y: 0 };
        this.pendingQueue = [];
        this.unlockBound = false;
        this.context = null;
    }

    isSupported() {
        if (!isBrowserEnvironment()) {
            return false;
        }
        if (typeof window.AudioContext === 'undefined' && typeof window.webkitAudioContext === 'undefined') {
            return false;
        }
        return true;
    }

    getContext() {
        if (!this.enabled) {
            return null;
        }
        if (!this.isSupported()) {
            this.enabled = false;
            return null;
        }
        if (this.context) {
            return this.context;
        }
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) {
            this.enabled = false;
            return null;
        }
        this.context = new Ctor();
        return this.context;
    }

    async resumeContext() {
        const context = this.getContext();
        if (!context) {
            return false;
        }
        if (context.state === 'suspended') {
            try {
                await context.resume();
            } catch (error) {
                console.warn('Unable to resume audio context', error);
                return false;
            }
        }
        return context.state === 'running';
    }

    enqueuePlayback(callback) {
        if (typeof callback !== 'function') {
            return;
        }
        this.pendingQueue.push(callback);
        this.bindGestureUnlock();
    }

    flushQueue() {
        if (!this.pendingQueue.length) {
            return;
        }
        const queue = this.pendingQueue.splice(0, this.pendingQueue.length);
        queue.forEach((callback) => {
            try {
                callback();
            } catch (error) {
                console.warn('Deferred audio callback failed', error);
            }
        });
    }

    bindGestureUnlock() {
        if (!isBrowserEnvironment() || this.unlockBound) {
            return;
        }
        const handler = async () => {
            await this.resumeContext();
            this.flushQueue();
        };
        const onceHandler = async (event) => {
            try {
                await handler(event);
            } finally {
                this.unbindGestureUnlock();
            }
        };
        this.unlockBound = true;
        this.unlockHandler = onceHandler;
        ['pointerdown', 'touchstart', 'keydown'].forEach((eventName) => {
            window.addEventListener(eventName, onceHandler, { once: true, passive: true });
        });
    }

    unbindGestureUnlock() {
        if (!isBrowserEnvironment() || !this.unlockBound || !this.unlockHandler) {
            this.unlockBound = false;
            this.unlockHandler = null;
            return;
        }
        ['pointerdown', 'touchstart', 'keydown'].forEach((eventName) => {
            window.removeEventListener(eventName, this.unlockHandler);
        });
        this.unlockBound = false;
        this.unlockHandler = null;
    }

    async preloadAll() {
        const entries = Object.entries(this.definitions);
        await Promise.all(entries.map(([name, definition]) => this.loadDefinition(name, definition)));
    }

    async loadDefinition(name, definition) {
        if (!this.enabled) {
            return null;
        }
        if (this.buffers.has(name)) {
            return this.buffers.get(name);
        }
        if (!definition || !definition.src) {
            return null;
        }
        if (this.loading.has(name)) {
            return this.loading.get(name);
        }
        const loadPromise = this.fetchAndDecode(definition.src)
            .then((buffer) => {
                if (buffer) {
                    this.buffers.set(name, buffer);
                }
                return buffer;
            })
            .finally(() => {
                this.loading.delete(name);
            });
        this.loading.set(name, loadPromise);
        return loadPromise;
    }

    async fetchAndDecode(url) {
        try {
            const context = this.getContext();
            if (!context) {
                return null;
            }
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch audio: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            return await context.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.warn('Failed to load audio asset', url, error);
            return null;
        }
    }

    setListenerPosition(x, y) {
        this.listenerPosition = {
            x: toFiniteNumber(x, this.listenerPosition.x),
            y: toFiniteNumber(y, this.listenerPosition.y)
        };
    }

    calculateSpatialParams(name, position, options = {}) {
        const definition = this.definitions[name] || {};
        const spatial = options.spatial ?? definition.spatial ?? false;
        if (!spatial || !position) {
            return { volume: options.volume ?? definition.volume ?? 1, pan: 0 };
        }
        const listener = this.listenerPosition || { x: 0, y: 0 };
        const dx = toFiniteNumber(position.x, 0) - listener.x;
        const dy = toFiniteNumber(position.y, 0) - listener.y;
        const distance = Math.sqrt((dx * dx) + (dy * dy));
        const maxDistance = toFiniteNumber(options.maxDistance, definition.maxDistance ?? this.defaultMaxDistance);
        if (maxDistance <= 0) {
            return { volume: 0, pan: 0 };
        }
        const clampedDistance = clamp(distance / maxDistance, 0, 1);
        const falloff = 1 - clampedDistance;
        const baseVolume = options.volume ?? definition.volume ?? 1;
        const volume = clamp(baseVolume * (falloff * falloff), 0, baseVolume);
        const pan = clamp(dx / maxDistance, -1, 1);
        return { volume, pan };
    }

    buildNodeGraph(context, source, params) {
        const gain = context.createGain();
        gain.gain.value = Math.max(params.volume, MINIMUM_VOLUME);
        if (context.createStereoPanner) {
            const panner = context.createStereoPanner();
            panner.pan.value = clamp(params.pan ?? 0, -1, 1);
            source.connect(panner);
            panner.connect(gain);
        } else {
            source.connect(gain);
        }
        gain.connect(context.destination);
        return gain;
    }

    playEffect(name, options = {}) {
        if (!this.enabled) {
            return null;
        }
        const definition = this.definitions[name];
        if (!definition) {
            return null;
        }
        const context = this.getContext();
        if (!context) {
            return null;
        }
        const attemptPlayback = () => {
            const buffer = this.buffers.get(name);
            if (!buffer) {
                return null;
            }
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.loop = !!(options.loop || definition.loop);

            const params = this.calculateSpatialParams(name, options.position, options);
            params.volume = options.volume ?? params.volume ?? definition.volume ?? 1;
            if (params.volume <= MINIMUM_VOLUME) {
                return null;
            }

            const gainNode = this.buildNodeGraph(context, source, params);
            source.start(0);

            if (source.loop) {
                this.loopSources.set(name, {
                    source,
                    gainNode,
                    options: { ...options }
                });
            } else {
                source.onended = () => {
                    if (this.loopSources.get(name)?.source === source) {
                        this.loopSources.delete(name);
                    }
                };
            }
            return source;
        };

        if (context.state === 'suspended') {
            this.enqueuePlayback(() => this.playEffect(name, options));
            return null;
        }

        const buffer = this.buffers.get(name);
        if (!buffer) {
            this.loadDefinition(name, definition).then(() => {
                attemptPlayback();
            });
            return null;
        }
        return attemptPlayback();
    }

    stopEffect(name) {
        const loopInfo = this.loopSources.get(name);
        if (!loopInfo) {
            return;
        }
        try {
            loopInfo.source.stop();
        } catch (error) {
            console.debug('Failed stopping loop', name, error);
        }
        this.loopSources.delete(name);
    }

    setLoopState(name, shouldPlay, options = {}) {
        if (shouldPlay) {
            if (this.loopSources.has(name)) {
                return this.loopSources.get(name).source;
            }
            return this.playEffect(name, { ...options, loop: true, spatial: false });
        }
        this.stopEffect(name);
        return null;
    }
}
