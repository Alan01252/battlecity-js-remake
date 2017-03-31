import {MAX_HEALTH} from "../constants";


var drawPlayer = (game, stage) => {

    var tmpText = new PIXI.Texture(
        game.textures['tankTexture'].baseTexture,
        new PIXI.Rectangle(Math.floor(game.player.direction / 2) * 48, 0, 48, 48)
    );
    var playerTank = new PIXI.Sprite(tmpText);
    playerTank.x = game.player.defaultOffset.x;
    playerTank.y = game.player.defaultOffset.y;

    stage.addChild(playerTank);
};

var drawOtherPlayers = (game, stage) => {


    Object.keys(game.otherPlayers).forEach((id) => {

        var player = game.otherPlayers[id];

        var tmpText = game.textures['tankTexture'].clone();
        var tankRect = new PIXI.Rectangle(Math.floor((player.direction / 2)) * 48, 48 * 2, 48, 48);
        tmpText.frame = tankRect;
        var playerTank = new PIXI.Sprite(tmpText);


        playerTank.x = ((player.offset.x) + (game.player.defaultOffset.x - (game.player.offset.x / 48) * 48));
        playerTank.y = ((player.offset.y) + (game.player.defaultOffset.y - (game.player.offset.y / 48) * 48));


        stage.addChild(playerTank);
    });
};

var drawBullets = (game, stage) => {
    var bullet = game.bulletFactory.getHead();


    while (bullet) {

        var tmpText = game.textures['bulletTexture'].clone();
        var bulletRect = new PIXI.Rectangle(bullet.animation * 8, 0, 8, 8);
        tmpText.frame = bulletRect;

        var sprite = new PIXI.Sprite(tmpText);
        sprite.x = ((bullet.x + 48) + (game.player.defaultOffset.x - (game.player.offset.x)));
        sprite.y = ((bullet.y + 48) + (game.player.defaultOffset.y - game.player.offset.y));
        sprite.anchor = {x: 1, y: 1};


        bullet.animation++;
        if (bullet.animation > 3) {
            bullet.animation = 0;
        }

        stage.addChild(sprite);

        bullet = bullet.next;
    }
};



export const drawChanging = (game) => {


    game.objectContainer.removeChildren();

    drawPlayer(game, game.objectContainer);
    drawOtherPlayers(game, game.objectContainer);
    drawBullets(game, game.objectContainer);
};
