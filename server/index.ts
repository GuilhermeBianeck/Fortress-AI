import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import Matter from 'matter-js';
import { createWorld } from './physics/world';
import { GameLoop } from './physics/loop';
import { generateFortress } from './ai/gemini';
import type { TerrainContext } from './ai/prompts';
import { safeSpawn } from './ai/overlap';
import type { KingState } from './types';

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

// Damage multipliers per material hitting the King
const DAMAGE_MULTIPLIERS: Record<string, number> = {
    wood: 1.0,
    stone: 3.0,
    ice: 0.5,
    rubber: 1.0,
    steel: 10.0,
    Terrain: 1.0,
};

const KING_MAX_HP = 100;
const IMPACT_THRESHOLD = 5;

function spawnKing(world: Matter.World, terrain: { buildZones: { x: number; width: number; y: number }[]; points: { x: number; y: number }[] }): { body: Matter.Body; state: KingState } {
    let spawnX: number;
    let spawnY: number;

    if (terrain.buildZones.length > 0) {
        const zone = terrain.buildZones[0];
        spawnX = zone.x + zone.width / 2;
        spawnY = zone.y - 15; // radius 12 + small gap
    } else {
        // Fallback: center of canvas, interpolate terrain Y
        spawnX = 400;
        spawnY = 500; // rough fallback
        for (let i = 0; i < terrain.points.length - 1; i++) {
            if (terrain.points[i].x <= spawnX && terrain.points[i + 1].x >= spawnX) {
                const t = (spawnX - terrain.points[i].x) / (terrain.points[i + 1].x - terrain.points[i].x);
                spawnY = terrain.points[i].y + t * (terrain.points[i + 1].y - terrain.points[i].y) - 15;
                break;
            }
        }
    }

    const body = Matter.Bodies.circle(spawnX, spawnY, 12, {
        density: 0.003,
        restitution: 0.5,
        friction: 0.5,
        label: 'king',
    });

    Matter.World.add(world, body);

    const state: KingState = {
        bodyId: body.id,
        hp: KING_MAX_HP,
        maxHp: KING_MAX_HP,
        position: { x: body.position.x, y: body.position.y },
    };

    return { body, state };
}

// Initialize Physics
let worldState = createWorld();
let { engine, world, terrain, seed } = worldState;

const king = spawnKing(world, terrain);
let kingBody = king.body;
let kingState = king.state;

const gameLoop = new GameLoop(engine, io, kingState);
gameLoop.start();

// Collision damage system
Matter.Events.on(engine, 'collisionStart', (event) => {
    for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;

        let otherBody: Matter.Body | null = null;
        if (bodyA.id === kingState.bodyId) otherBody = bodyB;
        else if (bodyB.id === kingState.bodyId) otherBody = bodyA;
        else continue;

        if (kingState.hp <= 0) continue;

        const getMomentum = (b: Matter.Body) => {
            if (b.isStatic) return 0;
            return b.speed * b.mass;
        };
        const impactForce = getMomentum(bodyA) + getMomentum(bodyB);
        if (impactForce < IMPACT_THRESHOLD || isNaN(impactForce)) continue;

        const multiplier = DAMAGE_MULTIPLIERS[otherBody.label] ?? 1.0;
        const damage = (impactForce - IMPACT_THRESHOLD) * multiplier;
        kingState.hp = Math.max(0, kingState.hp - damage);
        kingState.position = { x: kingBody.position.x, y: kingBody.position.y };

        console.log(`King hit by ${otherBody.label} | force=${impactForce.toFixed(1)} | damage=${damage.toFixed(1)} | HP=${kingState.hp.toFixed(1)}/${kingState.maxHp}`);

        io.emit('king_damage', {
            hp: kingState.hp,
            maxHp: kingState.maxHp,
            damage,
            source: otherBody.label,
        });

        if (kingState.hp <= 0) {
            console.log('King is dead!');
            io.emit('king_dead');
        }
    }
});

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

            const terrainCtx: TerrainContext = {
                surfacePoints: terrain.points,
                buildZones: terrain.buildZones,
                kingPosition: { x: kingBody.position.x, y: kingBody.position.y },
            };

            const plan = await generateFortress(apiKey, prompt, terrainCtx);

            socket.emit('build_status', { status: 'building', message: plan.thought_chain });

            // Run safe spawn to resolve overlaps
            const { adjustedBodies, adjustmentCount } = safeSpawn(plan.bodies, world);
            if (adjustmentCount > 0) {
                console.log(`Safe spawn adjusted ${adjustmentCount} bodies to avoid overlaps`);
            }

            let spawnedCount = 0;
            adjustedBodies.forEach(b => {
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

    // Clear all dynamic bodies (preserve the King)
    socket.on('clear_world', () => {
        const allBodies = Matter.Composite.allBodies(world);
        const dynamicBodies = allBodies.filter(b => !b.isStatic && b.id !== kingState.bodyId);
        Matter.Composite.remove(world, dynamicBodies);

        // Reset King HP and position
        kingState.hp = kingState.maxHp;

        if (terrain.buildZones.length > 0) {
            const zone = terrain.buildZones[0];
            const resetX = zone.x + zone.width / 2;
            const resetY = zone.y - 15;
            Matter.Body.setPosition(kingBody, { x: resetX, y: resetY });
            Matter.Body.setVelocity(kingBody, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(kingBody, 0);
        }
        kingState.position = { x: kingBody.position.x, y: kingBody.position.y };

        io.emit('world_cleared');
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Game Server running on port ${PORT}`);
});
