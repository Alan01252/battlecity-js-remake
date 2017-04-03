/*jslint node: true */
"use strict";

var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);

var PlayerFactory = require('./src/PlayerFactory');
var BulletFactory = require('./src/PlayerFactory');
var BuildingFactory = require('./src/BuildingFactory');

server.listen(8081);

var game = {
    tick: 0,

    players: {}
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

