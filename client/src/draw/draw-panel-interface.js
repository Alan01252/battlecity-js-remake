import PIXI from '../pixi';

import {MAX_HEALTH} from "../constants";
import {ITEM_TYPE_TURRET} from "../constants";
import {ITEM_TYPE_LASER} from "../constants";
import {ITEM_TYPE_MINE} from "../constants";
import {ITEM_TYPE_MEDKIT} from "../constants";
import {ITEM_TYPE_ROCKET} from "../constants";
import {ITEM_TYPE_BOMB} from "../constants";
import {ITEM_TYPE_ORB} from "../constants";
import {ITEM_TYPE_CLOAK} from "../constants";
import {ITEM_TYPE_DFG} from "../constants";
import {ITEM_TYPE_WALL} from "../constants";
import {ITEM_TYPE_SLEEPER} from "../constants";
import {ITEM_TYPE_PLASMA} from "../constants";
import {ITEM_TYPE_FLARE} from "../constants";
import {
    RADAR_RANGE_PX,
    RADAR_RATIO,
    RADAR_CENTER_OFFSET_X,
    RADAR_CENTER_Y,
    RADAR_BOUNDS,
    RADAR_OFFSET_ADJUST_X,
    RADAR_OFFSET_ADJUST_Y
} from "../constants";

const TILE_SIZE = 48;
const HALF_TILE = TILE_SIZE / 2;
const CITY_CENTER_OFFSET = TILE_SIZE * 1.5;

const INVENTORY_SLOT_SIZE = 32;
const INVENTORY_SLOT_GAP = 8;
const INVENTORY_PANEL_LAYOUT = {
    offsetX: 8,
    offsetY: 208,
    width: 188,
    headerHeight: 58,
    paddingX: 14,
    paddingTop: 10,
    paddingBottom: 14,
    collapsedExtra: 18,
    columns: 4,
};

const INVENTORY_SLOTS = {
    [ITEM_TYPE_LASER]: {column: 0, row: 0},
    [ITEM_TYPE_ROCKET]: {column: 1, row: 0},
    [ITEM_TYPE_MEDKIT]: {column: 2, row: 0},
    [ITEM_TYPE_CLOAK]: {column: 3, row: 0},
    [ITEM_TYPE_BOMB]: {column: 0, row: 1},
    [ITEM_TYPE_MINE]: {column: 1, row: 1},
    [ITEM_TYPE_ORB]: {column: 2, row: 1},
    [ITEM_TYPE_FLARE]: {column: 3, row: 1},
    [ITEM_TYPE_DFG]: {column: 0, row: 2},
    [ITEM_TYPE_WALL]: {column: 1, row: 2},
    [ITEM_TYPE_TURRET]: {column: 2, row: 2},
    [ITEM_TYPE_SLEEPER]: {column: 3, row: 2},
    [ITEM_TYPE_PLASMA]: {column: 0, row: 3},
};

const getInventoryLayout = (game) => {
    const baseX = (game?.maxMapX || 0) + INVENTORY_PANEL_LAYOUT.offsetX;
    const baseY = INVENTORY_PANEL_LAYOUT.offsetY;
    const columnSpacing = INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP;
    const rowSpacing = columnSpacing;
    const maxRow = Object.values(INVENTORY_SLOTS).reduce((max, slot) => Math.max(max, slot.row), 0);
    const rows = Math.max(1, maxRow + 1);
    const startX = baseX + INVENTORY_PANEL_LAYOUT.paddingX;
    const startY = baseY + INVENTORY_PANEL_LAYOUT.headerHeight + INVENTORY_PANEL_LAYOUT.paddingTop;
    const contentHeight = (rows * INVENTORY_SLOT_SIZE) + ((rows - 1) * INVENTORY_SLOT_GAP);
    const expandedHeight = INVENTORY_PANEL_LAYOUT.headerHeight + INVENTORY_PANEL_LAYOUT.paddingTop + contentHeight + INVENTORY_PANEL_LAYOUT.paddingBottom;
    const collapsedHeight = INVENTORY_PANEL_LAYOUT.headerHeight + INVENTORY_PANEL_LAYOUT.collapsedExtra;
    return {
        panelX: baseX,
        panelY: baseY,
        panelWidth: INVENTORY_PANEL_LAYOUT.width,
        headerHeight: INVENTORY_PANEL_LAYOUT.headerHeight,
        startX,
        startY,
        columnSpacing,
        rowSpacing,
        slotSize: INVENTORY_SLOT_SIZE,
        columns: INVENTORY_PANEL_LAYOUT.columns,
        rows,
        expandedHeight,
        collapsedHeight,
    };
};

