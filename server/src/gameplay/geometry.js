"use strict";

const { TILE_SIZE, PLAYER_HITBOX_GAP } = require("./constants");

const RECT_GAP = PLAYER_HITBOX_GAP;
const PLAYER_RECT_SIZE = TILE_SIZE - (RECT_GAP * 2);

const cloneRect = (rect) => ({
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h
});

const rectangleCollision = (rect1, rect2) => {
    const r1 = cloneRect(rect1);
    const r2 = cloneRect(rect2);

    r1.w += r1.x;
    r1.h += r1.y;
    r2.w += r2.x;
    r2.h += r2.y;

    if (r1.w <= r2.x) {
        return false;
    }
    if (r2.w <= r1.x) {
        return false;
    }
    if (r1.h <= r2.y) {
        return false;
    }
    if (r2.h <= r1.y) {
        return false;
    }
    return true;
};

const createBulletRect = (bullet) => ({
    x: bullet.x,
    y: bullet.y,
    w: 4,
    h: 4
});

const getPlayerRect = (player) => {
    const px = Number.isFinite(player.offset?.x) ? player.offset.x : 0;
    const py = Number.isFinite(player.offset?.y) ? player.offset.y : 0;
    return {
        x: Math.floor(px + RECT_GAP),
        y: Math.floor(py + RECT_GAP),
        w: PLAYER_RECT_SIZE,
        h: PLAYER_RECT_SIZE
    };
};

module.exports = {
    rectangleCollision,
    createBulletRect,
    getPlayerRect
};
