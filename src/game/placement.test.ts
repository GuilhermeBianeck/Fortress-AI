/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { canPlace, PLACEMENT_DIMENSIONS } from './placement';

const { SHAPE_DIMS } = createRequire(import.meta.url)('../../server/config/constants.ts') as typeof import('../../server/config/constants');

test('block, pillar and beam ghosts match authoritative manual-placement dimensions', () => {
    assert.deepEqual(PLACEMENT_DIMENSIONS, SHAPE_DIMS);
});
test('placement respects each side, including finite coordinates and vertical server limits', () => {
    assert.equal(canPlace({ x: 600, y: 330 }, 'left'), true);
    assert.equal(canPlace({ x: 1800, y: 330 }, 'right'), true);
    assert.equal(canPlace({ x: 1800, y: 330 }, 'left'), false);
    assert.equal(canPlace({ x: 600, y: 330 }, 'right'), false);
    assert.equal(canPlace({ x: NaN, y: 330 }, 'left'), false);
    assert.equal(canPlace({ x: 600, y: 701 }, 'left'), false);
});
