export const MENU_AMBIENCE_URL = `${import.meta.env?.BASE_URL ?? '/'}audio/royal-menu-loop.wav?v=instrumental-2`;
export const MENU_INTRO_URL = `${import.meta.env?.BASE_URL ?? '/'}audio/royal-menu-intro.wav`;
export const MENU_AMBIENCE_GAIN = 0.6;
const FADE_IN_SECONDS = 0.35;
const FADE_OUT_SECONDS = 0.08;
const gestureEvents = ['pointerdown', 'touchend', 'keydown', 'click'] as const;
const INTRO_TRANSITION_SECONDS = 0.12;

type WelcomeState = { started: boolean; gesture: boolean };
// Same Document across React unmounts and BFCache restores; a real page load gets a new one.
const documentWelcomes: WeakMap<object, WelcomeState> = import.meta.hot?.data.menuWelcomes ?? new WeakMap();
if (import.meta.hot) import.meta.hot.data.menuWelcomes = documentWelcomes;

function welcomeFor(document?: object): WelcomeState {
    if (!document) return { started: false, gesture: false };
    let welcome = documentWelcomes.get(document);
    if (!welcome) {
        welcome = { started: false, gesture: false };
        documentWelcomes.set(document, welcome);
    }
    return welcome;
}

type Events = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface MenuAmbienceEnvironment {
    events: Events;
    document: Events & Pick<Document, 'visibilityState'>;
    createContext: () => AudioContext;
    fetch: typeof fetch;
}

export interface MenuAmbienceController {
    setMenuAmbience: (active: boolean, muted: boolean) => void;
    dispose: () => void;
}

function browserEnvironment(): MenuAmbienceEnvironment | undefined {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    return {
        events: window,
        document,
        createContext: () => {
            const Constructor = window.AudioContext
                ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Constructor) throw new Error('Web Audio unavailable');
            return new Constructor();
        },
        fetch: window.fetch.bind(window),
    };
}

