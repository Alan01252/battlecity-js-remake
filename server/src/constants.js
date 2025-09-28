"use strict";

const POPULATION_INTERVAL_MS = 250;
const POPULATION_INCREMENT = 5;
const POPULATION_MAX_HOUSE = 160;
const POPULATION_MAX_NON_HOUSE = 80;

const getFamilyCode = (type) => Math.floor(type / 100);

const isHouse = (type) => getFamilyCode(type) === 3;
const isResearch = (type) => getFamilyCode(type) === 4;
const isFactory = (type) => getFamilyCode(type) === 1 && type !== 100;
const isCommandCenter = (type) => type === 0;
const isHospital = (type) => type === 301 || type === 401;

const FACTORY_ITEM_LIMITS = {
    112: 4,  // Laser factory
    109: 4,  // Turret factory
    103: 5,  // Bomb factory
    102: 20, // Medkit factory
    104: 10, // Mine factory
    105: 1,  // Orb / Cougar factory
    101: 4,  // Cougar research factory variant
    110: 5,  // Sleeper factory
    108: 5,  // Wall factory
    107: 5,  // DFG factory
    106: 5,  // Flare factory
};

module.exports = {
    POPULATION_INTERVAL_MS,
    POPULATION_INCREMENT,
    POPULATION_MAX_HOUSE,
    POPULATION_MAX_NON_HOUSE,
    isHouse,
    isResearch,
    isFactory,
    isCommandCenter,
    isHospital,
    FACTORY_ITEM_LIMITS,
};
