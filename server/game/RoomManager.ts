import { randomUUID } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import { GameSession } from './GameSession';
import { ScoreManager } from './ScoreManager';
import { ProfileStore, type Award, type Identity, type MatchRecord } from '../storage/ProfileStore';
import { botDifficulty, type BotDifficulty } from '../shared/difficulty';
import type { RewardKind } from '../shared/progression';
import type { PlayerInfo, MatchPhase, Side, MatchScores } from '../types';
import { ROUNDS_TO_WIN, ROUND_INTERSTITIAL_MS } from '../config/constants';

export const RECONNECT_GRACE_MS = 20_000;
export const MATCH_GRACE_BUDGET_MS = 60_000;
interface Absence { since: number; deadline: number; timer: ReturnType<typeof setTimeout> }
export interface Room {
    id: string; matchId: string; mode: 'single' | 'pvp'; difficulty: BotDifficulty;
    players: Map<string, PlayerInfo>; session: GameSession | null; phase: MatchPhase;
    rematchRequests: Set<string>; roundScore: { left: number; right: number }; currentRound: number;
    nextRoundTimer: ReturnType<typeof setTimeout> | null; nextRoundAt: number; nextRoundRemaining: number;
    scoreManager: ScoreManager; absences: Map<string, Absence>; graceUsed: Map<string, number>;
    chat: { id: string; sender: string; side: Side; text: string; timestamp: number }[];
    result: { winner: Side; reason: string } | null; scores: MatchScores | null; roundWinner: Side | null;
    saveStatus: 'idle' | 'pending' | 'saved';
    pausedAt: number | null;
}
function generateRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
const cleanName = (name: unknown, fallback: string) => typeof name === 'string' ? name.trim().slice(0, 20).replace(/[^\w\s-]/g, '') || fallback : fallback;

export class RoomManager {
    rooms = new Map<string, Room>();
    playerRoomMap = new Map<string, string>();
    private socketUuids = new Map<string, string>();
    private identitySockets = new Map<string, string>();
    private matchmakingQueue: string[] = [];
    private queueNames = new Map<string, string>();
    private pendingAwards = new Map<string, { awards: Award[]; metadata: MatchRecord; room: Room }>();
    private retryTimer: ReturnType<typeof setInterval>;
    private cleanupInterval: ReturnType<typeof setInterval>;
    private closed = false;
    constructor(private io: Server, readonly store = new ProfileStore()) {
        this.cleanupInterval = setInterval(() => this.cleanupStaleRooms(), 60_000);
        this.retryTimer = setInterval(() => this.retrySaves(), 5000);
    }

    authenticate(socket: Socket, credential: unknown): Identity {
        const identity = this.store.authenticate(credential);
        const oldId = this.identitySockets.get(identity.id);
        this.socketUuids.set(socket.id, identity.id);
        this.identitySockets.set(identity.id, socket.id);
        if (oldId && oldId !== socket.id) {
            this.leaveQueue(oldId);
            const room = this.getRoom(oldId);
            if (room) {
                const absent = room.absences.get(oldId);
                if (absent && Date.now() >= absent.deadline) this.expire(room, oldId);
                if (room.players.has(oldId)) {
                    const player = room.players.get(oldId)!;
                    if (absent) {
                        clearTimeout(absent.timer);
                        room.graceUsed.set(identity.id, (room.graceUsed.get(identity.id) ?? 0) + Date.now() - absent.since);
                        room.absences.delete(oldId);
                    }
                    room.players.delete(oldId); player.socketId = socket.id; room.players.set(socket.id, player);
                    this.playerRoomMap.delete(oldId); this.playerRoomMap.set(socket.id, room.id);
                    room.session?.rebindPlayer(oldId, socket.id);
                    if (room.rematchRequests.delete(oldId)) room.rematchRequests.add(socket.id);
                    socket.join(room.id);
                    if (!room.absences.size) this.resumeRoom(room, socket.id);
                }
            }
            this.socketUuids.delete(oldId);
            const oldSocket = this.io.sockets.sockets.get(oldId);
            oldSocket?.emit('identity_replaced');
            oldSocket?.disconnect(true);
        }
        socket.emit('identity', identity);
        this.sync(socket.id);
        return identity;
    }

