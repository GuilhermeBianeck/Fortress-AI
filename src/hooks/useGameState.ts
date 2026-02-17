import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState, TerrainData, BuildStatus, MaterialType, ShapeType, Vector, Side, MatchPhase, RoomState, KingHpState } from '../types';

const SERVER_URL = 'http://localhost:3001';

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

    const socketRef = useRef<Socket | null>(null);

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

        socketRef.current.on('terrain', (data: TerrainData) => {
            console.log('Terrain received:', data.seed);
            setTerrain(data);
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
            setRoomState({
                roomId: data.roomId,
                side: 'left',
                phase: 'lobby',
                opponentConnected: false,
            });
        });

        socketRef.current.on('room_joined', (data: { roomId: string; side: Side; players: { side: Side; ready: boolean }[] }) => {
            setRoomState({
                roomId: data.roomId,
                side: data.side,
                phase: 'lobby',
                opponentConnected: data.players.length >= 2,
            });
        });

        socketRef.current.on('room_error', (data: { message: string }) => {
            console.error('Room error:', data.message);
            setBuildStatus({ status: 'error', message: data.message });
            setTimeout(() => setBuildStatus({ status: 'idle', message: '' }), 3000);
        });

        socketRef.current.on('player_joined', (_data: { side: Side }) => {
            setRoomState(prev => prev ? { ...prev, opponentConnected: true } : prev);
        });

        socketRef.current.on('player_left', (data: { side: Side; reason: string }) => {
            setRoomState(prev => prev ? { ...prev, opponentConnected: false } : prev);
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

        socketRef.current.on('disconnect', () => {
            console.log('Disconnected from Game Server');
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, []);

    // --- Actions ---

    const createRoom = useCallback(() => {
        socketRef.current?.emit('create_room');
    }, []);

    const joinRoom = useCallback((roomId: string) => {
        socketRef.current?.emit('join_room', { roomId });
    }, []);

    const joinQueue = useCallback(() => {
        socketRef.current?.emit('join_queue');
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

    const setBlockDestroyedCallback = useCallback((cb: ((data: { bodyId: number; position: Vector; material: string; velocity: Vector }) => void) | null) => {
        blockDestroyedCbRef.current = cb;
    }, []);

    const setProjectileImpactCallback = useCallback((cb: ((data: { position: Vector }) => void) | null) => {
        projectileImpactCbRef.current = cb;
    }, []);

    return {
        gameState, terrain, buildStatus, kingsHp,
        roomState, phase, phaseEndsAt, turnPlayer, matchResult, queuePosition,
        createRoom, joinRoom, joinQueue, leaveQueue, playerReady,
        spawnBox, requestBuild, fireProjectile,
        setBlockDestroyedCallback, setProjectileImpactCallback,
    };
};
