import Matter from 'matter-js';
import { Server } from 'socket.io';
import { PausableTimers, type TimerId } from './PausableTimers';
import { SHOT_FLIGHT_RATE } from '../shared/shotPacing';
import type { Side, MatchPhase, KingState } from '../types';
import {
    BUILD_PHASE_DURATION_MS,
    REVEAL_DURATION_MS,
    COMBAT_TURN_DURATION_MS,
    SETTLE_MAX_TIMEOUT_MS,
    SETTLE_POLL_INTERVAL_MS,
    SETTLE_SPEED_THRESHOLD,
    SETTLE_CONFIRM_COUNT,
    ROUND_INTERSTITIAL_MS,
} from '../config/constants';

export interface MatchCallbacks {
    onPhaseChange: (phase: MatchPhase) => void;
    onTurnStart: (side: Side) => void;
    /** Roll per-turn conditions (wind) before the turn is announced; merged into turn_start. */
    prepareTurn?: (side: Side) => { wind?: number; aimEpoch?: string };
    onMatchResult: (winner: Side, reason: string) => void;
    onRoundEnd: (winner: Side, reason: string) => 'continue' | 'match_over';
    getKingState: (side: Side) => KingState;
    getWorld: () => Matter.World;
}

export class MatchStateMachine {
    private io: Server;
    private roomId: string;
    private phase: MatchPhase = 'lobby';
    private callbacks: MatchCallbacks;

    private phaseTimer: TimerId | null = null;
    private settleInterval: TimerId | null = null;
    private endsAt = 0;
    private pausedAt: number | null = null;
    private settleStart: number = 0;
    private settleConfirmCount: number = 0;

    private currentTurn: Side = 'left';
    private playersReady: Set<string> = new Set(); // socketIds that clicked ready during build
    private matchEnded: boolean = false;
    private hasFiredThisTurn: boolean = false;

    constructor(io: Server, roomId: string, callbacks: MatchCallbacks, private timers = new PausableTimers()) {
        this.io = io;
        this.roomId = roomId;
        this.callbacks = callbacks;
    }

    getPhase(): MatchPhase {
        return this.phase;
    }

    getCurrentTurn(): Side {
        return this.currentTurn;
    }

    getStatus() { return { phase: this.phase, turn: this.currentTurn, endsAt: this.endsAt, hasFired: this.hasFiredThisTurn, ready: [...this.playersReady] }; }
    rebindPlayer(oldId: string, newId: string): void {
        if (this.playersReady.delete(oldId)) this.playersReady.add(newId);
    }
    pause(): void { if (this.pausedAt === null) { this.pausedAt = Date.now(); this.timers.pause(); } }
    resume(): void {
        if (this.pausedAt === null) return;
        const elapsed = Date.now() - this.pausedAt;
        if (this.endsAt) this.endsAt += elapsed;
        this.settleStart += elapsed;
        this.pausedAt = null; this.timers.resume();
    }

    startBuildPhase(): void {
        this.setPhase('build');
        this.playersReady.clear();

        const endsAt = this.endsAt = Date.now() + BUILD_PHASE_DURATION_MS;
        this.io.to(this.roomId).emit('phase_change', {
            phase: 'build',
            endsAt,
        });

        this.phaseTimer = this.timers.timeout(() => {
            this.startRevealPhase();
        }, BUILD_PHASE_DURATION_MS);
    }

    handlePlayerBuildReady(socketId: string): void {
        if (this.phase !== 'build' || this.pausedAt !== null) return;

        this.playersReady.add(socketId);

        // If both players ready, skip to reveal early
        if (this.playersReady.size >= 2) {
            this.clearPhaseTimer();
            this.startRevealPhase();
        }
    }

    startRevealPhase(): void {
        this.setPhase('reveal');

        const endsAt = this.endsAt = Date.now() + REVEAL_DURATION_MS;
        this.io.to(this.roomId).emit('phase_change', {
            phase: 'reveal',
            endsAt,
        });

        this.phaseTimer = this.timers.timeout(() => {
            this.startCombatPhase();
        }, REVEAL_DURATION_MS);
    }

    startCombatPhase(): void {
        this.setPhase('combat');
        this.currentTurn = 'left'; // left always goes first
        this.startTurn('left');
    }

    startTurn(side: Side): void {
        if (this.matchEnded) return;
        this.currentTurn = side;
        this.hasFiredThisTurn = false;

        const conditions = this.callbacks.prepareTurn?.(side) ?? {};
        const endsAt = this.endsAt = Date.now() + COMBAT_TURN_DURATION_MS;
        this.io.to(this.roomId).emit('phase_change', {
            phase: 'combat',
            endsAt,
            turnPlayer: side,
        });
        this.io.to(this.roomId).emit('turn_start', {
            side,
            endsAt,
            ...conditions,
        });

        this.callbacks.onTurnStart(side);

        // Auto-skip turn if timer expires
        this.phaseTimer = this.timers.timeout(() => {
            this.onProjectileSettled();
        }, COMBAT_TURN_DURATION_MS);
    }