const resolveSlotPosition = (layout, type, fallbackIndex = 0) => {
    const slot = INVENTORY_SLOTS[type];
    if (slot) {
        return {
            x: layout.startX + (slot.column * layout.columnSpacing),
            y: layout.startY + (slot.row * layout.rowSpacing),
        };
    }
    const column = fallbackIndex % layout.columns;
    const row = Math.floor(fallbackIndex / layout.columns);
    return {
        x: layout.startX + (column * layout.columnSpacing),
        y: layout.startY + (row * layout.rowSpacing),
    };
};

const PANEL_BUTTON_DEFINITIONS = [
    {
        key: 'staff',
        offsetX: 145,
        y: 268,
        width: 45,
        height: 20,
        handler: (game) => game?.showStaffSummary && game.showStaffSummary()
    },
    {
        key: 'map',
        offsetX: 145,
        y: 290,
        width: 45,
        height: 20,
        handler: (game) => game?.toggleMapOverlay && game.toggleMapOverlay()
    },
    {
        key: 'info',
        offsetX: 145,
        y: 312,
        width: 45,
        height: 20,
        handler: (game) => game?.showPlayerCityInfo && game.showPlayerCityInfo()
    },
    {
        key: 'points',
        offsetX: 145,
        y: 334,
        width: 45,
        height: 20,
        handler: (game) => game?.showPointsSummary && game.showPointsSummary()
    },
    {
        key: 'options',
        offsetX: 145,
        y: 356,
        width: 45,
        height: 20,
        handler: (game) => game?.openOptionsPanel && game.openOptionsPanel()
    },
    {
        key: 'help',
        offsetX: 145,
        y: 378,
        width: 45,
        height: 20,
        handler: (game) => game?.showHelpMessage && game.showHelpMessage()
    },
    {
        key: 'build',
        offsetX: 126,
        y: 400,
        width: 64,
        height: 22,
        handler: (game) => game?.toggleBuildMenuFromPanel && game.toggleBuildMenuFromPanel()
    },
    {
        key: 'exit',
        offsetX: 150,
        y: 576,
        width: 42,
        height: 18,
        handler: (game) => game?.requestExitToLobby && game.requestExitToLobby()
    }
];

const ensurePanelState = (game) => {
    if (!game.panelState || typeof game.panelState !== 'object') {
        game.panelState = {};
    }
    if (typeof game.panelState.isInventoryCollapsed !== 'boolean') {
        game.panelState.isInventoryCollapsed = false;
    }
    return game.panelState;
};

const isInventoryCollapsed = (game) => {
    const state = ensurePanelState(game);
    return !!state.isInventoryCollapsed;
};

const toggleInventoryCollapsed = (game) => {
    const state = ensurePanelState(game);
    state.isInventoryCollapsed = !state.isInventoryCollapsed;
    if (game) {
        game.forceDraw = true;
    }
};

const attachPanelButtons = (game, stage) => {
    if (!game || !stage) {
        return;
    }
    const baseX = game.maxMapX || 0;
    PANEL_BUTTON_DEFINITIONS.forEach((definition) => {
        const graphics = new PIXI.Graphics();
        graphics.beginFill(0xffffff, 0.001);
        graphics.drawRect(baseX + definition.offsetX, definition.y, definition.width, definition.height);
        graphics.endFill();
        graphics.interactive = true;
        graphics.buttonMode = true;
        graphics.cursor = 'pointer';
        graphics.on('pointertap', (event) => {
            event.stopPropagation();
            if (typeof definition.handler === 'function') {
                definition.handler(game);
            }
        });
        stage.addChild(graphics);
    });
};

