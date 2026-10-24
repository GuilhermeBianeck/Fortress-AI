/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kingPresentation, KING_HIT_MS } from './kingAnimation';

test('damage has a bounded reaction followed by idle, without leaking to the other king', () => {
    assert.equal(kingPresentation({ now: 1000, side: 'right', phase: 'combat', hitAt: 1000 }).pose, 'hit');
    assert.equal(kingPresentation({ now: 1240, side: 'left', phase: 'combat' }).pose, 'idle');
    assert.equal(kingPresentation({ now: 1000 + KING_HIT_MS, side: 'right', phase: 'combat', hitAt: 1000 }).pose, 'idle');
    assert.equal(kingPresentation({ now: 999, side: 'right', phase: 'combat', hitAt: 1000 }).pose, 'idle');
});
test('authoritative result takes precedence over a recent hit', () => {
    assert.equal(kingPresentation({ now: 1000, side: 'right', winner: 'right', phase: 'result', hitAt: 999 }).pose, 'victory');
    assert.equal(kingPresentation({ now: 1000, side: 'left', winner: 'right', phase: 'result', hitAt: 999 }).pose, 'defeat');
    assert.equal(kingPresentation({ now: 1000, side: 'left', winner: 'right', phase: 'build' }).pose, 'idle');
});
test('reduced motion keeps all key poses but freezes their transforms', () => {
    for (const winner of ['left', 'right'] as const) {
        const state = kingPresentation({ now: 1200, side: 'left', winner, phase: 'result', reducedMotion: true });
        assert.equal(state.scaleY, 1); assert.equal(state.tilt, 0);
    }
    assert.deepEqual(kingPresentation({ now: 1200, side: 'left', phase: 'combat', hitAt: 1000, reducedMotion: true }), { pose: 'hit', scaleY: 1, tilt: 0, reactionOpacity: 1 });
});
test('reaction artwork blends in and out at the same grounded pivot', () => {
    const at = (now: number) => kingPresentation({ now, side: 'left', phase: 'combat', hitAt: 1000 }).reactionOpacity;
    assert.equal(at(1000), 0); assert.equal(at(1090), 1);
    assert.ok(at(1450) > 0 && at(1450) < 1); assert.equal(at(1480), 0);
    assert.equal(kingPresentation({ now: 1000, side: 'left', phase: 'result', winner: 'left', resultAt: 1000 }).reactionOpacity, 0);
    assert.equal(kingPresentation({ now: 1160, side: 'left', phase: 'result', winner: 'left', resultAt: 1000 }).reactionOpacity, 1);
});
test('a zero-HP king is visibly defeated before the result phase, not idle on the ground', () => {
    assert.equal(kingPresentation({ now: 1000, side: 'left', phase: 'combat', hp: 0, hitAt: 999 }).pose, 'defeat');
});
