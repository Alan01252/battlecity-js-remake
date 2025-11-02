"use strict";

const citySpawns = require('../../shared/citySpawns.json');
const fakeCityConfig = require('../../shared/fakeCities.json');
const {
    TILE_SIZE,
    MAX_HEALTH,
    PLAYER_HITBOX_GAP,
    COMMAND_CENTER_WIDTH_TILES,
    COMMAND_CENTER_HEIGHT_TILES
} = require('./gameplay/constants');
const { rectangleCollision } = require('./gameplay/geometry');
const { isCommandCenter } = require('./constants');

const DEFENSE_ITEM_TYPES = Object.freeze({
    turret: 9,
    turrets: 9,
    plasma: 11,
    'plasma_cannon': 11,
    'plasma cannon': 11,
    sleeper: 10,
    sleepers: 10,
    'sleeper_turret': 10,
});

const RECRUIT_DEFAULT_COUNT = 2;
const RECRUIT_RESPAWN_DELAY_MS = 45000;
const RECRUIT_THINK_INTERVAL_MS = 120;
const RECRUIT_TARGET_REFRESH_MS = 900;
const RECRUIT_SHOOT_INTERVAL_MS = 1400;
const RECRUIT_SHOOT_JITTER_MS = 400;
const RECRUIT_DETECTION_RADIUS = TILE_SIZE * 18;
const RECRUIT_MAX_RANGE = TILE_SIZE * 18;
const RECRUIT_MAX_RANGE_SQUARED = RECRUIT_MAX_RANGE * RECRUIT_MAX_RANGE;
const RECRUIT_MUZZLE_OFFSET = (TILE_SIZE / 2) + 6;
const RECRUIT_PATROL_MARGIN_TILES = 2;
const RECRUIT_PATROL_SPEED = 0.24;
const RECRUIT_PATROL_POINT_THRESHOLD = TILE_SIZE * 0.75;
const RECRUIT_MAX_TICK_MS = 160;
const RECRUIT_SIMULATION_STEP_MS = 16;
const RECRUIT_MAX_SIM_STEPS = 12;
const RECRUIT_MIN_MOVEMENT_DELTA = 0.25;
const MAP_SIZE_TILES = 512;
const MAP_PIXEL_SIZE = MAP_SIZE_TILES * TILE_SIZE;
const MAP_MAX_COORD = (MAP_PIXEL_SIZE) - TILE_SIZE;
const SPRITE_GAP = PLAYER_HITBOX_GAP;
const PLAYER_RECT_SIZE = TILE_SIZE - (SPRITE_GAP * 2);
const AVOIDANCE_ANGLES = Object.freeze([Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]);
const RECRUIT_STUCK_TIMEOUT_MS = 5000;
const NAV_MAX_NODES = 6000;
const ARRIVE_RADIUS_PX = TILE_SIZE * 0.7;
const REPATH_STALL_MS = 650;
const LOS_RECHECK_MS = 300;
const PATH_REBUILD_COOLDOWN_MS = 350;
const OPTIMAL_RANGE_PX = TILE_SIZE * 12;
const KITE_RANGE_PX = TILE_SIZE * 16;
const BULLET_SPEED_PX_PER_S = TILE_SIZE * 28;
const AVOID_PROBE_PX = 20;
const SEPARATION_MIN_PX = 22;
const SEPARATION_STRENGTH = 0.6;
const PATH_WAYPOINT_REACH_PX = TILE_SIZE * 0.3;
const LAST_SEEN_TIMEOUT_MS = 2000;
const VISITED_TILE_LRU_SIZE = 10;
const FLANK_SAMPLE_ANGLES = Object.freeze([Math.PI / 2, -Math.PI / 2, Math.PI / 3, -Math.PI / 3]);
const RETREAT_HEALTH_FRACTION = 0.3;
const KITE_HEALTH_FRACTION = 0.55;
const FRIENDLY_FIRE_BUFFER_PX = TILE_SIZE * 0.5;

const RECRUIT_POSITION_PATTERNS = Object.freeze([
    { dx: -TILE_SIZE, dy: TILE_SIZE / 2, direction: 16 },
    { dx: TILE_SIZE, dy: TILE_SIZE / 2, direction: 16 },
    { dx: -TILE_SIZE / 2, dy: -TILE_SIZE / 2, direction: 16 },
    { dx: TILE_SIZE / 2, dy: -TILE_SIZE / 2, direction: 16 },
]);

const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) {
        return min;
    }
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

const distanceSquared = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return (dx * dx) + (dy * dy);
};

const vectorToDirection = (dx, dy, fallback = 0) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return fallback;
    }
    const lengthSq = (dx * dx) + (dy * dy);
    if (lengthSq < 1e-4) {
        return fallback;
    }
    const length = Math.sqrt(lengthSq);
    const normX = dx / length;
    const normY = dy / length;
    const theta = Math.atan2(normX, normY);
    let direction = Math.round((-theta / Math.PI) * 16);
    direction %= 32;
    if (direction < 0) {
        direction += 32;
    }
    return direction;
};

const directionToUnitVector = (direction) => {
    if (!Number.isFinite(direction)) {
        return { x: 0, y: -1 };
    }
    const angle = (-direction / 16) * Math.PI;
    const x = Math.sin(angle) * -1;
    const y = Math.cos(angle) * -1;
    const length = Math.sqrt((x * x) + (y * y));
    if (length < 1e-4) {
        return { x: 0, y: -1 };
    }
    return {
        x: x / length,
        y: y / length
    };
};

const wrapDirection = (direction, fallback = 0) => {
    if (!Number.isFinite(direction)) {
        return ((Math.round(fallback) % 32) + 32) % 32;
    }
    return ((Math.round(direction) % 32) + 32) % 32;
};

const directionDelta = (from, to) => {
    const current = wrapDirection(from, 0);
    const target = wrapDirection(to, current);
    let diff = target - current;
    diff = ((diff + 16) % 32) - 16;
    return Math.abs(diff);
};

const stepDirectionTowards = (from, to, maxStep = 1) => {
    const current = wrapDirection(from, 0);
    const target = wrapDirection(to, current);
    let diff = target - current;
    diff = ((diff + 16) % 32) - 16;
    const bounded = Math.max(-Math.abs(maxStep), Math.min(Math.abs(maxStep), diff));
    return wrapDirection(current + bounded, current);
};

const rotateArray = (values, offset = 0) => {
    if (!Array.isArray(values) || !values.length) {
        return [];
    }
    const length = values.length;
    const normalized = ((Math.floor(offset) % length) + length) % length;
    if (normalized === 0) {
        return values.map((entry) => (entry ? { ...entry } : entry));
    }
    const result = [];
    for (let index = 0; index < length; index += 1) {
        const source = values[(index + normalized) % length];
        result.push(source ? { ...source } : source);
    }
    return result;
};

const createPatrolVariant = (basePath, options = {}) => {
    if (!Array.isArray(basePath) || !basePath.length) {
        return [];
    }
    const rotation = Number.isFinite(options.rotation) ? options.rotation : 0;
    const rotated = rotateArray(basePath, rotation);
    return rotated.map((point) => {
        const px = point?.x ?? 0;
        const py = point?.y ?? 0;
        return {
            x: clamp(px, 0, MAP_MAX_COORD),
            y: clamp(py, 0, MAP_MAX_COORD)
        };
    });
};

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

const normalizeVector = (dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return null;
    }
    const length = Math.sqrt((dx * dx) + (dy * dy));
    if (length < 1e-4) {
        return null;
    }
    return {
        dx: dx / length,
        dy: dy / length
    };
};

