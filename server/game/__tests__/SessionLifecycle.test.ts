import { describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';
import { RoomManager } from '../RoomManager';

describe('session resource cleanup', () => {
    it('periodic cleanup does not cancel a populated room next-round timer', () => {
        vi.useFakeTimers();
        const manager = new RoomManager({ to: () => ({ emit: vi.fn() }) } as unknown as Server);
        try {
            const room = manager.createRoom('human', 'Player', 'single');
            vi.advanceTimersByTime(58000);
            room.phase = 'intermission';
            const nextRound = vi.fn();
            room.nextRoundTimer = global.setTimeout(() => { nextRound(); }, 4000);
            vi.advanceTimersByTime(4000);
            expect(nextRound).toHaveBeenCalledOnce();
        } finally { manager.destroy(); vi.useRealTimers(); }
    });

    it('manager shutdown cancels pending next-round timers too', () => {
        vi.useFakeTimers();
        const manager = new RoomManager({ to: () => ({ emit: vi.fn() }) } as unknown as Server);
        const room = manager.createRoom('human', 'Player', 'single');
        room.nextRoundTimer = global.setTimeout(() => {}, 4000);
        manager.destroy();
        const timers = vi.getTimerCount();
        vi.useRealTimers();
        expect(timers).toBe(0);
    });

    it.each(['lobby', 'build', 'result'] as const)('removes a solo room and its timers when the human leaves during %s', phase => {
        vi.useFakeTimers();
        const emit = vi.fn();
        const manager = new RoomManager({ to: () => ({ emit }) } as unknown as Server);
        try {
            const room = manager.createRoom('human', 'Player', 'single');
            const botId = [...room.players.keys()].find(id => id.startsWith('bot-'))!;
            if (phase !== 'lobby') manager.startMatch(room.id);
            room.phase = phase;
            manager.handleDisconnect('human');
            expect(manager.rooms.has(room.id)).toBe(false);
            expect(manager.playerRoomMap.has(botId)).toBe(false);
            expect(manager.playerRoomMap.has('human')).toBe(false);
            expect(vi.getTimerCount()).toBe(1); // Only the manager's cleanup interval.
        } finally { manager.destroy(); vi.useRealTimers(); }
    });

    it('forfeiting a multiplayer match stops physics and hazards while preserving results', () => {
        vi.useFakeTimers();
        const emit = vi.fn();
        const manager = new RoomManager({ to: () => ({ emit }) } as unknown as Server);
        try {
            const room = manager.createRoom('left', 'Left');
            manager.joinRoom(room.id, 'right', 'Right');
            const session = manager.startMatch(room.id)!;
            session.getStateMachine().startCombatPhase();
            vi.advanceTimersByTime(100);
            manager.handleDisconnect('left');
            expect(manager.getRoomById(room.id)).toBe(room);
            expect(room.phase).toBe('result');
            expect(vi.getTimerCount()).toBe(1);
            const snapshots = emit.mock.calls.filter(call => call[0] === 'gameState').length;
            const kings = session.getKingsHp();
            vi.advanceTimersByTime(2000);
            expect(emit.mock.calls.filter(call => call[0] === 'gameState').length).toBe(snapshots);
            expect(session.getKingsHp()).toEqual(kings);
            expect(session.fireProjectile('right', Math.PI / 4, 50)).toBeUndefined();
        } finally { manager.destroy(); vi.useRealTimers(); }
    });

    it('repeated solo visits leave no orphan rooms or accumulating physics timers', () => {
        vi.useFakeTimers();
        const manager = new RoomManager({ to: () => ({ emit: vi.fn() }) } as unknown as Server);
        try {
            for (let i = 0; i < 12; i++) {
                const room = manager.createRoom(`human-${i}`, 'Player', 'single');
                manager.startMatch(room.id);
                manager.handleDisconnect(`human-${i}`);
            }
            expect(manager.rooms.size).toBe(0);
            expect(manager.playerRoomMap.size).toBe(0);
            expect(vi.getTimerCount()).toBe(1);
        } finally { manager.destroy(); vi.useRealTimers(); }
    });
});
