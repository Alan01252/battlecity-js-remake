import {rectangleCollision} from "./collision-helpers";
import {getPlayerRect} from "./collision-helpers";


import {MAP_SQUARE_ROCK} from "../constants";
import {BUILDING_HAS_BAY} from "../constants";


var collided = (testRect, bullet)=> {

    var bulletRect = {
        x: bullet.x,
        y: bullet.y,
        w: 4,
        h: 4
    };

    return rectangleCollision(testRect, bulletRect);
};

export const collidedWithRock = (game, bullet) => {

    var tileX = Math.floor((bullet.x + 40) / 48);
    var tileY = Math.floor((bullet.y + 40) / 48);


    if (tileX > 0 && tileY > 0 && tileX < 512 & tileY < 512) {
        return game.map[tileX][tileY] == MAP_SQUARE_ROCK;
    }
    return false;
};

export const collidedWithAnotherPlayer = (game, bullet) => {

    return Object.keys(game.otherPlayers).some((id) => {
        const player = game.otherPlayers[id];
        if (!player || !player.offset) {
            return false;
        }

        if (bullet.shooter && bullet.shooter === id) {
            return false;
        }

        const bulletTeam = bullet.team ?? null;
        const playerTeam = player.city ?? null;
        if (bulletTeam !== null && playerTeam === bulletTeam) {
            return false;
        }

        return collided(getPlayerRect(player), bullet)
    }) || collidedWithRogues(game, bullet);
};

function collidedWithRogues(game, bullet) {
    const manager = game.rogueTankManager;
    if (!manager || !Array.isArray(manager.tanks)) {
        return false;
    }

    const bulletTeam = bullet.team ?? null;

    for (let i = 0; i < manager.tanks.length; i += 1) {
        const tank = manager.tanks[i];
        if (!tank || !tank.offset) {
            continue;
        }

        if (bullet.shooter && bullet.shooter === tank.id) {
            continue;
        }

        const tankTeam = tank.city ?? null;
        if (bulletTeam !== null && tankTeam === bulletTeam) {
            continue;
        }

        if (collided(getPlayerRect(tank), bullet)) {
            manager.handleBulletCollision(bullet, tank);
            return true;
        }
    }

    return false;
}

export const collidedWithCurrentPlayer = (game, bullet) => {

    const bulletTeam = bullet.team ?? null;
    const playerTeam = game.player?.city ?? null;

    if (bulletTeam !== null && bulletTeam === playerTeam) {
        return false;
    }

    if (bullet.shooter && bullet.shooter === game.player.id) {
        return false;
    }

    return collided(getPlayerRect(game.player), bullet);
};

export const collidedWithItem = (game, bullet) => {
    var item = game.itemFactory.getHead();

    while (item) {

        var itemRect = {
            x: item.x,
            y: item.y,
            w: 48,
            h: 48,
        };

        if (bullet.sourceId && item.id && bullet.sourceId === item.id) {
            item = item.next;
            continue;
        }

        if (collided(itemRect, bullet)) {
            return item;
        }

        item = item.next;
    }
    return null;
};

export const collidedWithBuilding = (game, bullet) => {
    var building = game.buildingFactory.getHead();

    while (building) {

        var buildingRect = {
            x: (building.x) * 48,
            y: (building.y) * 48,
            w: 144,
            h: 96,
        };

        if (building.type < BUILDING_HAS_BAY) {
            buildingRect.h = buildingRect.h - 48;
        }
        if (collided(buildingRect, bullet)) {
            return true;
        }

        building = building.next;
    }
    return false;
};
