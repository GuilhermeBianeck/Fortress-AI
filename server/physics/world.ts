import Matter from 'matter-js';
import { generateTerrain, getRandomSeed, TerrainResult } from './terrain';
import { WORLD_WIDTH, CANVAS_HEIGHT } from '../config/constants';

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

    return { engine, world, terrain, seed: terrainSeed };
};
