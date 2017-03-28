/*jslint node: true */
"use strict";

var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var PlayerFactory = require('./src/PlayerFactory');

server.listen(8081);

const playerFactory = new PlayerFactory();
playerFactory.listen(io);