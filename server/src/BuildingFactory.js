"use strict";

const debug = require('debug')('BattleCity:BuildingFactory');

const Building = require('./Building');
const FactoryBuilding = require('./FactoryBuilding');
const CityManager = require('./CityManager');
const {
    isHouse,
    isFactory,
    POPULATION_MAX_HOUSE,
    COST_BUILDING,
} = require('./constants');

class BuildingFactory {
    constructor(game) {
        this.game = game;
        this.io = null;
        this.buildings = new Map();
        this.buildingsBySocket = new Map();
        this.cityManager = new CityManager(game);
    }

    serializeBuilding(building) {
        const { FACTORY_ITEM_LIMITS } = require('./constants');
        const limit = FACTORY_ITEM_LIMITS ? FACTORY_ITEM_LIMITS[building.type] : undefined;
        const produced = building.itemsLeft || 0;
        const itemsRemaining = limit !== undefined ? Math.max(0, limit - produced) : 0;
        return {
            id: building.id,
            ownerId: building.ownerId,
            type: building.type,
            population: building.population,
            attachedHouseId: building.attachedHouseId || null,
            x: building.x,
            y: building.y,
            city: building.cityId ?? 0,
            itemsLeft: produced,
            itemsRemaining,
            itemLimit: limit,
            smokeActive: !!building.smokeActive,
            smokeFrame: building.smokeFrame || 0,
        };
    }

    sendSnapshot(socket) {
        for (const building of this.buildings.values()) {
            const snapshot = this.serializeBuilding(building);
            socket.emit('new_building', JSON.stringify(snapshot));
            socket.emit('population:update', snapshot);
        }
    }

    listen(io) {
        this.io = io;
        this.cityManager.setIo(io);

        io.on('connection', (socket) => {
            debug(`Client connected ${socket.id}`);

            socket.on('new_building', (payload) => {
                this.handleNewBuilding(socket, payload);
            });

            socket.on('demolish_building', (payload) => {
                this.handleDemolish(socket, payload);
            });

            socket.on('disconnect', () => {
                this.removeBuildingsForSocket(socket.id);
            });

            this.sendSnapshot(socket);
        });
    }

    handleNewBuilding(socket, payload) {
        let buildingData = payload;
        if (typeof payload === 'string') {
            try {
                buildingData = JSON.parse(payload);
            } catch (error) {
                debug('Failed to parse building payload', error);
                return;
            }
        }

        buildingData.id = buildingData.id || `${buildingData.x}_${buildingData.y}`;
        buildingData.ownerId = socket.id;
        const playerState = this.game.players[socket.id];
        const resolvedCityId = buildingData.city !== undefined ? buildingData.city : (playerState?.city ?? 0);
        buildingData.city = resolvedCityId;
        buildingData.itemsLeft = buildingData.itemsLeft || 0;

        if (!playerState || playerState.city !== resolvedCityId) {
            socket.emit('build:denied', JSON.stringify({
                reason: 'wrong_city',
                city: resolvedCityId,
                x: buildingData.x,
                y: buildingData.y,
                id: buildingData.id,
            }));
            return;
        }

        if (!playerState.isMayor) {
            socket.emit('build:denied', JSON.stringify({
                reason: 'not_mayor',
                city: resolvedCityId,
                x: buildingData.x,
                y: buildingData.y,
                id: buildingData.id,
            }));
            return;
        }

        const city = this.cityManager.ensureCity(resolvedCityId);
        if (city.cash < COST_BUILDING) {
            socket.emit('build:denied', JSON.stringify({
                reason: 'insufficient_funds',
                city: resolvedCityId,
                x: buildingData.x,
                y: buildingData.y,
                id: buildingData.id,
            }));
            return;
        }

        const newBuilding = new Building(socket.id, buildingData, socket);

        if (isFactory(newBuilding.type)) {
            const factory = new FactoryBuilding(this.game, newBuilding);
            newBuilding.injectType(factory);
        }

        this.registerBuilding(socket.id, newBuilding);
        if (this.cityManager) {
            this.cityManager.registerBuilding(newBuilding);
        }
        this.cityManager.recordBuildingCost(newBuilding.cityId);

        if (isHouse(newBuilding.type)) {
            this.backfillAttachmentsForHouse(newBuilding);
        } else {
            this.ensureAttachment(newBuilding);
        }

        const snapshot = this.serializeBuilding(newBuilding);
        socket.broadcast.emit('new_building', JSON.stringify(snapshot));
        this.emitPopulationUpdate(newBuilding);
    }

