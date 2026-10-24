import type { BodyState, GameState, Vector } from '../types';

export const PRESENTATION_DELAY_MS = 100;
const HISTORY_LIMIT = 32;
export const MAX_PRESENTATION_DELAY_MS = 240;
interface Entry { state: GameState; receivedAt: number }
export interface RenderTransform { position: Vector; angle: number }
export interface RenderSnapshot {
    state: GameState; transforms: Map<number, RenderTransform>; timestamp: number; buffered: number;
    delayMs: number; targetDelayMs: number; held: boolean; resynced: boolean;
}

/** Render only between received authoritative snapshots, with a small jitter buffer. */
export class SnapshotInterpolator {
    private entries: Entry[] = [];
    private clockOffset: number | undefined;
    private renderedAt = -Infinity;
    private lastSampleAt?: number;
    private intervalMs = 50;
    private jitterMs = 0;
    private delayMs = PRESENTATION_DELAY_MS;
    private targetDelayMs = PRESENTATION_DELAY_MS;

    reset() {
        this.entries = []; this.clockOffset = undefined; this.renderedAt = -Infinity; this.lastSampleAt = undefined;
        this.intervalMs = 50; this.jitterMs = 0; this.delayMs = PRESENTATION_DELAY_MS; this.targetDelayMs = PRESENTATION_DELAY_MS;
    }
    get delay() { return this.delayMs; }

    push(state: GameState, receivedAt: number) {
        const last = this.entries.at(-1);
        if (!Number.isFinite(state.timestamp + receivedAt) || (last && (state.timestamp <= last.state.timestamp || receivedAt < last.receivedAt))) return;
        this.entries.push({ state, receivedAt });
        if (this.entries.length > HISTORY_LIMIT) this.entries.shift();
        const floor = Math.min(...this.entries.map(entry => entry.receivedAt - entry.state.timestamp));
        this.clockOffset = this.clockOffset === undefined ? floor : this.clockOffset + (floor - this.clockOffset) * 0.05;
        if (last) {
            const gap = receivedAt - last.receivedAt;
            this.intervalMs += (Math.min(100, state.timestamp - last.state.timestamp) - this.intervalMs) * .05;
            this.jitterMs = Math.max(this.jitterMs * Math.exp(-gap / 3000), gap - this.intervalMs,
                receivedAt - state.timestamp - floor, 0);
            this.targetDelayMs = Math.max(PRESENTATION_DELAY_MS, Math.min(MAX_PRESENTATION_DELAY_MS, this.intervalMs + this.jitterMs * 1.2 + 20));
        }
    }

    sample(now: number): RenderSnapshot | undefined {
        const newest = this.entries.at(-1);
        if (!newest || this.clockOffset === undefined || !Number.isFinite(now)) return;
        const elapsed = this.lastSampleAt === undefined ? 0 : Math.max(0, now - this.lastSampleAt);
        this.lastSampleAt = Math.max(this.lastSampleAt ?? now, now);
        const change = this.targetDelayMs - this.delayMs;
        this.delayMs += Math.sign(change) * Math.min(Math.abs(change), elapsed * (change > 0 ? .25 : .015));
        const desired = Math.min(newest.state.timestamp, now - this.clockOffset - this.delayMs);
        // Recover gently after a stall. Never rewind time or accelerate through missing physics.
        const catchup = Number.isFinite(this.renderedAt) ? this.renderedAt + elapsed * 1.15 : desired;
        const resynced = Number.isFinite(this.renderedAt) && desired - this.renderedAt > 400;
        const target = Math.max(this.renderedAt, Math.min(desired, resynced ? desired : catchup));
        const held = target === this.renderedAt;
        this.renderedAt = target;
        let left = this.entries[0], right = left;
        for (const entry of this.entries) {
            if (entry.state.timestamp <= target) left = entry;
            if (entry.state.timestamp >= target) { right = entry; break; }
            right = entry;
        }
        const timing = { timestamp: target, buffered: this.entries.length, delayMs: this.delayMs, targetDelayMs: this.targetDelayMs, held, resynced };
        if (target < left.state.timestamp) return { state: { ...left.state, bodies: [] }, transforms: new Map(), ...timing };
        const span = right.state.timestamp - left.state.timestamp;
        const alpha = span > 0 && span <= 300 ? Math.max(0, Math.min(1, (target - left.state.timestamp) / span)) : 0;
        const next = new Map(right.state.bodies.map(body => [body.id, body]));
        const transforms = new Map<number, RenderTransform>();
        for (const body of left.state.bodies) {
            if (body.isStatic) continue;
            const end = next.get(body.id);
            const dx = end ? end.position.x - body.position.x : 0, dy = end ? end.position.y - body.position.y : 0;
            const delta = end ? Math.atan2(Math.sin(end.angle - body.angle), Math.cos(end.angle - body.angle)) : 0;
            transforms.set(body.id, { position: { x: body.position.x + dx * alpha, y: body.position.y + dy * alpha }, angle: body.angle + delta * alpha });
        }
        return { state: left.state, transforms, ...timing };
    }
}

export function renderedPosition(body: BodyState, transforms: ReadonlyMap<number, RenderTransform>) {
    return transforms.get(body.id)?.position ?? body.position;
}
