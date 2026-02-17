import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { GameSession } from './game/GameSession';

dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

const session = new GameSession(io);

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.emit('terrain', session.getTerrainData());

    socket.on('spawn', (data) => session.handleSpawn(data));

    socket.on('request_build', (data) => session.handleRequestBuild(socket, data));

    socket.on('clear_world', () => {
        session.handleClearWorld();
        io.emit('world_cleared');
    });

    socket.on('fire_projectile', (data) => session.handleFireProjectile(data));

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Game Server running on port ${PORT}`);
});
