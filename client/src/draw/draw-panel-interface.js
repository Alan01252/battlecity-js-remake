import {MAX_HEALTH} from "../constants";
import {ITEM_TYPE_TURRET} from "../constants";

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
    var item = game.itemFactory.getHead();


    while (item) {
        if (item.owner == game.player.id) {


            var tmpText = new PIXI.Texture(
                game.textures['imageItems'].baseTexture,
                new PIXI.Rectangle(item.type * 32, 0, 32, 32)
            );

            console.log("item type" + item.type);
            var icon = new PIXI.Sprite(tmpText);

            switch (item.type) {
                case 9:
                    icon.x = (game.maxMapX + 7);
                    icon.y = 372;
                    break;
            }
            stage.addChild(icon);

        }
        item = item.next;
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
