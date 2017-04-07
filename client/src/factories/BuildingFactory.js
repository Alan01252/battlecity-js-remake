import {checkBuildingCollision} from "../collision/collision-building";
class BulletFactory {

    constructor(game) {
        this.game = game
        this.buildingListHead = null;
    }

    cycle() {
    }

    newBuilding(owner, x, y, type) {

        var building = {
            "id": x + "_" + y,
            "owner": owner,
            "x": x,
            "y": y,
            "items": 1,
            "type": type,
            "next": null,
            "previous": null

        };

        if (checkBuildingCollision(this.game, building)) {
            console.log("Collision");
            return false;
        }


        this.game.socketListener.sendNewBuilding(building, (result) => {
            if (!result) {
                // Remove the building?
            }
        })

        if (this.buildingListHead) {
            this.buildingListHead.previous = building;
            building.next = this.buildingListHead
        }

        console.log("Created building");
        console.log(building);

        this.buildingListHead = building;
        return building;
    }

    outputBuildings() {
        console.log("here");
        var buildingNode = this.getHead();

        while (buildingNode) {

            if (buildingNode.type !== 0) {
                console.log(buildingNode.type + "," + buildingNode.x + "," + buildingNode.y);
            }

            buildingNode = buildingNode.next;
        }

        return false;
    }

    demolishBuilding(x, y) {

        console.log("Trying to demolish building at " + x + " " + y);

        var buildingNode = this.getHead();

        while (buildingNode) {

            if (buildingNode.type !== 0) {

                console.log(buildingNode.x + " " + buildingNode.y);

                if (x >= buildingNode.x &&
                    x <= buildingNode.x + 3 &&
                    y >= buildingNode.y &&
                    y <= buildingNode.y + 3
                ) {
                    this.game.forceDraw = true;
                    this.deleteBuilding(buildingNode)
                }
            }
            buildingNode = buildingNode.next;
        }
    }

    deleteBuilding(building) {


        this.game.map[building.x][building.y] = 0;
        this.game.tiles[building.x][building.y] = 0;

        var returnBuilding = building.next;

        if (building.next) {
            building.next.previous = building.previous;
        }

        if (building.previous) {
            building.previous.next = building.next
        } else {
            this.buildingListHead = building.next;
        }

        return returnBuilding;
    }


    getHead() {
        return this.buildingListHead;
    }
}


export default BulletFactory;