    private ensureIdentity(socketId: string): void {
        if (socketId.startsWith('bot-') || this.socketUuids.has(socketId)) return;
        const identity = this.store.authenticate(null);
        this.socketUuids.set(socketId, identity.id); this.identitySockets.set(identity.id, socketId);
    }
    createRoom(host: string, name?: string, mode: 'pvp' | 'single' = 'pvp', difficulty?: unknown): Room {
        if (this.getRoom(host)) throw new Error('Leave your current room first.');
        if (this.pendingAwards.size) throw new Error('Progress saving is recovering. Please try again shortly.');
        this.ensureIdentity(host); this.leaveQueue(host);
        let id: string; do { id = generateRoomId(); } while (this.rooms.has(id));
        const room: Room = {
            id, matchId: randomUUID(), mode: mode === 'single' ? 'single' : 'pvp', difficulty: botDifficulty(difficulty),
            players: new Map(), session: null, phase: 'lobby', rematchRequests: new Set(),
            roundScore: { left: 0, right: 0 }, currentRound: 1, nextRoundTimer: null, nextRoundAt: 0, nextRoundRemaining: 0,
            scoreManager: new ScoreManager(), absences: new Map(), graceUsed: new Map(), chat: [], result: null, scores: null, roundWinner: null, saveStatus: 'idle', pausedAt: null,
        };
        room.players.set(host, { socketId: host, side: 'left', ready: false, name: cleanName(name, 'Player 1') });
        this.rooms.set(id, room); this.playerRoomMap.set(host, id);
        if (mode === 'single') {
            const botId = 'bot-' + randomUUID();
            room.players.set(botId, { socketId: botId, side: 'right', ready: true, name: 'Training Bot' });
            this.playerRoomMap.set(botId, id);
        }
        return room;
    }
    joinRoom(id: string, socketId: string, name?: string): Room | null {
        const room = this.rooms.get(id);
        if (!room || room.players.size >= 2 || room.phase !== 'lobby' || this.getRoom(socketId)) return null;
        this.ensureIdentity(socketId); this.leaveQueue(socketId);
        room.players.set(socketId, { socketId, side: [...room.players.values()].some(p => p.side === 'left') ? 'right' : 'left', ready: false, name: cleanName(name, 'Player 2') });
        this.playerRoomMap.set(socketId, id); return room;
    }
    joinQueue(id: string, name?: string): void {
        if (this.getRoom(id) || this.pendingAwards.size) return;
        this.ensureIdentity(id);
        if (!this.matchmakingQueue.includes(id)) { this.matchmakingQueue.push(id); this.queueNames.set(id, cleanName(name, 'Player')); }
    }
    leaveQueue(id: string): void { this.matchmakingQueue = this.matchmakingQueue.filter(s => s !== id); this.queueNames.delete(id); }
    tryMatchFromQueue(): Room | null {
        if (this.matchmakingQueue.length < 2 || this.pendingAwards.size) return null;
        const [a, b] = this.matchmakingQueue.splice(0, 2);
        const nameA = this.queueNames.get(a), nameB = this.queueNames.get(b);
        this.queueNames.delete(a); this.queueNames.delete(b);
        const room = this.createRoom(a, nameA); this.joinRoom(room.id, b, nameB); return room;
    }
    getQueuePosition(id: string) { return this.matchmakingQueue.indexOf(id); }
    getRoom(id: string) { return this.rooms.get(this.playerRoomMap.get(id) ?? '') ?? null; }
    getRoomById(id: string) { return this.rooms.get(id) ?? null; }
    getPlayerUuid(id: string) { return this.socketUuids.get(id); }
    getProfile(id: string) { const uuid = this.socketUuids.get(id); return uuid ? this.store.profile(uuid) : null; }
    history(id: string, cursor?: string, limit?: number) {
        const uuid = this.socketUuids.get(id); if (!uuid) throw new Error('Identity unavailable');
        return this.store.history(uuid, cursor, limit);
    }
    claim(id: string, kind: RewardKind): number {
        const uuid = this.socketUuids.get(id); if (!uuid || this.pendingAwards.size) throw new Error('Progress saving is recovering');
        const amount = this.store.claim(uuid, kind); this.io.to(id).emit('profile_update', this.getProfile(id)); return amount;
    }

