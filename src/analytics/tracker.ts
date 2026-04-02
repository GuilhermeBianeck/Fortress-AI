/**
 * Lightweight analytics tracker.
 * Batches events and sends via navigator.sendBeacon (fire-and-forget, no UI blocking).
 * No external dependencies.
 */

type EventProperties = Record<string, string | number | boolean | null>;

interface AnalyticsEvent {
    name: string;
    props: EventProperties;
    ts: number;
    uid: string;
}

const ANALYTICS_URL = (import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`) + '/api/events';

const queue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let userId = '';

// Resolve user ID lazily from localStorage
function getUid(): string {
    if (!userId) {
        userId = localStorage.getItem('fortress_player_uuid') || 'anonymous';
    }
    return userId;
}

export function track(name: string, props?: EventProperties): void {
    queue.push({
        name,
        props: {
            ...props,
            platform: window.innerWidth < 768 ? 'mobile' : 'desktop',
        },
        ts: Date.now(),
        uid: getUid(),
    });

    // Auto-flush when queue hits 20 events
    if (queue.length >= 20) flush();

    // Start periodic flush if not running
    if (!flushTimer) {
        flushTimer = setInterval(flush, 5000);
    }
}

function flush(): void {
    if (queue.length === 0) return;
    const batch = queue.splice(0);
    const payload = JSON.stringify(batch);
    try {
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            // Use Blob with JSON content type so Express json() middleware can parse it
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(ANALYTICS_URL, blob);
        }
    } catch {
        // Silently fail -- analytics should never break the app
    }
}

// Flush remaining events on page unload
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush);
}
