import { describe, it, expect } from 'vitest';
import { BodySchema, FortressSchema } from '../schema';

describe('BodySchema', () => {
    const validBody = {
        shape: 'rectangle' as const,
        material: 'wood' as const,
        x: 400,
        y: 300,
        dimensions: [30, 60],
    };

    it('accepts a valid body with all fields', () => {
        const result = BodySchema.safeParse({
            ...validBody,
            angle: 0.5,
            description: 'A wooden wall',
        });
        expect(result.success).toBe(true);
    });

    it('accepts a valid body with only required fields', () => {
        const result = BodySchema.safeParse(validBody);
        expect(result.success).toBe(true);
    });

    it('defaults angle to 0 when omitted', () => {
        const result = BodySchema.parse(validBody);
        expect(result.angle).toBe(0);
    });

    // Shape validation
    it('accepts all valid shapes', () => {
        for (const shape of ['rectangle', 'circle', 'triangle'] as const) {
            const result = BodySchema.safeParse({ ...validBody, shape });
            expect(result.success).toBe(true);
        }
    });

    it('rejects invalid shape', () => {
        const result = BodySchema.safeParse({ ...validBody, shape: 'hexagon' });
        expect(result.success).toBe(false);
    });

    // Material validation
    it('accepts all valid materials', () => {
        for (const material of ['wood', 'stone', 'ice', 'rubber', 'steel'] as const) {
            const result = BodySchema.safeParse({ ...validBody, material });
            expect(result.success).toBe(true);
        }
    });

    it('rejects invalid material', () => {
        const result = BodySchema.safeParse({ ...validBody, material: 'diamond' });
        expect(result.success).toBe(false);
    });

    // Coordinate bounds
    it('rejects x below minimum (-200)', () => {
        const result = BodySchema.safeParse({ ...validBody, x: -201 });
        expect(result.success).toBe(false);
    });

    it('rejects x above maximum (2600)', () => {
        const result = BodySchema.safeParse({ ...validBody, x: 2601 });
        expect(result.success).toBe(false);
    });

    it('rejects y below minimum (-200)', () => {
        const result = BodySchema.safeParse({ ...validBody, y: -201 });
        expect(result.success).toBe(false);
    });

    it('rejects y above maximum (700)', () => {
        const result = BodySchema.safeParse({ ...validBody, y: 701 });
        expect(result.success).toBe(false);
    });

    it('accepts boundary coordinates', () => {
        const result = BodySchema.safeParse({ ...validBody, x: -200, y: 700 });
        expect(result.success).toBe(true);
    });

    // Dimensions validation
    it('rejects dimension below minimum (5)', () => {
        const result = BodySchema.safeParse({ ...validBody, dimensions: [4] });
        expect(result.success).toBe(false);
    });

    it('rejects dimension above maximum (120)', () => {
        const result = BodySchema.safeParse({ ...validBody, dimensions: [121] });
        expect(result.success).toBe(false);
    });

    it('rejects empty dimensions array', () => {
        const result = BodySchema.safeParse({ ...validBody, dimensions: [] });
        expect(result.success).toBe(false);
    });

    it('rejects more than 2 dimensions', () => {
        const result = BodySchema.safeParse({ ...validBody, dimensions: [10, 20, 30] });
        expect(result.success).toBe(false);
    });

    it('accepts single dimension (for circles)', () => {
        const result = BodySchema.safeParse({ ...validBody, shape: 'circle', dimensions: [15] });
        expect(result.success).toBe(true);
    });

    // Angle validation
    it('rejects angle beyond PI', () => {
        const result = BodySchema.safeParse({ ...validBody, angle: Math.PI + 0.1 });
        expect(result.success).toBe(false);
    });

    it('rejects angle below -PI', () => {
        const result = BodySchema.safeParse({ ...validBody, angle: -Math.PI - 0.1 });
        expect(result.success).toBe(false);
    });

    // Description validation
    it('rejects description over 200 characters', () => {
        const result = BodySchema.safeParse({ ...validBody, description: 'x'.repeat(201) });
        expect(result.success).toBe(false);
    });
});

describe('FortressSchema', () => {
    const validFortress = {
        thought_chain: 'Build a strong wall with a roof',
        bodies: [
            { shape: 'rectangle', material: 'stone', x: 400, y: 500, dimensions: [90, 15] },
            { shape: 'rectangle', material: 'wood', x: 400, y: 480, dimensions: [30, 30] },
        ],
    };

    it('accepts a valid fortress plan', () => {
        const result = FortressSchema.safeParse(validFortress);
        expect(result.success).toBe(true);
    });

    it('accepts an empty bodies array', () => {
        const result = FortressSchema.safeParse({ thought_chain: 'Nothing to build', bodies: [] });
        expect(result.success).toBe(true);
    });

    it('accepts exactly 50 bodies (the max)', () => {
        const bodies = Array.from({ length: 50 }, (_, i) => ({
            shape: 'rectangle',
            material: 'wood',
            x: 100 + i * 10,
            y: 400,
            dimensions: [10, 10],
        }));
        const result = FortressSchema.safeParse({ thought_chain: 'Max fortress', bodies });
        expect(result.success).toBe(true);
    });

    it('rejects more than 50 bodies', () => {
        const bodies = Array.from({ length: 51 }, (_, i) => ({
            shape: 'rectangle',
            material: 'wood',
            x: 100 + i * 10,
            y: 400,
            dimensions: [10, 10],
        }));
        const result = FortressSchema.safeParse({ thought_chain: 'Too many blocks', bodies });
        expect(result.success).toBe(false);
    });

    it('requires thought_chain', () => {
        const result = FortressSchema.safeParse({ bodies: [] });
        expect(result.success).toBe(false);
    });

    it('rejects if any body in the array is invalid', () => {
        const result = FortressSchema.safeParse({
            thought_chain: 'Bad body included',
            bodies: [
                { shape: 'rectangle', material: 'wood', x: 400, y: 400, dimensions: [30, 30] },
                { shape: 'invalid', material: 'wood', x: 400, y: 400, dimensions: [30, 30] },
            ],
        });
        expect(result.success).toBe(false);
    });
});
