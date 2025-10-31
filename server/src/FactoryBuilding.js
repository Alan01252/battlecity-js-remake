/*jslint node: true */
"use strict";


var debug = require('debug')('BattleCity:FactoryBuilding');
const { POPULATION_MAX_NON_HOUSE, FACTORY_ITEM_LIMITS, COST_ITEM } = require('./constants');

class FactoryBuilding {

    constructor(game, building) {

        this.game = game;
        this.building = building;
        this.productionTick = 0;
    }

    cycle(factory, io) {
        if (!io) {
            return;
        }
        if (this.building.population < POPULATION_MAX_NON_HOUSE) {
            return;
        }

        const limit = FACTORY_ITEM_LIMITS[this.building.type];
        if (limit !== undefined && (this.building.itemsLeft || 0) >= limit) {
            return;
        }

        if (this.game.tick > this.productionTick) {
            const cityManager = factory ? factory.cityManager : null;
            const cityId = this.building.cityId ?? 0;
            if (cityManager && !cityManager.trySpendForFactory(cityId, COST_ITEM)) {
                this.productionTick = this.game.tick + 1000;
                return;
            }

            this.productionTick = this.game.tick + 7000;

            const icon = {
                x: (this.building.x * 48) + 56,
                y: (this.building.y * 48) + 102,
                type: this.building.type % 100,
            };

            debug("Factory produced icon", icon);
            io.emit("new_icon", JSON.stringify(icon));

            const current = this.building.itemsLeft || 0;
            this.building.itemsLeft = limit !== undefined ? Math.min(limit, current + 1) : current + 1;
            this.building.smokeActive = true;
            this.building.smokeFrame = 1;
            this.building.smokeTick = this.game.tick + 200;
            this.building.smokeEndTick = this.game.tick + 4000;
            factory.emitPopulationUpdate(this.building);
        }
    }
}

module.exports = FactoryBuilding;
