"use strict";

const assert = require("node:assert");
const { test } = require("node:test");

const CityManager = require("../src/CityManager");
const OrbManager = require("../src/orb/OrbManager");
const { TILE_SIZE, ORBABLE_SIZE } = require("../src/gameplay/constants");
const citySpawns = require("../../shared/citySpawns.json");

const createSocket = (id) => {
    const emitted = [];
    return {
        id,
        emitted,
        emit(event, payload) {
            emitted.push({ event, payload });
        }
    };
};

const createIo = () => ({
    emitted: [],
    emit(event, payload) {
        this.emitted.push({ event, payload });
    }
});

test("orb detonation consumes active orb count and frees production slot", () => {
    const game = { players: {}, cities: [] };
    const cityManager = new CityManager(game);
    const buildingFactory = {
        destroyCityCalls: [],
        destroyCity(cityId) {
            this.destroyCityCalls.push(cityId);
        },
        cityManager
    };
    const hazardManager = { removeHazardsForTeam() {} };
    const defenseManager = { clearCity() {} };

    const attackerCityId = 0;
    const targetCityId = 1;

    const player = { id: "player-1", city: attackerCityId };
    const socket = createSocket("socket-1");
    game.players[socket.id] = player;

    cityManager.ensureCity(attackerCityId);
    const targetCity = cityManager.ensureCity(targetCityId);
    targetCity.maxBuildings = ORBABLE_SIZE;
    targetCity.currentBuildings = ORBABLE_SIZE;
    cityManager.updateOrbableState(targetCity);

    const playerFactory = {
        getPlayer: (socketId) => (socketId === socket.id ? player : null),
        recordOrbVictoryForCity() {},
        evictCityPlayers() {}
    };

    const orbManager = new OrbManager({
        game,
        cityManager,
        playerFactory,
        buildingFactory,
        hazardManager,
        defenseManager
    });
    orbManager.setIo(createIo());

    cityManager.registerOrbProduced(attackerCityId);
    cityManager.registerOrbHolder(socket.id, attackerCityId);
    assert.strictEqual(cityManager.getActiveOrbCount(attackerCityId), 1, "precondition: active orb count should be tracked");

    const spawn = citySpawns[String(targetCityId)];
    assert.ok(spawn, "target city spawn should exist");
    const dropPayload = {
        x: spawn.tileX * TILE_SIZE,
        y: spawn.tileY * TILE_SIZE
    };

    orbManager.handleDrop(socket, JSON.stringify(dropPayload));

    assert.strictEqual(cityManager.getActiveOrbCount(attackerCityId), 0, "orb drop should consume the active orb");
    assert.strictEqual(
        buildingFactory.destroyCityCalls.includes(targetCityId),
        true,
        "target city should be destroyed after a successful orb"
    );
    assert.ok(
        cityManager.orbHolders.size === 0,
        "orb holder tracking should be cleared after detonation"
    );

    const resultEvent = socket.emitted.find((entry) => entry.event === "orb:result");
    assert.ok(resultEvent, "orb result should be emitted to the dropper");
    const payload = typeof resultEvent.payload === "string"
        ? JSON.parse(resultEvent.payload)
        : resultEvent.payload;
    assert.strictEqual(payload.status, "detonated");
    assert.strictEqual(payload.targetCity, targetCityId);
});
