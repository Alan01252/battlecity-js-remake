#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeTankMuzzlePosition, normaliseDirection } from '../src/effects/muzzleFlash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, '../debug-output');

const HEADING_STEPS = [
    { label: '000', step: 0 },
    { label: '090', step: 8 },
    { label: '180', step: 16 },
    { label: '270', step: 24 },
];

const IMAGE_SIZE = 64;
const TANK_SIZE = 48;
const OFFSET = { x: 8, y: 8 }; // centre 48px tank within 64px canvas

const COLORS = {
    background: [0, 0, 0],
    tank: [120, 120, 120],
    barrel: [180, 180, 180],
    muzzle: [255, 40, 40],
    centre: [40, 255, 80],
};

const writePPM = (filePath, pixels) => {
    const header = `P3\n${IMAGE_SIZE} ${IMAGE_SIZE}\n255\n`;
    const body = pixels.map((row) =>
        row.map((pixel) => pixel.join(' ')).join(' ')
    ).join('\n');
    fs.writeFileSync(filePath, header + body + '\n', 'utf8');
};

const createBlankImage = () =>
    Array.from({ length: IMAGE_SIZE }, () =>
        Array.from({ length: IMAGE_SIZE }, () => COLORS.background.slice())
    );

const drawTank = (image) => {
    for (let y = 0; y < TANK_SIZE; y += 1) {
        for (let x = 0; x < TANK_SIZE; x += 1) {
            const px = OFFSET.x + x;
            const py = OFFSET.y + y;
            if (px >= 0 && px < IMAGE_SIZE && py >= 0 && py < IMAGE_SIZE) {
                image[py][px] = COLORS.tank.slice();
            }
        }
    }

    const centreX = Math.round(OFFSET.x + (TANK_SIZE / 2));
    const centreY = Math.round(OFFSET.y + (TANK_SIZE / 2));
    image[centreY][centreX] = COLORS.centre.slice();
};

const drawLine = (image, x0, y0, x1, y1, color) => {
    let dx = Math.abs(x1 - x0);
    let sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0);
    let sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;

    while (true) {
        if (x0 >= 0 && x0 < IMAGE_SIZE && y0 >= 0 && y0 < IMAGE_SIZE) {
            image[y0][x0] = color.slice();
        }
        if (x0 === x1 && y0 === y1) {
            break;
        }
        const e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x0 += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y0 += sy;
        }
    }
};

const drawMarker = (image, x, y, color) => {
    for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
            const px = x + dx;
            const py = y + dy;
            if (px >= 0 && px < IMAGE_SIZE && py >= 0 && py < IMAGE_SIZE) {
                image[py][px] = color.slice();
            }
        }
    }
};

const ensureOutputDir = () => {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
};

const createVisualisations = () => {
    ensureOutputDir();
    const tankCentreX = Math.round(OFFSET.x + (TANK_SIZE / 2));
    const tankCentreY = Math.round(OFFSET.y + (TANK_SIZE / 2));

    HEADING_STEPS.forEach(({ label, step }) => {
        const normalised = normaliseDirection(step);
        const muzzle = computeTankMuzzlePosition(OFFSET, normalised);
        const image = createBlankImage();
        drawTank(image);
        drawLine(image, tankCentreX, tankCentreY, Math.round(muzzle.x), Math.round(muzzle.y), COLORS.barrel);

        const muzzleX = Math.round(muzzle.x);
        const muzzleY = Math.round(muzzle.y);
        if (muzzleX >= 0 && muzzleX < IMAGE_SIZE && muzzleY >= 0 && muzzleY < IMAGE_SIZE) {
            drawMarker(image, muzzleX, muzzleY, COLORS.muzzle);
        }

        const fileName = `muzzle-${label}.ppm`;
        const filePath = path.join(OUTPUT_DIR, fileName);
        writePPM(filePath, image);
        console.log(`Generated ${fileName} (dir=${normalised}, muzzle=[${muzzleX}, ${muzzleY}])`);
    });
};

createVisualisations();
