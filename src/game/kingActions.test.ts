import test from 'node:test';
import assert from 'node:assert/strict';
import { incomingKingThreat, KingActionDirector, type KingActionCue } from './kingActions';

const cue = (now: number, extra: Partial<KingActionCue> = {}): KingActionCue => ({ now, side: 'left', phase: 'combat', turn: 'left',
    king: { x: 600, y: 480 }, projectiles: [], aimAngle: Math.PI / 4, reducedMotion: false, ...extra });

test('aim blends continuously and reaches identical joint weights at 30/60/120Hz', () => {
    const frames = [30, 60, 120].map(hz => {
        const director = new KingActionDirector();
        director.update(cue(0, { phase: 'build' }));
        for (let t = 100; t < 400; t += 1000 / hz) director.update(cue(t));
        return director.update(cue(400));
    });
    assert.deepEqual(frames[0], frames[1]); assert.deepEqual(frames[1], frames[2]);
    assert.equal(frames[0].mode, 'aim'); assert.equal(frames[0].aim, 1);
    const d = new KingActionDirector(); d.update(cue(0, { phase: 'build' }));
    const before = d.update(cue(200, { phase: 'build' }));
    const start = d.update(cue(200));
    assert.equal(start.ready, before.ready); assert.equal(start.aim, 0);
    assert.ok(d.update(cue(290)).aim > 0 && d.update(cue(290)).aim < 1);
});

test('only accepted own shots trigger recoil, then recovery; future and remote shots do not', () => {
    const d = new KingActionDirector(); d.update(cue(0)); d.update(cue(200));
    const remote = { id: 7, side: 'right' as const, at: 300 };
    assert.equal(d.update(cue(300, { shot: remote })).mode, 'aim');
    const own = { ...remote, side: 'left' as const, at: 500 };
    assert.equal(d.update(cue(400, { shot: own })).mode, 'aim');
    const start = d.update(cue(500, { shot: own }));
    assert.equal(start.mode, 'recoil'); assert.equal(start.recoil, 0);
    assert.equal(d.update(cue(600, { shot: own })).recoil, 1);
    assert.equal(d.update(cue(700, { shot: own })).mode, 'recover');
    assert.equal(d.update(cue(1500, { shot: own })).mode, 'aim');
});

test('a moving approaching ball elicits bracing, but own, resting, receding and distant balls do not', () => {
    const king = { x: 600, y: 480 };
    const ball = { id: 7, position: { x: 800, y: 460 }, velocity: { x: -20, y: 2 } };
    assert.ok(incomingKingThreat(king, 'left', [ball]).amount > .4);
    assert.ok(incomingKingThreat(king, 'right', [ball]).look < 0);
    for (const invalid of [
        { ...ball, velocity: { x: 0, y: 0 } }, { ...ball, velocity: { x: 20, y: 0 } },
        { ...ball, position: { x: 1000, y: 480 } }, { ...ball, position: { x: 800, y: 200 } },
        { ...ball, velocity: { x: NaN, y: 0 } },
    ]) assert.equal(incomingKingThreat(king, 'left', [invalid]).amount, 0);
    assert.equal(incomingKingThreat(king, 'left', [ball], 7).amount, 0);
    const d = new KingActionDirector(); d.update(cue(0));
    assert.equal(d.update(cue(300, { turn: 'right', projectiles: [ball] })).mode, 'brace');
    assert.equal(d.update(cue(450, { turn: 'right', projectiles: [ball] })).brace, 1);
    const release = d.update(cue(500, { turn: 'right' }));
    assert.equal(release.mode, 'idle'); assert.equal(release.brace, 1);
    assert.equal(d.update(cue(700, { turn: 'right' })).brace, 0);
});

test('damage recovers once and authoritative results override every other action', () => {
    const d = new KingActionDirector();
    assert.equal(d.update(cue(100, { hitAt: 100 })).mode, 'hit');
    assert.equal(d.update(cue(600, { hitAt: 100 })).mode, 'recover');
    assert.equal(d.update(cue(1100, { hitAt: 100 })).mode, 'aim');
    const result = d.update(cue(1200, { phase: 'result', winner: 'right', hitAt: 1199 }));
    assert.equal(result.mode, 'defeat'); assert.equal(result.resultAt, 1200);
    assert.equal(d.update(cue(1500, { phase: 'result', winner: 'right' })).resultAt, 1200);
    d.reset();
    assert.equal(d.update(cue(0, { phase: 'build' })).resultAt, undefined);
});

