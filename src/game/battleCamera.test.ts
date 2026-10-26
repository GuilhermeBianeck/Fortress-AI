import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceBattleCamera, projectileCameraTarget, resizeBattleCamera, trackBattleCamera, type BattleCameraState } from './battleCamera';
import { createViewport } from './viewport';

const state = (x = 0, target = 2000): BattleCameraState => ({ x, target, velocity: 0, manualUntil: 0, initialized: true });
test('visible flight does not unnecessarily scroll the ground away vertically', () => {
    const view = createViewport(390, 500), baseline = view.top, cam = state(1000);
    for (let i = 0; i < 60; i++) trackBattleCamera(cam, view, { x: 1200, y: 300 }, { x: 25, y: -10 }, 16.667, 150);
    assert.equal(view.top, baseline);
    trackBattleCamera(cam, view, { x: 1200, y: 30 }, { x: 25, y: -10 }, 16.667, 150);
    assert.ok(view.top < baseline);
    assert.ok((30 - view.top) * view.scale >= 150 - 0.01);
});
test('a held network picture cannot make the camera drift ahead on stale raw velocity', () => {
    const view = createViewport(390, 500), point = { x: 1200, y: 300 };
    const cam = state(point.x - view.worldWidth * 0.43);
    const before = cam.x;
    for (let i = 0; i < 60; i++) trackBattleCamera(cam, view, point, { x: 90, y: -20 }, 16.667, 150);
    assert.ok(Math.abs(cam.x - before) < 0.001);
    assert.equal(cam.velocity, 0);
});
test('turn travel is continuous and bounded on desktop and phone at 30/60/120Hz', () => {
    for (const [w, h] of [[1280, 600], [390, 600]]) for (const hz of [30, 60, 120]) {
        const view = createViewport(w, h), cam = state();
        let previous = cam.x;
        for (let i = 0; i < hz * 10; i++) {
            advanceBattleCamera(cam, view, 1000 / hz);
            assert.ok(cam.x >= previous - 0.001);
            assert.ok(Math.abs(cam.x - previous) <= view.worldWidth * 1.65 / hz + 0.01);
            assert.ok(Math.abs(cam.velocity) <= view.worldWidth * 1.65);
            previous = cam.x;
        }
        assert.ok(Math.abs(cam.x - cam.target) < 0.2);
    }
});
test('a new turn redirects existing momentum without a position teleport', () => {
    const view = createViewport(390, 600), cam = state();
    for (let i = 0; i < 50; i++) advanceBattleCamera(cam, view, 16.667);
    const before = cam.x;
    cam.target = -90; advanceBattleCamera(cam, view, 16.667);
    assert.ok(Math.abs(cam.x - before) < view.worldWidth * 1.65 / 60 + 0.1);
    for (let i = 0; i < 600; i++) advanceBattleCamera(cam, view, 16.667);
    assert.ok(Math.abs(cam.x + 90) < 0.1);
});
test('tracking leaves the central band steady; invalid deltas and background gaps cannot fling the view', () => {
    const view = createViewport(400, 560), cam = state(400, 400);
    assert.equal(projectileCameraTarget(600, cam, view), 400);
    assert.ok(projectileCameraTarget(780, cam, view) > 400);
    assert.ok(projectileCameraTarget(420, cam, view) < 400);
    cam.target = 2000; advanceBattleCamera(cam, view, 60000);
    assert.ok(cam.x - 400 < view.worldWidth * 1.65 * 0.05);
    const x = cam.x; advanceBattleCamera(cam, view, -10); assert.equal(cam.x, x);
    advanceBattleCamera(cam, view, 16, false, true); assert.equal(cam.x, cam.target); assert.equal(cam.velocity, 0);
});
test('resizing preserves the viewed world center instead of leaving the king at an old viewport edge', () => {
    const before = createViewport(800, 560), after = createViewport(390, 600), cam = state(700, 900);
    const center = cam.x + before.worldWidth / 2, target = cam.target + before.worldWidth / 2;
    resizeBattleCamera(cam, before, after);
    assert.equal(cam.x + after.worldWidth / 2, center);
    assert.equal(cam.target + after.worldWidth / 2, target);
});

test('fast shots stay on screen in both directions, above the HUD, at 30/60/120Hz', () => {
    for (const [w, h] of [[390, 500], [844, 260], [1280, 600]]) for (const hz of [30, 60, 120]) for (const direction of [-1, 1]) {
        const view = createViewport(w, h), cam = state();
        for (let i = 0; i <= hz; i++) {
            const x = direction > 0 ? 650 + 1100 * i / hz : 1750 - 1100 * i / hz;
            const point = { x, y: 420 - 500 * Math.sin(Math.PI * i / hz) };
            trackBattleCamera(cam, view, point, { x: direction * 1100 / 60, y: 0 }, 1000 / hz, 150);
            const px = (point.x - cam.x) * view.scale, py = (point.y - view.top) * view.scale;
            assert.ok(px >= 0 && px <= w, `horizontal ${w}/${hz}/${direction}`);
            assert.ok(py >= Math.min(h - 44, 150) - 0.01 && py <= h - 28 + 0.01, `vertical ${w}/${hz}/${direction}`);
            assert.ok(Number.isFinite(cam.x) && Number.isFinite(view.top));
        }
        trackBattleCamera(cam, view, { x: 1200, y: 500 }, { x: 0, y: 0 }, NaN, 150);
        assert.ok(Number.isFinite(cam.x));
    }
});
