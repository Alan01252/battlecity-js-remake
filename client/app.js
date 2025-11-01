import PIXI from './src/pixi';
import Stats from 'stats.js';

import * as mapBuilder from "./src/mapBuilder";
import * as cityBuilder from "./src/cityBuilder";

import {play} from './src/play';
import {RESOLUTION_X} from "./src/constants";
import {RESOLUTION_Y} from "./src/constants";
import {MAX_HEALTH} from "./src/constants";

import {setupKeyboardInputs} from './src/input/input-keyboard';
import {setupMouseInputs} from './src/input/input-mouse';

import {drawGround} from "./src/draw/draw-ground";
import {drawTiles} from "./src/draw/draw-tiles";
import {drawChanging} from "./src/draw/draw-changing"

import BuildingFactory from "./src/factories/BuildingFactory";
import BulletFactory from "./src/factories/BulletFactory"
import IconFactory from "./src/factories/IconFactory";
import ItemFactory from "./src/factories/ItemFactory";
import RogueTankManager from "./src/rogue/RogueTankManager";

import SocketListener from "./src/SocketListener"
import {setupBuildingMenu} from "./src/draw/draw-building-interface";
import {drawBuilding} from "./src/draw/draw-building-interface";
import {drawItems} from "./src/draw/draw-items";
import {drawIcons} from "./src/draw/draw-icons";
import {drawPanelInterface} from "./src/draw/draw-panel-interface";
import {getCitySpawn, getCityDisplayName} from "./src/utils/citySpawns";
import LobbyManager from "./src/lobby/LobbyManager";

const assetUrl = (relativePath) => `${import.meta.env.BASE_URL}${relativePath}`;
const LoaderResource = PIXI.LoaderResource || (PIXI.loaders && PIXI.loaders.Resource);
const LOAD_TYPE = LoaderResource ? LoaderResource.LOAD_TYPE : {};
const XHR_RESPONSE_TYPE = LoaderResource ? LoaderResource.XHR_RESPONSE_TYPE : {};
const COLOR_KEY_MAGENTA = { r: 255, g: 0, b: 255 };
const TILE_SIZE_PX = 48;
const DEFAULT_PANEL_MESSAGE = {
    heading: 'Intel',
    lines: ['Right-click a city building to inspect.']
};

const applyColorKey = (resource, color = COLOR_KEY_MAGENTA) => {
    if (!resource || !resource.data || !resource.texture) {
        return;
    }

    const source = resource.data;
    const width = source.width;
    const height = source.height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
        return;
    }

    context.drawImage(source, 0, 0);
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        if (data[i] === color.r && data[i + 1] === color.g && data[i + 2] === color.b) {
            data[i + 3] = 0;
        }
    }

    context.putImageData(imageData, 0, 0);

    if (resource.texture) {
        resource.texture.destroy(true);
    }

    const baseTexture = PIXI.BaseTexture.from(canvas);
    baseTexture.alphaMode = PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA;
    baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;

    resource.data = canvas;
    resource.texture = new PIXI.Texture(baseTexture);
    resource.baseTexture = baseTexture;
};

const toFiniteNumber = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const normaliseCityId = (value, fallback = null) => {
    const numeric = toFiniteNumber(value, fallback);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(0, Math.floor(numeric));
};

const shortenId = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }
    if (value.length <= 8) {
        return value;
    }
    return `${value.slice(0, 4)}...${value.slice(-2)}`;
};


var type = "WebGL";

if (!PIXI.utils.isWebGLSupported()) {
    type = "canvas"
}


var app = new PIXI.Application({
    width:RESOLUTION_X, 
    height:RESOLUTION_Y
});

app.renderer.plugins.interaction.cursorStyles = {
    demolish: `url(${assetUrl('imgDemolish.png')}), auto`,
    cursor: `url(${assetUrl('imgCursor.png')}), auto`,
};

document.getElementById("game").appendChild(app.view);

var stats = new Stats();
stats.showPanel(0);
document.getElementById("game").appendChild(stats.dom);

var objectContainer = new PIXI.Container();
var panelContainer = new PIXI.Container();
var groundTiles = null;
var backgroundTiles = null;
var iconTiles = null;
var itemTiles = null;
const loader = PIXI.Loader.shared;

