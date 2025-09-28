import PIXI from '../pixi';

const MAYOR_BADGE_RADIUS = 9;

const createMayorBadge = () => {
    const container = new PIXI.Container();
    const circle = new PIXI.Graphics();
    circle.beginFill(0xF1C40F)
        .lineStyle(2, 0x9C6400)
        .drawCircle(0, 0, MAYOR_BADGE_RADIUS)
        .endFill();
    container.addChild(circle);

    const label = new PIXI.Text('M', {
        fontFamily: 'Arial',
        fontSize: 12,
        fontWeight: 'bold',
        fill: 0x1B2631,
    });
    label.anchor.set(0.5);
    container.addChild(label);

    return container;
};

const maybeAddMayorBadge = (player, sprite) => {
    if (!player || !player.isMayor) {
        return;
    }
    const badge = createMayorBadge();
    badge.x = sprite.width / 2;
    badge.y = -MAYOR_BADGE_RADIUS - 4;
    sprite.addChild(badge);
};

const getTankRow = (player, me) => {
    if (!player) {
        return 0;
    }

    const isMayor = !!player.isMayor;
    const hasCustomTank = typeof player.tank === 'number';

    if (hasCustomTank) {
        return player.tank;
    }

    if (me && player.id === me.id) {
        return isMayor ? 1 : 0;
    }

    const sameCity = me && player.city !== undefined ? player.city === me.city : true;

    if (sameCity) {
        return isMayor ? 1 : 0;
    }

    return isMayor ? 3 : 2;
};

const createTankSprite = (game, player, me) => {
    const direction = player?.direction || 0;
    const row = getTankRow(player, me);
    const texture = new PIXI.Texture(
        game.textures['tankTexture'].baseTexture,
        new PIXI.Rectangle(Math.floor(direction / 2) * 48, row * 48, 48, 48)
    );
    return new PIXI.Sprite(texture);
};

var drawPlayer = (game, stage) => {

    var playerTank = createTankSprite(game, game.player, game.player);
    playerTank.x = game.player.defaultOffset.x;
    playerTank.y = game.player.defaultOffset.y;

    maybeAddMayorBadge(game.player, playerTank);

    stage.addChild(playerTank);
};

var drawOtherPlayers = (game, stage) => {


    Object.keys(game.otherPlayers).forEach((id) => {

        var player = game.otherPlayers[id];

        var playerTank = createTankSprite(game, player, game.player);


        playerTank.x = ((player.offset.x) + (game.player.defaultOffset.x - (game.player.offset.x / 48) * 48));
        playerTank.y = ((player.offset.y) + (game.player.defaultOffset.y - (game.player.offset.y / 48) * 48));


        maybeAddMayorBadge(player, playerTank);


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
        sprite.x = ((bullet.x) + (game.player.defaultOffset.x - (game.player.offset.x)));
        sprite.y = ((bullet.y) + (game.player.defaultOffset.y - game.player.offset.y));


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
