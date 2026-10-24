import { createCanvas, loadImage, type Canvas } from 'canvas';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'asset-workbench/battle-v5');
const specs = [
    { name: 'sky', width: 1920, opaque: true },
    { name: 'valley', width: 1920, preserve: true },
    { name: 'cloud', width: 900 },
    { name: 'earth', width: 1024, opaque: true, periodic: true },
    { name: 'grass', width: 1024, periodic: true },
    { name: 'stone', width: 512, opaque: true },
    { name: 'hud', width: 1200 },
    { name: 'fire', width: 700 },
] as const;

function inspect(pixels: Uint8ClampedArray | Buffer, width: number, height: number) {
    let x = width, y = height, right = -1, bottom = -1, clear = 0;
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
        const a = pixels[(py * width + px) * 4 + 3];
        if (!a) clear++;
        if (a < 8) continue;
        x = Math.min(x, px); y = Math.min(y, py); right = Math.max(right, px); bottom = Math.max(bottom, py);
    }
    if (right < x) throw new Error('Empty artwork');
    return { width, height, alpha: { clear: clear / (width * height) }, bounds: { x, y, width: right - x + 1, height: bottom - y + 1 } };
}

function analyze(canvas: Canvas) {
    return inspect(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
}

// Overlap the two ends, then wrap at contiguous source columns. Blend premultiplied alpha.
function periodic(source: Canvas) {
    const overlap = Math.round(source.width * 0.1), width = source.width - overlap;
    const output = createCanvas(width, source.height), ctx = output.getContext('2d');
    const input = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
    const result = ctx.createImageData(width, source.height);
    for (let y = 0; y < source.height; y++) for (let x = 0; x < width; x++) {
        const tail = (y * source.width + x + overlap) * 4, out = (y * width + x) * 4;
        const cross = x - (source.width - overlap * 2);
        if (cross < 0) { result.data.set(input.subarray(tail, tail + 4), out); continue; }
        const head = (y * source.width + cross) * 4;
        const t = cross / (overlap - 1), mix = t * t * (3 - 2 * t);
        const a = input[tail + 3] * (1 - mix), b = input[head + 3] * mix, alpha = a + b;
        for (let c = 0; c < 3; c++) result.data[out + c] = alpha ? (input[tail + c] * a + input[head + c] * b) / alpha : 0;
        result.data[out + 3] = alpha;
    }
    ctx.putImageData(result, 0, 0);
    return output;
}

async function main() {
    const entries = [], previews = [];
    fs.mkdirSync(path.join(folder, 'qa'), { recursive: true });
    for (const spec of specs) {
        const image = await loadImage(path.join(folder, `masters/${spec.name}.png`));
        const source = createCanvas(image.width, image.height);
        source.getContext('2d').drawImage(image, 0, 0);
        const sourceInfo = analyze(source);
        const opaque = 'opaque' in spec && spec.opaque;
        const repeats = 'periodic' in spec && spec.periodic;
        const preserve = 'preserve' in spec && spec.preserve;
        if (!opaque && sourceInfo.alpha.clear < 0.02) throw new Error(`${spec.name}: missing alpha`);
        const crop = opaque || preserve ? { x: 0, y: 0, width: image.width, height: image.height } : sourceInfo.bounds;
        const width = Math.min(spec.width, crop.width), height = Math.round(crop.height * width / crop.width);
        let canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
        if (repeats) canvas = periodic(canvas);
        const png = path.join(folder, `qa/${spec.name}.png`);
        fs.writeFileSync(png, canvas.toBuffer('image/png'));
        const target = path.join(folder, `runtime/${spec.name}.webp`);
        execFileSync('cwebp', ['-quiet', '-q', '94', '-alpha_q', '100', '-m', '6', png, '-o', target]);
        const decoded = execFileSync('ffmpeg', ['-v', 'error', '-i', target, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: canvas.width * canvas.height * 4 + 4096 });
        if (decoded.length !== canvas.width * canvas.height * 4) throw new Error('Runtime dimension mismatch');
        const actual = inspect(decoded, canvas.width, canvas.height);
        if (opaque && actual.alpha.clear) throw new Error(`${spec.name}: opaque texture has holes`);
        const seam = repeats ? Array.from({ length: canvas.height }, (_, y) => Math.abs(decoded[(y * canvas.width) * 4 + 3] - decoded[(y * canvas.width + canvas.width - 1) * 4 + 3])).reduce((a, b) => a + b, 0) / canvas.height : null;
        entries.push({ name: spec.name, path: `runtime/${spec.name}.webp`, source: `masters/${spec.name}.png`, ...actual,
            sourceInfo, crop, bytes: fs.statSync(target).size, periodic: repeats, alphaSeamMean: seam,
            ...(spec.name === 'grass' ? { surface: 0.15 } : {}),
            ...(spec.name === 'hud' ? { slice: 0.12 } : {}) });
        previews.push({ name: spec.name, canvas });
    }
    fs.writeFileSync(path.join(folder, 'manifest.json'), `${JSON.stringify({ version: 1, assets: entries }, null, 2)}\n`);
    const contact = createCanvas(1200, 1100), ctx = contact.getContext('2d');
    ctx.fillStyle = '#e5edf2'; ctx.fillRect(0, 0, contact.width, contact.height);
    previews.forEach(({ name, canvas }, i) => {
        const x = 15 + i % 2 * 595, y = 15 + Math.floor(i / 2) * 270;
        ctx.fillStyle = i % 2 ? '#245274' : '#fff'; ctx.fillRect(x, y, 580, 250);
        const scale = Math.min(560 / canvas.width, 215 / canvas.height);
        ctx.drawImage(canvas, x + (580 - canvas.width * scale) / 2, y + 5, canvas.width * scale, canvas.height * scale);
        ctx.fillStyle = i % 2 ? '#fff' : '#17324a'; ctx.font = 'bold 16px sans-serif'; ctx.fillText(name, x + 12, y + 238);
    });
    fs.writeFileSync(path.join(folder, 'qa/contact.png'), contact.toBuffer('image/png'));
    console.log(JSON.stringify(entries.map(({ name, width, height, bytes, alpha }) => ({ name, width, height, bytes, alpha })), null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