    handleTransportLoss(id: string): void {
        this.leaveQueue(id);
        const room = this.getRoom(id);
        if (!room || room.absences.has(id)) return;
        const uuid = this.socketUuids.get(id)!;
        const remaining = MATCH_GRACE_BUDGET_MS - (room.graceUsed.get(uuid) ?? 0);
        if (room.pausedAt === null) room.pausedAt = Date.now();
        const duration = Math.max(0, Math.min(RECONNECT_GRACE_MS, remaining));
        room.absences.set(id, { since: Date.now(), deadline: Date.now() + duration, timer: setTimeout(() => this.expire(room, id), duration) });
        room.session?.pause();
        if (room.nextRoundTimer) {
            room.nextRoundRemaining = Math.max(0, room.nextRoundAt - Date.now()); this.clearNextRound(room);
        }
        this.io.to(room.id).emit('match_paused', this.pauseState(room));
    }
    private pauseState(room: Room) {
        return { paused: room.absences.size > 0, at: room.pausedAt ?? Date.now(), missing: [...room.absences].map(([id, a]) => ({ side: room.players.get(id)!.side, deadline: a.deadline })) };
    }
    private resumeRoom(room: Room, excludeId?: string): void {
        room.pausedAt = null;
        room.session?.resume();
        if (room.phase === 'intermission' && room.nextRoundRemaining > 0) this.scheduleNextRound(room, room.nextRoundRemaining);
        for (const id of room.players.keys()) if (id !== excludeId) this.sync(id);
    }
    private expire(room: Room, id: string): void {
        if (this.rooms.get(room.id) !== room || !room.absences.has(id)) return;
        const connectedHuman = [...room.players.keys()].some(s => !s.startsWith('bot-') && !room.absences.has(s));
        if (!connectedHuman) { this.disposeRoom(room); return; }
        this.handleDisconnect(id);
        if (this.rooms.has(room.id) && !room.absences.size) this.resumeRoom(room);
    }