test('reduced motion neutralizes all joints, and resuming motion blends from rest', () => {
    const d = new KingActionDirector(); d.update(cue(0));
    const still = d.update(cue(400, { reducedMotion: true }));
    for (const key of ['ready', 'aim', 'recoil', 'brace', 'recover', 'look'] as const) assert.equal(still[key], 0);
    assert.equal(d.update(cue(800)).aim, 0);
    assert.equal(d.update(cue(1000)).aim, 1);
    assert.equal(d.update(cue(10, { phase: 'build' })).aim, 0, 'clock rewind starts a new animation epoch');
});
test('falling blends into a bounded landing recovery and never overrides lethal HP', () => {
    const d = new KingActionDirector();
    assert.equal(d.update(cue(0, { velocity: { x: 3, y: 5 } })).mode, 'airborne');
    const fall = d.update(cue(200, { velocity: { x: 2, y: 7 } }));
    assert.equal(fall.airborne, 1);
    assert.equal(d.update(cue(300, { velocity: { x: 0, y: 0.2 } })).mode, 'landing');
    assert.equal(d.update(cue(500, { velocity: { x: 0, y: 0 } })).landing, 1);
    assert.equal(d.update(cue(800, { velocity: { x: 0, y: 0 } })).mode, 'aim');
    assert.equal(d.update(cue(900, { hp: 0, velocity: { x: 8, y: 10 } })).mode, 'defeat');
    const still = d.update(cue(1000, { reducedMotion: true, velocity: { x: 8, y: 10 } }));
    assert.equal(still.airborne, 0); assert.equal(still.landing, 0);
});

test('charge adds power-scaled preparation, preserves aim and blends out without snapping', () => {
    const d = new KingActionDirector(); d.update(cue(0)); d.update(cue(200));
    assert.equal(d.update(cue(200, { chargePower: 5 })).charge, 0);
    const low = d.update(cue(400, { chargePower: 5 }));
    assert.equal(low.mode, 'charge'); assert.equal(low.aim, 1);
    assert.equal(low.charge, .2875);
    const high = d.update(cue(600, { chargePower: 100 }));
    assert.equal(high.charge, 1);
    const cancelled = d.update(cue(600));
    assert.equal(cancelled.mode, 'aim'); assert.equal(cancelled.charge, high.charge);
    assert.ok(d.update(cue(690)).charge > 0 && d.update(cue(690)).charge < 1);
    assert.equal(d.update(cue(800)).charge, 0);
});

test('charge is turn/phase gated and cannot override accepted shots, injuries or defeat', () => {
    for (const extra of [
        { turn: 'right' as const }, { phase: 'build' as const }, { chargePower: NaN },
        { hp: 0 }, { hitAt: 0 }, { velocity: { x: 0, y: 5 } },
        { shot: { id: 7, side: 'left' as const, at: 0 } },
        { shot: { id: 7, side: 'left' as const, at: -1000 }, projectiles: [{ id: 7, position: { x: 800, y: 400 }, velocity: { x: 10, y: 0 } }] },
    ]) {
        const d = new KingActionDirector();
        assert.notEqual(d.update(cue(0, { chargePower: 80, ...extra })).mode, 'charge');
    }
    const d = new KingActionDirector();
    d.update(cue(0, { chargePower: 100 }));
    assert.equal(d.update(cue(300, { chargePower: 100 })).charge, 1);
    assert.equal(d.update(cue(301, { chargePower: 100, reducedMotion: true })).charge, 0);
    assert.equal(d.update(cue(400, { chargePower: 100 })).charge, 0);
    assert.equal(d.update(cue(600, { chargePower: 100 })).charge, 1);
});

test('charge clips are elapsed-time based for both royal identities', () => {
    for (const side of ['left', 'right'] as const) {
        const poses = [30, 60, 120].map(hz => {
            const d = new KingActionDirector();
            d.update(cue(0, { side, turn: side, chargePower: 60 }));
            for (let t = 0; t < 400; t += 1000 / hz) d.update(cue(t, { side, turn: side, chargePower: 60 }));
            return d.update(cue(400, { side, turn: side, chargePower: 60 }));
        });
        assert.deepEqual(poses[0], poses[1]); assert.deepEqual(poses[1], poses[2]);
    }
});
