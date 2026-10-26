import { afterEach, expect, it, vi } from 'vitest';
import Matter from 'matter-js';
import type { Server } from 'socket.io';
import { GameSession, describeBuildFailure } from '../GameSession';
import { MatchStateMachine } from '../MatchStateMachine';
import { generateHazards } from '../../physics/hazards';
import { generateTerrain } from '../../physics/terrain';
import { rollWind, turnWindHazard, WIND_MAX, WIND_FORCE_PER_UNIT } from '../../shared/combatTuning';
import { FALLING_ROCK_INTERVAL_MS, FALLING_ROCK_LIFESPAN_MS, FALLING_ROCK_MAX, WORLD_WIDTH } from '../../config/constants';

afterEach(() => vi.useRealTimers());

function recordingIo() {
    const events: { event: string; data: Record<string, unknown> }[] = [];
    const io = { to: () => ({ emit: (event: string, data: Record<string, unknown>) => events.push({ event, data }) }) } as unknown as Server;
    return { io, events };
}

it('centers lava and rocks between the cannons instead of on the left half', () => {
    const terrain = generateTerrain({ seed: 7, width: WORLD_WIDTH });
    const neutral = { min: 820, max: 1580 };
    for (let seed = 0; seed < 60; seed++) {
        for (const hazard of generateHazards(terrain, seed, neutral)) {
            expect(hazard.type).not.toBe('wind_zone');
            expect(hazard.position.x).toBeGreaterThanOrEqual(neutral.min);
            expect(hazard.position.x + hazard.width).toBeLessThanOrEqual(neutral.max);
            expect(hazard.position.x + hazard.width / 2).toBeCloseTo((neutral.min + neutral.max) / 2);
        }
    }
});

it('rolls signed DDTank-style wind within range and builds a world-covering zone', () => {
    const values = Array.from({ length: 200 }, (_, i) => rollWind(() => (i + 0.5) / 200));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-WIND_MAX);
    expect(Math.max(...values)).toBeLessThanOrEqual(WIND_MAX);
    expect(values.every(v => Math.round(v * 10) === v * 10)).toBe(true);
    const zone = turnWindHazard(-3.2);
    expect(zone.windDirection).toBe(-1);
    expect(zone.windStrength).toBeCloseTo(3.2 * WIND_FORCE_PER_UNIT);
    expect(zone.position.y).toBeLessThan(-5000);
    expect(zone.position.x + zone.width).toBeGreaterThan(WORLD_WIDTH);
});

it('announces fresh wind every turn, stops the clock on fire and ignores hazard rocks when settling', () => {
    vi.useFakeTimers();
    const { io, events } = recordingIo();
    const world = Matter.World.create({});
    const rock = Matter.Bodies.circle(1200, 100, 12, { label: 'stone' });
    (rock as Matter.Body & { hazardRock?: boolean }).hazardRock = true;
    Matter.Body.setVelocity(rock, { x: 0, y: 8 }); Matter.Composite.add(world, rock);
    let roll = 0;
    const sm = new MatchStateMachine(io, 'wind', {
        onPhaseChange: vi.fn(), onTurnStart: vi.fn(), onMatchResult: vi.fn(), onRoundEnd: () => 'match_over',
        prepareTurn: () => ({ wind: ++roll }),
        getWorld: () => world, getKingState: () => ({ bodyId: 1, hp: 100, maxHp: 100, position: { x: 600, y: 400 } }),
    });
    try {
        sm.startCombatPhase();
        expect(events.filter(e => e.event === 'turn_start').map(e => e.data.wind)).toEqual([1]);
        sm.onProjectileFired(); sm.waitForSettle();
        expect(events.find(e => e.event === 'shot_fired')?.data.side).toBe('left');
        expect(sm.getStatus().endsAt).toBe(0);
        // A still-falling rock must not hold the turn hostage until the settle timeout.
        vi.advanceTimersByTime(800);
        expect(sm.getCurrentTurn()).toBe('right');
        expect(events.filter(e => e.event === 'turn_start').map(e => e.data.wind)).toEqual([1, 2]);
    } finally { sm.destroy(); }
});

it('pushes only projectiles with wind and keeps falling rocks capped and short-lived', () => {
    vi.useFakeTimers();
    const { io, events } = recordingIo();
    const session = new GameSession(io, 'wind-session', [
        { socketId: 'a', side: 'left', ready: true, name: 'A' },
        { socketId: 'b', side: 'right', ready: true, name: 'B' },
    ], 42);
    try {
        session.setHazards([{ type: 'falling_rocks', id: 'rocks', position: { x: 1100, y: 0 }, width: 200, height: 600 }]);
        session.getStateMachine().startCombatPhase();
        const wind = events.find(e => e.event === 'turn_start')?.data.wind;
        expect(typeof wind).toBe('number');
        expect(session.getWind()).toBe(wind);

        const rocks = () => Matter.Composite.allBodies(session.getWorld())
            .filter(body => (body as Matter.Body & { hazardRock?: boolean }).hazardRock);
        vi.advanceTimersByTime(FALLING_ROCK_INTERVAL_MS * (FALLING_ROCK_MAX + 4));
        expect(rocks().length).toBeLessThanOrEqual(FALLING_ROCK_MAX);
        const first = rocks()[0];
        vi.advanceTimersByTime(FALLING_ROCK_LIFESPAN_MS + 50);
        expect(rocks()).not.toContain(first);
    } finally { session.destroy(); }
});

it('explains rejected keys and rate limits without echoing provider messages', () => {
    const invalid = Object.assign(new Error('https://x?key=SECRET API key not valid'), {
        status: 400, errorDetails: [{ reason: 'API_KEY_INVALID' }],
    });
    const server = describeBuildFailure(invalid, false);
    expect(server.message).toMatch(/offline/);
    expect(server.log).toContain('API_KEY_INVALID');
    expect(server.log).not.toContain('SECRET');
    expect(describeBuildFailure(invalid, true).message).toMatch(/Your Gemini API key/);
    expect(describeBuildFailure(Object.assign(new Error('x'), { status: 429 }), false).message).toMatch(/busy/);
    expect(describeBuildFailure(new Error('boom'), false).message).toBe('AI generation failed. Please try again.');
});
