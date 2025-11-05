/*jslint node: true */
"use strict";

var express = require('express');
var http = require('http');
var app = express();
var server = http.createServer(app);
var { Server } = require('socket.io');
var citySpawns = require('../shared/citySpawns.json');
var io = new Server(server, {
    cors: {
        origin: "http://localhost:8020",
        methods: ["GET", "POST"]
    }
});

var PlayerFactory = require('./src/PlayerFactory');
var BulletFactory = require('./src/BulletFactory');
var BuildingFactory = require('./src/BuildingFactory');
var HazardManager = require('./src/hazards/HazardManager');
var OrbManager = require('./src/orb/OrbManager');
var FakeCityManager = require('./src/FakeCityManager');
var DefenseManager = require('./src/DefenseManager');
var { loadMapData } = require('./src/utils/mapLoader');
var ChatManager = require('./src/chat/ChatManager');

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

var PORT = process.env.PORT || 8021;
server.listen(PORT, () => {
    console.log(`BattleCity server listening on port ${PORT}`);
});

var game = {
    tick: 0,

    players: {},
    cities: [],
    map: []
};

try {
    var mapData = loadMapData();
    if (mapData && Array.isArray(mapData.map)) {
        game.map = mapData.map;
        console.log(`[map] Loaded map.dat (${game.map.length} columns / ${Array.isArray(game.map[0]) ? game.map[0].length : 0} rows)`);
    } else {
        console.warn('[map] Map data missing or invalid, collision checks may fail');
    }
} catch (error) {
    console.warn('[map] Unable to load map data:', error.message);
}


const playerFactory = new PlayerFactory(game);
playerFactory.listen(io);
const bulletFactory = new BulletFactory(game, playerFactory);
bulletFactory.listen(io);
const buildingFactory = new BuildingFactory(game);
buildingFactory.listen(io);
game.buildingFactory = buildingFactory;
const hazardManager = new HazardManager(game, playerFactory);
hazardManager.setIo(io);
const defenseManager = new DefenseManager({ game, playerFactory });
defenseManager.setIo(io);
buildingFactory.setManagers({ hazardManager, defenseManager, playerFactory });
const orbManager = new OrbManager({
    game,
    cityManager: buildingFactory.cityManager,
    playerFactory,
    buildingFactory,
    hazardManager,
    defenseManager,
});
orbManager.setIo(io);
const fakeCityManager = new FakeCityManager({
    game,
    buildingFactory,
    playerFactory,
    hazardManager,
    defenseManager,
    bulletFactory,
});
fakeCityManager.setIo(io);

const chatManager = new ChatManager({
    game,
    playerFactory,
});
chatManager.listen(io);

const toFiniteNumber = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const normaliseCityId = (cityId) => {
    const numeric = toFiniteNumber(cityId, null);
    if (numeric === null) {
        return null;
    }
    return Math.max(0, Math.floor(numeric));
};

const getCityDisplayName = (cityId) => {
    const id = normaliseCityId(cityId);
    if (id === null) {
        return 'City';
    }
    const key = String(id);
    const entry = citySpawns && citySpawns[key];
    if (entry && entry.name) {
        return entry.name;
    }
    return `City ${id + 1}`;
};

const shortenId = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }
    if (value.length <= 8) {
        return value;
    }
    return `${value.slice(0, 4)}...${value.slice(-2)}`;
};

const parseCityInspectPayload = (payload) => {
    if (payload === null || payload === undefined) {
        return null;
    }
    if (typeof payload === 'number') {
        return normaliseCityId(payload);
    }
    if (typeof payload === 'string') {
        try {
            const parsed = JSON.parse(payload);
            return parseCityInspectPayload(parsed);
        } catch (error) {
            return normaliseCityId(payload);
        }
    }
    if (typeof payload === 'object') {
        if (payload.city !== undefined) {
            return normaliseCityId(payload.city);
        }
        if (payload.cityId !== undefined) {
            return normaliseCityId(payload.cityId);
        }
        if (payload.id !== undefined) {
            return normaliseCityId(payload.id);
        }
    }
    return null;
};

