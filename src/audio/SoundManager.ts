/**
 * Procedural sound manager using Web Audio API.
 * All sounds are synthesized — zero external audio files.
 * Respects user mute preference (persisted to localStorage).
 */

let ctx: AudioContext | null = null;
let _muted = localStorage.getItem('fortress_muted') === '1';

function getCtx(): AudioContext | null {
    if (_muted) return null;
    if (!ctx) {
        try { ctx = new AudioContext(); } catch { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}

export function isMuted(): boolean { return _muted; }

export function toggleMute(): boolean {
    _muted = !_muted;
    localStorage.setItem('fortress_muted', _muted ? '1' : '0');
    if (_muted && ctx) { ctx.close(); ctx = null; }
    return _muted;
}

/** Short sine blip — UI click */
export function playClick() {
    const c = getCtx(); if (!c) return;
    const osc = c.createOscillator();
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
    const osc = c.createOscillator();
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
    const osc = c.createOscillator();
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
    // Low sine boom
    const osc = c.createOscillator();
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
    const noise = c.createBufferSource();
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
    const osc = c.createOscillator();
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
    const bufSize = c.sampleRate * 0.25;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
    }
    const noise = c.createBufferSource();
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
    const osc = c.createOscillator();
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
