/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cannonMuzzle, CANNON_ART, MUZZLE_LOCAL } from './cannonPresentation';
import { cannonPosition } from './ballistics';
import { WORLD_WIDTH } from '../types';

test('muzzle art attachment mirrors both sides at the same ground height', () => {
    const points = [{ x: 0, y: 520 }, { x: WORLD_WIDTH, y: 520 }];
    for (const degrees of [10, 45, 90, 170]) {
        const angle = degrees * Math.PI / 180;
        const left = cannonMuzzle('left', angle, points);
        const right = cannonMuzzle('right', angle, points);
        assert.ok(Math.abs(left.x + right.x - WORLD_WIDTH) < 0.001);
        assert.equal(left.y, right.y);
        assert.ok(left.y < cannonPosition('left', points).y);
    }
});

test('visual muzzle rotates around the same trunnion without moving the physics origin', () => {
    const points = [{ x: 0, y: 500 }, { x: WORLD_WIDTH, y: 540 }];
    const origin = cannonPosition('right', points);
    const horizontal = cannonMuzzle('right', 0, points);
    const vertical = cannonMuzzle('right', Math.PI / 2, points);
    assert.equal(horizontal.x, origin.x - MUZZLE_LOCAL.x);
    assert.equal(horizontal.y, origin.y + CANNON_ART.originY + MUZZLE_LOCAL.y);
    assert.ok(Math.abs(vertical.y - (origin.y + CANNON_ART.originY - MUZZLE_LOCAL.x)) < 0.001);
    assert.deepEqual(cannonPosition('right', points), origin);
});
