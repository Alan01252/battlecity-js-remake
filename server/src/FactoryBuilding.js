/*jslint node: true */
"use strict";


var debug = require('debug')('BattleCity:FactoryBuilding');

class FactoryBuilding {

    constructor(game, building, item) {

        this.game = game;
        this.building = building;
        this.productionTick = 0;
        this.item = item;
    }

    cycle(socket) {
        debug("In cycle");
        if (this.game.tick > this.productionTick) {
            this.productionTick = this.game.tick + 7000;

            var icon = {
                "x": (this.building.x * 48) + 56,
                "y": (this.building.y * 48) + 102,
                "type": this.building.type % 100

            };

            debug("Telling everyone I've produced an icon");
            debug(icon);
            socket.emit("new_icon", JSON.stringify(icon));
        }
    }
}

module.exports = FactoryBuilding;
