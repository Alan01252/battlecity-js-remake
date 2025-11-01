import {MOVEMENT_SPEED_PLAYER} from '../constants';
import {ITEM_TYPE_TURRET} from '../constants';
import {ITEM_TYPE_PLASMA} from '../constants';
import {ITEM_TYPE_BOMB} from '../constants';
import {rectangleCollision} from '../collision/collision-helpers';

const TILE_SIZE = 48;
const HALF_TILE = TILE_SIZE / 2;
const SPRITE_GAP = 8;
const MAX_GLOBAL_TANKS = 2;
const MAX_TANKS_PER_CITY = 2;
const CITY_SIZE_THRESHOLD = 18;
const CITY_SECOND_TANK_THRESHOLD = 32;
const SPAWN_EVALUATION_INTERVAL = 5000;
const MOVE_DECISION_INTERVAL = 1500;
const TARGET_REFRESH_INTERVAL = 2200;
const BASE_SPEED_MULTIPLIER = 0.35;
const SHOOT_INTERVAL = 2800;
const SHOOT_RANGE = TILE_SIZE * 10;
const SHOOT_INACCURACY = 6;
const BOMB_INTERVAL = 9000;
const BOMB_INTERVAL_JITTER = 4500;
const BOMB_FUSE = 2600;
const BOMB_FUSE_JITTER = 1200;
const BOMB_DROP_RADIUS = TILE_SIZE * 7;
const MAX_LIFETIME = 240000;
const WANDER_RADIUS = TILE_SIZE * 9;
const ROGUE_MIN_SPAWN_RADIUS = TILE_SIZE * 18;
const ROGUE_SPAWN_RADIUS_VARIANCE = TILE_SIZE * 10;
const ROGUE_SPAWN_MAX_ATTEMPTS = 20;

const toFinite = (value, fallback = 0) => {
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

const distanceSquared = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return (dx * dx) + (dy * dy);
};

const directionToVector = (direction) => {
    const theta = (-direction / 16) * Math.PI;
    return {
        dx: Math.sin(theta),
        dy: Math.cos(theta)
    };
};

const vectorToDirection = (dx, dy, fallback = 0) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4)) {
        return fallback;
    }
    const length = Math.sqrt((dx * dx) + (dy * dy));
    if (length < 1e-4) {
        return fallback;
    }
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

const normalizeVector = (dx, dy) => {
    const length = Math.sqrt((dx * dx) + (dy * dy));
    if (length < 1e-4) {
        return {dx: 0, dy: 0};
    }
    return {
        dx: dx / length,
        dy: dy / length
    };
};

class RogueTankManager {

    constructor(game) {
        this.game = game;
        this.tanks = [];
        this.nextId = 1;
        this.nextSpawnCheck = 0;
        this.instancePrefix = `local_${Math.random().toString(16).slice(-6)}`;
    }

