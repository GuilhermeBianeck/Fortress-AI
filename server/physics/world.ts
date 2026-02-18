import Matter from 'matter-js';
import { generateTerrain, getRandomSeed, TerrainResult } from './terrain';
import { WORLD_WIDTH, CANVAS_HEIGHT, COL_DIVIDER, COL_BLOCK } from '../config/constants';

export interface WorldResult {
    engine: Matter.Engine;
    world: Matter.World;
    terrain: TerrainResult;
    seed: number;
}

export const createWorld = (seed?: number): WorldResult => {
    const engine = Matter.Engine.create();
    const world = engine.world;

    engine.gravity.y = 2;
    engine.enableSleeping = true;
    engine.positionIterations = 12; // Increased for stability
    engine.velocityIterations = 10;

    const terrainSeed = seed ?? getRandomSeed();

    // Generate procedural terrain for full 1600px world
    const terrain = generateTerrain({
        seed: terrainSeed,
        width: WORLD_WIDTH,
        height: CANVAS_HEIGHT,
        baseHeight: 520,
        amplitude: 60,
        resolution: 25,
        octaves: 3
    });

    Matter.World.add(world, terrain.bodies);

    // World boundary walls — prevent bodies from leaving the map
    const wallThickness = 50;
    const wallOptions = { isStatic: true, label: 'Boundary', friction: 0.5, restitution: 0.3 };

    const leftWall = Matter.Bodies.rectangle(
        -wallThickness / 2, CANVAS_HEIGHT / 2, wallThickness, CANVAS_HEIGHT * 2, wallOptions
    );
    const rightWall = Matter.Bodies.rectangle(
        WORLD_WIDTH + wallThickness / 2, CANVAS_HEIGHT / 2, wallThickness, CANVAS_HEIGHT * 2, wallOptions
    );
    const ceiling = Matter.Bodies.rectangle(
        WORLD_WIDTH / 2, -wallThickness / 2, WORLD_WIDTH + wallThickness * 2, wallThickness, wallOptions
    );

    // Center divider — blocks building materials from crossing, but lets projectiles through
    const divider = Matter.Bodies.rectangle(
        WORLD_WIDTH / 2, CANVAS_HEIGHT / 2, 4, CANVAS_HEIGHT * 2, {
        isStatic: true,
        label: 'Boundary',
        friction: 0.5,
        restitution: 0.3,
        collisionFilter: {
            category: COL_DIVIDER,
            mask: COL_BLOCK, // only collide with blocks
        },
    }
    );

    Matter.World.add(world, [leftWall, rightWall, ceiling, divider]);

    return { engine, world, terrain, seed: terrainSeed };
};
