import {COLLISION_BLOCKING} from "../constants";
import {getPlayerRect} from "./collision-helpers";
import {rectangleCollision} from "./collision-helpers";
import {BUILDING_COMMAND_CENTER} from "../constants";
import {BUILDING_FACTORY} from "../constants";
import {checkTiles} from "./collision-helpers";
import {checkEdges} from "./collision-helpers";
import {checkItems} from "./collision-helpers";
import {isHospitalBuilding} from "../utils/buildings";


var checkBuildings = (game, playerRect) => {
    var building = game.buildingFactory.getHead();

    while (building) {

        var buildingRect = {
            x: (building.x) * 48,
            y: (building.y) * 48,
            w: 144,
            h: 144,
        };

        const typeValue = Number(building.type);
        const baseType = Number.isFinite(typeValue) ? Math.floor(typeValue / 100) : NaN;
        const isCommandCenter = typeValue === BUILDING_COMMAND_CENTER;
        const isFactory = baseType === BUILDING_FACTORY;
        if (isCommandCenter || isFactory || isHospitalBuilding(typeValue)) {
            buildingRect.h = Math.max(0, buildingRect.h - 48);
        }

        if (rectangleCollision(playerRect, buildingRect)) {
            return COLLISION_BLOCKING;
        }

        building = building.next;
    }

    return false;
};


export const checkPlayerCollision = (game) => {

    var playerRect = getPlayerRect(game.player);
    game.player.collidedItem = null;
    var collision = checkEdges(playerRect);
    if (!collision) {
        collision = checkTiles(game, playerRect);
    }
    if (!collision) {
        collision = checkBuildings(game, playerRect);
    }

    if (!collision) {
        collision = checkItems(game, playerRect);
    }


    return collision;
};
