import { createCanvas, loadImage, type Canvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'asset-workbench/cartoon-v2');
const reference = JSON.parse(fs.readFileSync(path.join(root, 'asset-workbench/cartoon-v1/asset-manifest.json'), 'utf8'))
    .assets.find((asset: { name: string }) => asset.name === 'king') as {
        sourceInfo: { width: number; height: number };
        sourceTrim: { x: number; y: number; width: number; height: number };
        outputInfo: { width: number; height: number };
        pivot: { x: number; y: number }; edgePadding: number;
    };
const specs = [
    { name: 'hit', file: 'C08-king-hit.png' },
    { name: 'victory', file: 'C09-king-victory.png' },
    { name: 'defeat', file: 'C10-king-defeat.png' },
] as const;

function bounds(canvas: Canvas, minY = 0) {
    const { width, height } = canvas;
    const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let left = width, top = height, right = -1, bottom = -1, transparent = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const alpha = pixels[(y * width + x) * 4 + 3];
        if (alpha === 0) transparent++;
        if (alpha < 128 || y < minY) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left) throw new Error('Empty sprite or missing feet');
    return { left, top, right, bottom, center: (left + right) / 2, width: right - left + 1, transparent: transparent / (width * height) };
}

async function main() {
    fs.mkdirSync(path.join(folder, 'runtime'), { recursive: true });
    fs.mkdirSync(path.join(folder, 'qa'), { recursive: true });
    const { width, height } = reference.outputInfo;
    const base = createCanvas(width, height);
    base.getContext('2d').drawImage(await loadImage(path.join(root, 'asset-workbench/cartoon-v1/runtime/king.png')), 0, 0);
    const footBand = Math.floor(reference.pivot.y - 14);
    const targetFeet = bounds(base, footBand);
    const crop = reference.sourceTrim;
    const scale = Math.min((width - reference.edgePadding * 2) / crop.width, (height - reference.edgePadding * 2) / crop.height);
    const offset = { x: (width - crop.width * scale) / 2, y: (height - crop.height * scale) / 2 };
    const entries = [];
    const frames: { name: string; canvas: Canvas }[] = [{ name: 'idle', canvas: base }];
    for (const spec of specs) {
        const image = await loadImage(path.join(folder, 'masters', spec.file));
        if (image.width !== reference.sourceInfo.width || image.height !== reference.sourceInfo.height) {
            throw new Error(`${spec.name}: master dimensions differ from the registered reference`);
        }
        const initial = createCanvas(width, height);
        const ctx = initial.getContext('2d');
        // Every pose uses the master's full-canvas transform, never independent silhouette trimming.
        ctx.drawImage(image, offset.x - crop.x * scale, offset.y - crop.y * scale,
            reference.sourceInfo.width * scale, reference.sourceInfo.height * scale);
        const feet = bounds(initial, footBand);
        const correction = targetFeet.width / feet.width;
        if (Math.abs(correction - 1) > 0.04 || Math.abs(feet.center - targetFeet.center) > 6 || Math.abs(feet.bottom - targetFeet.bottom) > 6) {
            throw new Error(`${spec.name}: generated pose needs more than a small registration correction`);
        }
        const frame = createCanvas(width, height);
        const out = frame.getContext('2d');
        out.translate(targetFeet.center, targetFeet.bottom);
        out.scale(correction, correction);
        out.drawImage(initial, -feet.center, -feet.bottom);
        const silhouette = bounds(frame);
        const registeredFeet = bounds(frame, footBand);
        if (silhouette.transparent < 0.2) throw new Error(`${spec.name}: missing meaningful alpha`);
        if (Math.min(silhouette.left, silhouette.top, width - 1 - silhouette.right, height - 1 - silhouette.bottom) < 8) {
            throw new Error(`${spec.name}: clipped silhouette`);
        }
        if (Math.abs(registeredFeet.bottom - targetFeet.bottom) > 1 || Math.abs(registeredFeet.center - targetFeet.center) > 1) {
            throw new Error(`${spec.name}: foot anchor drift`);
        }
        fs.writeFileSync(path.join(folder, 'runtime', `king_${spec.name}.png`), frame.toBuffer('image/png'));
        entries.push({ name: spec.name, path: `runtime/king_${spec.name}.png`, source: `masters/${spec.file}`,
            width, height, pivot: reference.pivot, silhouette, feet: registeredFeet,
            registration: { scale: correction, dx: targetFeet.center - feet.center, dy: targetFeet.bottom - feet.bottom } });
        frames.push({ name: spec.name, canvas: frame });
    }
    fs.writeFileSync(path.join(folder, 'manifest.json'), `${JSON.stringify({ version: 1, reference: '../cartoon-v1/runtime/king.png', assets: entries }, null, 2)}\n`);
    const qa = createCanvas(1200, 740);
    const ctx = qa.getContext('2d');
    ctx.fillStyle = '#edf5f8'; ctx.fillRect(0, 0, qa.width, qa.height);
    ctx.fillStyle = '#24444e'; ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Fortress AI - registered king reactions', 24, 38);
    for (const [row, background] of ['#ffffff', '#8dd0ed', '#2b434e'].entries()) {
        const y = 64 + row * 218;
        ctx.fillStyle = background; ctx.fillRect(20, y, 1160, 202);
        ctx.strokeStyle = row === 2 ? '#abd3c9' : '#3c7e78';
        ctx.beginPath(); ctx.moveTo(35, y + 163); ctx.lineTo(1165, y + 163); ctx.stroke();
        frames.forEach((frame, col) => {
            const center = 115 + col * 290;
            for (const [index, size] of [64, 112].entries()) {
                const s = size / height;
                ctx.drawImage(frame.canvas, center + index * 95 - reference.pivot.x * s, y + 163 - reference.pivot.y * s, width * s, size);
            }
            ctx.fillStyle = row === 2 ? '#ffffff' : '#24444e'; ctx.font = 'bold 14px sans-serif';
            ctx.fillText(frame.name, center - 20, y + 190);
        });
    }
    fs.writeFileSync(path.join(folder, 'qa/registration.png'), qa.toBuffer('image/png'));
    console.log(JSON.stringify(entries.map(({ name, feet, registration }) => ({ name, feet, registration })), null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