const game = {
    map: [],
    tiles: [],
    tick: 0,
    lastTick: 0,
    timePassed: 0,
    staticTick: 0,
    textures: [],
    maxMapX: RESOLUTION_X - 200,
    maxMapY: RESOLUTION_Y,
    maxCities: 0,
    otherPlayers: {},
    showBuildMenu: false,
    buildMenuOffset: {
        x: ((RESOLUTION_X - 200) / 2),
        y: (RESOLUTION_Y / 2)
    },
    buildings: {},
    cities: [],
    player: {
        id: -1,
        city: 0,
        isMayor: false,
        health: MAX_HEALTH,
        isTurning: 0,
        timeTurn: 0,
        direction: 0,
        defaultOffset: {
            x: ((RESOLUTION_X - 200) / 2),
            y: (RESOLUTION_Y / 2)
        },
        offset: {
            x: 0,
            y: 0,
            vx: 0,
        vy: 0
        },
        bombsArmed: false,
        lastSafeOffset: {
            x: 0,
            y: 0,
        },
        sequence: 0,
        isCloaked: false,
        cloakExpiresAt: 0,
        isFrozen: false,
        frozenUntil: 0,
        frozenBy: null
    },
    explosions: [],
    panelState: {
        heading: DEFAULT_PANEL_MESSAGE.heading,
        lines: [...DEFAULT_PANEL_MESSAGE.lines],
    },
    defenseItems: new Map(),
    lobby: null,
    app: app,
    stage: app.stage,
    objectContainer: objectContainer,
    orbHintElement: null,
    lastOrbHintMessage: '',
    nextOrbHintUpdate: 0,
};

const orbHintElement = document.createElement('div');
orbHintElement.id = 'orb-hint';
const orbHintStyle = orbHintElement.style;
orbHintStyle.position = 'fixed';
orbHintStyle.top = '24px';
orbHintStyle.right = '24px';
orbHintStyle.padding = '10px 14px';
orbHintStyle.borderRadius = '12px';
orbHintStyle.background = 'rgba(10, 18, 52, 0.82)';
orbHintStyle.border = '1px solid rgba(123, 152, 255, 0.35)';
orbHintStyle.boxShadow = '0 18px 36px rgba(0, 0, 0, 0.45)';
orbHintStyle.fontFamily = '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
orbHintStyle.fontSize = '14px';
orbHintStyle.color = '#f0f6ff';
orbHintStyle.letterSpacing = '0.3px';
orbHintStyle.maxWidth = '320px';
orbHintStyle.zIndex = '1000';
orbHintStyle.pointerEvents = 'none';
orbHintStyle.display = 'none';
document.body.appendChild(orbHintElement);
game.orbHintElement = orbHintElement;
game.lastOrbHintMessage = '';

const describeDirection = (dx, dy, threshold = TILE_SIZE_PX) => {
    let horizontal = '';
    let vertical = '';
    if (Math.abs(dx) > threshold) {
        horizontal = dx > 0 ? 'east' : 'west';
    }
    if (Math.abs(dy) > threshold) {
        vertical = dy > 0 ? 'south' : 'north';
    }
    if (horizontal && vertical) {
        return `${vertical}-${horizontal}`;
    }
    if (vertical) {
        return vertical;
    }
    if (horizontal) {
        return horizontal;
    }
    return 'nearby';
};

const formatDirectionLabel = (label) => {
    if (!label || typeof label !== 'string') {
        return '';
    }
    return label.split('-').map((part) => {
        if (!part) {
            return part;
        }
        return part.charAt(0).toUpperCase() + part.slice(1);
    }).join('-');
};

const getCityCenter = (city) => {
    if (!city) {
        return null;
    }
    const baseX = Number.isFinite(city.x)
        ? city.x
        : TILE_SIZE_PX * toFiniteNumber(city.tileX, 0);
    const baseY = Number.isFinite(city.y)
        ? city.y
        : TILE_SIZE_PX * toFiniteNumber(city.tileY, 0);
    return {
        x: baseX + (1.5 * TILE_SIZE_PX),
        y: baseY + (1 * TILE_SIZE_PX),
    };
};

const resolveCityName = (city, index) => {
    if (city && typeof city.name === 'string' && city.name.trim().length) {
        return city.name;
    }
    return getCityDisplayName(index);
};

