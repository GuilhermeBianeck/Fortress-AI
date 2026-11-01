import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { currentOpponentAim, OpponentBarrel, AIM_STALE_MS, AIM_UPDATE_MS, type ReceivedAim } from './opponentAim';
const preview: ReceivedAim = { epoch: 'turn', side: 'right', angle: Math.PI / 3, charging: true, power: 70, sequence: 1, receivedAt: 100 };

test('browser pacing matches the CommonJS server contract', () => {
    const contract = createRequire(import.meta.url)('../../server/shared/aimPreview.ts') as typeof import('../../server/shared/aimPreview');
    assert.equal(AIM_STALE_MS, contract.AIM_STALE_MS);
    assert.equal(AIM_UPDATE_MS, contract.AIM_UPDATE_MS);
});

test('opponent preparation expires by local arrival and cannot survive firing or a turn change', () => {
    assert.equal(currentOpponentAim(preview, 100, 'right', false), preview);
    assert.equal(currentOpponentAim(preview, 100 + AIM_STALE_MS - 1, 'right', false), preview);
    for (const value of [currentOpponentAim(preview, 100 + AIM_STALE_MS, 'right', false),
        currentOpponentAim(preview, 99, 'right', false), currentOpponentAim(preview, 100, 'left', false),
        currentOpponentAim(preview, 100, 'right', true), currentOpponentAim(null, 100, 'right', false)]) assert.equal(value, null);
});

test('barrel smoothing is frame-rate independent, bounded and immediate with reduced motion', () => {
    const angles = [30, 60, 120].map(hz => {
        const barrel = new OpponentBarrel();
        let angle = 0;
        for (let i = 0; i < hz; i++) angle = barrel.sample(Math.PI / 2, 1000 / hz, false);
        return angle;
    });
    assert.ok(Math.abs(angles[0] - angles[2]) < 1e-12);
    const barrel = new OpponentBarrel();
    const angle = barrel.sample(Math.PI / 2, 16, false);
    assert.ok(angle > Math.PI / 4 && angle < Math.PI / 2);
    assert.equal(barrel.sample(Math.PI / 3, 16, true), Math.PI / 3);
    barrel.reset(); assert.equal(barrel.sample(Math.PI / 4, 16, false), Math.PI / 4);
});
