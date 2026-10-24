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
test('adaptive delay responds to a burst, recovers slowly, stays bounded and never rewinds the presentation clock', () => {
    const buffer = new SnapshotInterpolator();
    let last = -Infinity, peak = 100;
    for (let now = 0; now < 8000; now += 10) {
        // A transport burst: packets150-350 arrive together at400ms, then normal delivery returns.
        if (now % 50 === 0 && (now < 150 || now >= 400)) {
            if (now === 400) for (let timestamp = 150; timestamp < 400; timestamp += 50) buffer.push(state(timestamp), now);
            buffer.push(state(now), now);
        }
        const frame = buffer.sample(now)!;
        assert.ok(frame.timestamp >= last); last = frame.timestamp;
        assert.ok(frame.delayMs >= 100 && frame.delayMs <= 240);
        assert.ok(frame.timestamp <= now);
        peak = Math.max(peak, frame.delayMs);
    }
    assert.ok(peak > 140);
    assert.ok(buffer.delay < peak - 40);
});
test('a jitter-buffered stream never predicts past authority or interpolates a fabricated path through a long outage', () => {
    const buffer = new SnapshotInterpolator(); buffer.push(state(0), 0); buffer.push(state(50), 50);
    buffer.sample(150);
    buffer.push(state(1000), 1000);
    const recovery = buffer.sample(1000)!;
    assert.equal(recovery.transforms.get(1)!.position.x, 50);
    assert.ok(recovery.resynced);
    buffer.push(state(1050, []), 1050);
    const removed = buffer.sample(1300)!;
    assert.equal(removed.state.bodies.length, 0);
    assert.ok(removed.timestamp <= 1050);
    buffer.reset(); assert.equal(buffer.delay, 100);
});
test('packet reordering, malformed clocks and repeated render calls do not corrupt the buffer', () => {
    const buffer = new SnapshotInterpolator(); buffer.push(state(0), 0); buffer.push(state(50), 50);
    buffer.push(state(NaN), 60); buffer.push(state(25), 70); buffer.push(state(100), 40);
    const frame = buffer.sample(150)!;
    assert.equal(frame.timestamp, 50);
    assert.equal(buffer.sample(150)!.timestamp, 50);
    assert.equal(buffer.sample(NaN), undefined);
});
test('adaptive buffering materially reduces held frames on a repeatable batched connection versus a fixed100ms buffer', () => {
    const buffer = new SnapshotInterpolator();
    let fixedHeld = 0, adaptiveHeld = 0, previousFixed = -Infinity, previousAdaptive = -Infinity, newest = 0;
    for (let now = 0; now <= 6000; now += 10) {
        if (now % 250 === 0) {
            for (let timestamp = Math.max(0, now - 200); timestamp <= now; timestamp += 50) buffer.push(state(timestamp), now);
            newest = now;
        }
        const fixed = Math.min(newest, now - 100), adaptive = buffer.sample(now)!;
        if (now > 2000) {
            if (fixed === previousFixed) fixedHeld++;
            if (adaptive.timestamp === previousAdaptive) adaptiveHeld++;
        }
        assert.ok(adaptive.timestamp <= newest);
        previousFixed = fixed; previousAdaptive = adaptive.timestamp;
    }
    assert.ok(adaptiveHeld < fixedHeld * .4, `${adaptiveHeld} adaptive holds vs ${fixedHeld} fixed holds`);
});
