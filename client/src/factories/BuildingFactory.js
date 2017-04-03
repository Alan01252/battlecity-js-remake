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


    deleteBuilding(building) {
        var returnBuilding = building.next;

        if (building.next) {
            building.next.previous = building.previous;
        }

        if (building.previous) {
            building.previous.next = building.next
        } else {
            this.bulletListHead = building.next;
        }

        return returnBuilding;
    }


    getHead() {
        return this.buildingListHead;
    }
}


export default BulletFactory;