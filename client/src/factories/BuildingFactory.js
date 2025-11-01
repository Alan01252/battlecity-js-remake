import {checkBuildingCollision} from "../collision/collision-building";
import {LABELS} from "../constants";
import {CAN_BUILD_HOUSE} from "../constants";
import {HAS_BUILT} from "../constants";
import {CAN_BUILD} from "../constants";
import {DEPENDENCY_TREE} from "../constants";
import {COST_BUILDING} from "../constants";
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

const isFactoryType = (type) => type >= 100 && type < 200;

class BuildingFactory {

    constructor(game) {
        this.game = game
        this.buildingListHead = null;
        this.buildingsById = {};
        this.buildingsByCoord = {};
        this.pendingBuildCosts = new Map();
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
        const cityId = Number.isFinite(city) ? city : parseInt(city, 10) || 0;
        const isLocalPlacement = notifyServer && owner !== null && owner !== undefined && this.game?.player && owner === this.game.player.id;
        if (isLocalPlacement) {
            const cityState = this.game.cities?.[cityId];
            if (!cityState) {
                console.warn('Cannot place building without city state');
                return false;
            }
            const availableCash = Number.isFinite(cityState.cash) ? cityState.cash : parseInt(cityState.cash, 10) || 0;
            if (availableCash < COST_BUILDING) {
                console.warn('City lacks funds for new building');
                this.game.forceDraw = true;
                return false;
            }
        }

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

        if (notifyServer && this.game.socketListener && this.game.socketListener.sendNewBuilding) {
            this.game.socketListener.sendNewBuilding(building);
        }

        if (this.buildingListHead) {
            this.buildingListHead.previous = building;
            building.next = this.buildingListHead
        }

        const shouldUpdateCity = updateCity !== undefined ? updateCity : (!owner || owner === this.game.player.id);

        if (this.game.persistence && typeof this.game.persistence.getFactoryItems === 'function') {
            const storedItems = this.game.persistence.getFactoryItems(building.id);
            if (typeof storedItems === 'number') {
                building.itemsLeft = Math.max(building.itemsLeft || 0, storedItems);
            }
        }

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
        this.syncFactoryItems(building);
        this.persistFactoryItems(building);

        if (!this.game.tiles[x]) {
            this.game.tiles[x] = [];
        }
        this.game.tiles[x][y] = type;
        if (this.game.map && this.game.map[x]) {
            this.game.map[x][y] = MAP_SQUARE_BUILDING;
        }

        if (isLocalPlacement) {
            const cityState = this.game.cities?.[cityId];
            if (cityState) {
                const availableCash = Number.isFinite(cityState.cash) ? cityState.cash : parseInt(cityState.cash, 10) || 0;
                cityState.cash = Math.max(0, availableCash - COST_BUILDING);
                cityState.construction = (Number.isFinite(cityState.construction) ? cityState.construction : parseInt(cityState.construction, 10) || 0) + COST_BUILDING;
                cityState.updatedAt = Date.now();
                this.pendingBuildCosts.set(building.id, {
                    cityId,
                    cost: COST_BUILDING,
                });
                this.game.forceDraw = true;
            }
        }

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

        if (Array.isArray(this.game.explosions)) {
            const tileX = Number.isFinite(building.x) ? Number(building.x) : 0;
            const tileY = Number.isFinite(building.y) ? Number(building.y) : 0;
            this.game.explosions.push({
                x: tileX * 48,
                y: tileY * 48,
                frame: 0,
                nextFrameTick: (this.game.tick || Date.now()) + 75
            });
        }

        if (isFactoryType(building.type)) {
            const drop = this.getFactoryDropPosition(building);
            const itemType = building.type % 100;
            const excess = this.game.iconFactory.countUnownedIconsNear(drop.x, drop.y, itemType);
            if (excess > 0) {
                this.game.iconFactory.removeUnownedIconsNear(drop.x, drop.y, itemType, excess);
            }
            building.itemsLeft = 0;
            this.persistFactoryItems(building);
        }

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
        if (this.pendingBuildCosts.has(building.id)) {
            this.pendingBuildCosts.delete(building.id);
        }

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

    handleBuildDenied(data) {
        if (!data) {
            return;
        }
        const id = data.id || `${data.x}_${data.y}`;
        if (!id) {
            return;
        }
        const pending = this.pendingBuildCosts.get(id);
        if (pending) {
            const cityState = this.game.cities?.[pending.cityId];
            if (cityState) {
                const currentCash = Number.isFinite(cityState.cash) ? cityState.cash : parseInt(cityState.cash, 10) || 0;
                cityState.cash = currentCash + pending.cost;
                const currentConstruction = Number.isFinite(cityState.construction) ? cityState.construction : parseInt(cityState.construction, 10) || 0;
                cityState.construction = Math.max(0, currentConstruction - pending.cost);
                cityState.updatedAt = Date.now();
            }
            this.pendingBuildCosts.delete(id);
        }
        const building = this.getBuildingById(id);
        if (building && building.owner === this.game.player.id) {
            this.deleteBuilding(building, false);
        }
        this.game.forceDraw = true;
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

    findBuildingAtTile(tileX, tileY) {
        let node = this.getHead();
        const targetX = Number.isFinite(tileX) ? tileX : parseInt(tileX, 10);
        const targetY = Number.isFinite(tileY) ? tileY : parseInt(tileY, 10);
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
            return null;
        }
        while (node) {
            const baseX = Number.isFinite(node.x) ? node.x : parseInt(node.x, 10) || 0;
            const baseY = Number.isFinite(node.y) ? node.y : parseInt(node.y, 10) || 0;
            if (targetX >= baseX && targetX <= baseX + 2 &&
                targetY >= baseY && targetY <= baseY + 2) {
                return node;
            }
            node = node.next;
        }
        return null;
    }

    countBuildingsForCity(cityId) {
        const numericCity = Number.isFinite(cityId) ? cityId : parseInt(cityId, 10);
        if (!Number.isFinite(numericCity)) {
            return 0;
        }
        let count = 0;
        let node = this.getHead();
        while (node) {
            const nodeCity = Number.isFinite(node.city) ? node.city : parseInt(node.city, 10) || 0;
            if (nodeCity === numericCity) {
                count += 1;
            }
            node = node.next;
        }
        return count;
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

        this.syncFactoryItems(building);
        this.persistFactoryItems(building);

        if (update.id && this.pendingBuildCosts.has(update.id)) {
            this.pendingBuildCosts.delete(update.id);
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

    assignIconSource(icon) {
        if (!icon || typeof icon.type !== 'number') {
            return null;
        }
        if (icon.sourceBuildingId && this.buildingsById[icon.sourceBuildingId]) {
            return this.buildingsById[icon.sourceBuildingId];
        }
        const building = this.findFactoryForIcon(icon.type, icon.x, icon.y);
        if (building) {
            icon.sourceBuildingId = building.id;
        }
        return building;
    }

    findFactoryForIcon(itemType, x, y) {
        let candidate = null;
        let distance = Infinity;
        let building = this.getHead();
        while (building) {
            if (isFactoryType(building.type) && (building.type % 100) === itemType) {
                const drop = this.getFactoryDropPosition(building);
                const diffX = drop.x - x;
                const diffY = drop.y - y;
                const dist = Math.sqrt((diffX * diffX) + (diffY * diffY));
                if (dist < distance && dist <= 96) {
                    candidate = building;
                    distance = dist;
                }
            }
            building = building.next;
        }
        return candidate;
    }

    handleIconProduced(icon) {
        const building = this.assignIconSource(icon);
        if (!building) {
            return;
        }
        building.itemsLeft = (building.itemsLeft || 0) + 1;
        this.syncFactoryItems(building);
        this.persistFactoryItems(building);
    }

    handleIconCollected(icon) {
        const building = this.assignIconSource(icon);
        if (!building) {
            return;
        }
        if (typeof building.itemsLeft === 'number' && building.itemsLeft > 0) {
            building.itemsLeft -= 1;
        }
        this.syncFactoryItems(building);
        this.persistFactoryItems(building);
    }

    getFactoryDropPosition(building) {
        return {
            x: (building.x * 48) + 56,
            y: (building.y * 48) + 102,
        };
    }

    syncFactoryItems(building) {
        if (!building || !isFactoryType(building.type)) {
            return;
        }
        if (!this.game.iconFactory ||
            typeof this.game.iconFactory.countUnownedIconsNear !== 'function' ||
            typeof this.game.iconFactory.removeUnownedIconsNear !== 'function') {
            return;
        }
        const expected = building.itemsLeft || 0;
        const itemType = building.type % 100;
        const drop = this.getFactoryDropPosition(building);
        const existing = this.game.iconFactory.countUnownedIconsNear(drop.x, drop.y, itemType);
        if (existing > expected) {
            this.game.iconFactory.removeUnownedIconsNear(drop.x, drop.y, itemType, existing - expected);
        } else if (existing < expected) {
            const missing = expected - existing;
            for (let i = 0; i < missing; i++) {
                this.game.iconFactory.newIcon(null, drop.x, drop.y, itemType, {
                    sourceBuildingId: building.id,
                    skipProductionUpdate: true,
                });
            }
        }
    }

    persistFactoryItems(building) {
        if (!building || !isFactoryType(building.type)) {
            return;
        }
        if (!this.game.persistence || typeof this.game.persistence.saveFactoryItems !== 'function') {
            return;
        }
        const value = building.itemsLeft || 0;
        this.game.persistence.saveFactoryItems(building.id, value);
    }
}


export default BuildingFactory;
