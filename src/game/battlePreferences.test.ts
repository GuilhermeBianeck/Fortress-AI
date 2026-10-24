import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBattlePreferences, readBattlePreferences, saveBattlePreferences, DEFAULT_BATTLE_PREFERENCES } from './battlePreferences';

test('battle preferences validate old, missing and untrusted stored values', () => {
    for (const value of [null, undefined, 'manual', [], { camera: 'broken', motion: 'full', hitLabels: 'no' }]) assert.deepEqual(parseBattlePreferences(value), DEFAULT_BATTLE_PREFERENCES);
    assert.deepEqual(parseBattlePreferences({ camera: 'manual', motion: 'reduced', hitLabels: false }), { camera: 'manual', motion: 'reduced', hitLabels: false });
});
test('preferences work without browser storage and survive storage denial', () => {
    assert.deepEqual(readBattlePreferences(), DEFAULT_BATTLE_PREFERENCES);
    assert.doesNotThrow(() => saveBattlePreferences(DEFAULT_BATTLE_PREFERENCES));
});
test('preferences persist, reject corrupt JSON and tolerate blocked storage access', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    let stored = '';
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } } });
    try {
        const value = { camera: 'turn' as const, motion: 'reduced' as const, hitLabels: false };
        saveBattlePreferences(value); assert.deepEqual(readBattlePreferences(), value);
        stored = '{broken'; assert.deepEqual(readBattlePreferences(), DEFAULT_BATTLE_PREFERENCES);
        Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Access denied'); } });
        assert.deepEqual(readBattlePreferences(), DEFAULT_BATTLE_PREFERENCES);
        assert.doesNotThrow(() => saveBattlePreferences(value));
    } finally {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage');
    }
});
