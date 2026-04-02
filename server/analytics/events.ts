import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory counters for real-time stats (reset on server restart)
const counters: Record<string, number> = {};
const hourlyCounters: Map<string, Record<string, number>> = new Map();
const uniqueUsers = new Set<string>();

function recordEvent(event: { name: string; uid?: string; ts: number }) {
    counters[event.name] = (counters[event.name] || 0) + 1;
    if (event.uid) uniqueUsers.add(event.uid);
    const hour = new Date(event.ts).toISOString().slice(0, 13);
    if (!hourlyCounters.has(hour)) hourlyCounters.set(hour, {});
    const hc = hourlyCounters.get(hour)!;
    hc[event.name] = (hc[event.name] || 0) + 1;
}

// Rate limiting: max 20 requests per minute per IP
const eventRateLimits: Map<string, number[]> = new Map();
const EVENT_RATE_MAX = 20;
const EVENT_RATE_WINDOW = 60_000;
const MAX_EVENTS_PER_BATCH = 50;
const MAX_EVENT_SIZE = 500; // bytes per event

router.post('/api/events', (req, res) => {
    try {
        // Rate limit by IP
        const ip = req.ip || 'unknown';
        const now = Date.now();
        const timestamps = (eventRateLimits.get(ip) || []).filter(t => now - t < EVENT_RATE_WINDOW);
        if (timestamps.length >= EVENT_RATE_MAX) {
            res.status(429).json({ error: 'Rate limited' });
            return;
        }
        timestamps.push(now);
        eventRateLimits.set(ip, timestamps);

        // sendBeacon sends text/plain to avoid CORS preflight; parse if needed
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch { body = null; }
        }
        if (!Array.isArray(body) || body.length > MAX_EVENTS_PER_BATCH) {
            res.status(400).json({ error: 'Invalid payload' });
            return;
        }

        // Process each event with size validation
        const lines: string[] = [];
        for (const e of body) {
            if (e && typeof e === 'object' && 'name' in e) {
                const line = JSON.stringify(e);
                if (line.length <= MAX_EVENT_SIZE) {
                    lines.push(line);
                    recordEvent(e as { name: string; uid?: string; ts: number });
                }
            }
        }

        if (lines.length > 0) {
            fs.appendFileSync(EVENTS_FILE, lines.join('\n') + '\n');
        }

        res.status(204).end();
    } catch {
        res.status(500).json({ error: 'Failed to store events' });
    }
});

// Stats endpoint protected by admin key
router.get('/api/stats', (req, res) => {
    const adminKey = process.env.ADMIN_KEY;
    if (adminKey && req.query.key !== adminKey) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    // Trim hourly counters to last 48 hours to prevent unbounded growth
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 13);
    for (const key of hourlyCounters.keys()) {
        if (key < cutoff) hourlyCounters.delete(key);
    }

    res.json({
        totalEvents: Object.values(counters).reduce((a, b) => a + b, 0),
        uniqueUsers: uniqueUsers.size,
        funnel: {
            app_loaded: counters['app_loaded'] || 0,
            room_created: counters['room_created'] || 0,
            match_started: counters['match_started'] || 0,
            ai_prompt_submitted: counters['ai_prompt_submitted'] || 0,
            projectile_fired: counters['projectile_fired'] || 0,
            match_ended: counters['match_ended'] || 0,
            rematch_requested: counters['rematch_requested'] || 0,
            return_to_lobby: counters['return_to_lobby'] || 0,
        },
        events: counters,
        hourly: Object.fromEntries(hourlyCounters),
    });
});

export default router;
