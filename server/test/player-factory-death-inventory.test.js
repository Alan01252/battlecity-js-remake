"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const PlayerFactory = require("../src/PlayerFactory");
const Player = require("../src/Player");
const CityManager = require("../src/CityManager");
const { ITEM_TYPES } = require("../src/items");

const createFactoryWithCityManager = () => {
    const game = { players: {} };
    const cityManager = new CityManager(game);
    game.buildingFactory = { cityManager };

    const factory = new PlayerFactory(game);
    factory.io = {
        events: [],
        emit(event, payload) {
            this.events.push({ event, payload });
        },
        sockets: {
            sockets: new Map()
        }
    };

    return { factory, game, cityManager };
};

test("handlePlayerDeath removes player inventory so cities can rebuild", () => {
    const { factory, game, cityManager } = createFactoryWithCityManager();
    const socketId = "player_socket";
    const player = new Player(socketId, { city: 1, callsign: "Alpha" }, Date.now());
    player.city = 1;
    game.players[socketId] = player;

    cityManager.recordInventoryPickup(socketId, player.city, ITEM_TYPES.MEDKIT, 2);
    cityManager.recordInventoryPickup(socketId, player.city, ITEM_TYPES.CLOAK, 1);

    assert.equal(cityManager.getInventoryCount(player.city, ITEM_TYPES.MEDKIT), 2);
    assert.equal(cityManager.getInventoryCount(player.city, ITEM_TYPES.CLOAK), 1);
    assert.equal(cityManager.inventoryByPlayer.get(socketId).items.size, 2);

    factory.handlePlayerDeath(socketId, player, { type: "mine" });

    assert.equal(cityManager.getInventoryCount(player.city, ITEM_TYPES.MEDKIT), 0);
    assert.equal(cityManager.getInventoryCount(player.city, ITEM_TYPES.CLOAK), 0);
    assert.equal(cityManager.inventoryByPlayer.has(socketId), false);
});
