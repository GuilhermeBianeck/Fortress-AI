import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { RoomManager } from './game/RoomManager';
import analyticsRouter from './analytics/events';
import { ProfileStore } from './storage/ProfileStore';
import { resolve } from 'node:path';

dotenv.config();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:3001']; // Dev defaults; production sets ALLOWED_ORIGINS env

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: '10kb' }));
app.use(express.text({ type: 'text/plain', limit: '10kb' }));
app.use(analyticsRouter);

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"]
    },
    transports: ['websocket'],
    perMessageDeflate: {
        threshold: 512,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    maxHttpBufferSize: 1e5, // 100KB max per WebSocket message
});

const PORT = process.env.PORT || 3001;

const progressionPath = process.env.FORTRESS_DB_PATH || resolve(process.cwd(), 'data/progression.sqlite');
const roomManager = new RoomManager(io, new ProfileStore(progressionPath));

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    try { roomManager.authenticate(socket, socket.handshake.auth?.identity); }
    catch { socket.emit('room_error', { message: 'Progress storage is unavailable. Please try again shortly.' }); socket.disconnect(true); return; }
    socket.use(([event], next) => {
        const paused = roomManager.getRoom(socket.id)?.absences.size;
        if (paused && !['leave_room', 'get_profile', 'get_history', 'claim_reward'].includes(event)) return;
        next();
    });

    // --- Lobby events ---

    socket.on('create_room', (data?: { name?: string; mode?: 'pvp' | 'single'; difficulty?: unknown }) => {
        try {
            const room = roomManager.createRoom(socket.id, data?.name, data?.mode, data?.difficulty);
            socket.join(room.id);
            socket.emit('room_created', { roomId: room.id });
            socket.emit('room_joined', { roomId: room.id, side: 'left', mode: room.mode, difficulty: room.difficulty,
                players: [...room.players.values()].map(p => ({ side: p.side, ready: p.ready, name: p.name })) });
        } catch (error) { socket.emit('room_error', { message: error instanceof Error ? error.message : 'Could not create room.' }); }
    });

    socket.on('join_room', (data: { roomId: string; name?: string }) => {
        const roomId = typeof data?.roomId === 'string' ? data.roomId.toUpperCase() : '';
        if (!roomId) {
            socket.emit('room_error', { message: 'Room code is required.' });
            return;
        }

        const room = roomManager.joinRoom(roomId, socket.id, data.name);
        if (!room) {
            socket.emit('room_error', { message: 'Room not found, full, or already started.' });
            return;
        }

        socket.join(room.id);

        const playerInfo = room.players.get(socket.id)!;
        const players = Array.from(room.players.values()).map(p => ({
            side: p.side,
            ready: p.ready,
            name: p.name,
        }));

        socket.emit('room_joined', {
            roomId: room.id,
            side: playerInfo.side,
            players,
        });

        // Notify existing players
        socket.to(room.id).emit('player_joined', { side: playerInfo.side, name: playerInfo.name });
        console.log(`${socket.id} joined room ${room.id} as ${playerInfo.side}`);
    });

    socket.on('join_queue', (data?: { name?: string }) => {
        roomManager.joinQueue(socket.id, data?.name);

        const position = roomManager.getQueuePosition(socket.id);
        socket.emit('queue_status', { position });

        // Try to match
        const room = roomManager.tryMatchFromQueue();
        if (room) {
            // Both players join the socket.io room
            for (const [sid, pInfo] of room.players.entries()) {
                const playerSocket = io.sockets.sockets.get(sid);
                if (playerSocket) {
                    playerSocket.join(room.id);

                    const players = Array.from(room.players.values()).map(p => ({
                        side: p.side,
                        ready: p.ready,
                        name: p.name,
                    }));

                    playerSocket.emit('match_found', { roomId: room.id });
                    playerSocket.emit('room_joined', {
                        roomId: room.id,
                        side: pInfo.side,
                        players,
                    });
                }
            }
            console.log(`Quick match: room ${room.id}`);
        }
    });

    socket.on('leave_queue', () => {
        roomManager.leaveQueue(socket.id);
    });

    socket.on('player_ready', () => {
        const room = roomManager.getRoom(socket.id);
        if (!room) return;
        if (!roomManager.canStartMatches()) { socket.emit('room_error', { message: 'Progress saving is recovering. Try Ready again shortly.' }); return; }

        // During lobby: ready to start the match
        if (room.phase === 'lobby') {
            const allReady = roomManager.setPlayerReady(socket.id);
            io.to(room.id).emit('player_ready_ack', {
                side: room.players.get(socket.id)?.side,
            });

            if (allReady) {
                // Start the match
                const session = roomManager.startMatch(room.id);
                if (session) {
                    roomManager.sendMatchStarted(room);
                    console.log(`Match started in room ${room.id}`);
                }
            }
        }

        // During build phase: player finished building early
        else if (room.phase === 'build' && room.session) {
            room.session.handlePlayerBuildReady(socket.id);
        }
    });

    // --- Game events (require active room) ---

    socket.on('spawn', (data) => {
        const room = roomManager.getRoom(socket.id);
        if (!room?.session) return;
        room.session.handleSpawn(socket.id, data);
    });

    socket.on('request_build', (data) => {
        const room = roomManager.getRoom(socket.id);
        if (!room?.session) return;
        const uuid = roomManager.getPlayerUuid(socket.id);
        room.session.handleRequestBuild(socket, data, uuid);
    });

    socket.on('fire_projectile', (data) => {
        const room = roomManager.getRoom(socket.id);
        if (!room?.session) return;
        room.session.handleFireProjectile(socket.id, data);
    });

    // --- Rematch ---

    socket.on('request_rematch', () => {
        roomManager.requestRematch(socket.id);
    });

    // --- Profile ---

    socket.on('get_profile', () => {
        try { socket.emit('profile_update', roomManager.getProfile(socket.id)); }
        catch { socket.emit('profile_error', { message: 'Your campaign could not be loaded. Please try again shortly.' }); }
    });

    socket.on('get_history', (data: { cursor?: string; limit?: number } = {}, reply?: (value: unknown) => void) => {
        try { reply?.(roomManager.history(socket.id, data.cursor, data.limit)); }
        catch { reply?.({ error: 'Could not load history.' }); }
    });
    socket.on('claim_reward', (data: { kind: 'checkin' | 'daily' | 'weekly' }, reply?: (value: unknown) => void) => {
        try { reply?.({ amount: roomManager.claim(socket.id, data?.kind) }); }
        catch { reply?.({ error: 'Reward unavailable. Please try again.' }); }
    });

    // --- Chat ---

    socket.on('chat_message', (data: { text: string }) => {
        const room = roomManager.getRoom(socket.id);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (!player) return;

        const text = typeof data?.text === 'string' ? data.text.trim().slice(0, 200) : '';
        if (!text) return;

        const message = {
            id: `${socket.id}-${Date.now()}`,
            sender: player.name,
            side: player.side,
            text,
            timestamp: Date.now(),
        };
        room.chat.push(message); if (room.chat.length > 100) room.chat.shift();
        io.to(room.id).emit('chat_message', message);
    });

    // --- Leave Room (without disconnecting) ---

    socket.on('leave_room', () => {
        const room = roomManager.getRoom(socket.id);
        if (room) {
            socket.leave(room.id);
            roomManager.handleDisconnect(socket.id);

        }
    });

    // --- Disconnect ---

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        roomManager.handleTransportLoss(socket.id);
    });
});

httpServer.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Game Server running on port ${PORT} (all interfaces)`);
});

const shutdown = () => {
    console.log('Shutting down gracefully...');
    roomManager.destroy();
    process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
