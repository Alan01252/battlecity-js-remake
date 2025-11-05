const DEFAULT_DURATION = 650;
const DEFAULT_INTENSITY = 6;

const toFiniteNumber = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

export const initialiseCameraShake = (game) => {
    if (!game) {
        return;
    }
    game.cameraShake = {
        remaining: 0,
        duration: 0,
        intensity: 0,
        offsetX: 0,
        offsetY: 0
    };
};

export const triggerCameraShake = (game, options = {}) => {
    if (!game || !game.cameraShake) {
        return;
    }
    const duration = Math.max(0, toFiniteNumber(options.duration, DEFAULT_DURATION));
    const intensity = Math.max(0, toFiniteNumber(options.intensity, DEFAULT_INTENSITY));

    game.cameraShake.remaining = duration;
    game.cameraShake.duration = duration;
    game.cameraShake.intensity = intensity;
};

export const updateCameraShake = (game, deltaMs = 0) => {
    if (!game || !game.cameraShake) {
        return { x: 0, y: 0 };
    }

    const shake = game.cameraShake;
    const elapsed = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;

    if (shake.remaining <= 0 || shake.intensity <= 0) {
        shake.remaining = 0;
        shake.offsetX = 0;
        shake.offsetY = 0;
        return { x: 0, y: 0 };
    }

    shake.remaining = Math.max(0, shake.remaining - elapsed);

    const progress = shake.duration > 0 ? shake.remaining / shake.duration : 0;
    const magnitude = shake.intensity * progress;
    const angle = Math.random() * Math.PI * 2;

    shake.offsetX = Math.cos(angle) * magnitude;
    shake.offsetY = Math.sin(angle) * magnitude;

    if (shake.remaining <= 0) {
        shake.offsetX = 0;
        shake.offsetY = 0;
    }

    return { x: shake.offsetX, y: shake.offsetY };
};
