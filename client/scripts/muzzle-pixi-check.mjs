#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const createCanvas = () => {
    const data = Buffer.alloc(64 * 64 * 4, 0);
    return {
        width: 64,
        height: 64,
        getContext: () => ({
            canvas: {},
            fillStyle: null,
            fillRect: () => {},
            drawImage: () => {},
            getImageData: () => ({ data }),
            putImageData: () => {},
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createPattern: () => ({}),
            clearRect: () => {},
            globalCompositeOperation: null,
            save: () => {},
            restore: () => {},
            translate: () => {},
            rotate: () => {},
            scale: () => {},
            transform: () => {},
            setTransform: () => {},
            beginPath: () => {},
            arc: () => {},
            stroke: () => {},
            lineTo: () => {},
            moveTo: () => {},
            closePath: () => {},
            rect: () => {},
            clip: () => {},
            quadraticCurveTo: () => {},
            bezierCurveTo: () => {},
            strokeStyle: null,
            lineWidth: 1,
            globalAlpha: 1,
            font: '',
            textAlign: 'left',
            textBaseline: 'alphabetic',
            fillText: () => {},
            measureText: () => ({ width: 0 })
        })
    };
};

if (typeof global.window === 'undefined') {
    global.window = {
        document: {
            createElement: () => createCanvas(),
        },
        navigator: { userAgent: 'node' }
    };
}

if (typeof global.document === 'undefined') {
    global.document = {
        createElement: () => createCanvas(),
    };
}

const { default: PIXI } = await import('pixi.js');
const { Application, Sprite, Assets, Rectangle } = PIXI;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, '../debug-output');
const SPRITE_PATH = path.resolve(__dirname, '../data/imgTanks.png');

const ROW_INDEX = 1; // Mayor row
const TILE_SIZE = 48;
const HEADING_STEPS = Array.from({ length: 32 }, (_, i) => i);

const ensureOutputDir = () => {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
};

import { computeTankMuzzlePosition, normaliseDirection } from '../src/effects/muzzleFlash.js';

const renderHeading = async (app, sprite, texture, step) => {
    const frameIndex = Math.floor(step / 2);
    const frame = new Rectangle(frameIndex * TILE_SIZE, ROW_INDEX * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    texture.frame = frame;
    texture.updateUvs();

    const renderTexture = app.renderer.generateTexture(sprite, { region: new Rectangle(0, 0, TILE_SIZE, TILE_SIZE) });
    const pixels = app.renderer.extract.pixels(renderTexture);

    const muzzle = computeTankMuzzlePosition({ x: 0, y: 0 }, step);
    const x = Math.round(muzzle.x - (sprite.x - TILE_SIZE / 2));
    const y = Math.round(muzzle.y - (sprite.y - TILE_SIZE / 2));

    const width = TILE_SIZE;
    const height = TILE_SIZE;

    const clampedX = Math.max(0, Math.min(width - 1, x));
    const clampedY = Math.max(0, Math.min(height - 1, y));

    const index = ((clampedY * width) + clampedX) * 4;
    const sample = {
        r: pixels[index],
        g: pixels[index + 1],
        b: pixels[index + 2],
        a: pixels[index + 3]
    };

    return {
        step,
        frameIndex,
        muzzle: { x, y },
        sample,
        isMagenta: sample.r === 255 && sample.g === 0 && sample.b === 255,
        isTransparent: sample.a === 0
    };
};

const run = async () => {
    ensureOutputDir();

    const app = new Application();
    await app.init({ width: TILE_SIZE, height: TILE_SIZE, backgroundAlpha: 0, preserveDrawingBuffer: true });

    const baseTexture = await Assets.load(SPRITE_PATH);
    const texture = new PIXI.Texture(baseTexture);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(TILE_SIZE / 2, TILE_SIZE / 2);

    const results = [];
    for (const step of HEADING_STEPS) {
        const normalised = normaliseDirection(step);
        const result = await renderHeading(app, sprite, texture, normalised);
        const base = (TILE_SIZE / 2);
        result.distance = Math.hypot(result.muzzle.x - base, result.muzzle.y - base);
        results.push(result);
    }

    const reportPath = path.join(OUTPUT_DIR, 'muzzle-pixi-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`Wrote ${reportPath}`);
    console.table(results);

    app.destroy(true);
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
