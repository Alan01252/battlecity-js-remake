"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const PlayerFactory = require("../src/PlayerFactory");
const { TILE_SIZE, MAX_HEALTH } = require("../src/gameplay/constants");

const createFactory = () => {
    const game = {
        players: {},
        buildingFactory: {
            buildings: new Map(),
        },
    };
    const factory = new PlayerFactory(game);
    factory.io = {
        events: [],
        emit(event, payload) {
            let parsed = payload;
            if (typeof payload === "string") {
                try {
                    parsed = JSON.parse(payload);
                } catch (error) {
                    parsed = payload;
                }
            }
            this.events.push({ event, payload: parsed });
        },
    };
    return { factory, game };
};

const addHospital = (game, { id = "hospital", type = 200, x = 4, y = 6 } = {}) => {
    const hospital = { id, type, x, y };
    game.buildingFactory.buildings.set(id, hospital);
    return hospital;
};

test("applyHospitalHealingForPlayer heals occupants inside hospital bay", () => {
    const { factory, game } = createFactory();
    const hospital = addHospital(game, { x: 8, y: 5 });
    const player = {
        id: "player-1",
        offset: {
            x: hospital.x * TILE_SIZE,
            y: (hospital.y * TILE_SIZE) + (TILE_SIZE * 2),
        },
        health: 20,
    };

    const now = 10_000;
    const healed = factory.applyHospitalHealingForPlayer(player, now);

    assert.equal(healed, true);
    assert.equal(player.health, 22);
    assert.equal(player.lastHospitalHealAt, now);
    assert.equal(factory.io.events.length, 1);
    assert.equal(factory.io.events[0].event, "player:health");
    assert.deepEqual(factory.io.events[0].payload, {
        id: player.id,
        health: 22,
        previousHealth: 20,
        source: {
            type: "hospital",
            buildingId: hospital.id,
        },
    });
});

test("applyHospitalHealingForPlayer enforces cooldown interval", () => {
    const { factory, game } = createFactory();
    const hospital = addHospital(game, { x: 3, y: 4 });
    const player = {
        id: "player-2",
        offset: {
            x: hospital.x * TILE_SIZE,
            y: (hospital.y * TILE_SIZE) + (TILE_SIZE * 2),
        },
        health: 10,
    };

    const firstHeal = factory.applyHospitalHealingForPlayer(player, 5_000);
    assert.equal(firstHeal, true);
    assert.equal(player.health, 12);

    const blockedHeal = factory.applyHospitalHealingForPlayer(player, 5_050);
    assert.equal(blockedHeal, false);
    assert.equal(player.health, 12);
    assert.equal(factory.io.events.length, 1, "should not emit during cooldown");

    const secondHeal = factory.applyHospitalHealingForPlayer(player, 5_200);
    assert.equal(secondHeal, true);
    assert.equal(player.health, 14);
    assert.equal(factory.io.events.length, 2);
});

test("applyHospitalHealingForPlayer caps health at maximum", () => {
    const { factory, game } = createFactory();
    const hospital = addHospital(game, { x: 12, y: 7 });
    const player = {
        id: "player-3",
        offset: {
            x: hospital.x * TILE_SIZE,
            y: (hospital.y * TILE_SIZE) + (TILE_SIZE * 2),
        },
        health: MAX_HEALTH - 1,
    };

    const healed = factory.applyHospitalHealingForPlayer(player, 9_000);
    assert.equal(healed, true);
    assert.equal(player.health, MAX_HEALTH);
    assert.equal(factory.io.events[0].payload.health, MAX_HEALTH);
    assert.equal(factory.io.events[0].payload.previousHealth, MAX_HEALTH - 1);

    const noOverflow = factory.applyHospitalHealingForPlayer(player, 9_200);
    assert.equal(noOverflow, false);
    assert.equal(player.health, MAX_HEALTH);
    assert.equal(factory.io.events.length, 1);
});

test("applyHospitalHealingForPlayer ignores players outside hospital bays", () => {
    const { factory, game } = createFactory();
    const hospital = addHospital(game, { x: 20, y: 20 });
    const player = {
        id: "player-4",
        offset: {
            x: (hospital.x * TILE_SIZE) - TILE_SIZE,
            y: (hospital.y * TILE_SIZE) + (TILE_SIZE * 2),
        },
        health: 5,
    };

    const healed = factory.applyHospitalHealingForPlayer(player, 12_000);
    assert.equal(healed, false);
    assert.equal(player.health, 5);
    assert.equal(factory.io.events.length, 0);
});

test("applyHospitalHealingForPlayer ignores players at or below zero health", () => {
    const { factory, game } = createFactory();
    addHospital(game);
    const player = {
        id: "player-5",
        offset: {
            x: 4 * TILE_SIZE,
            y: (6 * TILE_SIZE) + (TILE_SIZE * 2),
        },
        health: 0,
    };

    const healed = factory.applyHospitalHealingForPlayer(player, 15_000);
    assert.equal(healed, false);
    assert.equal(factory.io.events.length, 0);
});
