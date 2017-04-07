import {checkBuildingCollision} from "../collision/collision-building";
import {LABELS} from "../constants";
import {CAN_BUILD_HOUSE} from "../constants";
import {HAS_BUILT} from "../constants";
import {MAP_SQUARE_BUILDING} from "../constants";
import {CAN_BUILD} from "../constants";
import {DEPENDENCY_TREE} from "../constants";
import {DEPENDENCY_TREE} from "../constants";
import _ from '../../node_modules/underscore/underscore-min'
import {BUILDING_COMMAND_CENTER} from "../constants";

var unflatten = function (array, parent, tree) {

    tree = typeof tree !== 'undefined' ? tree : [];
    parent = typeof parent !== 'undefined' ? parent : {id: 0};

    var children = _.filter(array, function (child) {
        return child.parentid == parent.id;
    });

    if (!_.isEmpty(children)) {
        if (parent.id == 0) {
            tree = children;
        } else {
            parent['children'] = children;
        }
        _.each(children, function (child) {
            unflatten(array, child)
        });
    }

    return tree;
};


var dependencyTree = unflatten(DEPENDENCY_TREE);

class BuildingFactory {

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

        this.adjustAllowedBuilds(building)
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

    searchTree(element, matchingId) {
        if (element.id == matchingId) {
            return element;
        } else if (element.children != null) {
            var i;
            var result = null;
            for (i = 0; result == null && i < element.children.length; i++) {
                result = this.searchTree(element.children[i], matchingId);
            }
            return result;
        }
        return null;
    }

    adjustAllowedBuilds(building) {

        if (building.type == BUILDING_COMMAND_CENTER) {
            return;
        }

        this.game.map[building.x][building.y] = MAP_SQUARE_BUILDING;
        this.game.tiles[building.x][building.y] = this.game.isBuilding;


        Object.keys(this.game.cities[this.game.player.city].canBuild).forEach((id) => {

            var tempId = LABELS[id].TYPE;
            console.log(tempId + " " + this.game.isBuilding);
            if (parseInt(tempId) == this.game.isBuilding) {

                if (tempId != CAN_BUILD_HOUSE) {
                    this.game.cities[this.game.player.city].canBuild[id] = HAS_BUILT;
                }

                var node = this.searchTree(dependencyTree[0], tempId);
                if (node && node.children) {
                    node.children.forEach((item) => {
                        Object.keys(this.game.cities[this.game.player.city].canBuild).forEach((id) => {


                            if (this.game.cities[this.game.player.city].canBuild[id] !== HAS_BUILT) {
                                var tempId = LABELS[id].TYPE;
                                console.log("finding children" + tempId + " " + item.id);
                                if (parseInt(tempId) == item.id) {
                                    this.game.cities[this.game.player.city].canBuild[id] = CAN_BUILD;
                                }
                            }
                        });
                    })
                }
            }
        });
    }


    getHead() {
        return this.buildingListHead;
    }
}


export default BuildingFactory;