/** One menu owner. App supplies its existing global mute state; no separate preference is stored. */
export function createMenuAmbience(environment = browserEnvironment()): MenuAmbienceController {
    let active = false, muted = true, disposed = false, unlocked = false, attached = false, pageHidden = false;
    let context: AudioContext | undefined;
    type Track = { url: string; buffer?: AudioBuffer; loading?: Promise<AudioBuffer>; request?: AbortController };
    const tracks: Record<'intro' | 'music', Track> = { intro: { url: MENU_INTRO_URL }, music: { url: MENU_AMBIENCE_URL } };
    const welcome = welcomeFor(environment?.document);
    let welcomeBuffer: AudioBuffer | undefined;
    let resuming: Promise<void> | undefined;
    let epoch = 0, starting: number | undefined, offset = 0;
    let suspendTimer: ReturnType<typeof setTimeout> | undefined;
    let voice: { source: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number; introSeconds: number; stopping: boolean } | undefined;

    const wanted = () => Boolean(environment && active && !muted && !disposed && !pageHidden
        && environment.document.visibilityState === 'visible');

    function clearSuspendTimer() {
        if (suspendTimer !== undefined) clearTimeout(suspendTimer);
        suspendTimer = undefined;
    }

    function disconnectVoice() {
        if (!voice) return;
        const previous = voice;
        voice = undefined;
        const music = tracks.music.buffer;
        if (music && context) {
            const elapsed = previous.offset + context.currentTime - previous.startedAt - previous.introSeconds;
            // An interrupted welcome is consumed, not restarted or resumed mid-phrase.
            offset = elapsed < 0 ? 0 : elapsed % music.duration;
        }
        previous.source.onended = null;
        previous.source.stop();
        previous.source.disconnect();
        previous.gain.disconnect();
    }

    function stop(immediate = false) {
        epoch++;
        clearSuspendTimer();
        const c = context;
        if (!c || c.state === 'closed') return;
        const seconds = immediate || c.state !== 'running' ? 0 : FADE_OUT_SECONDS;
        if (voice && !voice.stopping && seconds > 0) {
            voice.stopping = true;
            // Hold the current fade-in level before fading out, including rapid mute/route changes.
            const param = voice.gain.gain;
            const now = c.currentTime;
            const level = MENU_AMBIENCE_GAIN * Math.min(1, Math.max(0, (now - voice.startedAt) / FADE_IN_SECONDS));
            param.cancelScheduledValues(now);
            param.setValueAtTime(level, now);
            param.linearRampToValueAtTime(0, now + seconds);
            voice.source.stop(now + seconds);
        }
        if (!seconds) disconnectVoice();
        const suspend = () => {
            suspendTimer = undefined;
            if (wanted() || context !== c) return;
            disconnectVoice();
            if (c.state === 'running') void c.suspend().catch(() => undefined);
        };
        if (seconds) suspendTimer = setTimeout(suspend, seconds * 1000 + 20);
        else suspend();
    }

    function resume(c: AudioContext, trustedGesture = false): Promise<void> {
        if (resuming && !trustedGesture) return resuming;
        // Called synchronously by the trusted gesture handler, before any fetch/decode awaits.
        // Some touch browsers keep an earlier resume pending until resume is called from touchend.
        resuming = c.state === 'running' ? Promise.resolve() : c.resume();
        const pending = resuming;
        void pending.then(() => { if (resuming === pending) resuming = undefined; },
            () => { if (resuming === pending) resuming = undefined; });
        return pending;
    }

    async function load(c: AudioContext, track: Track): Promise<AudioBuffer> {
        if (track.buffer) return track.buffer;
        if (!track.loading) {
            const controller = new AbortController();
            track.request = controller;
            track.loading = (async () => {
                const response = await environment!.fetch(track.url, { signal: controller.signal });
                if (!response.ok) throw new Error(`Menu ambience HTTP ${response.status}`);
                const data = await response.arrayBuffer();
                if (disposed || context !== c) throw new Error('Menu ambience disposed');
                const decoded = await c.decodeAudioData(data);
                if (!disposed && context === c) track.buffer = decoded;
                return decoded;
            })();
        }
        const pending = track.loading;
        try { return await pending; }
        finally {
            if (track.loading === pending) {
                track.loading = undefined;
                track.request = undefined;
            }
        }
    }

    function introAndMusic(c: AudioContext, intro: AudioBuffer, music: AudioBuffer): AudioBuffer {
        if (welcomeBuffer) return welcomeBuffer;
        const combined = c.createBuffer(music.numberOfChannels, intro.length + music.length, music.sampleRate);
        const overlap = Math.min(Math.round(INTRO_TRANSITION_SECONDS * music.sampleRate), intro.length, music.length);
        for (let channel = 0; channel < music.numberOfChannels; channel++) {
            const data = combined.getChannelData(channel), loop = music.getChannelData(channel);
            data.set(intro.getChannelData(channel));
            data.set(loop, intro.length);
            // The intro WAV already fades out here. Fade in the music tail, then wrap into its head.
            for (let i = 0; i < overlap; i++) {
                const t = i / (overlap - 1);
                data[intro.length - overlap + i] += loop[music.length - overlap + i] * Math.sin(t * t * (3 - 2 * t) * Math.PI / 2);
            }
        }
        welcomeBuffer = combined;
        return combined;
    }

    async function start() {
        const c = context, token = epoch;
        if (!c || !unlocked || !wanted() || starting === token || (voice && !voice.stopping)) return;
        if (!welcome.started && !welcome.gesture) return;
        starting = token;
        clearSuspendTimer();
        try {
            await resume(c);
            if (disposed || context !== c || token !== epoch || !wanted()) return;
            const [music, intro] = await Promise.all([load(c, tracks.music), welcome.started ? undefined : load(c, tracks.intro)]);
            if (disposed || context !== c || token !== epoch || !wanted() || c.state !== 'running') return;
            const introSeconds = !welcome.started && intro ? intro.duration : 0;
            const decoded = introSeconds && intro ? introAndMusic(c, intro, music) : music;
            disconnectVoice();
            const source = c.createBufferSource(), gain = c.createGain();
            source.buffer = decoded;
            source.loop = true;
            source.loopStart = introSeconds;
            source.loopEnd = decoded.duration;
            const now = c.currentTime;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(MENU_AMBIENCE_GAIN, now + FADE_IN_SECONDS);
            source.connect(gain).connect(c.destination);
            const startOffset = introSeconds ? 0 : offset;
            const current = { source, gain, startedAt: now, offset: startOffset, introSeconds, stopping: false };
            source.onended = () => {
                if (voice === current) disconnectVoice();
            };
            try {
                source.start(now, startOffset);
                voice = current;
                if (introSeconds) welcome.started = true;
            } catch (error) {
                source.onended = null;
                source.disconnect();
                gain.disconnect();
                throw error;
            }
        } catch {
            // Autoplay denial, offline assets, and unsupported decoders must not break the menu.
            // A later trusted gesture retries; failures never launch a retry loop.
            if (c.state !== 'running') unlocked = false;
        } finally {
            if (starting === token) starting = undefined;
            // A pending resume can resolve after a hide/route transition already tried to suspend it.
            if (context === c && !wanted()) stop(pageHidden || environment?.document.visibilityState !== 'visible');
        }
    }

    function reconcile() {
        if (wanted()) void start();
        else stop(pageHidden || environment?.document.visibilityState !== 'visible');
    }

    const onGesture: EventListener = event => {
        if (!event.isTrusted || !active || disposed || pageHidden || environment?.document.visibilityState !== 'visible') return;
        if (!muted) welcome.gesture = true;
        if (voice && !voice.stopping && context?.state === 'running') return;
        try {
            context ??= environment.createContext();
            const c = context;
            // Unlock silently even when muted, so the first unmute click can work without another gesture.
            void resume(c, true).then(() => {
                if (disposed || context !== c || c.state !== 'running') return;
                // App may update mute in the same trusted click before this microtask runs.
                if (wanted()) welcome.gesture = true;
                unlocked = true;
                reconcile();
            }, () => { unlocked = false; });
        } catch { /* Remain silent when Web Audio is unavailable. */ }
    };
    const onVisibility: EventListener = () => reconcile();
    const onPageHide: EventListener = () => { pageHidden = true; stop(true); };
    const onPageShow: EventListener = () => { pageHidden = false; reconcile(); };

    function attach() {
        if (attached || !environment) return;
        attached = true;
        for (const name of gestureEvents) environment.events.addEventListener(name, onGesture, { passive: true });
        environment.document.addEventListener('visibilitychange', onVisibility);
        environment.events.addEventListener('pagehide', onPageHide);
        environment.events.addEventListener('pageshow', onPageShow);
    }

    function detach() {
        if (!attached || !environment) return;
        attached = false;
        for (const name of gestureEvents) environment.events.removeEventListener(name, onGesture);
        environment.document.removeEventListener('visibilitychange', onVisibility);
        environment.events.removeEventListener('pagehide', onPageHide);
        environment.events.removeEventListener('pageshow', onPageShow);
    }

    return {
        setMenuAmbience(nextActive, nextMuted) {
            if (disposed) return;
            const changed = active !== nextActive || muted !== nextMuted;
            active = nextActive;
            muted = nextMuted;
            if (active) attach(); else detach();
            if (changed) reconcile();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            detach();
            stop(true);
            for (const track of Object.values(tracks)) {
                track.request?.abort();
                track.buffer = undefined;
                track.loading = undefined;
            }
            welcomeBuffer = undefined;
            const c = context;
            context = undefined;
            if (c && c.state !== 'closed') void c.close().catch(() => undefined);
        },
    };
}

let singleton: MenuAmbienceController | undefined;

/** Call on menu/mute changes. The welcome plays at most once per Document, even across disposal. */
export function setMenuAmbience(active: boolean, muted: boolean): void {
    singleton ??= createMenuAmbience();
    singleton.setMenuAmbience(active, muted);
}

/** App unmount/HMR cleanup. A subsequent setMenuAmbience call creates a fresh controller. */
export function disposeMenuAmbience(): void {
    singleton?.dispose();
    singleton = undefined;
}

if (import.meta.hot) import.meta.hot.dispose(disposeMenuAmbience);
