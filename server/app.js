/*jslint node: true */
"use strict";

var express = require('express');
var http = require('http');
var app = express();
var server = http.createServer(app);
var { Server } = require('socket.io');
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
    cities: []
};


const playerFactory = new PlayerFactory(game);
playerFactory.listen(io);
const bulletFactory = new BulletFactory(game, playerFactory);
bulletFactory.listen(io);
const buildingFactory = new BuildingFactory(game);
buildingFactory.listen(io);
const hazardManager = new HazardManager(game, playerFactory);
hazardManager.setIo(io);

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
    socket.on('disconnect', () => {
        hazardManager.onDisconnect(socket.id);
    });
    hazardManager.sendSnapshot(socket);
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
