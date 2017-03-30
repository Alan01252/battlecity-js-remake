export const rectangleCollision = (rect1, rect2) => {
    rect1.w += rect1.x;
    rect1.h += rect1.y;
    rect2.w += rect2.x;
    rect2.h += rect2.y;

    if (rect1.w < rect2.x)
        return false;
    if (rect2.w < rect1.x)
        return false;

    if (rect1.h < rect2.y)
        return false;
    if (rect2.h < rect1.y)
        return false;

    return 1;

};


export const getPlayerRect = (player) => {


    // Gap is because tank image doesn't take up full tile
    var gap = 8;

    return {
        x: parseInt(player.offset.x + gap),
        y: parseInt(player.offset.y + gap),
        w: 48 - gap - gap,
        h: 48 - gap - gap
    };

};
