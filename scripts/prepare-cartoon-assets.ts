/** Rebuild normalized cartoon assets and their import metadata from reviewed masters. */
import { createCanvas, loadImage, type Canvas, type CanvasRenderingContext2D } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'asset-workbench', 'cartoon-v1');
const runtimeDir = path.join(folder, 'runtime');
const qaDir = path.join(folder, 'qa');

type Point = { x: number; y: number };
type Bounds = { x: number; y: number; width: number; height: number };
interface AssetSpec {
    name: string;
    file: string;
    width: number;
    height: number;
    transparent: boolean;
    trim?: boolean;
    padding?: number;
    pivot?: Point;
}

const specs: AssetSpec[] = [
    { name: 'king', file: 'C02-king-master.png', width: 256, height: 320, transparent: true, padding: 20, pivot: { x: 0.56, y: 0.909 } },
    { name: 'cannon_base', file: 'C03-cannon-base.png', width: 512, height: 320, transparent: true, padding: 20, pivot: { x: 0.69, y: 0.38 } },
    { name: 'cannon_barrel', file: 'C04-cannon-barrel.png', width: 768, height: 320, transparent: true, padding: 24, pivot: { x: 0.282, y: 0.552 } },
    { name: 'wood_surface', file: 'C05-wood-surface.png', width: 512, height: 512, transparent: false, trim: false },
    { name: 'far_hills', file: 'C06-far-hills.png', width: 1536, height: 512, transparent: true, trim: false },
    { name: 'distant_fortress', file: 'C07-distant-fortress.png', width: 512, height: 448, transparent: true, padding: 32 },
];

function inspect(canvas: Canvas) {
    const { width, height } = canvas;
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let transparent = 0;
    let nearOpaque = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha === 0) transparent++;
            if (alpha >= 245) nearOpaque++;
            if (alpha <= 16) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }
    if (maxX < minX) throw new Error('Empty asset');
    return {
        width,
        height,
        transparentFraction: transparent / (width * height),
        nearOpaqueFraction: nearOpaque / (width * height),
        bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    };
}

function seamMetrics(canvas: Canvas) {
    const { width, height } = canvas;
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let horizontal = 0;
    let vertical = 0;
    for (let y = 0; y < height; y++) {
        for (let c = 0; c < 3; c++) {
            horizontal += Math.abs(data[(y * width) * 4 + c] - data[(y * width + width - 1) * 4 + c]);
        }
    }
    for (let x = 0; x < width; x++) {
        for (let c = 0; c < 3; c++) {
            vertical += Math.abs(data[x * 4 + c] - data[((height - 1) * width + x) * 4 + c]);
        }
    }
    return { horizontalMeanRgbDelta: horizontal / (height * 3), verticalMeanRgbDelta: vertical / (width * 3) };
}

function save(canvas: Canvas, filename: string) {
    fs.writeFileSync(filename, canvas.toBuffer('image/png'));
}

function board(width: number, height: number, color = '#edf5fb') {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    return { canvas, ctx };
}

function text(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size = 16, color = '#183647') {
    ctx.fillStyle = color;
    ctx.font = `600 ${size}px sans-serif`;
    ctx.fillText(label, x, y);
}

