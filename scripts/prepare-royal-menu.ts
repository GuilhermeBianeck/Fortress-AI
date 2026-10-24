import { createCanvas, loadImage, type Canvas } from 'canvas';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'asset-workbench/royal-menu-v4');
const specs = [
    { name: 'courtyard', width: 1600, opaque: true },
    { name: 'panel', width: 1100 },
    { name: 'logo', width: 1200 },
    { name: 'button_emerald', width: 900 },
    { name: 'button_sapphire', width: 600 },
    { name: 'field', width: 900 },
    { name: 'torch', width: 160 },
    { name: 'banner_red', width: 256 },
] as const;

function inspect(pixels: Uint8ClampedArray | Buffer, width: number, height: number) {
    let x = width, y = height, right = -1, bottom = -1, clear = 0, soft = 0;
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
        const alpha = pixels[(py * width + px) * 4 + 3];
        if (!alpha) clear++;
        if (alpha > 0 && alpha < 245) soft++;
        if (alpha < 8) continue;
        x = Math.min(x, px); y = Math.min(y, py); right = Math.max(right, px); bottom = Math.max(bottom, py);
    }
    if (right < x) throw new Error('Empty image');
    return { width, height, alpha: { clear: clear / (width * height), soft: soft / (width * height) },
        bounds: { x, y, width: right - x + 1, height: bottom - y + 1 } };
}

function analyze(canvas: Canvas) {
    return inspect(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
}

async function main() {
    for (const directory of ['runtime', 'qa/normalized']) fs.mkdirSync(path.join(folder, directory), { recursive: true });
    const entries = [];
    const images = [];
    for (const spec of specs) {
        const source = await loadImage(path.join(folder, 'masters', `${spec.name}.png`));
        const canvas = createCanvas(source.width, source.height);
        canvas.getContext('2d').drawImage(source, 0, 0);
        const sourceInfo = analyze(canvas);
        const opaque = 'opaque' in spec && spec.opaque;
        if (!opaque && sourceInfo.alpha.clear < 0.04) throw new Error(`${spec.name}: missing meaningful alpha`);
        const crop = opaque ? { x: 0, y: 0, width: source.width, height: source.height } : sourceInfo.bounds;
        const padding = opaque ? 0 : 10;
        const width = spec.width;
        const scale = (width - 2 * padding) / crop.width;
        const height = Math.ceil(crop.height * scale) + 2 * padding;
        const output = createCanvas(width, height);
        const ctx = output.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, padding, padding, width - 2 * padding, opaque ? height : crop.height * scale);
        const normalized = path.join(folder, 'qa/normalized', `${spec.name}.png`);
        fs.writeFileSync(normalized, output.toBuffer('image/png'));
        const target = path.join(folder, 'runtime', `${spec.name}.webp`);
        execFileSync('cwebp', ['-quiet', '-q', opaque ? '91' : '94', '-alpha_q', '100', '-m', '6', normalized, '-o', target]);
        const decoded = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', target, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: width * height * 4 + 4096 });
        if (decoded.length !== width * height * 4) throw new Error(`${spec.name}: invalid runtime dimensions`);
        const runtime = inspect(decoded, width, height);
        const b = runtime.bounds;
        const edge = Math.min(b.x, b.y, width - b.x - b.width, height - b.y - b.height);
        if (!opaque && (runtime.alpha.clear < 0.04 || edge < 7)) throw new Error(`${spec.name}: clipped or opaque runtime`);
        entries.push({ name: spec.name, path: `runtime/${spec.name}.webp`, source: `masters/${spec.name}.png`,
            width, height, pivot: { x: width / 2, y: height - padding }, bounds: b, alpha: runtime.alpha,
            sourceInfo, crop, bytes: fs.statSync(target).size,
            ...(spec.name === 'panel' ? { contentInset: { left: 0.14, right: 0.14, top: 0.13, bottom: 0.11 } } : {}),
            ...(spec.name === 'torch' ? { flameSplit: 0.56 } : {}) });
        images.push({ name: spec.name, canvas: output });
    }
    fs.writeFileSync(path.join(folder, 'manifest.json'), `${JSON.stringify({ version: 1, reference: 'reference/interface.png', assets: entries }, null, 2)}\n`);
    const board = createCanvas(1200, 1100);
    const ctx = board.getContext('2d');
    ctx.fillStyle = '#dce8ed'; ctx.fillRect(0, 0, board.width, board.height);
    ctx.fillStyle = '#243f49'; ctx.font = 'bold 22px sans-serif'; ctx.fillText('Reference-driven royal menu assets', 24, 32);
    images.forEach((asset, index) => {
        const x = 20 + index % 2 * 590, y = 55 + Math.floor(index / 2) * 260;
        ctx.fillStyle = index % 2 ? '#243e4c' : '#fff'; ctx.fillRect(x, y, 570, 238);
        const scale = Math.min(530 / asset.canvas.width, 200 / asset.canvas.height);
        ctx.drawImage(asset.canvas, x + (570 - asset.canvas.width * scale) / 2, y + 10, asset.canvas.width * scale, asset.canvas.height * scale);
        ctx.fillStyle = index % 2 ? '#fff' : '#243f49'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(asset.name, x + 12, y + 224);
    });
    fs.writeFileSync(path.join(folder, 'qa/contact.png'), board.toBuffer('image/png'));
    console.log(JSON.stringify(entries.map(({ name, width, height, bytes, alpha }) => ({ name, width, height, bytes, alpha })), null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
