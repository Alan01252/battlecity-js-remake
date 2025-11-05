"use strict";

const { TILE_SIZE } = require("../gameplay/constants");
const { isHospital } = require("../constants");

const parseNumericType = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return NaN;
};

const isHospitalBuilding = (buildingOrType) => {
    const typeValue = (buildingOrType && typeof buildingOrType === "object")
        ? buildingOrType.type
        : buildingOrType;
    const numericType = parseNumericType(typeValue);
    if (!Number.isFinite(numericType)) {
        return false;
    }
    return isHospital(numericType);
};

const getHospitalDriveableRect = (building) => {
    if (!building) {
        return null;
    }
    const baseX = Number.isFinite(building.x) ? building.x : parseInt(building.x, 10) || 0;
    const baseY = Number.isFinite(building.y) ? building.y : parseInt(building.y, 10) || 0;
    return {
        x: baseX * TILE_SIZE,
        y: (baseY * TILE_SIZE) + (TILE_SIZE * 2),
        w: TILE_SIZE * 3,
        h: TILE_SIZE,
    };
};

module.exports = {
    parseNumericType,
    isHospitalBuilding,
    getHospitalDriveableRect,
};
