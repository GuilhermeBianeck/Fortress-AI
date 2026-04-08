import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Server } from 'socket.io';
import { RoomManager } from '../RoomManager';

// Suppress console.log during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

function createMockIo(): Server {
    const emitFn = vi.fn();
    const toFn = vi.fn(() => ({ emit: emitFn }));
    return {
        to: toFn,
        emit: emitFn,
        sockets: { sockets: new Map() },
    } as unknown as Server;
}

describe('RoomManager', () => {
    let io: Server;
    let rm: RoomManager;

    beforeEach(() => {
        io = createMockIo();
        rm = new RoomManager(io);
    });

    afterEach(() => {
        rm.destroy();
    });

    describe('room creation', () => {
        it('creates a room with a 6-character ID', () => {
            const room = rm.createRoom('socket-1', 'Alice');
            expect(room.id).toHaveLength(6);
            expect(room.players.size).toBe(1);
            expect(room.phase).toBe('lobby');
        });

        it('assigns host to left side', () => {
            const room = rm.createRoom('socket-1', 'Alice');
            const player = room.players.get('socket-1')!;
            expect(player.side).toBe('left');
            expect(player.name).toBe('Alice');
        });

        it('sanitizes player name (strips special chars, trims to 20)', () => {
            const room = rm.createRoom('socket-1', '  <script>alert("xss")</script>  ');
            const player = room.players.get('socket-1')!;
            expect(player.name).not.toContain('<');
            expect(player.name).not.toContain('>');
            expect(player.name.length).toBeLessThanOrEqual(20);
        });

        it('defaults name to Player 1 when no name given', () => {
            const room = rm.createRoom('socket-1');
            const player = room.players.get('socket-1')!;
            expect(player.name).toBe('Player 1');
        });

        it('generates unique room IDs', () => {
            const ids = new Set<string>();
            for (let i = 0; i < 20; i++) {
                const room = rm.createRoom(`socket-${i}`);
                ids.add(room.id);
            }
            expect(ids.size).toBe(20);
        });

        it('single-player mode adds a bot', () => {
            const room = rm.createRoom('socket-1', 'Alice', 'single');
            expect(room.players.size).toBe(2);

            const players = Array.from(room.players.values());
            const bot = players.find(p => p.name === 'Training Bot');
            expect(bot).toBeDefined();
            expect(bot!.side).toBe('right');
            expect(bot!.ready).toBe(true);
        });
    });

    describe('joining rooms', () => {
        it('second player joins as right side', () => {
            const room = rm.createRoom('socket-1', 'Alice');
            const joined = rm.joinRoom(room.id, 'socket-2', 'Bob');

            expect(joined).not.toBeNull();
            expect(joined!.players.size).toBe(2);
            const bob = joined!.players.get('socket-2')!;
            expect(bob.side).toBe('right');
        });

        it('rejects join when room is full', () => {
            const room = rm.createRoom('socket-1', 'Alice');
            rm.joinRoom(room.id, 'socket-2', 'Bob');

            const result = rm.joinRoom(room.id, 'socket-3', 'Charlie');
            expect(result).toBeNull();
        });

        it('rejects join for nonexistent room', () => {
            const result = rm.joinRoom('XXXXXX', 'socket-1');
            expect(result).toBeNull();
        });

        it('rejects join when match already started', () => {
            const room = rm.createRoom('socket-1', 'Alice');
            rm.joinRoom(room.id, 'socket-2', 'Bob');

            // Simulate match start by changing phase
            room.phase = 'build';

            const result = rm.joinRoom(room.id, 'socket-3', 'Charlie');
            expect(result).toBeNull();
        });
    });

    describe('matchmaking queue', () => {
        it('matches two queued players into a room', () => {
            rm.joinQueue('socket-1', 'Alice');
            rm.joinQueue('socket-2', 'Bob');

            const room = rm.tryMatchFromQueue();
            expect(room).not.toBeNull();
            expect(room!.players.size).toBe(2);
        });

        it('returns null when fewer than 2 players in queue', () => {
            rm.joinQueue('socket-1');
            expect(rm.tryMatchFromQueue()).toBeNull();
        });

        it('removes matched players from queue', () => {
            rm.joinQueue('socket-1');
            rm.joinQueue('socket-2');
            rm.tryMatchFromQueue();

            // Queue should be empty now
            expect(rm.getQueuePosition('socket-1')).toBe(-1);
            expect(rm.getQueuePosition('socket-2')).toBe(-1);
        });

        it('does not double-add the same player', () => {
            rm.joinQueue('socket-1');
            rm.joinQueue('socket-1');

            rm.joinQueue('socket-2');
            rm.tryMatchFromQueue();

            // If socket-1 was added twice, there'd be a leftover in queue
            expect(rm.getQueuePosition('socket-1')).toBe(-1);
        });

        it('leaveQueue removes player from queue', () => {
            rm.joinQueue('socket-1');
            expect(rm.getQueuePosition('socket-1')).toBe(0);

            rm.leaveQueue('socket-1');
            expect(rm.getQueuePosition('socket-1')).toBe(-1);
        });
    });

    describe('disconnect handling', () => {
        it('removes player from room on disconnect', () => {
            const room = rm.createRoom('socket-1', 'Alice');
            rm.handleDisconnect('socket-1');

            expect(room.players.size).toBe(0);
        });

        it('cleans up empty rooms', () => {
            const room = rm.createRoom('socket-1', 'Alice');
            const roomId = room.id;

            rm.handleDisconnect('socket-1');
            expect(rm.getRoomById(roomId)).toBeNull();
        });

        it('removes disconnecting player from queue', () => {
            rm.joinQueue('socket-1');
            rm.handleDisconnect('socket-1');
            expect(rm.getQueuePosition('socket-1')).toBe(-1);
        });

        it('emits forfeit when player disconnects mid-match', () => {
            const room = rm.createRoom('socket-1', 'Alice');
            rm.joinRoom(room.id, 'socket-2', 'Bob');

            // Start a session
            rm.setPlayerReady('socket-1');
            rm.setPlayerReady('socket-2');
            const session = rm.startMatch(room.id);
            expect(session).not.toBeNull();

            // Disconnect player-1 during active match
            rm.handleDisconnect('socket-1');

            // room should be in result phase
            expect(room.phase).toBe('result');

            // io.to(roomId).emit('match_result', ...) should have been called
            const emitFn = (io.to as any)().emit;
            const matchResultCalls = emitFn.mock.calls.filter(
                (c: any[]) => c[0] === 'match_result'
            );
            expect(matchResultCalls.length).toBeGreaterThan(0);
            expect(matchResultCalls[0][1].winner).toBe('right');
            expect(matchResultCalls[0][1].reason).toBe('opponent_disconnected');
        });

        it('notifies remaining player when opponent disconnects', () => {
            const room = rm.createRoom('socket-1', 'Alice');
            rm.joinRoom(room.id, 'socket-2', 'Bob');

            rm.handleDisconnect('socket-1');

            const emitFn = (io.to as any)().emit;
            const playerLeftCalls = emitFn.mock.calls.filter(
                (c: any[]) => c[0] === 'player_left'
            );
            expect(playerLeftCalls.length).toBeGreaterThan(0);
            expect(playerLeftCalls[0][1].side).toBe('left');
        });

        it('handles double disconnect gracefully', () => {
            rm.createRoom('socket-1');
            rm.handleDisconnect('socket-1');
            // Second disconnect should not throw
            expect(() => rm.handleDisconnect('socket-1')).not.toThrow();
        });

        it('handles disconnect of unknown socket gracefully', () => {
            expect(() => rm.handleDisconnect('nonexistent')).not.toThrow();
        });
    });

    describe('player ready and match start', () => {
        it('returns false when only one player is ready', () => {
            const room = rm.createRoom('socket-1');
            rm.joinRoom(room.id, 'socket-2');

            const allReady = rm.setPlayerReady('socket-1');
            expect(allReady).toBe(false);
        });

        it('returns true when both players are ready', () => {
            const room = rm.createRoom('socket-1');
            rm.joinRoom(room.id, 'socket-2');

            rm.setPlayerReady('socket-1');
            const allReady = rm.setPlayerReady('socket-2');
            expect(allReady).toBe(true);
        });

        it('starts match and creates GameSession', () => {
            const room = rm.createRoom('socket-1');
            rm.joinRoom(room.id, 'socket-2');

            const session = rm.startMatch(room.id);
            expect(session).not.toBeNull();
            expect(room.phase).toBe('build');
            expect(room.session).not.toBeNull();
        });

        it('rejects match start with only one player', () => {
            const room = rm.createRoom('socket-1');
            const session = rm.startMatch(room.id);
            expect(session).toBeNull();
        });

        it('initializes round tracking on match start', () => {
            const room = rm.createRoom('socket-1');
            rm.joinRoom(room.id, 'socket-2');
            rm.startMatch(room.id);

            expect(room.roundScore).toEqual({ left: 0, right: 0 });
            expect(room.currentRound).toBe(1);
        });
    });

    describe('rematch', () => {
        it('returns waiting when only one player requests', () => {
            const room = rm.createRoom('socket-1');
            rm.joinRoom(room.id, 'socket-2');
            rm.startMatch(room.id);
            room.phase = 'result';

            const result = rm.requestRematch('socket-1');
            expect(result).toBe('waiting');
        });

        it('returns null when not in result phase', () => {
            const room = rm.createRoom('socket-1');
            rm.joinRoom(room.id, 'socket-2');

            const result = rm.requestRematch('socket-1');
            expect(result).toBeNull();
        });

        it('auto-accepts rematch for bot players', () => {
            const room = rm.createRoom('socket-1', 'Alice', 'single');
            rm.startMatch(room.id);
            room.phase = 'result';

            // Human requests rematch — bot auto-accepts
            const result = rm.requestRematch('socket-1');
            expect(result).toBe('starting');
        });
    });

    describe('UUID registration', () => {
        it('accepts valid UUID v4', () => {
            rm.registerUuid('socket-1', '550e8400-e29b-41d4-a716-446655440000');
            expect(rm.getPlayerUuid('socket-1')).toBe('550e8400-e29b-41d4-a716-446655440000');
        });

        it('rejects invalid UUID format', () => {
            rm.registerUuid('socket-1', 'not-a-uuid');
            expect(rm.getPlayerUuid('socket-1')).toBeUndefined();
        });

        it('rejects empty UUID', () => {
            rm.registerUuid('socket-1', '');
            expect(rm.getPlayerUuid('socket-1')).toBeUndefined();
        });
    });

    describe('cleanup', () => {
        it('destroy clears all rooms and state', () => {
            rm.createRoom('socket-1');
            rm.createRoom('socket-2');
            rm.joinQueue('socket-3');

            rm.destroy();

            expect(rm.rooms.size).toBe(0);
            expect(rm.getQueuePosition('socket-3')).toBe(-1);
        });
    });
});
