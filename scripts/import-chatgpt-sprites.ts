/**
 * Imports ChatGPT Images 2.0 sprite sheets into the runtime sprite folder.
 *
 * Expected input files in the repo root:
 *   P1.png - material blocks
 *   P2.png - king, crown, cannon, projectile
 *   P3.png - terrain, lava, wind, rock
 *   P4.png - explosions and sparks
 *
 * The script slices the large sheets, trims transparent padding inside each
 * crop, resizes to the exact dimensions used by the renderer, and rewrites
 * public/sprites/manifest.json.
 */

import { createCanvas, loadImage, type Canvas, type CanvasRenderingContext2D, type Image } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'public', 'sprites');

interface CropBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface SpriteSpec {
    source: string;
    name: string;
    crop: CropBox;
    width: number;
    height: number;
    flipX?: boolean;
    fit?: 'contain' | 'fill';
    processor?: 'seamlessTile';
    trim?: boolean;
    trimThreshold?: number;
}

interface ManifestEntry {
    name: string;
    width: number;
    height: number;
    path: string;
}

const BLOCK_COLUMNS = ['wood', 'stone', 'ice', 'rubber', 'steel'] as const;
const BLOCK_ROWS = [
    { suffix: '', y: 84 },
    { suffix: '_damaged', y: 281 },
    { suffix: '_critical', y: 667 },
] as const;
const BLOCK_X = [54, 249, 443, 620, 800];

