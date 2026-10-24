import { createCanvas, loadImage } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../asset-workbench/living-kings-v6/manifest.json';
import { drawLivingKing, registerLivingKingImage, type LivingKingPart } from '../src/game/livingKing';
import { KingActionDirector, type KingActionCue } from '../src/game/kingActions';
import type { Side } from '../src/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'asset-workbench/living-kings-v6');
const modes = ['ready', 'aim', 'recoil', 'brace', 'recover'] as const;

async function main() {
    for (const part of manifest.assets) {
        const image = await loadImage(path.join(folder, part.path));
        registerLivingKingImage(part.side as Side, part.part as LivingKingPart, image as unknown as CanvasImageSource);
    }
    const canvas = createCanvas(1600, 1040), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e7f1f5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#173449'; ctx.font = 'bold 23px sans-serif';
    ctx.fillText('Grounded action clips: ready / aim / recoil / brace / recovery', 24, 36);
    for (const [row, side] of (['left', 'right'] as const).entries()) for (const [col, mode] of modes.entries()) {
        const director = new KingActionDirector();
        const base: KingActionCue = { now: 0, side, phase: mode === 'ready' ? 'build' : 'combat', turn: side,
            aimAngle: Math.PI / 4, king: { x: 600, y: 480 }, projectiles: [], reducedMotion: false };
        if (mode === 'recoil' || mode === 'recover') base.shot = { id: 7, side, at: 0 };
        if (mode === 'brace') base.projectiles = [{ id: 8, position: { x: 800, y: 460 }, velocity: { x: -20, y: 2 } }];
        director.update(base);
        const now = mode === 'recoil' ? 100 : 500;
        if (mode === 'recover') director.update({ ...base, now: 200 });
        const action = director.update({ ...base, now });
        const cx = col * 320 + 160, foot = row * 480 + 370;
        ctx.strokeStyle = '#9ab9c3'; ctx.beginPath(); ctx.moveTo(col * 320 + 12, foot); ctx.lineTo((col + 1) * 320 - 12, foot); ctx.stroke();
        for (const [x, y, height] of [[cx, foot, 280], [cx - 64, foot + 170, 48], [cx, foot + 170, 72], [cx + 76, foot + 170, 112]]) {
            ctx.save(); ctx.translate(x, y); if (side === 'right') ctx.scale(-1, 1);
            drawLivingKing(ctx as unknown as CanvasRenderingContext2D, { side, now, height, action, looking: action.look });
            ctx.restore();
        }
        ctx.fillStyle = '#173449'; ctx.textAlign = 'center'; ctx.font = '17px sans-serif';
        ctx.fillText(`${side === 'left' ? 'Ember' : 'Ivory'}: ${action.mode}`, cx, foot + 25);
    }
    fs.mkdirSync(path.join(folder, 'qa'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'qa/action-clips.png'), canvas.toBuffer('image/png'));
    console.info('Rendered five real action clips for both kings at full and runtime sizes.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
