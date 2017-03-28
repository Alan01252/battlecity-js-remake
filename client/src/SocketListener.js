import io from "../node_modules/socket.io-client";
import EventEmitter from "../node_modules/eventemitter2"

class SocketListener extends EventEmitter {

    constructor(game) {
        super();
        this.game = game
    }

    listen() {
        this.io = io.connect("http://localhost:8081", {
            "transports": ['websocket']
        });
        this.io.on("connect", () => {
            console.log("connected");
            this.emit("connected");
        });

        this.io.on("enter_game", (player) => {
            var player = JSON.parse(player);
            console.log("Player entered game");
            console.log(player);
            this.game.otherPlayers[player.id] = player;
        });

        this.io.on("player", (player) => {
            var player = JSON.parse(player);
            this.game.otherPlayers[player.id] = player;
        });

        this.io.on("bullet_shot", (bullet) => {
            var bullet = JSON.parse(bullet);
            this.game.bulletFactory.newBullet(bullet.shooter, bullet.x, bullet.y, bullet.type, bullet.angle)
        })
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