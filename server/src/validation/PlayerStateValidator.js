/*jslint node: true */
"use strict";

const DEFAULT_OPTIONS = {
    minMapCoordinate: 0,
    maxMapCoordinate: 511 * 48,
    speedPerMs: 0.50,
    maxAxisDelta: 20,
    snapAllowance: 96,
    frameToleranceMs: 50,
    maxDirectionIndex: 31,
    directionSlots: 32,
    maxTurnDelta: 4,
    minHealth: 0,
    maxHealth: 40
};

class PlayerStateValidator {

    constructor(options) {
        this.options = Object.assign({}, DEFAULT_OPTIONS, options || {});
        this.axisHardCap = this.options.maxAxisDelta + this.options.snapAllowance;
    }

    initializePlayerState(rawState, context) {
        return this._validate(null, rawState, context);
    }

    validatePlayerUpdate(existingPlayer, rawState, context) {
        return this._validate(existingPlayer, rawState, context);
    }

    _validate(existingPlayer, rawState, context) {
        const now = (context && context.now) || Date.now();
        const previousState = existingPlayer || null;

        const sequenceValue = this._sanitizeInteger(rawState && rawState.sequence, previousState && previousState.sequence, 0);
        const normalizedSequence = Number.isFinite(sequenceValue) ? Math.max(0, sequenceValue) : (previousState && Number.isFinite(previousState.sequence) ? previousState.sequence : 0);

        const sanitized = {
            id: (rawState && rawState.id) || (previousState && previousState.id) || null,
            city: this._sanitizeInteger(rawState && rawState.city, previousState && previousState.city, 0),
            isMayor: this._sanitizeBoolean(rawState && rawState.isMayor, previousState && previousState.isMayor, false),
            health: this._sanitizeRange(rawState && rawState.health, previousState && previousState.health, this.options.minHealth, this.options.maxHealth, this.options.maxHealth),
            direction: this._sanitizeDirection(rawState && rawState.direction, previousState && previousState.direction, 0),
            isTurning: this._sanitizeTurn(rawState && rawState.isTurning, previousState && previousState.isTurning, 0),
            isMoving: this._sanitizeMovement(rawState && rawState.isMoving, previousState && previousState.isMoving, 0),
            offset: this._sanitizeOffset(rawState && rawState.offset, previousState && previousState.offset),
            sequence: normalizedSequence
        };

        const result = {
            valid: true,
            sanitized: sanitized,
            reasons: [],
            flags: [],
            timestamp: now
        };

        if (!previousState) {
            return result;
        }

        const previousOffset = previousState.offset || { x: 0, y: 0 };
        const delta = {
            x: sanitized.offset.x - previousOffset.x,
            y: sanitized.offset.y - previousOffset.y
        };

        const elapsed = Math.max(1, now - (previousState.lastUpdateAt || now));
        const maxAxisMovement = this._computeAxisLimit(elapsed);
        const totalDistance = Math.sqrt((delta.x * delta.x) + (delta.y * delta.y));
        const isFake = !!(previousState.isFake || previousState.isFakeRecruit || previousState.isSystemControlled);
        let maxDistance = Math.min(this.axisHardCap, Math.max(maxAxisMovement, this.options.maxAxisDelta));
        if (isFake) {
            const boost = elapsed < 200 ? this.options.maxAxisDelta * 4 : this.options.maxAxisDelta * 2;
            maxDistance = Math.min(this.axisHardCap, Math.max(maxDistance, boost));
        }

        if (Math.abs(delta.x) > maxDistance || Math.abs(delta.y) > maxDistance || totalDistance > (maxDistance + 8)) {
            result.valid = false;
            result.reasons.push("movement/exceeds_threshold");
            sanitized.offset = {
                x: previousOffset.x,
                y: previousOffset.y
            };
            result.flags.push("movement_clamped");
        }

        const directionDelta = this._directionDelta(previousState.direction, sanitized.direction);
        const maxTurn = isFake ? this.options.maxTurnDelta * 4 : this.options.maxTurnDelta;
        if (directionDelta > maxTurn) {
            result.valid = false;
            result.reasons.push("direction/exceeds_threshold");
            sanitized.direction = previousState.direction;
            result.flags.push("direction_clamped");
        }

        return result;
    }

