import { io } from 'socket.io-client';
import { EventEmitter2 } from 'eventemitter2';

class SocketListener extends EventEmitter2 {

    constructor(game) {
        super();
        this.game = game
    }

    listen() {
        this.io = io("http://localhost:8021", {
            transports: ['websocket']
        });
        this.io.on("connect", () => {
            console.log("connected");
            this.emit("connected");
        });
        this.io.on("connect_error", (err) => {
            console.error("socket connect_error", err?.message ?? err);
        });
        this.io.on("disconnect", (reason) => {
            console.warn("socket disconnected", reason);
        });

        this.io.on("enter_game", (player) => {
            var player = JSON.parse(player);
            player.city = player.city ?? 0;
            player.isMayor = !!player.isMayor;
            console.log("Player entered game");
            console.log(player);
            this.game.otherPlayers[player.id] = player;
        });

        this.io.on("player", (player) => {
            var player = JSON.parse(player);
            player.city = player.city ?? 0;
            player.isMayor = !!player.isMayor;
            this.game.otherPlayers[player.id] = player;
        });

        this.io.on("bullet_shot", (bullet) => {
            var bullet = JSON.parse(bullet);
            this.game.bulletFactory.newBullet(bullet.shooter, bullet.x, bullet.y, bullet.type, bullet.angle, bullet.team ?? null)
        });

        this.io.on("new_icon", (icon) => {
            var icon = JSON.parse(icon);
            this.game.iconFactory.newIcon(null, icon.x, icon.y, icon.type)
        });

        this.io.on("new_building", (payload) => {
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                if (data) {
                    data.type = Number(data.type);
                    data.population = data.population || 0;
                    data.ownerId = data.ownerId || data.owner || null;
                    data.attachedHouseId = data.attachedHouseId ?? null;
                    data.city = data.city ?? 0;
                    data.itemsLeft = data.itemsLeft || 0;
                    data.smokeActive = !!data.smokeActive;
                    data.smokeFrame = data.smokeFrame || 0;
                }
                this.emit('building:new', data);
            } catch (error) {
                console.warn('Failed to parse new_building payload', error);
            }
        });

        this.io.on("population:update", (update) => {
            try {
                const data = typeof update === 'string' ? JSON.parse(update) : update;
                if (data) {
                    data.type = Number(data.type);
                    data.population = data.population || 0;
                    data.attachedHouseId = data.attachedHouseId ?? null;
                    data.city = data.city ?? 0;
                    data.smokeActive = !!data.smokeActive;
                    data.smokeFrame = data.smokeFrame || 0;
                    data.itemsLeft = data.itemsLeft || 0;
                }
                this.emit('population:update', data);
            } catch (error) {
                console.warn('Failed to parse population update', error);
            }
        });

        this.io.on("city:finance", (payload) => {
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                if (data) {
                    this.emit('city:finance', data);
                }
            } catch (error) {
                console.warn('Failed to parse finance update', error);
            }
        });

        this.io.on("build:denied", (payload) => {
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                if (data) {
                    this.emit('build:denied', data);
                }
            } catch (error) {
                console.warn('Failed to parse build denied payload', error);
            }
        });

        this.io.on("demolish_building", (payload) => {
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                if (data && data.id && this.game.buildingFactory?.removeBuildingById) {
                    this.game.buildingFactory.removeBuildingById(data.id);
                }
            } catch (error) {
                console.warn('Failed to handle demolish payload', error);
            }
        });
    }

    sendNewBuilding(building) {
        if (this.io) {
            this.io.emit("new_building", JSON.stringify(building));
        }
    }

    sendDemolishBuilding(buildingId) {
        if (!this.io || !buildingId) {
            return;
        }
        this.io.emit('demolish_building', JSON.stringify({ id: buildingId }));
    }

    sendBulletShot(bullet) {
        this.io.emit("bullet_shot", JSON.stringify(bullet));
    }

    enterGame() {
        console.log("Telling server we've entered the game");
        this.io.emit("enter_game", JSON.stringify(this.game.player));
        return this.io.id;
    }

    cycle() {
        this.io.emit("player", JSON.stringify(this.game.player));
    }


}


export default SocketListener;
