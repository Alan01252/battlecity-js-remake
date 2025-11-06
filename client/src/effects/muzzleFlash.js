const DIRECTION_STEPS = 32;
const DEFAULT_BASE_OFFSET = 24;
const DEFAULT_DISTANCE = 30;

export const normaliseDirection = (value) => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const rounded = Math.round(value);
    const normalised = rounded % DIRECTION_STEPS;
    if (normalised < 0) {
        return normalised + DIRECTION_STEPS;
    }
    return normalised;
};

export const computeTankMuzzlePosition = (offset, direction, options = {}) => {
    const dir = normaliseDirection(direction);
    if (!offset) {
        return {
            x: 0,
            y: 0,
            direction: dir
        };
    }
    const baseOffset = Number.isFinite(options.baseOffset) ? options.baseOffset : DEFAULT_BASE_OFFSET;
    const distance = Number.isFinite(options.distance) ? options.distance : DEFAULT_DISTANCE;
    const angleDegrees = (dir / DIRECTION_STEPS) * 360;
    const radians = (angleDegrees * Math.PI) / 180;
    const baseX = (Number(offset.x) || 0) + baseOffset;
    const baseY = (Number(offset.y) || 0) + baseOffset;
    const xComponent = Math.sin(radians);
    const yComponent = Math.cos(radians) * -1;
    return {
        x: baseX + (xComponent * distance),
        y: baseY + (yComponent * distance),
        direction: dir,
        vector: {
            x: xComponent,
            y: yComponent
        }
    };
};

const spawnMuzzleFlash = (game, x, y) => {
    if (!game || !Array.isArray(game.explosions)) {
        return;
    }
    const posX = Number(x);
    const posY = Number(y);
    if (!Number.isFinite(posX) || !Number.isFinite(posY)) {
        return;
    }
    game.explosions.push({
        x: posX,
        y: posY,
        frame: 0,
        nextFrameTick: null,
        variant: 'muzzle'
    });
};

export default spawnMuzzleFlash;