game.updateOrbHint = (options = {}) => {
    const { force = false } = options;
    const element = game.orbHintElement;
    if (!element) {
        return;
    }

    const lobby = game.lobby;
    const inGame = lobby && typeof lobby.isInGame === 'function' ? lobby.isInGame() : false;
    if (!inGame) {
        if (element.style.display !== 'none') {
            element.style.display = 'none';
            game.lastOrbHintMessage = '';
        }
        return;
    }

    const player = game.player;
    const offset = player?.offset;
    const px = toFiniteNumber(offset?.x, NaN);
    const py = toFiniteNumber(offset?.y, NaN);
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
        if (element.style.display !== 'none') {
            element.style.display = 'none';
            game.lastOrbHintMessage = '';
        }
        return;
    }

    const playerCity = normaliseCityId(player?.city, null);
    let bestMatch = null;
    const cities = Array.isArray(game.cities) ? game.cities : [];
    cities.forEach((city, index) => {
        if (!city || index === playerCity || !city.isOrbable) {
            return;
        }
        const center = getCityCenter(city);
        if (!center) {
            return;
        }
        const dx = center.x - px;
        const dy = center.y - py;
        const distanceSq = (dx * dx) + (dy * dy);
        if (!Number.isFinite(distanceSq)) {
            return;
        }
        if (!bestMatch || distanceSq < bestMatch.distanceSq) {
            bestMatch = { city, index, dx, dy, distanceSq };
        }
    });

    let message;
    if (!bestMatch) {
        message = 'No orbable cities detected yet.';
    } else {
        const cityName = resolveCityName(bestMatch.city, bestMatch.index);
        const directionLabel = formatDirectionLabel(describeDirection(bestMatch.dx, bestMatch.dy));
        const distance = Math.sqrt(bestMatch.distanceSq);
        const distanceTiles = Math.round(distance / TILE_SIZE_PX);
        const distanceLabel = distanceTiles > 1 ? ` (~${distanceTiles} tiles)` : '';
        message = `Nearest orbable city: ${cityName} — ${directionLabel}${distanceLabel}`;
    }

    if (!force && message === game.lastOrbHintMessage) {
        return;
    }

    element.textContent = message || '';
    element.style.display = message ? 'block' : 'none';
    game.lastOrbHintMessage = message || '';
};

game.updateOrbHint({ force: true });

game.clearDefenseItems = (cityId) => {
    const normalisedId = normaliseCityId(cityId, null);
    if (normalisedId === null) {
        return;
    }
    const stored = game.defenseItems.get(normalisedId);
    if (Array.isArray(stored) && game.itemFactory && typeof game.itemFactory.removeItemById === 'function') {
        stored.forEach((itemId) => {
            game.itemFactory.removeItemById(itemId);
        });
    }
    game.defenseItems.delete(normalisedId);
    game.forceDraw = true;
};

game.applyDefenseSnapshot = (cityId, items) => {
    const normalisedId = normaliseCityId(cityId, null);
    if (normalisedId === null) {
        return;
    }
    if (!game.itemFactory || typeof game.itemFactory.newItem !== 'function') {
        return;
    }
    game.clearDefenseItems(normalisedId);
    if (!Array.isArray(items) || !items.length) {
        return;
    }

    const createdIds = [];
    items.forEach((entry, index) => {
        const type = toFiniteNumber(entry?.type, null);
        const x = toFiniteNumber(entry?.x, null);
        const y = toFiniteNumber(entry?.y, null);
        if (!Number.isFinite(type) || !Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }
        const teamId = toFiniteNumber(entry?.teamId, normalisedId);
        const itemId = (typeof entry?.id === 'string' && entry.id.length > 0)
            ? entry.id
            : `defense_${normalisedId}_${index}`;
        if (typeof game.itemFactory.removeItemById === 'function') {
            game.itemFactory.removeItemById(itemId);
        }
        const ownerId = (typeof entry?.ownerId === 'string' && entry.ownerId.length > 0)
            ? entry.ownerId
            : `fake_city_${normalisedId}`;
        const owner = { id: ownerId, city: normalisedId };
        const item = game.itemFactory.newItem(owner, x, y, type, {
            id: itemId,
            notifyServer: false,
            teamId,
            city: teamId,
        });
        if (!item) {
            return;
        }
        item.isDefense = true;
        if (entry?.angle !== undefined) {
            const angle = toFiniteNumber(entry.angle, null);
            if (Number.isFinite(angle)) {
                item.angle = angle;
            }
        }
        createdIds.push(item.id);
    });

    if (createdIds.length) {
        game.defenseItems.set(normalisedId, createdIds);
        game.forceDraw = true;
    }
};

