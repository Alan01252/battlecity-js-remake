import PIXI from '../pixi';

import {ITEM_TYPE_TURRET} from "../constants";

var drawTick = 0;

var getItemsWithingRange = function (itemFactory, player) {

    var item = itemFactory.getHead();
    var range = 40 * 48;
    var foundItems = [];
    while (item) {

        if (item.x > (player.offset.x - range)
            && item.x < (player.offset.x + range)
            && item.y > (player.offset.y - range)
            && item.y < (player.offset.y + range)
        ) {
            foundItems.push(item)
        }
        item = item.next;
    }

    return foundItems
};

var drawTurret = (game, itemTiles, item, offTileX, offTileY) => {
    var tmpText = new PIXI.Texture(
        game.textures['imageTurretBase'].baseTexture,
        new PIXI.Rectangle((item.type - 9) * 48, 0, 48, 48)
    );
    itemTiles.addFrame(tmpText, item.x - game.player.offset.x + offTileX, item.y - game.player.offset.y + offTileY);

    var orientation = parseInt((item.angle / 22.5) + 1);
    if (orientation == 16) {
        orientation = 0;
    }
    var tmpText = new PIXI.Texture(
        game.textures['imageTurretHead'].baseTexture,
        new PIXI.Rectangle(orientation * 48, (item.type - 9) * 48, 48, 48)
    );
    itemTiles.addFrame(tmpText, item.x - game.player.offset.x + offTileX, item.y - game.player.offset.y + offTileY);
};

export const drawItems = (game, itemTiles) => {


    var offTileX = Math.floor(game.player.offset.x % 48);
    var offTileY = Math.floor(game.player.offset.y % 48);

    if (game.tick > drawTick) {

        drawTick = game.tick + 200;
        itemTiles.clear();

        var foundItems = getItemsWithingRange(game.itemFactory, game.player);

        foundItems.forEach((item, index) => {
            switch (item.type) {
                case ITEM_TYPE_TURRET:
                    drawTurret(game, itemTiles, item, offTileX, offTileY);
                    break;
            }

        });

        itemTiles.position.set(game.player.defaultOffset.x + game.player.offset.x - offTileX, game.player.defaultOffset.y + game.player.offset.y - offTileY);

        //console.log("Moving item tiles");
    }

    itemTiles.pivot.set(game.player.offset.x, game.player.offset.y);
};
