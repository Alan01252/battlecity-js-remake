import {ITEM_TYPE_TURRET} from "../constants";
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

    console.log(foundItems);

    return foundItems
};

var drawTurret = (game, itemTiles, item, offTileX, offTileY) => {
    var tmpText = new PIXI.Texture(
        game.textures['imageTurretBase'].baseTexture,
        new PIXI.Rectangle((item.type - 9) * 48, 0, 48, 48)
    );
    itemTiles.addFrame(tmpText, item.x - game.player.offset.x + offTileX, item.y - game.player.offset.y + offTileY);

    var tmpText = new PIXI.Texture(
        game.textures['imageTurretHead'].baseTexture,
        new PIXI.Rectangle((item.type - 9) * 48, 0, 48, 48)
    );
    itemTiles.addFrame(tmpText, item.x - game.player.offset.x + offTileX, item.y - game.player.offset.y + offTileY);
};

export const drawItems = (game, itemTiles) => {


    var offTileX = Math.floor(game.player.offset.x % 48);
    var offTileY = Math.floor(game.player.offset.y % 48);


    if (game.forceDraw) {
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
    }

    //console.log("Moving item tiles");
    itemTiles.pivot.set(game.player.offset.x, game.player.offset.y);
};