const applyPanelMessage = (message) => {
    const heading = message && typeof message.heading === 'string' ? message.heading : '';
    const linesSource = (message && Array.isArray(message.lines)) ? message.lines : [];
    const lines = [];
    linesSource.forEach((entry) => {
        if (entry === null || entry === undefined) {
            return;
        }
        const text = `${entry}`;
        lines.push(text);
    });
    game.panelState = {
        heading,
        lines
    };
    game.forceDraw = true;
};

const computeLocalCitySnapshot = (cityId) => {
    const id = normaliseCityId(cityId, null);
    if (id === null) {
        return null;
    }

    let playerCount = 0;
    let mayorId = null;

    const myCity = normaliseCityId(game.player && game.player.city, null);
    if (myCity === id) {
        playerCount += 1;
        if (game.player && game.player.isMayor) {
            mayorId = game.player.id || mayorId;
        }
    }

    Object.keys(game.otherPlayers || {}).forEach((key) => {
        const player = game.otherPlayers[key];
        if (!player) {
            return;
        }
        if (normaliseCityId(player.city, null) !== id) {
            return;
        }
        playerCount += 1;
        if (!mayorId && player.isMayor) {
            mayorId = player.id || null;
        }
    });

    const buildingFactory = game.buildingFactory;
    const buildingCount = buildingFactory && typeof buildingFactory.countBuildingsForCity === 'function'
        ? buildingFactory.countBuildingsForCity(id)
        : 0;

    return {
        cityId: id,
        playerCount,
        buildingCount,
        mayorId,
        mayorLabel: mayorId ? shortenId(mayorId) : null
    };
};

const buildCityPanelMessage = (cityId, data = {}) => {
    const id = normaliseCityId(cityId, null);
    if (id === null) {
        return {
            heading: DEFAULT_PANEL_MESSAGE.heading,
            lines: [...DEFAULT_PANEL_MESSAGE.lines]
        };
    }

    const local = computeLocalCitySnapshot(id) || {
        cityId: id,
        playerCount: 0,
        buildingCount: 0,
        mayorId: null,
        mayorLabel: null
    };

    const cityState = game.cities?.[id];
    const heading = data.cityName || cityState?.name || getCityDisplayName(id);
    const mayorLabel = data.mayorLabel || local.mayorLabel;
    const resolvedMayorId = data.mayorId !== undefined ? data.mayorId : local.mayorId;
    const mayorDisplay = mayorLabel || shortenId(resolvedMayorId) || '(unknown)';

    const playerCount = Number.isFinite(data.playerCount)
        ? data.playerCount
        : local.playerCount;
    const buildingCount = Number.isFinite(data.buildingCount)
        ? data.buildingCount
        : local.buildingCount;

    const lines = [
        `Mayor:   ${mayorDisplay}`,
        `Players: ${playerCount}`,
        `Size:    ${buildingCount} building${buildingCount === 1 ? '' : 's'}`
    ];

    if (data.score !== undefined) {
        const scoreValue = Number.isFinite(data.score)
            ? data.score
            : toFiniteNumber(data.score, 0);
        lines.push(`Score:   ${scoreValue} pts`);
    }

    if (data.isOrbable && data.orbPoints !== undefined) {
        const points = Number.isFinite(data.orbPoints)
            ? data.orbPoints
            : toFiniteNumber(data.orbPoints, 0);
        lines.push(`Bounty:  ${points} points`);
    }

    if (data.isOrbable && data.orbs !== undefined) {
        const orbCount = Number.isFinite(data.orbs)
            ? data.orbs
            : toFiniteNumber(data.orbs, 0);
        lines.push(`Orbs:    ${orbCount}`);
    }

    if (data.uptimeInMinutes !== undefined && data.uptimeInMinutes !== null) {
        const uptimeValue = Number.isFinite(data.uptimeInMinutes)
            ? data.uptimeInMinutes
            : toFiniteNumber(data.uptimeInMinutes, 0);
        if (Number.isFinite(uptimeValue) && uptimeValue > 0) {
            const hours = Math.floor(uptimeValue / 60);
            const minutes = uptimeValue % 60;
            lines.push(`Uptime:  ${hours}h ${minutes}m`);
        }
    }

    return {
        heading,
        lines
    };
};

