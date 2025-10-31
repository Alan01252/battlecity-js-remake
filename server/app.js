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
const bulletFactory = new BulletFactory(game);
bulletFactory.listen(io);
const buildingFactory = new BuildingFactory(game);
buildingFactory.listen(io);

var loop = () => {

    game.lastTick = game.tick;
    game.tick = new Date().getTime();
    game.timePassed = (game.tick - game.lastTick);

    buildingFactory.cycle();
    setTimeout(function () {
        loop();
    }, 100)
};
loop();
