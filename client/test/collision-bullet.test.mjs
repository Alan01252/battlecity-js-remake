import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {collidedWithBuilding, collidedWithRock} from '../src/collision/collision-bullet.js';
import {
    BUILDING_COMMAND_CENTER,
    BUILDING_FACTORY,
    BUILDING_REPAIR,
    CAN_BUILD_HOSPITAL,
    MAP_SQUARE_BUILDING,
    MAP_SQUARE_ROCK,
} from '../src/constants.js';

const TILE_SIZE = 48;

const createGame = ({map = [], buildingFactory} = {}) => ({
    map,
    otherPlayers: {},
    buildingFactory: buildingFactory ?? {getHead: () => null},
});

const createBuildingNode = (x, y, type) => ({
    x,
    y,
    type,
    next: null,
    previous: null,
});

describe('collidedWithRock', () => {
    it('detects collisions with blocking terrain tiles', () => {
        const map = [[MAP_SQUARE_ROCK]];
        const game = createGame({map});
        const bullet = {x: 10, y: 10};

        assert.equal(collidedWithRock(game, bullet), true);
    });

    it('treats building tiles as blocking terrain', () => {
        const map = [[MAP_SQUARE_BUILDING]];
        const game = createGame({map});
        const bullet = {x: 16, y: 16};

        assert.equal(collidedWithRock(game, bullet), true);
    });

    it('ignores empty tiles', () => {
        const map = [[0, MAP_SQUARE_BUILDING], [0, 0]];
        const game = createGame({map});
        const bullet = {x: TILE_SIZE + 4, y: TILE_SIZE + 4};

        assert.equal(collidedWithRock(game, bullet), false);
    });
});

describe('collidedWithBuilding', () => {
    const createFactory = (building) => ({
        getHead: () => building,
    });

    const baseX = 5 * TILE_SIZE;
    const baseY = 7 * TILE_SIZE;

    const walkwayBullet = {x: baseX + 10, y: baseY + (TILE_SIZE + 12)};
    const upperBullet = {x: baseX + 10, y: baseY + 12};

    it('allows shots through command center bays while blocking upper structure', () => {
        const building = createBuildingNode(5, 7, BUILDING_COMMAND_CENTER);
        const game = createGame({buildingFactory: createFactory(building)});

        assert.equal(collidedWithBuilding(game, walkwayBullet), false);
        assert.equal(collidedWithBuilding(game, upperBullet), true);
    });

    it('blocks all tiles for factories', () => {
        const building = createBuildingNode(5, 7, BUILDING_FACTORY);
        const game = createGame({buildingFactory: createFactory(building)});

        assert.equal(collidedWithBuilding(game, walkwayBullet), true);
        assert.equal(collidedWithBuilding(game, upperBullet), true);
    });

    it('allows shots through hospital bays while protecting the rest of the structure', () => {
        const building = createBuildingNode(5, 7, BUILDING_REPAIR);
        const game = createGame({buildingFactory: createFactory(building)});

        assert.equal(collidedWithBuilding(game, walkwayBullet), false);
        assert.equal(collidedWithBuilding(game, upperBullet), true);
    });

    it('treats build-tree hospital codes the same as hospital structures', () => {
        const building = createBuildingNode(5, 7, CAN_BUILD_HOSPITAL);
        const game = createGame({buildingFactory: createFactory(building)});

        assert.equal(collidedWithBuilding(game, walkwayBullet), false);
        assert.equal(collidedWithBuilding(game, upperBullet), true);
    });
});