game.setPanelMessage = (message) => {
    if (!message) {
        applyPanelMessage(DEFAULT_PANEL_MESSAGE);
        return;
    }
    applyPanelMessage(message);
};

game.clearPanelMessage = () => {
    applyPanelMessage(DEFAULT_PANEL_MESSAGE);
};

game.showCityInfo = (cityOrData, overrides = {}) => {
    let data = overrides || {};
    let cityId = cityOrData;

    if (cityOrData && typeof cityOrData === 'object' && !Array.isArray(cityOrData)) {
        data = cityOrData;
        if (cityOrData.cityId !== undefined) {
            cityId = cityOrData.cityId;
        } else if (cityOrData.city !== undefined) {
            cityId = cityOrData.city;
        }
    }

    const normalisedId = normaliseCityId(cityId, null);
    if (normalisedId === null) {
        applyPanelMessage(DEFAULT_PANEL_MESSAGE);
        return;
    }

    const message = buildCityPanelMessage(normalisedId, data || {});
    applyPanelMessage(message);
};
game.clearPanelMessage();
game.bulletFactory = new BulletFactory(game);
game.buildingFactory = new BuildingFactory(game);
game.socketListener = new SocketListener(game);
game.lobby = new LobbyManager(game);
game.lobby.attachSocket(game.socketListener);
game.iconFactory = new IconFactory(game);
game.itemFactory = new ItemFactory(game);
game.rogueTankManager = new RogueTankManager(game);

const resourcesToLoad = [
    { name: 'imgTanks', url: assetUrl('imgTanks.png') },
    { name: 'imgGround', url: assetUrl('skins/BattleCityDX/imgGround.png') },
    { name: 'imgLava', url: assetUrl('skins/BattleCityDX/imgLava.png') },
    { name: 'imgRocks', url: assetUrl('skins/BattleCityDX/imgRocks.png') },
    { name: 'imgBullets', url: assetUrl('skins/BattleCityDX/imgBullets.png') },
    { name: 'imgInterfaceTop', url: assetUrl('skins/BattleCityDX/imgInterface.png') },
    { name: 'imgInterfaceBottom', url: assetUrl('skins/BattleCityDX/imgInterfaceBottom.png') },
    { name: 'imgHealth', url: assetUrl('skins/BattleCityDX/imgHealth.png') },
    { name: 'imgBuildings', url: assetUrl('skins/BattleCityDX/imgBuildings.png') },
    { name: 'imgBuildIcons', url: assetUrl('imgBuildIcons.png') },
    { name: 'imgItems', url: assetUrl('imgItems.png') },
    { name: 'imgInventorySelection', url: assetUrl('imgInventorySelection.png') },
    { name: 'imgPopulation', url: assetUrl('imgPopulation.png') },
    { name: 'imgBlackNumbers', url: assetUrl('imgBlackNumbers.png') },
    { name: 'imgMoneyBox', url: assetUrl('skins/BattleCity3.1/imgMoneyBox.png') },
    { name: 'imgMoneyUp', url: assetUrl('skins/BattleCity3.1/imgMoneyUp.png') },
    { name: 'imgMoneyDown', url: assetUrl('skins/BattleCity3.1/imgMoneyDown.png') },
    { name: 'imgTurretBase', url: assetUrl('skins/BattleCityDX/imgTurretBase.png') },
    { name: 'imgTurretHead', url: assetUrl('skins/BattleCityDX/imgTurretHead.png') },
    { name: 'imgSmoke', url: assetUrl('imgSmoke.png') },
    { name: 'imgLEExplosion', url: assetUrl('imgLExplosion.png') },
    {
        name: 'mapData',
        url: assetUrl('map.dat'),
        loadType: LOAD_TYPE.XHR !== undefined ? LOAD_TYPE.XHR : 1,
        xhrType: XHR_RESPONSE_TYPE.BUFFER || 'arraybuffer'
    },
    {
        name: 'cityDemo',
        url: assetUrl('cities/Balkh/demo.city'),
        loadType: LOAD_TYPE.XHR !== undefined ? LOAD_TYPE.XHR : 1,
        xhrType: XHR_RESPONSE_TYPE.TEXT || 'text'
    }
];

