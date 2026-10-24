/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BodyState, CompactGameState, GameState } from '../types';
import { reconstructGameState } from './gameStateSnapshot';

function body(id: number, isStatic = false): BodyState {
    return {
        id, isStatic, position: { x: 10, y: 20 }, angle: 0,
        velocity: { x: 1, y: 2 }, label: 'wood', width: 30, height: 40,
        circleRadius: 0, material: 'wood', color: '#A67C52',
        blockHp: 100, blockMaxHp: 100,
    };
}

function packet(overrides: Partial<CompactGameState> = {}): CompactGameState {
    return {
        n: [], u: [], r: [], f: 0, t: 1000,
        k: { l: { hp: 100, maxHp: 100, x: 100 }, r: { hp: 100, maxHp: 100, x: 900 } },
        ...overrides,
    };
}

function freezeSnapshot(state: GameState): void {
    for (const body of state.bodies) {
        Object.freeze(body.position);
        Object.freeze(body.velocity);
        Object.freeze(body);
    }
    Object.freeze(state.bodies);
    Object.freeze(state.kings.left);
    Object.freeze(state.kings.right);
    Object.freeze(state.kings);
    Object.freeze(state);
}

test('later deltas preserve frozen interpolation endpoints and their cache', () => {
    const input = packet({ n: [body(1), body(2, true)] });
    const first = reconstructGameState(new Map(), input);
    const before = structuredClone(first.gameState);
    freezeSnapshot(first.gameState);

    const second = reconstructGameState(first.bodyCache, packet({
        u: [[1, 40, 60, 0.5, 3, 4, 75]], t: 1050,
    }));
    const previous = first.gameState.bodies[0];
    const current = second.gameState.bodies[0];
    assert.deepEqual(first.gameState, before);
    assert.equal(first.bodyCache.get(1), previous);
    assert.notEqual(second.bodyCache, first.bodyCache);
    assert.notEqual(second.gameState.bodies, first.gameState.bodies);
    assert.notEqual(current, previous);
    assert.notEqual(current.position, previous.position);
    assert.notEqual(current.velocity, previous.velocity);
    assert.deepEqual(current, {
        ...previous, position: { x: 40, y: 60 }, angle: 0.5,
        velocity: { x: 3, y: 4 }, blockHp: 75,
    });
    assert.notEqual(previous.position, input.n[0].position);
    assert.notEqual(previous.velocity, input.n[0].velocity);
    assert.notEqual(first.gameState.kings.left, input.k.l);
    assert.notEqual(first.gameState.kings.right, input.k.r);

    freezeSnapshot(second.gameState);
    const third = reconstructGameState(second.bodyCache, packet({
        n: [body(3)], u: [[1, 80, 90, 1, 5, 6, -1]], r: [2], t: 1100,
    }));
    assert.deepEqual(second.gameState.bodies.map(b => b.id), [1, 2]);
    assert.deepEqual(current.position, { x: 40, y: 60 });
    assert.deepEqual(third.gameState.bodies.map(b => b.id), [1, 3]);
    assert.equal(third.gameState.bodies[0].blockHp, null);
    assert.equal(third.gameState.timestamp, 1100);
});

test('partial packets preserve metadata until full sync replaces the cache', () => {
    const first = reconstructGameState(new Map(), packet({ n: [body(1), body(2, true)] }));
    const delta = reconstructGameState(first.bodyCache, packet({
        u: [[1, 50, 60, 0.5, 3, 4, 0], [999, 0, 0, 0, 0, 0, -1]],
    }));
    assert.deepEqual(delta.gameState.bodies.map(b => b.id), [1, 2]);
    assert.equal(delta.gameState.bodies[0].blockHp, 0);
    assert.equal(delta.gameState.bodies[0].width, 30);
    assert.equal(delta.gameState.bodies[0].material, 'wood');
    assert.equal(delta.gameState.bodies[1].isStatic, true);

    const full = reconstructGameState(delta.bodyCache, packet({ f: 1, n: [body(3)] }));
    assert.deepEqual(full.gameState.bodies.map(b => b.id), [3]);
    assert.deepEqual([...delta.bodyCache.keys()], [1, 2]);
});

test('cache resets do not mutate published snapshots or retain previous-session bodies', () => {
    const first = reconstructGameState(new Map(), packet({ n: [body(1), body(2, true)] }));
    freezeSnapshot(first.gameState);
    first.bodyCache.clear();
    const next = reconstructGameState(first.bodyCache, packet({ n: [body(3)] }));
    assert.deepEqual(next.gameState.bodies.map(b => b.id), [3]);
    assert.deepEqual(first.gameState.bodies.map(b => b.id), [1, 2]);
});

test('projectile ownership survives delta packets after crossing the centre of the map', () => {
    const first = reconstructGameState(new Map(), packet({ n: [{ ...body(7), label: 'projectile', side: 'right' }] }));
    const next = reconstructGameState(first.bodyCache, packet({ t: 1050, u: [[7, 600, 400, 0, -20, 2, -1]] }));
    assert.equal(next.gameState.bodies[0].side, 'right');
    assert.equal(next.gameState.bodies[0].position.x, 600);
    assert.equal(first.gameState.bodies[0].position.x, 10);
});
