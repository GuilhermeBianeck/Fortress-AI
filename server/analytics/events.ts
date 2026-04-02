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

        // Append each event as a JSON line
        const lines = body
            .filter((e: unknown) => e && typeof e === 'object' && 'name' in (e as Record<string, unknown>))
            .map((e: unknown) => JSON.stringify(e))
            .join('\n');

        if (lines.length > 0) {
            fs.appendFileSync(EVENTS_FILE, lines + '\n');
        }

        res.status(204).end();
    } catch {
        res.status(500).json({ error: 'Failed to store events' });
    }
});

export default router;
