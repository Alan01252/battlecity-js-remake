export const setupMouseInputs = (game) => {

    let gameArea = new PIXI.Container();
    gameArea.hitArea = new PIXI.Rectangle(0, 0, game.maxMapX, game.maxMapY);

    gameArea.interactive = true;
    gameArea.cursor = 'cursor';
    game.stage.addChild(gameArea);

    gameArea.on('mousedown', (event) => {
        console.log("Got mouse down event");
        if (!game.isDemolishing) {
            game.showBuildMenu = !game.showBuildMenu;
            game.forceDraw = true;
            game.buildMenuOffset = {
                x: event.data.global.x,
                y: event.data.global.y
            }
        }
        if (game.isDemolishing) {
            console.log("Trying to demolish building");
            var offTileX = Math.floor(game.player.offset.x % 48);
            var offTileY = Math.floor(game.player.offset.y % 48);
            var x = Math.floor((game.player.offset.x - game.player.defaultOffset.x + offTileX + event.data.global.x) / 48);
            var y = Math.floor((game.player.offset.y - game.player.defaultOffset.y + offTileY + event.data.global.y) / 48);

            game.buildingFactory.demolishBuilding(x, y);

            game.isDemolishing = false;
            game.stage.cursor = 'cursor';
        }
    });
};