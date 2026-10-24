import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import manifest from '../../asset-workbench/living-kings-v6/manifest.json';
import { livingKingState, livingKingAttachments, drawLivingKing, registerLivingKingImage, type LivingKingPart } from './livingKing';

test('elapsed time is deterministic, finite and phase-offset between the two characters', () => {
    const left = livingKingState({ side: 'left', now: 1600 });
    assert.deepEqual(left, livingKingState({ side: 'left', now: 1600 }));
    assert.notDeepEqual(left, livingKingState({ side: 'right', now: 1600 }));
    assert.notDeepEqual(left, livingKingState({ side: 'left', now: 3200 }));
    assert.ok(Object.values(livingKingState({ side: 'left', now: Number.NaN })).every(value => typeof value === 'boolean' || Number.isFinite(value)));
});

test('reduced motion freezes all articulation and always leaves eyes open', () => {
    const still = livingKingState({ side: 'left', now: 0, reducedMotion: true });
    for (const side of ['left', 'right'] as const) for (const now of [1700, 2750, 6400, 12500]) {
        assert.deepEqual(livingKingState({ side, now, reducedMotion: true, looking: 1, shootAt: now - 100 }), still);
    }
    assert.equal(still.blink, false);
    assert.equal(still.chestScaleY, 1);
});

test('natural blink is short, deterministic and distinct from head movement', () => {
    assert.equal(livingKingState({ side: 'left', now: 2699 }).blink, false);
    assert.equal(livingKingState({ side: 'left', now: 2750 }).blink, true);
    assert.equal(livingKingState({ side: 'left', now: 2820 }).blink, false);
    assert.equal(livingKingState({ side: 'right', now: 1020 }).blink, true);
});

test('motion remains smooth at gesture and periodic boundaries with modest joint angles', () => {
    for (const now of [0, 5199, 5200, 6100, 6999, 7000, 11399, 11400, 22000]) {
        const a = livingKingState({ side: 'left', now });
        const b = livingKingState({ side: 'left', now: now + 1 });
        for (const key of ['headTilt', 'headX', 'headY', 'armAngle', 'capeAngle', 'chestScaleY'] as const) assert.ok(Math.abs(a[key] - b[key]) < .01, key);
        assert.ok(Math.abs(a.headTilt) < .05);
        assert.ok(Math.abs(a.armAngle) < .21);
        assert.ok(Math.abs(a.capeAngle) <= .04);
    }
    assert.ok(livingKingState({ side: 'left', now: 6100 }).gesture > .99);
});

test('boots and body base are stationary; head and shoulder anchors stay registered', () => {
    for (const side of ['left', 'right'] as const) for (let now = 0; now < 14000; now += 137) {
        const frames = livingKingAttachments({ side, now });
        const body = frames.find(frame => frame.part === 'body')!;
        assert.deepEqual(body, { part: 'body', x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1 });
        const open = frames.find(frame => frame.part === 'head_open')!;
        const closed = frames.find(frame => frame.part === 'head_closed')!;
        assert.deepEqual({ ...open, part: '' }, { ...closed, part: '' });
        assert.ok(Math.abs(open.x - 8) <= .46);
        assert.ok(Math.abs(open.y + 185) <= .66);
        const arm = frames.find(frame => frame.part === 'arm')!;
        assert.equal(arm.x, -54);
        assert.ok(Math.abs(arm.y + 170) <= .51);
    }
});

test('all 12 PNG pieces exist, are unique and have shared blink registration', () => {
    assert.equal(manifest.assets.length, 12);
    const hashes = new Set<string>();
    for (const asset of manifest.assets) {
        const file = fs.readFileSync(new URL(`../../asset-workbench/living-kings-v6/${asset.path}`, import.meta.url));
        hashes.add(createHash('sha256').update(file).digest('hex'));
        assert.equal(file.readUInt32BE(16), asset.width);
        assert.equal(file.readUInt32BE(20), asset.height);
        assert.ok(asset.bounds.x >= 7 && asset.bounds.y >= 7);
        assert.ok(asset.bounds.x + asset.bounds.width <= asset.width - 7);
        assert.ok(asset.bounds.y + asset.bounds.height <= asset.height - 7);
    }
    assert.equal(hashes.size, 12);
    for (const side of ['left', 'right'] as const) {
        const open = manifest.assets.find(asset => asset.side === side && asset.part === 'head_open')!;
        const closed = manifest.assets.find(asset => asset.side === side && asset.part === 'head_closed')!;
        assert.deepEqual(open.pivot, closed.pivot);
        assert.deepEqual(open.anchor, closed.anchor);
        assert.equal(open.width, closed.width);
        assert.equal(open.height, closed.height);
    }
});

test('draw refuses incomplete rigs, then draws five independent layers with caller transform preserved', () => {
    let saves = 0, restores = 0, draws = 0;
    const ctx = { save: () => saves++, restore: () => restores++, scale: () => {}, translate: () => {}, rotate: () => {}, drawImage: () => draws++ } as unknown as CanvasRenderingContext2D;
    assert.equal(drawLivingKing(ctx, { side: 'left', now: 0, height: 80 }), false);
    assert.equal(draws, 0);
    for (const asset of manifest.assets.filter(asset => asset.side === 'left')) registerLivingKingImage('left', asset.part as LivingKingPart, {} as CanvasImageSource);
    assert.equal(drawLivingKing(ctx, { side: 'left', now: 0, height: 80 }), true);
    assert.equal(draws, 5);
    assert.equal(saves, 6);
    assert.equal(restores, saves);
});

test('shot cue moves the arm briefly without shifting boots or producing future recoil', () => {
    const base = livingKingState({ side: 'left', now: 1000 });
    assert.deepEqual(livingKingState({ side: 'left', now: 1000, shootAt: 1100 }), base);
    assert.notEqual(livingKingState({ side: 'left', now: 1000, shootAt: 800 }).armAngle, base.armAngle);
    assert.deepEqual(livingKingState({ side: 'left', now: 1000, shootAt: 500 }), base);
});
