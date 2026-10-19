/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameState } from '../types';
import { kingFeedbackPosition } from './battleFeedback';

test('right-side damage feedback uses the current snapshot even if the HP event has no coordinates', () => {
    const state: GameState = { bodies: [], timestamp: 0, kings: {
        left: { hp: 100, maxHp: 100, x: 600, y: 460 },
        right: { hp: 80, maxHp: 100, x: 2100, y: 420 },
    } };
    assert.deepEqual(kingFeedbackPosition('right', state, { hp: 80, maxHp: 100 }), { x: 2100, y: 420 });
});

test('feedback falls back to last known coordinates, then the correct side', () => {
    assert.deepEqual(kingFeedbackPosition('right', null, { hp: 80, maxHp: 100, x: 2200, y: 410 }), { x: 2200, y: 410 });
    assert.deepEqual(kingFeedbackPosition('right', null, { hp: 80, maxHp: 100 }), { x: 1800, y: 480 });
    assert.deepEqual(kingFeedbackPosition('left', null, { hp: 80, maxHp: 100 }), { x: 600, y: 480 });
});
