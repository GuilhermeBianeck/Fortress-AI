import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStorage, writeStorage } from './browserStorage';

test('denied browser storage never crashes identity/preferences paths', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Storage denied'); } });
    try { assert.equal(readStorage('identity'), null); assert.equal(writeStorage('identity', 'value'), false); assert.equal(writeStorage('identity', null), false); }
    finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});