const specs: SpriteSpec[] = [
    ...BLOCK_ROWS.flatMap((row) =>
        BLOCK_COLUMNS.map((material, index) => ({
            source: 'P1.png' as const,
            name: `block_${material}${row.suffix}`,
            crop: { x: BLOCK_X[index], y: row.y, w: 178, h: 174 },
            width: 32,
            height: 32,
            trim: true,
        }))
    ),

    { source: 'P2.png', name: 'king_idle_0', crop: { x: 132, y: 205, w: 120, h: 210 }, width: 24, height: 24, trim: true },
    { source: 'P2.png', name: 'king_idle_1', crop: { x: 322, y: 205, w: 120, h: 210 }, width: 24, height: 24, trim: true },
    { source: 'P2.png', name: 'king_hit', crop: { x: 538, y: 200, w: 165, h: 215 }, width: 24, height: 24, trim: true },
    { source: 'P2.png', name: 'crown', crop: { x: 786, y: 235, w: 130, h: 125 }, width: 12, height: 12, trim: true },
    { source: 'P2.png', name: 'cannon_right', crop: { x: 82, y: 520, w: 270, h: 155 }, width: 32, height: 16, trim: true },
    { source: 'P2.png', name: 'cannon_left', crop: { x: 82, y: 520, w: 270, h: 155 }, width: 32, height: 16, trim: true, flipX: true },
    { source: 'P2.png', name: 'projectile', crop: { x: 326, y: 720, w: 135, h: 140 }, width: 12, height: 12, trim: true },
    { source: 'P2.png', name: 'projectile_trail', crop: { x: 532, y: 716, w: 445, h: 132 }, width: 8, height: 8, trim: true },

    { source: 'P3.png', name: 'terrain_grass', crop: { x: 72, y: 82, w: 285, h: 155 }, width: 32, height: 8, trim: true, fit: 'fill' },
    { source: 'P3.png', name: 'terrain_earth', crop: { x: 418, y: 116, w: 196, h: 88 }, width: 256, height: 256, trim: false, processor: 'seamlessTile' },
    { source: 'P3.png', name: 'terrain_deep', crop: { x: 706, y: 116, w: 205, h: 88 }, width: 256, height: 256, trim: false, processor: 'seamlessTile' },
    { source: 'P3.png', name: 'lava_0', crop: { x: 72, y: 310, w: 285, h: 145 }, width: 32, height: 16, trim: true, fit: 'fill' },
    { source: 'P3.png', name: 'lava_1', crop: { x: 395, y: 310, w: 250, h: 145 }, width: 32, height: 16, trim: true, fit: 'fill' },
    { source: 'P3.png', name: 'lava_2', crop: { x: 685, y: 310, w: 255, h: 145 }, width: 32, height: 16, trim: true, fit: 'fill' },
    { source: 'P3.png', name: 'lava_3', crop: { x: 78, y: 526, w: 280, h: 125 }, width: 32, height: 16, trim: true, fit: 'fill' },
    { source: 'P3.png', name: 'wind_streak', crop: { x: 78, y: 726, w: 320, h: 115 }, width: 16, height: 4, trim: true, fit: 'fill' },
    { source: 'P3.png', name: 'rock', crop: { x: 759, y: 680, w: 210, h: 205 }, width: 16, height: 16, trim: true },

    { source: 'P4.png', name: 'explosion_0', crop: { x: 100, y: 168, w: 150, h: 150 }, width: 32, height: 32, trim: true },
    { source: 'P4.png', name: 'explosion_1', crop: { x: 275, y: 160, w: 185, h: 170 }, width: 32, height: 32, trim: true },
    { source: 'P4.png', name: 'explosion_2', crop: { x: 500, y: 145, w: 215, h: 190 }, width: 32, height: 32, trim: true },
    { source: 'P4.png', name: 'explosion_3', crop: { x: 733, y: 145, w: 235, h: 190 }, width: 32, height: 32, trim: true },
    { source: 'P4.png', name: 'spark_0', crop: { x: 164, y: 706, w: 110, h: 115 }, width: 16, height: 16, trim: true },
    { source: 'P4.png', name: 'spark_1', crop: { x: 455, y: 680, w: 160, h: 145 }, width: 16, height: 16, trim: true },
    { source: 'P4.png', name: 'spark_2', crop: { x: 100, y: 168, w: 150, h: 150 }, width: 16, height: 16, trim: true },

    { source: 'P6.png', name: 'ui_logo_crest', crop: { x: 54, y: 75, w: 250, h: 250 }, width: 64, height: 64, trim: true },
    { source: 'P6.png', name: 'ui_crown_emblem', crop: { x: 365, y: 82, w: 278, h: 190 }, width: 64, height: 64, trim: true },
    { source: 'P6.png', name: 'ui_battle_cannons', crop: { x: 700, y: 88, w: 250, h: 190 }, width: 48, height: 48, trim: true },
    { source: 'P6.png', name: 'ui_room_key', crop: { x: 385, y: 372, w: 230, h: 225 }, width: 32, height: 32, trim: true },
    { source: 'P6.png', name: 'ui_ai_orb', crop: { x: 720, y: 365, w: 220, h: 220 }, width: 48, height: 48, trim: true },
    { source: 'P6.png', name: 'ui_banner', crop: { x: 756, y: 688, w: 155, h: 205 }, width: 48, height: 48, trim: true },

    { source: 'P7.png', name: 'ui_howto_scroll', crop: { x: 70, y: 375, w: 235, h: 210 }, width: 32, height: 32, trim: true },
    { source: 'P7.png', name: 'ui_chat_bubble', crop: { x: 405, y: 390, w: 230, h: 170 }, width: 32, height: 32, trim: true },
    { source: 'P7.png', name: 'ui_trophy', crop: { x: 80, y: 675, w: 215, h: 190 }, width: 32, height: 32, trim: true },
    { source: 'P7.png', name: 'ui_rematch', crop: { x: 405, y: 672, w: 225, h: 190 }, width: 32, height: 32, trim: true },
    { source: 'P7.png', name: 'ui_timer_hourglass', crop: { x: 745, y: 655, w: 180, h: 220 }, width: 32, height: 32, trim: true },

    { source: 'P8.png', name: 'avatar_knight', crop: { x: 380, y: 92, w: 270, h: 250 }, width: 64, height: 64, trim: true },
    { source: 'P8.png', name: 'avatar_wizard', crop: { x: 380, y: 672, w: 260, h: 235 }, width: 64, height: 64, trim: true },
    { source: 'P8.png', name: 'avatar_engineer', crop: { x: 708, y: 672, w: 245, h: 235 }, width: 64, height: 64, trim: true },

    { source: 'P9.png', name: 'menu_castle_left', crop: { x: 65, y: 110, w: 245, h: 225 }, width: 160, height: 120, trim: true },
    { source: 'P9.png', name: 'menu_castle_center', crop: { x: 370, y: 70, w: 285, h: 285 }, width: 180, height: 140, trim: true },
    { source: 'P9.png', name: 'menu_castle_right', crop: { x: 700, y: 115, w: 255, h: 220 }, width: 160, height: 120, trim: true },
    { source: 'P9.png', name: 'menu_castle_wall', crop: { x: 365, y: 465, w: 305, h: 170 }, width: 180, height: 90, trim: true },

    { source: 'P13.png', name: 'ui_ready_shield', crop: { x: 50, y: 88, w: 135, h: 130 }, width: 32, height: 32, trim: true },
    { source: 'P13.png', name: 'ui_api_key', crop: { x: 192, y: 88, w: 155, h: 130 }, width: 32, height: 32, trim: true },
    { source: 'P13.png', name: 'ui_mute', crop: { x: 362, y: 88, w: 115, h: 130 }, width: 32, height: 32, trim: true },
    { source: 'P13.png', name: 'ui_warning', crop: { x: 525, y: 88, w: 125, h: 130 }, width: 32, height: 32, trim: true },
    { source: 'P13.png', name: 'ui_solo', crop: { x: 692, y: 86, w: 125, h: 130 }, width: 32, height: 32, trim: true },
    { source: 'P13.png', name: 'ui_pvp', crop: { x: 855, y: 86, w: 130, h: 130 }, width: 32, height: 32, trim: true },
    { source: 'P13.png', name: 'avatar_king', crop: { x: 520, y: 268, w: 140, h: 165 }, width: 64, height: 64, trim: true },
    { source: 'P13.png', name: 'avatar_opponent', crop: { x: 688, y: 270, w: 150, h: 160 }, width: 64, height: 64, trim: true },
    { source: 'P13.png', name: 'shape_pillar_wood', crop: { x: 52, y: 258, w: 120, h: 185 }, width: 24, height: 48, trim: true },
    { source: 'P13.png', name: 'shape_pillar_stone', crop: { x: 212, y: 258, w: 120, h: 185 }, width: 24, height: 48, trim: true },
    { source: 'P13.png', name: 'shape_pillar_ice', crop: { x: 370, y: 258, w: 120, h: 185 }, width: 24, height: 48, trim: true },
    { source: 'P13.png', name: 'shape_pillar_rubber', crop: { x: 535, y: 455, w: 120, h: 185 }, width: 24, height: 48, trim: true },
    { source: 'P13.png', name: 'shape_pillar_steel', crop: { x: 695, y: 455, w: 120, h: 185 }, width: 24, height: 48, trim: true },
    { source: 'P13.png', name: 'shape_pillar_preview', crop: { x: 858, y: 455, w: 120, h: 185 }, width: 24, height: 48, trim: true },
    { source: 'P13.png', name: 'shape_beam_wood', crop: { x: 190, y: 690, w: 280, h: 90 }, width: 64, height: 24, trim: true },
    { source: 'P13.png', name: 'shape_beam_stone', crop: { x: 190, y: 840, w: 280, h: 90 }, width: 64, height: 24, trim: true },
    { source: 'P13.png', name: 'shape_beam_ice', crop: { x: 525, y: 690, w: 280, h: 90 }, width: 64, height: 24, trim: true },
    { source: 'P13.png', name: 'shape_beam_rubber', crop: { x: 525, y: 840, w: 280, h: 90 }, width: 64, height: 24, trim: true },
    { source: 'P13.png', name: 'shape_beam_steel', crop: { x: 820, y: 690, w: 155, h: 90 }, width: 64, height: 24, trim: true },
    { source: 'P13.png', name: 'shape_beam_preview', crop: { x: 820, y: 840, w: 155, h: 90 }, width: 64, height: 24, trim: true },
];

