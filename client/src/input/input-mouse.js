
export const setupMouseInputs = (game) => {

    game.stage.hitArea = new PIXI.Rectangle(0, 0, game.maxMapX, game.maxMapY);

    game.stage.interactive = true;
    game.stage.buttonMode = true;

    game.stage.on('mousedown', (event) => {
        console.log("mouse click");
        console.log(event.data.global.x);
        game.showBuildMenu = !game.showBuildMenu;
        game.forceDraw = true;
        console.log(game.showBuildMenu);
        game.buildMenuOffset = {
            x: event.data.global.x,
            y: event.data.global.y
        }
    });
};