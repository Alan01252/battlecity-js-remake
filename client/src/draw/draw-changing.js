import PIXI from '../pixi';
import { getCityDisplayName } from '../utils/citySpawns';

const EXPLOSION_VARIANTS = {
    small: {
        frameSize: 48,
        totalFrames: 10,
        duration: 100,
        textureKey: 'imageSExplosion',
        fallbackKey: 'imageLEExplosion'
    },
    large: {
        frameSize: 144,
        totalFrames: 8,
        duration: 90,
        textureKey: 'imageLEExplosion',
        fallbackKey: 'imageSExplosion'
    }
};
const EXPLOSION_FRAME_DURATION = 100;
const MAYOR_BADGE_OFFSET_Y = 8;
const MAYOR_FRIENDLY_COLOR = 0x1E5AAF;
const MAYOR_ENEMY_COLOR = 0xE74C3C;

const createMayorBadge = (cityId, isAlly) => {
    const container = new PIXI.Container();
    const cityName = getCityDisplayName(cityId);
    const label = new PIXI.Text(`Mayor of ${cityName}`, {
        fontFamily: 'Arial',
        fontSize: 12,
        fontWeight: 'bold',
        fill: isAlly ? MAYOR_FRIENDLY_COLOR : MAYOR_ENEMY_COLOR,
        align: 'center',
        stroke: 0x000000,
        strokeThickness: 2
    });
    label.anchor.set(0.5, 0);
    container.addChild(label);
    return container;
};

const maybeAddMayorBadge = (player, sprite, referenceCity) => {
    if (!player || !player.isMayor) {
        return;
    }
    const isAlly = referenceCity === undefined ? true : player.city === referenceCity;
    const badge = createMayorBadge(player.city, isAlly);
    badge.x = sprite.width / 2;
    badge.y = -sprite.height / 2 - MAYOR_BADGE_OFFSET_Y;
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

    maybeAddMayorBadge(game.player, playerTank, game.player.city);

    stage.addChild(playerTank);
};

var drawOtherPlayers = (game, stage) => {


    Object.keys(game.otherPlayers).forEach((id) => {

        var player = game.otherPlayers[id];

        if (!player) {
            return;
        }

        if (player.isCloaked) {
            const myId = game.player?.id;
            const sameCity = (player.city ?? null) === (game.player?.city ?? null);
            if (id !== myId && !sameCity) {
                return;
            }
        }

        var playerTank = createTankSprite(game, player, game.player);


        playerTank.x = ((player.offset.x) + (game.player.defaultOffset.x - (game.player.offset.x / 48) * 48));
        playerTank.y = ((player.offset.y) + (game.player.defaultOffset.y - (game.player.offset.y / 48) * 48));


        maybeAddMayorBadge(player, playerTank, game.player.city);


        stage.addChild(playerTank);
    });
};

const drawRogueTanks = (game, stage) => {
    const manager = game.rogueTankManager;
    if (!manager || !Array.isArray(manager.tanks) || manager.tanks.length === 0) {
        return;
    }

    manager.tanks.forEach((tank) => {
        if (!tank || !tank.offset) {
            return;
        }

        const sprite = createTankSprite(game, tank, game.player);
        sprite.x = (tank.offset.x) + (game.player.defaultOffset.x - (game.player.offset.x / 48) * 48);
        sprite.y = (tank.offset.y) + (game.player.defaultOffset.y - (game.player.offset.y / 48) * 48);
        stage.addChild(sprite);
    });
};

var drawBullets = (game, stage) => {
    var bullet = game.bulletFactory.getHead();


    while (bullet) {

        var tmpText = game.textures['bulletTexture'].clone();
        var spriteRow = bullet && Number.isFinite(bullet.type) ? bullet.type : 0;
        if (spriteRow < 0) {
            spriteRow = 0;
        }
        var bulletRect = new PIXI.Rectangle(bullet.animation * 8, spriteRow * 8, 8, 8);
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

const drawExplosions = (game, stage) => {
    if (!Array.isArray(game.explosions) || game.explosions.length === 0) {
        return;
    }
    const now = game.tick || Date.now();
    for (let i = game.explosions.length - 1; i >= 0; i--) {
        const explosion = game.explosions[i];
        if (!explosion) {
            game.explosions.splice(i, 1);
            continue;
        }
        const variantKey = explosion.variant || 'large';
        const variant = EXPLOSION_VARIANTS[variantKey] || EXPLOSION_VARIANTS.large;
        const texture = game.textures[variant.textureKey] || game.textures[variant.fallbackKey];
        if (!texture || !texture.baseTexture) {
            continue;
        }
        const frameSize = variant.frameSize;
        const totalFrames = variant.totalFrames;
        const frameDuration = variant.duration ?? EXPLOSION_FRAME_DURATION;
        const framesPerRow = Math.max(1, Math.floor(texture.baseTexture.width / frameSize));
        const rows = Math.max(1, Math.floor(texture.baseTexture.height / frameSize));
        const availableFrames = Math.min(totalFrames, framesPerRow * rows);
        if (availableFrames <= 0) {
            continue;
        }
        if (!explosion.nextFrameTick) {
            explosion.nextFrameTick = now + frameDuration;
        } else if (now >= explosion.nextFrameTick) {
            explosion.frame = (explosion.frame || 0) + 1;
            explosion.nextFrameTick = now + frameDuration;
        }

        if ((explosion.frame || 0) >= availableFrames) {
            game.explosions.splice(i, 1);
            continue;
        }

        const frameIndex = Math.max(0, explosion.frame || 0);
        const spriteTexture = new PIXI.Texture(
            texture.baseTexture,
            new PIXI.Rectangle(
                (frameIndex % framesPerRow) * frameSize,
                Math.floor(frameIndex / framesPerRow) * frameSize,
                frameSize,
                frameSize
            )
        );

        const sprite = new PIXI.Sprite(spriteTexture);
        const offsetX = game.player.defaultOffset.x - game.player.offset.x;
        const offsetY = game.player.defaultOffset.y - game.player.offset.y;

        sprite.x = (explosion.x || 0) + offsetX;
        sprite.y = (explosion.y || 0) + offsetY;

        stage.addChild(sprite);
    }
};


export const drawChanging = (game) => {


    game.objectContainer.removeChildren();

    drawPlayer(game, game.objectContainer);
    drawOtherPlayers(game, game.objectContainer);
    drawRogueTanks(game, game.objectContainer);
    drawBullets(game, game.objectContainer);
    drawExplosions(game, game.objectContainer);
};
