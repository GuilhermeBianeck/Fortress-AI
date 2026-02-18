import { Server, Socket } from 'socket.io';
import { GameSession } from './GameSession';
import type { PlayerInfo, MatchPhase, Side, PlayerProfile, MatchHistoryEntry, MatchScores } from '../types';
import { ROUNDS_TO_WIN, ROUND_INTERSTITIAL_MS, MAX_MATCH_HISTORY } from '../config/constants';

export interface Room {
    id: string;
    players: Map<string, PlayerInfo>;
    session: GameSession | null;
    phase: MatchPhase;
    rematchRequests: Set<string>;
    roundScore: { left: number; right: number };
    currentRound: number;
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
    private playerProfiles: Map<string, PlayerProfile> = new Map(); // socketId → profile
    private matchmakingQueue: string[] = [];
    private queueNames: Map<string, string> = new Map(); // socketId → name
    private io: Server;
    private cleanupInterval: ReturnType<typeof setInterval>;

    constructor(io: Server) {
        this.io = io;

        // Periodic cleanup of empty/stale rooms
        this.cleanupInterval = setInterval(() => this.cleanupStaleRooms(), 60_000);
    }

    createRoom(hostSocketId: string, name?: string): Room {
        let roomId: string;
        do {
            roomId = generateRoomId();
        } while (this.rooms.has(roomId));

        const room: Room = {
            id: roomId,
            players: new Map(),
            session: null,
            phase: 'lobby',
            rematchRequests: new Set(),
            roundScore: { left: 0, right: 0 },
            currentRound: 1,
        };

        const playerInfo: PlayerInfo = {
            socketId: hostSocketId,
            side: 'left',
            ready: false,
            name: (name?.trim()) || 'Player 1',
        };

        room.players.set(hostSocketId, playerInfo);
        this.rooms.set(roomId, room);
        this.playerRoomMap.set(hostSocketId, roomId);

        return room;
    }

    joinRoom(roomId: string, socketId: string, name?: string): Room | null {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        if (room.players.size >= 2) return null;
        if (room.phase !== 'lobby') return null;

        const playerInfo: PlayerInfo = {
            socketId,
            side: 'right',
            ready: false,
            name: (name?.trim()) || 'Player 2',
        };

        room.players.set(socketId, playerInfo);
        this.playerRoomMap.set(socketId, roomId);

        return room;
    }

    joinQueue(socketId: string, name?: string): void {
        if (!this.matchmakingQueue.includes(socketId)) {
            this.matchmakingQueue.push(socketId);
            this.queueNames.set(socketId, (name?.trim()) || 'Player');
        }
    }

    leaveQueue(socketId: string): void {
        this.matchmakingQueue = this.matchmakingQueue.filter(id => id !== socketId);
        this.queueNames.delete(socketId);
    }

    tryMatchFromQueue(): Room | null {
        if (this.matchmakingQueue.length < 2) return null;

        const player1 = this.matchmakingQueue.shift()!;
        const player2 = this.matchmakingQueue.shift()!;
        const name1 = this.queueNames.get(player1) || 'Player 1';
        const name2 = this.queueNames.get(player2) || 'Player 2';
        this.queueNames.delete(player1);
        this.queueNames.delete(player2);

        const room = this.createRoom(player1, name1);
        this.joinRoom(room.id, player2, name2);

        return room;
    }

    handleDisconnect(socketId: string): void {
        // Remove from queue (also cleans up queueNames)
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

        // Clear rematch requests on disconnect
        room.rematchRequests.delete(socketId);

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

        room.roundScore = { left: 0, right: 0 };
        room.currentRound = 1;

        const playerInfos = Array.from(room.players.values());
        const session = new GameSession(this.io, roomId, playerInfos, undefined, (phase) => {
            room.phase = phase;
        }, (winner: Side, reason: string) => {
            return this.handleRoundEnd(room, winner, reason);
        });
        room.session = session;
        room.phase = 'build';

        return session;
    }

    private handleRoundEnd(room: Room, winner: Side, reason: string): 'continue' | 'match_over' {
        room.roundScore[winner]++;

        const isFinalRound = room.roundScore[winner] >= ROUNDS_TO_WIN;

        this.io.to(room.id).emit('round_result', {
            winner,
            reason,
            roundScore: room.roundScore,
            currentRound: room.currentRound,
            isFinalRound,
        });

        if (isFinalRound) {
            // Compute and emit match scores
            if (room.session) {
                const scores = room.session.computeMatchScores(winner);
                this.io.to(room.id).emit('match_scores', scores);
                this.saveMatchResults(room, winner, scores);
            }
            return 'match_over';
        }

        // Start next round after interstitial
        room.currentRound++;
        setTimeout(() => {
            this.startNextRound(room);
        }, ROUND_INTERSTITIAL_MS);

        return 'continue';
    }

