import Matter from 'matter-js';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const decomp = require('poly-decomp');
import { generateTerrain, getRandomSeed, TerrainResult } from './terrain';

// Enable poly-decomp for concave body support (terrain)
Matter.Common.setDecomp(decomp);

export interface WorldResult {
    engine: Matter.Engine;
    world: Matter.World;
    terrain: TerrainResult;
    seed: number;
}

export const createWorld = (seed?: number): WorldResult => {
    const engine = Matter.Engine.create();
    const world = engine.world;

    engine.gravity.y = 1;

    const terrainSeed = seed ?? getRandomSeed();

    // Generate procedural terrain
    const terrain = generateTerrain({
        seed: terrainSeed,
        width: 800,
        height: 600,
        baseHeight: 520,
        amplitude: 60,
        resolution: 25,
        octaves: 3
    });

    Matter.World.add(world, terrain.body);

    return { engine, world, terrain, seed: terrainSeed };
};