const formatCash = (value) => {
    const amount = Number.isFinite(value) ? value : parseInt(value, 10) || 0;
    try {
        return amount.toLocaleString('en-US');
    } catch (error) {
        return `${amount}`;
    }
};

const getGrossIncome = (city) => {
    if (!city) {
        return 0;
    }
    if (typeof city.grossIncome === 'number' && Number.isFinite(city.grossIncome)) {
        return city.grossIncome;
    }
    const income = Number(city.income || 0);
    const expenses = Number(city.itemProduction || 0) + Number(city.research || 0) + Number(city.hospital || 0) + Number(city.construction || 0);
    return income - expenses;
};

const RADAR_STATE_KEY = '__radarState';
const RADAR_SPRITE_SCALE = 2;
const RADAR_TEXTURE_SIZE = 2;

const HOME_ARROW_STATE_KEY = '__homeArrowState';
const HOME_ARROW_FRAME_SIZE = 40;
const HOME_ARROW_OFFSET_X = 5;
const HOME_ARROW_OFFSET_Y = 160;

const toFiniteNumber = (value, fallback = null) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const createTextureSlice = (texture, column) => {
    if (!texture || !texture.baseTexture) {
        return null;
    }
    return new PIXI.Texture(texture.baseTexture, new PIXI.Rectangle(column * RADAR_TEXTURE_SIZE, 0, RADAR_TEXTURE_SIZE, RADAR_TEXTURE_SIZE));
};

const buildRadarTextures = (game) => {
    if (!game || !game.textures) {
        return null;
    }
    const base = game.textures.imgRadarColors;
    if (!base) {
        return null;
    }
    const textures = {
        neutral: createTextureSlice(base, 0),
        admin: createTextureSlice(base, 1),
        enemy: createTextureSlice(base, 2),
        ally: createTextureSlice(base, 3),
    };
    const mini = game.textures.imgMiniMapColors;
    if (mini && mini.baseTexture) {
        textures.dead = new PIXI.Texture(mini.baseTexture, new PIXI.Rectangle(15 * RADAR_TEXTURE_SIZE, 0, RADAR_TEXTURE_SIZE, RADAR_TEXTURE_SIZE));
    }
    return textures;
};

const buildHomeArrowTextures = (game) => {
    const texture = game?.textures?.imgArrows;
    if (!texture || !texture.baseTexture) {
        return [];
    }
    const frames = [];
    for (let i = 0; i < 8; i += 1) {
        const rect = new PIXI.Rectangle(i * HOME_ARROW_FRAME_SIZE, 0, HOME_ARROW_FRAME_SIZE, HOME_ARROW_FRAME_SIZE);
        frames.push(new PIXI.Texture(texture.baseTexture, rect));
    }
    return frames;
};

const ensureHomeArrowState = (game, stage) => {
    if (!game || !stage || !game.textures?.imgArrows) {
        return null;
    }

    let state = stage[HOME_ARROW_STATE_KEY];
    if (!state) {
        const textures = buildHomeArrowTextures(game);
        if (!textures.length) {
            return null;
        }
        const container = new PIXI.Container();
        container.name = 'home-arrow';
        container.position.set((game.maxMapX || 0) + HOME_ARROW_OFFSET_X, HOME_ARROW_OFFSET_Y);
        const sprite = new PIXI.Sprite(textures[0]);
        container.addChild(sprite);
        stage.addChild(container);
        state = {
            container,
            sprite,
            textures,
            lastIndex: -1
        };
        stage[HOME_ARROW_STATE_KEY] = state;
        return state;
    }

    if (!state.container.parent || state.container.parent !== stage) {
        stage.addChild(state.container);
    }

    if (!Array.isArray(state.textures) || state.textures.length !== 8) {
        state.textures = buildHomeArrowTextures(game);
        if (state.sprite && state.textures.length) {
            state.sprite.texture = state.textures[0];
            state.lastIndex = -1;
        }
    }

    return state;
};

