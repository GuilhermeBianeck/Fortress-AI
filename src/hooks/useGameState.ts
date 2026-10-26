import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState, TerrainData, BuildStatus, MaterialType, ShapeType, Side, MatchPhase, RoomState, KingHpState, ChatMessage, MatchScores, PlayerProfile, CompactGameState, BodyState } from '../types';
import { debugStats, debugVisible } from '../debug/debugStats';
import { track, setAnalyticsIdentity } from '../analytics/tracker';
import { reconstructGameState } from './gameStateSnapshot';
import { readStorage, writeStorage } from './browserStorage';
import type { BotDifficulty } from '../../server/shared/difficulty';
import type { SessionState, PauseState, RewardKind } from '../types';
import type { KingDamageEvent, ProjectileImpactEvent, BlockDestroyedEvent } from '../types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

const IDENTITY_KEY = 'fortress_identity_v12';
const ROOM_HINT = 'fortress_resume_room';
let identity: { id: string; token: string } | null = (() => {
    try { const value = JSON.parse(readStorage(IDENTITY_KEY) || 'null'); return typeof value?.id === 'string' && typeof value?.token === 'string' ? value : null; }
    catch { return null; }
})();

export const useGameState = () => {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [terrain, setTerrain] = useState<TerrainData | null>(null);
    const [buildStatus, setBuildStatus] = useState<BuildStatus>({ status: 'idle', message: '' });
    const [kingsHp, setKingsHp] = useState<{ left: KingHpState; right: KingHpState }>({
        left: { hp: 100, maxHp: 100, x: 0 },
        right: { hp: 100, maxHp: 100, x: 0 },
    });

    // Room/match state
    const [roomState, setRoomState] = useState<RoomState | null>(null);
    const [phase, setPhase] = useState<MatchPhase>('lobby');
    const [phaseEndsAt, setPhaseEndsAt] = useState<number | null>(null);
    const [turnPlayer, setTurnPlayer] = useState<Side | null>(null);
    const [matchResult, setMatchResult] = useState<{ winner: Side; reason: string } | null>(null);
    const [queuePosition, setQueuePosition] = useState<number | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [rematchState, setRematchState] = useState<'none' | 'requested' | 'opponent_requested'>('none');
    const [roundScore, setRoundScore] = useState<{ left: number; right: number }>({ left: 0, right: 0 });
    const [currentRound, setCurrentRound] = useState(1);
    const [roundWinner, setRoundWinner] = useState<Side | null>(null);
    const [hazards, setHazards] = useState<{ type: string; id: string; position: { x: number; y: number }; width: number; height: number; windDirection?: number; windStrength?: number }[]>([]);
    const [matchScores, setMatchScores] = useState<MatchScores | null>(null);
    const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
    const [prevPlayerProfile, setPrevPlayerProfile] = useState<PlayerProfile | null>(null);
    const playerProfileRef = useRef<PlayerProfile | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
    const [identityReplaced, setIdentityReplaced] = useState(false);
    const [lobbyError, setLobbyError] = useState<string | null>(null);
    const hadRoomRef = useRef(Boolean(readStorage(ROOM_HINT)));
    const activeRef = useRef(false);
    const pausedRef = useRef(false);
    const [pauseState, setPauseState] = useState<PauseState>({ paused: false, at: 0, missing: [] });
    const [syncRevision, setSyncRevision] = useState(0);
    const [serverHasFired, setServerHasFired] = useState(false);
    const [wind, setWind] = useState<number | null>(null);
    const [progressStatus, setProgressStatus] = useState<'idle' | 'pending' | 'saved'>('idle');
    const [rewardNotice, setRewardNotice] = useState<string | null>(null);
    const rematchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const buildStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const socketRef = useRef<Socket | null>(null);
    const mySideRef = useRef<Side>('left');
    const mountedRef = useRef(true);

    // Body metadata cache for delta-encoded state reconstruction
    const bodyCacheRef = useRef<Map<number, BodyState>>(new Map());

    // StrictMode replays setup after cleanup with the same refs.
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // Callback refs for canvas effects
    const blockDestroyedCbRef = useRef<((data: BlockDestroyedEvent) => void) | null>(null);
    const projectileImpactCbRef = useRef<((data: ProjectileImpactEvent) => void) | null>(null);
    const kingDamageCbRef = useRef<((data: KingDamageEvent) => void) | null>(null);

    const resetMatch = useCallback(() => {
        if (buildStatusTimerRef.current) clearTimeout(buildStatusTimerRef.current);
        buildStatusTimerRef.current = null;
        if (rematchTimerRef.current) clearTimeout(rematchTimerRef.current);
        rematchTimerRef.current = null;
        bodyCacheRef.current.clear();
        setGameState(null);
        setTerrain(null);
        setBuildStatus({ status: 'idle', message: '' });
        setKingsHp({ left: { hp: 100, maxHp: 100, x: 0 }, right: { hp: 100, maxHp: 100, x: 0 } });
        setRoomState(null);
        setPhase('lobby');
        setPhaseEndsAt(null);
        setTurnPlayer(null);
        setWind(null);
        setMatchResult(null);
        setQueuePosition(null);
        setChatMessages([]);
        setRematchState('none');
        setRoundScore({ left: 0, right: 0 });
        setCurrentRound(1);
        setRoundWinner(null);
        setHazards([]);
        setMatchScores(null);
        pausedRef.current = false; setPauseState({ paused: false, at: 0, missing: [] });
        setServerHasFired(false); setLobbyError(null);
    }, []);

    useEffect(() => {
        const updateBuildStatus = (status: BuildStatus, clearAfter?: number) => {
            if (buildStatusTimerRef.current) clearTimeout(buildStatusTimerRef.current);
            buildStatusTimerRef.current = null; setBuildStatus(status);
            if (clearAfter) buildStatusTimerRef.current = setTimeout(() => {
                buildStatusTimerRef.current = null; setBuildStatus({ status: 'idle', message: '' });
            }, clearAfter);
        };
        socketRef.current = io(SERVER_URL, {
            auth: callback => callback({ protocol: 12, identity }),
            // Match server: websocket-only, skip polling overhead
            transports: ['websocket'],
            // Reconnect aggressively for real-time game
            reconnectionDelay: 500,
            reconnectionDelayMax: 2000,
        });

        socketRef.current.on('connect', () => {
            activeRef.current = false; setIsConnected(false);
        });
        socketRef.current.on('identity', (value: { id: string; token: string }) => {
            identity = value;
            setAnalyticsIdentity(value.id);
            if (!writeStorage(IDENTITY_KEY, JSON.stringify(value))) setConnectionNotice('Browser storage is unavailable. Keep this tab open to preserve your player identity.');
        });
        socketRef.current.on('session_ready', () => {
            setQueuePosition(null);
            if (hadRoomRef.current) {
                resetMatch();
                setConnectionNotice('Your previous battle is no longer available: its reconnect time expired or the server restarted. Saved progression is retained.');
            }
            hadRoomRef.current = false; writeStorage(ROOM_HINT, null);
            pausedRef.current = false; activeRef.current = true; setIsConnected(true);
            socketRef.current?.emit('get_profile');
        });
        socketRef.current.on('session_state', (data: SessionState) => {
            const me = data.players.find(p => p.side === data.side)!;
            const opponent = data.players.find(p => p.side !== data.side);
            bodyCacheRef.current.clear();
            if (data.state) {
                const snapshot = reconstructGameState(bodyCacheRef.current, data.state);
                bodyCacheRef.current = snapshot.bodyCache; setGameState(snapshot.gameState); setKingsHp(snapshot.gameState.kings);
            } else setGameState(null);
            mySideRef.current = data.side;
            setRoomState({ roomId: data.roomId, side: data.side, phase: data.phase, myName: me.name,
                opponentName: opponent?.name ?? '', opponentConnected: opponent?.connected ?? false,
                mode: data.mode, difficulty: data.difficulty, ready: me.ready, buildReady: data.buildReady });
            setTerrain(data.terrain); setHazards(data.terrain?.hazards ?? []);
            setPhase(data.phase); setPhaseEndsAt(data.endsAt); setTurnPlayer(data.turn);
            setServerHasFired(data.hasFired); setWind(data.wind ?? null); setRoundScore(data.roundScore); setCurrentRound(data.currentRound);
            setRoundWinner(data.roundWinner); setMatchResult(data.result); setMatchScores(data.scores);
            setChatMessages(data.chat); setRematchState(data.rematch); setProgressStatus(data.saveStatus);
            setPauseState(data.pause); pausedRef.current = data.pause.paused;
            updateBuildStatus(data.buildInterrupted ? { status: 'error', message: 'Your AI build was interrupted. Submit the prompt again when ready.' } : { status: 'idle', message: '' }); setQueuePosition(null);
            hadRoomRef.current = true; writeStorage(ROOM_HINT, data.roomId);
            setSyncRevision(value => value + 1); activeRef.current = true; setIsConnected(true);
            setConnectionNotice(null); socketRef.current?.emit('get_profile');
        });
        socketRef.current.on('match_paused', (data: PauseState) => {
            pausedRef.current = data.paused; setPauseState(data);
            updateBuildStatus({ status: 'idle', message: '' });
        });
        socketRef.current.on('identity_replaced', () => {
            setIdentityReplaced(true);
            activeRef.current = false; socketRef.current?.io.reconnection(false);
            socketRef.current?.disconnect(); resetMatch(); hadRoomRef.current = false;
            setIsConnected(true);
            setConnectionNotice('This player is active in another tab. Close this tab, or reload to take control here.');
        });
        socketRef.current.on('progress_saved', (data: { status: 'pending' | 'saved' }) => setProgressStatus(data.status));
        socketRef.current.on('profile_error', (data: { message: string }) => setConnectionNotice(data.message));
        socketRef.current.on('connect_error', () => { activeRef.current = false; setIsConnected(false); });

        // --- Game state (compact delta-encoded format) ---

        socketRef.current.on('gameState', (data: CompactGameState) => {
            if (!mountedRef.current) return;
            if (!activeRef.current || pausedRef.current) return;
            // Debug network stats (zero cost when overlay hidden)
            if (debugVisible) debugStats.recordSnapshot(data.t, data);

            const snapshot = reconstructGameState(bodyCacheRef.current, data);
            bodyCacheRef.current = snapshot.bodyCache;
            setGameState(snapshot.gameState);
            const { kings } = snapshot.gameState;

            // Only update kingsHp state if HP values actually changed.
            // Position (x/y) changes every frame but is consumed via refs in GameCanvas,
            // so we skip updates that only differ in position to avoid unnecessary re-renders.
            setKingsHp(prev => {
                if (prev.left.hp !== kings.left.hp ||
                    prev.left.maxHp !== kings.left.maxHp ||
                    prev.right.hp !== kings.right.hp ||
                    prev.right.maxHp !== kings.right.maxHp) {
                    return kings;
                }
                return prev;
            });
        });

        socketRef.current.on('terrain', (data: TerrainData & { hazards?: { type: string; id: string; position: { x: number; y: number }; width: number; height: number; windDirection?: number; windStrength?: number }[] }) => {
            setTerrain(data);
            if (data.hazards) {
                setHazards(data.hazards);
            }
        });

        // --- Build status ---

        socketRef.current.on('build_status', (data: { status: string; message: string }) => {
            updateBuildStatus({
                status: data.status as BuildStatus['status'],
                message: data.message
            });
        });

        socketRef.current.on('build_success', (data: { count: number; thought: string }) => {
            updateBuildStatus({
                status: 'success',
                message: `Built ${data.count} blocks! "${data.thought}"`
            }, 5000);
        });

        socketRef.current.on('build_error', (data: { message: string }) => {
            updateBuildStatus({ status: 'error', message: data.message }, 5000);
        });

        // --- King events ---

        socketRef.current.on('king_damage', (data: KingDamageEvent) => {
            setKingsHp(prev => ({
                ...prev,
                [data.side]: { ...prev[data.side], hp: data.hp, maxHp: data.maxHp },
            }));
            if (activeRef.current && !pausedRef.current) kingDamageCbRef.current?.(data);
        });

        socketRef.current.on('king_dead', () => {
        });

        // --- Room/lobby events ---

        socketRef.current.on('room_created', (data: { roomId: string }) => {
            hadRoomRef.current = true; writeStorage(ROOM_HINT, data.roomId);
            setRoomState(prev => ({
                roomId: data.roomId,
                side: 'left',
                phase: 'lobby',
                opponentConnected: false,
                myName: prev?.myName || 'Player 1',
                opponentName: '',
            }));
        });

        socketRef.current.on('room_joined', (data: { roomId: string; side: Side; mode?: 'single' | 'pvp'; difficulty?: BotDifficulty; players: { side: Side; ready: boolean; name: string }[] }) => {
            hadRoomRef.current = true; writeStorage(ROOM_HINT, data.roomId);
            const me = data.players.find(p => p.side === data.side);
            const opponent = data.players.find(p => p.side !== data.side);
            mySideRef.current = data.side;
            setRoomState({
                roomId: data.roomId,
                side: data.side,
                phase: 'lobby',
                opponentConnected: data.players.length >= 2,
                myName: me?.name || 'Player',
                opponentName: opponent?.name || '', mode: data.mode, difficulty: data.difficulty, ready: me?.ready,
            });
        });

        socketRef.current.on('room_error', (data: { message: string }) => {
            setLobbyError(data.message); setConnectionNotice(data.message);

        });

        socketRef.current.on('player_joined', (data: { side: Side; name?: string }) => {
            setRoomState(prev => prev ? { ...prev, opponentConnected: true, opponentName: data.name || 'Player' } : prev);
        });

        socketRef.current.on('player_left', () => {
            setRoomState(prev => prev ? { ...prev, opponentConnected: false, ready: false } : prev);
            setRematchState('none');
        });

        socketRef.current.on('player_ready_ack', (data: { side: Side }) => {
            if (data.side === mySideRef.current) setRoomState(prev => prev ? { ...prev, ready: true } : prev);
        });

        socketRef.current.on('queue_status', (data: { position: number }) => {
            setQueuePosition(data.position);
        });

        socketRef.current.on('match_found', () => {
            setQueuePosition(null);
        });

        socketRef.current.on('match_started', (data: { side: Side; kingsHp?: { left: KingHpState; right: KingHpState }; currentRound?: number; roundScore?: { left: number; right: number } }) => {
            updateBuildStatus({ status: 'idle', message: '' });
            // Emitted before the first metadata snapshot for every new round/session.
            bodyCacheRef.current.clear();
            setGameState(null);
            setRoundWinner(null); setServerHasFired(false); setProgressStatus('idle');
            setTurnPlayer(null);
            setMatchResult(null);
            if (data.currentRound !== undefined) setCurrentRound(data.currentRound);
            if (data.roundScore) setRoundScore(data.roundScore);
            track('match_started', { side: data.side });
            setRoomState(prev => prev ? { ...prev, side: data.side, phase: 'build' } : prev);
            if (data.kingsHp) {
                setKingsHp(data.kingsHp);
            }
        });

        // --- Phase events ---

        socketRef.current.on('phase_change', (data: { phase: MatchPhase; endsAt?: number; turnPlayer?: Side }) => {
            setPhase(data.phase);
            setPhaseEndsAt(data.endsAt ?? null);
            // A newly announced turn has not fired yet; turn_start follows with the same news.
            if (data.turnPlayer) { setTurnPlayer(data.turnPlayer); setServerHasFired(false); }
            if (data.phase !== 'combat') setWind(null);
            setRoomState(prev => prev ? { ...prev, phase: data.phase } : prev);
        });

        socketRef.current.on('turn_start', (data: { side: Side; endsAt: number; wind?: number }) => {
            setServerHasFired(false);
            setTurnPlayer(data.side);
            setPhaseEndsAt(data.endsAt);
            setWind(data.wind ?? null);
        });

        // The shot resolves the turn; the countdown no longer applies while it lands and settles.
        socketRef.current.on('shot_fired', () => {
            setServerHasFired(true);
            setPhaseEndsAt(null);
        });

        socketRef.current.on('match_result', (data: { winner: Side; reason: string; kings: { left: KingHpState; right: KingHpState } }) => {
            track('match_ended', {
                winner: data.winner,
                reason: data.reason,
            });
            setMatchResult({ winner: data.winner, reason: data.reason });
            setKingsHp(data.kings);
            setPhase('result');
        });

        // --- Visual effects ---

        socketRef.current.on('block_destroyed', (data: BlockDestroyedEvent) => {
            if (activeRef.current && !pausedRef.current) blockDestroyedCbRef.current?.(data);
        });

        socketRef.current.on('projectile_impact', (data: ProjectileImpactEvent) => {
            if (activeRef.current && !pausedRef.current) projectileImpactCbRef.current?.(data);
        });

        // --- Chat ---
        socketRef.current.on('chat_message', (msg: ChatMessage) => {
            setChatMessages(prev => {
                const next = [...prev, msg];
                return next.length > 100 ? next.slice(-100) : next;
            });
        });

        // --- Rematch ---
        socketRef.current.on('rematch_requested', (data: { side: Side }) => {
            setRematchState(prev => {
                if (prev === 'requested') return prev; // I already requested
                // Opponent requested
                return data.side !== mySideRef.current ? 'opponent_requested' : prev;
            });
        });

        socketRef.current.on('rematch_start', () => {
            if (rematchTimerRef.current) clearTimeout(rematchTimerRef.current);
            rematchTimerRef.current = null;
            bodyCacheRef.current.clear();
            setRematchState('none');
            setMatchResult(null);
            setMatchScores(null);
            setGameState(null);
            setBuildStatus({ status: 'idle', message: '' });
            setRoundScore({ left: 0, right: 0 });
            setCurrentRound(1);
            setRoundWinner(null);
            setTurnPlayer(null);
        });

        // --- Rounds ---
        socketRef.current.on('round_result', (data: { winner: Side; reason: string; roundScore: { left: number; right: number }; currentRound: number; isFinalRound: boolean }) => {
            setRoundScore(data.roundScore);
            setCurrentRound(data.currentRound);
            setRoundWinner(data.winner);
            if (data.isFinalRound) {
                setMatchResult({ winner: data.winner, reason: data.reason });
                setPhase('result');
            }
        });

        // --- Scoring ---
        socketRef.current.on('match_scores', (data: MatchScores) => {
            setMatchScores(data);
        });

        socketRef.current.on('profile_update', (data: PlayerProfile | null) => {
            setPrevPlayerProfile(playerProfileRef.current ?? data);
            playerProfileRef.current = data;
            setPlayerProfile(data);

        });

        socketRef.current.on('disconnect', () => {
            if (buildStatusTimerRef.current) clearTimeout(buildStatusTimerRef.current);
            buildStatusTimerRef.current = null;
            activeRef.current = false;
            if (socketRef.current) socketRef.current.sendBuffer = [];
            if (rematchTimerRef.current) clearTimeout(rematchTimerRef.current);
            rematchTimerRef.current = null;
            track('connection_lost');
            setIsConnected(false);
        });

        return () => {
            if (buildStatusTimerRef.current) clearTimeout(buildStatusTimerRef.current);
            buildStatusTimerRef.current = null;
            socketRef.current?.disconnect();
            if (rematchTimerRef.current) clearTimeout(rematchTimerRef.current);
            bodyCacheRef.current.clear();
        };
    }, [resetMatch]);

    // --- Actions ---

    const createRoom = useCallback((name?: string, mode: 'pvp' | 'single' = 'pvp', difficulty: BotDifficulty = 'normal') => {
        if (!socketRef.current?.connected || !activeRef.current || pausedRef.current) return;
        setConnectionNotice(null);
        setLobbyError(null);
        socketRef.current?.emit('create_room', { name, mode, difficulty });
    }, []);

    const joinRoom = useCallback((roomId: string, name?: string) => {
        if (!socketRef.current?.connected || !activeRef.current || pausedRef.current) return;
        setConnectionNotice(null);
        setLobbyError(null);
        socketRef.current?.emit('join_room', { roomId, name });
    }, []);

    const joinQueue = useCallback((name?: string) => {
        if (!socketRef.current?.connected || !activeRef.current || pausedRef.current) return;
        setConnectionNotice(null);
        setLobbyError(null);
        socketRef.current?.emit('join_queue', { name });
    }, []);

    const leaveQueue = useCallback(() => {
        if (socketRef.current?.connected) socketRef.current.emit('leave_queue');
        setQueuePosition(null);
    }, []);

    const playerReady = useCallback(() => {
        if (!socketRef.current?.connected || !activeRef.current || pausedRef.current) return;
        socketRef.current?.emit('player_ready');
    }, []);

    const spawnBox = useCallback((
        x: number,
        y: number,
        material: MaterialType = 'wood',
        shape: ShapeType = 'rectangle',
        dimensions: number[] = [30, 30]
    ) => {
        if (!socketRef.current?.connected || !activeRef.current || pausedRef.current) return;
        socketRef.current?.emit('spawn', { x, y, material, shape, dimensions });
    }, []);

    const requestBuild = useCallback((apiKey: string, prompt: string) => {
        if (!prompt || !socketRef.current?.connected || !activeRef.current || pausedRef.current) return;
        if (buildStatusTimerRef.current) clearTimeout(buildStatusTimerRef.current);
        buildStatusTimerRef.current = null;
        setBuildStatus({ status: 'generating', message: 'Sending to Architect...' });
        socketRef.current?.emit('request_build', { apiKey: apiKey || undefined, prompt });
    }, []);

    const fireProjectile = useCallback((angle: number, power: number) => {
        if (!socketRef.current?.connected || !activeRef.current || pausedRef.current) return;
        setServerHasFired(true);
        socketRef.current?.emit('fire_projectile', { angle, power });
    }, []);

    const sendChatMessage = useCallback((text: string) => {
        if (!socketRef.current?.connected || !activeRef.current || pausedRef.current) return;
        socketRef.current?.emit('chat_message', { text });
    }, []);

    const requestRematch = useCallback(() => {
        if (!socketRef.current?.connected || !activeRef.current || pausedRef.current) return;
        socketRef.current?.emit('request_rematch');
        setRematchState('requested');
        // Timeout: if opponent doesn't respond in 15s, reset
        if (rematchTimerRef.current) clearTimeout(rematchTimerRef.current);
        rematchTimerRef.current = setTimeout(() => {
            rematchTimerRef.current = null;
            setRematchState(prev => prev === 'requested' ? 'none' : prev);
        }, 15000);
    }, []);

    const getProfile = useCallback(() => {
        if (socketRef.current?.connected) socketRef.current.emit('get_profile');
    }, []);

    const returnToLobby = useCallback(() => {
        if (socketRef.current?.connected) socketRef.current.emit('leave_room');
        hadRoomRef.current = false; writeStorage(ROOM_HINT, null);
        resetMatch();
    }, [resetMatch]);

    const claimReward = useCallback((kind: RewardKind) => {
        if (!socketRef.current?.connected || !activeRef.current) return;
        socketRef.current.timeout(5000).emit('claim_reward', { kind }, (error: Error | null, result: { amount?: number; error?: string }) => {
            setRewardNotice(error ? 'Reward confirmation timed out. Refresh your campaign before retrying.' : result.error ?? (result.amount ? '+' + result.amount + ' Embers saved.' : 'No new rewards to claim.'));
        });
    }, []);
    const getHistory = useCallback(async (cursor?: string): Promise<{ entries: import('../types').MatchHistoryEntry[]; cursor: string | null }> => {
        if (!socketRef.current?.connected || !activeRef.current) throw new Error('Connect to load history.');
        return socketRef.current.timeout(5000).emitWithAck('get_history', { cursor, limit: 20 }).then(result => {
            if (result.error) throw new Error(result.error); return result;
        });
    }, []);

    const setBlockDestroyedCallback = useCallback((cb: ((data: BlockDestroyedEvent) => void) | null) => {
        blockDestroyedCbRef.current = cb;
    }, []);

    const setProjectileImpactCallback = useCallback((cb: ((data: ProjectileImpactEvent) => void) | null) => {
        projectileImpactCbRef.current = cb;
    }, []);

    const setKingDamageCallback = useCallback((cb: ((data: KingDamageEvent) => void) | null) => {
        kingDamageCbRef.current = cb;
    }, []);

    return {
        gameState, terrain, buildStatus, kingsHp,
        roomState, phase, phaseEndsAt, turnPlayer, matchResult, queuePosition,
        chatMessages, rematchState, roundScore, currentRound, hazards, wind,
        matchScores, playerProfile, prevPlayerProfile, isConnected, connectionNotice, roundWinner,
        identityReplaced,
        lobbyError,
        pauseState, syncRevision, serverHasFired, progressStatus, rewardNotice, claimReward, getHistory,
        createRoom, joinRoom, joinQueue, leaveQueue, playerReady,
        spawnBox, requestBuild, fireProjectile,
        sendChatMessage, requestRematch, getProfile, returnToLobby,
        setBlockDestroyedCallback, setProjectileImpactCallback, setKingDamageCallback,
    };
};
