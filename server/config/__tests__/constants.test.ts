import { describe, it, expect } from 'vitest';
import {
    MATERIAL_PROPS,
    MATERIAL_BLOCK_HP,
    DAMAGE_MULTIPLIERS,
    MATERIAL_COLORS,
    WORLD_WIDTH,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    LEFT_SIDE,
    RIGHT_SIDE,
    BUILD_PHASE_DURATION_MS,
    COMBAT_TURN_DURATION_MS,
    REVEAL_DURATION_MS,
    KING_MAX_HP,
    ROUNDS_TO_WIN,
    MAX_ROUNDS,
    SETTLE_SPEED_THRESHOLD,
    SETTLE_CONFIRM_COUNT,
    PROJECTILE_RADIUS,
} from '../constants';

const MATERIALS = ['wood', 'stone', 'ice', 'rubber', 'steel'];

describe('Material definitions', () => {
    it('all materials have physics properties', () => {
        for (const mat of MATERIALS) {
            expect(MATERIAL_PROPS[mat]).toBeDefined();
            expect(MATERIAL_PROPS[mat].density).toBeGreaterThan(0);
            expect(MATERIAL_PROPS[mat].friction).toBeGreaterThanOrEqual(0);
            expect(MATERIAL_PROPS[mat].restitution).toBeGreaterThanOrEqual(0);
        }
    });

    it('all materials have block HP', () => {
        for (const mat of MATERIALS) {
            expect(MATERIAL_BLOCK_HP[mat]).toBeGreaterThan(0);
        }
    });

    it('all materials have damage multipliers', () => {
        for (const mat of MATERIALS) {
            expect(DAMAGE_MULTIPLIERS[mat]).toBeGreaterThan(0);
        }
    });

    it('all materials have colors', () => {
        for (const mat of MATERIALS) {
            expect(MATERIAL_COLORS[mat]).toBeDefined();
            expect(MATERIAL_COLORS[mat]).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
    });

    it('steel is denser than wood', () => {
        expect(MATERIAL_PROPS.steel.density).toBeGreaterThan(MATERIAL_PROPS.wood.density);
    });

    it('steel has more HP than wood', () => {
        expect(MATERIAL_BLOCK_HP.steel).toBeGreaterThan(MATERIAL_BLOCK_HP.wood);
    });

    it('ice has the lowest HP', () => {
        for (const mat of MATERIALS) {
            expect(MATERIAL_BLOCK_HP.ice).toBeLessThanOrEqual(MATERIAL_BLOCK_HP[mat]);
        }
    });
});

describe('World dimensions', () => {
    it('world is wider than canvas viewport', () => {
        expect(WORLD_WIDTH).toBeGreaterThan(CANVAS_WIDTH);
    });

    it('left and right sides cover the full world width', () => {
        expect(LEFT_SIDE.min).toBe(0);
        expect(RIGHT_SIDE.max).toBe(WORLD_WIDTH);
    });

    it('left and right sides share a boundary', () => {
        expect(LEFT_SIDE.max).toBe(RIGHT_SIDE.min);
    });

    it('canvas dimensions are positive', () => {
        expect(CANVAS_WIDTH).toBeGreaterThan(0);
        expect(CANVAS_HEIGHT).toBeGreaterThan(0);
    });
});

describe('Phase timers', () => {
    it('build phase is longer than combat turn', () => {
        expect(BUILD_PHASE_DURATION_MS).toBeGreaterThan(COMBAT_TURN_DURATION_MS);
    });

    it('reveal duration is positive', () => {
        expect(REVEAL_DURATION_MS).toBeGreaterThan(0);
    });

    it('all timers are in milliseconds (> 1000)', () => {
        expect(BUILD_PHASE_DURATION_MS).toBeGreaterThanOrEqual(1000);
        expect(COMBAT_TURN_DURATION_MS).toBeGreaterThanOrEqual(1000);
        expect(REVEAL_DURATION_MS).toBeGreaterThanOrEqual(1000);
    });
});

describe('Game rules', () => {
    it('rounds to win is achievable within max rounds', () => {
        expect(ROUNDS_TO_WIN).toBeLessThanOrEqual(MAX_ROUNDS);
    });

    it('king has positive HP', () => {
        expect(KING_MAX_HP).toBeGreaterThan(0);
    });

    it('settle detection has sane values', () => {
        expect(SETTLE_SPEED_THRESHOLD).toBeGreaterThan(0);
        expect(SETTLE_CONFIRM_COUNT).toBeGreaterThanOrEqual(1);
    });

    it('projectile has positive radius', () => {
        expect(PROJECTILE_RADIUS).toBeGreaterThan(0);
    });
});
