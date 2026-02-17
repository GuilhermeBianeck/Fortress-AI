import Matter from 'matter-js';
import { Server } from 'socket.io';
import type { Side, MatchPhase, KingState } from '../types';
import {
    BUILD_PHASE_DURATION_MS,
    REVEAL_DURATION_MS,
    COMBAT_TURN_DURATION_MS,
    SETTLE_TIMEOUT_MS,
    SETTLE_MAX_TIMEOUT_MS,
    SETTLE_POLL_INTERVAL_MS,
    SETTLE_SPEED_THRESHOLD,
} from '../config/constants';

export interface MatchCallbacks {
    onPhaseChange: (phase: MatchPhase) => void;
    onTurnStart: (side: Side) => void;
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

    private phaseTimer: ReturnType<typeof setTimeout> | null = null;
    private settleInterval: ReturnType<typeof setInterval> | null = null;
    private settleStart: number = 0;
    private settledSince: number = 0;

    private currentTurn: Side = 'left';
    private playersReady: Set<string> = new Set(); // socketIds that clicked ready during build

    constructor(io: Server, roomId: string, callbacks: MatchCallbacks) {
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

    startBuildPhase(): void {
        this.setPhase('build');
        this.playersReady.clear();

        const endsAt = Date.now() + BUILD_PHASE_DURATION_MS;
        this.io.to(this.roomId).emit('phase_change', {
            phase: 'build',
            endsAt,
        });

        this.phaseTimer = setTimeout(() => {
            this.startRevealPhase();
        }, BUILD_PHASE_DURATION_MS);
    }

    handlePlayerBuildReady(socketId: string): void {
        if (this.phase !== 'build') return;

        this.playersReady.add(socketId);

        // If both players ready, skip to reveal early
        if (this.playersReady.size >= 2) {
            this.clearPhaseTimer();
            this.startRevealPhase();
        }
    }

    startRevealPhase(): void {
        this.setPhase('reveal');

        const endsAt = Date.now() + REVEAL_DURATION_MS;
        this.io.to(this.roomId).emit('phase_change', {
            phase: 'reveal',
            endsAt,
        });

        this.phaseTimer = setTimeout(() => {
            this.startCombatPhase();
        }, REVEAL_DURATION_MS);
    }

    startCombatPhase(): void {
        this.setPhase('combat');
        this.currentTurn = 'left'; // left always goes first
        this.startTurn('left');
    }

    startTurn(side: Side): void {
        this.currentTurn = side;

        const endsAt = Date.now() + COMBAT_TURN_DURATION_MS;
        this.io.to(this.roomId).emit('phase_change', {
            phase: 'combat',
            endsAt,
            turnPlayer: side,
        });
        this.io.to(this.roomId).emit('turn_start', {
            side,
            endsAt,
        });

        this.callbacks.onTurnStart(side);

        // Auto-skip turn if timer expires
        this.phaseTimer = setTimeout(() => {
            this.onProjectileSettled();
        }, COMBAT_TURN_DURATION_MS);
    }

    onProjectileFired(): void {
        // Cancel the turn timer — now we wait for settle
        this.clearPhaseTimer();
    }

    waitForSettle(): void {
        this.settleStart = Date.now();
        this.settledSince = 0;

        this.settleInterval = setInterval(() => {
            const world = this.callbacks.getWorld();
            const dynamicBodies = Matter.Composite.allBodies(world).filter(
                b => !b.isStatic && b.label !== 'Terrain'
            );

            const allSettled = dynamicBodies.every(
                b => b.speed < SETTLE_SPEED_THRESHOLD || b.isSleeping
            );

            const now = Date.now();

            if (allSettled) {
                if (this.settledSince === 0) {
                    this.settledSince = now;
                }
                if (now - this.settledSince >= SETTLE_TIMEOUT_MS) {
                    this.clearSettleInterval();
                    this.onProjectileSettled();
                    return;
                }
            } else {
                this.settledSince = 0;
            }

            // Hard max timeout
            if (now - this.settleStart >= SETTLE_MAX_TIMEOUT_MS) {
                this.clearSettleInterval();
                this.onProjectileSettled();
            }
        }, SETTLE_POLL_INTERVAL_MS);
    }

    private onProjectileSettled(): void {
        // Check win conditions
        const leftKing = this.callbacks.getKingState('left');
        const rightKing = this.callbacks.getKingState('right');

        if (leftKing.hp <= 0 && rightKing.hp <= 0) {
            // Both dead — the one who fired wins? Or draw? Let's say current turn player wins.
            this.endMatch(this.currentTurn, 'both_kings_destroyed');
            return;
        }

        if (leftKing.hp <= 0) {
            this.endMatch('right', 'king_destroyed');
            return;
        }

        if (rightKing.hp <= 0) {
            this.endMatch('left', 'king_destroyed');
            return;
        }

        // Switch turns
        const nextTurn: Side = this.currentTurn === 'left' ? 'right' : 'left';
        this.startTurn(nextTurn);
    }

    private endMatch(winner: Side, reason: string): void {
        // Delegate to round handler first
        const result = this.callbacks.onRoundEnd(winner, reason);

        if (result === 'continue') {
            // RoomManager will handle interstitial + next round
            return;
        }

        // Match is truly over
        this.setPhase('result');

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
            clearTimeout(this.phaseTimer);
            this.phaseTimer = null;
        }
    }

    private clearSettleInterval(): void {
        if (this.settleInterval) {
            clearInterval(this.settleInterval);
            this.settleInterval = null;
        }
    }

    destroy(): void {
        this.clearPhaseTimer();
        this.clearSettleInterval();
    }
}