const rotateVector = (vector, angle) => {
    if (!vector) {
        return null;
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = (vector.dx * cos) - (vector.dy * sin);
    const dy = (vector.dx * sin) + (vector.dy * cos);
    return normalizeVector(dx, dy);
};

const pixelToTile = (px, py) => ({
    x: clampTileIndex(px / TILE_SIZE),
    y: clampTileIndex(py / TILE_SIZE)
});

const tileToPixelCenter = (tileX, tileY) => ({
    x: (tileX * TILE_SIZE) + (TILE_SIZE / 2),
    y: (tileY * TILE_SIZE) + (TILE_SIZE / 2)
});

const tileToOffsetOrigin = (tileX, tileY) => ({
    x: clamp(tileX * TILE_SIZE, 0, MAP_MAX_COORD),
    y: clamp(tileY * TILE_SIZE, 0, MAP_MAX_COORD)
});

const seekArrive = (current, target, maxSpeedPxPerMs, arriveRadiusPx) => {
    if (!current || !target) {
        return null;
    }
    const dx = (target.x ?? 0) - (current.x ?? 0);
    const dy = (target.y ?? 0) - (current.y ?? 0);
    const distSq = (dx * dx) + (dy * dy);
    if (!Number.isFinite(distSq) || distSq < 1e-5) {
        return null;
    }
    let speed = maxSpeedPxPerMs;
    if (arriveRadiusPx > 0) {
        const dist = Math.sqrt(distSq);
        if (dist < arriveRadiusPx) {
            const scaled = maxSpeedPxPerMs * (dist / arriveRadiusPx);
            speed = Math.max(Math.min(maxSpeedPxPerMs, scaled), maxSpeedPxPerMs * 0.1);
        }
    }
    const dist = Math.sqrt(distSq);
    if (dist < 1e-5) {
        return null;
    }
    const scale = speed / dist;
    return {
        dx: dx * scale,
        dy: dy * scale
    };
};

const avoidanceAdjust = (position, velocity, maxSpeedPxPerMs, navGrid, isTileBlocked) => {
    if (!position || !velocity || !navGrid || typeof isTileBlocked !== 'function') {
        return velocity;
    }
    const speed = Math.sqrt((velocity.dx * velocity.dx) + (velocity.dy * velocity.dy));
    if (!Number.isFinite(speed) || speed < 1e-4) {
        return velocity;
    }
    const unit = {
        dx: velocity.dx / speed,
        dy: velocity.dy / speed
    };
    const probeDistance = Math.max(AVOID_PROBE_PX, maxSpeedPxPerMs * RECRUIT_SIMULATION_STEP_MS * 1.5);
    const forward = pixelToTile(position.x + (unit.dx * probeDistance), position.y + (unit.dy * probeDistance));
    if (!isTileBlocked(forward.x, forward.y)) {
        return velocity;
    }
    const checkBlocked = (vector) => {
        if (!vector) {
            return true;
        }
        const probeX = position.x + (vector.dx * probeDistance);
        const probeY = position.y + (vector.dy * probeDistance);
        const tile = pixelToTile(probeX, probeY);
        return isTileBlocked(tile.x, tile.y);
    };
    const left = rotateVector(unit, Math.PI / 4);
    const right = rotateVector(unit, -Math.PI / 4);
    const back = rotateVector(unit, Math.PI);
    const leftBlocked = checkBlocked(left);
    const rightBlocked = checkBlocked(right);
    let candidate = null;
    if (!leftBlocked && rightBlocked) {
        candidate = left;
    } else if (!rightBlocked && leftBlocked) {
        candidate = right;
    } else if (!leftBlocked && !rightBlocked) {
        candidate = Math.random() < 0.5 ? left : right;
    } else if (back) {
        candidate = back;
    }
    if (!candidate) {
        return velocity;
    }
    return {
        dx: candidate.dx * speed,
        dy: candidate.dy * speed
    };
};

const separationAdjust = (position, allies, maxSpeedPxPerMs) => {
    if (!position || !Array.isArray(allies) || !allies.length) {
        return { dx: 0, dy: 0 };
    }
    const sourceX = position.x + (TILE_SIZE / 2);
    const sourceY = position.y + (TILE_SIZE / 2);
    let totalDx = 0;
    let totalDy = 0;
    let totalWeight = 0;
    const minDistSq = SEPARATION_MIN_PX * SEPARATION_MIN_PX;
    for (const ally of allies) {
        if (!ally) {
            continue;
        }
        const dx = sourceX - ally.x;
        const dy = sourceY - ally.y;
        const distSq = (dx * dx) + (dy * dy);
        if (!Number.isFinite(distSq) || distSq <= 1e-5 || distSq > minDistSq) {
            continue;
        }
        const dist = Math.sqrt(distSq);
        const strength = (SEPARATION_MIN_PX - dist) / SEPARATION_MIN_PX;
        if (strength <= 0) {
            continue;
        }
        totalDx += (dx / dist) * strength;
        totalDy += (dy / dist) * strength;
        totalWeight += strength;
    }
    if (totalWeight <= 0) {
        return { dx: 0, dy: 0 };
    }
    const scale = (SEPARATION_STRENGTH * maxSpeedPxPerMs) / totalWeight;
    return {
        dx: totalDx * scale,
        dy: totalDy * scale
    };
};

const leadDirection = (shooter, target, bulletSpeedPxPerS, fallbackDirection = 16) => {
    if (!shooter || !target) {
        return fallbackDirection;
    }
    const shooterX = (shooter.offset?.x ?? shooter.x ?? 0) + (TILE_SIZE / 2);
    const shooterY = (shooter.offset?.y ?? shooter.y ?? 0) + (TILE_SIZE / 2);
    const targetX = (target.offset?.x ?? target.x ?? 0) + (TILE_SIZE / 2);
    const targetY = (target.offset?.y ?? target.y ?? 0) + (TILE_SIZE / 2);
    const dx = targetX - shooterX;
    const dy = targetY - shooterY;
    let vx = 0;
    let vy = 0;
    if (target.isMoving && Number.isFinite(target.direction)) {
        const vec = directionToUnitVector(target.direction);
        const targetSpeedPxPerMs = target.speed ?? (RECRUIT_PATROL_SPEED * 0.95);
        const targetSpeedPxPerS = targetSpeedPxPerMs * 1000;
        vx = vec.x * targetSpeedPxPerS;
        vy = vec.y * targetSpeedPxPerS;
    }
    const a = (vx * vx) + (vy * vy) - (bulletSpeedPxPerS * bulletSpeedPxPerS);
    const b = 2 * ((dx * vx) + (dy * vy));
    const c = (dx * dx) + (dy * dy);
    let t = 0;
    if (Math.abs(a) < 1e-6) {
        if (Math.abs(b) < 1e-6) {
            return vectorToDirection(dx, dy, fallbackDirection);
        }
        t = -c / b;
        if (t <= 0 || !Number.isFinite(t)) {
            return vectorToDirection(dx, dy, fallbackDirection);
        }
    } else {
        const discriminant = (b * b) - (4 * a * c);
        if (discriminant < 0) {
            return vectorToDirection(dx, dy, fallbackDirection);
        }
        const sqrt = Math.sqrt(discriminant);
        const t1 = (-b - sqrt) / (2 * a);
        const t2 = (-b + sqrt) / (2 * a);
        t = Math.min(t1, t2);
        if (t <= 0) {
            t = Math.max(t1, t2);
        }
        if (t <= 0 || !Number.isFinite(t)) {
            return vectorToDirection(dx, dy, fallbackDirection);
        }
    }
    const predictedX = targetX + (vx * t);
    const predictedY = targetY + (vy * t);
    return vectorToDirection(predictedX - shooterX, predictedY - shooterY, fallbackDirection);
};

const linePointDistanceSq = (ax, ay, bx, by, px, py) => {
    const abx = bx - ax;
    const aby = by - ay;
    const lengthSq = (abx * abx) + (aby * aby);
    if (lengthSq < 1e-6) {
        return distanceSquared(ax, ay, px, py);
    }
    let t = ((px - ax) * abx + (py - ay) * aby) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + (abx * t);
    const cy = ay + (aby * t);
    return distanceSquared(cx, cy, px, py);
};

const hasFriendlyObstruction = (shooterCenter, targetCenter, alliesCenters) => {
    if (!shooterCenter || !targetCenter || !Array.isArray(alliesCenters) || !alliesCenters.length) {
        return false;
    }
    const ax = shooterCenter.x;
    const ay = shooterCenter.y;
    const bx = targetCenter.x;
    const by = targetCenter.y;
    const lineLengthSq = distanceSquared(ax, ay, bx, by);
    if (lineLengthSq < 1e-6) {
        return false;
    }
    for (const ally of alliesCenters) {
        if (!ally) {
            continue;
        }
        const distSq = linePointDistanceSq(ax, ay, bx, by, ally.x, ally.y);
        if (distSq <= (FRIENDLY_FIRE_BUFFER_PX * FRIENDLY_FIRE_BUFFER_PX)) {
            const abx = bx - ax;
            const aby = by - ay;
            const projection = ((ally.x - ax) * abx + (ally.y - ay) * aby) / lineLengthSq;
            if (projection > 0 && projection < 1) {
                return true;
            }
        }
    }
    return false;
};

const pushVisitedTile = (record, tileX, tileY) => {
    if (!record || !Number.isFinite(tileX) || !Number.isFinite(tileY)) {
        return;
    }
    const key = `${tileX}_${tileY}`;
    if (!Array.isArray(record.visitedTiles)) {
        record.visitedTiles = [];
    }
    const existingIndex = record.visitedTiles.indexOf(key);
    if (existingIndex !== -1) {
        record.visitedTiles.splice(existingIndex, 1);
    }
    record.visitedTiles.push(key);
    if (record.visitedTiles.length > VISITED_TILE_LRU_SIZE) {
        record.visitedTiles.shift();
    }
};

const resolveBlueprintSize = (type) => {
    if (type === 0) {
        return {
            width: COMMAND_CENTER_WIDTH_TILES,
            height: COMMAND_CENTER_HEIGHT_TILES
        };
    }
    return { width: 1, height: 1 };
};

const clampTileIndex = (value) => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(MAP_SIZE_TILES - 1, Math.floor(value)));
};

const calculateLayoutBounds = (layout, baseTileX, baseTileY) => {
    let minTileX = Number.isFinite(baseTileX) ? baseTileX : 0;
    let maxTileX = minTileX;
    let minTileY = Number.isFinite(baseTileY) ? baseTileY : 0;
    let maxTileY = minTileY;

    if (!Array.isArray(layout) || !layout.length) {
        return { minTileX, maxTileX, minTileY, maxTileY };
    }

    layout.forEach((blueprint) => {
        const dx = toFiniteNumber(blueprint?.dx, 0);
        const dy = toFiniteNumber(blueprint?.dy, 0);
        const resolvedX = Math.floor(baseTileX + dx);
        const resolvedY = Math.floor(baseTileY + dy);
        const { width, height } = resolveBlueprintSize(toFiniteNumber(blueprint?.type, null));
        minTileX = Math.min(minTileX, resolvedX);
        minTileY = Math.min(minTileY, resolvedY);
        maxTileX = Math.max(maxTileX, resolvedX + Math.max(0, width - 1));
        maxTileY = Math.max(maxTileY, resolvedY + Math.max(0, height - 1));
    });

    return { minTileX, maxTileX, minTileY, maxTileY };
};

const BLOCKING_TILE_VALUES = new Set([1, 2, 3]);

const isBlockingTileValue = (value) => {
    if (value === null || value === undefined) {
        return false;
    }
    if (BLOCKING_TILE_VALUES.has(value)) {
        return true;
    }
    return false;
};

const clampPixel = (value) => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value < 0) {
        return 0;
    }
    if (value > MAP_PIXEL_SIZE - 1) {
        return MAP_PIXEL_SIZE - 1;
    }
    return value;
};

const createPlayerRectAt = (x, y) => ({
    x: Math.floor(x + SPRITE_GAP),
    y: Math.floor(y + SPRITE_GAP),
    w: PLAYER_RECT_SIZE,
    h: PLAYER_RECT_SIZE
});

const getBuildingFootprint = (building) => {
    if (!building) {
        return { width: 1, height: 1 };
    }
    const type = Number.isFinite(building.type) ? building.type : null;
    if (type !== null && isCommandCenter(type)) {
        return {
            width: COMMAND_CENTER_WIDTH_TILES,
            height: COMMAND_CENTER_HEIGHT_TILES
        };
    }
    return { width: 1, height: 1 };
};

const BUILDING_HITBOX_PADDING = TILE_SIZE * 0.2;

class FakeCityManager {
    constructor({ game, buildingFactory, playerFactory, hazardManager, defenseManager, bulletFactory }) {
        this.game = game;
        this.buildingFactory = buildingFactory;
        this.playerFactory = playerFactory;
        this.hazardManager = hazardManager || null;
        this.defenseManager = defenseManager || null;
        this.bulletFactory = bulletFactory || null;
        this.config = fakeCityConfig || {};
        this.activeCities = new Map();
        this.nextEvaluation = 0;
        this.io = null;
        this.defenseSequence = 0;
        this.recruits = new Map();
        this.recruitsByCity = new Map();
        this.recruitSequence = 0;
        this.navGrid = null;
        this.debug = require('debug')('BattleCity:FakeCityManager');
    }

    setIo(io) {
        this.io = io;
    }

    update(now = Date.now()) {
        this.updateRecruits(now);
        const interval = toFiniteNumber(this.config.evaluationIntervalMs, 10000);
        if (now < this.nextEvaluation) {
            return;
        }
        this.nextEvaluation = now + interval;

        const humanCount = this.getHumanPlayerCount();
        const minPlayers = Math.max(0, toFiniteNumber(this.config.minPlayers, 16));
        const configured = this.getConfiguredCities();
        const maxActive = Math.min(configured.length, Math.max(0, toFiniteNumber(this.config.maxActive, configured.length)));
        const desired = Math.min(maxActive, Math.max(0, minPlayers - humanCount));

        if (desired > this.activeCities.size) {
            this.spawnFakeCities(desired - this.activeCities.size, configured);
        } else if (desired < this.activeCities.size) {
            this.removeFakeCities(this.activeCities.size - desired);
        }
    }

    getHumanPlayerCount() {
        const players = this.game?.players || {};
        let count = 0;
        for (const player of Object.values(players)) {
            if (!player) {
                continue;
            }
            if (player.isFake) {
                continue;
            }
            if (player.isSpectator) {
                continue;
            }
            count += 1;
        }
        return count;
    }

    getConfiguredCities() {
        const entries = Array.isArray(this.config.cities) ? this.config.cities : [];
        return entries.filter((entry) => Number.isFinite(toFiniteNumber(entry?.cityId, NaN)));
    }

