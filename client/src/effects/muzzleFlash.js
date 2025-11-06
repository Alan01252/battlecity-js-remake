import FRAMED_MUZZLE_OFFSETS, { STEP_MUZZLE_OFFSETS } from '../data/muzzleOffsets.js';

const DIRECTION_STEPS = 32;
const TILE_CENTER = 24;

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
    const baseX = (Number(offset.x) || 0) + TILE_CENTER;
    const baseY = (Number(offset.y) || 0) + TILE_CENTER;
    const stepFloat = dir % STEP_MUZZLE_OFFSETS.length;
    const baseStep = Math.floor(stepFloat);
    const nextStep = (baseStep + 1) % STEP_MUZZLE_OFFSETS.length;
    const t = stepFloat - baseStep;
    const baseOffset = STEP_MUZZLE_OFFSETS[baseStep];
    const nextOffset = STEP_MUZZLE_OFFSETS[nextStep];
    const stepOffset = {
        x: (baseOffset?.x ?? 0) * (1 - t) + (nextOffset?.x ?? 0) * t,
        y: (baseOffset?.y ?? 0) * (1 - t) + (nextOffset?.y ?? 0) * t
    };
    const frameIndex = Number.isFinite(options.frameIndex)
        ? Math.max(0, Math.min(FRAMED_MUZZLE_OFFSETS.length - 1, Math.floor(options.frameIndex)))
        : Math.floor(dir / 2) % FRAMED_MUZZLE_OFFSETS.length;
    const muzzleOffset = stepOffset || FRAMED_MUZZLE_OFFSETS[frameIndex] || { x: 0, y: -20 };
    const muzzleX = baseX + muzzleOffset.x;
    const muzzleY = baseY + muzzleOffset.y;
    const magnitude = Math.hypot(muzzleOffset.x, muzzleOffset.y);
    const xComponent = magnitude > 0 ? (muzzleOffset.x / magnitude) : 0;
    const yComponent = magnitude > 0 ? (muzzleOffset.y / magnitude) : -1;
    return {
        x: muzzleX,
        y: muzzleY,
        direction: dir,
        vector: {
            x: xComponent,
            y: yComponent
        },
        frameIndex
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
