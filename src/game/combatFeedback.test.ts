import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hitFeedback, layoutHitFeedback, type BattleEffect } from './combatFeedback';

const effect = (extra: Partial<BattleEffect>): BattleEffect => ({ x: 200, y: 350, at: 100, kind: 'damage', side: 'left', damage: 65, source: 'projectile', ...extra });
test('king feedback distinguishes authoritative heavy, light, crush, fall and defeat without inventing damage', () => {
    assert.equal(hitFeedback(effect({}))?.caption, 'HEAVY HIT');
    assert.equal(hitFeedback(effect({ damage: 12 }))?.caption, 'LIGHT HIT');
    assert.equal(hitFeedback(effect({ damage: 35 }))?.caption, 'ROYAL HIT');
    assert.equal(hitFeedback(effect({ source: 'steel' }))?.caption, 'CRUSH');
    assert.equal(hitFeedback(effect({ source: 'Terrain' }))?.caption, 'FALL');
    assert.equal(hitFeedback(effect({ source: 'lava' }))?.caption, 'LAVA');
    assert.equal(hitFeedback(effect({ hp: 0 }))?.caption, 'DEFEATED');
    assert.equal(hitFeedback(effect({ damage: 7.2 }))?.amount, '-7.2');
    assert.equal(hitFeedback(effect({ damage: .05 }))?.amount, '<0.1');
    assert.equal(hitFeedback(effect({ damage: NaN })), null);
    assert.equal(hitFeedback(effect({ damage: 0 })), null);
});
test('armor and breakage use real impact details; ground and legacy impacts have no false hit labels', () => {
    const armor = effect({ kind: 'impact', target: 'block', material: 'steel', damage: 40, targetId: 3 });
    assert.equal(hitFeedback(armor)?.caption, 'ARMOR HIT');
    assert.equal(hitFeedback({ ...armor, destroyed: true })?.caption, 'BROKEN');
    assert.equal(hitFeedback({ ...armor, destroyed: true, material: 'ice' })?.caption, 'SHATTERED');
    assert.equal(hitFeedback({ ...armor, target: 'terrain' }), null);
    assert.equal(hitFeedback({ ...armor, target: undefined }), null);
    assert.equal(hitFeedback(armor, false), null);
    assert.equal(hitFeedback(effect({}), false)?.caption, '');
    assert.equal(hitFeedback(effect({}), false)?.amount, '-65');
});
test('crowded hit labels stay inside phone/desktop bounds and never overlap HUD or each other', () => {
    for (const [width, height] of [[320, 300], [390, 600], [1280, 650]]) {
        const excluded = [{ x: 0, y: 0, width, height: 130 }, { x: width - 110, y: height - 56, width: 110, height: 56 }];
        const cues = Array.from({ length: 30 }, (_, i) => ({ ...hitFeedback(effect({ side: i === 0 ? 'left' : 'right' }))!, key: `target:${i}`, priority: i === 0 ? 120 : 40, x: width / 2, y: height - 80, at: i }));
        const placed = layoutHitFeedback(cues, width, height, excluded);
        assert.ok(placed.length > 0 && placed.length <= (width < 600 ? 3 : 6));
        assert.equal(placed[0].key, 'target:0');
        const boxes = [...excluded];
        for (const { box } of placed) {
            assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height);
            for (const other of boxes) assert.ok(!(box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y));
            boxes.push(box);
        }
        const duplicates = layoutHitFeedback([cues[0], cues[0], cues[0]], width, height, excluded);
        assert.equal(duplicates.length, 1);
    }
});
