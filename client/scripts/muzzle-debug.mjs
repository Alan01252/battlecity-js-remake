#!/usr/bin/env node

import { computeTankMuzzlePosition, normaliseDirection } from '../src/effects/muzzleFlash.js';
import MUZZLE_OFFSETS from '../src/data/muzzleOffsets.js';

const headings = [
    { label: '0°', step: 0 },
    { label: '90°', step: 8 },
    { label: '180°', step: 16 },
    { label: '270°', step: 24 },
];

const offset = { x: 200, y: 200 };

const computeLegacyPosition = (playerOffset, directionStep) => {
    const angleDegrees = (directionStep / 32) * 360;
    const radians = (angleDegrees * Math.PI) / 180;
    const xComponent = Math.sin(radians);
    const yComponent = Math.cos(radians) * -1;
    return {
        x: ((playerOffset.x) + 24) + (xComponent * 30),
        y: ((playerOffset.y) + 24) + (yComponent * 30),
    };
};

const rows = headings.map(({ label, step }) => {
    const normalised = normaliseDirection(step);
    const legacy = computeLegacyPosition(offset, normalised);
    const modern = computeTankMuzzlePosition(offset, normalised);
    return {
        heading: label,
        step: normalised,
        frame: modern.frameIndex,
        legacyX: legacy.x.toFixed(2),
        legacyY: legacy.y.toFixed(2),
        modernX: modern.x.toFixed(2),
        modernY: modern.y.toFixed(2),
        offsetX: MUZZLE_OFFSETS[modern.frameIndex]?.x.toFixed(2) ?? 'n/a',
        offsetY: MUZZLE_OFFSETS[modern.frameIndex]?.y.toFixed(2) ?? 'n/a',
        deltaX: (modern.x - legacy.x).toFixed(2),
        deltaY: (modern.y - legacy.y).toFixed(2),
    };
});

console.table(rows);