    sanitizeIdComponent(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }
        return value.replace(/[^a-zA-Z0-9_-]/g, '');
    }

    getClientInstanceId() {
        const socketId = this.game?.socketListener?.io?.id;
        const cleaned = this.sanitizeIdComponent(socketId);
        if (cleaned && cleaned.length) {
            return cleaned;
        }
        return this.instancePrefix;
    }

    createTankId() {
        const prefix = this.getClientInstanceId();
        const id = `rogue_${prefix}_${this.nextId}`;
        this.nextId += 1;
        return id;
    }

    emitTankShot(tank, originX, originY, direction) {
        const socketListener = this.game?.socketListener;
        if (!socketListener || typeof socketListener.sendBulletShot !== 'function') {
            return;
        }
        const shooterId = this.game.player?.id ?? null;
        if (!shooterId) {
            return;
        }
        socketListener.sendBulletShot({
            shooter: shooterId,
            x: originX,
            y: originY,
            type: 0,
            angle: -direction,
            team: null,
            sourceId: tank?.id ?? null,
            sourceType: 'rogue_tank',
            targetId: typeof tank?.target === 'object' ? tank.target.id ?? null : null
        });
    }

    update() {
        if (!this.game || !this.game.buildingFactory) {
            return;
        }

        const now = this.game.tick || Date.now();

        if (now >= this.nextSpawnCheck) {
            this.nextSpawnCheck = now + SPAWN_EVALUATION_INTERVAL;
            this.evaluateSpawns();
        }

        this.updateTanks(now);
    }

    evaluateSpawns() {
        const cities = this.game.cities || [];
        if (!cities.length) {
            return;
        }

        let globalSlots = Math.max(0, MAX_GLOBAL_TANKS - this.tanks.length);
        if (globalSlots === 0) {
            return;
        }

        cities.forEach((city, index) => {
            if (!city || globalSlots <= 0) {
                return;
            }
            const buildingCount = this.game.buildingFactory.countBuildingsForCity(index);
            if (buildingCount < CITY_SIZE_THRESHOLD) {
                return;
            }

            const existing = this.tanks.filter(tank => tank.targetCityId === index);
            const desired = buildingCount >= CITY_SECOND_TANK_THRESHOLD ? 2 : 1;
            const targetPerCity = Math.min(desired, MAX_TANKS_PER_CITY);
            const deficit = Math.min(globalSlots, targetPerCity - existing.length);
            for (let i = 0; i < deficit; i += 1) {
                if (this.spawnTankNearCity(city, index)) {
                    globalSlots -= 1;
                    if (globalSlots <= 0) {
                        return;
                    }
                }
            }
        });
    }

    updateTanks(now) {
        for (let i = this.tanks.length - 1; i >= 0; i -= 1) {
            const tank = this.tanks[i];
            if (!tank) {
                this.tanks.splice(i, 1);
                continue;
            }

            const lifetime = now - tank.spawnedAt;
            if (lifetime > MAX_LIFETIME || !this.cityStillValid(tank.targetCityId)) {
                this.removeTankAtIndex(i);
                continue;
            }

            this.refreshTarget(tank, now);
            this.updateMovement(tank, now);
            this.tryShoot(tank, now);
            this.tryDropBomb(tank, now);
            this.updateBombs(tank, now);
        }
    }

    cityStillValid(cityId) {
        const city = this.game.cities?.[cityId];
        if (!city) {
            return false;
        }
        const buildingCount = this.game.buildingFactory.countBuildingsForCity(cityId);
        return buildingCount >= (CITY_SIZE_THRESHOLD - 3);
    }

    spawnTankNearCity(city, cityId) {
        const cityX = toFinite(city?.x, 0);
        const cityY = toFinite(city?.y, 0);
        const centerX = cityX + (TILE_SIZE * 1.5);
        const centerY = cityY + (TILE_SIZE * 1.5);
        const minDistance = ROGUE_MIN_SPAWN_RADIUS;
        const maxDistance = ROGUE_MIN_SPAWN_RADIUS + ROGUE_SPAWN_RADIUS_VARIANCE;

        for (let attempt = 0; attempt < ROGUE_SPAWN_MAX_ATTEMPTS; attempt += 1) {
            const angle = Math.random() * Math.PI * 2;
            const distance = minDistance + (Math.random() * (maxDistance - minDistance));
            let spawnX = centerX + Math.cos(angle) * distance;
            let spawnY = centerY + Math.sin(angle) * distance;
            spawnX = Math.max(HALF_TILE, Math.min((512 * TILE_SIZE) - HALF_TILE, spawnX));
            spawnY = Math.max(HALF_TILE, Math.min((512 * TILE_SIZE) - HALF_TILE, spawnY));
            if (this.isBlocked(spawnX, spawnY)) {
                continue;
            }

            const tankId = this.createTankId();
            const now = this.game.tick || Date.now();
            const tank = {
                id: tankId,
                offset: {x: spawnX, y: spawnY},
                lastSafeOffset: {x: spawnX, y: spawnY},
                direction: Math.floor(Math.random() * 32),
                isMoving: 0,
                targetCityId: cityId,
                target: null,
                nextDecisionAt: now + 250 + Math.random() * 250,
                nextTargetRefresh: now + Math.random() * 500,
                fireCooldown: now + 1400 + Math.random() * 900,
                bombCooldown: now + 3800 + Math.random() * 2200,
                activeBombs: [],
                spawnedAt: now,
                city: -1,
                health: 20,
                cachedVector: null
            };

            this.tanks.push(tank);
            this.game.forceDraw = true;
            return true;
        }

        return false;
    }

    refreshTarget(tank, now) {
        if (now < tank.nextTargetRefresh) {
            return;
        }
        tank.nextTargetRefresh = now + TARGET_REFRESH_INTERVAL + Math.random() * 1200;

        const turretTarget = this.pickNearestTurret(tank);
        if (turretTarget) {
            tank.target = turretTarget;
            return;
        }

        const fallback = this.pickWanderPoint(tank.targetCityId);
        tank.target = fallback;
    }

    pickNearestTurret(tank) {
        const manager = this.game.itemFactory;
        if (!manager) {
            return null;
        }

        let node = manager.getHead();
        let best = null;
        const maxDistanceSq = SHOOT_RANGE * SHOOT_RANGE * 1.3;

        while (node) {
            if (node.type === ITEM_TYPE_TURRET || node.type === ITEM_TYPE_PLASMA) {
                const distSq = distanceSquared(node.x + HALF_TILE, node.y + HALF_TILE, tank.offset.x + HALF_TILE, tank.offset.y + HALF_TILE);
                if (distSq < maxDistanceSq && (!best || distSq < best.distanceSq)) {
                    best = {
                        kind: 'item',
                        id: node.id,
                        x: node.x + HALF_TILE,
                        y: node.y + HALF_TILE,
                        distanceSq: distSq
                    };
                }
            }
            node = node.next;
        }

        return best;
    }

    pickWanderPoint(cityId) {
        const city = this.game.cities?.[cityId];
        const baseX = toFinite(city?.x, 0) + (TILE_SIZE * 1.5);
        const baseY = toFinite(city?.y, 0) + (TILE_SIZE * 1.5);
        const angle = Math.random() * Math.PI * 2;
        const radius = (TILE_SIZE * 2) + (Math.random() * WANDER_RADIUS);
        return {
            kind: 'point',
            x: baseX + Math.cos(angle) * radius,
            y: baseY + Math.sin(angle) * radius
        };
    }

    updateMovement(tank, now) {
        if (now < tank.nextDecisionAt) {
            this.applyMovement(tank, now, tank.cachedVector);
            return;
        }

        tank.nextDecisionAt = now + MOVE_DECISION_INTERVAL + Math.random() * 900;

        const target = this.resolveTargetPosition(tank.target);
        if (!target) {
            tank.cachedVector = null;
            tank.isMoving = 0;
            return;
        }

        const dx = target.x - (tank.offset.x + HALF_TILE);
        const dy = target.y - (tank.offset.y + HALF_TILE);
        const distanceSq = (dx * dx) + (dy * dy);

        if (distanceSq < (TILE_SIZE * TILE_SIZE * 2.5)) {
            tank.cachedVector = null;
            tank.isMoving = 0;
            return;
        }

        const vector = normalizeVector(dx, dy);
        const jitter = ((Math.random() - 0.5) * 0.4);
        const adjusted = normalizeVector(vector.dx + jitter, vector.dy + jitter);
        tank.cachedVector = adjusted;
        tank.direction = vectorToDirection(adjusted.dx, adjusted.dy, tank.direction);
        tank.isMoving = 1;
        this.applyMovement(tank, now, adjusted);
    }

    applyMovement(tank, now, vector) {
        if (!vector || (!vector.dx && !vector.dy)) {
            tank.isMoving = 0;
            return;
        }
        const delta = Math.min(this.game.timePassed || 0, 60);
        const step = delta * MOVEMENT_SPEED_PLAYER * BASE_SPEED_MULTIPLIER;
        const nextX = tank.offset.x + (vector.dx * step);
        const nextY = tank.offset.y + (vector.dy * step);

        if (!this.isBlocked(nextX, nextY)) {
            tank.offset.x = nextX;
            tank.offset.y = nextY;
            tank.lastSafeOffset = {x: nextX, y: nextY};
            return;
        }

        tank.isMoving = 0;
        tank.cachedVector = null;
    }

    resolveTargetPosition(target) {
        if (!target) {
            return null;
        }
        if (target.kind === 'item' && target.id) {
            const item = this.game.itemFactory?.itemsById?.get(target.id);
            if (item) {
                target.x = item.x + HALF_TILE;
                target.y = item.y + HALF_TILE;
                return target;
            }
            return null;
        }
        return target;
    }

    tryShoot(tank, now) {
        if (now < tank.fireCooldown) {
            return;
        }

        const target = this.resolveTargetPosition(tank.target);
        if (!target) {
            return;
        }

        const distSq = distanceSquared(tank.offset.x + HALF_TILE, tank.offset.y + HALF_TILE, target.x, target.y);
        if (distSq > (SHOOT_RANGE * SHOOT_RANGE)) {
            return;
        }

        const jitter = Math.floor((Math.random() * SHOOT_INACCURACY) - (SHOOT_INACCURACY / 2));
        const dx = target.x - (tank.offset.x + HALF_TILE);
        const dy = target.y - (tank.offset.y + HALF_TILE);
        let direction = vectorToDirection(dx, dy, tank.direction);
        direction = (direction + jitter) % 32;
        if (direction < 0) {
            direction += 32;
        }

        const vec = directionToVector(direction);
        const originX = (tank.offset.x + HALF_TILE) + (vec.dx * 30);
        const originY = (tank.offset.y + HALF_TILE) + (vec.dy * 30);

        this.game.bulletFactory.newBullet(tank.id, originX, originY, 0, -direction, null);
        this.emitTankShot(tank, originX, originY, direction);
        tank.fireCooldown = now + SHOOT_INTERVAL + Math.random() * 800;
    }

    tryDropBomb(tank, now) {
        if (now < tank.bombCooldown) {
            return;
        }

        const city = this.game.cities?.[tank.targetCityId];
        if (!city) {
            return;
        }

        const centerX = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
        const centerY = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
        const distSq = distanceSquared(tank.offset.x + HALF_TILE, tank.offset.y + HALF_TILE, centerX, centerY);
        if (distSq > (BOMB_DROP_RADIUS * BOMB_DROP_RADIUS)) {
            return;
        }

        const bomb = this.game.itemFactory?.newItem({id: tank.id, city: null, armed: true}, tank.offset.x, tank.offset.y, ITEM_TYPE_BOMB, {
            notifyServer: false
        });

        if (!bomb) {
            tank.bombCooldown = now + BOMB_INTERVAL;
            return;
        }

        bomb.active = true;
        bomb.armed = true;
        const entry = {
            item: bomb,
            detonateAt: now + BOMB_FUSE + Math.random() * BOMB_FUSE_JITTER
        };
        tank.activeBombs.push(entry);
        tank.bombCooldown = now + BOMB_INTERVAL + Math.random() * BOMB_INTERVAL_JITTER;
        this.game.forceDraw = true;
    }

    updateBombs(tank, now) {
        if (!Array.isArray(tank.activeBombs) || !tank.activeBombs.length) {
            return;
        }
        const next = [];
        for (let i = 0; i < tank.activeBombs.length; i += 1) {
            const entry = tank.activeBombs[i];
            if (!entry || !entry.item) {
                continue;
            }
            if (now >= entry.detonateAt) {
                this.game.itemFactory.spawnExplosion(entry.item.x, entry.item.y);
                this.game.itemFactory.detonateBomb(entry.item, {notifyServer: false});
                continue;
            }
            next.push(entry);
        }
        tank.activeBombs = next;
    }

    isBlocked(x, y) {
        const rect = {
            x: x + SPRITE_GAP,
            y: y + SPRITE_GAP,
            w: TILE_SIZE - (SPRITE_GAP * 2),
            h: TILE_SIZE - (SPRITE_GAP * 2)
        };

        if (this.hitsEdges(rect)) {
            return true;
        }

        if (this.hitsBlockingTile(rect)) {
            return true;
        }

        if (this.hitsBuilding(rect)) {
            return true;
        }

        if (this.hitsItem(rect)) {
            return true;
        }

        return false;
    }

    hitsEdges(rect) {
        if (rect.x < 0 || rect.y < 0) {
            return true;
        }
        if ((rect.x + rect.w) > (512 * TILE_SIZE) || (rect.y + rect.h) > (512 * TILE_SIZE)) {
            return true;
        }
        return false;
    }

    hitsBlockingTile(rect) {
        const map = this.game.map;
        if (!Array.isArray(map) || !map.length) {
            return false;
        }

        const left = Math.floor(rect.x / TILE_SIZE);
        const right = Math.floor((rect.x + rect.w) / TILE_SIZE);
        const top = Math.floor(rect.y / TILE_SIZE);
        const bottom = Math.floor((rect.y + rect.h) / TILE_SIZE);

        const isBlocked = (x, y) => {
            try {
                return map[x][y] !== 0 && map[x][y] !== 3;
            } catch (error) {
                return true;
            }
        };

        return isBlocked(left, top) || isBlocked(left, bottom) || isBlocked(right, top) || isBlocked(right, bottom);
    }

    hitsBuilding(rect) {
        let node = this.game.buildingFactory.getHead();
        while (node) {
            const buildingRect = {
                x: node.x * TILE_SIZE,
                y: node.y * TILE_SIZE,
                w: TILE_SIZE * 3,
                h: TILE_SIZE * 3
            };
            if (rectangleCollision(rect, buildingRect)) {
                return true;
            }
            node = node.next;
        }
        return false;
    }

    hitsItem(rect) {
        let node = this.game.itemFactory.getHead();
        while (node) {
            const itemRect = {
                x: node.x,
                y: node.y,
                w: TILE_SIZE,
                h: TILE_SIZE
            };
            if (rectangleCollision(rect, itemRect)) {
                return true;
            }
            node = node.next;
        }
        return false;
    }

    handleBulletCollision(bullet, tank) {
        if (!tank) {
            return;
        }

        if (bullet.shooter && bullet.shooter === tank.id) {
            return;
        }

        const damage = Number.isFinite(bullet.damage) ? bullet.damage : 5;
        tank.health -= damage;

        if (tank.health <= 0) {
            this.spawnTankExplosion(tank);
            this.removeTank(tank);
        }
    }

    spawnTankExplosion(tank) {
        if (!Array.isArray(this.game.explosions)) {
            return;
        }
        this.game.explosions.push({
            x: tank.offset.x,
            y: tank.offset.y,
            frame: 0,
            nextFrameTick: (this.game.tick || Date.now()) + 75
        });
    }

    removeTank(tank) {
        const index = this.tanks.indexOf(tank);
        if (index !== -1) {
            this.removeTankAtIndex(index);
        }
    }

    removeTankAtIndex(index) {
        const [tank] = this.tanks.splice(index, 1);
        if (tank && Array.isArray(tank.activeBombs)) {
            tank.activeBombs.forEach((entry) => {
                if (!entry || !entry.item) {
                    return;
                }
                this.game.itemFactory.deleteItem(entry.item);
            });
        }
        this.game.forceDraw = true;
    }
}

export default RogueTankManager;
