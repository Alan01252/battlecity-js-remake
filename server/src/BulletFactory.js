/*jslint node: true */
"use strict";

var Bullet = require("./Bullet");

var debug = require('debug')('BattleCity:BulletFactory');

class BulletFactory {

    constructor(game) {
        this.game = game;
    }

    listen(io) {

        debug("Starting Server");

        io.on("connection", (socket) => {

            socket.on('bullet_shot', (bullet) => {

                if (this.game.players[socket.id]) {
                    /**
                     * TODO : Share the bullet library with client/server so bullet x/y is in sync on server and client
                     */
                    socket.broadcast.emit('bullet_shot', bullet);
                }

            })

        });
    }
}

module.exports = BulletFactory;