function requireInputs() {
    const missing = [...new Set(specs.map((spec) => spec.source))]
        .map((source) => path.join(ROOT_DIR, source))
        .filter((filePath) => !fs.existsSync(filePath));

    if (missing.length > 0) {
        throw new Error(`Missing input sheet(s): ${missing.map((filePath) => path.basename(filePath)).join(', ')}`);
    }
}

async function loadSources() {
    const sources = new Map<SpriteSpec['source'], Image>();
    for (const source of new Set(specs.map((spec) => spec.source))) {
        sources.set(source, await loadImage(path.join(ROOT_DIR, source)));
    }
    return sources;
}

function cropImage(source: Image, crop: CropBox): Canvas {
    const canvas = createCanvas(crop.w, crop.h);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, crop.w, crop.h);
    ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    return canvas;
}

function findAlphaBounds(canvas: Canvas, threshold: number): CropBox | null {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > threshold) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }

    if (maxX < minX || maxY < minY) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function trimCanvas(canvas: Canvas, threshold: number): Canvas {
    const bounds = findAlphaBounds(canvas, threshold);
    if (!bounds) return canvas;

    const trimmed = createCanvas(bounds.w, bounds.h);
    const ctx = trimmed.getContext('2d');
    ctx.drawImage(canvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
    return trimmed;
}

function drawContained(ctx: CanvasRenderingContext2D, source: Canvas, outW: number, outH: number) {
    const scale = Math.min(outW / source.width, outH / source.height);
    const drawW = Math.max(1, Math.round(source.width * scale));
    const drawH = Math.max(1, Math.round(source.height * scale));
    const x = Math.round((outW - drawW) / 2);
    const y = Math.round((outH - drawH) / 2);
    ctx.drawImage(source, x, y, drawW, drawH);
}

function resizeSprite(canvas: Canvas, spec: SpriteSpec): Canvas {
    if (spec.processor === 'seamlessTile') {
        return createSeamlessTile(canvas, spec.width, spec.height);
    }

    const output = createCanvas(spec.width, spec.height);
    const ctx = output.getContext('2d');
    ctx.clearRect(0, 0, spec.width, spec.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (spec.flipX) {
        ctx.translate(spec.width, 0);
        ctx.scale(-1, 1);
    }

    if (spec.fit === 'fill') {
        ctx.drawImage(canvas, 0, 0, spec.width, spec.height);
    } else {
        drawContained(ctx, canvas, spec.width, spec.height);
    }
    return output;
}

function createSeamlessTile(source: Canvas, outW: number, outH: number): Canvas {
    const palette = samplePalette(source);
    const output = createCanvas(outW, outH);
    const ctx = output.getContext('2d');
    const rng = createRng(0x6d2b79f5);

    ctx.fillStyle = palette.base;
    ctx.fillRect(0, 0, outW, outH);

    for (let i = 0; i < 180; i++) {
        const x = rng() * outW;
        const y = rng() * outH;
        const rx = 2 + rng() * 9;
        const ry = 2 + rng() * 7;
        const color = palette.pebbles[Math.floor(rng() * palette.pebbles.length)];
        drawWrappedEllipse(ctx, outW, outH, x, y, rx, ry, color, 0.52 + rng() * 0.32);
    }

    for (let i = 0; i < 70; i++) {
        const x = rng() * outW;
        const y = rng() * outH;
        const rx = 8 + rng() * 22;
        const ry = 5 + rng() * 14;
        const color = rng() > 0.5 ? palette.shadow : palette.mid;
        drawWrappedEllipse(ctx, outW, outH, x, y, rx, ry, color, 0.16 + rng() * 0.16);
    }

    return output;
}

interface TerrainPalette {
    base: string;
    mid: string;
    shadow: string;
    pebbles: string[];
}

function samplePalette(source: Canvas): TerrainPalette {
    const ctx = source.getContext('2d');
    const image = ctx.getImageData(0, 0, source.width, source.height);
    const colors: Array<[number, number, number]> = [];

    for (let y = 0; y < source.height; y += 3) {
        for (let x = 0; x < source.width; x += 3) {
            const index = (y * source.width + x) * 4;
            if (image.data[index + 3] < 32) continue;
            colors.push([image.data[index], image.data[index + 1], image.data[index + 2]]);
        }
    }

    colors.sort((a, b) => luminance(a) - luminance(b));
    const pick = (ratio: number) => colors[Math.min(colors.length - 1, Math.floor(colors.length * ratio))] ?? [92, 55, 32];
    return {
        shadow: rgb(pick(0.18)),
        base: rgb(pick(0.46)),
        mid: rgb(pick(0.62)),
        pebbles: [rgb(pick(0.28)), rgb(pick(0.55)), rgb(pick(0.76)), rgb(pick(0.88))],
    };
}

function luminance([r, g, b]: [number, number, number]) {
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function rgb([r, g, b]: [number, number, number]) {
    return `rgb(${r}, ${g}, ${b})`;
}

function createRng(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0xffffffff;
    };
}

function drawWrappedEllipse(
    ctx: CanvasRenderingContext2D,
    tileW: number,
    tileH: number,
    x: number,
    y: number,
    rx: number,
    ry: number,
    color: string,
    alpha: number
) {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;

    for (const ox of [-tileW, 0, tileW]) {
        for (const oy of [-tileH, 0, tileH]) {
            ctx.beginPath();
            ctx.ellipse(x + ox, y + oy, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.globalAlpha = 1;
}

function saveSprite(spec: SpriteSpec, canvas: Canvas): ManifestEntry {
    const filePath = path.join(OUT_DIR, `${spec.name}.png`);
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
    return {
        name: spec.name,
        width: spec.width,
        height: spec.height,
        path: `/sprites/${spec.name}.png`,
    };
}

async function main() {
    requireInputs();
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const sources = await loadSources();
    const manifest: ManifestEntry[] = [];

    for (const spec of specs) {
        const source = sources.get(spec.source);
        if (!source) throw new Error(`Source was not loaded: ${spec.source}`);

        const cropped = cropImage(source, spec.crop);
        const trimmed = spec.trim === false ? cropped : trimCanvas(cropped, spec.trimThreshold ?? 10);
        const resized = resizeSprite(trimmed, spec);
        manifest.push(saveSprite(spec, resized));
        console.log(`Imported ${spec.name}.png (${spec.width}x${spec.height})`);
    }

    fs.writeFileSync(
        path.join(OUT_DIR, 'manifest.json'),
        `${JSON.stringify({ sprites: manifest }, null, 2)}\n`
    );
    console.log(`Wrote ${manifest.length} sprites and manifest.json`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