    /** Explicit departure or expired grace; transport loss uses handleTransportLoss. */
    handleDisconnect(id: string): void {
        this.leaveQueue(id);
        const room = this.getRoom(id);
        if (!room) return;
        const player = room.players.get(id);
        const absence = room.absences.get(id); if (absence) clearTimeout(absence.timer);
        room.absences.delete(id); room.rematchRequests.delete(id); this.clearNextRound(room);
        const opponent = [...room.players.values()].find(p => p.socketId !== id);
        if (player && opponent && room.session && room.phase !== 'lobby' && room.phase !== 'result') {
            room.scoreManager.absorbRound(room.session.getScoreManager());
            room.phase = 'result'; room.roundScore[opponent.side] = ROUNDS_TO_WIN;
            room.result = { winner: opponent.side, reason: 'opponent_disconnected' };
            room.scores = room.scoreManager.computeScores(opponent.side);
            room.session.handleForfeit();
            this.saveMatchResults(room, opponent.side, room.scores, room.result.reason);
            this.io.to(room.id).emit('match_scores', room.scores);
            this.io.to(room.id).emit('match_result', { ...room.result, kings: room.session.getKingsHp() });
            this.io.to(room.id).emit('phase_change', { phase: 'result' });
        }
        room.players.delete(id); this.playerRoomMap.delete(id);
        if (room.phase === 'lobby') for (const p of room.players.values()) p.ready = p.socketId.startsWith('bot-');
        if (![...room.players.keys()].some(s => !s.startsWith('bot-'))) this.disposeRoom(room);
        else if (player) this.io.to(room.id).emit('player_left', { side: player.side, reason: 'disconnected' });
    }
    setPlayerReady(id: string): boolean {
        const room = this.getRoom(id), player = room?.players.get(id);
        if (!room || !player || room.absences.size || this.pendingAwards.size) return false;
        player.ready = true; return room.players.size === 2 && [...room.players.values()].every(p => p.ready);
    }
    canStartMatches(): boolean { return this.pendingAwards.size === 0; }
    startMatch(id: string): GameSession | null {
        const room = this.rooms.get(id);
        if (!room || room.phase !== 'lobby' || room.players.size !== 2 || room.absences.size || this.pendingAwards.size) return null;
        room.roundScore = { left: 0, right: 0 }; room.currentRound = 1; room.scoreManager.reset(); room.graceUsed.clear();
        return this.createSession(room);
    }
    private createSession(room: Room): GameSession {
        const session = new GameSession(this.io, room.id, [...room.players.values()], undefined,
            phase => { room.phase = phase; }, (winner, reason) => this.handleRoundEnd(room, winner, reason), room.difficulty);
        room.session = session; room.phase = 'build'; return session;
    }
    private handleRoundEnd(room: Room, winner: Side, reason: string): 'continue' | 'match_over' {
        room.scoreManager.absorbRound(room.session!.getScoreManager()); room.roundScore[winner]++; room.roundWinner = winner;
        const isFinalRound = room.roundScore[winner] >= ROUNDS_TO_WIN;
        this.io.to(room.id).emit('round_result', { winner, reason, roundScore: room.roundScore, currentRound: room.currentRound, isFinalRound });
        if (isFinalRound) {
            room.result = { winner, reason }; room.scores = room.scoreManager.computeScores(winner);
            this.io.to(room.id).emit('match_scores', room.scores); this.saveMatchResults(room, winner, room.scores, reason);
            return 'match_over';
        }
        room.currentRound++; this.scheduleNextRound(room, ROUND_INTERSTITIAL_MS); return 'continue';
    }
    private scheduleNextRound(room: Room, ms: number): void {
        room.nextRoundAt = Date.now() + ms; room.nextRoundRemaining = 0;
        room.nextRoundTimer = setTimeout(() => { room.nextRoundTimer = null; this.startNextRound(room); }, ms);
    }
    private startNextRound(room: Room): void {
        if (this.rooms.get(room.id) !== room || !room.session || room.players.size !== 2 || room.phase !== 'intermission' || room.absences.size) return;
        room.session.destroy(); room.roundWinner = null; this.createSession(room); this.sendMatchStarted(room);
    }
    sendMatchStarted(room: Room): void {
        this.io.to(room.id).emit('terrain', room.session!.getTerrainData());
        for (const [id, p] of room.players) this.io.sockets.sockets.get(id)?.emit('match_started', { side: p.side, kingsHp: room.session!.getKingsHp(), currentRound: room.currentRound, roundScore: room.roundScore, difficulty: room.difficulty });
        room.session!.getStateMachine().startBuildPhase();
    }
    requestRematch(id: string): 'waiting' | 'starting' | null {
        const room = this.getRoom(id);
        if (!room || room.phase !== 'result' || room.players.size !== 2 || room.absences.size || this.pendingAwards.size) return null;
        room.rematchRequests.add(id);
        for (const sid of room.players.keys()) if (sid.startsWith('bot-')) room.rematchRequests.add(sid);
        this.io.to(room.id).emit('rematch_requested', { side: room.players.get(id)!.side });
        if (room.rematchRequests.size >= 2) { this.startNewSession(room); return 'starting'; }
        return 'waiting';
    }
    startNewSession(room: Room): void {
        this.clearNextRound(room); room.session?.destroy(); room.rematchRequests.clear();
        room.roundScore = { left: 0, right: 0 }; room.currentRound = 1; room.scoreManager.reset(); room.graceUsed.clear();
        room.matchId = randomUUID(); room.result = null; room.scores = null; room.roundWinner = null; room.saveStatus = 'idle';
        for (const p of room.players.values()) p.ready = true;
        this.createSession(room); this.io.to(room.id).emit('rematch_start', {}); this.sendMatchStarted(room);
    }
    private saveMatchResults(room: Room, winner: Side, scores: MatchScores, reason: string): void {
        const timestamp = Date.now();
        const awards: Award[] = [...room.players].filter(([id]) => !id.startsWith('bot-')).map(([id, p]) => ({
            id: this.socketUuids.get(id)!, name: p.name,
            entry: { matchId: room.matchId, timestamp, opponentName: [...room.players.values()].find(o => o.side !== p.side)?.name ?? 'Unknown', side: p.side,
                won: p.side === winner, score: scores[p.side], rounds: { ...room.roundScore }, mode: room.mode, difficulty: room.difficulty, reason },
        }));
        const players = [...room.players.values()];
        const metadata: MatchRecord = { winner, reason, rounds: { ...room.roundScore }, mode: room.mode, difficulty: room.difficulty, scores,
            names: { left: players.find(p => p.side === 'left')?.name ?? 'Unknown', right: players.find(p => p.side === 'right')?.name ?? 'Unknown' } };
        room.saveStatus = 'pending'; this.pendingAwards.set(room.matchId, { awards, metadata, room }); this.retrySaves();
    }
    private retrySaves(): void {
        for (const [matchId, { awards, metadata, room }] of this.pendingAwards) {
            try {
                this.store.award(awards, metadata);
                const updates = awards.map(award => ({ award, profile: this.store.profile(award.id) }));
                this.pendingAwards.delete(matchId); room.saveStatus = 'saved';
                for (const { award, profile } of updates) {
                    const sid = this.identitySockets.get(award.id);
                    if (sid) { this.io.to(sid).emit('profile_update', profile); this.io.to(sid).emit('progress_saved', { status: 'saved' }); }
                }
            } catch (error) {
                console.error('Progress save failed; retry retained:', error instanceof Error ? error.message : 'storage error');
                for (const award of awards) {
                    const sid = this.identitySockets.get(award.id); if (sid) this.io.to(sid).emit('progress_saved', { status: 'pending' });
                }
            }
        }
    }
    sync(id: string): void {
        const socket = this.io.sockets.sockets.get(id); if (!socket) return;
        const room = this.getRoom(id), player = room?.players.get(id);
        if (!room || !player) { socket.emit('session_ready', { resumed: false }); return; }
        const status = room.session?.getStateMachine().getStatus();
        socket.emit('session_state', {
            roomId: room.id, matchId: room.matchId, side: player.side, mode: room.mode, difficulty: room.difficulty,
            players: [...room.players.values()].map(p => ({ side: p.side, name: p.name, ready: p.ready, connected: !room.absences.has(p.socketId) })),
            terrain: room.session?.getTerrainData() ?? null, state: room.session?.getFullState() ?? null,
            aim: room.session?.getAimState() ?? null,
            phase: room.phase, endsAt: status?.endsAt || null, turn: status?.turn ?? null, hasFired: status?.hasFired ?? false, wind: room.session?.getWind() ?? null,
            buildReady: status?.ready.includes(id) ?? false, roundScore: room.roundScore, currentRound: room.phase === 'intermission' ? room.currentRound - 1 : room.currentRound,
            buildInterrupted: room.session?.buildWasInterrupted(player.side) ?? false,
            roundWinner: room.roundWinner, result: room.result, scores: room.scores, chat: room.chat,
            rematch: room.rematchRequests.has(id) ? 'requested' : room.rematchRequests.size ? 'opponent_requested' : 'none',
            pause: this.pauseState(room), saveStatus: room.saveStatus,
        });
    }
    private clearNextRound(room: Room): void { if (room.nextRoundTimer !== null) clearTimeout(room.nextRoundTimer); room.nextRoundTimer = null; }
    private disposeRoom(room: Room): void {
        this.clearNextRound(room); room.session?.destroy();
        for (const a of room.absences.values()) clearTimeout(a.timer);
        for (const id of room.players.keys()) this.playerRoomMap.delete(id);
        room.players.clear(); room.absences.clear(); room.rematchRequests.clear(); this.rooms.delete(room.id);
    }
    private cleanupStaleRooms(): void {
        for (const room of this.rooms.values()) if (![...room.players.keys()].some(id => !id.startsWith('bot-'))) this.disposeRoom(room);
        for (const [uuid, id] of this.identitySockets) {
            if (!this.getRoom(id) && !this.io.sockets.sockets.has(id)) { this.identitySockets.delete(uuid); this.socketUuids.delete(id); }
        }
    }
    destroy(): void {
        if (this.closed) return; this.closed = true;
        clearInterval(this.cleanupInterval); clearInterval(this.retryTimer); this.retrySaves();
        for (const room of this.rooms.values()) this.disposeRoom(room);
        this.playerRoomMap.clear(); this.matchmakingQueue = []; this.queueNames.clear(); this.socketUuids.clear(); this.identitySockets.clear(); this.store.close();
    }
}
