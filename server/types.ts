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
    blockHp: number | null;
    blockMaxHp: number | null;
}

export type Side = 'left' | 'right';
export type MatchPhase = 'lobby' | 'build' | 'reveal' | 'combat' | 'intermission' | 'result';

export interface KingHpState {
    hp: number;
    maxHp: number;
    x?: number;
    y?: number;
}

export interface GameState {
    bodies: BodyState[];
    timestamp: number;
    kings: {
        left: KingHpState;
        right: KingHpState;
    };
}

export interface KingState {
    bodyId: number;
    hp: number;
    maxHp: number;
    position: Vector;
}

export interface PlayerInfo {
    socketId: string;
    side: Side;
    ready: boolean;
    name: string;
}

export type HazardType = 'wind_zone' | 'lava_pool' | 'falling_rocks';

export interface HazardData {
    type: HazardType;
    id: string;
    position: Vector;
    width: number;
    height: number;
    windDirection?: number;
    windStrength?: number;
    damage?: number;
}

export interface PlayerState {
    socketId: string;
    side: Side;
    kingBody: import('matter-js').Body;
    kingState: KingState;
    cannonX: number;
    buildZone: { xMin: number; xMax: number };
}

// === Scoring ===

export interface MatchScoreBreakdown {
    damageDealt: number;
    resourcesUsed: number;
    combatTimeMs: number;
    damagePoints: number;
    resourceBonus: number;
    timeBonus: number;
    winBonus: number;
    aiBlocksUsed: number;
    aiSynergyBonus: number;
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
    uuid?: string;
}
