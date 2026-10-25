export interface Vector {
    x: number;
    y: number;
}

export interface BodyState {
    id: number;
    position: Vector;
    angle: number;
    velocity: Vector;
    label: string;
    side?: Side;
    isStatic: boolean;
    width: number;
    height: number;
    circleRadius: number;
    material: string;
    color: string;
    blockHp: number | null;
    blockMaxHp: number | null;
}

export type GameMode = 'build' | 'fire';
export type MatchPhase = 'lobby' | 'build' | 'reveal' | 'combat' | 'intermission' | 'result';
export type Side = 'left' | 'right';

export interface KingHpState {
    hp: number;
    maxHp: number;
    x?: number;
    y?: number;
}

export interface KingDamageEvent {
    side: Side; hp: number; maxHp: number; damage: number; source: string;
    timestamp?: number; position?: Vector; projectileId?: number;
    attackerSide?: Side;
}
export interface ProjectileImpactEvent {
    side?: Side;
    position: Vector; timestamp?: number; projectileId?: number; targetId?: number;
    target?: 'king' | 'block' | 'terrain'; material?: string; damage?: number; destroyed?: boolean;
}
export interface BlockDestroyedEvent {
    bodyId: number; position: Vector; material: string; velocity: Vector; timestamp?: number;
}

export interface GameState {
    bodies: BodyState[];
    timestamp: number;
    kings: {
        left: KingHpState;
        right: KingHpState;
    };
}

/** Compact delta-encoded payload from server (wire format) */
export interface CompactGameState {
    /** Dynamic body updates: [id, x, y, angle, vx, vy, hp] */
    u: number[][];
    /** New/full-sync bodies with full metadata */
    n: (BodyState & { position: Vector; angle: number; velocity: Vector; blockHp: number | null })[];
    /** Removed body IDs */
    r: number[];
    /** Timestamp */
    t: number;
    /** Kings (compact) */
    k: {
        l: KingHpState;
        r: KingHpState;
    };
    /** Full sync flag (1 = full sync) */
    f: number;
}

export interface RoomState {
    roomId: string;
    side: Side;
    phase: MatchPhase;
    opponentConnected: boolean;
    myName: string;
    opponentName: string;
    mode?: 'single' | 'pvp';
    difficulty?: import('../server/shared/difficulty').BotDifficulty;
    ready?: boolean;
    buildReady?: boolean;
}

export interface PauseState { paused: boolean; at: number; missing: { side: Side; deadline: number }[] }
export interface SessionState {
    roomId: string; matchId: string; side: Side; mode: 'single' | 'pvp'; difficulty: import('../server/shared/difficulty').BotDifficulty;
    players: { side: Side; name: string; ready: boolean; connected: boolean }[];
    terrain: (TerrainData & { hazards?: import('./game/BattleRenderer').BattleHazard[] }) | null;
    state: CompactGameState | null; phase: MatchPhase; endsAt: number | null; turn: Side | null; hasFired: boolean; buildReady: boolean; buildInterrupted: boolean;
    roundScore: { left: number; right: number }; currentRound: number; roundWinner: Side | null;
    result: { winner: Side; reason: string } | null; scores: import('../server/shared/progression').MatchScores | null;
    chat: ChatMessage[]; rematch: 'none' | 'requested' | 'opponent_requested'; pause: PauseState; saveStatus: 'idle' | 'pending' | 'saved';
}

export interface TerrainData {
    cannons?: Partial<Record<Side, Vector>>;
    points: { x: number; y: number }[];
    buildZones: { x: number; width: number; y: number }[];
    seed: number;
}

export interface ChatMessage {
    id: string;
    sender: string;
    side: Side;
    text: string;
    timestamp: number;
}

export interface BuildStatus {
    status: 'idle' | 'generating' | 'building' | 'success' | 'error';
    message: string;
}

export type MaterialType = 'wood' | 'stone' | 'ice' | 'rubber' | 'steel';
export type ShapeType = 'rectangle' | 'pillar' | 'beam';

export const MATERIAL_COLORS: Record<MaterialType | 'foundation', string> = {
    wood: '#A67C52',
    stone: '#7D7D7D',
    ice: '#A5F2F3',
    rubber: '#FF69B4',
    steel: '#434B4D',
    foundation: '#7D7D7D',
};

export const WORLD_WIDTH = 2400; // Synced with server
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const LEFT_CANNON_X = 20;
export const RIGHT_CANNON_X = 2380;

export * from '../server/shared/progression';