const updateHomeArrow = (game, stage) => {
    const state = ensureHomeArrowState(game, stage);
    if (!state || !state.sprite) {
        return;
    }

    const container = state.container;
    container.position.set((game.maxMapX || 0) + HOME_ARROW_OFFSET_X, HOME_ARROW_OFFSET_Y);

    const player = game?.player;
    const playerOffset = player?.offset;
    const playerCityId = toFiniteNumber(player?.city, null);

    if (!playerOffset || playerCityId === null) {
        container.visible = false;
        return;
    }

    const city = game.cities?.[playerCityId];
    if (!city) {
        container.visible = false;
        return;
    }

    const cityX = toFiniteNumber(city.x, null);
    const cityY = toFiniteNumber(city.y, null);
    const playerX = toFiniteNumber(playerOffset.x, null);
    const playerY = toFiniteNumber(playerOffset.y, null);

    if (!Number.isFinite(cityX) || !Number.isFinite(cityY) || !Number.isFinite(playerX) || !Number.isFinite(playerY)) {
        container.visible = false;
        return;
    }

    const cityCenterX = cityX + CITY_CENTER_OFFSET;
    const cityCenterY = cityY + CITY_CENTER_OFFSET;
    const playerCenterX = playerX + HALF_TILE;
    const playerCenterY = playerY + HALF_TILE;

    const dx = cityCenterX - playerCenterX;
    const dy = cityCenterY - playerCenterY;

    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        container.visible = false;
        return;
    }

    const angle = Math.atan2(-dy, dx);
    let index = Math.round(angle / (Math.PI / 4));
    index = ((index % 8) + 8) % 8;

    const textures = state.textures;
    if (!textures || !textures[index]) {
        container.visible = false;
        return;
    }

    if (state.lastIndex !== index) {
        state.sprite.texture = textures[index];
        state.lastIndex = index;
    }

    container.visible = true;
};

const ensureRadarState = (game, stage) => {
    if (!game || !stage || !game.textures || !game.textures.imgRadarColors) {
        return null;
    }

    let state = stage[RADAR_STATE_KEY];
    if (!state) {
        const container = new PIXI.Container();
        container.name = 'radar-container';
        const pointsLayer = new PIXI.Container();
        pointsLayer.name = 'radar-points';
        container.addChild(pointsLayer);
        state = {
            container,
            pointsLayer,
            pool: [],
            spriteScale: RADAR_SPRITE_SCALE,
            textures: null,
            bounds: null,
        };
        stage[RADAR_STATE_KEY] = state;
    }

    if (!state.textures) {
        state.textures = buildRadarTextures(game);
    }
    if (!state.textures) {
        return null;
    }

    const panelLeft = game.maxMapX || 0;
    const { offsetX, offsetY, width, height } = RADAR_BOUNDS;
    const left = panelLeft + offsetX;
    const top = offsetY;
    state.bounds = {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
    };
    state.container.position.set(left, top);

    if (!state.container.parent || state.container.parent !== stage) {
        stage.addChild(state.container);
    }

    return state;
};

