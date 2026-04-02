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

router.post('/api/events', (req, res) => {
    try {
        // sendBeacon sends text/plain to avoid CORS preflight; parse if needed
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch { body = null; }
        }
        if (!Array.isArray(body)) {
            res.status(400).json({ error: 'Expected array of events' });
            return;
        }

        // Process each event: store to file + update in-memory counters
        const lines: string[] = [];
        for (const e of body) {
            if (e && typeof e === 'object' && 'name' in e) {
                lines.push(JSON.stringify(e));
                recordEvent(e as { name: string; uid?: string; ts: number });
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

router.get('/api/stats', (_req, res) => {
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
