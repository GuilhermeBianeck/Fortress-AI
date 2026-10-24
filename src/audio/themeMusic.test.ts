/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createThemeMusic, THEME_TRACKS } from './themeMusic';
import type { MusicEnvironment } from './themeMusic';

class Events {
    visibilityState = 'visible';
    listeners = new Map<string, Set<(event: Event) => void>>();
    addEventListener(name: string, fn: (event: Event) => void) {
        const set = this.listeners.get(name) ?? new Set(); set.add(fn); this.listeners.set(name, set);
    }
    removeEventListener(name: string, fn: (event: Event) => void) { this.listeners.get(name)?.delete(fn); }
    emit(name: string, trusted = true) { for (const fn of this.listeners.get(name) ?? []) fn({ isTrusted: trusted } as Event); }
}
class Gain {
    gain = { value: 1, events: [] as number[], cancelScheduledValues() {}, setValueAtTime(value: number) { this.value = value; this.events.push(value); }, linearRampToValueAtTime(value: number) { this.value = value; this.events.push(value); } };
    disconnected = false;
    connect(target: unknown) { return target; }
    disconnect() { this.disconnected = true; }
}
class Media extends Events {
    src = ''; preload = ''; dataset = {}; currentTime = 0; duration = 177; paused = true; ended = false;
    plays = 0; loads = 0; deny = false; gate: Promise<void> | null = null;
    setAttribute() {}
    removeAttribute() { this.src = ''; }
    load() { this.loads++; }
    pause() { this.paused = true; }
    async play() { this.plays++; if (this.deny) throw new Error('NotAllowedError'); await this.gate; this.paused = false; }
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
    const win = new Events(), doc = new Events(), media: Media[] = [], gains: Gain[] = [];
    let tick = () => {}, impact = () => {}, intervals = 0;
    const context = {
        currentTime: 0, state: 'running', destination: {},
        async resume() { this.state = 'running'; }, async suspend() { this.state = 'suspended'; },
        createGain() { const gain = new Gain(); gains.push(gain); return gain; },
        createMediaElementSource() { return new Gain(); },
    };
    const music = createThemeMusic({
        window: win, document: doc, context: () => context, createAudio: () => { const m = new Media(); media.push(m); return m; },
        interval: (fn: () => void) => { tick = fn; return ++intervals; }, clearInterval: () => { intervals--; },
        subscribeImpact: (fn: () => void) => { impact = fn; return () => { impact = () => {}; }; },
    } as unknown as MusicEnvironment);
    music.setState(false, false);
    return { music, win, doc, media, gains, context, tick: () => tick(), impact: () => impact(), intervals: () => intervals,
        async start() { win.emit('pointerdown'); await flush(); } };
}

