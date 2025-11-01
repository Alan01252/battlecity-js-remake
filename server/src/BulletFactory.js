/*jslint node: true */
"use strict";

const debug = require('debug')('BattleCity:BulletFactory');
const {
    BULLET_SPEED_UNITS_PER_MS,
    BULLET_MAX_RANGE,
    BULLET_DAMAGE,
    DAMAGE_ROCKET,
    DAMAGE_FLARE,
    BULLET_FLARE_SPEED
} = require("./gameplay/constants");
const { createBulletRect, getPlayerRect, rectangleCollision } = require("./gameplay/geometry");

let bulletCounter = 0;

const BULLET_DAMAGE_BY_TYPE = {
    0: BULLET_DAMAGE,
    1: DAMAGE_ROCKET,
    3: DAMAGE_FLARE,
};

const resolveBulletDamage = (type) => {
    if (Object.prototype.hasOwnProperty.call(BULLET_DAMAGE_BY_TYPE, type)) {
        return BULLET_DAMAGE_BY_TYPE[type];
    }
    return BULLET_DAMAGE;
};

const BULLET_SPEED_BY_TYPE = {
    0: BULLET_SPEED_UNITS_PER_MS,
    1: BULLET_SPEED_UNITS_PER_MS,
    3: BULLET_FLARE_SPEED ?? BULLET_SPEED_UNITS_PER_MS,
};

const resolveBulletSpeed = (type) => {
    if (Object.prototype.hasOwnProperty.call(BULLET_SPEED_BY_TYPE, type)) {
        return BULLET_SPEED_BY_TYPE[type];
    }
    return BULLET_SPEED_UNITS_PER_MS;
};

class BulletFactory {

