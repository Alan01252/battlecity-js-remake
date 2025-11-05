"use strict";

const clamp = (v, mn, mx) => (v < mn ? mn : v > mx ? mx : v);

const wrapDirection = (d) => {
  if (!Number.isFinite(d)) return 0;
  const n = Math.round(d);
  return ((n % 32) + 32) % 32;
};

const vectorToDirection = (dx, dy, fallback = 0) => {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return fallback;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return fallback;
  const theta = Math.atan2(-dx, -dy);
  let dir = Math.round((-theta / Math.PI) * 16);
  dir %= 32;
  if (dir < 0) dir += 32;
  return dir;
};

const directionDelta = (from, to) => {
  const a = wrapDirection(from);
  const b = wrapDirection(to);
  let d = b - a;
  d = ((d + 16) % 32) - 16;
  return Math.abs(d);
};

const stepDirectionTowards = (from, to, maxStep = 1) => {
  const a = wrapDirection(from);
  const b = wrapDirection(to);
  let d = b - a;
  d = ((d + 16) % 32) - 16;
  const clamped = Math.max(-Math.abs(maxStep), Math.min(Math.abs(maxStep), d));
  return wrapDirection(a + clamped);
};

const distance2 = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

const playerRectFromCenter = (cx, cy, size) => ({
  x: Math.floor(cx - size / 2),
  y: Math.floor(cy - size / 2),
  w: size,
  h: size
});

const rectsTouchOrOverlap = (a, b) => !(
  a.x + a.w < b.x ||
  a.x > b.x + b.w ||
  a.y + a.h < b.y ||
  a.y > b.y + b.h
);

const safeParse = (payload, warn = () => {}) => {
  if (payload == null) return null;
  if (typeof payload === "object") return payload;
  if (typeof payload !== "string") return null;
  try {
    return JSON.parse(payload);
  } catch (err) {
    warn(`Failed to parse payload: ${err.message}`);
    return null;
  }
};

module.exports = {
  clamp,
  wrapDirection,
  vectorToDirection,
  directionDelta,
  stepDirectionTowards,
  distance2,
  playerRectFromCenter,
  rectsTouchOrOverlap,
  safeParse
};
