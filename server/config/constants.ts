// === Canvas / World ===
export const CANVAS_WIDTH = 800;   // viewport size (client canvas)
export const CANVAS_HEIGHT = 600;
export const WORLD_WIDTH = 2400;   // full world width (expanded)

// === Side bounds ===
export const LEFT_SIDE = { min: 0, max: 1200 };
export const RIGHT_SIDE = { min: 1200, max: 2400 };
export const LEFT_CANNON_X = 20;
export const RIGHT_CANNON_X = 2380;

// === Phase timers ===
export const BUILD_PHASE_DURATION_MS = 90_000;
export const COMBAT_TURN_DURATION_MS = 15_000;
export const REVEAL_DURATION_MS = 5_000;
export const SETTLE_TIMEOUT_MS = 3_000;
export const SETTLE_MAX_TIMEOUT_MS = 8_000;
export const SETTLE_POLL_INTERVAL_MS = 200;
export const SETTLE_SPEED_THRESHOLD = 0.5;

// === Materials ===
export const MATERIAL_PROPS: Record<string, { density: number; friction: number; frictionStatic: number; restitution: number }> = {
    wood: { density: 0.005, friction: 2.0, frictionStatic: 10.0, restitution: 0.0 }, // High friction for stickiness
    stone: { density: 0.02, friction: 2.5, frictionStatic: 10.0, restitution: 0.0 },
    ice: { density: 0.008, friction: 0.1, frictionStatic: 0.2, restitution: 0.03 },
    rubber: { density: 0.005, friction: 1.2, frictionStatic: 2.0, restitution: 0.4 },
    steel: { density: 0.04, friction: 0.8, frictionStatic: 2.0, restitution: 0.01 },
};

export const DAMAGE_MULTIPLIERS: Record<string, number> = {
    wood: 1.0,
    stone: 3.0,
    ice: 0.5,
    rubber: 1.0,
    steel: 10.0,
    Terrain: 1.0,
};

export const MATERIAL_COLORS: Record<string, string> = {
    wood: '#A67C52',
    stone: '#7D7D7D',
    ice: '#A5F2F3',
    rubber: '#FF69B4',
    steel: '#434B4D',
    king: '#FFD700',
    foundation: '#7D7D7D',
};

export const MATERIAL_BLOCK_HP: Record<string, number> = {
    wood: 30,
    stone: 80,
    ice: 15,
    rubber: 40,
    steel: 200,
};

// === King ===
export const KING_MAX_HP = 100;
export const IMPACT_THRESHOLD = 5;
export const DAMAGE_SCALE = 0.3;

// === Rounds ===
export const ROUNDS_TO_WIN = 2;
export const MAX_ROUNDS = 3;
export const ROUND_INTERSTITIAL_MS = 4000;

// === Hazards ===
export const WIND_STRENGTH = 0.0005; // Tuned for constant force (affects light objects more)
export const LAVA_DAMAGE_PER_TICK = 0.5;
export const FALLING_ROCK_INTERVAL_MS = 3000;
export const FALLING_ROCK_RADIUS = 12;
export const FALLING_ROCK_DAMAGE = 15;

// === Collision categories (bitmask) ===
export const COL_DEFAULT = 0x0001;
export const COL_BLOCK = 0x0002;
export const COL_DIVIDER = 0x0004;

// === Shape dimensions ===
export const SHAPE_DIMS: Record<string, [number, number]> = {
    rectangle: [30, 30],
    pillar: [30, 90],
    beam: [90, 15],
};

// === Scoring ===
export const SCORE_DAMAGE_MULTIPLIER = 10;       // points per unit of damage dealt
export const SCORE_RESOURCE_MAX_BONUS = 200;     // max bonus for using fewer resources
export const SCORE_RESOURCE_THRESHOLD = 50;      // max blocks before bonus drops to 0
export const SCORE_TIME_MAX_BONUS = 300;         // max bonus for fast kills
export const SCORE_TIME_THRESHOLD_MS = 120_000;  // combat time after which time bonus is 0
export const SCORE_WIN_BONUS = 500;              // flat bonus for winning
export const MAX_MATCH_HISTORY = 20;             // max history entries per player

// === Bot AI ===
export const BOT_FIRE_DELAY_MS = 1500;
export const BOT_BUILD_DELAY_MS = 2000;

// === Projectiles ===
export const PROJECTILE_RADIUS = 8;
export const PROJECTILE_DENSITY = 0.05;
export const PROJECTILE_RESTITUTION = 0.3;
export const PROJECTILE_FRICTION = 0.2;
export const PROJECTILE_LIFESPAN_MS = 5000;
export const PROJECTILE_BLOCK_DAMAGE_MULT = 2.0;
export const PROJECTILE_MIN_IMPACT = 3;

// === Physics ===
export const PHYSICS_GRAVITY = 2.0;
export const PHYSICS_GRAVITY_SCALE = 0.001;
export const PHYSICS_MAX_SPEED = 1000;
export const PHYSICS_POWER_MULTIPLIER = 1.0;
export const PHYSICS_AIR_FRICTION = 0.005;
