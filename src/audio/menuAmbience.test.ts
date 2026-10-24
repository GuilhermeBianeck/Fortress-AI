/// <reference types="node" />
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { test } from 'node:test';
import { analyzePcm, createMenuIntro, createPeriodicLoop, encodeWav, MENU_AUDIO_REGIONS } from '../../scripts/prepare-menu-audio';
import { createMenuAmbience, disposeMenuAmbience, MENU_AMBIENCE_GAIN, MENU_AMBIENCE_URL, MENU_INTRO_URL, setMenuAmbience } from './menuAmbience';
import type { MenuAmbienceEnvironment } from './menuAmbience';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const settleFade = () => new Promise<void>(resolve => setTimeout(resolve, 115));

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

class Events {
    visibilityState: DocumentVisibilityState = 'visible';
    private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    addEventListener(name: string, callback: EventListenerOrEventListenerObject | null) {
        if (!callback) return;
        const set = this.listeners.get(name) ?? new Set();
        set.add(callback);
        this.listeners.set(name, set);
    }
    removeEventListener(name: string, callback: EventListenerOrEventListenerObject | null) {
        if (callback) this.listeners.get(name)?.delete(callback);
    }
    emit(name: string, trusted = true) {
        const event = { type: name, isTrusted: trusted } as Event;
        for (const callback of [...this.listeners.get(name) ?? []]) {
            if (typeof callback === 'function') callback(event); else callback.handleEvent(event);
        }
    }
    get count() { return [...this.listeners.values()].reduce((count, set) => count + set.size, 0); }
}

class AudioParamStub {
    value = 1;
    events: { kind: string; value?: number; time: number }[] = [];
    cancelScheduledValues(time: number) { this.events.push({ kind: 'cancel', time }); return this; }
    setValueAtTime(value: number, time: number) { this.value = value; this.events.push({ kind: 'set', value, time }); return this; }
    linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push({ kind: 'ramp', value, time }); return this; }
}

class GainStub {
    gain = new AudioParamStub();
    disconnected = false;
    connect(target: unknown) { return target; }
    disconnect() { this.disconnected = true; }
}

class SourceStub {
    failStart = false;
    buffer: AudioBuffer | null = null;
    loop = false;
    loopStart = 0;
    loopEnd = 0;
    onended: (() => void) | null = null;
    connected = false;
    starts: { when: number; offset: number }[] = [];
    stops: (number | undefined)[] = [];
    connect(target: GainStub) { this.connected = true; return target; }
    disconnect() { this.connected = false; }
    start(when: number, offset: number) {
        if (this.failStart) throw new Error('Source failed to start');
        this.starts.push({ when, offset });
    }
    stop(when?: number) {
        if (!this.starts.length) throw new Error('InvalidStateError: source never started');
        this.stops.push(when);
    }
}

class BufferStub {
    private data: Float32Array[];
    constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number, value = 0) {
        this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length).fill(value));
    }
    get duration() { return this.length / this.sampleRate; }
    getChannelData(channel: number) { return this.data[channel]; }
}

const audioBuffer = (channels: number, length: number, rate: number, value = 0) =>
    new BufferStub(channels, length, rate, value) as unknown as AudioBuffer;

class ContextStub {
    state: AudioContextState = 'suspended';
    currentTime = 0;
    destination = {};
    sources: SourceStub[] = [];
    gains: GainStub[] = [];
    resumeCalls = 0;
    suspendCalls = 0;
    closeCalls = 0;
    decodeCalls = 0;
    denyResume = false;
    failStart = false;
    nextResumeGates: Promise<void>[] = [];
    resumeGate?: Promise<void>;
    decodeGate?: Promise<AudioBuffer>;
    decoded = audioBuffer(2, 1600, 1000, 0.1);
    introDecoded = audioBuffer(2, 6000, 1000, 0.2);
    async resume() {
        this.resumeCalls++;
        if (this.denyResume) throw new Error('NotAllowedError');
        await (this.nextResumeGates.shift() ?? this.resumeGate);
        if (this.state !== 'closed') this.state = 'running';
    }
    async suspend() { this.suspendCalls++; this.state = 'suspended'; }
    async close() { this.closeCalls++; this.state = 'closed'; }
    async decodeAudioData(data: ArrayBuffer) {
        this.decodeCalls++;
        if (this.decodeGate) await this.decodeGate;
        return new Uint8Array(data)[0] === 2 ? this.introDecoded : this.decoded;
    }
    createBuffer(channels: number, length: number, rate: number) { return audioBuffer(channels, length, rate); }
    createBufferSource() {
        const source = new SourceStub();
        source.failStart = this.failStart;
        this.sources.push(source);
        return source;
    }
    createGain() { const gain = new GainStub(); this.gains.push(gain); return gain; }
    get liveSources() { return this.sources.filter(source => source.connected && source.starts.length > 0).length; }
}

