#!/usr/bin/env node
const { performance } = require('node:perf_hooks');
const BulletFactory = require('../src/BulletFactory');

const TILE_SIZE = 48;
const MAP_SIZE = 512;

const makeMap = () => {
    const map = new Array(MAP_SIZE);
    for (let x = 0; x < MAP_SIZE; x += 1) {
        map[x] = new Array(MAP_SIZE).fill(0);
    }
    // add a wall band to force collision checks
    for (let x = 100; x < 120; x += 1) {
        for (let y = 100; y < 120; y += 1) {
            map[x][y] = 2;
        }
    }
    return map;
};

const createBuilding = (id, x, y, { width = null, height = null, type = 4 } = {}) => {
    const building = {
        id,
        x,
        y,
        type,
        ownerId: 'owner',
        cityId: 1,
        attachments: [],
    };
    if (Number.isFinite(width)) {
        building.width = width;
    }
    if (Number.isFinite(height)) {
        building.height = height;
    }
    return building;
};

const createBuildingField = (count) => {
    const entries = [];
    const grid = Math.ceil(Math.sqrt(count));
    const spacing = 6; // tiles between structures to avoid overlap
    const start = 24;
    for (let index = 0; index < count; index += 1) {
        const gridX = index % grid;
        const gridY = Math.floor(index / grid);
        const tileX = start + (gridX * spacing);
        const tileY = start + (gridY * spacing);
        const typeCycle = index % 5;
        let type = 4;
        if (typeCycle === 0) {
            type = 0; // command center footprint with walkway bay
        } else if (typeCycle === 1) {
            type = 200; // hospital footprint with walkway bay
        } else if (typeCycle === 2) {
            type = 101; // factory block
        }
        entries.push([`b${index}`, createBuilding(`b${index}`, tileX, tileY, { type })]);
    }
    return new Map(entries);
};

const buildingCount = Number(process.argv[4] || 81);

const buildingFactory = {
    buildings: createBuildingField(buildingCount),
};

const playerFactory = {
    getPlayerTeam(id) {
        return id === 'enemy' ? 1 : 0;
    }
};

const players = {};
for (let i = 0; i < 32; i += 1) {
    const id = `player_${i}`;
    players[id] = {
        id,
        offset: { x: 300 + (i * 32), y: 300 + (i * 16) },
        width: TILE_SIZE,
        height: TILE_SIZE,
        teamId: i % 2,
        isMoving: 1,
    };
}

const game = {
    map: makeMap(),
    players,
    buildingFactory,
};

const bulletFactory = new BulletFactory(game, playerFactory);
const bulletCount = Number(process.argv[2] || 2000);
const iterations = Number(process.argv[3] || 200);

for (let i = 0; i < bulletCount; i += 1) {
    bulletFactory.spawnSystemBullet({
        x: 200 + (i % 200) * 8,
        y: 200 + ((i / 200) | 0) * 8,
        angle: i % 32,
        type: i % 3,
        teamId: i % 2,
    });
}

let total = 0;
for (let iter = 0; iter < iterations; iter += 1) {
    const start = performance.now();
    bulletFactory.cycle(16);
    const end = performance.now();
    total += (end - start);
}

const avg = total / iterations;
console.log(JSON.stringify({
    bullets: bulletCount,
    iterations,
    buildings: buildingCount,
    totalMs: total,
    avgMs: avg,
}));
