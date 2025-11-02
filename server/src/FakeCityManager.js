"use strict";

const citySpawns = require('../../shared/citySpawns.json');
const fakeCityConfig = require('../../shared/fakeCities.json');
const {
    TILE_SIZE,
    MAX_HEALTH,
    COMMAND_CENTER_WIDTH_TILES,
    COMMAND_CENTER_HEIGHT_TILES
} = require('./gameplay/constants');

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
const MAP_MAX_COORD = (MAP_SIZE_TILES * TILE_SIZE) - TILE_SIZE;

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
        record.targetId = null;
        record.lastBroadcastAt = now;
        record.lastThinkAt = now;
        this.ensureRecruitPatrolState(record);
        player.isMoving = 0;

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
    }

    updateRecruitBehaviour(record, player, now) {
        if (!record || !player) {
            return;
        }

        this.ensureRecruitPatrolState(record);

        let px = player.offset?.x ?? 0;
        let py = player.offset?.y ?? 0;
        const previousX = px;
        const previousY = py;
        const previousDirection = wrapDirection(player.direction ?? 0);
        const previousMoving = player.isMoving ? 1 : 0;

        if (record.targetId) {
            const existing = this.game?.players?.[record.targetId];
            if (!this.isValidRecruitTarget(record, existing, px, py)) {
                record.targetId = null;
            }
        }

        if (!record.targetId || !record.nextScanAt || now >= record.nextScanAt) {
            record.targetId = this.acquireRecruitTarget(record, px, py);
            record.nextScanAt = now + RECRUIT_TARGET_REFRESH_MS;
        }

        let target = null;
        if (record.targetId) {
            const candidate = this.game?.players?.[record.targetId];
            if (this.isValidRecruitTarget(record, candidate, px, py)) {
                target = candidate;
            } else {
                record.targetId = null;
            }
        }

        const deltaRaw = now - (record.lastThinkAt || now);
        const deltaMs = Math.max(0, Math.min(deltaRaw, RECRUIT_MAX_TICK_MS));
        record.lastThinkAt = now;

        let movementTarget = null;
        let movementSpeed = RECRUIT_PATROL_SPEED;
        let stopDistance = Number.isFinite(record.patrolStopDistance) ? Math.max(0, record.patrolStopDistance) : 0;
        let desiredDirection = previousDirection;
        let sequenceDelta = 0;
        let broadcast = false;

        if (target) {
            record.mode = 'engage';
            const tx = target.offset?.x ?? px;
            const ty = target.offset?.y ?? py;
            const dx = tx - px;
            const dy = ty - py;
            const rawDirection = vectorToDirection(dx, dy, previousDirection);
            desiredDirection = stepDirectionTowards(previousDirection, rawDirection, 4);
            movementSpeed = RECRUIT_PATROL_SPEED * 1.2;
            stopDistance = Math.max(stopDistance, TILE_SIZE * 0.4);

            const engagePoint = this.selectPatrolIndexForTarget(record, tx, ty);
            if (engagePoint && engagePoint.point) {
                record.patrolIndex = engagePoint.index;
                record.patrolDirection = engagePoint.direction;
                movementTarget = {
                    x: engagePoint.point.x,
                    y: engagePoint.point.y
                };
            } else {
                movementTarget = null;
            }

            if (!movementTarget && record.spawn) {
                movementTarget = {
                    x: record.spawn.x ?? px,
                    y: record.spawn.y ?? py
                };
            }

            if (!record.nextShotAt || now >= record.nextShotAt) {
                const aimDelta = directionDelta(desiredDirection, rawDirection);
                if (aimDelta <= 2) {
                    const fired = this.fireRecruitLaser(record, player, target, rawDirection, now);
                    const delay = fired
                        ? (RECRUIT_SHOOT_INTERVAL_MS + Math.floor(Math.random() * RECRUIT_SHOOT_JITTER_MS))
                        : 300;
                    record.nextShotAt = now + delay;
                } else {
                    record.nextShotAt = now + 120;
                }
            }
        } else {
            record.mode = 'patrol';
            const fallbackDirection = previousDirection;
            const patrol = this.resolveRecruitPatrol(record, px, py, fallbackDirection);
            if (patrol) {
                movementTarget = patrol.point;
                const patrolDirection = wrapDirection(patrol.direction ?? fallbackDirection, fallbackDirection);
                desiredDirection = stepDirectionTowards(previousDirection, patrolDirection, 2);
                stopDistance = Math.max(0, patrol.stopDistance ?? stopDistance);
            } else if (record.spawn) {
                const sx = record.spawn.x ?? px;
                const sy = record.spawn.y ?? py;
                movementTarget = { x: sx, y: sy };
                const rawDirection = vectorToDirection(sx - px, sy - py, record.spawn.direction ?? fallbackDirection);
                desiredDirection = stepDirectionTowards(previousDirection, rawDirection, 2);
                stopDistance = TILE_SIZE * 0.5;
            } else {
                const baseDirection = record.spawn?.direction ?? 16;
                desiredDirection = stepDirectionTowards(previousDirection, baseDirection, 2);
            }
        }

        let moved = false;
        player.isMoving = 0;
        if (movementTarget) {
            let remainingTime = deltaMs;
            let iterations = 0;
            while (remainingTime > 0 && iterations < RECRUIT_MAX_SIM_STEPS) {
                const stepTime = Math.min(RECRUIT_SIMULATION_STEP_MS, remainingTime);
                const tx = clamp(movementTarget.x ?? px, 0, MAP_MAX_COORD);
                const ty = clamp(movementTarget.y ?? py, 0, MAP_MAX_COORD);
                const dx = tx - px;
                const dy = ty - py;
                const distanceSq = (dx * dx) + (dy * dy);
                const distance = Math.sqrt(distanceSq);

                if (!Number.isFinite(distance) || distance < 1e-4) {
                    break;
                }

                let step = movementSpeed * stepTime;

                if (stopDistance > 0 && distance <= stopDistance) {
                    step = 0;
                } else if (stopDistance > 0 && distance > stopDistance) {
                    const remaining = distance - stopDistance;
                    step = Math.min(step, remaining);
                } else {
                    step = Math.min(step, distance);
                }

                if (step <= 0.05) {
                    break;
                }

                const inv = 1 / distance;
                const nextX = clamp(px + (dx * inv * step), 0, MAP_MAX_COORD);
                const nextY = clamp(py + (dy * inv * step), 0, MAP_MAX_COORD);
                px = nextX;
                py = nextY;
                player.isMoving = 1;
                moved = moved || (Math.abs(nextX - previousX) > RECRUIT_MIN_MOVEMENT_DELTA || Math.abs(nextY - previousY) > RECRUIT_MIN_MOVEMENT_DELTA);

                remainingTime -= stepTime;
                iterations += 1;

                if (stopDistance > 0) {
                    const dxRemaining = tx - px;
                    const dyRemaining = ty - py;
                    const remainingDistance = Math.sqrt((dxRemaining * dxRemaining) + (dyRemaining * dyRemaining));
                    if (!Number.isFinite(remainingDistance) || remainingDistance <= stopDistance) {
                        break;
                    }
                }
            }
        }

        player.offset.x = px;
        player.offset.y = py;

        if (directionDelta(previousDirection, desiredDirection) > 0) {
            player.direction = desiredDirection;
            sequenceDelta += 1;
            broadcast = true;
        }

        if (player.isMoving !== previousMoving) {
            broadcast = true;
        }

        if (moved) {
            sequenceDelta += 1;
            broadcast = true;
        }

        if (sequenceDelta > 0) {
            player.sequence = (player.sequence || 0) + sequenceDelta;
        }

        if (broadcast && this.io) {
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

        return {
            x: clamp(originX + offsetX, 0, mapMax),
            y: clamp(originY + offsetY, 0, mapMax),
            direction: pattern.direction ?? 16
        };
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
        return true;
    }
}

module.exports = FakeCityManager;