const updateRadar = (game, radarState) => {
    if (!game || !radarState || !radarState.pointsLayer || !radarState.textures) {
        return;
    }

    const me = game.player;
    if (!me || !me.offset) {
        radarState.pointsLayer.visible = false;
        return;
    }

    const myX = toFiniteNumber(me.offset.x, null);
    const myY = toFiniteNumber(me.offset.y, null);
    if (!Number.isFinite(myX) || !Number.isFinite(myY)) {
        radarState.pointsLayer.visible = false;
        return;
    }

    const bounds = radarState.bounds;
    if (!bounds) {
        radarState.pointsLayer.visible = false;
        return;
    }

    const pool = radarState.pool;
    const textures = radarState.textures;
    const baseX = (game.maxMapX || 0) + RADAR_CENTER_OFFSET_X;
    const baseY = RADAR_CENTER_Y;
    const range = RADAR_RANGE_PX;
    const myCity = toFiniteNumber(me.city, null);
    const hasMyCity = Number.isFinite(myCity);
    let usedCount = 0;

    const acquireSprite = (texture, posX, posY) => {
        let sprite = pool[usedCount];
        if (!sprite) {
            sprite = new PIXI.Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.scale.set(radarState.spriteScale, radarState.spriteScale);
            radarState.pointsLayer.addChild(sprite);
            pool[usedCount] = sprite;
        }
        if (sprite.texture !== texture) {
            sprite.texture = texture;
        }
        sprite.visible = true;
        sprite.position.set(posX - bounds.left, posY - bounds.top);
        usedCount += 1;
    };

    const tryPlot = (offsetX, offsetY, cityId, health, isSelf, isAdmin, radarType) => {
        const dx = offsetX - myX;
        const dy = offsetY - myY;
        if (Math.abs(dx) > range || Math.abs(dy) > range) {
            return;
        }
        const globalX = baseX + ((dx - RADAR_OFFSET_ADJUST_X) / RADAR_RATIO);
        const globalY = baseY + ((dy - RADAR_OFFSET_ADJUST_Y) / RADAR_RATIO);
        if (globalX < bounds.left || globalX > bounds.right || globalY < bounds.top || globalY > bounds.bottom) {
            return;
        }

        let texture = textures.enemy;
        if (radarType !== 'rogue') {
            const numericCity = Number.isFinite(cityId) ? cityId : null;
            const sameCity = hasMyCity && numericCity !== null && numericCity === myCity;
            if (isSelf || sameCity) {
                texture = textures.ally || textures.neutral || texture;
            } else if (isAdmin && textures.admin) {
                texture = textures.admin;
            } else if (numericCity === null && textures.neutral) {
                texture = textures.neutral;
            }
        }

        if (Number.isFinite(health) && health <= 0 && textures.dead) {
            texture = textures.dead;
        }
        if (!texture) {
            return;
        }

        acquireSprite(texture, globalX, globalY);
    };

    if (!me.isCloaked) {
        tryPlot(
            myX,
            myY,
            myCity,
            toFiniteNumber(me.health, null),
            true,
            false,
            'player'
        );
    }

    const others = game.otherPlayers;
    if (others) {
        for (const key in others) {
            if (!Object.prototype.hasOwnProperty.call(others, key)) {
                continue;
            }
            const other = others[key];
            if (!other || !other.offset || other.isCloaked) {
                continue;
            }
            const otherX = toFiniteNumber(other.offset.x, null);
            const otherY = toFiniteNumber(other.offset.y, null);
            if (!Number.isFinite(otherX) || !Number.isFinite(otherY)) {
                continue;
            }
            tryPlot(
                otherX,
                otherY,
                toFiniteNumber(other.city, null),
                toFiniteNumber(other.health, null),
                false,
                !!other.isAdmin,
                'player'
            );
        }
    }

    const rogueManager = game.rogueTankManager;
    if (rogueManager && Array.isArray(rogueManager.tanks)) {
        const tanks = rogueManager.tanks;
        for (let i = 0; i < tanks.length; i += 1) {
            const tank = tanks[i];
            if (!tank || !tank.offset) {
                continue;
            }
            const rogueX = toFiniteNumber(tank.offset.x, null);
            const rogueY = toFiniteNumber(tank.offset.y, null);
            if (!Number.isFinite(rogueX) || !Number.isFinite(rogueY)) {
                continue;
            }
            tryPlot(
                rogueX,
                rogueY,
                null,
                toFiniteNumber(tank.health, null),
                false,
                false,
                'rogue'
            );
        }
    }

    for (let i = usedCount; i < pool.length; i += 1) {
        const sprite = pool[i];
        if (sprite) {
            sprite.visible = false;
        }
    }

    radarState.pointsLayer.visible = usedCount > 0;
};

var drawPanel = (game, stage) => {
    var interfaceTop = new PIXI.Sprite(game.textures["interfaceTop"]);
    interfaceTop.x = game.maxMapX;
    interfaceTop.y = 0;
    stage.addChild(interfaceTop);

    var interfaceBottom = new PIXI.Sprite(game.textures["interfaceBottom"]);
    interfaceBottom.x = game.maxMapX;
    interfaceBottom.y = 430;
    stage.addChild(interfaceBottom);
};

