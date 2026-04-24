import { describe, it, expect } from 'vitest';
import { generateTerrain, getRandomSeed } from '../terrain';

describe('generateTerrain', () => {
    it('returns terrain bodies, surface points, and build zones', () => {
        const result = generateTerrain({ seed: 42 });
        expect(result.bodies.length).toBeGreaterThan(0);
        expect(result.points.length).toBeGreaterThan(0);
        expect(Array.isArray(result.buildZones)).toBe(true);
    });

    it('generates deterministic terrain from same seed', () => {
        const a = generateTerrain({ seed: 123 });
        const b = generateTerrain({ seed: 123 });

        expect(a.points).toEqual(b.points);
        expect(a.buildZones).toEqual(b.buildZones);
        expect(a.bodies.length).toBe(b.bodies.length);
    });

    it('generates different terrain from different seeds', () => {
        const a = generateTerrain({ seed: 100 });
        const b = generateTerrain({ seed: 200 });

        // Points should differ (at least some)
        const aDiffs = a.points.map(p => p.y);
        const bDiffs = b.points.map(p => p.y);
        expect(aDiffs).not.toEqual(bDiffs);
    });

    it('surface points span the full width', () => {
        const result = generateTerrain({ width: 2400, seed: 42 });
        const xs = result.points.map(p => p.x);
        expect(Math.min(...xs)).toBe(0);
        expect(Math.max(...xs)).toBe(2400);
    });

    it('surface points are spaced by resolution', () => {
        const result = generateTerrain({ resolution: 20, seed: 42 });
        for (let i = 1; i < result.points.length - 1; i++) {
            const dx = result.points[i].x - result.points[i - 1].x;
            expect(dx).toBe(20);
        }
    });

    it('surface Y values stay within expected range', () => {
        const baseHeight = 520;
        const amplitude = 120;
        const result = generateTerrain({ seed: 42, baseHeight, amplitude });

        for (const point of result.points) {
            expect(point.y).toBeGreaterThanOrEqual(baseHeight - amplitude - 1);
            expect(point.y).toBeLessThanOrEqual(baseHeight + amplitude + 1);
        }
    });

    it('terrain bodies are all static', () => {
        const result = generateTerrain({ seed: 42 });
        for (const body of result.bodies) {
            expect(body.isStatic).toBe(true);
        }
    });

    it('terrain bodies are labeled Terrain', () => {
        const result = generateTerrain({ seed: 42 });
        for (const body of result.bodies) {
            expect(body.label).toBe('Terrain');
        }
    });

    it('creates N-1 segments for N points', () => {
        const result = generateTerrain({ seed: 42 });
        // Each adjacent pair of surface points creates one trapezoid segment
        expect(result.bodies.length).toBe(result.points.length - 1);
    });

    it('respects custom config overrides', () => {
        const result = generateTerrain({ width: 1000, resolution: 50, seed: 99 });
        const xs = result.points.map(p => p.x);
        expect(Math.max(...xs)).toBe(1000);
    });
});

describe('build zones', () => {
    it('build zones have positive width', () => {
        const result = generateTerrain({ seed: 42 });
        for (const zone of result.buildZones) {
            expect(zone.width).toBeGreaterThan(0);
        }
    });

    it('build zones have minimum width of 100px', () => {
        const result = generateTerrain({ seed: 42 });
        for (const zone of result.buildZones) {
            expect(zone.width).toBeGreaterThanOrEqual(100);
        }
    });

    it('build zones are within world bounds', () => {
        const result = generateTerrain({ width: 2400, seed: 42 });
        for (const zone of result.buildZones) {
            expect(zone.x).toBeGreaterThanOrEqual(0);
            expect(zone.x + zone.width).toBeLessThanOrEqual(2400);
        }
    });
});

describe('getRandomSeed', () => {
    it('returns a positive integer', () => {
        const seed = getRandomSeed();
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThan(1_000_000);
        expect(Number.isInteger(seed)).toBe(true);
    });
});
