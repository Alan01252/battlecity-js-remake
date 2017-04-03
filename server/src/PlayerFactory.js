/*jslint node: true */
"use strict";

var Player = require("./Player");

var debug = require('debug')('BattleCity:PlayerFactory');

class PlayerFactory {

    constructor(game) {
        this.game = game;
    }

    listen(io) {

        debug("Starting Server");

        io.on("connection", (socket) => {


            socket.on('enter_game', (player) => {
                debug("Player entered game " + socket.id);
                debug(player);
                var newPlayer = new Player(socket.id, JSON.parse(player));
                debug(newPlayer);
                this.game.players[socket.id] = newPlayer;
                socket.broadcast.emit('enter_game', JSON.stringify(newPlayer));
            });

            socket.on('player', (player) => {
                if (this.game.players[socket.id]) {
                    this.game.players[socket.id].update(JSON.parse(player));
                    var playerJson = JSON.stringify(this.game.players[socket.id]);
                    socket.broadcast.emit('player', playerJson);
                }
            });
        });
    }

}


module.exports = PlayerFactory;