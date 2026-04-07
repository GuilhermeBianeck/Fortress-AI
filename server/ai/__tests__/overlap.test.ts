import { describe, it, expect, beforeEach } from 'vitest';
import Matter from 'matter-js';
import { safeSpawn } from '../overlap';
import type { BodyPlan } from '../schema';

describe('safeSpawn', () => {
    let engine: Matter.Engine;
    let world: Matter.World;

    beforeEach(() => {
        engine = Matter.Engine.create();
        world = engine.world;
    });

    function makePlan(overrides: Partial<BodyPlan> = {}): BodyPlan {
        return {
            shape: 'rectangle',
            material: 'wood',
            x: 400,
            y: 400,
            dimensions: [30, 30],
            angle: 0,
            ...overrides,
        };
    }

    it('places non-overlapping bodies without adjustment', () => {
        const plans: BodyPlan[] = [
            makePlan({ x: 100, y: 400 }),
            makePlan({ x: 200, y: 400 }),
        ];

        const result = safeSpawn(plans, world);
        expect(result.adjustmentCount).toBe(0);
        expect(result.adjustedBodies).toHaveLength(2);
        expect(result.adjustedBodies[0].y).toBe(400);
        expect(result.adjustedBodies[1].y).toBe(400);
    });

    it('shifts overlapping bodies upward', () => {
        // Two bodies at the exact same position
        const plans: BodyPlan[] = [
            makePlan({ x: 400, y: 400 }),
            makePlan({ x: 400, y: 400 }),
        ];

        const result = safeSpawn(plans, world);
        expect(result.adjustmentCount).toBe(1);
        // Second body should have been shifted upward (lower y value)
        expect(result.adjustedBodies[1].y).toBeLessThan(400);
    });

    it('shifts bodies away from existing world bodies', () => {
        // Add a static body to the world
        const existingBlock = Matter.Bodies.rectangle(400, 400, 30, 30, { isStatic: true });
        Matter.Composite.add(world, existingBlock);

        const plans: BodyPlan[] = [makePlan({ x: 400, y: 400 })];

        const result = safeSpawn(plans, world);
        expect(result.adjustmentCount).toBe(1);
        expect(result.adjustedBodies[0].y).toBeLessThan(400);
    });

    it('preserves x coordinate when shifting', () => {
        const plans: BodyPlan[] = [
            makePlan({ x: 500, y: 400 }),
            makePlan({ x: 500, y: 400 }),
        ];

        const result = safeSpawn(plans, world);
        expect(result.adjustedBodies[0].x).toBe(500);
        expect(result.adjustedBodies[1].x).toBe(500);
    });

    it('handles circles correctly', () => {
        const plans: BodyPlan[] = [
            makePlan({ shape: 'circle', x: 400, y: 400, dimensions: [20] }),
            makePlan({ shape: 'circle', x: 400, y: 400, dimensions: [20] }),
        ];

        const result = safeSpawn(plans, world);
        expect(result.adjustmentCount).toBe(1);
        expect(result.adjustedBodies[1].y).toBeLessThan(400);
    });

    it('handles rotated rectangles', () => {
        const plans: BodyPlan[] = [
            makePlan({ x: 400, y: 400, dimensions: [60, 10], angle: Math.PI / 4 }),
            makePlan({ x: 400, y: 400, dimensions: [60, 10], angle: -Math.PI / 4 }),
        ];

        const result = safeSpawn(plans, world);
        expect(result.adjustmentCount).toBe(1);
    });

    it('caps shift attempts at max (50px total shift)', () => {
        // Place a large existing block
        const bigBlock = Matter.Bodies.rectangle(400, 400, 120, 120, { isStatic: true });
        Matter.Composite.add(world, bigBlock);

        const plans: BodyPlan[] = [makePlan({ x: 400, y: 400, dimensions: [120, 120] })];

        const result = safeSpawn(plans, world);
        // Even if still overlapping, it should have been placed after max attempts
        expect(result.adjustedBodies).toHaveLength(1);
        // Max shift: 10 attempts * 5px = 50px upward
        expect(result.adjustedBodies[0].y).toBeGreaterThanOrEqual(400 - 50);
    });

    it('returns empty results for empty plans', () => {
        const result = safeSpawn([], world);
        expect(result.adjustedBodies).toHaveLength(0);
        expect(result.adjustmentCount).toBe(0);
    });

    it('does not modify the original plan objects', () => {
        const plan = makePlan({ x: 400, y: 400 });
        const originalY = plan.y;

        // Add a collider so plan gets shifted
        const block = Matter.Bodies.rectangle(400, 400, 30, 30, { isStatic: true });
        Matter.Composite.add(world, block);

        safeSpawn([plan], world);
        expect(plan.y).toBe(originalY);
    });
});
