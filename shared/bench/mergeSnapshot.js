'use strict';

function mergeSnapshotIntoCache(players, iteration, cache) {
    const seqIncrement = iteration + 1;
    for (let i = 0; i < players.length; i += 1) {
        const player = players[i];
        player.sequence = (player.sequence || 0) + seqIncrement;
        const existing = cache[player.id];
        if (existing && existing.sequence !== undefined && player.sequence <= existing.sequence) {
            continue;
        }
        if (existing) {
            existing.sequence = player.sequence;
            existing.city = player.city;
            existing.isMayor = !!player.isMayor;
            existing.health = player.health;
            existing.direction = player.direction;
            existing.isTurning = player.isTurning;
            existing.isMoving = player.isMoving;
            existing.isCloaked = !!player.isCloaked;
            existing.cloakExpiresAt = player.cloakExpiresAt;
            existing.isFrozen = !!player.isFrozen;
            existing.frozenUntil = player.frozenUntil;
            existing.callsign = player.callsign;
            existing.userId = player.userId;
            if (!existing.offset) {
                existing.offset = { x: 0, y: 0 };
            }
            existing.offset.x = player.offset?.x ?? existing.offset.x ?? 0;
            existing.offset.y = player.offset?.y ?? existing.offset.y ?? 0;
        } else {
            cache[player.id] = {
                ...player,
                offset: {
                    x: player.offset?.x ?? 0,
                    y: player.offset?.y ?? 0
                }
            };
        }
    }
    return players.length;
}

module.exports = {
    mergeSnapshotIntoCache
};
