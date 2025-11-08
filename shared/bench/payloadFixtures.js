'use strict';

function createSamplePlayerPayload(id, seed = 1) {
    const direction = Math.floor((seed * 13) % 32);
    const isTurning = (seed * 7) % 3 === 0 ? 1 : 0;
    const sequence = Math.max(0, Math.floor(seed * 3));
    const baseCity = seed % 8;
    const now = Date.now();
    return {
        id: `socket-${id}`,
        city: baseCity,
        isMayor: seed % 16 === 0,
        health: 100,
        direction,
        isTurning,
        isMoving: seed % 2 === 0 ? 1 : 0,
        isCloaked: seed % 11 === 0,
        cloakExpiresAt: now + ((seed % 5) * 1000),
        isFrozen: seed % 9 === 0,
        frozenUntil: now + ((seed % 3) * 1200),
        sequence,
        offset: {
            x: Math.sin(seed * 0.37) * 480,
            y: Math.cos(seed * 0.19) * 480
        },
        callsign: `Player-${id}`,
        userId: `user-${id}`
    };
}

function createPlayerSnapshot(playerCount, seedOffset = 1) {
    return Array.from({ length: playerCount }, (_, index) => {
        const seed = seedOffset + index;
        return createSamplePlayerPayload(index, seed);
    });
}

function createPlayerSnapshotString(playerCount, seedOffset = 1) {
    return JSON.stringify(createPlayerSnapshot(playerCount, seedOffset));
}

function createSampleBulletPayload(seed = 1) {
    return {
        shooter: `socket-${seed % 200}`,
        x: 512 + Math.sin(seed * 0.11) * 24,
        y: 512 + Math.cos(seed * 0.09) * 24,
        angle: (seed * Math.PI * 1.37) % (Math.PI * 2),
        type: seed % 4,
        team: seed % 6,
        sourceId: `building-${seed % 50}`,
        sourceType: 'tower'
    };
}

module.exports = {
    createSamplePlayerPayload,
    createPlayerSnapshot,
    createPlayerSnapshotString,
    createSampleBulletPayload
};
