import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState, TerrainData, BuildStatus, MaterialType, ShapeType, Side, MatchPhase, RoomState, KingHpState, ChatMessage, MatchScores, PlayerProfile, CompactGameState, BodyState } from '../types';
import { debugStats, debugVisible } from '../debug/debugStats';
import { track } from '../analytics/tracker';
import { reconstructGameState } from './gameStateSnapshot';
import type { KingDamageEvent, ProjectileImpactEvent, BlockDestroyedEvent } from '../types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

const PROFILE_STORAGE_KEY = 'fortress_player_profile';
const UUID_STORAGE_KEY = 'fortress_player_uuid';

function getOrCreateUuid(): string {
    let uuid = localStorage.getItem(UUID_STORAGE_KEY);
    if (!uuid) {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            uuid = crypto.randomUUID();
        } else {
            // Fallback: RFC 4122 v4 UUID using Math.random
            uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = (Math.random() * 16) | 0;
                const v = c === 'x' ? r : (r & 0x3) | 0x8;
                return v.toString(16);
            });
        }
        localStorage.setItem(UUID_STORAGE_KEY, uuid);
    }
    return uuid;
}

function loadStoredProfile(): PlayerProfile | null {
    try {
        const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as PlayerProfile) : null;
    } catch {
        return null;
    }
}

