export const RESOLUTION_X = 1024;
export const RESOLUTION_Y = 768;


export const MOVEMENT_SPEED_PLAYER = 0.50;
export const MOVEMENT_SPEED_BULLET = 0.80;

export const COLLISION_BLOCKING = 2;
export const COLLISION_MAP_EDGE_LEFT = 200;
export const COLLISION_MAP_EDGE_RIGHT = 201;
export const COLLISION_MAP_EDGE_TOP = 202;
export const COLLISION_MAP_EDGE_BOTTOM = 203;


export const BULLET_ALIVE = 1;
export const BULLET_DEAD = -1;
export const TIMER_SHOOT_LASER = 650;

export const DAMAGE_LASER = 5;

export const MAX_HEALTH = 40;

export const MAP_SQUARE_LAVA = 1;
export const MAP_SQUARE_ROCK = 2;
export const MAP_SQUARE_BUILDING = 3;

export const BUILDING_COMMAND_CENTER = 0;
export const BUILDING_FACTORY = 1;
export const BUILDING_REPAIR = 2;
export const BUILDING_HOUSE = 3;
export const BUILDING_RESEARCH = 4;

export const BUILDING_HAS_BAY = 2;

export const CANT_BUILD = 0;
export const CAN_BUILD = 1;
export const HAS_BUILT = 2;

export const CAN_BUILD_HOUSE = 300;
export const CAN_BUILD_LASER_RESEARCH = 412;
export const CAN_BUILD_TURRET_RESEARCH = 409;
export const CAN_BUILD_LASER_FACTORY = 112;
export const CAN_BUILD_TURRET_FACTORY = 109;

export const ITEM_TYPE_CLOAK = 0;
export const ITEM_TYPE_ROCKET = 1;
export const ITEM_TYPE_MEDKIT = 2;
export const ITEM_TYPE_BOMB = 3;
export const ITEM_TYPE_MINE = 4;
export const ITEM_TYPE_ORB = 5;
export const ITEM_TYPE_FLARE = 6;
export const ITEM_TYPE_DFG = 7;
export const ITEM_TYPE_WALL = 8;
export const ITEM_TYPE_TURRET = 9;
export const ITEM_TYPE_SLEEPER = 10;
export const ITEM_TYPE_PLASMA = 11;

export const DEPENDENCY_TREE = [
    {'id': CAN_BUILD_HOUSE, 'parentid': 0},
    {'id': CAN_BUILD_LASER_RESEARCH, 'parentid': CAN_BUILD_HOUSE},
    {'id': CAN_BUILD_TURRET_RESEARCH, 'parentid': CAN_BUILD_HOUSE},
    {'id': CAN_BUILD_LASER_FACTORY, 'parentid': CAN_BUILD_LASER_RESEARCH},
    {'id': CAN_BUILD_TURRET_FACTORY, 'parentid': CAN_BUILD_TURRET_RESEARCH},
];


export const LABELS = {
    CAN_BUILD_HOUSE: {
        ICON: 0,
        IMAGE: BUILDING_HOUSE,
        TYPE: CAN_BUILD_HOUSE,
        LABEL: "Housing",
    },
    CAN_BUILD_LASER_RESEARCH: {
        ICON: 1,
        TYPE: CAN_BUILD_LASER_RESEARCH,
        IMAGE: BUILDING_RESEARCH,
        LABEL: "Laser Research",
    },
    CAN_BUILD_TURRET_RESEARCH: {
        ICON: 2,
        TYPE: CAN_BUILD_TURRET_RESEARCH,
        IMAGE: BUILDING_RESEARCH,
        LABEL: "Turret Research",
    },
    CAN_BUILD_LASER_FACTORY: {
        ICON: 1,
        TYPE: CAN_BUILD_LASER_FACTORY,
        IMAGE: BUILDING_FACTORY,
        LABEL: "Laser Factory",
    },
    CAN_BUILD_TURRET_FACTORY: {
        ICON: 2,
        TYPE: CAN_BUILD_TURRET_FACTORY,
        IMAGE: BUILDING_FACTORY,
        LABEL: "Turret Factory",
    }

};
