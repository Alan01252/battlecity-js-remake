import PIXI from '../pixi';

import {LABELS} from "../constants";
import {CAN_BUILD} from "../constants";


var menuContainer = new PIXI.Container();
let activeGhostBuilding = null;
let pointerMoveListener = null;
const tempPointer = new PIXI.Point();


function buildDemolishMenuItem(game) {
    var click = (e) => {
        e.stopPropagation();
        console.log("Setting is demolishing to true");
        game.isDemolishing = true;
        game.stage.cursor = 'demolish';
        if (game.interactionLayer) {
            game.interactionLayer.cursor = 'demolish';
        }
    };

    var tmpText = new PIXI.Texture(
        game.textures['buildingIcons'].baseTexture,
        new PIXI.Rectangle(13 * 16, 0, 16, 16)
    );

    var buildIcon = new PIXI.Sprite(tmpText);
    buildIcon.x = game.buildMenuOffset.x - 16;
    buildIcon.y = game.buildMenuOffset.y;
    buildIcon.interactive = true;
    buildIcon.iconType = 13;
    buildIcon.on('mousedown', click);


    var basicText = new PIXI.Text("Demolish building", {fontSize: 12, fill: 0xFFFFFF});
    basicText.x = game.buildMenuOffset.x;
    basicText.y = game.buildMenuOffset.y;
    basicText.interactive = true;
    basicText.on('mousedown', click);

    menuContainer.addChild(buildIcon);
    menuContainer.addChild(basicText);
}


const clearGhostBuilding = (game) => {
    if (pointerMoveListener && game.interactionLayer) {
        game.interactionLayer.off('pointermove', pointerMoveListener);
        pointerMoveListener = null;
    }
    if (activeGhostBuilding) {
        activeGhostBuilding.destroy();
        activeGhostBuilding = null;
    }
    game.isBuilding = false;
    game.isDragging = false;
    game.showBuildMenu = false;
    menuContainer.visible = false;
    if (game.interactionLayer) {
        game.interactionLayer.cursor = 'cursor';
    }
};

const startGhostBuilding = (game, buildingType, pointerData) => {
    clearGhostBuilding(game);

    game.isBuilding = buildingType;
    game.isDragging = true;
    game.showBuildMenu = false;
    menuContainer.visible = false;

    const tmpText = new PIXI.Texture(
        game.textures['buildings'].baseTexture,
        new PIXI.Rectangle(0, parseInt(game.isBuilding / 100) * 144, 144, 144)
    );

    const building = new PIXI.Sprite(tmpText);
    building.alpha = 0.5;
    building.interactive = false;
    building.buttonMode = false;

    game.stage.addChild(building);
    activeGhostBuilding = building;

    const updatePosition = (interactionData) => {
        let global;
        if (interactionData && interactionData.global) {
            global = interactionData.global;
        } else if (game.app && game.app.renderer && game.app.renderer.plugins && game.app.renderer.plugins.interaction) {
            const interaction = game.app.renderer.plugins.interaction;
            const pointer = interaction.pointer || interaction.mouse;
            if (pointer && pointer.global) {
                global = pointer.global;
            }
        }

        if (!global) {
            return;
        }

        tempPointer.copyFrom(global);
        const newPosition = building.parent.toLocal(tempPointer);
        building.position.copyFrom(newPosition);
    };

    if (game.interactionLayer) {
        pointerMoveListener = (event) => updatePosition(event.data);
        game.interactionLayer.on('pointermove', pointerMoveListener);
        game.interactionLayer.cursor = 'pointer';
    }

    updatePosition(pointerData);
};


export const setupBuildingMenu = (game) => {


    if (game.forceDraw) {

        menuContainer.removeChildren();


        var canBuild = game.cities[game.player.city].canBuild;
        var canBuildList = Object.keys(canBuild);


        var y = 1;

        canBuildList.forEach((id) => {
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

        buildDemolishMenuItem(game);

        y = 1;
        canBuildList.forEach((id, index) => {

            if (canBuild[id] == CAN_BUILD) {
                var buildingType = LABELS[id].TYPE;


                var click = (e) => {
                    e.stopPropagation();
                    startGhostBuilding(game, buildingType, e.data);
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
    game.clearGhostBuilding = () => clearGhostBuilding(game);
    game.startGhostBuilding = (type, data) => startGhostBuilding(game, type, data);
};

function addBuilding(game) {

    if (game.isBuilding && !activeGhostBuilding) {
        startGhostBuilding(game, game.isBuilding, null);
    }
}

export const drawBuilding = (game) => {


    if (!game.isDragging && !game.isDemolishing) {
        menuContainer.visible = game.showBuildMenu;
    }

    addBuilding(game);

};
