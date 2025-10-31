"use strict";

const {
    MONEY_MAX_VALUE,
    MONEY_STARTING_VALUE,
    MONEY_TICK_INTERVAL,
    COST_BUILDING,
    COST_UPKEEP_HOSPITAL,
} = require('./constants');

const REFUND_CHANCE = 0.25;

const toCityId = (cityId) => {
    if (typeof cityId === 'number' && Number.isFinite(cityId)) {
        return cityId;
    }
    const parsed = parseInt(cityId, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
};

class CityManager {
    constructor(game) {
        this.game = game;
        this.io = null;
        this.cities = new Map();
    }

    setIo(io) {
        this.io = io;
    }

    ensureCity(cityId) {
        const id = toCityId(cityId);
        if (!this.cities.has(id)) {
            const city = {
                id,
                cash: MONEY_STARTING_VALUE,
                income: 0,
                itemProduction: 0,
                research: 0,
                hospital: 0,
                construction: 0,
                nextFinanceTick: 0,
                updatedAt: Date.now(),
            };
            this.cities.set(id, city);
            if (!this.game.cities) {
                this.game.cities = [];
            }
            this.game.cities[id] = city;
        }
        return this.cities.get(id);
    }

    addIncome(cityId, amount) {
        if (!amount || amount <= 0) {
            return;
        }
        const city = this.ensureCity(cityId);
        city.cash += amount;
        city.income += amount;
        city.updatedAt = Date.now();
    }

    spendForResearch(cityId, amount) {
        if (!amount || amount <= 0) {
            return;
        }
        const city = this.ensureCity(cityId);
        city.cash -= amount;
        city.research += amount;
        city.updatedAt = Date.now();
    }

    spendForHospital(cityId, amount) {
        if (!amount || amount <= 0) {
            return;
        }
        const city = this.ensureCity(cityId);
        city.cash -= amount;
        city.hospital += amount;
        city.updatedAt = Date.now();
    }

    trySpendForFactory(cityId, amount) {
        if (!amount || amount <= 0) {
            return true;
        }
        const city = this.ensureCity(cityId);
        if (city.cash < amount) {
            return false;
        }
        city.cash -= amount;
        city.itemProduction += amount;
        city.updatedAt = Date.now();
        this.emitFinance(city);
        return true;
    }

    recordBuildingCost(cityId) {
        if (!COST_BUILDING) {
            return;
        }
        const city = this.ensureCity(cityId);
        city.cash -= COST_BUILDING;
        city.construction += COST_BUILDING;
        city.updatedAt = Date.now();
        this.emitFinance(city);
    }

    getCity(cityId) {
        const id = toCityId(cityId);
        return this.cities.get(id) || null;
    }

    cycle(currentTick) {
        if (!this.cities.size) {
            return;
        }
        for (const city of this.cities.values()) {
            if (currentTick <= city.nextFinanceTick) {
                continue;
            }

            city.nextFinanceTick = currentTick + MONEY_TICK_INTERVAL;

            if (city.cash > MONEY_MAX_VALUE) {
                city.cash = MONEY_MAX_VALUE;
            } else if (city.cash < 0) {
                city.cash = 0;
                if (Math.random() < REFUND_CHANCE) {
                    city.cash = COST_UPKEEP_HOSPITAL;
                }
            }

            this.emitFinance(city);

            city.income = 0;
            city.itemProduction = 0;
            city.research = 0;
            city.hospital = 0;
            city.construction = 0;
        }
    }

    emitFinance(city) {
        if (!this.io || !city) {
            return;
        }
        const grossIncome = city.income - (city.itemProduction + city.research + city.hospital + city.construction);
        const payload = {
            id: city.id,
            cash: city.cash,
            income: city.income,
            itemProduction: city.itemProduction,
            research: city.research,
            hospital: city.hospital,
            construction: city.construction,
            grossIncome,
            updatedAt: Date.now(),
        };
        this.io.emit('city:finance', payload);
    }
}

module.exports = CityManager;
