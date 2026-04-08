import { describe, it, expect, vi } from 'vitest';
import Matter from 'matter-js';
import { generateHazards, applyWindForce, checkLavaDamage } from '../hazards';
import { generateTerrain } from '../terrain';
import type { HazardData, KingState, Side } from '../../types';
import { WORLD_WIDTH, CANVAS_HEIGHT, LAVA_DAMAGE_PER_TICK } from '../../config/constants';

describe('generateHazards', () => {
    const terrain = generateTerrain({ seed: 42, width: WORLD_WIDTH });

    it('generates 1 or 2 hazards', () => {
        // Run with multiple seeds to verify the count is always 1 or 2
        for (let seed = 0; seed < 50; seed++) {
            const hazards = generateHazards(terrain, seed);
            expect(hazards.length).toBeGreaterThanOrEqual(1);
            expect(hazards.length).toBeLessThanOrEqual(2);
        }
    });

    it('generates deterministic hazards from same seed', () => {
        const a = generateHazards(terrain, 100);
        const b = generateHazards(terrain, 100);
        expect(a).toEqual(b);
    });

    it('generates different hazards from different seeds', () => {
        const a = generateHazards(terrain, 100);
        const b = generateHazards(terrain, 200);
        // At least the IDs should differ
        expect(a.map(h => h.id)).not.toEqual(b.map(h => h.id));
    });

    it('wind zones cover the full world', () => {
        // Find a seed that produces a wind zone
        for (let seed = 0; seed < 50; seed++) {
            const hazards = generateHazards(terrain, seed);
            const wind = hazards.find(h => h.type === 'wind_zone');
            if (wind) {
                expect(wind.width).toBe(WORLD_WIDTH);
                expect(wind.height).toBe(CANVAS_HEIGHT);
                expect(wind.windDirection).toBeDefined();
                expect(Math.abs(wind.windDirection!)).toBe(1);
                expect(wind.windStrength).toBeGreaterThan(0);
                return;
            }
        }
    });

    it('lava pools are placed in the middle zone', () => {
        for (let seed = 0; seed < 50; seed++) {
            const hazards = generateHazards(terrain, seed);
            const lava = hazards.find(h => h.type === 'lava_pool');
            if (lava) {
                expect(lava.position.x).toBeGreaterThanOrEqual(400);
                expect(lava.position.x + lava.width).toBeLessThanOrEqual(1200 + 200); // midEnd + max width
                expect(lava.damage).toBe(LAVA_DAMAGE_PER_TICK);
                return;
            }
        }
    });

    it('falling rocks are placed in the middle zone', () => {
        for (let seed = 0; seed < 50; seed++) {
            const hazards = generateHazards(terrain, seed);
            const rocks = hazards.find(h => h.type === 'falling_rocks');
            if (rocks) {
                expect(rocks.position.x).toBeGreaterThanOrEqual(400);
                expect(rocks.position.y).toBe(0);
                expect(rocks.height).toBe(CANVAS_HEIGHT);
                return;
            }
        }
    });
});

describe('applyWindForce', () => {
    it('applies horizontal force to dynamic bodies inside wind zone', () => {
        const body = Matter.Bodies.rectangle(500, 300, 30, 30);
        const applyForceSpy = vi.spyOn(Matter.Body, 'applyForce');

        const wind: HazardData = {
            type: 'wind_zone',
            id: 'wind-1',
            position: { x: 0, y: 0 },
            width: WORLD_WIDTH,
            height: CANVAS_HEIGHT,
            windDirection: 1,
            windStrength: 0.001,
        };

        applyWindForce([body], [wind]);

        expect(applyForceSpy).toHaveBeenCalled();
        const forceArg = applyForceSpy.mock.calls[0][2];
        expect(forceArg.x).toBeGreaterThan(0); // positive direction
        expect(forceArg.y).toBe(0); // wind is horizontal only
        applyForceSpy.mockRestore();
    });

    it('does not apply force to static bodies', () => {
        const body = Matter.Bodies.rectangle(500, 300, 30, 30, { isStatic: true });
        const applyForceSpy = vi.spyOn(Matter.Body, 'applyForce');

        const wind: HazardData = {
            type: 'wind_zone',
            id: 'wind-1',
            position: { x: 0, y: 0 },
            width: WORLD_WIDTH,
            height: CANVAS_HEIGHT,
            windDirection: 1,
            windStrength: 0.001,
        };

        applyWindForce([body], [wind]);
        expect(applyForceSpy).not.toHaveBeenCalled();
        applyForceSpy.mockRestore();
    });

    it('skips bodies labeled Terrain', () => {
        const body = Matter.Bodies.rectangle(500, 300, 30, 30, { label: 'Terrain' });
        const applyForceSpy = vi.spyOn(Matter.Body, 'applyForce');

        const wind: HazardData = {
            type: 'wind_zone',
            id: 'wind-1',
            position: { x: 0, y: 0 },
            width: WORLD_WIDTH,
            height: CANVAS_HEIGHT,
            windDirection: 1,
            windStrength: 0.001,
        };

        applyWindForce([body], [wind]);
        expect(applyForceSpy).not.toHaveBeenCalled();
        applyForceSpy.mockRestore();
    });

    it('does nothing with empty hazard list', () => {
        const body = Matter.Bodies.rectangle(500, 300, 30, 30);
        const applyForceSpy = vi.spyOn(Matter.Body, 'applyForce');

        applyWindForce([body], []);
        expect(applyForceSpy).not.toHaveBeenCalled();
        applyForceSpy.mockRestore();
    });

    it('respects forceMultiplier', () => {
        const body = Matter.Bodies.rectangle(500, 300, 30, 30);
        const applyForceSpy = vi.spyOn(Matter.Body, 'applyForce');

        const wind: HazardData = {
            type: 'wind_zone',
            id: 'wind-1',
            position: { x: 0, y: 0 },
            width: WORLD_WIDTH,
            height: CANVAS_HEIGHT,
            windDirection: 1,
            windStrength: 0.001,
        };

        applyWindForce([body], [wind], 1);
        const force1 = applyForceSpy.mock.calls[0][2].x;
        applyForceSpy.mockClear();

        applyWindForce([body], [wind], 4);
        const force4 = applyForceSpy.mock.calls[0][2].x;

        expect(force4).toBeCloseTo(force1 * 4, 10);
        applyForceSpy.mockRestore();
    });
});