function saveProfileToStorage(profile: PlayerProfile): void {
    try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
        // storage quota exceeded -- ignore
    }
}

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
    const [hazards, setHazards] = useState<{ type: string; id: string; position: { x: number; y: number }; width: number; height: number; windDirection?: number; windStrength?: number }[]>([]);
    const [matchScores, setMatchScores] = useState<MatchScores | null>(null);
    const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(() => loadStoredProfile());
    const [prevPlayerProfile, setPrevPlayerProfile] = useState<PlayerProfile | null>(null);
    const playerProfileRef = useRef<PlayerProfile | null>(loadStoredProfile());
    const [isConnected, setIsConnected] = useState(true);

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

    useEffect(() => {
        const playerUuid = getOrCreateUuid();
        socketRef.current = io(SERVER_URL, {
            auth: { uuid: playerUuid },
            // Match server: websocket-only, skip polling overhead
            transports: ['websocket'],
            // Reconnect aggressively for real-time game
            reconnectionDelay: 500,
            reconnectionDelayMax: 2000,
        });

        socketRef.current.on('connect', () => {
            setIsConnected(true);
            track('connection_restored');
        });

        // --- Game state (compact delta-encoded format) ---

        socketRef.current.on('gameState', (data: CompactGameState) => {
            if (!mountedRef.current) return;
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
            setBuildStatus({
                status: data.status as BuildStatus['status'],
                message: data.message
            });
        });

        socketRef.current.on('build_success', (data: { count: number; thought: string }) => {
            setBuildStatus({
                status: 'success',
                message: `Built ${data.count} blocks! "${data.thought}"`
            });
            setTimeout(() => setBuildStatus({ status: 'idle', message: '' }), 5000);
        });

        socketRef.current.on('build_error', (data: { message: string }) => {
            setBuildStatus({ status: 'error', message: data.message });
            setTimeout(() => setBuildStatus({ status: 'idle', message: '' }), 5000);
        });

        // --- King events ---

        socketRef.current.on('king_damage', (data: KingDamageEvent) => {
            setKingsHp(prev => ({
                ...prev,
                [data.side]: { ...prev[data.side], hp: data.hp, maxHp: data.maxHp },
            }));
            kingDamageCbRef.current?.(data);
        });

        socketRef.current.on('king_dead', () => {
        });

        // --- Room/lobby events ---

        socketRef.current.on('room_created', (data: { roomId: string }) => {
            setRoomState(prev => ({
                roomId: data.roomId,
                side: 'left',
                phase: 'lobby',
                opponentConnected: false,
                myName: prev?.myName || 'Player 1',
                opponentName: '',
            }));
        });

        socketRef.current.on('room_joined', (data: { roomId: string; side: Side; players: { side: Side; ready: boolean; name: string }[] }) => {
            const me = data.players.find(p => p.side === data.side);
            const opponent = data.players.find(p => p.side !== data.side);
            mySideRef.current = data.side;
            setRoomState({
                roomId: data.roomId,
                side: data.side,
                phase: 'lobby',
                opponentConnected: data.players.length >= 2,
                myName: me?.name || 'Player',
                opponentName: opponent?.name || '',
            });
        });

        socketRef.current.on('room_error', (data: { message: string }) => {
            console.error('Room error:', data.message);
            setBuildStatus({ status: 'error', message: data.message });
            setTimeout(() => setBuildStatus({ status: 'idle', message: '' }), 3000);
        });

        socketRef.current.on('player_joined', (data: { side: Side; name?: string }) => {
            setRoomState(prev => prev ? { ...prev, opponentConnected: true, opponentName: data.name || 'Player' } : prev);
        });

        socketRef.current.on('player_left', () => {
            setRoomState(prev => prev ? { ...prev, opponentConnected: false } : prev);
            setRematchState('none');
        });

        socketRef.current.on('player_ready_ack', () => {
            // Could track which players are ready in UI
        });

        socketRef.current.on('queue_status', (data: { position: number }) => {
            setQueuePosition(data.position);
        });

        socketRef.current.on('match_found', () => {
            setQueuePosition(null);
        });

        socketRef.current.on('match_started', (data: { side: Side, kingsHp?: { left: KingHpState; right: KingHpState } }) => {
            // Emitted before the first metadata snapshot for every new round/session.
            bodyCacheRef.current.clear();
            setGameState(null);
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
            if (data.turnPlayer) setTurnPlayer(data.turnPlayer);
            setRoomState(prev => prev ? { ...prev, phase: data.phase } : prev);
        });

        socketRef.current.on('turn_start', (data: { side: Side; endsAt: number }) => {
            setTurnPlayer(data.side);
            setPhaseEndsAt(data.endsAt);
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
            blockDestroyedCbRef.current?.(data);
        });

        socketRef.current.on('projectile_impact', (data: ProjectileImpactEvent) => {
            projectileImpactCbRef.current?.(data);
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
            bodyCacheRef.current.clear();
            setRematchState('none');
            setMatchResult(null);
            setMatchScores(null);
            setGameState(null);
            setBuildStatus({ status: 'idle', message: '' });
        });

        // --- Rounds ---
        socketRef.current.on('round_result', (data: { winner: Side; reason: string; roundScore: { left: number; right: number }; currentRound: number; isFinalRound: boolean }) => {
            setRoundScore(data.roundScore);
            setCurrentRound(data.currentRound);
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
            setPrevPlayerProfile(playerProfileRef.current);
            playerProfileRef.current = data;
            setPlayerProfile(data);
            if (data) saveProfileToStorage(data);
        });

        socketRef.current.on('disconnect', () => {
            track('connection_lost');
            setIsConnected(false);
        });

        return () => {
            socketRef.current?.disconnect();
            bodyCacheRef.current.clear();
        };
    }, []);

    // --- Actions ---

    const createRoom = useCallback((name?: string, mode: 'pvp' | 'single' = 'pvp') => {
        socketRef.current?.emit('create_room', { name, mode });
    }, []);

    const joinRoom = useCallback((roomId: string, name?: string) => {
        socketRef.current?.emit('join_room', { roomId, name });
    }, []);

    const joinQueue = useCallback((name?: string) => {
        socketRef.current?.emit('join_queue', { name });
    }, []);

    const leaveQueue = useCallback(() => {
        socketRef.current?.emit('leave_queue');
        setQueuePosition(null);
    }, []);

    const playerReady = useCallback(() => {
        socketRef.current?.emit('player_ready');
    }, []);

    const spawnBox = useCallback((
        x: number,
        y: number,
        material: MaterialType = 'wood',
        shape: ShapeType = 'rectangle',
        dimensions: number[] = [30, 30]
    ) => {
        socketRef.current?.emit('spawn', { x, y, material, shape, dimensions });
    }, []);

    const requestBuild = useCallback((apiKey: string, prompt: string) => {
        if (!prompt) return;
        setBuildStatus({ status: 'generating', message: 'Sending to Architect...' });
        socketRef.current?.emit('request_build', { apiKey: apiKey || undefined, prompt });
    }, []);

    const fireProjectile = useCallback((angle: number, power: number) => {
        socketRef.current?.emit('fire_projectile', { angle, power });
    }, []);

    const sendChatMessage = useCallback((text: string) => {
        socketRef.current?.emit('chat_message', { text });
    }, []);

    const requestRematch = useCallback(() => {
        socketRef.current?.emit('request_rematch');
        setRematchState('requested');
        // Timeout: if opponent doesn't respond in 15s, reset
        const t = setTimeout(() => {
            setRematchState(prev => prev === 'requested' ? 'none' : prev);
        }, 15000);
        // Cleanup on unmount
        return () => clearTimeout(t);
    }, []);

    const getProfile = useCallback(() => {
        socketRef.current?.emit('get_profile');
    }, []);

    const returnToLobby = useCallback(() => {
        socketRef.current?.emit('leave_room');
        bodyCacheRef.current.clear();
        setGameState(null);
        setTerrain(null);
        setBuildStatus({ status: 'idle', message: '' });
        setKingsHp({ left: { hp: 100, maxHp: 100, x: 0 }, right: { hp: 100, maxHp: 100, x: 0 } });
        setRoomState(null);
        setPhase('lobby');
        setPhaseEndsAt(null);
        setTurnPlayer(null);
        setMatchResult(null);
        setQueuePosition(null);
        setChatMessages([]);
        setRematchState('none');
        setRoundScore({ left: 0, right: 0 });
        setCurrentRound(1);
        setHazards([]);
        setMatchScores(null);
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
        chatMessages, rematchState, roundScore, currentRound, hazards,
        matchScores, playerProfile, prevPlayerProfile, isConnected,
        createRoom, joinRoom, joinQueue, leaveQueue, playerReady,
        spawnBox, requestBuild, fireProjectile,
        sendChatMessage, requestRematch, getProfile, returnToLobby,
        setBlockDestroyedCallback, setProjectileImpactCallback, setKingDamageCallback,
    };
};
