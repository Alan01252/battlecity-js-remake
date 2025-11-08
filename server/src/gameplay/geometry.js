"use strict";

const { TILE_SIZE, PLAYER_HITBOX_GAP } = require("./constants");

const RECT_GAP = PLAYER_HITBOX_GAP;
const PLAYER_RECT_SIZE = TILE_SIZE - (RECT_GAP * 2);

const rectangleCollision = (rect1, rect2) => {
    const r1x1 = rect1.x;
    const r1y1 = rect1.y;
    const r1x2 = r1x1 + rect1.w;
    const r1y2 = r1y1 + rect1.h;

    const r2x1 = rect2.x;
    const r2y1 = rect2.y;
    const r2x2 = r2x1 + rect2.w;
    const r2y2 = r2y1 + rect2.h;

    if (r1x2 <= r2x1) {
        return false;
    }
    if (r2x2 <= r1x1) {
        return false;
    }
    if (r1y2 <= r2y1) {
        return false;
    }
    if (r2y2 <= r1y1) {
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
