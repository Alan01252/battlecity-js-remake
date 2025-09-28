import PIXI from '../pixi';
import { MAP_SQUARE_BUILDING } from '../constants';

export const setupMouseInputs = (game) => {

    let gameArea = new PIXI.Container();
    gameArea.hitArea = new PIXI.Rectangle(0, 0, game.maxMapX, game.maxMapY);

    gameArea.interactive = true;
    gameArea.cursor = 'cursor';
    game.stage.addChild(gameArea);
    game.interactionLayer = gameArea;

    gameArea.on('mousedown', (event) => {
        console.log("Got mouse down event");
        if (game.isBuilding && game.isDragging) {
            var offTileXBuild = Math.floor(game.player.offset.x % 48);
            var offTileYBuild = Math.floor(game.player.offset.y % 48);
            var placeX = Math.floor((game.player.offset.x - game.player.defaultOffset.x + offTileXBuild + event.data.global.x) / 48);
            var placeY = Math.floor((game.player.offset.y - game.player.defaultOffset.y + offTileYBuild + event.data.global.y) / 48);

            if (game.buildingFactory.newBuilding(game.player.id, placeX, placeY, game.isBuilding)) {
                game.map[placeX][placeY] = MAP_SQUARE_BUILDING;
                game.tiles[placeX][placeY] = game.isBuilding;
                game.forceDraw = true;
                if (game.clearGhostBuilding) {
                    game.clearGhostBuilding();
                }
            }
            return;
        }

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
            game.interactionLayer.cursor = 'cursor';
        }
    });

    gameArea.on('rightdown', (event) => {
        if (event.stopPropagation) {
            event.stopPropagation();
        }
        if (event.data && event.data.originalEvent && event.data.originalEvent.preventDefault) {
            event.data.originalEvent.preventDefault();
        }
        if (game.isBuilding && game.clearGhostBuilding) {
            game.clearGhostBuilding();
        }
        if (game.isDemolishing) {
            game.isDemolishing = false;
            game.stage.cursor = 'cursor';
            game.interactionLayer.cursor = 'cursor';
        }
    });

    if (typeof window !== 'undefined') {
        if (!window.__battlecityContextMenuHandler) {
            window.__battlecityContextMenuHandler = (e) => {
                const gameElement = document.getElementById('game');
                if (gameElement && gameElement.contains(e.target)) {
                    e.preventDefault();
                }
            };
            window.addEventListener('contextmenu', window.__battlecityContextMenuHandler);
        }
    }
};
