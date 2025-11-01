"use strict";

const citySpawns = require('../../shared/citySpawns.json');
const fakeCityConfig = require('../../shared/fakeCities.json');
const { TILE_SIZE } = require('./gameplay/constants');

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
    constructor({ game, buildingFactory, playerFactory, hazardManager }) {
        this.game = game;
        this.buildingFactory = buildingFactory;
        this.playerFactory = playerFactory;
        this.hazardManager = hazardManager || null;
        this.config = fakeCityConfig || {};
        this.activeCities = new Map();
        this.nextEvaluation = 0;
        this.io = null;
        this.defenseSequence = 0;
    }

    setIo(io) {
        this.io = io;
    }

    update(now = Date.now()) {
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

    sendSnapshot(target) {
        if (!target) {
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
        });

        if (this.playerFactory?.emitLobbySnapshot) {
            this.playerFactory.emitLobbySnapshot();
        }

        if (defenseItemsSnapshot.length) {
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
        if (record && Array.isArray(record.hazardIds) && this.hazardManager) {
            record.hazardIds.forEach((hazardId) => {
                this.hazardManager.removeHazard(hazardId, 'city_removed');
            });
            record.hazardIds = [];
        }
        if (record && Array.isArray(record.defenseItems) && record.defenseItems.length) {
            this.emitDefenseClear(cityId);
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