const drawInventoryBackground = (stage, layout, collapsed) => {
    const height = collapsed ? layout.collapsedHeight : layout.expandedHeight;
    const panelBackground = new PIXI.Graphics();
    panelBackground.lineStyle(1, 0x274b87, 0.65);
    panelBackground.beginFill(0x020b1e, 0.92);
    panelBackground.drawRoundedRect(layout.panelX, layout.panelY, layout.panelWidth, height, 12);
    panelBackground.endFill();
    stage.addChild(panelBackground);

    const headerOverlay = new PIXI.Graphics();
    headerOverlay.beginFill(0xffffff, 0.05);
    headerOverlay.drawRoundedRect(layout.panelX + 1, layout.panelY + 1, layout.panelWidth - 2, layout.headerHeight + 6, 11);
    headerOverlay.endFill();
    stage.addChild(headerOverlay);

    const divider = new PIXI.Graphics();
    divider.beginFill(0xffffff, 0.12);
    divider.drawRect(layout.panelX + 12, layout.panelY + layout.headerHeight, layout.panelWidth - 24, 1);
    divider.endFill();
    stage.addChild(divider);
};

const drawInventoryGrid = (stage, layout) => {
    const grid = new PIXI.Graphics();
    for (let row = 0; row < layout.rows; row += 1) {
        for (let column = 0; column < layout.columns; column += 1) {
            const slotX = layout.startX + (column * layout.columnSpacing);
            const slotY = layout.startY + (row * layout.rowSpacing);
            grid.lineStyle(1, 0x1c3154, 0.55);
            grid.beginFill(0x071325, 0.82);
            grid.drawRoundedRect(slotX - 4, slotY - 4, layout.slotSize + 8, layout.slotSize + 8, 6);
            grid.endFill();
        }
    }
    stage.addChild(grid);
};