    constructor(game, playerFactory) {
        this.game = game;
        this.playerFactory = playerFactory;
        this.io = null;
        this.bullets = new Map();
        this.recentSourceShots = new Map();
        this.sourceCleanupAt = 0;
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

    parsePayload(payload) {
        if (payload === null || payload === undefined) {
            return null;
        }
        if (typeof payload === 'string') {
            try {
                return JSON.parse(payload);
            } catch (error) {
                debug("Failed to parse bullet payload: " + error.message);
                return null;
            }
        }
        if (typeof payload === 'object') {
            return payload;
        }
        return null;
    }

    spawnBullet(socket, payload) {
        const now = Date.now();
        const bulletData = this.sanitizeBullet(payload);
        if (!bulletData) {
            return;
        }

        const shooter = this.game.players[socket.id];
        if (!shooter) {
            return;
        }

        const teamId = (bulletData.teamId !== undefined && bulletData.teamId !== null)
            ? bulletData.teamId
            : (this.playerFactory?.getPlayerTeam(socket.id) ?? null);
        bulletData.teamId = teamId;

        if (bulletData.sourceId) {
            if (!this.canRegisterSourceShot(bulletData.sourceId, bulletData.sourceType, now)) {
                return;
            }
            this.registerSourceShot(bulletData.sourceId, now);
        }

        const defensiveShot = this.isStructureSource(bulletData);
        const shooterId = defensiveShot && bulletData.sourceId
            ? bulletData.sourceId
            : socket.id;

        const id = `bullet_${++bulletCounter}`;
        const bullet = Object.assign({
            id,
            shooterId,
            emitterId: socket.id,
            reportedShooterId: bulletData.reportedShooterId ?? null,
            damage: bulletData.damage ?? BULLET_DAMAGE,
            lifeMs: 0,
            maxRange: BULLET_MAX_RANGE,
            createdAt: now,
            lastUpdateAt: now,
        }, bulletData);

        this.bullets.set(id, bullet);

        if (this.io) {
            const broadcast = {
                shooter: shooterId,
                x: bullet.x,
                y: bullet.y,
                angle: bullet.angle,
                type: bullet.type,
                team: bullet.teamId
            };
            if (bullet.sourceId) {
                broadcast.sourceId = bullet.sourceId;
            }
            if (bullet.sourceType) {
                broadcast.sourceType = bullet.sourceType;
            }
            if (bullet.targetId) {
                broadcast.targetId = bullet.targetId;
            }
            this.io.emit('bullet_shot', JSON.stringify(broadcast));
        }
    }

    sanitizeBullet(payload) {
        const data = this.parsePayload(payload);
        if (!data) {
            return null;
        }
        const x = Number(data.x);
        const y = Number(data.y);
        const angle = Number(data.angle);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle)) {
            return null;
        }
        let type = Number(data.type);
        if (!Number.isFinite(type)) {
            type = 0;
        } else {
            type = Math.floor(type);
        }
        let teamId = null;
        const teamRaw = data.team ?? data.teamId;
        if (teamRaw !== undefined && teamRaw !== null) {
            const teamNumeric = Number(teamRaw);
            if (Number.isFinite(teamNumeric)) {
                teamId = Math.floor(teamNumeric);
            }
        }
        let sourceId = null;
        if (data.sourceId !== undefined && data.sourceId !== null) {
            const value = String(data.sourceId).trim();
            if (value.length > 0) {
                sourceId = value;
            }
        }
        let sourceType = null;
        if (typeof data.sourceType === 'string' && data.sourceType.length > 0) {
            sourceType = data.sourceType.trim().toLowerCase();
        }
        const damage = resolveBulletDamage(type);
        const reportedShooterId = (typeof data.shooter === 'string' && data.shooter.length > 0)
            ? data.shooter
            : null;
        const emitterId = (typeof data.emitterId === 'string' && data.emitterId.length > 0)
            ? data.emitterId
            : null;
        let targetId = null;
        if (data.targetId !== undefined && data.targetId !== null) {
            const value = String(data.targetId).trim();
            if (value.length > 0) {
                targetId = value;
            }
        }
        return {
            x,
            y,
            angle,
            type,
            speed: resolveBulletSpeed(type),
            teamId,
            sourceId,
            sourceType,
            damage,
            reportedShooterId,
            emitterId,
            targetId
        };
    }

    isStructureSource(data) {
        if (!data) {
            return false;
        }
        const type = data.sourceType ? String(data.sourceType).toLowerCase() : '';
        if (type === 'turret' || type === 'plasma' || type === 'sleeper' || type === 'rogue_tank') {
            return true;
        }
        if (!type && typeof data.sourceId === 'string') {
            const lowered = data.sourceId.toLowerCase();
            if (lowered.startsWith('rogue_') || lowered.startsWith('fake_defense_')) {
                return true;
            }
        }
        return false;
    }

    removeBulletsForShooter(shooterId) {
        for (const [id, bullet] of Array.from(this.bullets.entries())) {
            if (bullet.shooterId === shooterId || bullet.emitterId === shooterId) {
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

    resolveSourceCooldown(sourceType) {
        if (!sourceType) {
            return 150;
        }
        const key = String(sourceType).toLowerCase();
        if (key === 'turret' || key === 'plasma' || key === 'sleeper') {
            return 220;
        }
        if (key === 'rogue_tank') {
            return 900;
        }
        return 150;
    }

    canRegisterSourceShot(sourceId, sourceType, now) {
        const cooldown = this.resolveSourceCooldown(sourceType);
        const lastShot = this.recentSourceShots.get(sourceId);
        if (lastShot !== undefined && (now - lastShot) < cooldown) {
            return false;
        }
        return true;
    }

    registerSourceShot(sourceId, now) {
        this.recentSourceShots.set(sourceId, now);
        if ((now - this.sourceCleanupAt) > 10000) {
            this.cleanupSourceShots(now);
        }
    }

    cleanupSourceShots(now = Date.now()) {
        const threshold = now - 10000;
        for (const [id, timestamp] of this.recentSourceShots.entries()) {
            if (timestamp < threshold) {
                this.recentSourceShots.delete(id);
            }
        }
        this.sourceCleanupAt = now;
    }

    checkPlayerCollision(bullet) {
        const bulletRect = createBulletRect(bullet);
        for (const [socketId, player] of Object.entries(this.game.players)) {
            if (!player || !player.offset) {
                continue;
            }
            if (socketId === bullet.shooterId && !this.isSelfDamageAllowed(bullet)) {
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
                    shooterId: bullet.shooterId,
                    emitterId: bullet.emitterId ?? null,
                    sourceId: bullet.sourceId ?? null,
                    sourceType: bullet.sourceType ?? null,
                    teamId: bullet.teamId ?? null,
                    targetId: bullet.targetId ?? null
                });
                return true;
            }
        }
        return false;
    }

    isSelfDamageAllowed(bullet) {
        if (!bullet) {
            return false;
        }
        return this.isStructureSource(bullet);
    }
}

module.exports = BulletFactory;
