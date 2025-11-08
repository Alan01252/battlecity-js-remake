#!/usr/bin/env node
'use strict';

const { performance } = require('perf_hooks');
const {
    createPlayerSnapshotString,
    createSampleBulletPayload
} = require('../../shared/bench/payloadFixtures');

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

function applySnapshot(snapshotString, iteration, cache) {
    const players = JSON.parse(snapshotString);
    const seqIncrement = iteration + 1;
    for (let i = 0; i < players.length; i += 1) {
        const player = players[i];
        player.sequence = (player.sequence || 0) + seqIncrement;
        const existing = cache[player.id];
        if (existing && existing.sequence !== undefined && player.sequence <= existing.sequence) {
            continue;
        }
        if (existing) {
            existing.sequence = player.sequence;
            existing.city = player.city;
            existing.isMayor = !!player.isMayor;
            existing.health = player.health;
            existing.direction = player.direction;
            existing.isTurning = player.isTurning;
            existing.isMoving = player.isMoving;
            existing.isCloaked = !!player.isCloaked;
            existing.cloakExpiresAt = player.cloakExpiresAt;
            existing.isFrozen = !!player.isFrozen;
            existing.frozenUntil = player.frozenUntil;
            existing.callsign = player.callsign;
            existing.userId = player.userId;
            if (!existing.offset) {
                existing.offset = { x: 0, y: 0 };
            }
            existing.offset.x = player.offset?.x ?? existing.offset.x ?? 0;
            existing.offset.y = player.offset?.y ?? existing.offset.y ?? 0;
        } else {
            cache[player.id] = {
                ...player,
                offset: {
                    x: player.offset?.x ?? 0,
                    y: player.offset?.y ?? 0
                }
            };
        }
    }
    return players.length;
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
    const applyStats = measure(iterations, (iteration) => applySnapshot(snapshotString, iteration, cache));
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