    canFire(): boolean {
        return this.phase === 'combat' && !this.matchEnded && !this.hasFiredThisTurn && this.pausedAt === null;
    }

    onProjectileFired(): void {
        // Cancel the turn timer — now we wait for settle
        this.clearPhaseTimer();
        this.hasFiredThisTurn = true;
        // The shot resolves the turn: clients stop the countdown instead of showing a stale clock.
        this.endsAt = 0;
        this.io.to(this.roomId).emit('shot_fired', { side: this.currentTurn });
    }

    waitForSettle(): void {
        this.settleStart = Date.now();
        this.settleConfirmCount = 0;

        this.settleInterval = this.timers.interval(() => {
            const world = this.callbacks.getWorld();
            const dynamicBodies = Matter.Composite.allBodies(world).filter(
                b => !b.isStatic && b.label !== 'Terrain' && !(b as { hazardRock?: boolean }).hazardRock
            );

            const allSettled = dynamicBodies.every(
                b => b.speed < SETTLE_SPEED_THRESHOLD || b.isSleeping
            );

            const now = Date.now();

            if (allSettled) {
                this.settleConfirmCount++;
                // Require N consecutive settled polls before advancing
                if (this.settleConfirmCount >= SETTLE_CONFIRM_COUNT) {
                    this.clearSettleInterval();
                    this.onProjectileSettled();
                    return;
                }
            } else {
                this.settleConfirmCount = 0;
            }

            // Hard max timeout
            const flightActive = dynamicBodies.some(body => body.label === 'projectile' && !body.isSleeping);
            const timeout = flightActive ? SETTLE_MAX_TIMEOUT_MS / SHOT_FLIGHT_RATE : SETTLE_MAX_TIMEOUT_MS;
            if (now - this.settleStart >= timeout) {
                this.clearSettleInterval();
                this.onProjectileSettled();
            }
        }, SETTLE_POLL_INTERVAL_MS);
    }

    private onProjectileSettled(): void {
        if (this.matchEnded || this.checkKingDefeat()) return;

        // Switch turns
        const nextTurn: Side = this.currentTurn === 'left' ? 'right' : 'left';
        this.startTurn(nextTurn);
    }

    /** Resolve lethal damage after a physics step, not seconds later after every block settles. */
    checkKingDefeat(): boolean {
        if (this.matchEnded || this.phase !== 'combat') return false;
        const leftKing = this.callbacks.getKingState('left');
        const rightKing = this.callbacks.getKingState('right');

        if (leftKing.hp <= 0 && rightKing.hp <= 0) {
            // Both dead — attacker (who fired the shot) wins, since they caused the destruction
            const attacker = this.currentTurn;
            this.endMatch(attacker, 'both_kings_destroyed');
            return true;
        }

        if (leftKing.hp <= 0) {
            this.endMatch('right', 'king_destroyed');
            return true;
        }

        if (rightKing.hp <= 0) {
            this.endMatch('left', 'king_destroyed');
            return true;
        }

        return false;
    }

    private endMatch(winner: Side, reason: string): void {
        this.matchEnded = true;
        this.clearPhaseTimer();
        this.clearSettleInterval();

        // Delegate to round handler first
        const result = this.callbacks.onRoundEnd(winner, reason);

        if (result === 'continue') {
            this.endsAt = Date.now() + ROUND_INTERSTITIAL_MS;
            this.setPhase('intermission');
            this.io.to(this.roomId).emit('phase_change', {
                phase: 'intermission', endsAt: Date.now() + ROUND_INTERSTITIAL_MS,
            });
            return;
        }

        // Match is truly over
        this.setPhase('result');
        this.endsAt = 0;

        this.io.to(this.roomId).emit('phase_change', { phase: 'result' });
        this.io.to(this.roomId).emit('match_result', {
            winner,
            reason,
            kings: {
                left: {
                    hp: this.callbacks.getKingState('left').hp,
                    maxHp: this.callbacks.getKingState('left').maxHp,
                },
                right: {
                    hp: this.callbacks.getKingState('right').hp,
                    maxHp: this.callbacks.getKingState('right').maxHp,
                },
            },
        });

        this.callbacks.onMatchResult(winner, reason);
    }

    private setPhase(phase: MatchPhase): void {
        this.phase = phase;
        this.callbacks.onPhaseChange(phase);
    }

    private clearPhaseTimer(): void {
        if (this.phaseTimer) {
            this.timers.clear(this.phaseTimer);
            this.phaseTimer = null;
        }
    }

    private clearSettleInterval(): void {
        if (this.settleInterval) {
            this.timers.clear(this.settleInterval);
            this.settleInterval = null;
        }
    }

    destroy(): void {
        this.clearPhaseTimer();
        this.clearSettleInterval();
    }
}