function response(ok = true): Response {
    return { ok, status: ok ? 200 : 503, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
}

function fixture() {
    const events = new Events(), document = new Events(), context = new ContextStub();
    let contexts = 0;
    const requests: { url: string; signal?: AbortSignal | null }[] = [];
    let fetcher = async () => response();
    const environment: MenuAmbienceEnvironment = {
        events, document,
        createContext: () => { contexts++; return context as unknown as AudioContext; },
        fetch: async (url, init) => {
            requests.push({ url: String(url), signal: init?.signal });
            const result = await fetcher();
            return { ok: result.ok, status: result.status, arrayBuffer: async () => {
                const data = await result.arrayBuffer();
                new Uint8Array(data)[0] = String(url) === MENU_INTRO_URL ? 2 : 1;
                return data;
            } } as Response;
        },
    };
    const controller = createMenuAmbience(environment);
    return { events, document, context, requests, controller, environment,
        setFetch: (next: typeof fetcher) => { fetcher = next; },
        get contexts() { return contexts; },
    };
}

test('import and the singleton API are safe outside a browser', () => {
    assert.doesNotThrow(() => {
        setMenuAmbience(true, false);
        setMenuAmbience(false, true);
        disposeMenuAmbience();
        disposeMenuAmbience();
    });
});

test('only a trusted first gesture unlocks; fetch/decode and the looping voice are lazy and deduplicated', async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    f.controller.setMenuAmbience(true, false);
    assert.equal(f.contexts, 0);
    assert.equal(f.requests.length, 0);
    assert.equal(f.events.count + f.document.count, 7);
    f.events.emit('pointerdown', false);
    await flush();
    assert.equal(f.contexts, 0);
    f.events.emit('pointerdown');
    f.events.emit('touchend');
    f.events.emit('click');
    await flush();
    assert.equal(f.contexts, 1);
    assert.equal(f.context.resumeCalls, 3);
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[0].url, MENU_AMBIENCE_URL);
    assert.equal(f.requests[1].url, MENU_INTRO_URL);
    assert.equal(f.context.decodeCalls, 2);
    assert.equal(f.context.liveSources, 1);
    const source = f.context.sources[0];
    assert.equal(source.buffer?.duration, 7.6);
    for (let channel = 0; channel < 2; channel++) {
        assert.deepEqual(source.buffer?.getChannelData(channel).subarray(6000), f.context.decoded.getChannelData(channel));
    }
    assert.equal(source.loop, true);
    assert.equal(source.loopStart, 6);
    assert.equal(source.loopEnd, 7.6);
    assert.deepEqual(source.starts, [{ when: 0, offset: 0 }]);
    assert.deepEqual(f.context.gains[0].gain.events, [
        { kind: 'set', value: 0, time: 0 }, { kind: 'ramp', value: MENU_AMBIENCE_GAIN, time: 0.35 },
    ]);
    for (let i = 0; i < 20; i++) {
        f.controller.setMenuAmbience(true, false);
        f.events.emit('keydown');
    }
    await flush();
    assert.equal(f.context.sources.length, 1);
    assert.equal(f.events.count + f.document.count, 7);
});

