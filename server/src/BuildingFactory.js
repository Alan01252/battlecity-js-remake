/*jslint node: true */
"use strict";

var Building = require("./Building");
var FactoryBuilding = require("./FactoryBuilding");

var debug = require('debug')('BattleCity:BuildingFactory');

class BuildingFactory {

    constructor(game) {
        this.game = game;
        this.buildings = [];
    }

    cycle() {
        console.log("In building cycle");
        this.buildings.forEach((building) => {
            building.cycle();
        });
    }

    listen(io) {

        io.on("connection", (socket) => {
            socket.on('new_building', (building) => {

                debug("Got new building");
                debug(building);
                var building = JSON.parse(building);

                var newBuilding = new Building(null, building, socket);
                debug(newBuilding);

                if (parseInt(newBuilding.type / 100) === 1) {
                    var factoryBuilding = new FactoryBuilding(this.game, newBuilding, socket);
                    newBuilding.injectType(factoryBuilding);
                }

                this.buildings.push(newBuilding);

                socket.broadcast.emit('new_building', building);
            })
        });
    }
}

module.exports = BuildingFactory;
