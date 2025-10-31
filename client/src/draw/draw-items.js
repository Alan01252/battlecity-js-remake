import PIXI from '../pixi';

import {ITEM_TYPE_TURRET} from "../constants";
import {ITEM_TYPE_PLASMA} from "../constants";
import {ITEM_TYPE_WALL} from "../constants";
import {ITEM_TYPE_SLEEPER} from "../constants";
import {ITEM_TYPE_MINE} from "../constants";
import {ITEM_TYPE_BOMB} from "../constants";

var drawTick = 0;

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

var drawTurret = (game, itemTiles, item, offTileX, offTileY) => {
    var tmpText = new PIXI.Texture(
        game.textures['imageTurretBase'].baseTexture,
        new PIXI.Rectangle((item.type - 9) * 48, 0, 48, 48)
    );
    itemTiles.addFrame(tmpText, item.x - game.player.offset.x + offTileX, item.y - game.player.offset.y + offTileY);

    let orientation = 0;
    if (Number.isFinite(item.angle)) {
        orientation = parseInt((item.angle / 22.5) + 1, 10);
    }
    if (orientation >= 16 || orientation < 0) {
        orientation = 0;
    }
    var tmpText = new PIXI.Texture(
        game.textures['imageTurretHead'].baseTexture,
        new PIXI.Rectangle(orientation * 48, (item.type - 9) * 48, 48, 48)
    );
    itemTiles.addFrame(tmpText, item.x - game.player.offset.x + offTileX, item.y - game.player.offset.y + offTileY);
};

var drawMine = (game, itemTiles, item, offTileX, offTileY) => {
    const mineTeam = item.city ?? item.teamId ?? null;
    const playerTeam = game.player?.city ?? null;
    if (item.active && mineTeam !== null && mineTeam !== playerTeam) {
        return;
    }
    var tmpText = new PIXI.Texture(
        game.textures['imageItems'].baseTexture,
        new PIXI.Rectangle(ITEM_TYPE_MINE * 32, 0, 32, 32)
    );
    var drawX = item.x - game.player.offset.x + offTileX + 8;
    var drawY = item.y - game.player.offset.y + offTileY + 8;
    itemTiles.addFrame(tmpText, drawX, drawY);
};

var drawBomb = (game, itemTiles, item, offTileX, offTileY) => {
    const baseTexture = game.textures['imageItems']?.baseTexture;
    if (!baseTexture) {
        return;
    }

    const armed = !!item.active;
    const frame = armed
        ? new PIXI.Rectangle(144, 91, 48, 48)
        : new PIXI.Rectangle(ITEM_TYPE_BOMB * 48, 42, 48, 48);

    const texture = new PIXI.Texture(baseTexture, frame);
    const drawX = item.x - game.player.offset.x + offTileX;
    const drawY = item.y - game.player.offset.y + offTileY;
    itemTiles.addFrame(texture, drawX, drawY);
};

const drawWall = (game, itemTiles, item, offTileX, offTileY) => {
    const baseTexture = game.textures['imageItems']?.baseTexture;
    if (!baseTexture) {
        return;
    }
    const texture = new PIXI.Texture(
        baseTexture,
        new PIXI.Rectangle(ITEM_TYPE_WALL * 48, 42, 48, 48)
    );
    const drawX = item.x - game.player.offset.x + offTileX;
    const drawY = item.y - game.player.offset.y + offTileY;
    itemTiles.addFrame(texture, drawX, drawY);
};

const drawSleeper = (game, itemTiles, item, offTileX, offTileY) => {
    const itemTeam = item.city ?? item.teamId ?? null;
    const playerTeam = game.player?.city ?? null;
    const isFriendly = itemTeam === null || playerTeam === null || itemTeam === playerTeam;
    if (!isFriendly && !item.target) {
        return;
    }
    drawTurret(game, itemTiles, item, offTileX, offTileY);
};

const drawGenericItem = (game, itemTiles, item, offTileX, offTileY) => {
    const baseTexture = game.textures['imageItems']?.baseTexture;
    if (!baseTexture) {
        return;
    }
    const frameX = item.type * 48;
    const texture = new PIXI.Texture(
        baseTexture,
        new PIXI.Rectangle(frameX, 42, 48, 48)
    );
    const drawX = item.x - game.player.offset.x + offTileX;
    const drawY = item.y - game.player.offset.y + offTileY;
    itemTiles.addFrame(texture, drawX, drawY);
};

const rendererMap = {
    [ITEM_TYPE_TURRET]: drawTurret,
    [ITEM_TYPE_PLASMA]: drawTurret,
    [ITEM_TYPE_SLEEPER]: drawSleeper,
    [ITEM_TYPE_WALL]: drawWall,
    [ITEM_TYPE_MINE]: drawMine,
    [ITEM_TYPE_BOMB]: drawBomb,
};

export const drawItems = (game, itemTiles) => {


    var offTileX = Math.floor(game.player.offset.x % 48);
    var offTileY = Math.floor(game.player.offset.y % 48);

    if (game.tick > drawTick) {

        drawTick = game.tick + 200;
        itemTiles.clear();

        var foundItems = getItemsWithingRange(game.itemFactory, game.player);

        foundItems.forEach((item, index) => {
            switch (item.type) {
                default: {
                    const renderer = rendererMap[item.type];
                    if (renderer) {
                        renderer(game, itemTiles, item, offTileX, offTileY);
                    } else {
                        drawGenericItem(game, itemTiles, item, offTileX, offTileY);
                    }
                    break;
                }
            }

        });

        itemTiles.position.set(game.player.defaultOffset.x + game.player.offset.x - offTileX, game.player.defaultOffset.y + game.player.offset.y - offTileY);

        //console.log("Moving item tiles");
    }

    itemTiles.pivot.set(game.player.offset.x, game.player.offset.y);
};