test('muted gestures unlock silently; global mute fades out and unmute reuses the buffer', async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    f.controller.setMenuAmbience(true, true);
    f.events.emit('click');
    await flush();
    assert.equal(f.requests.length, 0);
    assert.equal(f.context.sources.length, 0);
    await settleFade();
    assert.equal(f.context.state, 'suspended');
    f.controller.setMenuAmbience(true, false);
    await flush();
    assert.equal(f.context.sources.length, 0, 'a muted-only gesture does not arm or consume the welcome');
    f.events.emit('click');
    await flush();
    assert.equal(f.context.liveSources, 1);
    f.context.currentTime = 1;
    f.controller.setMenuAmbience(true, true);
    assert.equal(f.context.sources[0].stops[0], 1.08);
    assert.deepEqual(f.context.gains[0].gain.events.at(-1), { kind: 'ramp', value: 0, time: 1.08 });
    await settleFade();
    assert.equal(f.context.liveSources, 0);
    assert.equal(f.context.state, 'suspended');
    f.controller.setMenuAmbience(true, false);
    await flush();
    assert.equal(f.context.liveSources, 1);
    assert.equal(f.requests.length, 2);
    assert.equal(f.context.decodeCalls, 2);
    assert.equal(f.context.sources[1].starts[0].offset, 0);
    assert.equal(f.context.sources[1].buffer, f.context.decoded);
    assert.equal(f.context.sources[1].loopStart, 0);
});

test('match/menu transitions remove listeners and return after unlock without another gesture', async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    f.controller.setMenuAmbience(true, false);
    f.events.emit('pointerdown');
    await flush();
    f.controller.setMenuAmbience(false, false);
    assert.equal(f.events.count + f.document.count, 0);
    await settleFade();
    assert.equal(f.context.liveSources, 0);
    assert.equal(f.context.state, 'suspended');
    f.events.emit('click');
    await flush();
    assert.equal(f.context.sources.length, 1);
    f.controller.setMenuAmbience(true, false);
    await flush();
    assert.equal(f.context.liveSources, 1);
    assert.equal(f.requests.length, 2);
    assert.equal(f.context.sources[1].loopStart, 0);
});

test('visibility and page lifecycle stop immediately and restore only a visible, unmuted menu', async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    f.controller.setMenuAmbience(true, false);
    f.events.emit('pointerdown');
    await flush();
    f.document.visibilityState = 'hidden';
    f.document.emit('visibilitychange');
    assert.equal(f.context.liveSources, 0);
    assert.equal(f.context.state, 'suspended');
    f.events.emit('click');
    await flush();
    assert.equal(f.context.sources.length, 1);
    f.document.visibilityState = 'visible';
    f.document.emit('visibilitychange');
    await flush();
    assert.equal(f.context.liveSources, 1);
    f.events.emit('pagehide');
    assert.equal(f.context.liveSources, 0);
    f.events.emit('pageshow');
    await flush();
    assert.equal(f.context.liveSources, 1);
    f.controller.setMenuAmbience(true, true);
    f.document.visibilityState = 'hidden';
    f.document.emit('visibilitychange');
    f.document.visibilityState = 'visible';
    f.document.emit('visibilitychange');
    await flush();
    assert.equal(f.context.liveSources, 0);
    assert.equal(f.requests.length, 2);
});

test('rapid toggles never leave two connected sources or multiply listeners', async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    f.controller.setMenuAmbience(true, false);
    f.events.emit('pointerdown');
    await flush();
    for (let i = 0; i < 12; i++) {
        f.context.currentTime += 0.025;
        f.controller.setMenuAmbience(false, false);
        f.controller.setMenuAmbience(true, true);
        f.controller.setMenuAmbience(true, false);
        f.events.emit('click');
        await flush();
        assert.equal(f.context.liveSources, 1);
        assert.equal(f.events.count + f.document.count, 7);
    }
    assert.equal(f.requests.length, 2);
    assert.equal(f.context.decodeCalls, 2);
    f.controller.dispose();
    f.controller.dispose();
    assert.equal(f.events.count + f.document.count, 0);
    assert.equal(f.context.liveSources, 0);
    assert.equal(f.context.closeCalls, 1);
    f.controller.setMenuAmbience(true, false);
    f.events.emit('click');
    await settleFade();
    assert.equal(f.context.closeCalls, 1);
    assert.equal(f.context.state, 'closed');
});

test('a pending fetch cannot start playback after leaving the menu, but its buffer is reusable', async t => {
    const f = fixture(), pending = deferred<Response>();
    t.after(() => f.controller.dispose());
    f.setFetch(() => pending.promise);
    f.controller.setMenuAmbience(true, false);
    f.events.emit('pointerdown');
    await flush();
    f.controller.setMenuAmbience(false, false);
    pending.resolve(response());
    await flush();
    assert.equal(f.context.sources.length, 0);
    f.controller.setMenuAmbience(true, false);
    await flush();
    assert.equal(f.requests.length, 2);
    assert.equal(f.context.decodeCalls, 2);
    assert.equal(f.context.liveSources, 1);
});

