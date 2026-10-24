import { getAudioContext, stopSoundEffects, subscribeCombatSound } from './SoundManager';

// Gain-match to -18 LUFS without modifying either original music master.
export const THEME_TRACKS = [
    { url: '/audio/fortress-theme-1.mp3', gain: 10 ** ((-18 + 14.47) / 20), end: 174.84 },
    { url: '/audio/fortress-theme-2.mp3', gain: 10 ** ((-18 + 15.84) / 20), end: 176.51 },
] as const;
const FADE_SECONDS = 4;

export interface MusicEnvironment {
    window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
    document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
    context: () => AudioContext | null;
    createAudio: () => HTMLAudioElement;
    subscribeImpact: (callback: () => void) => () => void;
    interval: (callback: () => void) => number;
    clearInterval: (id: number) => void;
}

type Deck = { media: HTMLAudioElement; gain: GainNode; source: MediaElementAudioSourceNode; failed: boolean; pending: boolean; blocked: boolean };

export function createThemeMusic(env: MusicEnvironment) {
    let muted = true, inGame = false, unlocked = false, disposed = false, pageHidden = false;
    let context: AudioContext | null = null, master: GainNode | null = null, duck: GainNode | null = null;
    let decks: Deck[] = [], active = 0, fading: number | null = null;
    let timer: number | null = null;
    const allowed = () => !disposed && unlocked && !muted && !pageHidden && env.document.visibilityState !== 'hidden';
    function ramp(node: GainNode, value: number, seconds = 0.25) {
        const now = context!.currentTime;
        node.gain.cancelScheduledValues(now);
        node.gain.setValueAtTime(node.gain.value, now);
        node.gain.linearRampToValueAtTime(value, now + seconds);
    }
    function balance() { if (master) ramp(master, inGame ? 0.24 : 0.42, 0.7); }
    function stop() {
        if (timer !== null) env.clearInterval(timer);
        timer = null;
        stopSoundEffects();
        for (const deck of decks) deck.media.pause();
        if (context?.state === 'running') void context.suspend().catch(() => {});
    }
    function initialize() {
        if (context || disposed) return;
        context = env.context();
        if (!context) return;
        master = context.createGain();
        duck = context.createGain();
        master.gain.value = inGame ? 0.24 : 0.42;
        master.connect(duck).connect(context.destination);
        decks = THEME_TRACKS.map((track, index) => {
            const media = env.createAudio();
            media.preload = 'none';
            media.setAttribute('playsinline', '');
            media.dataset.fortressTheme = String(index + 1);
            const source = context!.createMediaElementSource(media);
            const gain = context!.createGain();
            gain.gain.value = index === active ? track.gain : 0;
            source.connect(gain).connect(master!);
            const deck = { media, gain, source, failed: false, pending: false, blocked: false };
            media.addEventListener('ended', tick);
            media.addEventListener('error', () => {
                deck.failed = true;
                deck.pending = false;
                if (disposed) return;
                if (index === active) advanceAfterFailure();
                else if (index === fading) {
                    fading = null;
                    ramp(decks[active].gain, THEME_TRACKS[active].gain);
                }
            });
            return deck;
        });
    }
    function load(index: number) {
        const media = decks[index].media;
        if (!media.src) { media.src = THEME_TRACKS[index].url; media.load(); }
    }
    function play(index: number, onStarted?: () => void) {
        const deck = decks[index];
        if (!allowed() || deck.failed || deck.pending || deck.blocked) return;
        load(index);
        deck.pending = true;
        void deck.media.play().then(() => {
            deck.pending = false;
            if (!allowed()) { deck.media.pause(); return; }
            onStarted?.();
        }).catch(() => {
            deck.pending = false;
            deck.blocked = true;
            // Autoplay denial is retried only by another trusted gesture, never in a timer loop.
        });
    }
    function advanceAfterFailure() {
        if (disposed) return;
        const next = 1 - active;
        if (!decks[next]?.failed) {
            decks[active]?.media.pause();
            active = next;
            fading = null;
            ramp(decks[active].gain, THEME_TRACKS[active].gain);
            play(active);
        } else stop();
    }
    function finishTransition(next: number) {
        decks[active].media.pause();
        decks[active].media.currentTime = 0;
        ramp(decks[active].gain, 0, 0.02);
        active = next;
        fading = null;
        ramp(decks[active].gain, THEME_TRACKS[active].gain, 0.02);
    }
    function tick() {
        if (!allowed() || !decks.length) return;
        const current = decks[active];
        // Skip the measured near-silent export tails, not the musical endings.
        const remaining = Math.min(current.media.duration, THEME_TRACKS[active].end) - current.media.currentTime;
        const next = 1 - active;
        if (!Number.isFinite(remaining)) return;
        if (remaining < 14 && !decks[next].failed) load(next);
        if (fading !== null) {
            if (current.media.ended || remaining <= 0) finishTransition(fading);
            else {
                const progress = Math.max(0, Math.min(1, 1 - remaining / FADE_SECONDS));
                ramp(current.gain, THEME_TRACKS[active].gain * Math.cos(progress * Math.PI / 2), 0.2);
                ramp(decks[fading].gain, THEME_TRACKS[fading].gain * Math.sin(progress * Math.PI / 2), 0.2);
            }
        } else if ((current.media.ended || remaining <= 0) && (decks[next].failed || decks[next].blocked)) {
            current.media.currentTime = 0;
            play(active);
        } else if (remaining <= FADE_SECONDS && !decks[next].failed && !decks[next].pending) {
            play(next, () => {
                if (fading !== null || active === next) return;
                fading = next;
                if (decks[active].media.ended || remaining <= 0) finishTransition(next);
            });
        }
    }
    function resume() {
        if (!allowed()) { stop(); return; }
        initialize();
        if (!context || decks.every(deck => deck.failed)) return;
        const resumed = context;
        void resumed.resume().then(() => {
            if (!allowed() && resumed.state === 'running') void resumed.suspend().catch(() => {});
        }).catch(() => {});
        if (decks[active].media.paused) play(active);
        if (fading !== null && decks[fading].media.paused) play(fading);
        if (timer === null) timer = env.interval(tick);
    }
    function gesture(event: Event) {
        if (!event.isTrusted) return;
        unlocked = true;
        for (const deck of decks) deck.blocked = false;
        resume();
        tick();
    }
    function visibility() { resume(); }
    function hide() { pageHidden = true; stop(); }
    function show() { pageHidden = false; resume(); }
    const unsubscribe = env.subscribeImpact(() => {
        if (!duck || !allowed()) return;
        const now = context!.currentTime;
        duck.gain.cancelScheduledValues(now);
        duck.gain.setValueAtTime(duck.gain.value, now);
        duck.gain.linearRampToValueAtTime(0.38, now + 0.025);
        duck.gain.setValueAtTime(0.38, now + 0.22);
        duck.gain.linearRampToValueAtTime(1, now + 0.85);
    });
    for (const event of ['pointerdown', 'keydown', 'touchend']) env.window.addEventListener(event, gesture, { passive: true });
    env.window.addEventListener('pagehide', hide);
    env.window.addEventListener('pageshow', show);
    env.document.addEventListener('visibilitychange', visibility);
    return {
        setState(game: boolean, silent: boolean) {
            inGame = game;
            muted = silent;
            balance();
            resume();
        },
        dispose() {
            disposed = true;
            stop();
            unsubscribe();
            for (const event of ['pointerdown', 'keydown', 'touchend']) env.window.removeEventListener(event, gesture);
            env.window.removeEventListener('pagehide', hide);
            env.window.removeEventListener('pageshow', show);
            env.document.removeEventListener('visibilitychange', visibility);
            for (const deck of decks) {
                deck.media.removeEventListener('ended', tick);
                deck.media.removeAttribute('src');
                deck.media.load();
                deck.source.disconnect();
                deck.gain.disconnect();
            }
            master?.disconnect();
            duck?.disconnect();
            decks = [];
        },
    };
}

let music: ReturnType<typeof createThemeMusic> | null = null;
export function setThemeMusic(inGame: boolean, muted: boolean) {
    music ??= createThemeMusic({
        window, document, context: getAudioContext, createAudio: () => new Audio(), subscribeImpact: subscribeCombatSound,
        interval: callback => window.setInterval(callback, 200), clearInterval: id => window.clearInterval(id),
    });
    music.setState(inGame, muted);
}
export function disposeThemeMusic() { music?.dispose(); music = null; }
if (import.meta.hot) import.meta.hot.dispose(disposeThemeMusic);