    buildPatrolPath(entry, baseTileX, baseTileY, layout) {
        const resolvedLayout = Array.isArray(layout) && layout.length
            ? layout
            : (Array.isArray(entry?.layout) && entry.layout.length
                ? entry.layout
                : (Array.isArray(this.config.layout) ? this.config.layout : []));

        const bounds = calculateLayoutBounds(resolvedLayout, baseTileX, baseTileY);
        const margin = Math.max(0, toFiniteNumber(entry?.patrolMarginTiles, RECRUIT_PATROL_MARGIN_TILES));

        const leftTile = clampTileIndex(bounds.minTileX - margin);
        const rightTile = clampTileIndex(bounds.maxTileX + margin);
        const topTile = clampTileIndex(bounds.minTileY - margin);
        const bottomTile = clampTileIndex(bounds.maxTileY + margin);

        if (leftTile >= rightTile || topTile >= bottomTile) {
            return [];
        }

        const candidatePoints = [
            { x: clamp(leftTile * TILE_SIZE, 0, MAP_MAX_COORD), y: clamp(topTile * TILE_SIZE, 0, MAP_MAX_COORD) },
            { x: clamp(rightTile * TILE_SIZE, 0, MAP_MAX_COORD), y: clamp(topTile * TILE_SIZE, 0, MAP_MAX_COORD) },
            { x: clamp(rightTile * TILE_SIZE, 0, MAP_MAX_COORD), y: clamp(bottomTile * TILE_SIZE, 0, MAP_MAX_COORD) },
            { x: clamp(leftTile * TILE_SIZE, 0, MAP_MAX_COORD), y: clamp(bottomTile * TILE_SIZE, 0, MAP_MAX_COORD) }
        ];

        const path = [];
        candidatePoints.forEach((point) => {
            if (!point) {
                return;
            }
            const last = path[path.length - 1];
            if (!last || last.x !== point.x || last.y !== point.y) {
                path.push(point);
            }
        });

        if (path.length >= 3) {
            const first = path[0];
            const last = path[path.length - 1];
            if (first.x === last.x && first.y === last.y) {
                path.pop();
            }
        }

        return path;
    }

    getPatrolPathForCity(cityId) {
        if (!Number.isFinite(cityId)) {
            return [];
        }
        const record = this.activeCities.get(cityId);
        if (!record) {
            return [];
        }
        const path = Array.isArray(record.patrolPath) ? record.patrolPath : [];
        return path.length ? path : [];
    }

    ensureRecruitPatrolState(record) {
        if (!record) {
            return;
        }
        const basePath = this.getPatrolPathForCity(record.cityId);
        if (!Array.isArray(basePath) || !basePath.length) {
            record.patrolVariant = [];
            record.patrolIndex = 0;
            return;
        }
        if (record.patrolDirection !== 1 && record.patrolDirection !== -1) {
            record.patrolDirection = Math.random() < 0.5 ? -1 : 1;
        }
        if (!Number.isFinite(record.patrolThreshold)) {
            record.patrolThreshold = RECRUIT_PATROL_POINT_THRESHOLD;
        }
        if (!Number.isFinite(record.patrolStopDistance)) {
            record.patrolStopDistance = TILE_SIZE * 0.6;
        }
        if (!Array.isArray(record.patrolVariant) || record.patrolVariant.length !== basePath.length) {
            const rotation = Math.floor(Math.random() * basePath.length);
            record.patrolVariant = createPatrolVariant(basePath, { rotation });
            record.patrolIndex = 0;
        }
        const length = record.patrolVariant.length;
        if (length) {
            const normalized = Number.isFinite(record.patrolIndex) ? Math.floor(record.patrolIndex) : 0;
            record.patrolIndex = ((normalized % length) + length) % length;
        } else {
            record.patrolIndex = 0;
        }
    }

    getRecruitPatrolPath(record) {
        if (!record) {
            return [];
        }
        this.ensureRecruitPatrolState(record);
        if (Array.isArray(record.patrolVariant) && record.patrolVariant.length) {
            return record.patrolVariant;
        }
        return this.getPatrolPathForCity(record.cityId);
    }

    selectPatrolIndexForTarget(record, targetX, targetY) {
        if (!record) {
            return null;
        }
        const path = this.getRecruitPatrolPath(record);
        if (!Array.isArray(path) || !path.length) {
            return null;
        }
        const length = path.length;
        const currentIndex = Number.isFinite(record.patrolIndex) ? Math.floor(record.patrolIndex) : 0;
        const baseIndex = ((currentIndex % length) + length) % length;
        const basePoint = path[baseIndex];
        if (!basePoint) {
            return null;
        }
        let bestIndex = baseIndex;
        let bestDistance = distanceSquared(basePoint.x ?? 0, basePoint.y ?? 0, targetX, targetY);
        let bestDirection = (record.patrolDirection === -1) ? -1 : 1;
        const searchRadius = Math.min(Math.max(2, Math.ceil(length / 4)), Math.max(2, length - 1));
        const improvementThreshold = (TILE_SIZE * TILE_SIZE) * 0.3;

        for (let offset = -searchRadius; offset <= searchRadius; offset += 1) {
            if (offset === 0) {
                continue;
            }
            const candidateIndex = (baseIndex + offset + length) % length;
            const point = path[candidateIndex];
            if (!point) {
                continue;
            }
            const distSq = distanceSquared(point.x ?? 0, point.y ?? 0, targetX, targetY);
            if (distSq + improvementThreshold < bestDistance) {
                bestDistance = distSq;
                bestIndex = candidateIndex;
                bestDirection = offset > 0 ? 1 : -1;
            }
        }

        return {
            index: bestIndex,
            direction: bestDirection,
            point: path[bestIndex]
        };
    }

    getMapValue(tileX, tileY) {
        const map = this.game?.map;
        if (!Array.isArray(map) || !Array.isArray(map[0])) {
            return 0;
        }
        if (tileX < 0 || tileY < 0 || tileX >= MAP_SIZE_TILES || tileY >= MAP_SIZE_TILES) {
            return 0;
        }
        const column = map[tileX];
        if (!Array.isArray(column)) {
            return 0;
        }
        const value = column[tileY];
        if (value === undefined || value === null) {
            return 0;
        }
        return value;
    }

    hitsEdges(rect) {
        if (!rect) {
            return true;
        }
        if (rect.x < 0 || rect.y < 0) {
            return true;
        }
        if ((rect.x + rect.w) > MAP_PIXEL_SIZE) {
            return true;
        }
        if ((rect.y + rect.h) > MAP_PIXEL_SIZE) {
            return true;
        }
        return false;
    }