test('muting during decode prevents a stale start, including an off/on race', async t => {
    const f = fixture(), pending = deferred<AudioBuffer>();
    t.after(() => f.controller.dispose());
    f.context.decodeGate = pending.promise;
    f.controller.setMenuAmbience(true, false);
    f.events.emit('pointerdown');
    await flush();
    f.controller.setMenuAmbience(true, true);
    f.controller.setMenuAmbience(true, false);
    f.controller.setMenuAmbience(true, true);
    pending.resolve(f.context.decoded);
    await flush();
    assert.equal(f.context.sources.length, 0);
    f.controller.setMenuAmbience(true, false);
    await flush();
    assert.equal(f.context.liveSources, 1);
    assert.equal(f.requests.length, 2);
    assert.equal(f.context.decodeCalls, 2);
});

test('disposing aborts a pending fetch and removes every listener without a late decode', async () => {
    const f = fixture(), pending = deferred<Response>();
    f.setFetch(() => pending.promise);
    f.controller.setMenuAmbience(true, false);
    f.events.emit('pointerdown');
    await flush();
    f.controller.dispose();
    assert.equal(f.requests[0].signal?.aborted, true);
    assert.equal(f.requests[1].signal?.aborted, true);
    assert.equal(f.events.count + f.document.count, 0);
    pending.resolve(response());
    await flush();
    assert.equal(f.context.decodeCalls, 0);
    assert.equal(f.context.sources.length, 0);
    assert.equal(f.context.closeCalls, 1);
});

test('disposing during decode cannot reconnect a source to the closed context', async () => {
    const f = fixture(), pending = deferred<AudioBuffer>();
    f.context.decodeGate = pending.promise;
    f.controller.setMenuAmbience(true, false);
    f.events.emit('pointerdown');
    await flush();
    f.controller.dispose();
    pending.resolve(f.context.decoded);
    await flush();
    assert.equal(f.context.sources.length, 0);
    assert.equal(f.context.state, 'closed');
});

test('autoplay denial is silent and can retry on a later trusted gesture', async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    f.context.denyResume = true;
    f.controller.setMenuAmbience(true, false);
    f.events.emit('pointerdown');
    await flush();
    assert.equal(f.requests.length, 0);
    assert.equal(f.context.sources.length, 0);
    f.context.denyResume = false;
    f.events.emit('keydown');
    await flush();
    assert.equal(f.context.liveSources, 1);
});

test('a touchend can unlock even when an earlier pointerdown resume is still pending', async t => {
    const f = fixture(), firstResume = deferred<void>();
    t.after(() => f.controller.dispose());
    f.context.nextResumeGates.push(firstResume.promise);
    f.controller.setMenuAmbience(true, false);
    f.events.emit('pointerdown');
    await flush();
    assert.equal(f.requests.length, 0);
    f.events.emit('touchend');
    await flush();
    assert.equal(f.context.liveSources, 1);
    firstResume.resolve();
    await flush();
    assert.equal(f.context.liveSources, 1);
    assert.equal(f.requests.length, 2);
    assert.equal(f.context.sources.length, 1, 'pending resume did not duplicate the welcome');
    assert.equal(f.context.sources[0].loopStart, 6);
});

test('a source start failure disconnects its nodes and permits a later retry', async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    f.context.failStart = true;
    f.controller.setMenuAmbience(true, false);
    f.events.emit('click');
    await flush();
    assert.equal(f.context.sources[0].connected, false);
    assert.equal(f.context.gains[0].disconnected, true);
    f.context.failStart = false;
    f.events.emit('click');
    await flush();
    assert.equal(f.context.liveSources, 1);
    assert.equal(f.requests.length, 2);
    assert.equal(f.context.sources[1].loopStart, 6, 'failed start did not consume the welcome');
});

