import type { BodyState, GameState, Vector } from '../types';

export const PRESENTATION_DELAY_MS = 100;
const HISTORY_LIMIT = 12;
interface Entry { state: GameState; receivedAt: number }
export interface RenderTransform { position: Vector; angle: number }
export interface RenderSnapshot { state: GameState; transforms: Map<number, RenderTransform>; timestamp: number; buffered: number }

/** Render only between received authoritative snapshots, with a small jitter buffer. */
export class SnapshotInterpolator {
    private entries: Entry[] = [];
    private clockOffset: number | undefined;
    private renderedAt = -Infinity;

    reset() { this.entries = []; this.clockOffset = undefined; this.renderedAt = -Infinity; }

    push(state: GameState, receivedAt: number) {
        const last = this.entries.at(-1);
        if (last && state.timestamp <= last.state.timestamp) return;
        this.entries.push({ state, receivedAt });
        if (this.entries.length > HISTORY_LIMIT) this.entries.shift();
        const floor = Math.min(...this.entries.map(entry => entry.receivedAt - entry.state.timestamp));
        this.clockOffset = this.clockOffset === undefined ? floor : this.clockOffset + (floor - this.clockOffset) * 0.05;
    }

    sample(now: number): RenderSnapshot | undefined {
        const newest = this.entries.at(-1);
        if (!newest || this.clockOffset === undefined) return;
        const target = Math.min(newest.state.timestamp, Math.max(this.renderedAt, now - this.clockOffset - PRESENTATION_DELAY_MS));
        this.renderedAt = target;
        let left = this.entries[0], right = left;
        for (const entry of this.entries) {
            if (entry.state.timestamp <= target) left = entry;
            if (entry.state.timestamp >= target) { right = entry; break; }
            right = entry;
        }
        if (target < left.state.timestamp) return { state: { ...left.state, bodies: [] }, transforms: new Map(), timestamp: target, buffered: this.entries.length };
        const span = right.state.timestamp - left.state.timestamp;
        const alpha = span > 0 ? Math.max(0, Math.min(1, (target - left.state.timestamp) / span)) : 0;
        const next = new Map(right.state.bodies.map(body => [body.id, body]));
        const transforms = new Map<number, RenderTransform>();
        for (const body of left.state.bodies) {
            if (body.isStatic) continue;
            const end = next.get(body.id);
            const dx = end ? end.position.x - body.position.x : 0, dy = end ? end.position.y - body.position.y : 0;
            const delta = end ? Math.atan2(Math.sin(end.angle - body.angle), Math.cos(end.angle - body.angle)) : 0;
            transforms.set(body.id, { position: { x: body.position.x + dx * alpha, y: body.position.y + dy * alpha }, angle: body.angle + delta * alpha });
        }
        return { state: left.state, transforms, timestamp: target, buffered: this.entries.length };
    }
}

export function renderedPosition(body: BodyState, transforms: ReadonlyMap<number, RenderTransform>) {
    return transforms.get(body.id)?.position ?? body.position;
}