const collectCityInfo = (cityId) => {
    const id = normaliseCityId(cityId) ?? 0;
    const roster = playerFactory.ensureCityRoster
        ? playerFactory.ensureCityRoster(id)
        : null;

    const players = Object.values(game.players)
        .filter((player) => normaliseCityId(player && player.city) === id);

    const mayorId = roster && roster.mayor
        ? roster.mayor
        : (players.find((player) => player && player.isMayor)?.id || null);

    const mayorLabel = mayorId ? shortenId(mayorId) : null;

    let buildingCount = 0;
    if (buildingFactory && buildingFactory.buildings) {
        for (const building of buildingFactory.buildings.values()) {
            if (normaliseCityId(building && building.cityId) === id) {
                buildingCount += 1;
            }
        }
    }

    const cityManager = buildingFactory && buildingFactory.cityManager
        ? buildingFactory.cityManager
        : null;
    const cityState = cityManager
        ? cityManager.getCity(id)
        : (game.cities && game.cities[id]) || null;
    const cityName = (cityState && (cityState.nameOverride || cityState.name))
        ? (cityState.nameOverride || cityState.name)
        : getCityDisplayName(id);

    const orbPoints = cityState && cityManager
        ? cityManager.getOrbValue(cityState)
        : 0;
    const cityOrbs = cityState ? Number(cityState.orbs) || 0 : 0;
    const cityScore = cityState ? Number(cityState.score) || 0 : 0;
    const isOrbable = cityManager ? cityManager.isOrbable(id) : false;

    const startedAt = cityState && cityState.startedAt
        ? cityState.startedAt
        : (cityState && cityState.updatedAt) || null;
    const uptimeInMinutes = startedAt
        ? Math.max(0, Math.floor((Date.now() - startedAt) / 60000))
        : 0;

    return {
        cityId: id,
        cityName,
        mayorId: mayorId || null,
        mayorLabel: mayorLabel,
        playerCount: players.length,
        buildingCount,
        isOrbable,
        orbs: cityOrbs,
        orbPoints,
        score: cityScore,
        uptimeInMinutes,
    };
};

io.on('connection', (socket) => {
    socket.on('hazard:spawn', (payload) => {
        hazardManager.spawnHazard(socket, payload);
    });
    socket.on('hazard:arm', (payload) => {
        hazardManager.handleArm(socket, hazardManager.parsePayload(payload));
    });
    socket.on('hazard:remove', (payload) => {
        hazardManager.handleRemove(socket, hazardManager.parsePayload(payload));
    });
    socket.on('city:inspect', (payload) => {
        const cityId = parseCityInspectPayload(payload);
        if (cityId === null || cityId === undefined) {
            return;
        }
        const info = collectCityInfo(cityId);
        if (info) {
            socket.emit('city:info', info);
        }
    });
    socket.on('orb:drop', (payload) => {
        orbManager.handleDrop(socket, payload);
    });
    socket.on('defense:spawn', (payload) => {
        defenseManager.handleSpawn(socket, payload);
    });
    socket.on('defense:remove', (payload) => {
        defenseManager.handleRemove(socket, payload);
    });
    socket.on('disconnect', () => {
        hazardManager.onDisconnect(socket.id);
    });
    hazardManager.sendSnapshot(socket);
    fakeCityManager.sendSnapshot(socket);
});

const BUILDING_UPDATE_INTERVAL = 100;
let buildingAccumulator = 0;

var loop = () => {

    var now = Date.now();
    if (!game.tick) {
        game.tick = now;
        game.lastTick = now;
    }
    var delta = now - (game.tick || now);
    if (delta < 0 || delta > 1000) {
        delta = 16;
    }
    game.lastTick = game.tick;
    game.tick = now;
    game.timePassed = delta;

    bulletFactory.cycle(delta);
    hazardManager.update(delta);
    playerFactory.cycle(now);
    fakeCityManager.update(now);

    buildingAccumulator += delta;
    if (buildingAccumulator >= BUILDING_UPDATE_INTERVAL) {
        buildingFactory.cycle();
        buildingAccumulator = buildingAccumulator % BUILDING_UPDATE_INTERVAL;
    }

    setTimeout(function () {
        loop();
    }, 16);
};
loop();