loader.add(resourcesToLoad);

loader.onProgress.add(loadProgressHandler);
loader.load(setup);


function loadProgressHandler(targetLoader, resource) {

    if (resource) {
        console.log("loading: " + resource.url);
    }
    console.log("progress: " + targetLoader.progress + "%");
}


function setup() {
    console.log("loaded");


    const resources = loader.resources;
    var mapData = resources.mapData.data;
    mapBuilder.build(game, mapData);
    cityBuilder.build(game);

    const initialSpawn = getCitySpawn(game.player.city);
    if (initialSpawn) {
        game.player.offset.x = initialSpawn.x;
        game.player.offset.y = initialSpawn.y;
    } else if (game.cities[game.player.city]) {
        game.player.offset.x = game.cities[game.player.city].x + 48;
        game.player.offset.y = game.cities[game.player.city].y + 100;
    } else {
        game.player.offset.x = 0;
        game.player.offset.y = 0;
    }
    game.player.lastSafeOffset = {
        x: game.player.offset.x,
        y: game.player.offset.y,
    };

    const colorKeyTargets = [
        resources.imgGround,
        resources.imgLava,
        resources.imgRocks,
        resources.imgBuildings,
        resources.imgBuildIcons,
        resources.imgItems,
        resources.imgInventorySelection,
        resources.imgInterfaceTop,
        resources.imgInterfaceBottom,
        resources.imgTurretBase,
        resources.imgTurretHead,
        resources.imgPopulation,
        resources.imgBlackNumbers,
        resources.imgMoneyBox,
        resources.imgMoneyUp,
        resources.imgMoneyDown,
        resources.imgSmoke,
        resources.imgLEExplosion
    ];

    colorKeyTargets.forEach((resource) => applyColorKey(resource));

    game.textures['groundTexture'] = resources.imgGround.texture;
    game.textures['tankTexture'] = resources.imgTanks.texture;
    game.textures['rockTexture'] = resources.imgRocks.texture;
    game.textures['lavaTexture'] = resources.imgLava.texture;
    game.textures['bulletTexture'] = resources.imgBullets.texture;
    game.textures['interfaceTop'] = resources.imgInterfaceTop.texture;
    game.textures['interfaceBottom'] = resources.imgInterfaceBottom.texture;
    game.textures['health'] = resources.imgHealth.texture;
    game.textures['buildings'] = resources.imgBuildings.texture;
    game.textures['buildingIcons'] = resources.imgBuildIcons.texture;
    game.textures['imageIcons'] = resources.imgItems.texture;
    game.textures['imageItems'] = resources.imgItems.texture;
    game.textures['imageInventorySelection'] = resources.imgInventorySelection.texture;
    game.textures['imageTurretBase'] = resources.imgTurretBase.texture;
    game.textures['imageTurretHead'] = resources.imgTurretHead.texture;
    game.textures['population'] = resources.imgPopulation.texture;
    game.textures['blackNumbers'] = resources.imgBlackNumbers.texture;
    game.textures['imgMoneyBox'] = resources.imgMoneyBox.texture;
    game.textures['imgMoneyUp'] = resources.imgMoneyUp.texture;
    game.textures['imgMoneyDown'] = resources.imgMoneyDown.texture;
    game.textures['smoke'] = resources.imgSmoke.texture;
    game.textures['imageLEExplosion'] = resources.imgLEExplosion.texture;
    game.textures['imgLEExplosion'] = resources.imgLEExplosion.texture;


    setupKeyboardInputs(game);
    setupMouseInputs(game);

    game.socketListener.listen();
    game.itemFactory.bindSocketEvents(game.socketListener);
    game.socketListener.on("connected", () => {
        console.log("Connected to server");
    });
    game.socketListener.on('population:update', (update) => {
        game.buildingFactory.applyPopulationUpdate(update);
    });
    game.socketListener.on('building:new', (data) => {
        if (!data) {
            return;
        }
        game.buildingFactory.newBuilding(data.ownerId || null, data.x, data.y, data.type, {
            notifyServer: false,
            id: data.id,
            population: data.population || 0,
            attachedHouseId: data.attachedHouseId || null,
            city: data.city ?? 0,
            itemsLeft: data.itemsLeft || 0,
            updateCity: false,
        });
        game.forceDraw = true;
    });
    game.socketListener.on('city:finance', (payload) => {
        let data = payload;
        if (typeof payload === 'string') {
            try {
                data = JSON.parse(payload);
            } catch (error) {
                console.warn('Failed to parse finance payload', error);
                return;
            }
        }
        if (!data) {
            return;
        }
        const cityIdRaw = data.id ?? data.city;
        if (cityIdRaw === undefined || cityIdRaw === null) {
            return;
        }
        const cityId = toFiniteNumber(cityIdRaw, 0);
        if (!game.cities[cityId]) {
            game.cities[cityId] = {
                id: cityId,
                canBuild: {},
                cash: 0,
                income: 0,
                itemProduction: 0,
                research: 0,
                hospital: 0,
                construction: 0,
                grossIncome: 0,
            };
        }
    const city = game.cities[cityId];
    city.cash = toFiniteNumber(data.cash, city.cash ?? 0);
    city.income = toFiniteNumber(data.income, 0);
    city.itemProduction = toFiniteNumber(data.itemProduction, 0);
    city.research = toFiniteNumber(data.research, 0);
        city.hospital = toFiniteNumber(data.hospital, 0);
        city.construction = toFiniteNumber(data.construction, 0);
        if (data.grossIncome !== undefined) {
            city.grossIncome = toFiniteNumber(data.grossIncome, city.grossIncome ?? 0);
        } else {
            city.grossIncome = city.income - (city.itemProduction + city.research + city.hospital + city.construction);
        }
        if (data.orbPoints !== undefined) {
            city.orbPoints = toFiniteNumber(data.orbPoints, city.orbPoints ?? 0);
        }
        if (data.score !== undefined) {
            city.score = toFiniteNumber(data.score, city.score ?? 0);
        }
        if (data.orbs !== undefined) {
            city.orbs = toFiniteNumber(data.orbs, city.orbs ?? 0);
        }
        if (data.isOrbable !== undefined) {
            city.isOrbable = !!data.isOrbable;
        }
        if (data.currentBuildings !== undefined) {
            city.currentBuildings = toFiniteNumber(data.currentBuildings, city.currentBuildings ?? 0);
        }
        if (data.maxBuildings !== undefined) {
            city.maxBuildings = toFiniteNumber(data.maxBuildings, city.maxBuildings ?? 0);
        }
        city.updatedAt = data.updatedAt ? toFiniteNumber(data.updatedAt, Date.now()) : Date.now();
        if (typeof game.updateOrbHint === 'function') {
            game.updateOrbHint({ force: true });
        }
        game.forceDraw = true;
    });
    game.socketListener.on('city:info', (info) => {
        if (!info) {
            return;
        }
        game.showCityInfo(info);
    });
    game.socketListener.on('orb:result', (result) => {
        if (!result) {
            return;
        }
        if (result.status === 'detonated') {
            const targetLabel = (result.targetCity !== undefined && result.targetCity !== null)
                ? getCityDisplayName(result.targetCity)
                : 'Enemy city';
            const pointsAwarded = toFiniteNumber(result.points, 0);
            const lines = [
                `Destroyed ${targetLabel}.`,
                pointsAwarded > 0 ? `Awarded ${pointsAwarded} points.` : null
            ].filter(Boolean);
            game.setPanelMessage({
                heading: 'Orb Successful',
                lines
            });
            game.forceDraw = true;
            return;
        }
        if (result.status === 'idle' || result.status === 'rejected') {
            let description = 'The orb failed to trigger.';
            if (result.reason === 'not_orbable') {
                description = 'Target city is not orbable yet.';
            } else if (result.reason === 'no_target') {
                description = 'An orb must land on an enemy command center.';
            }
            game.setPanelMessage({
                heading: 'Orb Inert',
                lines: [description]
            });
            game.forceDraw = true;
        }
    });
    game.socketListener.on('city:orbed', (data) => {
        if (!data) {
            return;
        }
        const attackerName = getCityDisplayName(data.attackerCity);
        const targetName = getCityDisplayName(data.targetCity);
        const points = toFiniteNumber(data.points, 0);
        const lines = [
            `${attackerName} destroyed ${targetName}.`,
            points > 0 ? `They earned ${points} points.` : null
        ].filter(Boolean);
        game.setPanelMessage({
            heading: 'City Destroyed',
            lines
        });
        if (Number.isFinite(data.targetCity) && game.cities?.[data.targetCity]) {
            const city = game.cities[data.targetCity];
            city.orbPoints = 0;
            city.isOrbable = false;
            city.currentBuildings = toFiniteNumber(city.currentBuildings, 1);
            city.maxBuildings = Math.max(1, toFiniteNumber(city.maxBuildings, 1));
            city.updatedAt = Date.now();
        }
        game.forceDraw = true;
    });
    game.socketListener.on('lobby:evicted', (payload) => {
        if (game.player) {
            game.player.city = null;
            game.player.isMayor = false;
        }
        if (game.lobby && typeof game.lobby.handleEviction === 'function') {
            game.lobby.handleEviction(payload);
        }
        game.forceDraw = true;
    });
    game.socketListener.on('build:denied', (payload) => {
        let data = payload;
        if (typeof payload === 'string') {
            try {
                data = JSON.parse(payload);
            } catch (error) {
                console.warn('Failed to parse build denied payload', error);
                return;
            }
        }
        if (data) {
            game.buildingFactory.handleBuildDenied(data);
        }
    });


    groundTiles = new PIXI.tilemap.CompositeRectTileLayer(0, game.textures['groundTexture'], true);
    backgroundTiles = new PIXI.tilemap.CompositeRectTileLayer(0, null, true);
    iconTiles = new PIXI.tilemap.CompositeRectTileLayer(0, game.textures['imageItems'], true);
    itemTiles = new PIXI.tilemap.CompositeRectTileLayer(0, null, true);


     app.stage.addChild(groundTiles);
     app.stage.addChild(backgroundTiles);
     app.stage.addChild(itemTiles);
     app.stage.addChild(iconTiles);
     app.stage.addChild(objectContainer);
     app.stage.addChild(panelContainer);


     setupBuildingMenu(game);

     game.forceDraw = true;


     drawGround(game, groundTiles);
     drawTiles(game, backgroundTiles);
     drawIcons(game, iconTiles);
     drawItems(game, itemTiles);

     drawPanelInterface(game, panelContainer);


     game.forceDraw = false;


     gameLoop();
}


