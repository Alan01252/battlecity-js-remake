/*jslint node: true */
"use strict";

class Player {

    constructor(id, player, now) {
        this.id = id;
        this.city = 0;
        this.isMayor = false;
        this.health = 0;
        this.direction = 0;
        this.isTurning = 0;
        this.isMoving = 0;
        this.offset = {
            x: 0,
            y: 0
        };
        this.sequence = 0;
        this.lastUpdateAt = now || Date.now();
        this.update(player, this.lastUpdateAt);
    }

    update(player, now) {
        if (!player) {
            return;
        }

        if (player.offset && typeof player.offset === 'object') {
            const x = this._toFiniteNumber(player.offset.x, this.offset.x);
            const y = this._toFiniteNumber(player.offset.y, this.offset.y);
            this.offset = {
                x: x,
                y: y
            };
        }

        this.direction = this._toFiniteNumber(player.direction, this.direction);
        this.isTurning = this._toFiniteNumber(player.isTurning, this.isTurning);

        if (typeof player.isMoving === 'boolean') {
            this.isMoving = player.isMoving ? 1 : 0;
        } else {
            this.isMoving = this._toFiniteNumber(player.isMoving, this.isMoving);
        }

        if (player.city !== undefined) {
            this.city = this._toFiniteNumber(player.city, this.city);
        }

        if (player.isMayor !== undefined) {
            this.isMayor = !!player.isMayor;
        }

        if (player.health !== undefined) {
            this.health = this._toFiniteNumber(player.health, this.health);
        }

        if (player.sequence !== undefined) {
            const sequenceValue = this._toFiniteNumber(player.sequence, this.sequence);
            if (Number.isFinite(sequenceValue)) {
                this.sequence = Math.max(0, Math.round(sequenceValue));
            }
        }

        this.lastUpdateAt = now || Date.now();
    }

    cycle() {

    }

    toJSON() {
        return {
            id: this.id,
            city: this.city,
            isMayor: this.isMayor,
            health: this.health,
            direction: this.direction,
            isTurning: this.isTurning,
            isMoving: this.isMoving,
            sequence: this.sequence,
            offset: {
                x: this.offset.x,
                y: this.offset.y
            }
        };
    }

    _toFiniteNumber(value, fallback) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        if (fallback !== undefined) {
            return fallback;
        }
        return 0;
    }
}

module.exports = Player;
