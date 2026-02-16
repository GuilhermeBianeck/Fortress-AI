import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import Matter from 'matter-js';
import { createWorld } from './physics/world';
import { GameLoop } from './physics/loop';
import { generateFortress } from './ai/gemini';

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

// Material properties table (from Fortress-AI.md §5.1)
const MATERIAL_PROPS: Record<string, { density: number; friction: number; restitution: number }> = {
    wood: { density: 0.001, friction: 0.5, restitution: 0.1 },
    stone: { density: 0.005, friction: 0.8, restitution: 0.0 },
    ice: { density: 0.002, friction: 0.01, restitution: 0.1 },
    rubber: { density: 0.001, friction: 0.9, restitution: 0.9 },
    steel: { density: 0.008, friction: 0.3, restitution: 0.05 },
};

// Initialize Physics
let worldState = createWorld();
let { engine, world, terrain, seed } = worldState;
const gameLoop = new GameLoop(engine, io);
gameLoop.start();

console.log(`World created with terrain seed: ${seed}`);

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Send terrain data on connect
    socket.emit('terrain', {
        points: terrain.points,
        buildZones: terrain.buildZones,
        seed
    });

    // God Tools: Spawn a body with material + shape
    socket.on('spawn', (data) => {
        const { x, y, material = 'wood', shape = 'rectangle', dimensions = [50, 50] } = data;
        console.log(`Spawn: ${shape} ${material} at (${x.toFixed(0)}, ${y.toFixed(0)})`);
        const props = MATERIAL_PROPS[material] || MATERIAL_PROPS.wood;

        let body: Matter.Body;
        if (shape === 'circle') {
            const radius = dimensions[0] || 25;
            body = Matter.Bodies.circle(x, y, radius, {
                density: props.density,
                friction: props.friction,
                restitution: props.restitution,
                label: material
            });
        } else {
            const w = dimensions[0] || 50;
            const h = dimensions[1] || dimensions[0] || 50;
            body = Matter.Bodies.rectangle(x, y, w, h, {
                density: props.density,
                friction: props.friction,
                restitution: props.restitution,
                label: material
            });
        }

        Matter.World.add(world, body);
    });

    // AI Build Request (BYOK)
    socket.on('request_build', async (data) => {
        const { apiKey, prompt } = data;

        if (!apiKey || !prompt) {
            socket.emit('build_error', { message: "Missing API Key or Prompt" });
            return;
        }

        try {
            socket.emit('build_status', { status: 'generating', message: 'Architect is thinking...' });

            const plan = await generateFortress(apiKey, prompt);

            socket.emit('build_status', { status: 'building', message: plan.thought_chain });

            let spawnedCount = 0;
            plan.bodies.forEach(b => {
                const props = MATERIAL_PROPS[b.material] || MATERIAL_PROPS.wood;

                let body: Matter.Body;
                if (b.shape === 'circle') {
                    const radius = b.dimensions[0] || 25;
                    body = Matter.Bodies.circle(b.x, b.y, radius, {
                        density: props.density,
                        friction: props.friction,
                        restitution: props.restitution,
                        label: b.material
                    });
                } else if (b.shape === 'triangle') {
                    // Create an equilateral triangle approximation
                    const size = b.dimensions[0] || 50;
                    const vertices = [
                        { x: 0, y: -size / 2 },
                        { x: -size / 2, y: size / 2 },
                        { x: size / 2, y: size / 2 }
                    ];
                    body = Matter.Bodies.fromVertices(b.x, b.y, [vertices], {
                        density: props.density,
                        friction: props.friction,
                        restitution: props.restitution,
                        label: b.material
                    });
                } else {
                    // Rectangle (default)
                    const w = b.dimensions[0] || 50;
                    const h = b.dimensions[1] || b.dimensions[0] || 50;
                    body = Matter.Bodies.rectangle(b.x, b.y, w, h, {
                        density: props.density,
                        friction: props.friction,
                        restitution: props.restitution,
                        label: b.material
                    });
                }

                if (b.angle) Matter.Body.setAngle(body, b.angle);
                Matter.World.add(world, body);
                spawnedCount++;
            });

            socket.emit('build_success', {
                count: spawnedCount,
                thought: plan.thought_chain
            });

        } catch (err: any) {
            console.error("Build Error:", err);
            socket.emit('build_error', { message: err.message || "AI Generation Failed" });
        }
    });

    // Clear all dynamic bodies
    socket.on('clear_world', () => {
        const allBodies = Matter.Composite.allBodies(world);
        const dynamicBodies = allBodies.filter(b => !b.isStatic);
        Matter.Composite.remove(world, dynamicBodies);
        io.emit('world_cleared');
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Game Server running on port ${PORT}`);
});
