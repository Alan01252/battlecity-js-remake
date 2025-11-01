/*jslint node: true */
"use strict";

const debug = require('debug')('BattleCity:BulletFactory');
const { BULLET_SPEED_UNITS_PER_MS, BULLET_MAX_RANGE, BULLET_DAMAGE } = require("./gameplay/constants");
const { createBulletRect, getPlayerRect, rectangleCollision } = require("./gameplay/geometry");

let bulletCounter = 0;

class BulletFactory {

    constructor(game, playerFactory) {
        this.game = game;
        this.playerFactory = playerFactory;
        this.io = null;
        this.bullets = new Map();
    }

    listen(io) {
        this.io = io;
        debug("Starting Bullet Server");

        io.on("connection", (socket) => {
            socket.on('bullet_shot', (bullet) => {
                this.spawnBullet(socket, bullet);
            });
            socket.on('disconnect', () => {
                this.removeBulletsForShooter(socket.id);
            });
        });
    }

    spawnBullet(socket, payload) {
        const shooter = this.game.players[socket.id];
        if (!shooter) {
            return;
        }

        const bulletData = this.sanitizeBullet(socket.id, payload);
        if (!bulletData) {
            return;
        }

        const id = `bullet_${++bulletCounter}`;
        const bullet = Object.assign({
            id,
            shooterId: socket.id,
            teamId: this.playerFactory?.getPlayerTeam(socket.id) ?? null,
            damage: BULLET_DAMAGE,
            lifeMs: 0,
            maxRange: BULLET_MAX_RANGE,
            createdAt: Date.now(),
            lastUpdateAt: Date.now(),
        }, bulletData);

        this.bullets.set(id, bullet);

        if (this.io) {
            this.io.emit('bullet_shot', JSON.stringify({
                shooter: socket.id,
                x: bullet.x,
                y: bullet.y,
                angle: bullet.angle,
                type: bullet.type,
                team: bullet.teamId
            }));
        }
    }

    sanitizeBullet(shooterId, payload) {
        if (!payload) {
            return null;
        }
        const x = Number(payload.x);
        const y = Number(payload.y);
        const angle = Number(payload.angle);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle)) {
            return null;
        }
        return {
            shooterId,
            x,
            y,
            angle,
            type: payload.type || 0,
            speed: BULLET_SPEED_UNITS_PER_MS
        };
    }

    removeBulletsForShooter(shooterId) {
        for (const [id, bullet] of Array.from(this.bullets.entries())) {
            if (bullet.shooterId === shooterId) {
                this.bullets.delete(id);
            }
        }
    }

    cycle(deltaMs) {
        if (this.bullets.size === 0) {
            return;
        }

        for (const bullet of Array.from(this.bullets.values())) {
            this.updateBullet(bullet, deltaMs);
            if (bullet._destroy) {
                this.bullets.delete(bullet.id);
            }
        }
    }

    updateBullet(bullet, deltaMs) {
        const now = Date.now();
        bullet.lifeMs += deltaMs;
        bullet.lastUpdateAt = now;

        const velocityX = Math.sin((bullet.angle / 16) * Math.PI) * -1 * bullet.speed * deltaMs;
        const velocityY = Math.cos((bullet.angle / 16) * Math.PI) * -1 * bullet.speed * deltaMs;

        bullet.x += velocityX;
        bullet.y += velocityY;

        if (this.outOfBounds(bullet)) {
            bullet._destroy = true;
            return;
        }

        if (this.checkPlayerCollision(bullet)) {
            bullet._destroy = true;
        }
    }

    outOfBounds(bullet) {
        if (bullet.lifeMs > 4000) {
            return true;
        }
        if (!Number.isFinite(bullet.x) || !Number.isFinite(bullet.y)) {
            return true;
        }
        if (bullet.x < -256 || bullet.y < -256) {
            return true;
        }
        if (bullet.x > (512 * 48) + 256 || bullet.y > (512 * 48) + 256) {
            return true;
        }
        return false;
    }

    checkPlayerCollision(bullet) {
        const bulletRect = createBulletRect(bullet);
        for (const [socketId, player] of Object.entries(this.game.players)) {
            if (!player || !player.offset) {
                continue;
            }
            if (socketId === bullet.shooterId) {
                continue;
            }

            const playerTeam = this.playerFactory?.getPlayerTeam(socketId) ?? null;
            const bulletTeam = bullet.teamId ?? null;
            if (bulletTeam !== null && bulletTeam === playerTeam) {
                continue;
            }

            const playerRect = getPlayerRect(player);
            if (rectangleCollision(playerRect, bulletRect)) {
                this.playerFactory.applyDamage(socketId, bullet.damage, {
                    type: "bullet",
                    shooterId: bullet.shooterId
                });
                return true;
            }
        }
        return false;
    }
}

module.exports = BulletFactory;
