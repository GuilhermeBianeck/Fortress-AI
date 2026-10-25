import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderQuality } from './renderQuality';

function sample(quality: RenderQuality, ms: number, duration: number, render = 10) {
    for (let time = 0; time < duration; time += ms) quality.record(ms, render);
}
test('sustained slow frames lower supersampling gradually without going below CSS resolution', () => {
    const q = new RenderQuality();
    sample(q, 65, 1100); assert.equal(q.maxRatio, 2.5);
    sample(q, 65, 10000); assert.equal(q.maxRatio, 1);
});
test('healthy frames retain full retina resolution', () => {
    const q = new RenderQuality(); sample(q, 16.7, 60000, 4); assert.equal(q.maxRatio, 3);
});
test('tab resumes, invalid clocks and isolated hitches cannot lower quality', () => {
    const q = new RenderQuality();
    for (const time of [1000, 200, NaN, -10, Infinity]) q.record(time, 5);
    sample(q, 16.7, 5000, 4); q.record(80, 50); sample(q, 16.7, 5000, 4);
    assert.equal(q.maxRatio, 3);
});
test('quality recovers slowly and only with consistent render headroom', () => {
    const q = new RenderQuality(); sample(q, 65, 1100); assert.equal(q.maxRatio, 2.5);
    sample(q, 16.7, 19000, 4); assert.equal(q.maxRatio, 2.5);
    sample(q, 16.7, 2000, 4); assert.equal(q.maxRatio, 3);
});
test('steady 60Hz without spare render time cannot cause quality oscillation', () => {
    const q = new RenderQuality(); sample(q, 65, 1100);
    sample(q, 16.7, 60000, 12); assert.equal(q.maxRatio, 2.5);
});
test('very slow but active rendering still lowers supersampling', () => {
    const q = new RenderQuality(); sample(q, 150, 1600, 130);
    assert.equal(q.maxRatio, 2.5);
});
test('one severe rendering hitch does not lower an otherwise healthy stream', () => {
    const q = new RenderQuality(); q.record(200, 150);
    sample(q, 16.7, 5000, 4); assert.equal(q.maxRatio, 3);
});
