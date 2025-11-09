#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
    createPlayerSnapshotString,
    createSampleBulletPayload
} = require('../../shared/bench/payloadFixtures');
const { mergeSnapshotIntoCache } = require('../../shared/bench/mergeSnapshot');

function measure(iterations, fn) {
    let sink;
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
        sink = fn(i);
    }
    const elapsedMs = performance.now() - start;
    const perOpUs = (elapsedMs / iterations) * 1000;
    const throughput = iterations / (elapsedMs / 1000);
    return { elapsedMs, perOpUs, throughput, sink };
}

function main() {
    const playerCount = Number(process.argv[2]) || 256;
    const updatesPerSecond = Number(process.argv[3]) || 60;
    const sampleSeconds = Number(process.argv[4]) || 5;
    const snapshotString = createPlayerSnapshotString(playerCount);
    const snapshotBytes = Buffer.byteLength(snapshotString);
    const iterations = Math.max(1, Math.floor(updatesPerSecond * sampleSeconds));

    console.log(`players snapshot (${playerCount} players): ${snapshotBytes} bytes`);
    const parseOnly = measure(iterations, () => JSON.parse(snapshotString));
    const frameBudgetMs = 16.667;
    const parsePerOpMs = parseOnly.perOpUs / 1000;
    const perFrameShare = (parsePerOpMs / frameBudgetMs) * 100;
    console.log(`JSON.parse snapshot: ${parseOnly.perOpUs.toFixed(3)} µs/op (${(parseOnly.throughput / 1000).toFixed(1)}k ops/s)`);
    console.log(`  ↳ consumes ${(perFrameShare).toFixed(4)}% of a ${frameBudgetMs.toFixed(3)} ms frame at ${updatesPerSecond} Hz`);

    const cache = Object.create(null);
    const applyStats = measure(iterations, (iteration) => {
        const players = JSON.parse(snapshotString);
        return mergeSnapshotIntoCache(players, iteration, cache);
    });
    const perUpdateMs = applyStats.perOpUs / 1000;
    const perUpdateShare = (perUpdateMs / frameBudgetMs) * 100;
    console.log(`parse + merge snapshot: ${applyStats.perOpUs.toFixed(3)} µs/op (${(applyStats.throughput / 1000).toFixed(1)}k ops/s)`);
    console.log(`  ↳ ${(perUpdateShare).toFixed(4)}% of frame budget per update, covers ${(applyStats.sink || 0)} players each iteration`);

    const bullet = createSampleBulletPayload(7);
    const bulletString = JSON.stringify(bullet);
    const bulletIterations = Math.max(1, updatesPerSecond * sampleSeconds * 10);
    const parseBullet = measure(bulletIterations, () => JSON.parse(bulletString));
    console.log(`bullet payload bytes: ${Buffer.byteLength(bulletString)} bytes`);
    console.log(`JSON.parse bullet: ${parseBullet.perOpUs.toFixed(3)} µs/op (${(parseBullet.throughput / 1000).toFixed(1)}k ops/s)`);
}

main();