test('failed asset loading does not spin and can retry without duplicate fetches', async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    f.setFetch(async () => response(false));
    f.controller.setMenuAmbience(true, false);
    f.events.emit('pointerdown');
    await flush();
    assert.equal(f.requests.length, 2);
    assert.equal(f.context.sources.length, 0);
    await flush();
    assert.equal(f.requests.length, 2);
    f.setFetch(async () => response());
    f.events.emit('click');
    f.events.emit('keydown');
    await flush();
    assert.equal(f.requests.length, 4);
    assert.equal(f.context.liveSources, 1);
});

test('a resume settling after hide cannot leave a running background context', async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    f.controller.setMenuAmbience(true, false);
    f.events.emit('pointerdown');
    await flush();
    f.document.visibilityState = 'hidden';
    f.document.emit('visibilitychange');
    const pending = deferred<void>();
    f.context.resumeGate = pending.promise;
    f.document.visibilityState = 'visible';
    f.document.emit('visibilitychange');
    f.document.visibilityState = 'hidden';
    f.document.emit('visibilitychange');
    pending.resolve();
    await flush();
    assert.equal(f.context.liveSources, 0);
    assert.equal(f.context.state, 'suspended');
});

for (const interruption of ['mute', 'navigation', 'hide'] as const) {
    test(`the welcome is skipped, never restarted, after ${interruption} during its first phrase`, async t => {
        const f = fixture();
        t.after(() => f.controller.dispose());
        f.controller.setMenuAmbience(true, false);
        f.events.emit('click');
        await flush();
        assert.equal(f.context.sources[0].loopStart, 6);
        f.context.currentTime = 1;
        if (interruption === 'mute') f.controller.setMenuAmbience(true, true);
        if (interruption === 'navigation') f.controller.setMenuAmbience(false, false);
        if (interruption === 'hide') {
            f.document.visibilityState = 'hidden';
            f.document.emit('visibilitychange');
        }
        await settleFade();
        f.document.visibilityState = 'visible';
        f.controller.setMenuAmbience(true, false);
        f.document.emit('visibilitychange');
        await flush();
        assert.equal(f.context.liveSources, 1);
        const returned = f.context.sources.at(-1)!;
        assert.equal(returned.buffer, f.context.decoded);
        assert.equal(returned.loopStart, 0);
        assert.equal(returned.loopEnd, 1.6);
        assert.equal(returned.starts[0].offset, 0);
        f.events.emit('click');
        f.events.emit('keydown');
        await flush();
        assert.equal(f.context.sources.filter(source => source.loopStart === 6 && source.starts.length).length, 1);
        assert.equal(f.requests.length, 2);
    });
}

test('native loop bounds exclude the welcome for every repeat and music resumes at its own offset', async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    f.controller.setMenuAmbience(true, false);
    f.events.emit('click');
    await flush();
    const first = f.context.sources[0];
    for (const seconds of [6, 7.6, 9.2, 10.8, 27]) {
        f.context.currentTime = seconds;
        f.events.emit('keydown');
    }
    assert.equal(f.context.sources.length, 1);
    assert.equal(first.loopStart, 6);
    assert.ok(Math.abs(first.loopEnd - first.loopStart - 1.6) < 1e-12);
    f.controller.setMenuAmbience(true, true);
    await settleFade();
    f.controller.setMenuAmbience(true, false);
    await flush();
    assert.equal(f.context.sources.at(-1)!.buffer, f.context.decoded);
    assert.ok(Math.abs(f.context.sources.at(-1)!.starts[0].offset - ((27 - 6) % 1.6)) < 1e-8);
});

test('welcome consumption survives controller disposal, but not a new Document', async t => {
    const f = fixture();
    f.controller.setMenuAmbience(true, false);
    f.events.emit('click');
    await flush();
    f.controller.dispose();
    const nextContext = new ContextStub();
    const remounted = createMenuAmbience({ ...f.environment, createContext: () => nextContext as unknown as AudioContext });
    t.after(() => remounted.dispose());
    remounted.setMenuAmbience(true, false);
    f.events.emit('click');
    await flush();
    assert.equal(nextContext.liveSources, 1);
    assert.equal(nextContext.sources[0].loopStart, 0);
    assert.equal(nextContext.sources[0].buffer?.duration, 1.6);
    assert.equal(f.requests.length, 3, 'remount fetches music only, never the consumed intro');
    const fresh = fixture();
    t.after(() => fresh.controller.dispose());
    fresh.controller.setMenuAmbience(true, false);
    fresh.events.emit('click');
    await flush();
    assert.equal(fresh.context.sources[0].loopStart, 6);
});

