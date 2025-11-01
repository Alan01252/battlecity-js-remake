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

const INVENTORY_SLOTS = {
    [ITEM_TYPE_LASER]: {x: 7, y: 267},
    [ITEM_TYPE_ROCKET]: {x: 42, y: 267},
    [ITEM_TYPE_MEDKIT]: {x: 77, y: 267},
    [ITEM_TYPE_BOMB]: {x: 7, y: 302},
    [ITEM_TYPE_MINE]: {x: 42, y: 302},
    [ITEM_TYPE_ORB]: {x: 77, y: 302},
    [ITEM_TYPE_FLARE]: {x: 7, y: 337},
    [ITEM_TYPE_DFG]: {x: 42, y: 337},
    [ITEM_TYPE_WALL]: {x: 77, y: 337},
    [ITEM_TYPE_TURRET]: {x: 7, y: 372},
    [ITEM_TYPE_SLEEPER]: {x: 42, y: 372},
    [ITEM_TYPE_PLASMA]: {x: 77, y: 372},
    [ITEM_TYPE_CLOAK]: {x: 112, y: 267},
};

const resolveSlotPosition = (type, defaultX, defaultY) => {
    return INVENTORY_SLOTS[type] ?? {x: defaultX, y: defaultY};
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
    const usedSprites = [];
    const baseX = (game.maxMapX || 0) + RADAR_CENTER_OFFSET_X;
    const baseY = RADAR_CENTER_Y;
    const range = RADAR_RANGE_PX;
    const myCity = toFiniteNumber(me.city, null);

    const pushSprite = (playerData) => {
        const dx = playerData.offsetX - myX;
        const dy = playerData.offsetY - myY;
        if (Math.abs(dx) > range || Math.abs(dy) > range) {
            return;
        }
        const globalX = baseX + ((dx - RADAR_OFFSET_ADJUST_X) / RADAR_RATIO);
        const globalY = baseY + ((dy - RADAR_OFFSET_ADJUST_Y) / RADAR_RATIO);
        if (globalX < bounds.left || globalX > bounds.right || globalY < bounds.top || globalY > bounds.bottom) {
            return;
        }

        let texture = textures.enemy;
        const sameCity = Number.isFinite(playerData.city) && Number.isFinite(myCity) && playerData.city === myCity;
        if (playerData.radarType !== 'rogue') {
            if (playerData.isSelf || sameCity) {
                texture = textures.ally || textures.neutral || texture;
            } else if (playerData.isAdmin && textures.admin) {
                texture = textures.admin;
            } else if (!Number.isFinite(playerData.city) && textures.neutral) {
                texture = textures.neutral;
            }
        }
        if (playerData.health !== undefined && playerData.health <= 0 && textures.dead) {
            texture = textures.dead;
        }
        if (!texture) {
            return;
        }

        let sprite = pool[usedSprites.length];
        if (!sprite) {
            sprite = new PIXI.Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.scale.set(radarState.spriteScale, radarState.spriteScale);
            radarState.pointsLayer.addChild(sprite);
            pool[usedSprites.length] = sprite;
        }

        sprite.texture = texture;
        sprite.visible = true;
        sprite.position.set(globalX - bounds.left, globalY - bounds.top);
        usedSprites.push(sprite);
    };

    if (!me.isCloaked) {
        pushSprite({
            id: me.id || '__self__',
            city: myCity,
            offsetX: myX,
            offsetY: myY,
            health: me.health,
            isSelf: true,
            isAdmin: false,
        });
    }

    const others = game.otherPlayers || {};
    Object.keys(others).forEach((key) => {
        const other = others[key];
        if (!other || !other.offset || other.isCloaked) {
            return;
        }
        const otherX = toFiniteNumber(other.offset.x, null);
        const otherY = toFiniteNumber(other.offset.y, null);
        if (!Number.isFinite(otherX) || !Number.isFinite(otherY)) {
            return;
        }
        const otherCity = toFiniteNumber(other.city, null);
        pushSprite({
            id: other.id || key,
            city: otherCity,
            offsetX: otherX,
            offsetY: otherY,
            health: toFiniteNumber(other.health, null),
            isSelf: false,
            isAdmin: !!other.isAdmin,
        });
    });

    const rogueManager = game.rogueTankManager;
    if (rogueManager && Array.isArray(rogueManager.tanks)) {
        rogueManager.tanks.forEach((tank, index) => {
            if (!tank || !tank.offset) {
                return;
            }
            const rogueX = toFiniteNumber(tank.offset.x, null);
            const rogueY = toFiniteNumber(tank.offset.y, null);
            if (!Number.isFinite(rogueX) || !Number.isFinite(rogueY)) {
                return;
            }
            pushSprite({
                id: tank.id || `rogue_${index}`,
                city: null,
                offsetX: rogueX,
                offsetY: rogueY,
                health: toFiniteNumber(tank.health, null),
                radarType: 'rogue',
            });
        });
    }

    for (let i = usedSprites.length; i < pool.length; i += 1) {
        pool[i].visible = false;
    }

    radarState.pointsLayer.visible = usedSprites.length > 0;
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

var drawFinance = (game, stage) => {
    if (!game.player.isMayor) {
        return;
    }
    const cityIndex = game.player.city ?? 0;
    const city = game.cities?.[cityIndex];
    if (!city) {
        return;
    }

    const boxTexture = game.textures['imgMoneyBox'];
    if (boxTexture) {
        const moneyBox = new PIXI.Sprite(boxTexture);
        moneyBox.x = game.maxMapX + 2;
        moneyBox.y = 224;
        stage.addChild(moneyBox);
    }

    const gross = getGrossIncome(city);
    const iconKey = gross < 0 ? 'imgMoneyDown' : 'imgMoneyUp';
    const iconTexture = game.textures[iconKey];
    if (iconTexture) {
        const indicator = new PIXI.Sprite(iconTexture);
        indicator.x = game.maxMapX + 8;
        indicator.y = 225;
        stage.addChild(indicator);
    }

    const cashText = new PIXI.Text(formatCash(city.cash ?? 0), {
        fontFamily: 'Arial',
        fontSize: 13,
        fontWeight: 'bold',
        fill: gross < 0 ? 0xE74C3C : 0x2ECC71,
        stroke: 0x000000,
        strokeThickness: 2,
    });
    cashText.x = game.maxMapX + 21;
    cashText.y = 226;
    stage.addChild(cashText);

    const scoreValue = Number.isFinite(city.score) ? city.score : parseInt(city.score, 10) || 0;
    const scoreText = new PIXI.Text(`Score: ${scoreValue}`, {
        fontFamily: 'Arial',
        fontSize: 12,
        fill: 0xFDFEFE,
        stroke: 0x000000,
        strokeThickness: 2,
    });
    scoreText.x = game.maxMapX + 21;
    scoreText.y = 244;
    stage.addChild(scoreText);

    const orbCount = Number.isFinite(city.orbs) ? city.orbs : parseInt(city.orbs, 10) || 0;
    const orbText = new PIXI.Text(`Orbs: ${orbCount}`, {
        fontFamily: 'Arial',
        fontSize: 12,
        fill: 0xFDFEFE,
        stroke: 0x000000,
        strokeThickness: 2,
    });
    orbText.x = game.maxMapX + 21;
    orbText.y = 258;
    stage.addChild(orbText);
};

var drawItems = (game, stage) => {
    var icon = game.iconFactory.getHead();


    var x = 0;
    var y = 0;
    while (icon) {

        if (icon.owner == game.player.id) {


            let frameX = icon.type * 32;
            let frameY = 0;
            if (icon.type === ITEM_TYPE_BOMB && icon.armed) {
                frameX = 152;
                frameY = 89;
            }

            var tmpText = new PIXI.Texture(
                game.textures['imageItems'].baseTexture,
                new PIXI.Rectangle(frameX, frameY, 32, 32)
            );

            var iconSprite = new PIXI.Sprite(tmpText);


            const slot = resolveSlotPosition(icon.type, 7, 267);
            x = game.maxMapX + slot.x;
            y = slot.y;

            if (icon.selected) {
                var selected = new PIXI.Sprite(game.textures['imageInventorySelection']);
                selected.x = x;
                selected.y = y;
                stage.addChild(selected);
            }

            iconSprite.x = x;
            iconSprite.y = y;

            iconSprite.interactive = true;
            iconSprite.buttonMode = true;

            const iconClosure = icon;
            iconSprite.on('mousedown', (event) => {
                console.log("selecting item")
                event.stopPropagation();
                console.log("selecting item")
                game.iconFactory.toggleSelected(iconClosure);
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
                qtyText.x = x + 22;
                qtyText.y = y + 12;
                stage.addChild(qtyText);
            }

        }
        icon = icon.next;
    }
};

const drawPanelMessages = (game, stage) => {
    if (!game || !stage) {
        return;
    }
    const panelState = game.panelState || {};
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
        drawFinance(game, panelContainer);
        drawHealth(game, panelContainer);
        drawItems(game, panelContainer);
        drawPanelMessages(game, panelContainer);
        attachPanelButtons(game, panelContainer);
    }

    const radarState = ensureRadarState(game, panelContainer);
    updateRadar(game, radarState);
};