const drawInventoryHeader = (game, stage, layout, collapsed) => {
    const title = new PIXI.Text('Inventory', {
        fontFamily: 'Arial',
        fontSize: 16,
        fontWeight: 'bold',
        fill: 0xAED6F1,
        stroke: 0x000000,
        strokeThickness: 3,
        letterSpacing: 0.6,
    });
    title.x = layout.panelX + 16;
    title.y = layout.panelY + 10;
    stage.addChild(title);

    const cityIndex = game?.player?.city ?? 0;
    const city = game?.cities?.[cityIndex] ?? null;
    const isMayor = !!(game?.player && game.player.isMayor);

    if (city && isMayor) {
        const gross = getGrossIncome(city);
        const netValue = gross >= 0 ? `+${formatCash(gross)}` : formatCash(gross);
        const indicatorKey = gross < 0 ? 'imgMoneyDown' : 'imgMoneyUp';
        let netTextX = layout.panelX + 16;
        const indicatorTexture = game.textures[indicatorKey];
        if (indicatorTexture) {
            const indicator = new PIXI.Sprite(indicatorTexture);
            indicator.x = netTextX;
            indicator.y = layout.panelY + 29;
            indicator.alpha = 0.9;
            stage.addChild(indicator);
            netTextX = indicator.x + indicator.width + 6;
        }

        const netText = new PIXI.Text(`Net ${netValue}`, {
            fontFamily: 'Arial',
            fontSize: 12,
            fill: gross < 0 ? 0xE74C3C : 0x2ECC71,
            stroke: 0x000000,
            strokeThickness: 2,
        });
        netText.x = netTextX;
        netText.y = layout.panelY + 30;
        stage.addChild(netText);

        const cashValue = formatCash(city.cash ?? 0);
        const cashText = new PIXI.Text(`$${cashValue}`, {
            fontFamily: 'Arial',
            fontSize: 15,
            fontWeight: 'bold',
            fill: 0xF8F9FF,
            stroke: 0x000000,
            strokeThickness: 3,
        });
        cashText.anchor.set(1, 0);
        cashText.x = layout.panelX + layout.panelWidth - 18;
        cashText.y = layout.panelY + 10;
        stage.addChild(cashText);

        const cashLabel = new PIXI.Text('City Cash', {
            fontFamily: 'Arial',
            fontSize: 11,
            fill: 0xBBD1FF,
            stroke: 0x000000,
            strokeThickness: 2,
        });
        cashLabel.anchor.set(1, 0);
        cashLabel.x = cashText.x;
        cashLabel.y = cashText.y + 18;
        stage.addChild(cashLabel);
    }

    if (city) {
        const scoreValue = Number.isFinite(city.score) ? city.score : parseInt(city.score, 10) || 0;
        const orbCount = Number.isFinite(city.orbs) ? city.orbs : parseInt(city.orbs, 10) || 0;
        const metaStyle = {
            fontFamily: 'Arial',
            fontSize: 12,
            fill: 0xD6EAF8,
            stroke: 0x000000,
            strokeThickness: 2,
        };
        const scoreText = new PIXI.Text(`Score ${scoreValue}`, metaStyle);
        scoreText.x = layout.panelX + 16;
        scoreText.y = layout.panelY + layout.headerHeight - 22;
        stage.addChild(scoreText);

        const orbText = new PIXI.Text(`Orbs ${orbCount}`, metaStyle);
        orbText.anchor.set(1, 0);
        orbText.x = layout.panelX + layout.panelWidth - 18;
        orbText.y = scoreText.y;
        stage.addChild(orbText);
    } else {
        const subtitle = new PIXI.Text('Manage your battlefield tools', {
            fontFamily: 'Arial',
            fontSize: 12,
            fill: 0xD6EAF8,
            stroke: 0x000000,
            strokeThickness: 2,
        });
        subtitle.x = layout.panelX + 16;
        subtitle.y = layout.panelY + 30;
        stage.addChild(subtitle);
    }

    const toggleButton = new PIXI.Container();
    toggleButton.x = layout.panelX + layout.panelWidth - 32;
    toggleButton.y = layout.panelY + 22;

    const toggleHitArea = new PIXI.Graphics();
    toggleHitArea.beginFill(0xffffff, 0.001);
    toggleHitArea.drawCircle(0, 0, 14);
    toggleHitArea.endFill();
    toggleButton.addChild(toggleHitArea);

    const toggleIcon = new PIXI.Graphics();
    toggleIcon.beginFill(0x9CC3FF);
    if (collapsed) {
        toggleIcon.moveTo(-6, -2);
        toggleIcon.lineTo(0, 6);
        toggleIcon.lineTo(6, -2);
    } else {
        toggleIcon.moveTo(-6, 2);
        toggleIcon.lineTo(0, -6);
        toggleIcon.lineTo(6, 2);
    }
    toggleIcon.endFill();
    toggleButton.addChild(toggleIcon);

    toggleButton.interactive = true;
    toggleButton.buttonMode = true;
    toggleButton.cursor = 'pointer';
    toggleButton.on('pointertap', (event) => {
        event.stopPropagation();
        toggleInventoryCollapsed(game);
    });

    stage.addChild(toggleButton);
};

