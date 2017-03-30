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

export const drawItems = (game, itemTiles) => {


    var offTileX = Math.floor(game.player.offset.x % 32);
    var offTileY = Math.floor(game.player.offset.y % 32);


    if (game.forceDraw) {
        itemTiles.clear();

        var foundItems = getItemsWithingRange(game.itemFactory, game.player);
        foundItems.forEach((item, index) => {
            console.log(game.player.offset.x - item.x);
            var tmpText = new PIXI.Texture(
                game.textures['imageItems'].baseTexture,
                new PIXI.Rectangle(item.type * 32, 0, 32, 32)
            );
            itemTiles.addFrame(tmpText, item.x - game.player.offset.x + offTileX, item.y - game.player.offset.y + offTileY);
        });

        itemTiles.position.set(game.player.defaultOffset.x + game.player.offset.x - offTileX, game.player.defaultOffset.y + game.player.offset.y - offTileY);
    }

    itemTiles.pivot.set(game.player.offset.x, game.player.offset.y);
};
