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

import SocketListener from "./src/SocketListener"
import {setupBuildingMenu} from "./src/draw/draw-building-interface";
import {drawBuilding} from "./src/draw/draw-building-interface";
import {drawItems} from "./src/draw/draw-items";
import {drawIcons} from "./src/draw/draw-icons";
import {drawPanelInterface} from "./src/draw/draw-panel-interface";
import {initPersistence} from "./src/storage/persistence";

const assetUrl = (relativePath) => `${import.meta.env.BASE_URL}${relativePath}`;
const LoaderResource = PIXI.LoaderResource || (PIXI.loaders && PIXI.loaders.Resource);
const LOAD_TYPE = LoaderResource ? LoaderResource.LOAD_TYPE : {};
const XHR_RESPONSE_TYPE = LoaderResource ? LoaderResource.XHR_RESPONSE_TYPE : {};
const COLOR_KEY_MAGENTA = { r: 255, g: 0, b: 255 };

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
        isMayor: true,
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
        bombsArmed: false
    },
    app: app,
    stage: app.stage,
    objectContainer: objectContainer
};
game.bulletFactory = new BulletFactory(game);
game.buildingFactory = new BuildingFactory(game);
game.socketListener = new SocketListener(game);
game.iconFactory = new IconFactory(game);
game.itemFactory = new ItemFactory(game);

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
    { name: 'imgTurretBase', url: assetUrl('skins/BattleCityDX/imgTurretBase.png') },
    { name: 'imgTurretHead', url: assetUrl('skins/BattleCityDX/imgTurretHead.png') },
    { name: 'imgSmoke', url: assetUrl('imgSmoke.png') },
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
    initPersistence(game);

    game.player.offset.x = game.cities[game.player.city].x + 48;
    game.player.offset.y = game.cities[game.player.city].y + 100;

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
        resources.imgSmoke
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
    game.textures['smoke'] = resources.imgSmoke.texture;


    setupKeyboardInputs(game);
    setupMouseInputs(game);

    game.socketListener.listen();
    game.socketListener.on("connected", () => {
        game.player.id = game.socketListener.enterGame();
        console.log("Connected starting game");
        if (game.persistence && typeof game.persistence.restoreInventory === 'function') {
            game.persistence.restoreInventory();
        }
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


     game.iconFactory.newIcon(null, 1304, 1540, 12);
     game.itemFactory.newItem(null, 1500, 1800, 12);

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
    game.socketListener.cycle();
    game.itemFactory.cycle();

    setupBuildingMenu(game);
    drawGround(game, groundTiles);
    drawTiles(game, backgroundTiles);
    drawItems(game, itemTiles);
    drawChanging(game);
    drawBuilding(game);
    drawIcons(game, iconTiles);
    drawPanelInterface(game, panelContainer);
    play(game);

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
