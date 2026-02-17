import { Server, Socket } from 'socket.io';
import { GameSession } from './GameSession';
import type { PlayerInfo, MatchPhase } from '../types';

export interface Room {
    id: string;
    players: Map<string, PlayerInfo>;
    session: GameSession | null;
    phase: MatchPhase;
}

function generateRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for clarity
    let id = '';
    for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

export class RoomManager {
    rooms: Map<string, Room> = new Map();
    playerRoomMap: Map<string, string> = new Map(); // socketId → roomId
    private matchmakingQueue: string[] = [];
    private io: Server;
    private cleanupInterval: ReturnType<typeof setInterval>;

    constructor(io: Server) {
        this.io = io;

        // Periodic cleanup of empty/stale rooms
        this.cleanupInterval = setInterval(() => this.cleanupStaleRooms(), 60_000);
    }

    createRoom(hostSocketId: string): Room {
        let roomId: string;
        do {
            roomId = generateRoomId();
        } while (this.rooms.has(roomId));

        const room: Room = {
            id: roomId,
            players: new Map(),
            session: null,
            phase: 'lobby',
        };

        const playerInfo: PlayerInfo = {
            socketId: hostSocketId,
            side: 'left',
            ready: false,
        };

        room.players.set(hostSocketId, playerInfo);
        this.rooms.set(roomId, room);
        this.playerRoomMap.set(hostSocketId, roomId);

        return room;
    }

    joinRoom(roomId: string, socketId: string): Room | null {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        if (room.players.size >= 2) return null;
        if (room.phase !== 'lobby') return null;

        const playerInfo: PlayerInfo = {
            socketId,
            side: 'right',
            ready: false,
        };

        room.players.set(socketId, playerInfo);
        this.playerRoomMap.set(socketId, roomId);

        return room;
    }

    joinQueue(socketId: string): void {
        if (!this.matchmakingQueue.includes(socketId)) {
            this.matchmakingQueue.push(socketId);
        }
    }

    leaveQueue(socketId: string): void {
        this.matchmakingQueue = this.matchmakingQueue.filter(id => id !== socketId);
    }

    tryMatchFromQueue(): Room | null {
        if (this.matchmakingQueue.length < 2) return null;

        const player1 = this.matchmakingQueue.shift()!;
        const player2 = this.matchmakingQueue.shift()!;

        const room = this.createRoom(player1);
        this.joinRoom(room.id, player2);

        return room;
    }

    handleDisconnect(socketId: string): void {
        // Remove from queue
        this.leaveQueue(socketId);

        const roomId = this.playerRoomMap.get(socketId);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        if (!room) {
            this.playerRoomMap.delete(socketId);
            return;
        }

        const playerInfo = room.players.get(socketId);
        room.players.delete(socketId);
        this.playerRoomMap.delete(socketId);

        // If match was in progress, opponent wins by forfeit
        if (room.session && room.phase !== 'lobby' && room.phase !== 'result') {
            const remainingPlayer = Array.from(room.players.values())[0];
            if (remainingPlayer) {
                room.phase = 'result';
                room.session.handleForfeit(socketId);
                this.io.to(roomId).emit('match_result', {
                    winner: remainingPlayer.side,
                    reason: 'opponent_disconnected',
                    kings: room.session.getKingsHp(),
                });
                this.io.to(roomId).emit('phase_change', { phase: 'result' });
            }
        }

        // Notify remaining player
        if (playerInfo) {
            this.io.to(roomId).emit('player_left', {
                side: playerInfo.side,
                reason: 'disconnected',
            });
        }

        // Clean up empty rooms
        if (room.players.size === 0) {
            room.session?.destroy();
            this.rooms.delete(roomId);
        }
    }

    getRoom(socketId: string): Room | null {
        const roomId = this.playerRoomMap.get(socketId);
        if (!roomId) return null;
        return this.rooms.get(roomId) ?? null;
    }

    getRoomById(roomId: string): Room | null {
        return this.rooms.get(roomId) ?? null;
    }

    setPlayerReady(socketId: string): boolean {
        const room = this.getRoom(socketId);
        if (!room) return false;

        const player = room.players.get(socketId);
        if (!player) return false;

        player.ready = true;

        // Check if all players ready
        if (room.players.size === 2) {
            const allReady = Array.from(room.players.values()).every(p => p.ready);
            return allReady;
        }

        return false;
    }

    startMatch(roomId: string): GameSession | null {
        const room = this.rooms.get(roomId);
        if (!room || room.players.size !== 2) return null;

        const playerInfos = Array.from(room.players.values());
        const session = new GameSession(this.io, roomId, playerInfos, undefined, (phase) => {
            room.phase = phase;
        });
        room.session = session;
        room.phase = 'build';

        return session;
    }

    getQueuePosition(socketId: string): number {
        return this.matchmakingQueue.indexOf(socketId);
    }

    private cleanupStaleRooms(): void {
        for (const [roomId, room] of this.rooms.entries()) {
            if (room.players.size === 0) {
                room.session?.destroy();
                this.rooms.delete(roomId);
            }
        }
    }

    destroy(): void {
        clearInterval(this.cleanupInterval);
        for (const room of this.rooms.values()) {
            room.session?.destroy();
        }
        this.rooms.clear();
        this.playerRoomMap.clear();
        this.matchmakingQueue = [];
    }
}
