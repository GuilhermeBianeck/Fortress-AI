/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampCamera, createViewport, screenToWorld, showBattleMinimap, worldToScreen } from './viewport';

for (const [width, height] of [[320, 300], [390, 490], [844, 218], [1280, 500]]) {
    test(`world/input transform stays aligned at ${width}x${height}`, () => {
        const view = createViewport(width, height);
        const camera = clampCamera(120, view);
        const point = { x: 300, y: 520 };
        const screen = worldToScreen(point, camera, view);
        const roundtrip = screenToWorld(screen, camera, view);
        assert.ok(Math.abs(roundtrip.x - point.x) < 0.0001);
        assert.ok(Math.abs(roundtrip.y - point.y) < 0.0001);
        assert.ok(screen.y > 0 && screen.y < height, 'ground must not be cropped');
        assert.ok(clampCamera(-10000, view) <= 0);
        assert.ok(Number.isFinite(clampCamera(10000, view)));
    });
}

test('short landscape has a closer view and an explicit full-height overview', () => {
    const tactical = createViewport(844, 190);
    const overview = createViewport(844, 190, true);
    assert.equal(tactical.top, 240);
    assert.equal(overview.top, 40);
    assert.ok(tactical.scale > overview.scale);
    assert.ok(worldToScreen({ x: 600, y: 520 }, 0, tactical).y < 190);
});

test('small screens use fortress navigation rather than a minimap covering the king or cannon', () => {
    for (const [w, h] of [[390, 600], [568, 190], [844, 260], [768, 800]]) assert.equal(showBattleMinimap(createViewport(w, h)), false);
    assert.equal(showBattleMinimap(createViewport(1280, 600)), true);
});
