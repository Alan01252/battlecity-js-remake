"use strict";

const citySpawns = require('../../shared/citySpawns.json');
const fakeCityConfig = require('../../shared/fakeCities.json');
const { TILE_SIZE, MAX_HEALTH } = require('./gameplay/constants');

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
const RECRUIT_THINK_INTERVAL_MS = 200;
const RECRUIT_TARGET_REFRESH_MS = 900;
const RECRUIT_SHOOT_INTERVAL_MS = 1400;
const RECRUIT_SHOOT_JITTER_MS = 400;
const RECRUIT_DETECTION_RADIUS = TILE_SIZE * 18;
const RECRUIT_MAX_RANGE = TILE_SIZE * 18;
const RECRUIT_MAX_RANGE_SQUARED = RECRUIT_MAX_RANGE * RECRUIT_MAX_RANGE;
const RECRUIT_MUZZLE_OFFSET = (TILE_SIZE / 2) + 6;

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
        record.respawnAt = 0;
        record.nextShotAt = now + RECRUIT_SHOOT_INTERVAL_MS;
        record.nextScanAt = now;
        record.nextThinkAt = now + RECRUIT_THINK_INTERVAL_MS;
        record.targetId = null;
        record.lastBroadcastAt = now;

        return player;
    }

    handleRecruitDeath(record, now = Date.now()) {
        if (!record || record.state === 'removed') {
            return;
        }
        record.state = 'dead';
        record.respawnAt = now + RECRUIT_RESPAWN_DELAY_MS;
        record.targetId = null;
        record.nextShotAt = 0;
        record.nextScanAt = now + RECRUIT_TARGET_REFRESH_MS;
    }

    updateRecruitBehaviour(record, player, now) {
        if (!record || !player) {
            return;
        }

        const px = player.offset?.x ?? 0;
        const py = player.offset?.y ?? 0;

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

        let broadcast = false;

        if (record.targetId) {
            const target = this.game?.players?.[record.targetId];
            if (this.isValidRecruitTarget(record, target, px, py)) {
                const tx = target.offset?.x ?? 0;
                const ty = target.offset?.y ?? 0;
                const dx = tx - px;
                const dy = ty - py;
                const direction = vectorToDirection(dx, dy, player.direction || 0);
                if (player.direction !== direction) {
                    player.direction = direction;
                    player.sequence = (player.sequence || 0) + 1;
                    broadcast = true;
                }

                if (!record.nextShotAt || now >= record.nextShotAt) {
                    const fired = this.fireRecruitLaser(record, player, target, direction, now);
                    const delay = fired
                        ? (RECRUIT_SHOOT_INTERVAL_MS + Math.floor(Math.random() * RECRUIT_SHOOT_JITTER_MS))
                        : 300;
                    record.nextShotAt = now + delay;
                }
            } else {
                record.targetId = null;
            }
        }

        if (!record.targetId) {
            const baseDirection = record.spawn?.direction ?? 16;
            if (player.direction !== baseDirection) {
                player.direction = baseDirection;
                player.sequence = (player.sequence || 0) + 1;
                broadcast = true;
            }
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
        for (let index = 0; index < count; index += 1) {
            const id = `fake_recruit_${numericCity}_${index}`;
            const spawn = this.computeRecruitSpawn(numericCity, baseTileX, baseTileY, index);
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
                targetId: null
            };
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
