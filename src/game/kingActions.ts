import type { MatchPhase, Side, Vector } from '../types';

export type KingActionMode = 'idle' | 'ready' | 'aim' | 'charge' | 'recoil' | 'brace' | 'hit' | 'recover' | 'airborne' | 'landing' | 'victory' | 'defeat';
interface Weights { ready: number; aim: number; charge: number; recoil: number; brace: number; recover: number; airborne: number; landing: number }
export interface KingActionPose extends Weights {
    mode: KingActionMode;
    look: number;
    aimPitch: number;
    threat: number;
    resultAt?: number;
}
export interface ActionProjectile { id: number; position: Vector; velocity: Vector }
export interface KingActionCue {
    now: number;
    side: Side;
    phase: MatchPhase;
    turn: Side | null;
    winner?: Side | null;
    king: Vector;
    velocity?: Vector;
    hp?: number;
    projectiles: ActionProjectile[];
    shot?: { id: number; side: Side; at: number };
    hitAt?: number;
    aimAngle: number;
    chargePower?: number;
    reducedMotion: boolean;
}
const zero = (): Weights => ({ ready: 0, aim: 0, charge: 0, recoil: 0, brace: 0, recover: 0, airborne: 0, landing: 0 });
const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const smooth = (t: number) => { const x = clamp(t); return x * x * (3 - 2 * x); };

/** Presentation only: a nearby, approaching ball, never a predicted hit or damage event. */
export function incomingKingThreat(king: Vector, side: Side, balls: ActionProjectile[], ownProjectile?: number) {
    let amount = 0, look = 0;
    for (const ball of balls) {
        if (ball.id === ownProjectile) continue;
        const dx = king.x - ball.position.x, dy = king.y - ball.position.y;
        const speed2 = ball.velocity.x ** 2 + ball.velocity.y ** 2;
        const distance = Math.hypot(dx, dy);
        const closing = dx * ball.velocity.x + dy * ball.velocity.y;
        if (!Number.isFinite(speed2 + distance + closing) || speed2 < 9 || closing <= 0 || distance > 360) continue;
        const frames = clamp(closing / speed2, 0, 16);
        const miss = Math.hypot(dx - ball.velocity.x * frames, dy - ball.velocity.y * frames);
        if (miss > 110) continue;
        const urgency = (1 - distance / 420) * (1 - miss / 130);
        if (urgency > amount) {
            amount = urgency;
            look = clamp((ball.position.x - king.x) * (side === 'left' ? 1 : -1) / 120, -1, 1);
        }
    }
    return { amount, look };
}

/** Blend registered joint clips by elapsed time, not by a fixed per-frame increment. */
export class KingActionDirector {
    private mode: KingActionMode = 'idle';
    private from = zero();
    private target = zero();
    private changedAt = 0;
    private duration = 180;
    private previousNow?: number;
    private reduced = false;
    private resultAt?: number;
    private inAir = false;
    private landedAt = -Infinity;
    private chargeIntensity = 0;

    reset() {
        this.mode = 'idle'; this.from = zero(); this.target = zero();
        this.changedAt = 0; this.previousNow = undefined; this.resultAt = undefined;
        this.reduced = false;
        this.inAir = false; this.landedAt = -Infinity;
        this.chargeIntensity = 0;
    }

    private weights(now: number): Weights {
        const t = smooth((now - this.changedAt) / this.duration);
        const values = zero();
        for (const name of Object.keys(values) as (keyof Weights)[]) values[name] = this.from[name] + (this.target[name] - this.from[name]) * t;
        return values;
    }

    update(cue: KingActionCue): KingActionPose {
        const now = Number.isFinite(cue.now) ? Math.max(0, cue.now) : this.previousNow ?? 0;
        if (this.previousNow !== undefined && now < this.previousNow) this.reset();
        const ownShot = cue.shot?.side === cue.side ? cue.shot : undefined;
        const age = ownShot ? now - ownShot.at : Infinity;
        const hitAge = cue.hitAt === undefined ? Infinity : now - cue.hitAt;
        const ownFlight = cue.projectiles.some(ball => ball.id === ownShot?.id);
        const threat = incomingKingThreat(cue.king, cue.side, cue.projectiles, ownShot?.id);
        const verticalSpeed = Math.abs(cue.velocity?.y ?? 0);
        if (verticalSpeed > 2) this.inAir = true;
        else if (this.inAir && verticalSpeed < 0.7) { this.inAir = false; this.landedAt = now; }
        let mode: KingActionMode = 'idle';
        if ((cue.phase === 'result' && cue.winner) || cue.hp === 0) {
            this.resultAt ??= now;
            mode = cue.hp === 0 || cue.winner !== cue.side ? 'defeat' : 'victory';
        } else {
            this.resultAt = undefined;
            if (hitAge >= 0 && hitAge < 480) mode = 'hit';
            else if (this.inAir) mode = 'airborne';
            else if (now - this.landedAt < 360) mode = 'landing';
            else if (hitAge >= 480 && hitAge < 900) mode = 'recover';
            else if (cue.phase === 'combat' && age >= 0 && age < 170) mode = 'recoil';
            else if (cue.phase === 'combat' && age >= 170 && age < 850) mode = 'recover';
            else if (cue.phase === 'combat' && threat.amount > 0) mode = 'brace';
            else if (cue.phase === 'combat' && cue.turn === cue.side && !ownFlight) {
                mode = Number.isFinite(cue.chargePower) ? 'charge' : 'aim';
            }
            else if (cue.phase === 'build' || cue.phase === 'reveal') mode = 'ready';
        }
        if (this.previousNow === undefined || mode !== this.mode || this.reduced !== cue.reducedMotion) {
            this.from = this.reduced ? zero() : this.weights(now);
            this.target = zero();
            if (mode in this.target) this.target[mode as keyof Weights] = 1;
            if (mode === 'charge') this.target.aim = 1;
            this.changedAt = now;
            this.duration = mode === 'recoil' ? 70 : mode === 'brace' ? 110 : 180;
            this.mode = mode;
        }
        this.previousNow = now; this.reduced = cue.reducedMotion;
        // Preserve intensity while the charge weight blends out after release/cancel.
        if (mode === 'charge') this.chargeIntensity = .25 + .75 * clamp(cue.chargePower! / 100);
        const weights = cue.reducedMotion ? zero() : this.weights(now);
        return { ...weights, charge: weights.charge * this.chargeIntensity, mode,
            look: cue.reducedMotion ? 0 : weights.aim * .5 + weights.brace * threat.look,
            aimPitch: Number.isFinite(cue.aimAngle) ? clamp((cue.aimAngle - Math.PI / 4) / (Math.PI / 2), -1, 1) : 0,
            threat: threat.amount, resultAt: this.resultAt };
    }
}
