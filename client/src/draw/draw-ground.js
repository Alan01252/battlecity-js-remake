var minX = 0;
var maxX = 0;
var minY = 0;
var maxY = 0;


export const drawGround = (game, groundTiles) => {


    var groundOffsetX = game.player.offset.x % 128; // Number of tank tiles on x axis
    var groundOffsetY = game.player.offset.y % 128; // Number of tank tiles on y axis

    if (game.player.offset.x / 128 > maxX
        || game.player.offset.x / 128 < minX
        || game.player.offset.y / 128 > maxY
        || game.player.offset.y / 128 < minY
    ) {
        minX = (game.player.offset.x / 128) - 5;
        maxX = (game.player.offset.x / 128) + 5;
        minY = (game.player.offset.y / 128) - 5;
        maxY = (game.player.offset.y / 128) + 5;
        groundTiles.clear();
        for (var i = -12; i < 12; i++) {
            for (var j = -12; j < 12; j++) {
                groundTiles.addFrame(game.textures["groundTexture"], i * 128, j * 128);
            }
        }

        groundTiles.position.set(game.player.defaultOffset.x + game.player.offset.x - groundOffsetX, game.player.defaultOffset.y + game.player.offset.y - groundOffsetY);
    }
    groundTiles.pivot.set(game.player.offset.x, game.player.offset.y)
};
