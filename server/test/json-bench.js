#!/usr/bin/env node
'use strict';

const { performance } = require('perf_hooks');
const {
    createPlayerSnapshot,
    createPlayerSnapshotString,
    createSampleBulletPayload
} = require('../../shared/bench/payloadFixtures');
const {
    encodePlayerSnapshot,
    decodePlayerSnapshot,
    encodePlayerMessage,
    decodePlayerMessage,
    encodeBullet,
    decodeBullet
} = require('../../shared/bench/protoCodec');

function formatBytes(bytes) {
    const KB = 1024;
    const MB = KB * 1024;
    if (bytes >= MB) {
        return `${(bytes / MB).toFixed(2)} MiB`;
    }
    if (bytes >= KB) {
        return `${(bytes / KB).toFixed(2)} KiB`;
    }
    return `${bytes} B`;
}

function bench(label, iterations, fn) {
    let sink;
    fn(); // warm-up
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
        sink = fn();
    }
    const elapsedMs = performance.now() - start;
    const perOpUs = (elapsedMs / iterations) * 1000;
    const throughput = iterations / (elapsedMs / 1000);
    const sinkNote = typeof sink === 'string' ? sink.length : (sink && typeof sink === 'object' ? Object.keys(sink).length : sink);
    console.log(`${label}: ${perOpUs.toFixed(3)} µs/op (${elapsedMs.toFixed(2)} ms total, ${(throughput / 1000).toFixed(1)}k ops/s) [sink=${sinkNote}]`);
    return {
        perOpUs,
        perOpMs: perOpUs / 1000,
        elapsedMs,
        throughput,
        sink
    };
}

function reportFrameBudget(label, perOpMs, updatesPerSecond, frameBudgetMs = 16.667) {
    const frameShare = frameBudgetMs > 0 ? (perOpMs / frameBudgetMs) * 100 : 0;
    const perSecondMs = perOpMs * updatesPerSecond;
    console.log(`  ↳ ${label}: ${(perOpMs * 1000).toFixed(3)} µs/update, ${(frameShare).toFixed(4)}% of a ${frameBudgetMs.toFixed(3)} ms frame @ ${updatesPerSecond} Hz (${perSecondMs.toFixed(3)} ms each second)`);
}

function main() {
    const playerCount = Number(process.argv[2]) || 128;
    const updatesPerSecond = Number(process.argv[3]) || 60;
    const players = createPlayerSnapshot(playerCount);
    const playerPayload = players;
    const playerString = createPlayerSnapshotString(playerCount);
    const playerBytes = Buffer.byteLength(playerString);
    console.log(`players snapshot (${playerCount} players): ${playerBytes} bytes (${formatBytes(playerBytes)})`);

    const protoSnapshotBuffer = encodePlayerSnapshot(playerPayload);
    console.log(`protobuf snapshot bytes: ${protoSnapshotBuffer.length} bytes (${formatBytes(protoSnapshotBuffer.length)})`);

    const samplePlayer = playerPayload[0];
    const playerSingleString = JSON.stringify(samplePlayer);
    console.log(`single player payload bytes: ${Buffer.byteLength(playerSingleString)} bytes`);
    const protoPlayerBuffer = encodePlayerMessage(samplePlayer);
    console.log(`protobuf single player bytes: ${protoPlayerBuffer.length} bytes`);

    const stringifySnapshotStats = bench('JSON.stringify players snapshot', 200, () => JSON.stringify(playerPayload));
    const parseSnapshotStats = bench('JSON.parse players snapshot', 200, () => JSON.parse(playerString));
    const stringifyPlayerStats = bench('JSON.stringify player update', 50000, () => JSON.stringify(samplePlayer));
    const parsePlayerStats = bench('JSON.parse player update', 50000, () => JSON.parse(playerSingleString));

    const _encodeProtoSnapshotStats = bench('Protobuf encode players snapshot', 200, () => encodePlayerSnapshot(playerPayload));
    const decodeProtoSnapshotStats = bench('Protobuf decode players snapshot', 200, () => decodePlayerSnapshot(protoSnapshotBuffer));
    const _decodeProtoSnapshotToJs = bench(
        'Protobuf decode players snapshot (fresh buffer)',
        200,
        () => decodePlayerSnapshot(Buffer.from(protoSnapshotBuffer))
    );
    const _encodeProtoPlayerStats = bench('Protobuf encode player update', 50000, () => encodePlayerMessage(samplePlayer));
    const decodeProtoPlayerStats = bench('Protobuf decode player update', 50000, () => decodePlayerMessage(protoPlayerBuffer));

    console.log('\nClient frame budget impact:');
    reportFrameBudget('parse snapshot payload', parseSnapshotStats.perOpMs, updatesPerSecond);
    reportFrameBudget('parse single player', parsePlayerStats.perOpMs, updatesPerSecond);
    reportFrameBudget('stringify single player (emit)', stringifyPlayerStats.perOpMs, updatesPerSecond);
    reportFrameBudget('decode protobuf snapshot', decodeProtoSnapshotStats.perOpMs, updatesPerSecond);
    reportFrameBudget('decode protobuf player', decodeProtoPlayerStats.perOpMs, updatesPerSecond);

    const bullet = createSampleBulletPayload(1);
    const bulletString = JSON.stringify(bullet);
    console.log(`bullet payload bytes: ${Buffer.byteLength(bulletString)} bytes`);
    const protoBulletBuffer = encodeBullet(bullet);
    console.log(`protobuf bullet bytes: ${protoBulletBuffer.length} bytes`);
    bench('JSON.stringify bullet', 200000, () => JSON.stringify(bullet));
    bench('JSON.parse bullet', 200000, () => JSON.parse(bulletString));
    bench('Protobuf encode bullet', 200000, () => encodeBullet(bullet));
    bench('Protobuf decode bullet', 200000, () => decodeBullet(protoBulletBuffer));
}

main();
