import test from 'node:test';
import assert from 'node:assert/strict';
import { atmosphericColor, groundTextureColumn, healthPanel, renderPixelRatio, sceneryPlacement } from './battlePresentation';

test('retina clarity respects a bounded backing buffer without downsampling CSS pixels', () => {
    assert.equal(renderPixelRatio(390, 500, 3), 3);
    assert.equal(renderPixelRatio(1280, 600, 2), 2);
    assert.equal(renderPixelRatio(3840, 2160, 3), 1);
    assert.ok(renderPixelRatio(1920, 900, 3) ** 2 * 1920 * 900 <= 4_194_305);
    assert.equal(renderPixelRatio(390, 500, 0), 1);
});

test('scenery remains aspect-correct and covers desktop and portrait widths', () => {
    for (const [w, h] of [[1440, 700], [390, 500], [844, 240], [320, 300]]) {
        const art = sceneryPlacement(w, h, 1672, 941, 600);
        assert.ok(Math.abs(art.width / art.height - 1672 / 941) < 0.00001);
        assert.ok(art.x <= 0);
        assert.ok(art.x + art.width >= w);
        assert.ok(art.y + art.height >= h);
    }
});

test('terrain UVs stay world-anchored, continuous across camera motion and wrap negative positions', () => {
    assert.equal(groundTextureColumn(0), groundTextureColumn(360));
    assert.equal(groundTextureColumn(-4), groundTextureColumn(356));
    assert.equal(groundTextureColumn(180), 0.5);
});

test('health hit regions fit both edges, stay separate, and clear responsive header heights', () => {
    for (const [width, height] of [[1440, 796], [390, 709], [844, 318], [320, 433]]) {
        const left = healthPanel(width, height, 'left'), right = healthPanel(width, height, 'right');
        assert.ok(left.x >= 0 && right.x + right.width <= width);
        assert.ok(left.x + left.width < right.x);
        assert.ok(left.y >= (width > 640 && height < 330 ? 56 : width < 640 ? 70 : 74));
        assert.ok(left.y + left.height < height);
    }
});

test('background grading reduces color competition and keeps details away from black/white extremes', () => {
    const green = atmosphericColor(30, 190, 45);
    assert.ok(Math.max(...green) - Math.min(...green) < 100);
    assert.ok(Math.min(...atmosphericColor(0, 0, 0)) > 20);
    assert.ok(Math.max(...atmosphericColor(255, 255, 255)) < 250);
});
