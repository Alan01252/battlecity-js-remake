/*jslint node: true */
"use strict";

class Building {

    constructor(id, building, socket) {
        this.owner = id;
        this.socket = socket;
        this.update(building);
    }

    injectType (type) {
        this.subType = type;
    }

    update(building) {
        console.log(building);
        this.x = building.x;
        this.y = building.y;
        this.type = building.type;
    }

    cycle() {
        if (this.subType) {
            this.subType.cycle(this.socket);
        }
    }
}

module.exports = Building;
