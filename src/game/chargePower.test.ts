import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHARGE_DURATION_MS, chargePower, MAX_POWER, MIN_POWER } from './chargePower';

test('charge climbs linearly from the minimum to a full bar and clamps', () => {
    assert.equal(chargePower(-50), MIN_POWER);
    assert.equal(chargePower(0), MIN_POWER);
    assert.equal(chargePower(CHARGE_DURATION_MS / 2), 52.5);
    assert.equal(chargePower(CHARGE_DURATION_MS), MAX_POWER);
    assert.equal(chargePower(CHARGE_DURATION_MS * 3), MAX_POWER);
});
