import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceBattleCamera, projectileCameraTarget, resizeBattleCamera, type BattleCameraState } from './battleCamera';
import { createViewport } from './viewport';

const state = (x = 0, target = 2000): BattleCameraState => ({ x, target, velocity: 0, manualUntil: 0, initialized: true });
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
