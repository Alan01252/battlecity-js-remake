var Player = require("./Player");
var debug = require('debug')('BattleCity:PlayerFactory');

class PlayerFactory {

    constructor(io) {
        this.io = io;
        this.players = {};
    }

    listen(io) {

        debug("Starting Server");

        io.on("connection", (socket) => {


            socket.on('enter_game', (player) => {
                debug("Player entered game " + socket.id);
                debug(player);
                var newPlayer = new Player(socket.id, JSON.parse(player));
                debug(newPlayer);
                this.players[socket.id] = newPlayer;
                socket.broadcast.emit('enter_game', JSON.stringify(newPlayer));
            });

            socket.on('player', (player) => {

                debug(player);

                if (this.players[socket.id]) {
                    this.players[socket.id].update(JSON.parse(player));
                    var playerJson = JSON.stringify(this.players[socket.id]);
                    debug(playerJson);
                    socket.broadcast.emit('player', playerJson);
                }

            })
        });


    }

}


module.exports = PlayerFactory;