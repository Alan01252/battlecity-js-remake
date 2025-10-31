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

var drawMayorIndicator = (game, stage) => {
    if (!game.player.isMayor) {
        return;
    }

    const badgeContainer = new PIXI.Container();
    const badge = new PIXI.Graphics();
    badge.beginFill(0xF1C40F)
        .lineStyle(2, 0x9C6400)
        .drawCircle(0, 0, 18)
        .endFill();
    badgeContainer.addChild(badge);

    const innerText = new PIXI.Text('M', {
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fontSize: 18,
        fill: 0x1B2631,
    });
    innerText.anchor.set(0.5);
    badgeContainer.addChild(innerText);

    badgeContainer.x = game.maxMapX + 155;
    badgeContainer.y = 80;
    stage.addChild(badgeContainer);

    const label = new PIXI.Text('Mayor', {
        fontFamily: 'Arial',
        fontSize: 12,
        fill: 0xFDFEFE,
        fontWeight: 'bold',
    });
    label.anchor.set(0.5, 0);
    label.x = badgeContainer.x;
    label.y = badgeContainer.y + 20;
    stage.addChild(label);
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
        drawHealth(game, panelContainer);
        drawItems(game, panelContainer);
        drawMayorIndicator(game, panelContainer);
    }
};
