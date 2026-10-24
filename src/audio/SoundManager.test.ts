/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('effects share the music context, duck only combat sounds and never resume stale sounds after mute', async () => {
    const previous = ['AudioContext', 'document', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
    const sources: Source[] = [];
    let contexts = 0;
    class Source {
        onended: (() => void) | null = null;
        frequency = { value: 0, values: [] as number[], setValueAtTime(value: number) { this.values.push(value); }, exponentialRampToValueAtTime() {} };
        stops = 0;
        connect<T>(node: T) { return node; }
        start() {}
        stop() { this.stops++; }
    }
    class Context {
        state = 'running'; currentTime = 0; sampleRate = 48000; destination = {};
        constructor() { contexts++; }
        async resume() { this.state = 'running'; }
        async suspend() { this.state = 'suspended'; }
        createOscillator() { const node = new Source(); sources.push(node); return node; }
        createBufferSource() { const node = new Source(); sources.push(node); return node; }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect<T>(node: T) { return node; } }; }
        createBiquadFilter() { return { frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect<T>(node: T) { return node; } }; }
        createBuffer(_channels: number, size: number) { return { getChannelData: () => new Float32Array(size) }; }
    }
    const doc = { visibilityState: 'visible' };
    Object.defineProperty(globalThis, 'AudioContext', { value: Context, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => '0', setItem: () => { throw new Error('Storage unavailable'); } }, configurable: true });
    try {
        const audio = await import('./SoundManager');
        const context = audio.getAudioContext();
        let ducked = 0;
        const unsubscribe = audio.subscribeCombatSound(() => { ducked++; });
        audio.playClick(); audio.playHover(); audio.playSwitch(); assert.equal(ducked, 0);
        audio.playFire(); audio.playImpact(); audio.playExplosion(); audio.playBoom();
        assert.equal(ducked, 4); assert.equal(contexts, 1);
        audio.playImpact('steel'); audio.playImpact('Terrain'); audio.playImpact('ice');
        assert.equal(sources[sources.length - 3].frequency.values[0], 900);
        assert.equal(sources[sources.length - 2].frequency.values[0], 90);
        assert.equal(sources[sources.length - 1].frequency.values[0], 750);
        assert.equal(ducked, 7);
        const scheduledStops = sources.map(source => source.stops);
        assert.equal(audio.toggleMute(), true);
        sources.forEach((source, index) => assert.equal(source.stops, scheduledStops[index] + 1));
        const count = sources.length; audio.playFire(); assert.equal(sources.length, count);
        assert.equal(audio.toggleMute(), false);
        assert.equal(audio.getAudioContext(), context); assert.equal(contexts, 1);
        assert.equal(sources.length, count);
        doc.visibilityState = 'hidden'; audio.playFire(); assert.equal(sources.length, count);
        doc.visibilityState = 'visible'; unsubscribe(); audio.playFire(); assert.equal(ducked, 7);
        audio.stopSoundEffects();
    } finally {
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
    }
});
