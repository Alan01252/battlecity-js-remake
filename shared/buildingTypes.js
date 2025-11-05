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

module.exports = {
    resolveBuildingFamily,
    isHouse,
    isResearch,
    isFactory,
    isCommandCenter,
    isHospital,
};
