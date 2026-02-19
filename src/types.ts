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
export type MatchPhase = 'lobby' | 'build' | 'reveal' | 'combat' | 'result';
export type Side = 'left' | 'right';

export interface KingHpState {
    hp: number;
    maxHp: number;
}

export interface GameState {
    bodies: BodyState[];
    timestamp: number;
    kings: {
        left: KingHpState;
        right: KingHpState;
    };
}

export interface RoomState {
    roomId: string;
    side: Side;
    phase: MatchPhase;
    opponentConnected: boolean;
    myName: string;
    opponentName: string;
}

export interface TerrainData {
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

export const MATERIAL_COLORS: Record<MaterialType, string> = {
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

// === Scoring ===

export interface MatchScoreBreakdown {
    damageDealt: number;
    resourcesUsed: number;
    combatTimeMs: number;
    damagePoints: number;
    resourceBonus: number;
    timeBonus: number;
    winBonus: number;
    totalScore: number;
}

export interface MatchScores {
    left: MatchScoreBreakdown;
    right: MatchScoreBreakdown;
}

export interface MatchHistoryEntry {
    matchId: string;
    timestamp: number;
    opponentName: string;
    side: Side;
    won: boolean;
    score: MatchScoreBreakdown;
    rounds: { left: number; right: number };
}

export interface PlayerProfile {
    name: string;
    totalScore: number;
    matchesPlayed: number;
    matchesWon: number;
    history: MatchHistoryEntry[];
}
