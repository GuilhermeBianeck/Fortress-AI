import { afterEach, describe, expect, it, vi } from 'vitest';
import Matter from 'matter-js';
import type { Server } from 'socket.io';
import { GameLoop } from '../loop';

describe('snapshot pacing', () => {
    afterEach(() => vi.useRealTimers());

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
