class BulletFactory {

    constructor(game) {
        this.game = game
        this.buildingListHead = null;
    }

    cycle() {
    }

    newBuilding(owner, x, y, type) {

        var building = {
            "owner": owner,
            "x": x,
            "y": y,
            "type": type,
            "next": null,
            "previous": null

        };


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