    private startNextRound(room: Room): void {
        if (!room.session || room.players.size !== 2) return;

        // Destroy old session
        room.session.destroy();

        const playerInfos = Array.from(room.players.values());
        const session = new GameSession(this.io, room.id, playerInfos, undefined, (phase) => {
            room.phase = phase;
        }, (winner: Side, reason: string) => {
            return this.handleRoundEnd(room, winner, reason);
        });
        room.session = session;
        room.phase = 'build';

        this.io.to(room.id).emit('terrain', session.getTerrainData());

        for (const [sid, pInfo] of room.players.entries()) {
            const playerSocket = this.io.sockets.sockets.get(sid);
            playerSocket?.emit('match_started', { side: pInfo.side });
        }

        session.getStateMachine().startBuildPhase();
        console.log(`Round ${room.currentRound} started in room ${room.id}`);
    }

    requestRematch(socketId: string): 'waiting' | 'starting' | null {
        const room = this.getRoom(socketId);
        if (!room || room.phase !== 'result') return null;

        const player = room.players.get(socketId);
        if (!player) return null;

        room.rematchRequests.add(socketId);

        // Notify everyone about the request
        this.io.to(room.id).emit('rematch_requested', { side: player.side });

        // Check if both players requested
        if (room.rematchRequests.size >= 2) {
            // Start new match
            this.startNewSession(room);
            return 'starting';
        }

        return 'waiting';
    }

    startNewSession(room: Room): void {
        // Destroy old session
        room.session?.destroy();

        // Reset state
        room.rematchRequests.clear();
        room.roundScore = { left: 0, right: 0 };
        room.currentRound = 1;
        for (const p of room.players.values()) {
            p.ready = true;
        }

        const playerInfos = Array.from(room.players.values());
        const session = new GameSession(this.io, room.id, playerInfos, undefined, (phase) => {
            room.phase = phase;
        }, (winner: Side, reason: string) => {
            return this.handleRoundEnd(room, winner, reason);
        });
        room.session = session;
        room.phase = 'build';

        // Send events
        this.io.to(room.id).emit('rematch_start', {});
        this.io.to(room.id).emit('terrain', session.getTerrainData());

        for (const [sid, pInfo] of room.players.entries()) {
            const playerSocket = this.io.sockets.sockets.get(sid);
            playerSocket?.emit('match_started', { side: pInfo.side });
        }

        session.getStateMachine().startBuildPhase();
        console.log(`Rematch started in room ${room.id}`);
    }

    getQueuePosition(socketId: string): number {
        return this.matchmakingQueue.indexOf(socketId);
    }

    getProfile(socketId: string): PlayerProfile | null {
        return this.playerProfiles.get(socketId) ?? null;
    }

    private getOrCreateProfile(socketId: string, name: string): PlayerProfile {
        let profile = this.playerProfiles.get(socketId);
        if (!profile) {
            profile = {
                name,
                totalScore: 0,
                matchesPlayed: 0,
                matchesWon: 0,
                history: [],
            };
            this.playerProfiles.set(socketId, profile);
        }
        profile.name = name;
        return profile;
    }

    private saveMatchResults(room: Room, winner: Side, scores: MatchScores): void {
        for (const [socketId, playerInfo] of room.players.entries()) {
            const side = playerInfo.side;
            const opponentInfo = Array.from(room.players.values()).find(p => p.side !== side);
            const opponentName = opponentInfo?.name || 'Unknown';
            const score = scores[side];
            const won = side === winner;

            const profile = this.getOrCreateProfile(socketId, playerInfo.name);
            profile.totalScore += score.totalScore;
            profile.matchesPlayed++;
            if (won) profile.matchesWon++;

            const historyEntry: MatchHistoryEntry = {
                matchId: room.id,
                timestamp: Date.now(),
                opponentName,
                side,
                won,
                score,
                rounds: { ...room.roundScore },
            };

            profile.history.unshift(historyEntry);
            if (profile.history.length > MAX_MATCH_HISTORY) {
                profile.history = profile.history.slice(0, MAX_MATCH_HISTORY);
            }

            // Emit updated profile to the player
            const playerSocket = this.io.sockets.sockets.get(socketId);
            playerSocket?.emit('profile_update', profile);
        }
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
