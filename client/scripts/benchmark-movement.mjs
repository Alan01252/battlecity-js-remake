#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

const MOVEMENT_SPEED_PLAYER = 0.50;
const MAX_VELOCITY = 20;
const PI_APPROX = 3.14;
const DIRECTION_STEPS = 32;

const clampVelocity = (value) => {
    if (value > MAX_VELOCITY) {
        return MAX_VELOCITY;
    }
    if (value < -MAX_VELOCITY) {
        return -MAX_VELOCITY;
    }
    return value;
};

const directionVectors = Array.from({ length: DIRECTION_STEPS }, (_value, direction) => {
    const angle = (-direction / 16) * Math.PI;
    return {
        sin: Math.sin(angle),
        cos: Math.cos(angle)
    };
});

const normaliseDirection = (direction) => {
    if (!Number.isFinite(direction)) {
        return 0;
    }
    let normalised = Math.round(direction) % DIRECTION_STEPS;
    if (normalised < 0) {
        normalised += DIRECTION_STEPS;
    }
    return normalised;
};

const getDirectionVector = (direction) => directionVectors[normaliseDirection(direction)];

const originalMovePlayer = (game) => {
    const player = game.player;
    const fDir = -player.direction;
    let velocity = (
        Math.sin((fDir / 16) * PI_APPROX) *
        player.isMoving *
        (game.timePassed * MOVEMENT_SPEED_PLAYER)
    );
    velocity = clampVelocity(velocity);
    player.offset.x += velocity;

    velocity = (
        Math.cos((fDir / 16) * PI_APPROX) *
        player.isMoving *
        (game.timePassed * MOVEMENT_SPEED_PLAYER)
    );
    velocity = clampVelocity(velocity);
    player.offset.y += velocity;
};

const optimisedMovePlayer = (game) => {
    const player = game.player;
    const directionVector = getDirectionVector(player.direction);
    const movementScale = player.isMoving * (game.timePassed * MOVEMENT_SPEED_PLAYER);
    const velocityX = clampVelocity(directionVector.sin * movementScale);
    player.offset.x += velocityX;
    const velocityY = clampVelocity(directionVector.cos * movementScale);
    player.offset.y += velocityY;
};

const randomDirections = (() => {
    const options = [-1, 0, 1];
    const entries = new Array(10000);
    for (let index = 0; index < entries.length; index += 1) {
        entries[index] = {
            direction: Math.floor(Math.random() * DIRECTION_STEPS),
            isMoving: options[Math.floor(Math.random() * options.length)],
            timePassed: 14 + (Math.random() * 6)
        };
    }
    return entries;
})();

const benchmark = (label, fn, iterations = 500) => {
    const player = {
        offset: { x: 0, y: 0 },
        direction: 0,
        isMoving: 0
    };
    const game = { player, timePassed: 16 };
    const start = performance.now();
    for (let cycle = 0; cycle < iterations; cycle += 1) {
        for (let idx = 0; idx < randomDirections.length; idx += 1) {
            const sample = randomDirections[idx];
            player.offset.x = 0;
            player.offset.y = 0;
            player.direction = sample.direction;
            player.isMoving = sample.isMoving;
            game.timePassed = sample.timePassed;
            fn(game);
        }
    }
    const duration = performance.now() - start;
    console.log(`${label}: ${(duration).toFixed(2)} ms`);
    return duration;
};

const originalDuration = benchmark('original movePlayer', originalMovePlayer);
const optimisedDuration = benchmark('optimised movePlayer', optimisedMovePlayer);
const improvement = ((originalDuration - optimisedDuration) / originalDuration) * 100;
console.log(`Improvement: ${improvement.toFixed(2)}% faster`);

const UNSTICK_DIRECTIONS = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: -1 },
];

const bfsIterations = 5000;
const MAX_DISTANCE = 12;

const runBfsWithShift = () => {
    const queue = [{ x: 0, y: 0, distance: 0 }];
    const visited = new Set();
    while (queue.length) {
        const node = queue.shift();
        const key = `${node.x},${node.y}`;
        if (visited.has(key)) {
            continue;
        }
        visited.add(key);
        if (node.distance >= MAX_DISTANCE) {
            continue;
        }
        for (const direction of UNSTICK_DIRECTIONS) {
            queue.push({
                x: node.x + direction.dx,
                y: node.y + direction.dy,
                distance: node.distance + 1
            });
        }
    }
};

const runBfsWithHeadIndex = () => {
    const queue = [{ x: 0, y: 0, distance: 0 }];
    let head = 0;
    const visited = new Set();
    while (head < queue.length) {
        const node = queue[head++];
        const key = `${node.x},${node.y}`;
        if (visited.has(key)) {
            continue;
        }
        visited.add(key);
        if (node.distance >= MAX_DISTANCE) {
            continue;
        }
        for (const direction of UNSTICK_DIRECTIONS) {
            queue.push({
                x: node.x + direction.dx,
                y: node.y + direction.dy,
                distance: node.distance + 1
            });
        }
    }
};

const benchmarkBfs = (label, fn) => {
    const start = performance.now();
    for (let index = 0; index < bfsIterations; index += 1) {
        fn();
    }
    const duration = performance.now() - start;
    console.log(`${label}: ${duration.toFixed(2)} ms`);
    return duration;
};

const bfsShiftDuration = benchmarkBfs('BFS queue (Array.shift)', runBfsWithShift);
const bfsHeadDuration = benchmarkBfs('BFS queue (head index)', runBfsWithHeadIndex);
const bfsImprovement = ((bfsShiftDuration - bfsHeadDuration) / bfsShiftDuration) * 100;
console.log(`BFS Improvement: ${bfsImprovement.toFixed(2)}% faster`);
