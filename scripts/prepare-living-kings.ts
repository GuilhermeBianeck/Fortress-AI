import { createCanvas, loadImage, type Canvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'asset-workbench/living-kings-v6');
const cells = [
    { name: 'body', x: 0, y: 0, width: 570, height: 600, targetHeight: 190, anchor: { x: 0, y: 0 }, pivot: { x: .49, y: 1 } },
    { name: 'head_open', x: 570, y: 0, width: 454, height: 600, targetHeight: 160, anchor: { x: 8, y: -185 }, pivot: { x: .46, y: .83 } },
    { name: 'head_closed', x: 0, y: 600, width: 570, height: 540, targetHeight: 160, anchor: { x: 8, y: -185 }, pivot: { x: .46, y: .83 } },
    { name: 'arm', x: 512, y: 600, width: 512, height: 500, targetHeight: 112, anchor: { x: -54, y: -170 }, pivot: { x: .5, y: .1 } },
    { name: 'cape', x: 0, y: 1060, width: 600, height: 476, targetHeight: 154, targetWidth: 142, anchor: { x: -20, y: -177 }, pivot: { x: .72, y: .12 } },
    { name: 'chest', x: 600, y: 1100, width: 424, height: 436, targetHeight: 75, targetWidth: 128, anchor: { x: 0, y: -108 }, pivot: { x: .5, y: 1 } },
] as const;

function inspect(canvas: Canvas) {
    const { width, height } = canvas;
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let clear = 0;
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let largest = { x: 0, y: 0, width: 0, height: 0, count: 0 };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (!alpha) clear++;
        const index = y * width + x;
        if (alpha < 100 || visited[index]) continue;
        let read = 0, write = 1, left = x, right = x, top = y, bottom = y;
        queue[0] = index; visited[index] = 1;
        while (read < write) {
            const pixel = queue[read++], px = pixel % width, py = Math.floor(pixel / width);
            left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
            for (const next of [px > 0 ? pixel - 1 : -1, px < width - 1 ? pixel + 1 : -1, py > 0 ? pixel - width : -1, py < height - 1 ? pixel + width : -1]) {
                if (next < 0 || visited[next] || data[next * 4 + 3] < 100) continue;
                visited[next] = 1; queue[write++] = next;
            }
        }
        if (write > largest.count) largest = { x: left, y: top, width: right - left + 1, height: bottom - top + 1, count: write };
    }
    if (!largest.count) throw new Error('Empty rig cell');
    const bounds = { x: largest.x, y: largest.y, width: largest.width, height: largest.height };
    return { bounds, clearFraction: clear / (width * height) };
}

async function main() {
    fs.mkdirSync(path.join(folder, 'runtime'), { recursive: true });
    fs.mkdirSync(path.join(folder, 'qa'), { recursive: true });
    const assets = [];
    const images = new Map<string, Awaited<ReturnType<typeof loadImage>>>();
    for (const [side, character] of [['left', 'ember'], ['right', 'ivory']] as const) {
        const master = await loadImage(path.join(folder, 'masters', `${character}-rig.png`));
        if (master.width !== 1024 || master.height !== 1536) throw new Error('Unexpected master geometry');
        let headWidth = 0;
        for (const spec of cells) {
            const raw = createCanvas(spec.width, spec.height);
            raw.getContext('2d').drawImage(master, spec.x, spec.y, spec.width, spec.height, 0, 0, spec.width, spec.height);
            const source = inspect(raw);
            if (source.clearFraction < .15) throw new Error(`${character}/${spec.name}: insufficient real alpha`);
            const b = source.bounds;
            if (b.x < 3 || b.y < 3 || b.x + b.width > spec.width - 3 || b.y + b.height > spec.height - 3) throw new Error(`${character}/${spec.name}: source touches cell edge`);
            const h = spec.targetHeight;
            let w = 'targetWidth' in spec ? spec.targetWidth : Math.round(b.width / b.height * h);
            if (spec.name === 'head_open') headWidth = w;
            if (spec.name === 'head_closed') w = headWidth;
            const output = createCanvas(w + 16, h + 16);
            output.getContext('2d').drawImage(raw, b.x, b.y, b.width, b.height, 8, 8, w, h);
            const name = `${character}_${spec.name}`;
            const file = `runtime/${name}.png`;
            const buffer = output.toBuffer('image/png');
            fs.writeFileSync(path.join(folder, file), buffer);
            const pivot = { x: 8 + w * spec.pivot.x, y: 8 + h * spec.pivot.y };
            if (spec.name === 'body') {
                const pixels = output.getContext('2d').getImageData(0, 0, output.width, output.height).data;
                let left = output.width, right = 0;
                for (let y = output.height - 18; y < output.height - 7; y++) for (let x = 0; x < output.width; x++) {
                    if (pixels[(y * output.width + x) * 4 + 3] < 100) continue;
                    left = Math.min(left, x); right = Math.max(right, x);
                }
                pivot.x = (left + right) / 2;
            }
            assets.push({ name, character, side, part: spec.name, path: file, width: output.width, height: output.height, anchor: spec.anchor, pivot, source: `masters/${character}-rig.png`, sourceCell: { x: spec.x, y: spec.y, width: spec.width, height: spec.height }, sourceBounds: b, bounds: inspect(output).bounds, bytes: buffer.length });
            images.set(name, await loadImage(buffer));
        }
    }
    fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({ version: 1, unitHeight: 320, assets }, null, 2) + '\n');
    const { drawLivingKing, registerLivingKingImage, livingKingState } = await import('../src/game/livingKing');
    for (const asset of assets) registerLivingKingImage(asset.side, asset.part, images.get(asset.name)! as unknown as CanvasImageSource);
    const qa = createCanvas(1500, 760), ctx = qa.getContext('2d');
    ctx.fillStyle = '#e7f1f5'; ctx.fillRect(0, 0, qa.width, qa.height);
    ctx.font = 'bold 23px sans-serif'; ctx.fillStyle = '#213b50'; ctx.fillText('Living kings - registered cutout assembly, independent articulation', 24, 34);
    for (const [index, side] of (['left', 'right'] as const).entries()) {
        for (const [col, now] of [0, 1600, 6400].entries()) {
            const x = 130 + index * 740 + col * 225, foot = 420;
            ctx.strokeStyle = '#6a969b'; ctx.beginPath(); ctx.moveTo(x - 110, foot); ctx.lineTo(x + 110, foot); ctx.stroke();
            ctx.save(); ctx.translate(x, foot);
            drawLivingKing(ctx as unknown as CanvasRenderingContext2D, { side, now, height: 300, reducedMotion: false }); ctx.restore();
            ctx.fillStyle = '#213b50'; ctx.font = '15px sans-serif'; ctx.fillText(`${side} ${now}ms`, x - 80, 450);
            for (const [sizeIndex, height] of [48, 72, 112].entries()) {
                ctx.save(); ctx.translate(x - 70 + sizeIndex * 70, 650);
                drawLivingKing(ctx as unknown as CanvasRenderingContext2D, { side, now, height, reducedMotion: false }); ctx.restore();
            }
        }
    }
    fs.writeFileSync(path.join(folder, 'qa/assembly.png'), qa.toBuffer('image/png'));
    fs.writeFileSync(path.join(folder, 'qa/states.json'), JSON.stringify([0, 1600, 6400].map(now => ({ now, left: livingKingState({ side: 'left', now }), right: livingKingState({ side: 'right', now }) })), null, 2));
    console.log(`Prepared ${assets.length} transparent rig pieces and large/small assembly QA.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
