import {MAP_SQUARE_BUILDING} from "../constants";
import {LABELS} from "../constants";
import {CAN_BUILD_HOUSE} from "../constants";
import {HAS_BUILT} from "../constants";
import {CAN_BUILD} from "../constants";

import _ from '../../node_modules/underscore/underscore-min'
import {DEPENDENCY_TREE} from "../constants";

var menuContainer = new PIXI.Container();

var unflatten = function (array, parent, tree) {

    tree = typeof tree !== 'undefined' ? tree : [];
    parent = typeof parent !== 'undefined' ? parent : {id: 0};

    var children = _.filter(array, function (child) {
        return child.parentid == parent.id;
    });

    if (!_.isEmpty(children)) {
        if (parent.id == 0) {
            tree = children;
        } else {
            parent['children'] = children;
        }
        _.each(children, function (child) {
            unflatten(array, child)
        });
    }

    return tree;
};

function searchTree(element, matchingId) {
    if (element.id == matchingId) {
        return element;
    } else if (element.children != null) {
        var i;
        var result = null;
        for (i = 0; result == null && i < element.children.length; i++) {
            result = searchTree(element.children[i], matchingId);
        }
        return result;
    }
    return null;
}


var dependencyTree = unflatten(DEPENDENCY_TREE);

export const setupBuildingMenu = (game) => {


    if (game.forceDraw) {

        menuContainer.removeChildren();


        var canBuild = game.player.city.canBuild;


        var canBuildList = Object.keys(game.player.city.canBuild);


        var y = 0;
        canBuildList.forEach((id, index) => {
            if (canBuild[id] == CAN_BUILD) {
                y++
            }
        });


        var graphics = new PIXI.Graphics();
        graphics.lineStyle(2, 0x00000, 0);
        graphics.beginFill(0x000000, 1);
        graphics.drawRect(game.buildMenuOffset.x, game.buildMenuOffset.y, 180, y * 16);
        graphics.endFill();
        menuContainer.addChild(graphics);

        y = 0;
        canBuildList.forEach((id, index) => {

            if (canBuild[id] == CAN_BUILD) {
                var buildingType = LABELS[id].TYPE;


                var click = () => {
                    game.isBuilding = buildingType;
                };

                var tmpText = new PIXI.Texture(
                    game.textures['buildingIcons'].baseTexture,
                    new PIXI.Rectangle(LABELS[id].ICON * 16, 0, 16, 16)
                );

                var buildIcon = new PIXI.Sprite(tmpText);
                buildIcon.x = game.buildMenuOffset.x - 16;
                buildIcon.y = game.buildMenuOffset.y + (y * 16);
                buildIcon.interactive = true;
                buildIcon.iconType = LABELS[id].IMAGE;
                buildIcon.on('mousedown', click);


                var basicText = new PIXI.Text(LABELS[id].LABEL, {fontSize: 12, fill: 0xFFFFFF});
                basicText.x = game.buildMenuOffset.x;
                basicText.y = game.buildMenuOffset.y + (y * 16);
                basicText.interactive = true;
                basicText.on('mousedown', click);

                menuContainer.addChild(buildIcon);
                menuContainer.addChild(basicText);

                y++;
            }

        });


        menuContainer.visible = false;
    }


    game.stage.addChild(menuContainer);
};

export const drawBuilding = (game) => {


    if (!game.isDragging) {
        menuContainer.visible = game.showBuildMenu;
    }

    if (game.isBuilding && !game.isDragging) {


        game.isDragging = true;
        var tmpText = new PIXI.Texture(
            game.textures['buildings'].baseTexture,
            new PIXI.Rectangle(0, parseInt(game.isBuilding / 100) * 144, 144, 144)
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


            var offTileX = Math.floor(game.player.offset.x % 48);
            var offTileY = Math.floor(game.player.offset.y % 48);
            var x = Math.floor((game.player.offset.x - game.player.defaultOffset.x + offTileX + event.data.global.x) / 48);
            var y = Math.floor((game.player.offset.y - game.player.defaultOffset.y + offTileY + event.data.global.y) / 48);

            if (game.buildingFactory.newBuilding(null, x, y, game.isBuilding)) {
                game.map[x][y] = MAP_SQUARE_BUILDING;
                game.tiles[x][y] = game.isBuilding;


                Object.keys(game.player.city.canBuild).forEach((id) => {

                    var tempId = LABELS[id].TYPE;
                    console.log(tempId + " " + game.isBuilding);
                    if (parseInt(tempId) == game.isBuilding) {

                        if (tempId != CAN_BUILD_HOUSE) {
                            game.player.city.canBuild[id] = HAS_BUILT;
                        }

                        var node = searchTree(dependencyTree[0], tempId);
                        if (node && node.children) {
                            node.children.forEach((item) => {
                                Object.keys(game.player.city.canBuild).forEach((id) => {


                                    if (game.player.city.canBuild[id] !== HAS_BUILT) {
                                        var tempId = LABELS[id].TYPE;
                                        console.log("finding children" + tempId + " " + item.id)
                                        if (parseInt(tempId) == item.id) {
                                            game.player.city.canBuild[id] = CAN_BUILD;
                                        }
                                    }
                                });
                            })
                        }
                    }
                });

            }

            this.data = null;
            game.isBuilding = false;
            game.isDragging = false;
            game.forceDraw = true;
            game.showBuildMenu = false;
            this.dragging = false;
            building.dragging = false;
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
