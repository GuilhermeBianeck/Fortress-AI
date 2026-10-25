import { Server } from 'socket.io';
import { GameSession } from './GameSession';
import { ScoreManager } from './ScoreManager';
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
    nextRoundTimer: ReturnType<typeof setTimeout> | null;
    scoreManager: ScoreManager;
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
    private playerProfiles: Map<string, PlayerProfile> = new Map(); // uuid → profile
    private socketUuids: Map<string, string> = new Map(); // socketId → uuid
    private matchmakingQueue: string[] = [];
    private queueNames: Map<string, string> = new Map(); // socketId → name
    private io: Server;
    private cleanupInterval: ReturnType<typeof setInterval>;

    constructor(io: Server) {
        this.io = io;

        // Periodic cleanup of empty/stale rooms
        this.cleanupInterval = setInterval(() => this.cleanupStaleRooms(), 60_000);
    }

    registerUuid(socketId: string, uuid: string): void {
        if (!uuid || typeof uuid !== 'string') return;
        // Validate UUID v4 format to prevent arbitrary key injection
        const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidV4Pattern.test(uuid)) return;
        this.socketUuids.set(socketId, uuid);
    }

    createRoom(hostSocketId: string, name?: string, mode: 'pvp' | 'single' = 'pvp'): Room {
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
            nextRoundTimer: null,
            scoreManager: new ScoreManager(),
        };

        const playerInfo: PlayerInfo = {
            socketId: hostSocketId,
            side: 'left',
            ready: false,
            name: (name?.trim().slice(0, 20).replace(/[^\w\s-]/g, '')) || 'Player 1',
        };

        room.players.set(hostSocketId, playerInfo);
        this.rooms.set(roomId, room);
        this.playerRoomMap.set(hostSocketId, roomId);

        // If single player, add a dummy bot immediately
        if (mode === 'single') {
            const botId = `bot-${Date.now()}`;
            const botInfo: PlayerInfo = {
                socketId: botId,
                side: 'right',
                ready: true, // Bot is always ready
                name: 'Training Bot',
            };
            room.players.set(botId, botInfo);
            // We map the bot ID too, so it gets cleaned up if we iterate players
            this.playerRoomMap.set(botId, roomId);
        }

        return room;
    }

    joinRoom(roomId: string, socketId: string, name?: string): Room | null {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        if (room.players.size >= 2) return null;
        if (room.phase !== 'lobby') return null;

        const playerInfo: PlayerInfo = {
            socketId,
            side: [...room.players.values()].some(player => player.side === 'left') ? 'right' : 'left',
            ready: false,
            name: (name?.trim().slice(0, 20).replace(/[^\w\s-]/g, '')) || 'Player 2',
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
        this.clearNextRound(room);
        if (room.phase === 'lobby') {
            for (const player of room.players.values()) player.ready = false;
        }

        // A bot is not a connected player. Stop abandoned solo simulations immediately.
        if (![...room.players.keys()].some(id => !id.startsWith('bot-'))) {
            this.disposeRoom(room);
            this.socketUuids.delete(socketId);
            return;
        }

        // If match was in progress, opponent wins by forfeit
        if (room.session && room.phase !== 'lobby' && room.phase !== 'result') {
            const remainingPlayer = Array.from(room.players.values())[0];
            if (remainingPlayer) {
                room.phase = 'result';
                room.session.handleForfeit();
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

        this.socketUuids.delete(socketId);
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
        room.scoreManager.reset();

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
        if (room.session) room.scoreManager.absorbRound(room.session.getScoreManager());
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
                const scores = room.scoreManager.computeScores(winner);
                this.io.to(room.id).emit('match_scores', scores);
                this.saveMatchResults(room, winner, scores);
            }
            return 'match_over';
        }

        // Start next round after interstitial
        room.currentRound++;
        room.nextRoundTimer = setTimeout(() => {
            room.nextRoundTimer = null;
            this.startNextRound(room);
        }, ROUND_INTERSTITIAL_MS);

        return 'continue';
    }

    private startNextRound(room: Room): void {
        if (this.rooms.get(room.id) !== room || !room.session || room.players.size !== 2 || room.phase !== 'intermission') return;

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
            playerSocket?.emit('match_started', { side: pInfo.side, kingsHp: session.getKingsHp(), currentRound: room.currentRound, roundScore: room.roundScore });
        }

        session.getStateMachine().startBuildPhase();
        console.log(`Round ${room.currentRound} started in room ${room.id}`);
    }

    requestRematch(socketId: string): 'waiting' | 'starting' | null {
        const room = this.getRoom(socketId);
        if (!room || room.phase !== 'result' || room.players.size !== 2) return null;

        const player = room.players.get(socketId);
        if (!player) return null;

        room.rematchRequests.add(socketId);

        // Auto-accept for bot players
        for (const [sid] of room.players) {
            if (sid.startsWith('bot-')) room.rematchRequests.add(sid);
        }

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
        this.clearNextRound(room);
        // Destroy old session
        room.session?.destroy();

        // Reset state
        room.rematchRequests.clear();
        room.roundScore = { left: 0, right: 0 };
        room.currentRound = 1;
        room.scoreManager.reset();
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
            playerSocket?.emit('match_started', { side: pInfo.side, kingsHp: session.getKingsHp(), currentRound: room.currentRound, roundScore: room.roundScore });
        }

        session.getStateMachine().startBuildPhase();
        console.log(`Rematch started in room ${room.id}`);
    }

    getQueuePosition(socketId: string): number {
        return this.matchmakingQueue.indexOf(socketId);
    }

    getPlayerUuid(socketId: string): string | undefined {
        return this.socketUuids.get(socketId);
    }

    getProfile(socketId: string): PlayerProfile | null {
        const uuid = this.socketUuids.get(socketId);
        if (uuid) return this.playerProfiles.get(uuid) ?? null;
        return null;
    }

    private getOrCreateProfile(socketId: string, name: string): PlayerProfile {
        const uuid = this.socketUuids.get(socketId) ?? socketId;
        let profile = this.playerProfiles.get(uuid);
        if (!profile) {
            profile = {
                name,
                totalScore: 0,
                matchesPlayed: 0,
                matchesWon: 0,
                history: [],
                uuid,
            };
            this.playerProfiles.set(uuid, profile);
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

    private clearNextRound(room: Room): void {
        if (room.nextRoundTimer !== null) clearTimeout(room.nextRoundTimer);
        room.nextRoundTimer = null;
    }

    private disposeRoom(room: Room): void {
        this.clearNextRound(room);
        room.session?.destroy();
        for (const id of room.players.keys()) {
            if (this.playerRoomMap.get(id) === room.id) this.playerRoomMap.delete(id);
            this.socketUuids.delete(id);
        }
        room.players.clear();
        room.rematchRequests.clear();
        this.rooms.delete(room.id);
    }

    private cleanupStaleRooms(): void {
        for (const room of this.rooms.values()) {
            if (![...room.players.keys()].some(id => !id.startsWith('bot-'))) this.disposeRoom(room);
        }
    }

    destroy(): void {
        clearInterval(this.cleanupInterval);
        for (const room of this.rooms.values()) {
            this.clearNextRound(room);
            room.session?.destroy();
        }
        this.rooms.clear();
        this.playerRoomMap.clear();
        this.matchmakingQueue = [];
    }
}
