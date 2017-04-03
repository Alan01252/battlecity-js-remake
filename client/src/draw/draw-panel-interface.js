import {MAX_HEALTH} from "../constants";
import {ITEM_TYPE_TURRET} from "../constants";
import {ITEM_TYPE_LASER} from "../constants";
import {ITEM_TYPE_MINE} from "../constants";
import {ITEM_TYPE_MEDKIT} from "../constants";
import {ITEM_TYPE_ROCKET} from "../constants";
import {ITEM_TYPE_BOMB} from "../constants";

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


            var tmpText = new PIXI.Texture(
                game.textures['imageItems'].baseTexture,
                new PIXI.Rectangle(icon.type * 32, 0, 32, 32)
            );

            var iconSprite = new PIXI.Sprite(tmpText);


            switch (icon.type) {
                case ITEM_TYPE_TURRET:
                    x = game.maxMapX + 7;
                    y = 372;
                    break;
                case ITEM_TYPE_LASER:
                    x = game.maxMapX + 7;
                    y = 267;
                    break;
                case ITEM_TYPE_ROCKET:
                    x = game.maxMapX + 42;
                    y = 267;
                    break;
                case ITEM_TYPE_MEDKIT:
                    x = game.maxMapX + 77;
                    y = 267;
                    break;
                case ITEM_TYPE_BOMB:
                    x = game.maxMapX + 7;
                    y = 302;
                    break;
                case ITEM_TYPE_MINE:
                    x = game.maxMapX + 42;
                    y = 302;
                    break;
            }

            if (icon.selected) {
                var selected = new PIXI.Sprite(game.textures['imageInventorySelection']);
                selected.x = x;
                selected.y = y;
                stage.addChild(selected);
            }

            iconSprite.x = x;
            iconSprite.y = y;

            iconSprite.interactive = true;

            const iconClosure = icon;
            iconSprite.on('mousedown', (event) => {
                event.stopPropagation();
                console.log("selecting item")
                game.iconFactory.toggleSelected(iconClosure);
                game.forceDraw = true;
            });
            stage.addChild(iconSprite);

        }
        icon = icon.next;
    }
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
        drawItems(game, panelContainer)
    }
};
