import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ShotCamera } from './shotCamera';

const point = { x: 1800, y: 400 };
test('keeps an enemy impact visible after the server has switched turns and removed the ball', () => {
    const camera = new ShotCamera();
    camera.begin(10, 'left', { x: 760, y: 480 });
    assert.equal(camera.sample(100, 'left', { position: point, velocity: { x: 60, y: 4 } })?.kind, 'flight');
    assert.equal(camera.impact(10, 'left', point, 'king', 'King hit -50 HP', 200), true);
    assert.deepEqual(camera.sample(1000, 'right'), { kind: 'impact', point, velocity: { x: 0, y: 0 } });
    assert.equal(camera.sample(1501, 'right'), null);
    assert.equal(camera.id, null);
    camera.begin(10, 'left', point);
    assert.equal(camera.id, null, 'old body cannot resurrect a completed shot');
});
test('lower-priority contacts and stale shots cannot steal focus from a king hit', () => {
    const camera = new ShotCamera(); camera.begin(20, 'right', point);
    camera.impact(20, 'right', point, 'king', 'King hit', 100);
    assert.equal(camera.impact(20, 'right', { x: 400, y: 500 }, 'ground', 'Ground hit', 200), false);
    assert.equal(camera.impact(19, 'left', point, 'king', 'King hit', 300), false);
    assert.equal(camera.impact(undefined, 'left', point, 'block', 'Block hit', 300), false);
    assert.equal(camera.receipt?.kind, 'king');
    camera.begin(21, 'left', { x: 760, y: 500 });
    assert.equal(camera.receipt, null);
    assert.equal(camera.sample(400, 'left', { position: point, velocity: { x: -30, y: 0 } })?.kind, 'flight', 'a bounce does not drop follow');
});
test('missing packets do not fabricate a king hit, and an unseen finishing shot can still show its impact', () => {
    const camera = new ShotCamera(); camera.begin(30, 'left', point);
    assert.equal(camera.sample(100, 'right')?.kind, 'impact');
    assert.equal(camera.receipt?.kind, 'miss');
    assert.equal(camera.impact(30, 'left', point, 'block', 'Stone hit', 200), true);
    assert.equal(camera.receipt?.text, 'Stone hit');
    camera.reset();
    assert.equal(camera.impact(1, 'right', point, 'king', 'King hit', 300), true);
    assert.equal(camera.sample(400, null)?.kind, 'impact');
});