test('disposing before an awaited decode does not consume the document welcome', async t => {
    const f = fixture(), pending = deferred<AudioBuffer>();
    f.context.decodeGate = pending.promise;
    f.controller.setMenuAmbience(true, false);
    f.events.emit('click');
    await flush();
    f.controller.dispose();
    pending.resolve(f.context.decoded);
    await flush();
    const nextContext = new ContextStub();
    const remounted = createMenuAmbience({ ...f.environment, createContext: () => nextContext as unknown as AudioContext });
    t.after(() => remounted.dispose());
    remounted.setMenuAmbience(true, false);
    f.events.emit('click');
    await flush();
    assert.equal(nextContext.sources[0].loopStart, 6);
});

function readAudioBuffer(path: string): AudioBuffer {
    const wav = fs.readFileSync(new URL(path, import.meta.url));
    const channels = wav.readUInt16LE(22), rate = wav.readUInt32LE(24);
    const frames = (wav.length - 44) / (channels * 2);
    const buffer = audioBuffer(channels, frames, rate);
    for (let channel = 0; channel < channels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < frames; i++) data[i] = wav.readInt16LE(44 + (i * channels + channel) * 2) / 32768;
    }
    return buffer;
}

test('the actual composite has no gap or clipped mix and repeats only PCM from the checked tail WAV', async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    f.context.decoded = readAudioBuffer('../../public/audio/royal-menu-loop.wav');
    f.context.introDecoded = readAudioBuffer('../../public/audio/royal-menu-intro.wav');
    f.controller.setMenuAmbience(true, false);
    f.events.emit('click');
    await flush();
    const source = f.context.sources[0], combined = source.buffer!;
    const introFrames = f.context.introDecoded.length;
    for (let channel = 0; channel < 2; channel++) {
        const data = combined.getChannelData(channel), music = f.context.decoded.getChannelData(channel);
        assert.deepEqual(data.subarray(introFrames), music, 'all repeated PCM is exactly the independently checked music WAV');
        assert.equal(data[introFrames - 1], music[music.length - 1]);
        let peak = 0;
        for (const sample of data) peak = Math.max(peak, Math.abs(sample));
        assert.ok(peak < 0.25, `composite channel ${channel} has ample headroom`);
    }
    assert.equal(source.loopStart, 6);
    assert.equal(source.loopEnd, 7.6);
});

test('the trusted click which unmutes App can arm the welcome before its resume microtask finishes', async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    f.controller.setMenuAmbience(true, true);
    f.events.emit('click');
    f.controller.setMenuAmbience(true, false);
    await flush();
    assert.equal(f.context.sources[0].loopStart, 6);
    assert.equal(f.context.liveSources, 1);
});

test('the PCM crossfade preserves stereo, the middle, and a contiguous periodic seam', () => {
    const channels = 2, frames = 10000, overlap = 1000, gain = 0.7;
    const original = Float32Array.from({ length: frames * channels }, (_, i) =>
        (Math.floor(i / channels) / frames - 0.5) * (i % channels ? -0.25 : 0.5));
    const loop = createPeriodicLoop(original, channels, overlap, gain);
    assert.equal(loop.length, (frames - overlap) * channels);
    for (let i = 0; i < (frames - 2 * overlap) * channels; i++) {
        assert.ok(Math.abs(loop[i] - original[i + overlap * channels] * gain) < 1e-7);
    }
    const seamFrame = frames - 2 * overlap;
    for (let channel = 0; channel < channels; channel++) {
        assert.ok(Math.abs(loop[seamFrame * channels + channel] - original[(frames - overlap) * channels + channel] * gain) < 1e-7);
        assert.ok(Math.abs(loop[loop.length - channels + channel] - original[(overlap - 1) * channels + channel] * gain) < 1e-7);
        assert.ok(Math.abs(loop[channel] - loop[loop.length - channels + channel]) < 1e-4);
    }
    const wav = encodeWav(loop, 48000, channels);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(40), loop.length * 2);
    assert.throws(() => createPeriodicLoop(original, 0, overlap, gain));
    assert.throws(() => createPeriodicLoop(original, channels, frames, gain));
    assert.throws(() => createPeriodicLoop(original, channels, overlap, 2));
    assert.throws(() => encodeWav(new Float32Array([1]), 48000, 1), /Clipping/);
    assert.throws(() => encodeWav(new Float32Array([Number.NaN]), 48000, 1), /non-finite/);
});

