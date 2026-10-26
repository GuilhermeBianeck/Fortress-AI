import { afterEach, expect, it, vi } from 'vitest';
import Matter from 'matter-js';
import type { Server } from 'socket.io';
import { MatchStateMachine } from '../MatchStateMachine';

afterEach(() => vi.useRealTimers());
it('does not hand over at the old five-second cutoff while a paced shot is still airborne', () => {
    vi.useFakeTimers();
    const world = Matter.World.create(), ball = Matter.Bodies.circle(800, 200, 9, { label: 'projectile' });
    Matter.Body.setVelocity(ball, { x: 30, y: 0 }); Matter.Composite.add(world, ball);
    const sm = new MatchStateMachine({ to: () => ({ emit: vi.fn() }) } as unknown as Server, 'flight', {
        onPhaseChange: vi.fn(), onTurnStart: vi.fn(), onMatchResult: vi.fn(), onRoundEnd: () => 'match_over',
        getWorld: () => world, getKingState: () => ({ bodyId: 1, hp: 100, maxHp: 100, position: { x: 600, y: 400 } }),
    });
    try {
        sm.startCombatPhase(); sm.onProjectileFired(); sm.waitForSettle();
        vi.advanceTimersByTime(5400); expect(sm.getCurrentTurn()).toBe('left'); expect(sm.canFire()).toBe(false);
        Matter.Body.setVelocity(ball, { x: 0, y: 0 });
        vi.advanceTimersByTime(600); expect(sm.getCurrentTurn()).toBe('right');
    } finally { sm.destroy(); }
});
