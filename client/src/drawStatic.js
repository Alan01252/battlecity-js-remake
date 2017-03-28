import {MAX_HEALTH} from "./constants";

import {Graphics} from '../node_modules/pixi.js/dist/pixi.min';
import {Sprite} from '../node_modules/pixi.js/dist/pixi.min';
import {Rectangle} from '../node_modules/pixi.js/dist/pixi.min';

var drawPanel = (game, stage) => {

    var interfaceTop = new Sprite(game.textures["interfaceTop"]);
    interfaceTop.x = game.maxMapX;
    interfaceTop.y = 0;
    stage.addChild(interfaceTop);

    var interfaceBottom = new Sprite(game.textures["interfaceBottom"]);
    interfaceBottom.x = game.maxMapX;
    interfaceBottom.y = 430;
    stage.addChild(interfaceBottom);
};

var drawHealth = (game, stage) => {

    var percent = game.player.health / MAX_HEALTH;


    var tmpText = game.textures['health'].clone();
    var healthPercent = new Rectangle(0, 0, 38, percent * 87);
    tmpText.frame = healthPercent;

    var health = new Sprite(tmpText);
    health.anchor = {x: 1, y: 1};
    health.x = game.maxMapX + (137 + 38);
    health.y = 160 + 87;


    stage.addChild(health);
};




export const drawStatic = (game) => {
    drawPanel(game, game.objectContainer);
    drawHealth(game, game.objectContainer);
};