    hitsBlockingTile(rect) {
        if (!rect) {
            return false;
        }
        const startTileX = Math.max(0, Math.floor(rect.x / TILE_SIZE));
        const endTileX = Math.min(MAP_SIZE_TILES - 1, Math.floor((rect.x + rect.w - 1) / TILE_SIZE));
        const startTileY = Math.max(0, Math.floor(rect.y / TILE_SIZE));
        const endTileY = Math.min(MAP_SIZE_TILES - 1, Math.floor((rect.y + rect.h - 1) / TILE_SIZE));

        for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
            for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
                const value = this.getMapValue(tileX, tileY);
                if (isBlockingTileValue(value)) {
                    return true;
                }
            }
        }
        return false;
    }

    hitsBuildings(rect) {
        if (!rect) {
            return false;
        }
        const factory = this.buildingFactory;
        if (!factory || !factory.buildings || typeof factory.buildings.values !== 'function') {
            return false;
        }
        for (const building of factory.buildings.values()) {
            if (!building) {
                continue;
            }
            const tileX = Number.isFinite(building.x) ? Math.floor(building.x) : null;
            const tileY = Number.isFinite(building.y) ? Math.floor(building.y) : null;
            if (tileX === null || tileY === null) {
                continue;
            }
            const footprint = getBuildingFootprint(building);
            const width = Math.max(1, Number.isFinite(footprint.width) ? footprint.width : 1);
            const height = Math.max(1, Number.isFinite(footprint.height) ? footprint.height : 1);
            const padding = BUILDING_HITBOX_PADDING;
            const buildingRect = {
                x: (tileX * TILE_SIZE) + padding,
                y: (tileY * TILE_SIZE) + padding,
                w: Math.max(TILE_SIZE * width - (padding * 2), TILE_SIZE * 0.5),
                h: Math.max(TILE_SIZE * height - (padding * 2), TILE_SIZE * 0.5)
            };
            if (rectangleCollision(rect, buildingRect)) {
                return true;
            }
        }
        return false;
    }

    isBlocked(x, y) {
        const rect = createPlayerRectAt(clampPixel(x), clampPixel(y));
        if (this.hitsEdges(rect)) {
            return true;
        }
        if (this.hitsBlockingTile(rect)) {
            return true;
        }
        if (this.hitsBuildings(rect)) {
            return true;
        }
        return false;
    }

    ensureSpawnIsClear(spawn) {
        if (!spawn) {
            return spawn;
        }
        if (!this.isBlocked(spawn.x, spawn.y)) {
            return spawn;
        }
        this.debug(`[recruit fallback] spawn blocked at (${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}) searching alternatives`);
        const offsets = [
            { dx: TILE_SIZE, dy: 0 },
            { dx: -TILE_SIZE, dy: 0 },
            { dx: 0, dy: TILE_SIZE },
            { dx: 0, dy: -TILE_SIZE },
            { dx: TILE_SIZE * 0.75, dy: TILE_SIZE * 0.75 },
            { dx: -TILE_SIZE * 0.75, dy: TILE_SIZE * 0.75 },
            { dx: TILE_SIZE * 0.75, dy: -TILE_SIZE * 0.75 },
            { dx: -TILE_SIZE * 0.75, dy: -TILE_SIZE * 0.75 }
        ];
        for (const offset of offsets) {
            const candidateX = clamp(spawn.x + offset.dx, 0, MAP_MAX_COORD);
            const candidateY = clamp(spawn.y + offset.dy, 0, MAP_MAX_COORD);
            if (!this.isBlocked(candidateX, candidateY)) {
                this.debug(`[recruit fallback] spawn moved to (${candidateX.toFixed(1)}, ${candidateY.toFixed(1)})`);
                return Object.assign({}, spawn, { x: candidateX, y: candidateY });
            }
        }
        return spawn;
    }

    tryMoveWithVector(px, py, vector, step) {
        if (!vector) {
            return null;
        }
        const nextX = clamp(px + (vector.dx * step), 0, MAP_MAX_COORD);
        const nextY = clamp(py + (vector.dy * step), 0, MAP_MAX_COORD);
        if (this.isBlocked(nextX, nextY)) {
            return null;
        }
        const direction = vectorToDirection(vector.dx, vector.dy, 16);
        return {
            x: nextX,
            y: nextY,
            vector,
            direction
        };
    }

    findAlternateVector(baseVector, px, py, step) {
        if (!baseVector) {
            return null;
        }
        for (let index = 0; index < AVOIDANCE_ANGLES.length; index += 1) {
            const rotated = rotateVector(baseVector, AVOIDANCE_ANGLES[index]);
            if (!rotated) {
                continue;
            }
            const attempt = this.tryMoveWithVector(px, py, rotated, step);
            if (attempt) {
                return attempt;
            }
        }
        return null;
    }

    buildNavGrid(force = false) {
        if (!force && this.navGrid) {
            return this.navGrid;
        }
        const width = MAP_SIZE_TILES;
        const height = MAP_SIZE_TILES;
        const total = width * height;
        const tiles = new Uint8Array(total);
        const markBlocked = (tileX, tileY) => {
            if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) {
                return;
            }
            tiles[(tileY * width) + tileX] = 1;
        };

        for (let tileX = 0; tileX < width; tileX += 1) {
            for (let tileY = 0; tileY < height; tileY += 1) {
                const value = this.getMapValue(tileX, tileY);
                if (isBlockingTileValue(value)) {
                    markBlocked(tileX, tileY);
                }
            }
        }

        const factory = this.buildingFactory;
        if (factory && factory.buildings && typeof factory.buildings.values === 'function') {
            for (const building of factory.buildings.values()) {
                if (!building) {
                    continue;
                }
                const baseX = Number.isFinite(building.x) ? Math.floor(building.x) : null;
                const baseY = Number.isFinite(building.y) ? Math.floor(building.y) : null;
                if (baseX === null || baseY === null) {
                    continue;
                }
                const { width: footprintW, height: footprintH } = getBuildingFootprint(building);
                const w = Math.max(1, Number.isFinite(footprintW) ? footprintW : 1);
                const h = Math.max(1, Number.isFinite(footprintH) ? footprintH : 1);
                for (let dx = 0; dx < w; dx += 1) {
                    for (let dy = 0; dy < h; dy += 1) {
                        markBlocked(baseX + dx, baseY + dy);
                    }
                }
            }
        }

        this.navGrid = {
            width,
            height,
            tiles
        };
        return this.navGrid;
    }

    isNavTileBlocked(tileX, tileY) {
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
            return true;
        }
        const nav = this.navGrid || this.buildNavGrid();
        if (!nav) {
            return true;
        }
        if (tileX < 0 || tileY < 0 || tileX >= nav.width || tileY >= nav.height) {
            return true;
        }
        return nav.tiles[(tileY * nav.width) + tileX] === 1;
    }

    losTileRaycast(ax, ay, bx, by) {
        const nav = this.navGrid || this.buildNavGrid();
        if (!nav) {
            return false;
        }
        const start = pixelToTile(ax, ay);
        const end = pixelToTile(bx, by);
        let x = start.x;
        let y = start.y;
        const dx = Math.abs(end.x - x);
        const dy = Math.abs(end.y - y);
        const sx = x < end.x ? 1 : -1;
        const sy = y < end.y ? 1 : -1;
        let err = dx - dy;

        while (true) {
            if (!(x === start.x && y === start.y)) {
                if (this.isNavTileBlocked(x, y)) {
                    return false;
                }
            }
            if (x === end.x && y === end.y) {
                break;
            }
            const e2 = err * 2;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
        }

        return true;
    }

    astar(start, goal, nav = this.navGrid, options = {}) {
        if (!nav) {
            return null;
        }
        const visitedPenalty = options.visitedPenalty instanceof Set ? options.visitedPenalty : null;
        const startKey = `${start.x}_${start.y}`;
        const goalKey = `${goal.x}_${goal.y}`;
        const open = [];
        const openMap = new Map();
        const cameFrom = new Map();
        const gScore = new Map();
        const heuristic = (x, y) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
        const maxNodes = options.maxNodes ?? NAV_MAX_NODES;

        const pushNode = (node) => {
            open.push(node);
            openMap.set(`${node.x}_${node.y}`, node);
        };

        const popLowest = () => {
            let bestIndex = -1;
            let bestNode = null;
            for (let index = 0; index < open.length; index += 1) {
                const candidate = open[index];
                if (!bestNode || candidate.f < bestNode.f) {
                    bestNode = candidate;
                    bestIndex = index;
                }
            }
            if (bestIndex === -1) {
                return null;
            }
            open.splice(bestIndex, 1);
            openMap.delete(`${bestNode.x}_${bestNode.y}`);
            return bestNode;
        };

        pushNode({ x: start.x, y: start.y, g: 0, f: heuristic(start.x, start.y) });
        gScore.set(startKey, 0);
        let expansions = 0;

        while (open.length && expansions < maxNodes) {
            const current = popLowest();
            if (!current) {
                break;
            }
            const currentKey = `${current.x}_${current.y}`;
            if (current.x === goal.x && current.y === goal.y) {
                const path = [];
                let walkerKey = currentKey;
                while (walkerKey && walkerKey !== startKey) {
                    const [px, py] = walkerKey.split('_').map(Number);
                    path.push({ x: px, y: py });
                    walkerKey = cameFrom.get(walkerKey);
                }
                path.reverse();
                if (path.length && path[0].x === start.x && path[0].y === start.y) {
                    path.shift();
                }
                return path;
            }

            expansions += 1;
            const neighbors = [
                { x: current.x + 1, y: current.y },
                { x: current.x - 1, y: current.y },
                { x: current.x, y: current.y + 1 },
                { x: current.x, y: current.y - 1 }
            ];

            for (const neighbor of neighbors) {
                if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= nav.width || neighbor.y >= nav.height) {
                    continue;
                }
                if (this.isNavTileBlocked(neighbor.x, neighbor.y)) {
                    continue;
                }
                const neighborKey = `${neighbor.x}_${neighbor.y}`;
                const penalty = visitedPenalty && visitedPenalty.has(neighborKey) ? 6 : 0;
                const tentativeG = current.g + 1 + penalty;
                const existingG = gScore.get(neighborKey);
                if (existingG !== undefined && tentativeG >= existingG) {
                    continue;
                }
                cameFrom.set(neighborKey, currentKey);
                gScore.set(neighborKey, tentativeG);
                const fScore = tentativeG + heuristic(neighbor.x, neighbor.y);
                const existingNode = openMap.get(neighborKey);
                if (existingNode) {
                    existingNode.g = tentativeG;
                    existingNode.f = fScore;
                } else {
                    pushNode({ x: neighbor.x, y: neighbor.y, g: tentativeG, f: fScore });
                }
            }
        }

        return null;
    }

    pickMode(context) {
        const hasTarget = !!context.target;
        const hasRecentSeen = context.lastSeenAge !== undefined && context.lastSeenAge <= LAST_SEEN_TIMEOUT_MS;
        const rangePx = Number.isFinite(context.rangePx) ? context.rangePx : Infinity;
        const hpFrac = Number.isFinite(context.hpFrac) ? context.hpFrac : 1;
        const targetHpFrac = Number.isFinite(context.targetHpFrac) ? context.targetHpFrac : 1;
        const outnumbered = !!context.outnumbered;

        if (!hasTarget && !hasRecentSeen) {
            return 'patrol';
        }
        if ((hpFrac <= RETREAT_HEALTH_FRACTION) || (outnumbered && hpFrac < 0.6)) {
            return 'retreat';
        }
        if (!context.hasLOS) {
            if (hasRecentSeen) {
                return 'flank';
            }
            return 'patrol';
        }
        if (hpFrac < KITE_HEALTH_FRACTION && (targetHpFrac > hpFrac || rangePx < OPTIMAL_RANGE_PX * 0.8)) {
            return 'kite';
        }
        if (rangePx > OPTIMAL_RANGE_PX * 1.3) {
            return 'engage';
        }
        if (rangePx < OPTIMAL_RANGE_PX * 0.7) {
            return 'kite';
        }
        return 'engage';
    }

    computeGoalTile(options) {
        const { mode, record, player, target, hasLOS, rangePx, lastSeen } = options;
        const px = player.offset?.x ?? 0;
        const py = player.offset?.y ?? 0;
        const shooterCenter = {
            x: px + (TILE_SIZE / 2),
            y: py + (TILE_SIZE / 2)
        };
        const spawn = record.spawn || this.computeRecruitSpawn(record.cityId, null, null, record.slotIndex || 0);

        const makeGoal = (desiredX, desiredY, requiresPathOverride = null) => {
            const tx = clampTileIndex(desiredX / TILE_SIZE);
            const ty = clampTileIndex(desiredY / TILE_SIZE);
            const targetX = clamp(desiredX, 0, MAP_MAX_COORD);
            const targetY = clamp(desiredY, 0, MAP_MAX_COORD);
            const requiresPath = requiresPathOverride !== null
                ? requiresPathOverride
                : this.isBlocked(targetX, targetY);
            return {
                goalTileX: tx,
                goalTileY: ty,
                goalPixelX: targetX,
                goalPixelY: targetY,
                requiresPath
            };
        };

        const targetCenter = target
            ? {
                x: (target.offset?.x ?? target.x ?? 0) + (TILE_SIZE / 2),
                y: (target.offset?.y ?? target.y ?? 0) + (TILE_SIZE / 2)
            }
            : null;

        if (mode === 'patrol') {
            const fallbackDirection = wrapDirection(player.direction ?? 16);
            const patrol = this.resolveRecruitPatrol(record, px, py, fallbackDirection);
            if (patrol && patrol.point) {
                const distance = Math.sqrt(distanceSquared(px, py, patrol.point.x, patrol.point.y));
                const requiresPath = distance > TILE_SIZE * 1.5 || this.isBlocked(patrol.point.x, patrol.point.y);
                return makeGoal(patrol.point.x, patrol.point.y, requiresPath);
            }
            if (spawn) {
                return makeGoal(clamp(spawn.x, 0, MAP_MAX_COORD), clamp(spawn.y, 0, MAP_MAX_COORD), false);
            }
            return null;
        }

        if ((mode === 'engage' || mode === 'kite' || mode === 'retreat') && (targetCenter || lastSeen)) {
            const reference = targetCenter || {
                x: clamp(lastSeen?.x ?? shooterCenter.x, 0, MAP_PIXEL_SIZE),
                y: clamp(lastSeen?.y ?? shooterCenter.y, 0, MAP_PIXEL_SIZE)
            };
            const directionVector = normalizeVector(shooterCenter.x - reference.x, shooterCenter.y - reference.y) || { dx: 0, dy: -1 };
            const desiredRange = mode === 'engage'
                ? OPTIMAL_RANGE_PX
                : KITE_RANGE_PX;
            let desiredCenterX = reference.x + (directionVector.dx * desiredRange);
            let desiredCenterY = reference.y + (directionVector.dy * desiredRange);

            if (mode === 'retreat' && spawn) {
                desiredCenterX = (desiredCenterX * 0.6) + ((spawn.x + (TILE_SIZE / 2)) * 0.4);
                desiredCenterY = (desiredCenterY * 0.6) + ((spawn.y + (TILE_SIZE / 2)) * 0.4);
            }

            const desiredX = clamp(desiredCenterX - (TILE_SIZE / 2), 0, MAP_MAX_COORD);
            const desiredY = clamp(desiredCenterY - (TILE_SIZE / 2), 0, MAP_MAX_COORD);
            const requiresPath = !hasLOS || this.isBlocked(desiredX, desiredY) || rangePx > desiredRange * 1.4;
            return makeGoal(desiredX, desiredY, requiresPath);
        }

        if (mode === 'flank' && (targetCenter || lastSeen)) {
            const reference = targetCenter || {
                x: clamp(lastSeen?.x ?? shooterCenter.x, 0, MAP_PIXEL_SIZE),
                y: clamp(lastSeen?.y ?? shooterCenter.y, 0, MAP_PIXEL_SIZE)
            };
            const baseVector = normalizeVector(shooterCenter.x - reference.x, shooterCenter.y - reference.y) || { dx: 0, dy: -1 };
            let best = null;

            FLANK_SAMPLE_ANGLES.forEach((angle) => {
                const rotated = rotateVector(baseVector, angle);
                if (!rotated) {
                    return;
                }
                const desiredCenterX = reference.x + (rotated.dx * OPTIMAL_RANGE_PX);
                const desiredCenterY = reference.y + (rotated.dy * OPTIMAL_RANGE_PX);
                const desiredX = clamp(desiredCenterX - (TILE_SIZE / 2), 0, MAP_MAX_COORD);
                const desiredY = clamp(desiredCenterY - (TILE_SIZE / 2), 0, MAP_MAX_COORD);
                const los = this.losTileRaycast(desiredCenterX, desiredCenterY, reference.x, reference.y);
                const requiresPath = !los || this.isBlocked(desiredX, desiredY);
                const score = (requiresPath ? 5 : 0) + (los ? 0 : 10) + (distanceSquared(desiredX, desiredY, px, py) / 10000);
                if (!best || score < best.score) {
                    best = {
                        goalTileX: clampTileIndex(desiredX / TILE_SIZE),
                        goalTileY: clampTileIndex(desiredY / TILE_SIZE),
                        goalPixelX: desiredX,
                        goalPixelY: desiredY,
                        requiresPath,
                        score
                    };
                }
            });

            if (best) {
                return {
                    goalTileX: best.goalTileX,
                    goalTileY: best.goalTileY,
                    goalPixelX: best.goalPixelX,
                    goalPixelY: best.goalPixelY,
                    requiresPath: best.requiresPath
                };
            }
        }

        if (spawn) {
            return makeGoal(clamp(spawn.x, 0, MAP_MAX_COORD), clamp(spawn.y, 0, MAP_MAX_COORD), false);
        }
        return null;
    }

    resetRecruitPosition(record, player, now = Date.now()) {
        if (!record || !player) {
            return false;
        }
        let spawn = record.spawn || this.computeRecruitSpawn(record.cityId, null, null, record.slotIndex || 0);
        if (!spawn) {
            return false;
        }
        spawn = this.ensureSpawnIsClear(spawn);
        record.spawn = spawn;
        player.offset.x = spawn.x;
        player.offset.y = spawn.y;
        if (spawn.direction !== undefined) {
            player.direction = spawn.direction;
        }
        player.sequence = (player.sequence || 0) + 1;
        player.isMoving = 0;
        record.mode = 'patrol';
        record.targetId = null;
        record.patrolIndex = 0;
        record.patrolDirection = 1;
        record.nextScanAt = now + RECRUIT_TARGET_REFRESH_MS;
        record.nextShotAt = now + RECRUIT_SHOOT_INTERVAL_MS;
        record.lastMoveTimestamp = now;
        record.stuckCounter = 0;
        record.path = null;
        record.pathIndex = 0;
        record.lastPathBuildAt = 0;
        record.pathGoalKey = null;
        record.lastProgressAt = now;
        record.nextLosCheckAt = now;
        record.lastLosResult = false;
        record.visitedTiles = [];
        record.lastSeenTargetAt = 0;
        record.lastSeenX = null;
        record.lastSeenY = null;
        record.lastMoveX = spawn.x;
        record.lastMoveY = spawn.y;
        this.ensureRecruitPatrolState(record);
        return true;
    }

    resolveRecruitPatrol(record, px, py, fallbackDirection = 16) {
        if (!record) {
            return null;
        }
        const path = this.getRecruitPatrolPath(record);
        if (!path.length) {
            return null;
        }
        const threshold = record.patrolThreshold ?? RECRUIT_PATROL_POINT_THRESHOLD;
        const thresholdSq = threshold * threshold;
        const length = path.length;
        let index = Number.isFinite(record.patrolIndex) ? Math.floor(record.patrolIndex) : 0;
        if (length <= 0) {
            return null;
        }
        index = ((index % length) + length) % length;
        let directionStep = (record.patrolDirection === -1) ? -1 : 1;
        record.patrolDirection = directionStep;

        for (let attempt = 0; attempt < length; attempt += 1) {
            const point = path[index];
            if (!point) {
                index = (index + directionStep + length) % length;
                continue;
            }
            const targetX = clamp(point.x ?? px, 0, MAP_MAX_COORD);
            const targetY = clamp(point.y ?? py, 0, MAP_MAX_COORD);
            const dx = targetX - px;
            const dy = targetY - py;
            const distanceSq = (dx * dx) + (dy * dy);
            if (distanceSq <= thresholdSq) {
                index = (index + directionStep + length) % length;
                record.patrolIndex = index;
                if (Math.random() < 0.05) {
                    directionStep = directionStep === -1 ? 1 : -1;
                    record.patrolDirection = directionStep;
                }
                continue;
            }
            record.patrolIndex = index;
            const direction = vectorToDirection(dx, dy, fallbackDirection);
            const stopDistance = Number.isFinite(record.patrolStopDistance)
                ? Math.max(0, record.patrolStopDistance)
                : 0;
            return {
                point: { x: targetX, y: targetY },
                direction,
                stopDistance
            };
        }

        return null;
    }

    resolveFallbackTarget(record, px, py, fallbackDirection = 16) {
        if (!record) {
            return null;
        }
        const spawn = this.ensureSpawnIsClear(record.spawn || this.computeRecruitSpawn(record.cityId, null, null, record.slotIndex || 0));
        if (!spawn) {
            return null;
        }
        const offsets = [
            { dx: TILE_SIZE * 2, dy: 0 },
            { dx: -TILE_SIZE * 2, dy: 0 },
            { dx: 0, dy: TILE_SIZE * 2 },
            { dx: 0, dy: -TILE_SIZE * 2 },
            { dx: TILE_SIZE * 1.5, dy: TILE_SIZE * 1.5 },
            { dx: -TILE_SIZE * 1.5, dy: TILE_SIZE * 1.5 },
            { dx: TILE_SIZE * 1.5, dy: -TILE_SIZE * 1.5 },
            { dx: -TILE_SIZE * 1.5, dy: -TILE_SIZE * 1.5 }
        ];
        const minDistanceSq = (TILE_SIZE * 0.75) * (TILE_SIZE * 0.75);

        for (const offset of offsets) {
            const targetX = clamp(spawn.x + offset.dx, 0, MAP_MAX_COORD);
            const targetY = clamp(spawn.y + offset.dy, 0, MAP_MAX_COORD);
            if (this.isBlocked(targetX, targetY)) {
                continue;
            }
            const dx = targetX - px;
            const dy = targetY - py;
            const distanceSq = (dx * dx) + (dy * dy);
            if (distanceSq < minDistanceSq) {
                continue;
            }
            const direction = vectorToDirection(dx, dy, fallbackDirection);
            return {
                point: { x: targetX, y: targetY },
                direction,
                stopDistance: TILE_SIZE * 0.6
            };
        }
        return null;
    }

    updateRecruits(now = Date.now()) {
        if (!this.recruits.size) {
            return;
        }
        const players = this.game?.players || {};
        for (const record of this.recruits.values()) {
            if (!record || record.state === 'removed') {
                continue;
            }

            if (record.state === 'pending') {
                this.spawnRecruit(record, { now });
                continue;
            }

            if (record.state === 'dead') {
                if (record.respawnAt && now >= record.respawnAt) {
                    this.spawnRecruit(record, { now });
                }
                continue;
            }

            const player = players[record.id];
            if (!player || player.health <= 0) {
                this.handleRecruitDeath(record, now);
                continue;
            }

            if (record.nextThinkAt && now < record.nextThinkAt) {
                continue;
            }
            record.nextThinkAt = now + RECRUIT_THINK_INTERVAL_MS;
            this.updateRecruitBehaviour(record, player, now);
        }
    }

    spawnRecruit(record, options = {}) {
        if (!record || !this.playerFactory || typeof this.playerFactory.createSystemPlayer !== 'function') {
            return null;
        }
        const now = options.now ?? Date.now();
        const spawn = record.spawn ?? this.computeRecruitSpawn(record.cityId, null, null, record.slotIndex);
        record.spawn = spawn;

        const payload = {
            id: record.id,
            city: record.cityId,
            offset: {
                x: spawn.x,
                y: spawn.y
            },
            direction: spawn.direction ?? 16,
            isMoving: 0,
            isTurning: 0,
            sequence: 0,
            health: MAX_HEALTH,
            isFake: true,
            isFakeRecruit: true
        };

        const player = this.playerFactory.createSystemPlayer(payload, {
            isFake: true,
            isFakeRecruit: true,
            ownerId: record.ownerId ?? `fake_city_${record.cityId}`,
            type: 'fake_recruit',
            broadcast: options.broadcast !== false,
            health: MAX_HEALTH
        });

        if (!player) {
            return null;
        }

        player.direction = spawn.direction ?? player.direction;
        player.offset.x = spawn.x;
        player.offset.y = spawn.y;
        player.health = MAX_HEALTH;
        if (player.callsign) {
            record.callsign = player.callsign;
        }
        record.state = 'active';
        record.mode = 'patrol';
        record.respawnAt = 0;
        record.nextShotAt = now + RECRUIT_SHOOT_INTERVAL_MS;
        record.nextScanAt = now;
        record.nextThinkAt = now + RECRUIT_THINK_INTERVAL_MS;
        record.path = null;
        record.pathIndex = 0;
        record.lastPathBuildAt = 0;
        record.pathGoalKey = null;
        record.lastProgressAt = now;
        record.nextLosCheckAt = now;
        record.lastLosResult = false;
        record.lastSeenTargetAt = 0;
        record.lastSeenX = null;
        record.lastSeenY = null;
        record.visitedTiles = [];
        record.targetId = null;
        record.lastBroadcastAt = now;
        record.lastThinkAt = now;
        this.ensureRecruitPatrolState(record);
        record.lastMoveTimestamp = now;
        record.lastMoveX = spawn.x;
        record.lastMoveY = spawn.y;
        record.stuckCounter = 0;
        player.isMoving = 0;
        const debugLabel = `[recruit ${record.id}]`;
        this.debug(`${debugLabel} spawn ready at (${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}) dir=${player.direction}`);

        return player;
    }

    handleRecruitDeath(record, now = Date.now()) {
        if (!record || record.state === 'removed') {
            return;
        }
        record.state = 'dead';
        record.mode = 'dead';
        record.respawnAt = now + RECRUIT_RESPAWN_DELAY_MS;
        record.targetId = null;
        record.nextShotAt = 0;
        record.nextScanAt = now + RECRUIT_TARGET_REFRESH_MS;
        record.stuckCounter = 0;
    }

    updateRecruitBehaviour(record, player, now) {
        if (!record || !player) {
            return;
        }

        this.ensureRecruitPatrolState(record);

        const players = this.game?.players || {};
        let px = player.offset?.x ?? 0;
        let py = player.offset?.y ?? 0;
        const previousDirection = wrapDirection(player.direction ?? 0);
        const previousMoving = player.isMoving ? 1 : 0;

        if (record.targetId) {
            const tracked = players[record.targetId];
            if (!this.isValidRecruitTarget(record, tracked, px, py)) {
                record.targetId = null;
            }
        }

        if (!record.targetId || !record.nextScanAt || now >= record.nextScanAt) {
            record.targetId = this.acquireRecruitTarget(record, px, py);
            record.nextScanAt = now + RECRUIT_TARGET_REFRESH_MS;
        }

        const target = record.targetId ? players[record.targetId] : null;

        if (!record.lastThinkAt) {
            record.lastThinkAt = now;
        }
        const deltaRaw = now - (record.lastThinkAt || now);
        const deltaMs = Math.max(0, Math.min(deltaRaw, RECRUIT_MAX_TICK_MS));
        record.lastThinkAt = now;

        const shooterCenter = {
            x: px + (TILE_SIZE / 2),
            y: py + (TILE_SIZE / 2)
        };

        let targetCenter = null;
        if (target) {
            targetCenter = {
                x: (target.offset?.x ?? target.x ?? 0) + (TILE_SIZE / 2),
                y: (target.offset?.y ?? target.y ?? 0) + (TILE_SIZE / 2)
            };
        }

        let hasLOS = false;
        let losChanged = false;
        const previousLos = record.lastLosResult === true;
        let lastSeenAge = record.lastSeenTargetAt ? now - record.lastSeenTargetAt : Infinity;

        if (targetCenter) {
            if (!record.nextLosCheckAt || now >= record.nextLosCheckAt) {
                const clear = this.losTileRaycast(shooterCenter.x, shooterCenter.y, targetCenter.x, targetCenter.y);
                record.lastLosResult = !!clear;
                record.nextLosCheckAt = now + LOS_RECHECK_MS;
                losChanged = previousLos !== record.lastLosResult;
            }
            hasLOS = record.lastLosResult === true;
            if (hasLOS) {
                record.lastSeenTargetAt = now;
                record.lastSeenX = targetCenter.x;
                record.lastSeenY = targetCenter.y;
                lastSeenAge = 0;
            } else if (record.lastSeenTargetAt) {
                lastSeenAge = now - record.lastSeenTargetAt;
            }
        }

        const lastSeen = lastSeenAge <= LAST_SEEN_TIMEOUT_MS
            ? {
                x: record.lastSeenX ?? shooterCenter.x,
                y: record.lastSeenY ?? shooterCenter.y
            }
            : null;

        const rangePx = targetCenter
            ? Math.sqrt(distanceSquared(shooterCenter.x, shooterCenter.y, targetCenter.x, targetCenter.y))
            : Infinity;

        const hpFrac = Number.isFinite(player.health) ? Math.max(0, Math.min(1, player.health / MAX_HEALTH)) : 1;
        const targetHpFrac = target && Number.isFinite(target.health)
            ? Math.max(0, Math.min(1, target.health / MAX_HEALTH))
            : 1;

        let nearbyAllies = 0;
        let nearbyEnemies = 0;
        const allyCenters = [];
        const recruitIds = this.recruitsByCity.get(record.cityId) || [];
        for (const recruitId of recruitIds) {
            if (recruitId === record.id) {
                continue;
            }
            const allyPlayer = players[recruitId];
            if (!allyPlayer || allyPlayer.health <= 0) {
                continue;
            }
            const ax = allyPlayer.offset?.x ?? 0;
            const ay = allyPlayer.offset?.y ?? 0;
            if (distanceSquared(px, py, ax, ay) <= (TILE_SIZE * 20) * (TILE_SIZE * 20)) {
                nearbyAllies += 1;
            }
            allyCenters.push({
                x: ax + (TILE_SIZE / 2),
                y: ay + (TILE_SIZE / 2)
            });
        }

        for (const candidate of Object.values(players)) {
            if (!candidate || candidate.id === record.id || candidate.health <= 0) {
                continue;
            }
            const cx = candidate.offset?.x ?? 0;
            const cy = candidate.offset?.y ?? 0;
            if (distanceSquared(px, py, cx, cy) > (TILE_SIZE * 20) * (TILE_SIZE * 20)) {
                continue;
            }
            const candidateCity = Number(candidate.city);
            if (Number.isFinite(candidateCity) && candidateCity === record.cityId) {
                nearbyAllies += 1;
            } else {
                nearbyEnemies += 1;
            }
        }

        const outnumbered = nearbyEnemies > (nearbyAllies + 1);

        const mode = this.pickMode({
            target,
            hasLOS,
            rangePx,
            hpFrac,
            targetHpFrac,
            outnumbered,
            lastSeenAge
        });

        record.mode = mode;

        if (!record.lastProgressAt) {
            record.lastProgressAt = now;
        }

        const goal = this.computeGoalTile({
            mode,
            record,
            player,
            target,
            hasLOS,
            rangePx,
            lastSeen,
            now
        });

        let goalKey = null;
        if (goal && Number.isFinite(goal.goalTileX) && Number.isFinite(goal.goalTileY)) {
            goalKey = `${goal.goalTileX}_${goal.goalTileY}`;
        }

        let desiredDirectionHint = previousDirection;
        if (targetCenter) {
            const rawDirection = vectorToDirection(targetCenter.x - shooterCenter.x, targetCenter.y - shooterCenter.y, previousDirection);
            desiredDirectionHint = stepDirectionTowards(previousDirection, rawDirection, hasLOS ? 4 : 2);
        } else if (goal && Number.isFinite(goal.goalPixelX) && Number.isFinite(goal.goalPixelY)) {
            const rawDirection = vectorToDirection(goal.goalPixelX - px, goal.goalPixelY - py, previousDirection);
            desiredDirectionHint = stepDirectionTowards(previousDirection, rawDirection, 2);
        }

        let shouldRepath = false;
        if (goalKey && goalKey !== record.pathGoalKey) {
            shouldRepath = true;
        }
        if (losChanged && !hasLOS) {
            shouldRepath = true;
        }

        const nav = this.navGrid || this.buildNavGrid();
        const currentTile = pixelToTile(px, py);
        let desiredPoint = goal
            ? {
                x: goal.goalPixelX ?? px,
                y: goal.goalPixelY ?? py
            }
            : null;

        if (goal && (goal.requiresPath || shouldRepath || !record.path)) {
            if (!record.lastPathBuildAt || now - record.lastPathBuildAt >= PATH_REBUILD_COOLDOWN_MS) {
                if (nav && goalKey) {
                    const penaltySet = new Set(Array.isArray(record.visitedTiles) ? record.visitedTiles : []);
                    const computedPath = this.astar({ x: currentTile.x, y: currentTile.y }, { x: goal.goalTileX, y: goal.goalTileY }, nav, { visitedPenalty: penaltySet });
                    if (computedPath && computedPath.length) {
                        record.path = computedPath;
                        record.pathIndex = 0;
                        record.pathGoalKey = goalKey;
                        record.lastPathBuildAt = now;
                    } else if (goal.requiresPath) {
                        record.path = null;
                        record.pathIndex = 0;
                        record.pathGoalKey = null;
                    }
                }
            }
        }

        const resolveMovementPoint = () => {
            if (record.path && record.path.length && record.pathIndex < record.path.length) {
                const waypoint = record.path[record.pathIndex];
                const origin = tileToOffsetOrigin(waypoint.x, waypoint.y);
                return {
                    point: origin,
                    fromPath: true
                };
            }
            if (desiredPoint) {
                return {
                    point: desiredPoint,
                    fromPath: false
                };
            }
            return null;
        };

        const movementSpeeds = {
            engage: RECRUIT_PATROL_SPEED * 1.2,
            flank: RECRUIT_PATROL_SPEED * 1.1,
            kite: RECRUIT_PATROL_SPEED * 1.3,
            retreat: RECRUIT_PATROL_SPEED * 1.35,
            patrol: RECRUIT_PATROL_SPEED * 1.05
        };
        const movementSpeed = movementSpeeds[mode] ?? RECRUIT_PATROL_SPEED;

        let desiredDirection = desiredDirectionHint;
        let moved = false;
        let progressMade = false;
        let resetPerformed = false;
        let shouldBroadcast = false;
        let sequenceDelta = 0;
        let failedMoves = 0;

        let remainingTime = deltaMs;
        let iterations = 0;

        let targetInfo = resolveMovementPoint();
        if (!targetInfo && !goal) {
            const fallback = this.resolveFallbackTarget(record, px, py, previousDirection);
            if (fallback) {
                desiredPoint = { x: fallback.point.x, y: fallback.point.y };
                targetInfo = {
                    point: fallback.point,
                    fromPath: false
                };
            }
        }

        while (targetInfo && remainingTime > 0 && iterations < RECRUIT_MAX_SIM_STEPS) {
            const stepTime = Math.min(RECRUIT_SIMULATION_STEP_MS, remainingTime);
            const targetPoint = targetInfo.point;
            const baseVelocity = seekArrive({ x: px, y: py }, targetPoint, movementSpeed, ARRIVE_RADIUS_PX);
            if (!baseVelocity) {
                if (targetInfo.fromPath) {
                    record.pathIndex += 1;
                    if (record.path && record.pathIndex >= record.path.length) {
                        record.path = null;
                        record.pathGoalKey = null;
                    }
                }
                targetInfo = resolveMovementPoint();
                if (!targetInfo) {
                    break;
                }
                iterations += 1;
                continue;
            }

            const separation = separationAdjust({ x: px, y: py }, allyCenters, movementSpeed);
            let velocity = {
                dx: baseVelocity.dx + separation.dx,
                dy: baseVelocity.dy + separation.dy
            };
            velocity = avoidanceAdjust({ x: px, y: py }, velocity, movementSpeed, nav, (tileX, tileY) => this.isNavTileBlocked(tileX, tileY));

            const speedPerMs = Math.sqrt((velocity.dx * velocity.dx) + (velocity.dy * velocity.dy));
            if (!Number.isFinite(speedPerMs) || speedPerMs < 1e-4) {
                failedMoves += 1;
                break;
            }

            const unit = {
                dx: velocity.dx / speedPerMs,
                dy: velocity.dy / speedPerMs
            };
            const step = Math.min(speedPerMs * stepTime, movementSpeed * stepTime);
            const attempt = this.tryMoveWithVector(px, py, unit, step);
            if (!attempt) {
                failedMoves += 1;
                if (failedMoves >= 2) {
                    shouldRepath = true;
                }
                break;
            }

            const prevDistanceSq = distanceSquared(px, py, targetPoint.x, targetPoint.y);
            px = attempt.x;
            py = attempt.y;
            desiredDirection = attempt.direction;
            moved = true;

            const newDistanceSq = distanceSquared(px, py, targetPoint.x, targetPoint.y);
            if (newDistanceSq + 4 < prevDistanceSq) {
                progressMade = true;
            }

            remainingTime -= stepTime;
            iterations += 1;

            if (targetInfo.fromPath && record.path) {
                if (newDistanceSq <= (PATH_WAYPOINT_REACH_PX * PATH_WAYPOINT_REACH_PX)) {
                    record.pathIndex += 1;
                    if (record.pathIndex >= record.path.length) {
                        record.path = null;
                        record.pathGoalKey = null;
                    }
                    targetInfo = resolveMovementPoint();
                }
            } else if (!targetInfo.fromPath && newDistanceSq <= (PATH_WAYPOINT_REACH_PX * PATH_WAYPOINT_REACH_PX)) {
                break;
            }
        }

        player.offset.x = px;
        player.offset.y = py;

        if (moved) {
            const tile = pixelToTile(px, py);
            pushVisitedTile(record, tile.x, tile.y);
            record.lastProgressAt = now;
            record.lastMoveTimestamp = now;
            record.lastMoveX = px;
            record.lastMoveY = py;
            record.stuckCounter = 0;
            shouldBroadcast = true;
        } else {
            record.stuckCounter = (record.stuckCounter || 0) + 1;
        }

        if (!progressMade && (now - (record.lastProgressAt || now)) >= REPATH_STALL_MS) {
            shouldRepath = true;
        }

        if (shouldRepath && goal && goalKey && (!record.lastPathBuildAt || now - record.lastPathBuildAt >= PATH_REBUILD_COOLDOWN_MS)) {
            if (nav) {
                const penaltySet = new Set(Array.isArray(record.visitedTiles) ? record.visitedTiles : []);
                const recomputedPath = this.astar(pixelToTile(px, py), { x: goal.goalTileX, y: goal.goalTileY }, nav, { visitedPenalty: penaltySet });
                if (recomputedPath && recomputedPath.length) {
                    record.path = recomputedPath;
                    record.pathIndex = 0;
                    record.pathGoalKey = goalKey;
                    record.lastPathBuildAt = now;
                } else if (!moved && (now - (record.lastMoveTimestamp || now)) >= RECRUIT_STUCK_TIMEOUT_MS) {
                    const reset = this.resetRecruitPosition(record, player, now);
                    if (reset) {
                        px = player.offset.x ?? px;
                        py = player.offset.y ?? py;
                        desiredDirection = wrapDirection(player.direction ?? desiredDirection, desiredDirection);
                        moved = false;
                        resetPerformed = true;
                        shouldBroadcast = true;
                    }
                }
            }
        }

        player.isMoving = moved ? 1 : 0;
        if (resetPerformed) {
            player.isMoving = 0;
        }

        if (directionDelta(previousDirection, desiredDirection) > 0) {
            player.direction = desiredDirection;
            sequenceDelta += 1;
        }

        if (player.isMoving !== previousMoving) {
            sequenceDelta += 1;
        }

        if (sequenceDelta > 0) {
            player.sequence = (player.sequence || 0) + sequenceDelta;
            shouldBroadcast = true;
        }

        if (target && hasLOS) {
            if (!record.nextShotAt || now >= record.nextShotAt) {
                const aimFallback = targetCenter
                    ? vectorToDirection(targetCenter.x - shooterCenter.x, targetCenter.y - shooterCenter.y, player.direction ?? 16)
                    : player.direction ?? 16;
                const aimDirection = leadDirection(player, target, BULLET_SPEED_PX_PER_S, aimFallback);
                const jitter = Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? 1 : -1);
                const finalDirection = wrapDirection(aimDirection + jitter, aimDirection);
                const deltaAim = directionDelta(desiredDirection, finalDirection);
                const muzzleUnit = directionToUnitVector(finalDirection);
                const muzzleX = shooterCenter.x + (muzzleUnit.x * RECRUIT_MUZZLE_OFFSET);
                const muzzleY = shooterCenter.y + (muzzleUnit.y * RECRUIT_MUZZLE_OFFSET);
                const muzzleLos = this.losTileRaycast(muzzleX, muzzleY, targetCenter.x, targetCenter.y);
                const friendlyBlock = hasFriendlyObstruction(shooterCenter, targetCenter, allyCenters);

                if (deltaAim <= 2 && muzzleLos && !friendlyBlock) {
                    const fired = this.fireRecruitLaser(record, player, target, finalDirection, now);
                    if (fired) {
                        if (Math.random() < 0.35) {
                            record.nextShotAt = now + 140 + Math.floor(Math.random() * 120);
                        } else {
                            record.nextShotAt = now + RECRUIT_SHOOT_INTERVAL_MS + Math.floor(Math.random() * RECRUIT_SHOOT_JITTER_MS);
                        }
                    } else {
                        record.nextShotAt = now + 200;
                    }
                } else {
                    record.nextShotAt = now + 100;
                }
            }
        } else if (!target) {
            record.nextShotAt = now + 200;
        }

        if (!moved && !resetPerformed && (now - (record.lastMoveTimestamp || now)) >= RECRUIT_STUCK_TIMEOUT_MS) {
            const reset = this.resetRecruitPosition(record, player, now);
            if (reset) {
                shouldBroadcast = true;
            }
        }

        if (shouldBroadcast && this.io) {
            const cooldown = record.broadcastCooldown ?? 150;
            if (!record.lastBroadcastAt || (now - record.lastBroadcastAt) >= cooldown) {
                this.io.emit('player', JSON.stringify(player));
                record.lastBroadcastAt = now;
            }
        }
    }

    acquireRecruitTarget(record, px, py) {
        const players = this.game?.players || {};
        const detectionRadiusSq = RECRUIT_DETECTION_RADIUS * RECRUIT_DETECTION_RADIUS;
        let bestId = null;
        let bestDistanceSq = detectionRadiusSq;

        for (const candidate of Object.values(players)) {
            if (!this.isEnemyRecruitCandidate(record, candidate)) {
                continue;
            }
            const cx = candidate.offset?.x ?? 0;
            const cy = candidate.offset?.y ?? 0;
            const distSq = distanceSquared(px, py, cx, cy);
            if (distSq > detectionRadiusSq) {
                continue;
            }
            if (!bestId || distSq < bestDistanceSq) {
                bestId = candidate.id;
                bestDistanceSq = distSq;
            }
        }

        return bestId;
    }

    isValidRecruitTarget(record, target, px, py) {
        if (!this.isEnemyRecruitCandidate(record, target)) {
            return false;
        }
        const tx = target.offset?.x ?? 0;
        const ty = target.offset?.y ?? 0;
        const distSq = distanceSquared(px, py, tx, ty);
        if (distSq > RECRUIT_MAX_RANGE_SQUARED) {
            return false;
        }
        return true;
    }

    isEnemyRecruitCandidate(record, candidate) {
        if (!record || !candidate) {
            return false;
        }
        if (candidate.id === record.id) {
            return false;
        }
        if (candidate.health !== undefined && candidate.health <= 0) {
            return false;
        }
        if (candidate.isCloaked) {
            return false;
        }
        const candidateCity = Number(candidate.city);
        if (Number.isFinite(candidateCity) && candidateCity === record.cityId) {
            return false;
        }
        if (candidate.isSystemControlled && candidate.isFakeRecruit && Number.isFinite(candidate.city) && candidate.city === record.cityId) {
            return false;
        }
        return true;
    }

    fireRecruitLaser(record, player, target, direction, now) {
        if (!this.bulletFactory || typeof this.bulletFactory.spawnSystemBullet !== 'function') {
            return false;
        }

        const originX = (player.offset?.x ?? 0) + (TILE_SIZE / 2);
        const originY = (player.offset?.y ?? 0) + (TILE_SIZE / 2);
        const unit = directionToUnitVector(direction);
        const mapMax = (512 * TILE_SIZE) - 1;
        const bulletX = clamp(originX + (unit.x * RECRUIT_MUZZLE_OFFSET), 0, mapMax);
        const bulletY = clamp(originY + (unit.y * RECRUIT_MUZZLE_OFFSET), 0, mapMax);

        const payload = {
            shooterId: record.id,
            x: bulletX,
            y: bulletY,
            angle: -direction,
            type: 0,
            teamId: record.cityId,
            sourceId: record.id,
            sourceType: 'fake_recruit',
            targetId: target?.id ?? null
        };

        this.bulletFactory.spawnSystemBullet(payload);
        record.lastShotAt = now;
        return true;
    }

    computeRecruitSpawn(cityId, baseTileX = null, baseTileY = null, slotIndex = 0) {
        const record = this.activeCities.get(cityId);
        const resolvedBaseX = toFiniteNumber(baseTileX, toFiniteNumber(record?.baseTileX, 0));
        const resolvedBaseY = toFiniteNumber(baseTileY, toFiniteNumber(record?.baseTileY, 0));
        const spawnPoint = record?.spawnPoint;
        let originX = Number.isFinite(spawnPoint?.x) ? spawnPoint.x : null;
        let originY = Number.isFinite(spawnPoint?.y) ? spawnPoint.y : null;
        if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
            originX = (resolvedBaseX + 1.5) * TILE_SIZE;
            originY = (resolvedBaseY + 1) * TILE_SIZE;
        }

        const pattern = RECRUIT_POSITION_PATTERNS[slotIndex % RECRUIT_POSITION_PATTERNS.length] || { dx: 0, dy: 0, direction: 16 };
        const ring = Math.floor(slotIndex / RECRUIT_POSITION_PATTERNS.length);
        const offsetX = pattern.dx + (ring * TILE_SIZE * 1.5);
        const offsetY = pattern.dy + (ring * TILE_SIZE);
        const mapMax = (512 * TILE_SIZE) - TILE_SIZE;

        const spawn = {
            x: clamp(originX + offsetX, 0, mapMax),
            y: clamp(originY + offsetY, 0, mapMax),
            direction: pattern.direction ?? 16
        };
        return this.ensureSpawnIsClear(spawn);
    }

    ensureCityRecruits(cityId, entry, baseTileX, baseTileY) {
        const numericCity = toFiniteNumber(cityId, null);
        if (numericCity === null) {
            return;
        }
        const count = Math.max(0, toFiniteNumber(entry?.recruitCount, RECRUIT_DEFAULT_COUNT));
        if (count <= 0) {
            this.removeCityRecruits(numericCity, { broadcast: true });
            return;
        }

        const existingIds = this.recruitsByCity.get(numericCity);
        if (existingIds && existingIds.length) {
            this.removeCityRecruits(numericCity, { broadcast: true });
        }

        const ids = [];
        const now = Date.now();
        const patrolPath = this.getPatrolPathForCity(numericCity);
        const pathLength = patrolPath.length;
        for (let index = 0; index < count; index += 1) {
            const id = `fake_recruit_${numericCity}_${index}`;
            const spawn = this.computeRecruitSpawn(numericCity, baseTileX, baseTileY, index);
            const rotation = pathLength ? Math.floor(Math.random() * pathLength) : 0;
            const variant = pathLength ? createPatrolVariant(patrolPath, { rotation }) : [];
            const patrolDirection = Math.random() < 0.5 ? -1 : 1;
            const patrolThreshold = RECRUIT_PATROL_POINT_THRESHOLD + (Math.random() * TILE_SIZE * 0.25);
            const patrolStopDistance = TILE_SIZE * (0.5 + Math.random() * 0.4);
            const record = {
                id,
                cityId: numericCity,
                slotIndex: index,
                spawn,
                state: 'pending',
                respawnAt: 0,
                nextShotAt: 0,
                nextScanAt: now,
                nextThinkAt: 0,
                ownerId: `fake_city_${numericCity}`,
                lastBroadcastAt: 0,
                broadcastCooldown: 150,
                targetId: null,
                patrolIndex: 0,
                patrolVariant: variant.length ? variant : null,
                patrolDirection,
                patrolThreshold,
                patrolStopDistance,
                mode: 'pending'
            };
            this.ensureRecruitPatrolState(record);
            this.recruits.set(id, record);
            ids.push(id);
        }
        this.recruitsByCity.set(numericCity, ids);
    }

    removeCityRecruits(cityId, options = {}) {
        const ids = this.recruitsByCity.get(cityId);
        if (!ids || !ids.length) {
            return;
        }
        const broadcast = options.broadcast !== false;
        const players = this.game?.players || {};

        ids.forEach((id) => {
            const record = this.recruits.get(id);
            if (record) {
                record.state = 'removed';
                record.respawnAt = 0;
                record.targetId = null;
                record.mode = 'removed';
            }
            if (players[id]) {
                if (this.playerFactory && typeof this.playerFactory.removeSystemPlayer === 'function') {
                    this.playerFactory.removeSystemPlayer(id, { broadcast });
                } else {
                    delete players[id];
                    if (broadcast && this.io) {
                        this.io.emit('player:removed', JSON.stringify({ id }));
                    }
                }
            }
            this.recruits.delete(id);
        });

        this.recruitsByCity.delete(cityId);
    }

    sendSnapshot(target) {
        if (!target) {
            return;
        }
        if (this.defenseManager) {
            this.defenseManager.sendSnapshot(target);
            return;
        }
        for (const [cityId, record] of this.activeCities.entries()) {
            if (record && Array.isArray(record.defenseItems) && record.defenseItems.length) {
                this.emitDefenseSnapshot(cityId, record.defenseItems, target);
            }
        }
    }

    emitDefenseSnapshot(cityId, items, target = null) {
        if (!Array.isArray(items) || !items.length) {
            return;
        }
        const payload = {
            cityId,
            items: items.map((item) => {
                const snapshot = {
                    id: item.id,
                    type: item.type,
                    x: item.x,
                    y: item.y,
                    teamId: item.teamId,
                };
                if (item.ownerId !== undefined) {
                    snapshot.ownerId = item.ownerId;
                }
                if (item.angle !== undefined) {
                    snapshot.angle = item.angle;
                }
                return snapshot;
            })
        };
        const emitter = target ?? this.io;
        if (!emitter) {
            return;
        }
        emitter.emit('city:defenses', payload);
    }

    emitDefenseClear(cityId, target = null) {
        const payload = { cityId };
        const emitter = target ?? this.io;
        if (!emitter) {
            return;
        }
        emitter.emit('city:defenses:clear', payload);
    }

    resolveDefenseItemType(type) {
        if (type === null || type === undefined) {
            return null;
        }
        if (typeof type === 'number' && Number.isFinite(type)) {
            return type;
        }
        const key = String(type).toLowerCase();
        if (Object.prototype.hasOwnProperty.call(DEFENSE_ITEM_TYPES, key)) {
            return DEFENSE_ITEM_TYPES[key];
        }
        return null;
    }

    deployDefenses(cityId, entry, baseX, baseY, layout, ownerId) {
        const result = {
            items: [],
            hazardIds: []
        };
        const defenses = Array.isArray(entry?.defenses) && entry.defenses.length
            ? entry.defenses
            : (Array.isArray(this.config.defaultDefenses) ? this.config.defaultDefenses : []);
        if (!defenses.length) {
            return result;
        }

        const layoutOccupied = new Set();
        if (Array.isArray(layout)) {
            for (const blueprint of layout) {
                const dx = toFiniteNumber(blueprint?.dx, 0);
                const dy = toFiniteNumber(blueprint?.dy, 0);
                const tileX = Math.floor(baseX + dx);
                const tileY = Math.floor(baseY + dy);
                if (Number.isFinite(tileX) && Number.isFinite(tileY)) {
                    layoutOccupied.add(`${tileX}_${tileY}`);
                }
            }
        }

        const placedTiles = new Set();
        const maxTileIndex = 512;

        for (const defense of defenses) {
            const rawType = defense?.type;
            if (rawType === undefined || rawType === null) {
                continue;
            }
            const dx = toFiniteNumber(defense?.dx, null);
            const dy = toFiniteNumber(defense?.dy, null);
            if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
                continue;
            }
            const tileX = baseX + dx;
            const tileY = baseY + dy;
            if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
                continue;
            }
            if (tileX < 0 || tileY < 0 || tileX >= maxTileIndex || tileY >= maxTileIndex) {
                continue;
            }
            const column = Math.floor(tileX);
            const row = Math.floor(tileY);
            const tileKey = `${column}_${row}`;
            if (defense.allowOverlap !== true) {
                if (layoutOccupied.has(tileKey) || placedTiles.has(tileKey)) {
                    continue;
                }
            }

            const worldX = tileX * TILE_SIZE;
            const worldY = tileY * TILE_SIZE;
            const typeKey = typeof rawType === 'string' ? rawType.toLowerCase() : rawType;

            if (typeKey === 'mine' || typeKey === 'mines' || typeKey === 'minefield') {
                if (!this.hazardManager || typeof this.hazardManager.spawnSystemHazard !== 'function') {
                    continue;
                }
                const hazardId = defense.id || `fake_mine_${cityId}_${++this.defenseSequence}`;
                const hazard = this.hazardManager.spawnSystemHazard({
                    id: hazardId,
                    type: 'mine',
                    x: worldX,
                    y: worldY,
                    teamId: cityId,
                    ownerId,
                });
                if (hazard) {
                    result.hazardIds.push(hazard.id);
                    placedTiles.add(tileKey);
                }
                continue;
            }

            const itemType = this.resolveDefenseItemType(typeKey);
            if (itemType === null) {
                continue;
            }

            const item = {
                id: defense.id || `fake_defense_${cityId}_${++this.defenseSequence}`,
                type: itemType,
                x: worldX,
                y: worldY,
                ownerId,
                teamId: cityId,
            };
            const angle = toFiniteNumber(defense?.angle, null);
            if (Number.isFinite(angle)) {
                item.angle = angle;
            }
            result.items.push(item);
            placedTiles.add(tileKey);
        }

        if (this.defenseManager) {
            const sanitized = this.defenseManager.replaceSystemDefenses(cityId, result.items, { ownerId });
            if (Array.isArray(sanitized)) {
                result.items = sanitized;
            }
        }

        return result;
    }

    spawnFakeCities(count, configured = this.getConfiguredCities()) {
        if (!count || count <= 0) {
            return;
        }
        const available = configured.filter((entry) => !this.activeCities.has(toFiniteNumber(entry.cityId)));
        if (!available.length) {
            return;
        }
        for (const entry of available) {
            if (count <= 0) {
                break;
            }
            if (this.spawnFakeCity(entry)) {
                count -= 1;
            }
        }
    }

    spawnFakeCity(entry) {
        const cityId = toFiniteNumber(entry?.cityId, null);
        if (cityId === null || this.activeCities.has(cityId)) {
            return false;
        }
        const spawn = citySpawns && citySpawns[String(cityId)];
        if (!spawn) {
            return false;
        }

        const baseX = toFiniteNumber(entry.baseTileX, toFiniteNumber(spawn.tileX, 0));
        const baseY = toFiniteNumber(entry.baseTileY, toFiniteNumber(spawn.tileY, 0));
        const layout = Array.isArray(entry.layout) && entry.layout.length
            ? entry.layout
            : (Array.isArray(this.config.layout) ? this.config.layout : []);

        if (!layout.length) {
            return false;
        }

        if (this.buildingFactory) {
            this.buildingFactory.destroyCity(cityId);
        }

        const cityManager = this.buildingFactory?.cityManager;
        const cityState = cityManager ? cityManager.ensureCity(cityId) : null;

        if (cityState) {
            cityState.isFake = true;
            if (entry.name) {
                cityState.name = entry.name;
                cityState.nameOverride = entry.name;
            }
            cityState.tileX = baseX;
            cityState.tileY = baseY;
            cityState.x = baseX * 48;
            cityState.y = baseY * 48;
        }

        const ownerId = `fake_city_${cityId}`;
        const spawnPoint = (this.playerFactory && typeof this.playerFactory.getSpawnForCity === 'function')
            ? this.playerFactory.getSpawnForCity(cityId)
            : null;
        const patrolPath = this.buildPatrolPath(entry, baseX, baseY, layout);
        const spawnedIds = [];
        for (const blueprint of layout) {
            const type = toFiniteNumber(blueprint?.type, null);
            if (type === null) {
                continue;
            }
            const dx = toFiniteNumber(blueprint?.dx, 0);
            const dy = toFiniteNumber(blueprint?.dy, 0);
            const x = baseX + dx;
            const y = baseY + dy;
            const building = this.buildingFactory?.spawnStaticBuilding({
                id: `fake_${cityId}_${x}_${y}`,
                ownerId,
                city: cityId,
                x,
                y,
                type,
                itemsLeft: toFiniteNumber(blueprint?.itemsLeft, 0),
            });
            if (building) {
                spawnedIds.push(building.id);
            }
        }

        if (spawnedIds.length === 0) {
            if (cityState) {
                delete cityState.isFake;
            }
            return false;
        }

        const defenses = this.deployDefenses(cityId, entry, baseX, baseY, layout, ownerId);
        const defenseItemsSnapshot = defenses.items.map((item) => ({ ...item }));
        const hazardIdsSnapshot = Array.isArray(defenses.hazardIds) ? [...defenses.hazardIds] : [];

        this.activeCities.set(cityId, {
            ownerId,
            config: entry,
            buildingIds: spawnedIds,
            defenseItems: defenseItemsSnapshot,
            hazardIds: hazardIdsSnapshot,
            baseTileX: baseX,
            baseTileY: baseY,
            spawnPoint: spawnPoint || null,
            patrolPath: patrolPath.length ? patrolPath : [],
        });

        this.ensureCityRecruits(cityId, entry, baseX, baseY);

        if (this.playerFactory?.emitLobbySnapshot) {
            this.playerFactory.emitLobbySnapshot();
        }

        if (!this.defenseManager && defenseItemsSnapshot.length) {
            this.emitDefenseSnapshot(cityId, defenseItemsSnapshot);
        }

        this.buildNavGrid(true);

        return true;
    }

    removeFakeCities(count) {
        if (!count || count <= 0) {
            return;
        }
        const activeIds = Array.from(this.activeCities.keys());
        activeIds.sort((a, b) => b - a);
        for (const cityId of activeIds) {
            if (count <= 0) {
                break;
            }
            if (this.despawnFakeCity(cityId)) {
                count -= 1;
            }
        }
    }

    despawnFakeCity(cityId) {
        if (!this.activeCities.has(cityId)) {
            return false;
        }
        const record = this.activeCities.get(cityId);
        this.removeCityRecruits(cityId, { broadcast: true });
        if (record && Array.isArray(record.hazardIds) && this.hazardManager) {
            record.hazardIds.forEach((hazardId) => {
                this.hazardManager.removeHazard(hazardId, 'city_removed');
            });
            record.hazardIds = [];
        }
        if (this.defenseManager) {
            this.defenseManager.removeDefensesBySource(cityId, 'system');
        } else if (record && Array.isArray(record.defenseItems) && record.defenseItems.length) {
            this.emitDefenseClear(cityId);
        }
        if (record) {
            record.defenseItems = [];
        }
        if (this.buildingFactory) {
            this.buildingFactory.destroyCity(cityId);
        }
        const cityManager = this.buildingFactory?.cityManager;
        if (cityManager) {
            const city = cityManager.getCity(cityId);
            if (city) {
                delete city.isFake;
                if (city.nameOverride) {
                    delete city.nameOverride;
                }
                const spawnEntry = citySpawns && citySpawns[String(cityId)];
                if (spawnEntry && spawnEntry.name) {
                    city.name = spawnEntry.name;
                }
                cityManager.resetCity(cityId);
            }
        }
        this.activeCities.delete(cityId);
        if (this.playerFactory?.emitLobbySnapshot) {
            this.playerFactory.emitLobbySnapshot();
        }
        this.buildNavGrid(true);
        return true;
    }
}

