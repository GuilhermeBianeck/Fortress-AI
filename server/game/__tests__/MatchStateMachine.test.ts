import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Matter from 'matter-js';
import { MatchStateMachine, type MatchCallbacks } from '../MatchStateMachine';
import type { KingState, Side } from '../../types';

// Mock Socket.io
function createMockIo() {
    const emitFn = vi.fn();
    const toFn = vi.fn(() => ({ emit: emitFn }));
    return { to: toFn, emit: emitFn, toFn };
}

function createMockCallbacks(overrides: Partial<MatchCallbacks> = {}): MatchCallbacks {
    return {
        onPhaseChange: vi.fn(),
        onTurnStart: vi.fn(),
        onMatchResult: vi.fn(),
        onRoundEnd: vi.fn().mockReturnValue('match_over'),
        getKingState: vi.fn((side: Side): KingState => ({
            bodyId: side === 'left' ? 1 : 2,
            hp: 100,
            maxHp: 100,
            position: { x: side === 'left' ? 100 : 700, y: 400 },
        })),
        getWorld: vi.fn(() => {
            const engine = Matter.Engine.create();
            return engine.world;
        }),
        ...overrides,
    };
}

describe('MatchStateMachine', () => {
    let io: ReturnType<typeof createMockIo>;
    let callbacks: MatchCallbacks;
    let sm: MatchStateMachine;

    beforeEach(() => {
        vi.useFakeTimers();
        io = createMockIo();
        callbacks = createMockCallbacks();
        sm = new MatchStateMachine(io as any, 'test-room', callbacks);
    });

    afterEach(() => {
        sm.destroy();
        vi.useRealTimers();
    });

    describe('initial state', () => {
        it('starts in lobby phase', () => {
            expect(sm.getPhase()).toBe('lobby');
        });

        it('defaults current turn to left', () => {
            expect(sm.getCurrentTurn()).toBe('left');
        });
    });

    describe('startBuildPhase', () => {
        it('transitions to build phase', () => {
            sm.startBuildPhase();
            expect(sm.getPhase()).toBe('build');
        });

        it('emits phase_change event', () => {
            sm.startBuildPhase();
            expect(io.toFn).toHaveBeenCalledWith('test-room');
            expect(io.emit).toHaveBeenCalledWith(
                'phase_change',
                expect.objectContaining({ phase: 'build' })
            );
        });

        it('calls onPhaseChange callback', () => {
            sm.startBuildPhase();
            expect(callbacks.onPhaseChange).toHaveBeenCalledWith('build');
        });

        it('auto-transitions to reveal after timeout', () => {
            sm.startBuildPhase();
            vi.advanceTimersByTime(90_000);
            expect(sm.getPhase()).toBe('reveal');
        });
    });

    describe('handlePlayerBuildReady', () => {
        it('ignores ready when not in build phase', () => {
            sm.handlePlayerBuildReady('socket1');
            // Should still be in lobby
            expect(sm.getPhase()).toBe('lobby');
        });

        it('skips to reveal when both players ready', () => {
            sm.startBuildPhase();
            sm.handlePlayerBuildReady('socket1');
            expect(sm.getPhase()).toBe('build');

            sm.handlePlayerBuildReady('socket2');
            expect(sm.getPhase()).toBe('reveal');
        });

        it('does not skip with only one player ready', () => {
            sm.startBuildPhase();
            sm.handlePlayerBuildReady('socket1');
            expect(sm.getPhase()).toBe('build');
        });
    });

    describe('startRevealPhase', () => {
        it('transitions to reveal phase', () => {
            sm.startRevealPhase();
            expect(sm.getPhase()).toBe('reveal');
        });

        it('auto-transitions to combat after timeout', () => {
            sm.startRevealPhase();
            vi.advanceTimersByTime(5_000);
            expect(sm.getPhase()).toBe('combat');
        });
    });

    describe('combat phase', () => {
        beforeEach(() => {
            sm.startCombatPhase();
        });

        it('starts with left turn', () => {
            expect(sm.getCurrentTurn()).toBe('left');
        });

        it('emits turn_start event', () => {
            expect(io.emit).toHaveBeenCalledWith(
                'turn_start',
                expect.objectContaining({ side: 'left' })
            );
        });

        it('canFire returns true during combat', () => {
            expect(sm.canFire()).toBe(true);
        });

        it('canFire returns false after firing', () => {
            sm.onProjectileFired();
            expect(sm.canFire()).toBe(false);
        });

        it('auto-switches turn when timer expires', () => {
            vi.advanceTimersByTime(15_000);
            expect(sm.getCurrentTurn()).toBe('right');
        });
    });

    describe('win conditions', () => {
        it('right wins when left king dies', () => {
            callbacks = createMockCallbacks({
                getKingState: vi.fn((side: Side) => ({
                    bodyId: side === 'left' ? 1 : 2,
                    hp: side === 'left' ? 0 : 100,
                    maxHp: 100,
                    position: { x: 0, y: 0 },
                })),
            });
            sm = new MatchStateMachine(io as any, 'test-room', callbacks);
            vi.useFakeTimers();

            sm.startCombatPhase();
            // Let the turn timer expire to trigger projectile settled check
            vi.advanceTimersByTime(15_000);

            expect(callbacks.onRoundEnd).toHaveBeenCalledWith('right', 'king_destroyed');
        });

        it('left wins when right king dies', () => {
            callbacks = createMockCallbacks({
                getKingState: vi.fn((side: Side) => ({
                    bodyId: side === 'left' ? 1 : 2,
                    hp: side === 'left' ? 100 : 0,
                    maxHp: 100,
                    position: { x: 0, y: 0 },
                })),
            });
            sm = new MatchStateMachine(io as any, 'test-room', callbacks);
            vi.useFakeTimers();

            sm.startCombatPhase();
            vi.advanceTimersByTime(15_000);

            expect(callbacks.onRoundEnd).toHaveBeenCalledWith('left', 'king_destroyed');
        });

        it('attacker wins when both kings die', () => {
            callbacks = createMockCallbacks({
                getKingState: vi.fn(() => ({
                    bodyId: 1,
                    hp: 0,
                    maxHp: 100,
                    position: { x: 0, y: 0 },
                })),
            });
            sm = new MatchStateMachine(io as any, 'test-room', callbacks);
            vi.useFakeTimers();

            sm.startCombatPhase();
            // left is attacker (first turn)
            vi.advanceTimersByTime(15_000);

            expect(callbacks.onRoundEnd).toHaveBeenCalledWith('left', 'both_kings_destroyed');
        });
    });

    describe('phase flow: build → reveal → combat', () => {
        it('completes full phase transition flow', () => {
            sm.startBuildPhase();
            expect(sm.getPhase()).toBe('build');

            vi.advanceTimersByTime(90_000); // build ends
            expect(sm.getPhase()).toBe('reveal');

            vi.advanceTimersByTime(5_000); // reveal ends
            expect(sm.getPhase()).toBe('combat');
        });
    });

    describe('destroy', () => {
        it('clears all timers without errors', () => {
            sm.startBuildPhase();
            sm.destroy();
            // Advancing time should not trigger any transitions
            vi.advanceTimersByTime(200_000);
            expect(sm.getPhase()).toBe('build');
        });
    });
});