var tileAnim = 0;
var tileAnimationTick = 0;

function gameLoop() {

    stats.begin();


    game.lastTick = game.tick;
    game.tick = new Date().getTime();
    game.timePassed = (game.tick - game.lastTick);

    game.bulletFactory.cycle();
    if (!game.lobby || game.lobby.isInGame()) {
        game.socketListener.cycle();
    }
    game.itemFactory.cycle();
    if (game.rogueTankManager) {
        game.rogueTankManager.update();
    }

    setupBuildingMenu(game);
    drawGround(game, groundTiles);
    drawTiles(game, backgroundTiles);
    drawItems(game, itemTiles);
    drawChanging(game);
    drawBuilding(game);
    drawIcons(game, iconTiles);
    drawPanelInterface(game, panelContainer);
    play(game);

    if (typeof game.updateOrbHint === 'function') {
        const nextTick = Number.isFinite(game.nextOrbHintUpdate) ? game.nextOrbHintUpdate : 0;
        if (!nextTick || game.tick >= nextTick) {
            game.updateOrbHint();
            game.nextOrbHintUpdate = game.tick + 500;
        }
    }

    app.renderer.plugins.tilemap.tileAnim[0] = tileAnim * 144;

    game.forceDraw = false;


    stats.end();
    requestAnimationFrame(gameLoop);

    if (game.tick > tileAnimationTick) {
        tileAnimationTick = game.tick + 300;

        tileAnim = tileAnim + 1;
        if (tileAnim >= 3) {

            tileAnim = 0;
        }
    }

}
