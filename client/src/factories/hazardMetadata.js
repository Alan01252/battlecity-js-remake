export const normaliseTeamId = (value, fallback, toFiniteNumber) => {
    if (typeof toFiniteNumber === 'function') {
        const numeric = toFiniteNumber(value, fallback);
        if (Number.isFinite(numeric)) {
            return Math.max(0, Math.floor(numeric));
        }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return Math.max(0, Math.floor(parsed));
        }
    }
    return null;
};

export const applyHazardMetadata = (item, hazard, toFiniteNumber) => {
    if (!item || !hazard || typeof hazard !== 'object') {
        return;
    }
    if (Object.prototype.hasOwnProperty.call(hazard, 'ownerId')) {
        const ownerId = hazard.ownerId ?? null;
        item.ownerId = ownerId;
        item.owner = ownerId;
    }
    if (Object.prototype.hasOwnProperty.call(hazard, 'teamId')) {
        if (hazard.teamId === null) {
            item.teamId = null;
            item.city = null;
        } else {
            const fallback = item.city ?? item.teamId ?? null;
            const teamId = normaliseTeamId(hazard.teamId, fallback, toFiniteNumber);
            if (teamId !== null) {
                item.teamId = teamId;
                item.city = teamId;
            }
        }
    }
};
