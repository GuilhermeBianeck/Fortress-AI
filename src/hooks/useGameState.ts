import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState, TerrainData, BuildStatus, MaterialType, ShapeType } from '../types';

const SERVER_URL = 'http://localhost:3001';

export const useGameState = () => {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [terrain, setTerrain] = useState<TerrainData | null>(null);
    const [buildStatus, setBuildStatus] = useState<BuildStatus>({ status: 'idle', message: '' });
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        socketRef.current = io(SERVER_URL);

        socketRef.current.on('connect', () => {
            console.log('Connected to Game Server');
        });

        socketRef.current.on('gameState', (state: GameState) => {
            setGameState(state);
        });

        socketRef.current.on('terrain', (data: TerrainData) => {
            console.log('Terrain received:', data.seed);
            setTerrain(data);
        });

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
            // Auto-clear status after 5s
            setTimeout(() => setBuildStatus({ status: 'idle', message: '' }), 5000);
        });

        socketRef.current.on('build_error', (data: { message: string }) => {
            setBuildStatus({ status: 'error', message: data.message });
            setTimeout(() => setBuildStatus({ status: 'idle', message: '' }), 5000);
        });

        socketRef.current.on('world_cleared', () => {
            console.log('World cleared');
        });

        socketRef.current.on('disconnect', () => {
            console.log('Disconnected from Game Server');
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, []);

    const spawnBox = useCallback((
        x: number,
        y: number,
        material: MaterialType = 'wood',
        shape: ShapeType = 'rectangle',
        dimensions: number[] = [50, 50]
    ) => {
        socketRef.current?.emit('spawn', { x, y, material, shape, dimensions });
    }, []);

    const requestBuild = useCallback((apiKey: string, prompt: string) => {
        if (!apiKey || !prompt) return;
        setBuildStatus({ status: 'generating', message: 'Sending to Architect...' });
        socketRef.current?.emit('request_build', { apiKey, prompt });
    }, []);

    const clearWorld = useCallback(() => {
        socketRef.current?.emit('clear_world');
    }, []);

    return { gameState, terrain, buildStatus, spawnBox, requestBuild, clearWorld };
};