describe('checkLavaDamage', () => {
    it('damages blocks sitting in lava', () => {
        const engine = Matter.Engine.create();
        const body = Matter.Bodies.rectangle(500, 300, 30, 30) as any;
        body.blockHp = 100;
        Matter.Composite.add(engine.world, body);

        const lava: HazardData = {
            type: 'lava_pool',
            id: 'lava-1',
            position: { x: 480, y: 280 },
            width: 80,
            height: 40,
            damage: 10,
        };

        const emitDmg = vi.fn();
        checkLavaDamage([body], engine.world, [lava], new Map(), emitDmg);

        expect(body.blockHp).toBeLessThan(100);
    });

    it('removes blocks when HP reaches 0', () => {
        const engine = Matter.Engine.create();
        const body = Matter.Bodies.rectangle(500, 300, 30, 30) as any;
        body.blockHp = 0.01; // Nearly dead
        Matter.Composite.add(engine.world, body);

        const lava: HazardData = {
            type: 'lava_pool',
            id: 'lava-1',
            position: { x: 480, y: 280 },
            width: 80,
            height: 40,
            damage: 10,
        };

        const bodyCountBefore = Matter.Composite.allBodies(engine.world).length;
        checkLavaDamage([body], engine.world, [lava], new Map(), vi.fn());

        expect(Matter.Composite.allBodies(engine.world).length).toBeLessThan(bodyCountBefore);
    });

    it('damages kings in lava and emits callback', () => {
        const engine = Matter.Engine.create();
        const kingBody = Matter.Bodies.circle(500, 300, 12, { label: 'king' }) as any;
        kingBody.side = 'left';
        Matter.Composite.add(engine.world, kingBody);

        const kingState: KingState = {
            bodyId: kingBody.id,
            hp: 100,
            maxHp: 100,
            position: { x: 500, y: 300 },
        };

        const kings = new Map<Side, KingState>();
        kings.set('left', kingState);

        const lava: HazardData = {
            type: 'lava_pool',
            id: 'lava-1',
            position: { x: 480, y: 280 },
            width: 80,
            height: 40,
            damage: 10,
        };

        const emitDmg = vi.fn();
        checkLavaDamage([kingBody], engine.world, [lava], kings, emitDmg);

        expect(kingState.hp).toBeLessThan(100);
        expect(emitDmg).toHaveBeenCalledWith('left', expect.any(Number));
    });

    it('does not damage bodies outside lava bounds', () => {
        const engine = Matter.Engine.create();
        const body = Matter.Bodies.rectangle(100, 100, 30, 30) as any;
        body.blockHp = 100;
        Matter.Composite.add(engine.world, body);

        const lava: HazardData = {
            type: 'lava_pool',
            id: 'lava-1',
            position: { x: 480, y: 480 },
            width: 80,
            height: 10,
            damage: 10,
        };

        checkLavaDamage([body], engine.world, [lava], new Map(), vi.fn());
        expect(body.blockHp).toBe(100);
    });

    it('skips static bodies', () => {
        const engine = Matter.Engine.create();
        const body = Matter.Bodies.rectangle(500, 300, 30, 30, { isStatic: true }) as any;
        body.blockHp = 100;
        Matter.Composite.add(engine.world, body);

        const lava: HazardData = {
            type: 'lava_pool',
            id: 'lava-1',
            position: { x: 480, y: 280 },
            width: 80,
            height: 40,
            damage: 10,
        };

        checkLavaDamage([body], engine.world, [lava], new Map(), vi.fn());
        expect(body.blockHp).toBe(100);
    });
});
