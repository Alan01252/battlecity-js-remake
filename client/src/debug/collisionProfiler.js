const parseBoolean = (value) => {
    if (value === undefined || value === null) {
        return false;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (!normalized) {
            return false;
        }
        return normalized === '1' ||
            normalized === 'true' ||
            normalized === 'yes' ||
            normalized === 'on';
    }
    return false;
};

const envFlag = typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_PROFILE_COLLISIONS || import.meta.env.PROFILE_COLLISIONS
    : null;
const globalFlag = (typeof globalThis !== 'undefined' && globalThis.__BC_PROFILE_COLLISIONS__) || false;
const profilerEnabled = parseBoolean(envFlag) || !!globalFlag;

const LOG_INTERVAL_MS = 5000;
const stats = {
    totalCalls: 0,
    totalTime: 0,
    contexts: new Map(),
    lastLog: 0
};

const recordSample = (label, durationMs) => {
    stats.totalCalls += 1;
    stats.totalTime += durationMs;

    if (!label) {
        return;
    }
    const entry = stats.contexts.get(label) || { calls: 0, time: 0 };
    entry.calls += 1;
    entry.time += durationMs;
    stats.contexts.set(label, entry);
};

const formatNumber = (value) => Number.isFinite(value) ? value.toFixed(2) : '0.00';

const maybeLogStats = () => {
    if (!profilerEnabled || typeof performance === 'undefined') {
        return;
    }
    const now = performance.now();
    if (stats.lastLog && (now - stats.lastLog) < LOG_INTERVAL_MS) {
        return;
    }
    stats.lastLog = now;
    if (stats.totalCalls === 0) {
        return;
    }
    const avg = stats.totalTime / stats.totalCalls;
    const parts = [`calls=${stats.totalCalls}`, `avg=${formatNumber(avg)}ms`];
    const topContexts = Array.from(stats.contexts.entries())
        .sort((a, b) => b[1].time - a[1].time)
        .slice(0, 3);
    topContexts.forEach(([label, entry]) => {
        const contextAvg = entry.time / entry.calls;
        parts.push(`${label}: ${entry.calls} calls @ ${formatNumber(contextAvg)}ms`);
    });
    // eslint-disable-next-line no-console
    console.debug(`[collision] ${parts.join(' | ')}`);
};

export const profileCollision = (label, fn) => {
    if (!profilerEnabled || typeof performance === 'undefined') {
        return fn();
    }
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    recordSample(label || 'collision', duration);
    maybeLogStats();
    return result;
};

export const collisionProfiler = {
    enabled: profilerEnabled,
    getStats() {
        if (!profilerEnabled) {
            return null;
        }
        const contextEntries = Array.from(stats.contexts.entries()).map(([label, entry]) => ({
            label,
            calls: entry.calls,
            totalTime: entry.time,
            averageTime: entry.time / entry.calls
        }));
        return {
            totalCalls: stats.totalCalls,
            totalTime: stats.totalTime,
            averageTime: stats.totalCalls ? stats.totalTime / stats.totalCalls : 0,
            contexts: contextEntries
        };
    },
    reset() {
        stats.totalCalls = 0;
        stats.totalTime = 0;
        stats.contexts.clear();
        stats.lastLog = 0;
    },
    logNow: maybeLogStats
};

if (profilerEnabled && typeof globalThis !== 'undefined') {
    globalThis.collisionProfiler = collisionProfiler;
}