const drawItems = (game, stage, layout, collapsed) => {
    if (!game || !stage || !layout || collapsed) {
        return;
    }
    let icon = game.iconFactory.getHead();
    let fallbackIndex = 0;
    while (icon) {
        if (icon.owner === game.player.id) {
            let frameX = icon.type * 32;
            let frameY = 0;
            if (icon.type === ITEM_TYPE_BOMB && icon.armed) {
                frameX = 152;
                frameY = 89;
            }

            const tmpText = new PIXI.Texture(
                game.textures['imageItems'].baseTexture,
                new PIXI.Rectangle(frameX, frameY, 32, 32)
            );

            const iconSprite = new PIXI.Sprite(tmpText);
            const slotPosition = resolveSlotPosition(layout, icon.type, fallbackIndex);
            const x = slotPosition.x;
            const y = slotPosition.y;

            if (icon.selected) {
                const highlight = new PIXI.Graphics();
                highlight.lineStyle(2, 0x5dade2, 0.95);
                highlight.beginFill(0x5dade2, 0.18);
                highlight.drawRoundedRect(x - 4, y - 4, layout.slotSize + 8, layout.slotSize + 8, 6);
                highlight.endFill();
                stage.addChild(highlight);
            }

            iconSprite.x = x;
            iconSprite.y = y;
            iconSprite.interactive = true;
            iconSprite.buttonMode = true;
            iconSprite.cursor = 'pointer';

            const iconClosure = icon;
            iconSprite.on('pointertap', (event) => {
                event.stopPropagation();
                if (typeof game.iconFactory.toggleSelected === 'function') {
                    game.iconFactory.toggleSelected(iconClosure);
                }
                game.forceDraw = true;
            });
            stage.addChild(iconSprite);

            const quantity = icon.quantity ?? 1;
            if (quantity > 1) {
                const qtyText = new PIXI.Text(`${quantity}`, {
                    fontFamily: 'Arial',
                    fontSize: 12,
                    fill: 0xFFFFFF,
                    fontWeight: 'bold',
                    stroke: 0x000000,
                    strokeThickness: 3,
                });
                qtyText.anchor.set(1, 1);
                qtyText.x = x + layout.slotSize - 3;
                qtyText.y = y + layout.slotSize - 2;
                stage.addChild(qtyText);
            }

            fallbackIndex += 1;
        }
        icon = icon.next;
    }
};

const drawPanelMessages = (game, stage) => {
    if (!game || !stage) {
        return;
    }
    const panelState = ensurePanelState(game);
    const heading = panelState.heading || '';
    const lines = Array.isArray(panelState.lines) ? panelState.lines : [];

    if (!heading && !lines.length) {
        return;
    }

    const baseX = game.maxMapX + 12;
    let currentY = 465;

    if (heading) {
        const headingText = new PIXI.Text(heading, {
            fontFamily: 'Arial',
            fontSize: 14,
            fontWeight: 'bold',
            fill: 0xF4D03F,
            stroke: 0x000000,
            strokeThickness: 2,
        });
        headingText.x = baseX;
        headingText.y = currentY;
        stage.addChild(headingText);
        currentY += 15;
    }

    const bodyStyle = {
        fontFamily: 'Arial',
        fontSize: 12,
        fill: 0xFDFEFE,
        stroke: 0x000000,
        strokeThickness: 2,
    };

    lines.forEach((line) => {
        if (line === null || line === undefined) {
            currentY += 15;
            return;
        }
        const text = new PIXI.Text(`${line}`, bodyStyle);
        text.x = baseX;
        text.y = currentY;
        stage.addChild(text);
        currentY += 15;
    });
};

var drawHealth = (game, stage) => {

    var percent = game.player.health / MAX_HEALTH;

    var tmpText = new PIXI.Texture(
        game.textures['health'].baseTexture,
        new PIXI.Rectangle(0, 0, 38, percent * 87)
    );

    var health = new PIXI.Sprite(tmpText);
    health.anchor = {x: 1, y: 1};
    health.x = game.maxMapX + (137 + 38);
    health.y = 160 + 87;


    stage.addChild(health);
};


export const drawPanelInterface = (game, panelContainer) => {

    if (game.forceDraw) {
        panelContainer.removeChildren();
        drawPanel(game, panelContainer);
        const layout = getInventoryLayout(game);
        const collapsed = isInventoryCollapsed(game);
        drawInventoryBackground(panelContainer, layout, collapsed);
        drawInventoryHeader(game, panelContainer, layout, collapsed);
        if (!collapsed) {
            drawInventoryGrid(panelContainer, layout);
        }
        drawHealth(game, panelContainer);
        drawItems(game, panelContainer, layout, collapsed);
        drawPanelMessages(game, panelContainer);
        attachPanelButtons(game, panelContainer);
    }

    const radarState = ensureRadarState(game, panelContainer);
    updateRadar(game, radarState);
    updateHomeArrow(game, panelContainer);
};
