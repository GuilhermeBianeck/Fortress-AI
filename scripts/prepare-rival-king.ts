import { createCanvas, loadImage, type Canvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'asset-workbench/cartoon-v3');
const specs = [
    { name: 'idle', file: 'C11-rival-idle.png' },
    { name: 'hit', file: 'C12-rival-hit.png' },
    { name: 'victory', file: 'C13-rival-victory.png' },
    { name: 'defeat', file: 'C14-rival-defeat.png' },
] as const;

function inspect(canvas: Canvas, minY = 0) {
    const { width, height } = canvas;
    const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let x = width, y = height, right = -1, bottom = -1, transparent = 0;
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
        const alpha = pixels[(py * width + px) * 4 + 3];
        if (!alpha) transparent++;
        if (alpha < 128 || py < minY) continue;
        x = Math.min(x, px); y = Math.min(y, py);
        right = Math.max(right, px); bottom = Math.max(bottom, py);
    }
    if (right < x) throw new Error('Empty sprite or missing foot band');
    return { width, height, transparentFraction: transparent / (width * height),
        bounds: { x, y, width: right - x + 1, height: bottom - y + 1 },
        center: (x + right) / 2, bottom };
}

async function main() {
    fs.mkdirSync(path.join(folder, 'runtime'), { recursive: true });
    fs.mkdirSync(path.join(folder, 'qa'), { recursive: true });
    const idle = await loadImage(path.join(folder, 'masters', specs[0].file));
    const source = createCanvas(idle.width, idle.height);
    source.getContext('2d').drawImage(idle, 0, 0);
    const sourceInfo = inspect(source);
    if (sourceInfo.transparentFraction < 0.2) throw new Error('Idle needs meaningful real alpha');
    const crop = sourceInfo.bounds;
    const width = 256, height = 320, padding = 20;
    const scale = Math.min((width - padding * 2) / crop.width, (height - padding * 2) / crop.height);
    const offset = { x: (width - crop.width * scale) / 2, y: (height - crop.height * scale) / 2 };
    const normalized = createCanvas(width, height);
    normalized.getContext('2d').drawImage(source, offset.x - crop.x * scale, offset.y - crop.y * scale, source.width * scale, source.height * scale);
    const footBand = Math.floor(height - padding - 14);
    const targetFeet = inspect(normalized, footBand);
    const pivot = { x: targetFeet.center, y: targetFeet.bottom + 0.5 };
    const assets = [];
    const frames: Canvas[] = [];
    for (const spec of specs) {
        const image = await loadImage(path.join(folder, 'masters', spec.file));
        if (image.width !== source.width || image.height !== source.height) throw new Error(`${spec.name}: canvas size changed`);
        const raw = createCanvas(image.width, image.height);
        raw.getContext('2d').drawImage(image, 0, 0);
        const poseSourceInfo = inspect(raw);
        if (poseSourceInfo.transparentFraction < 0.2) throw new Error(`${spec.name}: master needs real alpha`);
        const initial = createCanvas(width, height);
        initial.getContext('2d').drawImage(image, offset.x - crop.x * scale, offset.y - crop.y * scale, source.width * scale, source.height * scale);
        const feet = inspect(initial, footBand);
        const correction = targetFeet.bounds.width / feet.bounds.width;
        if (Math.abs(correction - 1) > 0.04 || Math.abs(targetFeet.center - feet.center) > 6 || Math.abs(targetFeet.bottom - feet.bottom) > 6) {
            throw new Error(`${spec.name}: registration drift needs art correction`);
        }
        // Register to the idle master, not to each pose's independent silhouette.
        const output = createCanvas(width, height);
        const ctx = output.getContext('2d');
        ctx.translate(targetFeet.center, targetFeet.bottom);
        ctx.scale(correction, correction);
        ctx.drawImage(initial, -feet.center, -feet.bottom);
        const outputInfo = inspect(output);
        const registeredFeet = inspect(output, footBand);
        const b = outputInfo.bounds;
        const edgePadding = Math.min(b.x, b.y, width - b.x - b.width, height - b.y - b.height);
        if (edgePadding < 8 || outputInfo.transparentFraction < 0.2) throw new Error(`${spec.name}: clipped or opaque sprite`);
        if (Math.abs(registeredFeet.center - targetFeet.center) > 1 || Math.abs(registeredFeet.bottom - targetFeet.bottom) > 1) throw new Error(`${spec.name}: foot drift`);
        fs.writeFileSync(path.join(folder, 'runtime', `rival_${spec.name}.png`), output.toBuffer('image/png'));
        assets.push({ name: spec.name, path: `runtime/rival_${spec.name}.png`, source: `masters/${spec.file}`,
            sourceInfo: poseSourceInfo, sourceTrim: crop, outputInfo, pivot, edgePadding, feet: registeredFeet,
            registration: { scale: correction, dx: targetFeet.center - feet.center, dy: targetFeet.bottom - feet.bottom } });
        frames.push(output);
    }
    fs.writeFileSync(path.join(folder, 'manifest.json'), `${JSON.stringify({ version: 1, character: 'ivory', assets }, null, 2)}\n`);
    const qa = createCanvas(1200, 740);
    const ctx = qa.getContext('2d');
    ctx.fillStyle = '#edf5f8'; ctx.fillRect(0, 0, qa.width, qa.height);
    ctx.fillStyle = '#24444e'; ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Fortress AI - Ivory king registration', 24, 38);
    for (const [row, background] of ['#fff', '#8dd0ed', '#2b434e'].entries()) {
        const y = 64 + row * 218;
        ctx.fillStyle = background; ctx.fillRect(20, y, 1160, 202);
        ctx.strokeStyle = row === 2 ? '#abd3c9' : '#3c7e78';
        ctx.beginPath(); ctx.moveTo(35, y + 163); ctx.lineTo(1165, y + 163); ctx.stroke();
        frames.forEach((frame, col) => {
            for (const [index, size] of [64, 112].entries()) {
                const s = size / height;
                ctx.drawImage(frame, 115 + col * 290 + index * 95 - pivot.x * s, y + 163 - pivot.y * s, width * s, size);
            }
            ctx.fillStyle = row === 2 ? '#fff' : '#24444e'; ctx.font = 'bold 14px sans-serif';
            ctx.fillText(specs[col].name, 95 + col * 290, y + 190);
        });
    }
    fs.writeFileSync(path.join(folder, 'qa/registration.png'), qa.toBuffer('image/png'));
    console.log(JSON.stringify(assets.map(({ name, pivot, registration, feet }) => ({ name, pivot, registration, feet: feet.bounds })), null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
