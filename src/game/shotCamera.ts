import type { Side, Vector } from '../types';

export interface ShotReceipt { text: string; kind: 'king' | 'block' | 'ground' | 'miss'; at: number; projectileId: number }
export interface ShotFocus { kind: 'flight' | 'impact'; point: Vector; velocity: Vector }
const priority = { miss: 0, ground: 1, block: 2, king: 3 };

/** Presentation owns the shot until its impact has been readable, not until the next server turn. */
export class ShotCamera {
    id: number | null = null;
    side: Side | null = null;
    receipt: ShotReceipt | null = null;
    private point: Vector = { x: 0, y: 0 };
    private impactPoint: Vector | null = null;
    private holdUntil = 0;
    private lastId = -1;
    begin(id: number, side: Side, point: Vector): void {
        if (id < this.lastId || (id === this.lastId && this.id === null)) return;
        this.id = id; this.lastId = id; this.side = side; this.point = { ...point };
        this.receipt = null; this.impactPoint = null; this.holdUntil = 0;
    }
    impact(id: number | undefined, side: Side, point: Vector, kind: ShotReceipt['kind'], text: string, now: number): boolean {
        if (id === undefined || id < this.lastId || (id === this.lastId && this.id === null)) return false;
        if (id !== this.id) this.begin(id, side, point);
        if (this.receipt && priority[kind] < priority[this.receipt.kind]) return false;
        this.point = { ...point }; this.impactPoint = { ...point }; this.holdUntil = now + 1300;
        this.receipt = { text, kind, at: now, projectileId: id };
        return true;
    }
    sample(now: number, turn: Side | null, ball?: { position: Vector; velocity: Vector }): ShotFocus | null {
        if (this.id === null) return null;
        if (this.impactPoint && now < this.holdUntil) return { kind: 'impact', point: this.impactPoint, velocity: { x: 0, y: 0 } };
        if (this.impactPoint && (!ball || turn !== this.side || Math.hypot(ball.velocity.x, ball.velocity.y) < 3)) {
            this.id = null; return null;
        }
        if (ball) { this.point = { ...ball.position }; return { kind: 'flight', point: this.point, velocity: ball.velocity }; }
        if (!this.impactPoint) {
            this.impact(this.id, this.side!, this.point, 'miss', 'Shot missed', now);
            return { kind: 'impact', point: this.point, velocity: { x: 0, y: 0 } };
        }
        this.id = null; return null;
    }
    reset(): void { this.id = null; this.side = null; this.receipt = null; this.impactPoint = null; this.holdUntil = 0; this.lastId = -1; }
}
