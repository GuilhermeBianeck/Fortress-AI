import { afterEach, describe, expect, it, vi } from 'vitest';
import Matter from 'matter-js';
import type { Server } from 'socket.io';
import { GameLoop } from '../loop';
import { SHOT_FLIGHT_RATE } from '../../shared/shotPacing';

describe('snapshot pacing', () => {
    afterEach(() => vi.useRealTimers());

    it('slows real flight while preserving exact Matter steps, normalized velocity and 20Hz delivery', () => {
        vi.useFakeTimers();
        const engine = Matter.Engine.create(), reference = Matter.Engine.create();
        engine.gravity.scale = reference.gravity.scale = 0;
        const ball = Matter.Bodies.circle(0, 0, 9, { label: 'projectile', frictionAir: 0.005 });
        const expected = Matter.Bodies.circle(0, 0, 9, { label: 'projectile', frictionAir: 0.005 });
        Matter.Composite.add(engine.world, ball); Matter.Composite.add(reference.world, expected);
        Matter.Body.setVelocity(ball, { x: 33, y: -12 }); Matter.Body.setVelocity(expected, { x: 33, y: -12 });
        const emit = vi.fn(), loop = new GameLoop(engine, { to: () => ({ emit }) } as unknown as Server, 'flight');
        const steps = vi.fn(); loop.setAfterTick(steps);
        try {
            loop.start(); vi.advanceTimersByTime(1000);
            expect(steps.mock.calls.length).toBe(Math.floor(62 * SHOT_FLIGHT_RATE));
            for (let i = 0; i < steps.mock.calls.length * 2; i++) Matter.Engine.update(reference, 1000 / 120);
            expect(ball.position.x).toBeCloseTo(expected.position.x, 8);
            expect(ball.position.y).toBeCloseTo(expected.position.y, 8);
            expect(ball.velocity.x).toBeCloseTo(expected.velocity.x, 8);
            expect(emit.mock.calls.length).toBeGreaterThanOrEqual(19);
            // At this pace a normal full-gap shot cannot vanish across the arena in a few frames.
            expect(ball.position.x).toBeGreaterThan(500); expect(ball.position.x).toBeLessThan(700);
            Matter.Composite.remove(engine.world, ball);
            const before = steps.mock.calls.length;
            vi.advanceTimersByTime(1000); expect(steps.mock.calls.length - before).toBeGreaterThanOrEqual(62);
        } finally { loop.stop(); Matter.Engine.clear(engine); Matter.Engine.clear(reference); }
    });

    it('sends authoritative projectile ownership in initial and full-sync metadata', () => {
        vi.useFakeTimers();
        const engine = Matter.Engine.create();
        engine.gravity.scale = 0;
        const ball = Matter.Bodies.circle(2100, 400, 9, { label: 'projectile' }) as Matter.Body & { side: 'right' };
        ball.side = 'right';
        Matter.Composite.add(engine.world, ball);
        const emit = vi.fn();
        const loop = new GameLoop(engine, { to: () => ({ emit }) } as unknown as Server, 'owner-room');
        try {
            loop.start(); vi.advanceTimersByTime(3200);
            const packets = emit.mock.calls.filter(call => call[0] === 'gameState').map(call => call[1]);
            expect(packets[0].n.find((body: { id: number }) => body.id === ball.id).side).toBe('right');
            const full = packets.find(packet => packet.f === 1);
            expect(full.n.find((body: { id: number }) => body.id === ball.id).side).toBe('right');
        } finally { loop.stop(); Matter.Engine.clear(engine); }
    });

    it('keeps a 20Hz deadline on 16ms simulation intervals instead of drifting to 15Hz', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
        const engine = Matter.Engine.create();
        const emit = vi.fn(), to = vi.fn<(roomId: string) => { emit: typeof emit }>(() => ({ emit }));
        const loop = new GameLoop(engine, { to } as unknown as Server, 'pacing-room');
        try {
            loop.start();
            vi.advanceTimersByTime(1000);
            const snapshots = emit.mock.calls.filter(call => call[0] === 'gameState');
            expect(snapshots.length).toBeGreaterThanOrEqual(19);
            expect(snapshots.length).toBeLessThanOrEqual(21);
            expect(to.mock.calls.every(call => call[0] === 'pacing-room')).toBe(true);
            const times = snapshots.map(call => call[1].t as number);
            for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeLessThanOrEqual(64);
        } finally {
            loop.stop();
            Matter.Engine.clear(engine);
        }
    });
});
