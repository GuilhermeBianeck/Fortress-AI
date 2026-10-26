import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Matter from 'matter-js';
import type { Server, Socket } from 'socket.io';
import { RoomManager, RECONNECT_GRACE_MS } from '../RoomManager';
import { SHOT_FLIGHT_RATE } from '../../shared/shotPacing';

let manager: RoomManager;
let sockets: Map<string, Socket>;
function socket(id: string) {
    const result = { id, emit: vi.fn(), join: vi.fn(), disconnect: vi.fn() } as unknown as Socket;
    sockets.set(id, result); return result;
}
beforeEach(() => {
    vi.useFakeTimers(); vi.spyOn(console, 'log').mockImplementation(() => {});
    sockets = new Map();
    manager = new RoomManager({ to: () => ({ emit: vi.fn() }), sockets: { sockets } } as unknown as Server);
});
afterEach(() => { manager.destroy(); vi.useRealTimers(); vi.restoreAllMocks(); });
function battle(mode: 'single' | 'pvp' = 'single') {
    const a = socket('a'), identity = manager.authenticate(a, null);
    const room = manager.createRoom(a.id, 'Alice', mode, 'hard');
    let otherIdentity;
    if (mode === 'pvp') { const b = socket('b'); otherIdentity = manager.authenticate(b, null); manager.joinRoom(room.id, b.id, 'Bob'); }
    const session = manager.startMatch(room.id)!; session.getStateMachine().startBuildPhase();
    return { a, identity, otherIdentity, room, session };
}
it('waits for both returning humans, preserves the first pause clock, and restores rematch intent', () => {
    const { identity, otherIdentity, room, session } = battle('pvp');
    manager.handleTransportLoss('a'); const pausedAt = room.pausedAt;
    vi.advanceTimersByTime(3000); manager.handleTransportLoss('b'); expect(room.pausedAt).toBe(pausedAt);
    manager.authenticate(socket('a2'), identity); expect(session.isPaused()).toBe(true);
    manager.authenticate(socket('b2'), otherIdentity); expect(session.isPaused()).toBe(false);
    room.phase = 'result'; session.destroy(); manager.requestRematch('a2');
    manager.handleTransportLoss('a2'); manager.authenticate(socket('a3'), identity);
    expect(room.rematchRequests.has('a3')).toBe(true); expect(room.rematchRequests.has('a2')).toBe(false);
    expect(manager.requestRematch('b2')).toBe('starting');
});
it('does not let a one-client full sync consume metadata needed by the other client', () => {
    const { session } = battle('pvp');
    const loop = (session as unknown as { gameLoop: { getFullState: () => unknown; knownBodyIds: Set<number> } }).gameLoop;
    const before = new Set(loop.knownBodyIds); loop.getFullState();
    expect(loop.knownBodyIds).toEqual(before);
    session.handleSpawn('a', { x: 400, y: 200 }); loop.getFullState(); expect(loop.knownBodyIds).toEqual(before);
});
it('restores the same physical bodies, readiness, deadline and difficulty after reload', () => {
    const { identity, room, session } = battle();
    session.getStateMachine().handlePlayerBuildReady('a');
    const before = session.getFullState(), deadline = session.getStateMachine().getStatus().endsAt;
    manager.handleTransportLoss('a'); vi.advanceTimersByTime(12000);
    expect(session.getFullState().n).toEqual(before.n);
    const next = socket('next'); manager.authenticate(next, identity);
    expect(manager.getRoom('next')).toBe(room); expect(manager.getRoom('a')).toBeNull();
    expect(session.getStateMachine().getStatus().endsAt).toBe(deadline + 12000);
    expect(session.getStateMachine().getStatus().ready).toContain('next');
    expect(session.getFullState().n.map(b => (b as { id: number }).id)).toEqual(before.n.map(b => (b as { id: number }).id));
    const data = (vi.mocked(next.emit).mock.calls as [string, { difficulty: string; buildReady: boolean; pause: { paused: boolean } }][]).filter(c => c[0] === 'session_state').pop()![1];
    expect(data.difficulty).toBe('hard'); expect(data.buildReady).toBe(true); expect(data.pause.paused).toBe(false);
});
it('preserves fired ownership and projectile expiry without giving a second shot', () => {
    const { identity, session } = battle(); const sm = session.getStateMachine(); sm.startCombatPhase();
    const id = session.fireProjectile('left', 45, 10)!;
    const world = (session as unknown as { world: Matter.World }).world;
    manager.handleTransportLoss('a'); vi.advanceTimersByTime(15000);
    expect(Matter.Composite.get(world, id, 'body')).toBeTruthy();
    manager.authenticate(socket('new'), identity); expect(sm.canFire()).toBe(false);
    session.handleFireProjectile('new', { angle: 45, power: 10 });
    expect(session.getFullState().n.filter(b => (b as { label: string }).label === 'projectile')).toHaveLength(1);
    vi.advanceTimersByTime(Math.ceil(5000 / SHOT_FLIGHT_RATE)); expect(Matter.Composite.get(world, id, 'body')).toBeNull();
});
it('requires both humans to return and abandons both-absent rooms without rewards', () => {
    const { identity, room, session } = battle('pvp');
    const bIdentity = manager.store.authenticate(null);
    manager.handleTransportLoss('a'); manager.handleTransportLoss('b'); vi.advanceTimersByTime(3000);
    manager.authenticate(socket('a2'), identity); expect(session.isPaused()).toBe(true);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS); expect(room.phase).toBe('result');
    expect(manager.getProfile('a2')?.matchesWon).toBe(1);
    expect(manager.store.profile(bIdentity.id)?.matchesPlayed).toBe(0);
    const other = battle('pvp'); manager.handleTransportLoss('a'); manager.handleTransportLoss('b');
    vi.advanceTimersByTime(RECONNECT_GRACE_MS); expect(manager.getRoomById(other.room.id)).toBeNull();
});
it('limits cumulative grace, does not spend healthy takeover grace, and rejects a forged identity', () => {
    const { identity, room } = battle(); let id = 'a';
    manager.authenticate(socket('takeover'), identity); expect(room.graceUsed.size).toBe(0); id = 'takeover';
    const forged = socket('forged'); manager.authenticate(forged, { id: identity.id, token: 'x'.repeat(64) });
    expect(manager.getRoom(forged.id)).toBeNull();
    for (let i = 0; i < 3; i++) {
        manager.handleTransportLoss(id); vi.advanceTimersByTime(19000);
        const next = socket('rejoin' + i); manager.authenticate(next, identity); id = next.id;
    }
    manager.handleTransportLoss(id); expect(room.absences.get(id)!.deadline - Date.now()).toBe(3000);
    vi.advanceTimersByTime(3000); expect(manager.getRoomById(room.id)).toBeNull();
});
it('keeps reveal time and next-round intermission frozen', () => {
    const { identity, room, session } = battle(); session.getStateMachine().startRevealPhase();
    vi.advanceTimersByTime(1000); manager.handleTransportLoss('a'); vi.advanceTimersByTime(10000);
    manager.authenticate(socket('new'), identity); vi.advanceTimersByTime(3999); expect(room.phase).toBe('reveal');
    vi.advanceTimersByTime(1); expect(room.phase).toBe('combat');
    session.getPlayerBySide('right')!.kingState.hp = 0; session.getStateMachine().checkKingDefeat();
    expect(room.phase).toBe('intermission'); vi.advanceTimersByTime(1000); manager.handleTransportLoss('new');
    vi.advanceTimersByTime(10000); expect(room.session).toBe(session);
    manager.authenticate(socket('again'), identity); vi.advanceTimersByTime(2999); expect(room.session).toBe(session);
    vi.advanceTimersByTime(1); expect(room.session).not.toBe(session); expect(room.difficulty).toBe('hard');
});