    _computeAxisLimit(elapsedMs) {
        if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
            return this.options.maxAxisDelta;
        }
        const paddedElapsed = elapsedMs + this.options.frameToleranceMs;
        const projected = paddedElapsed * this.options.speedPerMs;
        if (!Number.isFinite(projected)) {
            return this.options.maxAxisDelta;
        }
        return Math.min(this.axisHardCap, Math.max(this.options.maxAxisDelta, projected));
    }

    _sanitizeOffset(offset, fallback) {
        const base = fallback || { x: 0, y: 0 };
        if (!offset || typeof offset !== "object") {
            return {
                x: base.x,
                y: base.y
            };
        }

        return {
            x: this._clamp(this._toFiniteNumber(offset.x, base.x), this.options.minMapCoordinate, this.options.maxMapCoordinate),
            y: this._clamp(this._toFiniteNumber(offset.y, base.y), this.options.minMapCoordinate, this.options.maxMapCoordinate)
        };
    }

    _sanitizeDirection(direction, fallback, defaultValue) {
        const base = (fallback !== undefined) ? fallback : defaultValue;
        const rawValue = this._toFiniteNumber(direction, base);
        if (!Number.isFinite(rawValue)) {
            return base;
        }
        let normalised = Math.round(rawValue);
        const modulo = this.options.directionSlots;
        if (modulo > 0) {
            normalised = ((normalised % modulo) + modulo) % modulo;
        }
        return normalised;
    }

    _sanitizeTurn(turn, fallback, defaultValue) {
        const base = (fallback !== undefined) ? fallback : defaultValue;
        const rawValue = this._toFiniteNumber(turn, base);
        if (!Number.isFinite(rawValue)) {
            return base;
        }
        if (rawValue > 1) {
            return 1;
        }
        if (rawValue < -1) {
            return -1;
        }
        return Math.round(rawValue);
    }

    _sanitizeMovement(movement, fallback, defaultValue) {
        const base = (fallback !== undefined) ? fallback : defaultValue;
        if (typeof movement === "boolean") {
            return movement ? 1 : 0;
        }
        const rawValue = this._toFiniteNumber(movement, base);
        if (!Number.isFinite(rawValue)) {
            return base;
        }
        if (rawValue > 1) {
            return 1;
        }
        if (rawValue < -1) {
            return -1;
        }
        return rawValue;
    }

    _sanitizeInteger(value, fallback, defaultValue) {
        const base = (fallback !== undefined) ? fallback : defaultValue;
        const rawValue = this._toFiniteNumber(value, base);
        if (!Number.isFinite(rawValue)) {
            return base;
        }
        return Math.round(rawValue);
    }

    _sanitizeBoolean(value, fallback, defaultValue) {
        if (value === undefined) {
            if (fallback !== undefined) {
                return !!fallback;
            }
            return !!defaultValue;
        }
        return !!value;
    }

    _sanitizeRange(value, fallback, min, max, defaultValue) {
        const base = (fallback !== undefined) ? fallback : defaultValue;
        const rawValue = this._toFiniteNumber(value, base);
        if (!Number.isFinite(rawValue)) {
            return base;
        }
        return this._clamp(rawValue, min, max);
    }

    _directionDelta(previous, current) {
        if (!Number.isFinite(previous) || !Number.isFinite(current)) {
            return 0;
        }
        const modulo = this.options.directionSlots;
        if (modulo <= 0) {
            return Math.abs(current - previous);
        }
        const forward = ((current - previous) + modulo) % modulo;
        const backward = ((previous - current) + modulo) % modulo;
        return Math.min(forward, backward);
    }

    _toFiniteNumber(value, fallback) {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === "string") {
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

    _clamp(value, min, max) {
        if (!Number.isFinite(value)) {
            return (min + max) / 2;
        }
        if (value < min) {
            return min;
        }
        if (value > max) {
            return max;
        }
        return value;
    }
}

module.exports = PlayerStateValidator;
