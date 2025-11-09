#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
    createPlayerSnapshot,
    createSampleBulletPayload
} = require('../../shared/bench/payloadFixtures');
const {
    encodePlayerSnapshot,
    decodePlayerSnapshot,
    encodeBullet,
    decodeBullet
} = require('../../shared/bench/protoCodec');
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
    const players = createPlayerSnapshot(playerCount);
    const protoBuffer = encodePlayerSnapshot(players);
    const iterations = Math.max(1, Math.floor(updatesPerSecond * sampleSeconds));
    const frameBudgetMs = 16.667;

    console.log(`players snapshot (${playerCount} players): ${protoBuffer.length} bytes (protobuf)`);
    const decodeStats = measure(iterations, () => decodePlayerSnapshot(protoBuffer));
    const decodeFreshStats = measure(iterations, () => decodePlayerSnapshot(Buffer.from(protoBuffer)));
    const decodePerOpMs = decodeStats.perOpUs / 1000;
    const decodeShare = (decodePerOpMs / frameBudgetMs) * 100;
    console.log(`decode snapshot (shared buffer): ${decodeStats.perOpUs.toFixed(3)} µs/op (${(decodeStats.throughput / 1000).toFixed(1)}k ops/s)`);
    console.log(`  ↳ ${(decodeShare).toFixed(4)}% of a ${frameBudgetMs.toFixed(3)} ms frame @ ${updatesPerSecond} Hz`);
    console.log(`decode snapshot (cloned buffer): ${decodeFreshStats.perOpUs.toFixed(3)} µs/op (${(decodeFreshStats.throughput / 1000).toFixed(1)}k ops/s)`);

    const cache = Object.create(null);
    const decodeMergeStats = measure(iterations, (iteration) => {
        const decoded = decodePlayerSnapshot(protoBuffer);
        return mergeSnapshotIntoCache(decoded, iteration, cache);
    });
    const decodeMergeMs = decodeMergeStats.perOpUs / 1000;
    const decodeMergeShare = (decodeMergeMs / frameBudgetMs) * 100;
    console.log(`decode + merge snapshot: ${decodeMergeStats.perOpUs.toFixed(3)} µs/op (${(decodeMergeStats.throughput / 1000).toFixed(1)}k ops/s)`);
    console.log(`  ↳ ${(decodeMergeShare).toFixed(4)}% of frame budget per update`);

    const bullet = createSampleBulletPayload(7);
    const protoBullet = encodeBullet(bullet);
    const bulletIterations = Math.max(1, updatesPerSecond * sampleSeconds * 10);
    const decodeBulletStats = measure(bulletIterations, () => decodeBullet(protoBullet));
    console.log(`bullet payload bytes (protobuf): ${protoBullet.length} bytes`);
    console.log(`decode bullet: ${decodeBulletStats.perOpUs.toFixed(3)} µs/op (${(decodeBulletStats.throughput / 1000).toFixed(1)}k ops/s)`);
}

main();
