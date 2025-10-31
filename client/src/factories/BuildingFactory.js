import {checkBuildingCollision} from "../collision/collision-building";
import {LABELS} from "../constants";
import {CAN_BUILD_HOUSE} from "../constants";
import {HAS_BUILT} from "../constants";
import {CAN_BUILD} from "../constants";
import {DEPENDENCY_TREE} from "../constants";
import _ from 'underscore';
import {BUILDING_COMMAND_CENTER} from "../constants";
import {MAP_SQUARE_BUILDING} from "../constants";

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

const TYPE_LABEL_LOOKUP = Object.keys(LABELS).reduce((acc, key) => {
    acc[LABELS[key].TYPE] = key;
    return acc;
}, {});

class BuildingFactory {

    constructor(game) {
        this.game = game
        this.buildingListHead = null;
        this.buildingsById = {};
        this.buildingsByCoord = {};
    }

    cycle() {
    }

    newBuilding(owner, x, y, type, options = {}) {

        const {
            notifyServer = true,
            id = `${x}_${y}`,
            population = 0,
            attachedHouseId = null,
            updateCity,
            itemsLeft = 0,
            city = this.game.player?.city ?? 0,
        } = options;

        const coordKey = `${x}_${y}`;

        var building = {
            "id": id,
            "owner": owner,
            "x": x,
            "y": y,
            "items": 1,
            "type": type,
            "population": population,
            "attachedHouseId": attachedHouseId,
            "next": null,
            "previous": null,
            "coordKey": coordKey,
            "city": city,
            "itemsLeft": itemsLeft

        };

        if (checkBuildingCollision(this.game, building)) {
            console.log("Collision");
            return false;
        }

        if (!this.game.tiles[x]) {
            this.game.tiles[x] = [];
        }
        this.game.tiles[x][y] = type;
        if (this.game.map && this.game.map[x]) {
            this.game.map[x][y] = MAP_SQUARE_BUILDING;
        }


        if (notifyServer && this.game.socketListener && this.game.socketListener.sendNewBuilding) {
            this.game.socketListener.sendNewBuilding(building);
        }

        if (this.buildingListHead) {
            this.buildingListHead.previous = building;
            building.next = this.buildingListHead
        }

        const shouldUpdateCity = updateCity !== undefined ? updateCity : (!owner || owner === this.game.player.id);

        if (shouldUpdateCity) {
            this.adjustAllowedBuilds(building)
        } else {
            this.applyResearchProgress(building.city, building.type);
        }
        console.log("Created building");
        console.log(building);

        this.buildingListHead = building;
        this.buildingsById[building.id] = building;
        this.buildingsByCoord[coordKey] = building;
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
                    x <= buildingNode.x + 2 &&
                    y >= buildingNode.y &&
                    y <= buildingNode.y + 2
                ) {
                    this.game.forceDraw = true;
                    this.deleteBuilding(buildingNode)
                }
            }
            buildingNode = buildingNode.next;
        }
    }

    deleteBuilding(building, notifyServer = true) {


        this.game.map[building.x][building.y] = 0;
        this.game.tiles[building.x][building.y] = 0;


        if (building.owner === null || building.owner === this.game.player.id) {

            Object.keys(this.game.cities[this.game.player.city].canBuild).forEach((id) => {

                var tempId = LABELS[id].TYPE;
                console.log(tempId + " " + this.game.isBuilding);
                if (parseInt(tempId) == building.type) {

                    if (tempId != CAN_BUILD_HOUSE) {
                        this.game.cities[this.game.player.city].canBuild[id] = CAN_BUILD;
                    }
                }
            });
        }


        if (notifyServer && this.game.socketListener && this.game.socketListener.sendDemolishBuilding) {
            this.game.socketListener.sendDemolishBuilding(building.id);
        }

        var returnBuilding = building.next;

        if (building.next) {
            building.next.previous = building.previous;
        }

        if (building.previous) {
            building.previous.next = building.next
        } else {
            this.buildingListHead = building.next;
        }

        delete this.buildingsById[building.id];
        const coordKey = building.coordKey || `${building.x}_${building.y}`;
        delete this.buildingsByCoord[coordKey];

        return returnBuilding;
    }

    removeBuildingById(id) {
        let node = this.getHead();
        while (node) {
            if (node.id === id) {
                this.deleteBuilding(node, false);
                break;
            }
            node = node.next;
        }
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

        const cityId = building.city ?? this.game.player.city;
        const buildingType = this.game.isBuilding || building.type;
        this.applyResearchProgress(cityId, buildingType);
    }


    getHead() {
        return this.buildingListHead;
    }

    getBuildingById(id) {
        return this.buildingsById[id];
    }

    getBuildingByCoord(x, y) {
        return this.buildingsByCoord[`${x}_${y}`];
    }

    applyPopulationUpdate(update) {
        if (!update || !update.id) {
            return;
        }

        if (update.removed) {
            this.removeBuildingById(update.id);
            this.game.forceDraw = true;
            return;
        }

        let building = this.getBuildingById(update.id);
        if (!building && update.x !== undefined && update.y !== undefined && update.type !== undefined) {
            building = this.newBuilding(update.ownerId || null, update.x, update.y, update.type, {
                notifyServer: false,
                id: update.id,
                population: update.population || 0,
                attachedHouseId: update.attachedHouseId || null,
                updateCity: false,
                itemsLeft: update.itemsLeft || 0,
                city: update.city ?? 0,
            });
            if (building) {
                this.applyResearchProgress(building.city ?? 0, building.type);
            }
        }
        if (!building) {
            return;
        }

        building.coordKey = building.coordKey || `${building.x}_${building.y}`;

        if (typeof update.population === 'number') {
            building.population = update.population;
        }

        if (update.attachedHouseId !== undefined) {
            building.attachedHouseId = update.attachedHouseId;
        }

        if (update.city !== undefined) {
            building.city = update.city;
        }

        if (update.smokeActive !== undefined) {
            building.smokeActive = update.smokeActive;
        }

        if (update.smokeFrame !== undefined) {
            building.smokeFrame = update.smokeFrame;
        }

        if (update.itemsLeft !== undefined) {
            building.itemsLeft = update.itemsLeft;
        }

        this.game.forceDraw = true;
    }

    applyResearchProgress(cityId, buildingType) {
        if (buildingType == null || cityId == null || cityId === undefined) {
            return;
        }
        const cityIndex = parseInt(cityId, 10);
        const city = this.game.cities?.[cityIndex];
        if (!city || !city.canBuild) {
            return;
        }
        const typeKey = Number(buildingType);
        const labelKey = TYPE_LABEL_LOOKUP[typeKey];
        if (!labelKey || city.canBuild[labelKey] === undefined) {
            return;
        }

        if (typeKey !== CAN_BUILD_HOUSE) {
            city.canBuild[labelKey] = HAS_BUILT;
        }

        const node = this.searchTree(dependencyTree[0], typeKey);
        if (node && node.children) {
            node.children.forEach((child) => {
                const unlockKey = TYPE_LABEL_LOOKUP[child.id];
                if (unlockKey && city.canBuild[unlockKey] !== HAS_BUILT) {
                    city.canBuild[unlockKey] = CAN_BUILD;
                }
            });
        }

        if (this.game.persistence && typeof this.game.persistence.saveCityState === 'function') {
            this.game.persistence.saveCityState(cityIndex);
        }
    }
}


export default BuildingFactory;
