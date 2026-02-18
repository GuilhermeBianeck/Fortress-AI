import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState, TerrainData, BuildStatus, MaterialType, ShapeType, Vector, Side, MatchPhase, RoomState, KingHpState, ChatMessage, MatchScores, PlayerProfile } from '../types';

const SERVER_URL = `${window.location.protocol}//${window.location.hostname}:3001`;

export const useGameState = () => {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [terrain, setTerrain] = useState<TerrainData | null>(null);
    const [buildStatus, setBuildStatus] = useState<BuildStatus>({ status: 'idle', message: '' });
    const [kingsHp, setKingsHp] = useState<{ left: KingHpState; right: KingHpState }>({
        left: { hp: 100, maxHp: 100 },
        right: { hp: 100, maxHp: 100 },
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
    const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);

    const socketRef = useRef<Socket | null>(null);
    const mySideRef = useRef<Side>('left');

    // Callback refs for canvas effects
    const blockDestroyedCbRef = useRef<((data: { bodyId: number; position: Vector; material: string; velocity: Vector }) => void) | null>(null);
    const projectileImpactCbRef = useRef<((data: { position: Vector }) => void) | null>(null);

    useEffect(() => {
        socketRef.current = io(SERVER_URL);

        socketRef.current.on('connect', () => {
            console.log('Connected to Game Server');
        });

        // --- Game state ---

        socketRef.current.on('gameState', (state: GameState) => {
            setGameState(state);
            if (state.kings) {
                setKingsHp(state.kings);
            }
        });

        socketRef.current.on('terrain', (data: TerrainData & { hazards?: any[] }) => {
            console.log('Terrain received:', data.seed);
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

        socketRef.current.on('king_damage', (data: { side: Side; hp: number; maxHp: number; damage: number; source: string }) => {
            setKingsHp(prev => ({
                ...prev,
                [data.side]: { hp: data.hp, maxHp: data.maxHp },
            }));
            console.log(`${data.side} King hit by ${data.source}! Damage: ${data.damage.toFixed(1)} | HP: ${data.hp.toFixed(1)}/${data.maxHp}`);
        });

        socketRef.current.on('king_dead', (data: { side: Side }) => {
            console.log(`${data.side} King has fallen!`);
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

        socketRef.current.on('player_left', (data: { side: Side; reason: string }) => {
            setRoomState(prev => prev ? { ...prev, opponentConnected: false } : prev);
            setRematchState('none');
            console.log(`Player ${data.side} left: ${data.reason}`);
        });

        socketRef.current.on('player_ready_ack', (_data: { side: Side }) => {
            // Could track which players are ready in UI
        });

        socketRef.current.on('queue_status', (data: { position: number }) => {
            setQueuePosition(data.position);
        });

        socketRef.current.on('match_found', (_data: { roomId: string }) => {
            setQueuePosition(null);
        });

        socketRef.current.on('match_started', (data: { side: Side }) => {
            setRoomState(prev => prev ? { ...prev, side: data.side, phase: 'build' } : prev);
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
            setMatchResult({ winner: data.winner, reason: data.reason });
            setKingsHp(data.kings);
            setPhase('result');
        });

        // --- Visual effects ---

        socketRef.current.on('block_destroyed', (data: { bodyId: number; position: Vector; material: string; velocity: Vector }) => {
            blockDestroyedCbRef.current?.(data);
        });

        socketRef.current.on('projectile_impact', (data: { position: Vector }) => {
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
            setPlayerProfile(data);
        });

        socketRef.current.on('disconnect', () => {
            console.log('Disconnected from Game Server');
        });

        return () => {
            socketRef.current?.disconnect();
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
        if (!apiKey || !prompt) return;
        setBuildStatus({ status: 'generating', message: 'Sending to Architect...' });
        socketRef.current?.emit('request_build', { apiKey, prompt });
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
    }, []);

    const getProfile = useCallback(() => {
        socketRef.current?.emit('get_profile');
    }, []);

    const setBlockDestroyedCallback = useCallback((cb: ((data: { bodyId: number; position: Vector; material: string; velocity: Vector }) => void) | null) => {
        blockDestroyedCbRef.current = cb;
    }, []);

    const setProjectileImpactCallback = useCallback((cb: ((data: { position: Vector }) => void) | null) => {
        projectileImpactCbRef.current = cb;
    }, []);

    return {
        gameState, terrain, buildStatus, kingsHp,
        roomState, phase, phaseEndsAt, turnPlayer, matchResult, queuePosition,
        chatMessages, rematchState, roundScore, currentRound, hazards,
        matchScores, playerProfile,
        createRoom, joinRoom, joinQueue, leaveQueue, playerReady,
        spawnBox, requestBuild, fireProjectile,
        sendChatMessage, requestRematch, getProfile,
        setBlockDestroyedCallback, setProjectileImpactCallback,
    };
};