test('theme music is lazy and requires a trusted gesture', async () => {
    const f = fixture(); assert.equal(f.media.length, 0);
    f.win.emit('pointerdown', false); assert.equal(f.media.length, 0);
    await f.start(); assert.equal(f.media.length, 2);
    assert.equal(f.media[0].src, THEME_TRACKS[0].url); assert.equal(f.media[1].src, '');
    assert.equal(f.media[0].paused, false); assert.equal(f.intervals(), 1);
    await f.start(); assert.equal(f.media[0].plays, 1); f.music.dispose();
});
test('phase changes lower the score without restarting playback; impacts recover music gain', async () => {
    const f = fixture(); await f.start(); f.media[0].currentTime = 44;
    f.music.setState(true, false); assert.equal(f.gains[0].gain.value, 0.24);
    assert.equal(f.media[0].currentTime, 44); assert.equal(f.media[0].plays, 1);
    f.impact(); assert.ok(f.gains[1].gain.events.includes(0.38)); assert.equal(f.gains[1].gain.value, 1);
    f.music.setState(false, false); assert.equal(f.gains[0].gain.value, 0.42); f.music.dispose();
});
test('both complete songs alternate with bounded equal-power crossfades', async () => {
    const f = fixture(); await f.start();
    f.media[0].currentTime = 165; f.tick(); assert.equal(f.media[1].src, THEME_TRACKS[1].url);
    assert.equal(f.media[1].plays, 0);
    f.media[0].currentTime = 173.1; f.tick(); await flush();
    f.media[0].currentTime = THEME_TRACKS[0].end - 2; f.tick();
    assert.ok(Math.abs(f.gains[2].gain.value - THEME_TRACKS[0].gain / Math.sqrt(2)) < 0.001);
    assert.ok(Math.abs(f.gains[3].gain.value - THEME_TRACKS[1].gain / Math.sqrt(2)) < 0.001);
    f.media[0].ended = true; f.media[0].emit('ended');
    assert.equal(f.media[0].paused, true); assert.equal(f.media[0].currentTime, 0);
    f.media[0].ended = false;
    f.media[1].currentTime = 174; f.tick(); await flush();
    f.media[1].ended = true; f.media[1].emit('ended');
    assert.equal(f.media[0].paused, false); assert.equal(f.media[0].plays, 2); f.music.dispose();
});
test('mute, page hiding and restoration preserve position and clear polling', async () => {
    const f = fixture(); await f.start(); f.media[0].currentTime = 38;
    f.music.setState(false, true); assert.equal(f.media[0].paused, true); assert.equal(f.intervals(), 0);
    f.music.setState(false, false); await flush(); assert.equal(f.media[0].currentTime, 38);
    f.doc.visibilityState = 'hidden'; f.doc.emit('visibilitychange'); assert.equal(f.media[0].paused, true);
    f.doc.visibilityState = 'visible'; f.doc.emit('visibilitychange'); await flush(); assert.equal(f.media[0].paused, false);
    f.win.emit('pagehide'); assert.equal(f.media[0].paused, true);
    f.win.emit('pageshow'); await flush(); assert.equal(f.media[0].currentTime, 38); f.music.dispose();
});
test('autoplay rejection does not cause timer retry storms and another gesture can retry', async () => {
    const f = fixture(); await f.start(); f.media[1].deny = true;
    f.media[0].currentTime = THEME_TRACKS[0].end - 1; f.tick(); await flush();
    for (let i = 0; i < 10; i++) f.tick(); await flush(); assert.equal(f.media[1].plays, 1);
    f.media[1].deny = false; await f.start(); f.tick(); await flush(); assert.equal(f.media[1].plays, 2); f.music.dispose();
});
test('late play promises cannot resurrect music after mute or disposal', async () => {
    const f = fixture(); await f.start(); f.music.setState(false, true);
    let resolve!: () => void; f.media[0].gate = new Promise<void>(yes => { resolve = yes; });
    f.music.setState(false, false); f.music.dispose(); resolve(); await flush();
    assert.equal(f.media[0].paused, true); assert.equal(f.intervals(), 0);
    assert.ok(f.gains.every(gain => gain.disconnected));
    assert.ok([...f.win.listeners.values()].every(set => set.size === 0));
});
test('missing next song loops the healthy track and both missing tracks stop cleanly', async () => {
    const f = fixture(); await f.start(); f.media[1].emit('error');
    f.media[0].ended = true; f.media[0].emit('ended'); await flush(); assert.equal(f.media[0].plays, 2);
    f.media[0].emit('error'); assert.equal(f.intervals(), 0); f.music.dispose();
});
test('a failed incoming crossfade restores the current song rather than stopping it', async () => {
    const f = fixture(); await f.start(); f.media[0].currentTime = THEME_TRACKS[0].end - 2;
    f.tick(); await flush(); f.tick(); f.media[1].emit('error');
    assert.equal(f.media[0].paused, false); assert.equal(f.gains[2].gain.value, THEME_TRACKS[0].gain); f.music.dispose();
});
test('silent export tails never delay the next theme', async () => {
    const f = fixture(); await f.start(); f.media[0].currentTime = THEME_TRACKS[0].end - 3;
    f.tick(); await flush();
    f.media[0].currentTime = THEME_TRACKS[0].end + 0.01; f.tick();
    assert.equal(f.media[0].paused, true); assert.equal(f.media[1].paused, false); f.music.dispose();
});
test('late context resume is suspended again when the page has hidden', async () => {
    const f = fixture(); await f.start();
    let resolve!: () => void;
    f.context.resume = async () => { await new Promise<void>(yes => { resolve = yes; }); f.context.state = 'running'; };
    f.win.emit('pointerdown'); f.win.emit('pagehide'); resolve(); await flush();
    assert.equal(f.context.state, 'suspended'); assert.equal(f.media[0].paused, true); f.music.dispose();
});