async function main() {
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.mkdirSync(qaDir, { recursive: true });
    const assets = new Map<string, { canvas: Canvas; pivot: Point }>();
    const manifest = [];

    for (const spec of specs) {
        const image = await loadImage(path.join(folder, 'masters', spec.file));
        const source = createCanvas(image.width, image.height);
        source.getContext('2d').drawImage(image, 0, 0);
        const sourceInfo = inspect(source);
        if (spec.transparent && sourceInfo.transparentFraction < 0.05) throw new Error(`${spec.name}: missing alpha`);
        if (!spec.transparent && sourceInfo.transparentFraction > 0) throw new Error(`${spec.name}: expected opaque surface`);

        const crop: Bounds = spec.trim === false
            ? { x: 0, y: 0, width: image.width, height: image.height }
            : sourceInfo.bounds;
        const padding = spec.padding ?? 0;
        const scale = Math.min((spec.width - padding * 2) / crop.width, (spec.height - padding * 2) / crop.height);
        const drawn = { width: crop.width * scale, height: crop.height * scale };
        const offset = { x: (spec.width - drawn.width) / 2, y: (spec.height - drawn.height) / 2 };
        const canvas = createCanvas(spec.width, spec.height);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, offset.x, offset.y, drawn.width, drawn.height);
        const pivot: Point = spec.pivot
            ? { x: (spec.pivot.x * image.width - crop.x) * scale + offset.x, y: (spec.pivot.y * image.height - crop.y) * scale + offset.y }
            : { x: spec.width / 2, y: offset.y + drawn.height };
        const outputInfo = inspect(canvas);
        const bounds = outputInfo.bounds;
        const edgePadding = Math.min(bounds.x, bounds.y, spec.width - bounds.x - bounds.width, spec.height - bounds.y - bounds.height);
        if (padding > 0 && edgePadding < padding - 1) throw new Error(`${spec.name}: clipped normalization`);
        const seams = spec.name === 'wood_surface' ? seamMetrics(canvas) : undefined;
        assets.set(spec.name, { canvas, pivot });
        save(canvas, path.join(runtimeDir, `${spec.name}.png`));
        manifest.push({
            name: spec.name,
            source: `masters/${spec.file}`,
            path: `runtime/${spec.name}.png`,
            sourceInfo,
            outputInfo,
            sourceTrim: crop,
            pivot,
            edgePadding,
            seams,
            status: 'Integrated in the cartoon battlefield; review changes before regenerating masters',
        });
    }

    const get = (name: string) => {
        const asset = assets.get(name);
        if (!asset) throw new Error(`Missing prepared asset: ${name}`);
        return asset;
    };
    const king = get('king');
    const base = get('cannon_base');
    const barrel = get('cannon_barrel');

    const drawKing = (ctx: CanvasRenderingContext2D, x: number, groundY: number, height: number) => {
        const scale = height / king.canvas.height;
        ctx.drawImage(king.canvas, x - king.pivot.x * scale, groundY - king.pivot.y * scale, king.canvas.width * scale, height);
    };

    const drawCannon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number) => {
        const baseScale = size / base.canvas.width;
        const barrelScale = size * 1.35 / barrel.canvas.width;
        const anchor = { x: x + base.pivot.x * baseScale, y: y + base.pivot.y * baseScale };
        ctx.save();
        ctx.translate(anchor.x, anchor.y);
        ctx.rotate(-angle * Math.PI / 180);
        ctx.drawImage(barrel.canvas, -barrel.pivot.x * barrelScale, -barrel.pivot.y * barrelScale, barrel.canvas.width * barrelScale, barrel.canvas.height * barrelScale);
        ctx.restore();
        ctx.drawImage(base.canvas, x, y, size, base.canvas.height * baseScale);
    };

    const contact = board(1200, 1100);
    text(contact.ctx, 'Fortress AI - cartoon asset study', 28, 36, 24);
    text(contact.ctx, 'Actual small-size silhouettes on light and dark backgrounds', 28, 66);
    for (const [row, color] of ['#ffffff', '#8fd0f3', '#253d4a'].entries()) {
        const y = 88 + row * 210;
        contact.ctx.fillStyle = color;
        contact.ctx.fillRect(24, y, 1152, 200);
        for (const [i, size] of [48, 64, 96].entries()) {
            drawKing(contact.ctx, 95 + i * 125, y + 166, size);
            text(contact.ctx, `${size}px canvas`, 54 + i * 125, y + 190, 12, row === 2 ? '#ffffff' : '#183647');
        }
        for (const [i, angle] of [0, 35, 65].entries()) {
            drawCannon(contact.ctx, 454 + i * 236, y + 106, 112, angle);
            text(contact.ctx, `${angle} degrees`, 475 + i * 236, y + 190, 12, row === 2 ? '#ffffff' : '#183647');
        }
    }
    text(contact.ctx, 'Separate background layers - castle anchored to the hills', 28, 755);
    contact.ctx.fillStyle = '#94d7fb';
    contact.ctx.fillRect(24, 770, 1152, 330);
    const hills = get('far_hills').canvas;
    const fortress = get('distant_fortress');
    const hillScale = 1152 / hills.width;
    const castleCenterX = 815;
    const hillColumn = Math.round((castleCenterX - 24) / hillScale);
    const hillPixels = hills.getContext('2d').getImageData(hillColumn, 0, 1, hills.height).data;
    let ridgeY = 0;
    while (ridgeY < hills.height - 1 && hillPixels[ridgeY * 4 + 3] < 200) ridgeY++;
    const castleScale = 150 / fortress.canvas.width;
    const groundY = 770 + ridgeY * hillScale + 9;
    contact.ctx.globalAlpha = 0.72;
    contact.ctx.drawImage(fortress.canvas, castleCenterX - fortress.pivot.x * castleScale, groundY - fortress.pivot.y * castleScale, 150, fortress.canvas.height * castleScale);
    contact.ctx.globalAlpha = 1;
    contact.ctx.drawImage(hills, 24, 770, 1152, 384);
    save(contact.canvas, path.join(qaDir, 'contact-sheet.png'));

    const tiles = board(900, 960, '#ffffff');
    text(tiles.ctx, 'Wood surface - 3 x 3 seam inspection', 24, 36, 24);
    const wood = get('wood_surface').canvas;
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) tiles.ctx.drawImage(wood, col * 300, 60 + row * 300, 300, 300);
    }
    save(tiles.canvas, path.join(qaDir, 'wood-3x3.png'));

    const sheet = { version: 1, purpose: 'Cartoon battlefield import metadata and visual QA', assets: manifest };
    fs.writeFileSync(path.join(folder, 'asset-manifest.json'), `${JSON.stringify(sheet, null, 2)}\n`);
    console.log(`Prepared ${manifest.length} individual runtime candidates and two QA sheets.`);
    for (const entry of manifest) {
        console.log(`${entry.name}: ${entry.outputInfo.width}x${entry.outputInfo.height}, alpha ${Math.round(entry.outputInfo.transparentFraction * 100)}%, padding ${entry.edgePadding}px`);
        if (entry.seams) console.log(`  seam mean RGB deltas: ${entry.seams.horizontalMeanRgbDelta.toFixed(2)} / ${entry.seams.verticalMeanRgbDelta.toFixed(2)}`);
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
