import test from 'node:test';
import assert from 'node:assert/strict';
import type { BodyState, GameState } from '../types';
import { SnapshotInterpolator } from './snapshotInterpolation';

const ball = (x: number, angle = 0): BodyState => ({ id: 1, label: 'projectile', position: { x, y: x / 2 }, velocity: { x: 10, y: 5 }, angle, isStatic: false, width: 18, height: 18, circleRadius: 9, material: 'projectile', color: '', blockHp: null, blockMaxHp: null });
const state = (timestamp: number, bodies = [ball(timestamp)]): GameState => ({ timestamp, bodies, kings: { left: { hp: 100, maxHp: 100 }, right: { hp: 100, maxHp: 100 } } });

test('64ms network samples produce uninterrupted display motion without physics prediction', () => {
    const buffer = new SnapshotInterpolator();
    const positions = [];
    for (let now = 0; now <= 512; now += 8) {
        if (now % 64 === 0) buffer.push(state(now), now);
        const frame = buffer.sample(now);
        if (now >= 104) positions.push(frame!.transforms.get(1)!.position.x);
    }
    for (let i = 1; i < positions.length; i++) assert.equal(positions[i] - positions[i - 1], 8);
});

test('received timestamps, clock skew and jitter do not reset interpolation every packet', () => {
    const buffer = new SnapshotInterpolator();
    buffer.push(state(10_000), 100);
    buffer.push(state(10_050), 158);
    buffer.push(state(10_100), 201);
    const a = buffer.sample(230)!.transforms.get(1)!.position.x;
    const b = buffer.sample(246)!.transforms.get(1)!.position.x;
    assert.ok(Math.abs(b - a - 16) < 0.01);
    buffer.push(state(10_050, [ball(99999)]), 247);
    assert.ok(buffer.sample(248)!.transforms.get(1)!.position.x < 10_100);
});

test('creation/removal follow the presentation timeline and stale packets cannot revive bodies', () => {
    const buffer = new SnapshotInterpolator();
    buffer.push(state(0, []), 0);
    buffer.push(state(50), 50);
    buffer.push(state(100, []), 100);
    assert.equal(buffer.sample(120)!.state.bodies.length, 0);
    assert.equal(buffer.sample(160)!.state.bodies.length, 1);
    assert.equal(buffer.sample(200)!.state.bodies.length, 0);
    buffer.push(state(50), 201);
    assert.equal(buffer.sample(202)!.state.bodies.length, 0);
});

test('long gaps hold the latest authority rather than extrapolating through a wall; reset clears epochs', () => {
    const buffer = new SnapshotInterpolator();
    buffer.push(state(0), 0); buffer.push(state(50), 50);
    assert.equal(buffer.sample(500)!.transforms.get(1)!.position.x, 50);
    buffer.reset();
    assert.equal(buffer.sample(510), undefined);
    buffer.push(state(2, [ball(8)]), 510);
    assert.equal(buffer.sample(520)!.state.bodies.length, 0);
    assert.equal(buffer.sample(620)!.transforms.get(1)!.position.x, 8);
});

test('rotations use the short arc and published endpoints stay immutable', () => {
    const buffer = new SnapshotInterpolator();
    const a = state(0, [ball(0, Math.PI - 0.1)]), b = state(100, [ball(100, -Math.PI + 0.1)]);
    buffer.push(a, 0); buffer.push(b, 100);
    assert.ok(Math.abs(buffer.sample(150)!.transforms.get(1)!.angle - Math.PI) < 0.00001);
    assert.equal(a.bodies[0].position.x, 0); assert.equal(b.bodies[0].position.x, 100);
});