    handleDemolish(socket, payload) {
        let data = payload;
        if (typeof payload === 'string') {
            try {
                data = JSON.parse(payload);
            } catch (error) {
                debug('Failed to parse demolish payload', error);
                return;
            }
        }

        if (!data || !data.id) {
            return;
        }

        const building = this.buildings.get(data.id);
        if (!building) {
            return;
        }

        if (building.ownerId !== socket.id) {
            return;
        }

        this.removeBuilding(building.id);
    }

    spawnStaticBuilding(data) {
        if (!data || data.x === undefined || data.y === undefined || data.type === undefined) {
            return null;
        }
        const cityId = data.city !== undefined ? data.city : (data.cityId !== undefined ? data.cityId : 0);
        const ownerId = data.ownerId || `fake_city_${cityId}`;
        const buildingId = data.id || `fake_${cityId}_${data.x}_${data.y}`;
        if (this.buildings.has(buildingId)) {
            return this.buildings.get(buildingId);
        }

        const buildingPayload = {
            id: buildingId,
            x: data.x,
            y: data.y,
            type: data.type,
            city: cityId,
            itemsLeft: data.itemsLeft || 0,
        };

        const newBuilding = new Building(ownerId, buildingPayload, null);

        if (isFactory(newBuilding.type)) {
            const factory = new FactoryBuilding(this.game, newBuilding);
            newBuilding.injectType(factory);
        }

        this.registerBuilding(ownerId, newBuilding);
        if (this.cityManager) {
            this.cityManager.registerBuilding(newBuilding);
        }

        if (isHouse(newBuilding.type)) {
            this.backfillAttachmentsForHouse(newBuilding);
        } else {
            this.ensureAttachment(newBuilding);
        }

        if (this.io) {
            const snapshot = this.serializeBuilding(newBuilding);
            this.io.emit('new_building', JSON.stringify(snapshot));
            this.emitPopulationUpdate(newBuilding);
        }

        return newBuilding;
    }

    registerBuilding(socketId, building) {
        this.buildings.set(building.id, building);
        if (!this.buildingsBySocket.has(socketId)) {
            this.buildingsBySocket.set(socketId, new Set());
        }
        this.buildingsBySocket.get(socketId).add(building.id);
    }

    removeBuildingsForSocket(socketId) {
        const ids = this.buildingsBySocket.get(socketId);
        if (!ids) {
            return;
        }
        this.buildingsBySocket.delete(socketId);
        ids.forEach((id) => {
            const building = this.buildings.get(id);
            if (building) {
                building.socket = null;
            }
        });
    }

    removeBuilding(id, broadcast = true) {
        const building = this.buildings.get(id);
        if (!building) {
            return;
        }

        debug(`Removing building ${id}`);

        if (!isHouse(building.type)) {
            this.detachFromHouse(building);
        } else {
            building.attachments.forEach((slot) => {
                const attached = this.buildings.get(slot.buildingId);
                if (attached) {
                    attached.attachedHouseId = null;
                    attached.population = 0;
                    this.emitPopulationUpdate(attached);
                }
            });
        }

        this.buildings.delete(id);

        const socketSet = this.buildingsBySocket.get(building.ownerId);
        if (socketSet) {
            socketSet.delete(id);
            if (socketSet.size === 0) {
                this.buildingsBySocket.delete(building.ownerId);
            }
        }

        if (this.cityManager) {
            this.cityManager.unregisterBuilding(building);
        }

        building.population = 0;
        this.emitPopulationUpdate(building, true);

        if (broadcast && this.io) {
            this.io.emit('demolish_building', JSON.stringify({ id }));
        }
    }

    cycle() {
        for (const building of this.buildings.values()) {
            building.cycle(this.game, this);
        }
        this.cityManager.cycle(this.game.tick);
    }

