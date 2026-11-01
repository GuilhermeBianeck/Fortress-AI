import { afterEach, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';
import Matter from 'matter-js';
import { AimPreviewState } from '../AimPreview';
import { GameSession } from '../GameSession';

afterEach(() => vi.useRealTimers());
const input = (state: AimPreviewState, extra = {}) => ({ epoch: state.state().epoch, angle: Math.PI / 3, power: 60, charging: true, ...extra });


it('validates finite, bounded cosmetic input and stamps identity and sequence itself', () => {
    const state = new AimPreviewState();
    for (const value of [null, [], 'x', input(state, { angle: NaN }), input(state, { power: Infinity }),
        input(state, { angle: 0 }), input(state, { angle: Math.PI }), input(state, { power: 101 }),
        input(state, { power: 0 }), input(state, { charging: 'true' }), input(state, { epoch: 'old' })]) {
        expect(state.accept(value, 'left', 100)).toBeNull();
    }
    const result = state.accept(input(state, { side: 'right', sequence: 999 }), 'left', 100)!;
    expect(result.preview).toMatchObject({ side: 'left', sequence: 1, angle: Math.PI / 3, power: 60, charging: true });
    result.preview!.power = 0;
    expect(state.state().preview!.power).toBe(60);
});

it('bounds ordinary traffic to10Hz, permits immediate cancel, rejects stale epochs', () => {
    const state = new AimPreviewState();
    let accepted = 0;
    for (let now = 0; now < 1000; now++) if (state.accept(input(state), 'right', now)) accepted++;
    expect(accepted).toBe(10);
    expect(state.accept(input(state, { charging: false }), 'right', 999)?.preview?.charging).toBe(false);
    expect(state.accept(input(state, { charging: false }), 'right', 999)).toBeNull();
    expect(state.accept(input(state), 'right', 999)).toBeNull();
    const old = input(state);
    state.reset();
    expect(state.state().preview).toBeNull();
    expect(state.accept(old, 'right', 2000)).toBeNull();
});

it('enforces authenticated turn ownership and clears preparation on pause, shot and destruction', () => {
    vi.useFakeTimers();
    const events: { room: string; event: string; data: unknown }[] = [];
    const io = { to: (room: string) => ({ emit: (event: string, data: unknown) => events.push({ room, event, data }) }) } as unknown as Server;
    const session = new GameSession(io, 'aim-test', [
        { socketId: 'a', side: 'left', ready: true, name: 'A' }, { socketId: 'b', side: 'right', ready: true, name: 'B' },
    ], 42);
    const send = (socket = 'a', extra = {}) => session.handleAimPreview(socket, { epoch: session.getAimState().epoch, angle: Math.PI / 4, power: 50, charging: true, ...extra });
    try {
        send(); expect(session.getAimState().preview).toBeNull();
        session.getStateMachine().startCombatPhase();
        const bodies = Matter.Composite.allBodies(session.getWorld()).length;
        send('b'); send('forged'); expect(session.getAimState().preview).toBeNull();
        send('a', { side: 'right' }); expect(session.getAimState().preview?.side).toBe('left');
        expect(Matter.Composite.allBodies(session.getWorld()).length).toBe(bodies);
        const epoch = session.getAimState().epoch;
        session.pause(); send(); expect(session.getAimState().preview).toBeNull();
        session.resume(); send('a', { epoch }); expect(session.getAimState().preview).toBeNull();
        send(); expect(session.getAimState().preview?.charging).toBe(true);
        session.getStateMachine().startTurn('right');
        expect(session.getAimState().preview).toBeNull();
        send('a'); expect(session.getAimState().preview).toBeNull();
        send('b'); expect(session.getAimState().preview?.side).toBe('right');
        session.handleFireProjectile('b', { angle: Math.PI / 4, power: 50 });
        send('b'); expect(session.getAimState().preview).toBeNull();
        expect(events.filter(event => event.event === 'aim_preview').every(event => event.room === 'aim-test')).toBe(true);
    } finally { session.destroy(); }
    expect(session.getAimState().preview).toBeNull();
});
