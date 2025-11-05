"use strict";

const POPULATION_INTERVAL_MS = 250;
const POPULATION_INCREMENT = 5;
const POPULATION_MAX_HOUSE = 100;
const POPULATION_MAX_NON_HOUSE = 50;
const MONEY_MAX_VALUE = 95000000;
const MONEY_STARTING_VALUE = 95000000;
const MONEY_TICK_INTERVAL = 7000;
const COST_BUILDING = 500000;
const COST_ITEM = 750000;
const COST_INCOME_POPULATION = 10000;
const COST_UPKEEP_HOSPITAL = 2000000;

const resolveBuildingFamily = (type) => {
    if (type === null || type === undefined) {
        return null;
    }
    const numeric = Number(type);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    if (numeric < 100) {
        return numeric;
    }
    return Math.floor(numeric / 100);
};

const isHouse = (type) => resolveBuildingFamily(type) === 3;
const isResearch = (type) => resolveBuildingFamily(type) === 4;
const isFactory = (type) => resolveBuildingFamily(type) === 1 && Number(type) !== 100;
const isCommandCenter = (type) => resolveBuildingFamily(type) === 0;
const isHospital = (type) => resolveBuildingFamily(type) === 2;

const FACTORY_ITEM_LIMITS = {
    100: 4,   // Cloak factory (ITEM_TYPE_CLOAK)
    101: 4,   // Bazooka/Rocket factory (ITEM_TYPE_ROCKET)
    102: 20,  // Medkit factory (ITEM_TYPE_MEDKIT)
    103: 20,  // Bomb factory (ITEM_TYPE_BOMB)
    104: 10,  // Mine factory (ITEM_TYPE_MINE)
    105: 1,   // Orb factory (ITEM_TYPE_ORB)
    106: 4,   // Flare factory (legacy walkie)
    107: 5,   // DFG factory
    108: 20,  // Wall factory
    109: 10,  // Turret factory
    110: 5,   // Sleeper factory
    111: 5,   // Plasma factory
    112: 4,   // Laser factory (parity with legacy rocket cap)
};

module.exports = {
    POPULATION_INTERVAL_MS,
    POPULATION_INCREMENT,
    POPULATION_MAX_HOUSE,
    POPULATION_MAX_NON_HOUSE,
    MONEY_MAX_VALUE,
    MONEY_STARTING_VALUE,
    MONEY_TICK_INTERVAL,
    COST_BUILDING,
    COST_ITEM,
    COST_INCOME_POPULATION,
    COST_UPKEEP_HOSPITAL,
    isHouse,
    isResearch,
    isFactory,
    isCommandCenter,
    isHospital,
    FACTORY_ITEM_LIMITS,
};
