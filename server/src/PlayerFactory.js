/*jslint node: true */
"use strict";

var Player = require("./Player");
var PlayerStateValidator = require("./validation/PlayerStateValidator");

var debug = require('debug')('BattleCity:PlayerFactory');

class PlayerFactory {

    constructor(game) {
        this.game = game;
        this.validator = new PlayerStateValidator();
    }

    listen(io) {

        debug("Starting Server");

        io.on("connection", (socket) => {


            socket.on('enter_game', (player) => {
                debug("Player entered game " + socket.id);
                var parsedPlayer = this.safeParse(player);
                var validation = this.validator.initializePlayerState(parsedPlayer, { now: Date.now() });
                var newPlayer = new Player(socket.id, validation.sanitized, validation.timestamp);
                this.game.players[socket.id] = newPlayer;
                socket.emit('player', JSON.stringify(newPlayer));
                socket.emit('players:snapshot', JSON.stringify(this.serializePlayers(socket.id)));
                io.emit('enter_game', JSON.stringify(newPlayer));
                io.emit('player', JSON.stringify(newPlayer));
            });

            socket.on('player', (player) => {
                var existingPlayer = this.game.players[socket.id];
                if (!existingPlayer) {
                    return;
                }

                var parsedPlayer = this.safeParse(player);
                var validation = this.validator.validatePlayerUpdate(existingPlayer, parsedPlayer, { now: Date.now() });
                if (!validation) {
                    return;
                }

                if (existingPlayer.sequence !== undefined &&
                    validation.sanitized &&
                    validation.sanitized.sequence !== undefined &&
                    validation.sanitized.sequence <= existingPlayer.sequence) {
                    debug("Ignoring out-of-order update from " + socket.id + " sequence " + validation.sanitized.sequence);
                    return;
                }

                if (!validation.valid) {
                    debug("Rejected player update for " + socket.id + " reasons: " + validation.reasons.join(","));
                    socket.emit('player:rejected', JSON.stringify({
                        reasons: validation.reasons,
                        flags: validation.flags,
                        player: existingPlayer
                    }));
                    socket.emit('player', JSON.stringify(existingPlayer));
                    return;
                }

                existingPlayer.update(validation.sanitized, validation.timestamp);
                io.emit('player', JSON.stringify(existingPlayer));
            });

            socket.on('disconnect', () => {
                var removedPlayer = this.game.players[socket.id];
                if (!removedPlayer) {
                    return;
                }
                delete this.game.players[socket.id];
                io.emit('player:removed', JSON.stringify({id: removedPlayer.id}));
            });
        });
    }

    safeParse(payload) {
        if (!payload) {
            return {};
        }
        if (typeof payload !== 'string') {
            return payload;
        }
        try {
            return JSON.parse(payload);
        } catch (error) {
            debug("Failed to parse incoming player payload: " + error.message);
            return {};
        }
    }

    serializePlayers(excludeId) {
        var players = [];
        Object.keys(this.game.players).forEach((id) => {
            if (excludeId && id === excludeId) {
                return;
            }
            var player = this.game.players[id];
            if (player) {
                players.push(player);
            }
        });
        return players;
    }
}


module.exports = PlayerFactory;
