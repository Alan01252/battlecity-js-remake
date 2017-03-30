import {BUILDING_HOUSE} from "../constants";
import {MAP_SQUARE_BUILDING} from "../constants";


var menuContainer = new PIXI.Container();

export const setupBuildingMenu = (game) => {

    var graphics = new PIXI.Graphics();
    graphics.lineStyle(2, 0x00000, 0);
    graphics.beginFill(0x000000, 1);
    graphics.drawRect(game.buildMenuOffset.x, game.buildMenuOffset.y, 180, 16);
    graphics.endFill();

    var tmpText = new PIXI.Texture(
        game.textures['buildingIcons'].baseTexture,
        new PIXI.Rectangle(0, 0, 16, 16)
    );

    var click = () => {
        console.log("build icon clicked " + buildIcon.iconType);
        game.isBuilding = buildIcon.iconType;
    };

    var buildIcon = new PIXI.Sprite(tmpText);
    buildIcon.x = game.buildMenuOffset.x - 16;
    buildIcon.y = game.buildMenuOffset.y;
    buildIcon.interactive = true;
    buildIcon.iconType = BUILDING_HOUSE;
    buildIcon.on('mousedown', click);


    var basicText = new PIXI.Text('Housing', {fontSize: 12, fill: 0xFFFFFF});
    basicText.x = game.buildMenuOffset.x;
    basicText.y = game.buildMenuOffset.y;
    basicText.interactive = true;
    basicText.on('mousedown', click);

    menuContainer.addChild(graphics);
    menuContainer.addChild(buildIcon);
    menuContainer.addChild(basicText);
    menuContainer.visible = false;


    game.stage.addChild(menuContainer);
};

export const drawBuilding = (game) => {


    menuContainer.visible = game.showBuildMenu;

    if (game.isBuilding && !game.isDragging) {

        game.isDragging = true;
        var tmpText = new PIXI.Texture(
            game.textures['buildings'].baseTexture,
            new PIXI.Rectangle(0, (game.isBuilding) * 144, 144, 144)
        );

        var building = new PIXI.Sprite(tmpText);
        building.x = game.buildMenuOffset.x;
        building.y = game.buildMenuOffset.y;
        building.alpha = 0.5;
        building.interactive = true;
        building.buttonMode = true;

        game.stage.addChild(building);

        building
            .on('pointerdown', onDragStart)
            .on('pointerup', onDragEnd)
            .on('pointerupoutside', onDragEnd)
            .on('pointermove', onDragMove);

        function onDragStart(event) {
            this.data = event.data;
            this.alpha = 0.5;
            this.dragging = true;
        }

        function onDragEnd(event) {
            this.alpha = 1;
            this.dragging = false;
            building.dragging = false;


            var offTileX = Math.floor(game.player.offset.x % 48);
            var offTileY = Math.floor(game.player.offset.y % 48);
            var x = Math.floor((game.player.offset.x - game.player.defaultOffset.x + offTileX + event.data.global.x) / 48);
            var y = Math.floor((game.player.offset.y - game.player.defaultOffset.y + offTileY + event.data.global.y) / 48);

            if (game.buildingFactory.newBuilding(null, x, y, game.isBuilding)) {
                game.map[x][y] = MAP_SQUARE_BUILDING;
                game.tiles[x][y] = game.isBuilding;
            }

            // set the interaction data to null
            this.data = null;

            game.isBuilding = false;
            game.isDragging = false;
            game.forceDraw = true;
            game.showBuildMenu = false;
            building.destroy();

        }

        function onDragMove() {
            if (this.dragging) {
                var newPosition = this.data.getLocalPosition(this.parent);
                this.x = newPosition.x;
                this.y = newPosition.y;
            }
        }

    }


};