test('the delivered WAV independently matches the source transform and the QA hashes/metrics', () => {
    const source = new URL('../../asset-workbench/royal-menu-v4/reference/animation.mp4', import.meta.url);
    const wav = fs.readFileSync(new URL('../../public/audio/royal-menu-loop.wav', import.meta.url));
    const report = JSON.parse(fs.readFileSync(new URL('../../asset-workbench/royal-menu-v4/audio-qa.json', import.meta.url), 'utf8'));
    const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
    assert.equal(hash(wav), report.output.sha256);
    assert.equal(hash(fs.readFileSync(source)), report.source.sha256);
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', source.pathname, '-map', '0:a:0', '-t', '8',
        '-ar', '48000', '-ac', '2', '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1'], { maxBuffer: 8 * 1024 * 1024 });
    const original = new Float32Array(raw.length / 4);
    for (let i = 0; i < original.length; i++) original[i] = raw.readFloatLE(i * 4);
    const intro = fs.readFileSync(new URL('../../public/audio/royal-menu-intro.wav', import.meta.url));
    assert.equal(hash(intro), report.intro.sha256);
    assert.deepEqual(intro, encodeWav(createMenuIntro(original), 48000, 2));
    assert.equal(intro.length, 44 + 288000 * 2 * 2);
    assert.equal(intro.readInt16LE(intro.length - 2), 0);
    const music = original.slice(MENU_AUDIO_REGIONS.musicStartSeconds * 48000 * 2, MENU_AUDIO_REGIONS.musicEndSeconds * 48000 * 2);
    assert.deepEqual(wav, encodeWav(createPeriodicLoop(music, 2, 19200, 10 ** (-3 / 20)), 48000, 2));
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 2);
    assert.equal(wav.readUInt32LE(24), 48000);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.length, 44 + 76800 * 2 * 2);
    const decoded = new Float32Array((wav.length - 44) / 2);
    for (let i = 0; i < decoded.length; i++) decoded[i] = wav.readInt16LE(44 + i * 2) / 32768;
    const metrics = analyzePcm(decoded, 48000, 2);
    assert.equal(metrics.durationSeconds, 1.6);
    assert.ok(metrics.longestSilentRunSeconds < 0.001);
    for (const [index, channel] of metrics.perChannel.entries()) {
        assert.equal(channel.clippedSamples, 0);
        assert.ok(channel.peak < 0.25);
        assert.ok(channel.seam.absoluteStep < channel.adjacentStepP999);
        const naturalStep = Math.abs(music[19200 * 2 + index] - music[(19200 - 1) * 2 + index]) * 10 ** (-3 / 20);
        assert.ok(Math.abs(channel.seam.absoluteStep - naturalStep) < 2 / 32768, 'periodic seam is an ordinary contiguous source step');
        assert.ok(Math.abs(channel.seam.levelChangeDb ?? 100) < 4);
        assert.deepEqual(channel, report.output.perChannel[index]);
    }
    assert.ok(Object.values(report.checks).every(Boolean));
    assert.ok(report.oversampledPeak.amplitude < 0.25);
    assert.equal(report.processing.runtimeGain, MENU_AMBIENCE_GAIN);
    assert.equal(report.humanListening.performed, false);
    const speech = JSON.parse(fs.readFileSync(new URL('../../asset-workbench/royal-menu-v4/audio-speech-verification.json', import.meta.url), 'utf8'));
    assert.equal(speech.source.sha256, report.source.sha256);
    assert.equal(speech.intro.sha256, report.intro.sha256);
    assert.equal(speech.loop.sha256, report.output.sha256);
    assert.ok(Object.values(speech.checks).every(Boolean));
    assert.ok(speech.detectedLastWordEndSeconds <= 5.8);
    assert.deepEqual(speech.musicSourceRecognition.words, []);
    assert.deepEqual(speech.fiveLoopRecognition.words, []);
    assert.equal(speech.vocalSeparationPerformed, false);
    assert.equal(speech.humanListeningPerformed, false);
});
