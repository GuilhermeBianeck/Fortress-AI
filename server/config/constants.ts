// === Canvas / World ===
export const CANVAS_WIDTH = 800;   // viewport size (client canvas)
export const CANVAS_HEIGHT = 600;
export const WORLD_WIDTH = 1600;   // full world width (2 players)

// === Side bounds ===
export const LEFT_SIDE = { min: 0, max: 800 };
export const RIGHT_SIDE = { min: 800, max: 1600 };
export const LEFT_CANNON_X = 20;
export const RIGHT_CANNON_X = 1580;

// === Phase timers ===
export const BUILD_PHASE_DURATION_MS = 90_000;
export const COMBAT_TURN_DURATION_MS = 15_000;
export const REVEAL_DURATION_MS = 5_000;
export const SETTLE_TIMEOUT_MS = 3_000;
export const SETTLE_MAX_TIMEOUT_MS = 8_000;
export const SETTLE_POLL_INTERVAL_MS = 200;
export const SETTLE_SPEED_THRESHOLD = 0.5;

// === Materials ===
export const MATERIAL_PROPS: Record<string, { density: number; friction: number; restitution: number }> = {
    wood:   { density: 0.005, friction: 0.6,  restitution: 0.1  },
    stone:  { density: 0.02,  friction: 0.9,  restitution: 0.05 },
    ice:    { density: 0.008, friction: 0.02, restitution: 0.05 },
    rubber: { density: 0.005, friction: 1.0,  restitution: 0.8  },
    steel:  { density: 0.04,  friction: 0.4,  restitution: 0.05 },
};

export const DAMAGE_MULTIPLIERS: Record<string, number> = {
    wood:    1.0,
    stone:   3.0,
    ice:     0.5,
    rubber:  1.0,
    steel:   10.0,
    Terrain: 1.0,
};

export const MATERIAL_COLORS: Record<string, string> = {
    wood:   '#A67C52',
    stone:  '#7D7D7D',
    ice:    '#A5F2F3',
    rubber: '#FF69B4',
    steel:  '#434B4D',
    king:   '#FFD700',
};

export const MATERIAL_BLOCK_HP: Record<string, number> = {
    wood:   30,
    stone:  80,
    ice:    15,
    rubber: 40,
    steel:  200,
};

// === King ===
export const KING_MAX_HP = 100;
export const IMPACT_THRESHOLD = 5;
export const DAMAGE_SCALE = 0.3;

// === Projectiles ===
export const PROJECTILE_RADIUS = 8;
export const PROJECTILE_DENSITY = 0.05;
export const PROJECTILE_RESTITUTION = 0.3;
export const PROJECTILE_FRICTION = 0.2;
export const PROJECTILE_LIFESPAN_MS = 5000;
export const PROJECTILE_BLOCK_DAMAGE_MULT = 2.0;
export const PROJECTILE_MIN_IMPACT = 3;
