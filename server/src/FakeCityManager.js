"use strict";

const citySpawns = require('../../shared/citySpawns.json');
const fakeCityConfig = require('../../shared/fakeCities.json');

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
    constructor({ game, buildingFactory, playerFactory }) {
        this.game = game;
        this.buildingFactory = buildingFactory;
        this.playerFactory = playerFactory;
        this.config = fakeCityConfig || {};
        this.activeCities = new Map();
        this.nextEvaluation = 0;
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

        this.activeCities.set(cityId, {
            ownerId,
            config: entry,
            buildingIds: spawnedIds,
        });

        if (this.playerFactory?.emitLobbySnapshot) {
            this.playerFactory.emitLobbySnapshot();
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
