"use strict";

const ITEM_TYPES = Object.freeze({
    CLOAK: 0,
    ROCKET: 1,
    MEDKIT: 2,
    BOMB: 3,
    MINE: 4,
    ORB: 5,
    FLARE: 6,
    DFG: 7,
    WALL: 8,
    TURRET: 9,
    SLEEPER: 10,
    PLASMA: 11,
    LASER: 12,
});

const ITEM_TYPE_ALIASES = new Map([
    ['cloak', ITEM_TYPES.CLOAK],
    ['rocket', ITEM_TYPES.ROCKET],
    ['bazooka', ITEM_TYPES.ROCKET],
    ['medkit', ITEM_TYPES.MEDKIT],
    ['medkit_factory', ITEM_TYPES.MEDKIT],
    ['bomb', ITEM_TYPES.BOMB],
    ['mine', ITEM_TYPES.MINE],
    ['orb', ITEM_TYPES.ORB],
    ['flare', ITEM_TYPES.FLARE],
    ['dfg', ITEM_TYPES.DFG],
    ['wall', ITEM_TYPES.WALL],
    ['turret', ITEM_TYPES.TURRET],
    ['sleeper', ITEM_TYPES.SLEEPER],
    ['plasma', ITEM_TYPES.PLASMA],
    ['plasma_cannon', ITEM_TYPES.PLASMA],
    ['laser', ITEM_TYPES.LASER],
]);

const normalizeItemType = (value, fallback = null) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const numeric = Math.max(0, Math.floor(value));
        return Number.isFinite(numeric) ? numeric : fallback;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        if (!trimmed.length) {
            return fallback;
        }
        if (ITEM_TYPE_ALIASES.has(trimmed)) {
            return ITEM_TYPE_ALIASES.get(trimmed);
        }
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) {
            return Math.max(0, Math.floor(parsed));
        }
    }
    return fallback;
};

module.exports = {
    ITEM_TYPES,
    normalizeItemType,
};
