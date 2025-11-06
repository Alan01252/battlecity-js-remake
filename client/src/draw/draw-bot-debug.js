const botWaypoints = {};

export const updateBotWaypoints = (data) => {
    console.log('updateBotWaypoints', data);
    if (data && data.id) {
        botWaypoints[data.id] = data.waypoints;
    }
};

export const drawBotDebug = (game, g) => {
    if (!game || !g) {
        return;
    }

    Object.values(botWaypoints).forEach((waypoints) => {
        if (!waypoints || waypoints.length === 0) {
            return;
        }

        g.lineStyle(2, 0xff0000, 1);
        g.moveTo(waypoints[0].x, waypoints[0].y);
        waypoints.forEach((point, index) => {
            if (index > 0) {
                g.lineTo(point.x, point.y);
            }
            g.drawCircle(point.x, point.y, 5);
        });
    });
};