    ensureAttachment(building) {
        if (isHouse(building.type)) {
            return building;
        }

        if (building.attachedHouseId) {
            const existingHouse = this.buildings.get(building.attachedHouseId);
            if (existingHouse && existingHouse.attachments.some((slot) => slot.buildingId === building.id)) {
                return existingHouse;
            }
            building.attachedHouseId = null;
        }

        const house = this.findAvailableHouse(building.ownerId, building.cityId);
        if (!house) {
            return null;
        }

        this.attachBuildingToHouse(house, building);
        return house;
    }

    findAvailableHouse(ownerId, cityId) {
        let bestHouse = null;
        for (const candidate of this.buildings.values()) {
            if (!isHouse(candidate.type)) {
                continue;
            }
            const sameOwner = candidate.ownerId === ownerId;
            const sameCity = candidate.cityId === cityId;
            if (!sameCity && !sameOwner) {
                continue;
            }
            if (candidate.attachments.length >= 2) {
                continue;
            }
            if (!bestHouse || candidate.attachments.length < bestHouse.attachments.length) {
                bestHouse = candidate;
                if (bestHouse.attachments.length === 0) {
                    break;
                }
            }
        }
        return bestHouse;
    }

    attachBuildingToHouse(house, building) {
        this.cityManager.ensureCity(house.cityId);
        house.attachments.push({ buildingId: building.id, population: building.population });
        building.attachedHouseId = house.id;
        building.cityId = house.cityId;
        this.updateHousePopulation(house);
        this.emitPopulationUpdate(building);
        this.emitPopulationUpdate(house);
    }

    detachFromHouse(building) {
        if (!building.attachedHouseId) {
            return;
        }

        const house = this.buildings.get(building.attachedHouseId);
        building.attachedHouseId = null;

        if (!house) {
            building.population = 0;
            this.emitPopulationUpdate(building);
            return;
        }

        house.attachments = house.attachments.filter((slot) => slot.buildingId !== building.id);
        this.updateHousePopulation(house);
        this.emitPopulationUpdate(house);

        building.population = 0;
        building.itemsLeft = 0;
        this.emitPopulationUpdate(building);
    }

    updateHouseAttachment(house, building) {
        if (!house) {
            return;
        }

        const slot = house.attachments.find((item) => item.buildingId === building.id);
        if (slot) {
            slot.population = building.population;
        } else {
            house.attachments.push({ buildingId: building.id, population: building.population });
        }
        this.updateHousePopulation(house);
        this.emitPopulationUpdate(house);
    }

    updateHousePopulation(house) {
        const total = house.attachments.reduce((sum, slot) => sum + slot.population, 0);
        house.population = Math.min(POPULATION_MAX_HOUSE, total);
    }

    backfillAttachmentsForHouse(house) {
        this.cityManager.ensureCity(house.cityId);
        for (const building of this.buildings.values()) {
            if (isHouse(building.type) || building.attachedHouseId) {
                continue;
            }
            if (building.ownerId !== house.ownerId && building.cityId !== house.cityId) {
                continue;
            }
            if (house.attachments.length >= 2) {
                break;
            }
            this.attachBuildingToHouse(house, building);
            this.emitPopulationUpdate(building);
        }
        this.emitPopulationUpdate(house);
    }

    emitPopulationUpdate(building, removed = false) {
        if (!this.io) {
            return;
        }
        const payload = { ...this.serializeBuilding(building), removed };
        this.io.emit('population:update', payload);
    }

    destroyCity(cityId, options = {}) {
        const numericId = Number(cityId);
        if (!Number.isFinite(numericId)) {
            return 0;
        }
        const broadcast = options.broadcast !== false;
        const buildings = Array.from(this.buildings.values()).filter((building) => {
            const candidateCity = building.cityId ?? building.city ?? 0;
            return Number(candidateCity) === numericId;
        });
        let removed = 0;
        for (const building of buildings) {
            this.removeBuilding(building.id, broadcast);
            removed += 1;
        }
        return removed;
    }
}

module.exports = BuildingFactory;
