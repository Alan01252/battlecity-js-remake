"use strict";

const baseNames = require('../../../shared/callsigns.json');

const DEFAULT_NAMES = Array.isArray(baseNames)
    ? baseNames.filter((entry) => typeof entry === 'string' && entry.trim().length)
    : [];

const padNumber = (value) => {
    if (!Number.isFinite(value)) {
        return '';
    }
    return value < 10 ? `0${value}` : `${value}`;
};

class CallsignRegistry {
    constructor(options = {}) {
        const names = Array.isArray(options.names) && options.names.length
            ? options.names
            : DEFAULT_NAMES;
        this.names = names.map((name) => String(name).trim());
        this.cursor = 0;
        this.assigned = new Map(); // key -> { name, base, index }
        this.usage = new Map(); // base -> count
    }

    nextBaseName() {
        if (!this.names.length) {
            return 'Rampart';
        }
        const base = this.names[this.cursor % this.names.length];
        this.cursor = (this.cursor + 1) % (this.names.length * 1000);
        return base;
    }

    buildName(base) {
        const count = (this.usage.get(base) || 0) + 1;
        this.usage.set(base, count);
        if (count === 1) {
            return base;
        }
        return `${base}-${padNumber(count)}`;
    }

    assign(key, options = {}) {
        if (!key && key !== 0) {
            return this.buildName(this.nextBaseName());
        }
        const stringKey = String(key);
        const existing = this.assigned.get(stringKey);
        if (existing) {
            return existing.name;
        }
        const base = options.baseName || this.nextBaseName();
        const name = this.buildName(base);
        this.assigned.set(stringKey, { name, base });
        return name;
    }

    get(key) {
        if (!key && key !== 0) {
            return null;
        }
        const entry = this.assigned.get(String(key));
        return entry ? entry.name : null;
    }

    release(key) {
        if (!key && key !== 0) {
            return;
        }
        const entry = this.assigned.get(String(key));
        if (!entry) {
            return;
        }
        const { base } = entry;
        this.assigned.delete(String(key));
        if (base && this.usage.has(base)) {
            const next = Math.max(0, (this.usage.get(base) || 1) - 1);
            if (next === 0) {
                this.usage.delete(base);
            } else {
                this.usage.set(base, next);
            }
        }
    }
}

module.exports = CallsignRegistry;
