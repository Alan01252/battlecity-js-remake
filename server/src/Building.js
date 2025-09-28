"use strict";

const {
    POPULATION_INTERVAL_MS,
    POPULATION_INCREMENT,
    POPULATION_MAX_HOUSE,
    POPULATION_MAX_NON_HOUSE,
    isHouse,
    isResearch,
    isFactory,
    isHospital,
    isCommandCenter,
} = require('./constants');

class Building {
    constructor(ownerId, building, socket) {
        this.ownerId = ownerId || (socket ? socket.id : null);
        this.socket = socket;
        this.attachments = [];
        this.attachedHouseId = null;
        this.population = 0;
        this.populationTick = 0;
        this.moneyTick = 0;
        this.productionTick = 0;
        this.cityId = building.city !== undefined ? building.city : 0;
        this.itemsLeft = 0;
        this.smokeActive = false;
        this.smokeFrame = 0;
        this.smokeTick = 0;
        this.smokeEndTick = 0;
        this.update(building);
    }

    update(building) {
        this.id = building.id || `${building.x}_${building.y}`;
        this.x = building.x;
        this.y = building.y;
        this.type = Number(building.type);
        if (building.city !== undefined) {
            this.cityId = building.city;
        }
        if (building.itemsLeft !== undefined) {
            this.itemsLeft = building.itemsLeft;
        }
    }

    injectType(type) {
        this.subType = type;
    }

    isHouse() {
        return isHouse(this.type);
    }

    isResearch() {
        return isResearch(this.type);
    }

    isFactory() {
        return isFactory(this.type);
    }

    isHospital() {
        return isHospital(this.type);
    }

    isCommandCenter() {
        return isCommandCenter(this.type);
    }

    hasMaxPopulation() {
        if (this.isHouse()) {
            return this.population >= POPULATION_MAX_HOUSE;
        }
        return this.population >= POPULATION_MAX_NON_HOUSE;
    }

    resetPopulationCounters() {
        this.population = 0;
        this.populationTick = 0;
        this.attachedHouseId = null;
        this.attachments = [];
    }

    cycle(game, factory) {
        this.handlePopulation(game, factory);
        this.updateSmoke(game, factory);
        if (this.subType && factory && factory.io) {
            this.subType.cycle(factory, factory.io);
        }
    }

    handlePopulation(game, factory) {
        if (!factory) {
            return;
        }

        if (game.tick <= this.populationTick) {
            return;
        }

        this.populationTick = game.tick + POPULATION_INTERVAL_MS;

        // Houses report population via attachment updates; avoid recomputing every tick
        if (this.isHouse()) {
            return;
        }

        const house = factory.ensureAttachment(this);
        if (!house) {
            if (this.population !== 0) {
                this.population = 0;
                factory.emitPopulationUpdate(this);
            }
            return;
        }

        const previousPopulation = this.population;
        if (this.population < POPULATION_MAX_NON_HOUSE) {
            this.population = Math.min(POPULATION_MAX_NON_HOUSE, this.population + POPULATION_INCREMENT);
        }

        if (this.population !== previousPopulation) {
            factory.updateHouseAttachment(house, this);
            factory.emitPopulationUpdate(this);
        }
    }

    updateSmoke(game, factory) {
        if (!factory) {
            return;
        }

        if (this.smokeActive && game.tick > this.smokeTick) {
            this.smokeFrame = (this.smokeFrame % 5) + 1;
            this.smokeTick = game.tick + 200;
            factory.emitPopulationUpdate(this);
        }

        if (this.smokeActive && game.tick > this.smokeEndTick) {
            this.smokeActive = false;
            this.smokeFrame = 0;
            factory.emitPopulationUpdate(this);
        }
    }
}

module.exports = Building;
