import callsignList from '@shared/callsigns.json';

const DEFAULT_NAMES = Array.isArray(callsignList)
    ? callsignList.filter((entry) => typeof entry === 'string' && entry.trim().length)
    : [];

const padNumber = (value) => {
    if (!Number.isFinite(value)) {
        return '';
    }
    return value < 10 ? `0${value}` : `${value}`;
};

export default class LocalCallsignRegistry {
    constructor(options = {}) {
        const names = Array.isArray(options.names) && options.names.length
            ? options.names
            : DEFAULT_NAMES;
        this.names = names.map((name) => `${name}`.trim());
        this.cursor = 0;
        this.assigned = new Map(); // key -> { name, base }
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
        if (key === undefined || key === null) {
            return this.buildName(this.nextBaseName());
        }
        const stringKey = `${key}`;
        if (this.assigned.has(stringKey)) {
            return this.assigned.get(stringKey).name;
        }
        const base = options.baseName || this.nextBaseName();
        const name = this.buildName(base);
        this.assigned.set(stringKey, { name, base });
        return name;
    }

    get(key) {
        if (key === undefined || key === null) {
            return null;
        }
        const entry = this.assigned.get(`${key}`);
        return entry ? entry.name : null;
    }

    release(key) {
        if (key === undefined || key === null) {
            return;
        }
        const stringKey = `${key}`;
        const entry = this.assigned.get(stringKey);
        if (!entry) {
            return;
        }
        const { base } = entry;
        this.assigned.delete(stringKey);
        if (!base) {
            return;
        }
        const current = this.usage.get(base) || 1;
        const next = Math.max(0, current - 1);
        if (next === 0) {
            this.usage.delete(base);
        } else {
            this.usage.set(base, next);
        }
    }
}
