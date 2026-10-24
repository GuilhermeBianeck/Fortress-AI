/**
 * Procedural sound manager using Web Audio API.
 * Effects are synthesized; the shared context also carries streamed theme music.
 * Respects user mute preference (persisted to localStorage).
 */

let ctx: AudioContext | null = null;
let _muted = false;
try { _muted = localStorage.getItem('fortress_muted') === '1'; } catch { /* Storage can be unavailable in private browsing. */ }
const combatListeners = new Set<() => void>();
const activeEffects = new Set<AudioScheduledSourceNode>();
function tracked<T extends AudioScheduledSourceNode>(source: T): T {
    activeEffects.add(source);
    source.onended = () => { activeEffects.delete(source); };
    return source;
}
export function stopSoundEffects() {
    for (const source of activeEffects) {
        try { source.stop(); } catch { /* A scheduled effect may already have ended. */ }
    }
    activeEffects.clear();
}
export function subscribeCombatSound(listener: () => void) {
    combatListeners.add(listener);
    return () => { combatListeners.delete(listener); };
}
function combatSound() { for (const listener of combatListeners) listener(); }

export function getAudioContext(): AudioContext | null {
    if (_muted) return null;
    if (!ctx) {
        try { ctx = new AudioContext(); } catch { return null; }
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
}
function getCtx() { return typeof document !== 'undefined' && document.visibilityState === 'hidden' ? null : getAudioContext(); }

export function isMuted(): boolean { return _muted; }

export function toggleMute(): boolean {
    _muted = !_muted;
    try { localStorage.setItem('fortress_muted', _muted ? '1' : '0'); } catch { /* Keep session controls usable without storage. */ }
    if (_muted) {
        stopSoundEffects();
        if (ctx) void ctx.suspend().catch(() => {});
    }
    return _muted;
}

/** Short sine blip — UI click */
export function playClick() {
    const c = getCtx(); if (!c) return;
    const osc = tracked(c.createOscillator());
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.08, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.06);
}

/** Subtle high tick — UI hover */
export function playHover() {
    const c = getCtx(); if (!c) return;
    const osc = tracked(c.createOscillator());
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1800;
    gain.gain.setValueAtTime(0.03, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.025);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.03);
}

/** Dual tone switch — mode toggle */
export function playSwitch() {
    const c = getCtx(); if (!c) return;
    const osc = tracked(c.createOscillator());
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.08);
    gain.gain.setValueAtTime(0.07, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.12);
}

/** Dramatic low boom — battle button press */
export function playBoom() {
    const c = getCtx(); if (!c) return;
    combatSound();
    // Low sine boom
    const osc = tracked(c.createOscillator());
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.4);

    // Noise burst for impact texture
    const bufSize = c.sampleRate * 0.15;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    }
    const noise = tracked(c.createBufferSource());
    noise.buffer = buf;
    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.08, c.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
    // Low-pass to make it a rumble, not hiss
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    noise.connect(filter).connect(noiseGain).connect(c.destination);
    noise.start();
    noise.stop(c.currentTime + 0.2);
}

/** Cannon fire whoosh */
export function playFire() {
    const c = getCtx(); if (!c) return;
    combatSound();
    const osc = tracked(c.createOscillator());
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.15);
    gain.gain.setValueAtTime(0.1, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    osc.connect(filter).connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.2);
}

/** Explosion crunch — block destruction */
export function playExplosion() {
    const c = getCtx(); if (!c) return;
    combatSound();
    const bufSize = c.sampleRate * 0.25;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
    }
    const noise = tracked(c.createBufferSource());
    noise.buffer = buf;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.12, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, c.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, c.currentTime + 0.2);
    noise.connect(filter).connect(gain).connect(c.destination);
    noise.start();
    noise.stop(c.currentTime + 0.25);
}

/** Impact hit — projectile lands */
export function playImpact() {
    const c = getCtx(); if (!c) return;
    combatSound();
    const osc = tracked(c.createOscillator());
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, c.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.15);
}