/* TEST PLAN
[
  {
    "scenario": "open_field_engage",
    "inputs": { "mode": "engage", "hasLOS": true, "rangePx": 576, "hpFrac": 1, "targetHpFrac": 1 },
    "expect": { "mode": "engage", "firstWaypointTile": "direct", "fire": true }
  },
  {
    "scenario": "wall_between",
    "inputs": { "mode": "flank", "hasLOS": false, "lastSeenAge": 250, "rangePx": 640 },
    "expect": { "mode": "flank", "pathLength": ">0", "fire": false }
  },
  {
    "scenario": "doorway_crowd",
    "inputs": { "mode": "engage", "allies": 3, "rangePx": 512 },
    "expect": { "mode": "engage", "separation": "active", "clumping": "reduced" }
  },
  {
    "scenario": "stall_repath",
    "inputs": { "mode": "flank", "blocked": true, "stallMs": 700 },
    "expect": { "mode": "flank", "repath": true, "teleport": "no" }
  },
  {
    "scenario": "low_hp_kite",
    "inputs": { "mode": "kite", "hpFrac": 0.25, "targetHpFrac": 0.8, "hasLOS": true },
    "expect": { "mode": "retreat|kite", "rangePx": ">=KITE_RANGE_PX", "fire": "LOS_only" }
  }
]
*/
module.exports = FakeCityManager;
