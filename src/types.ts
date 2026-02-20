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

// === Ranking ===

export interface RankTier {
    name: string;
    minScore: number;
    color: string;
    description: string;
    emoji: string;
}

export const RANK_TIERS: readonly RankTier[] = [
    { name: 'Wanderer',        minScore: 0,     color: '#9CA3AF', description: 'Beginning the journey',          emoji: '⚔️'  },
    { name: 'Builder',         minScore: 500,   color: '#60A5FA', description: 'Mastering the art of walls',     emoji: '🏗️'  },
    { name: 'Architect',       minScore: 2000,  color: '#34D399', description: 'Designing with purpose',         emoji: '📐'  },
    { name: 'AI Initiate',     minScore: 5000,  color: '#F59E0B', description: 'Awakening to AI potential',      emoji: '🤖'  },
    { name: 'Synergist',       minScore: 10000, color: '#F97316', description: 'Human creativity + AI precision', emoji: '🔗'  },
    { name: 'Nexus Commander', minScore: 20000, color: '#EF4444', description: 'Commanding the fusion of minds', emoji: '⚡'  },
    { name: 'Transcendent',    minScore: 40000, color: '#06B6D4', description: 'Human and AI become one',        emoji: '✨'  },
] as const;

export function getRankTier(totalScore: number): RankTier {
    for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
        if (totalScore >= RANK_TIERS[i].minScore) return RANK_TIERS[i];
    }
    return RANK_TIERS[0];
}

export function getNextRankProgress(totalScore: number): {
    nextRank: RankTier | null;
    progress: number;
    pointsNeeded: number;
} {
    for (let i = 1; i < RANK_TIERS.length; i++) {
        if (totalScore < RANK_TIERS[i].minScore) {
            const prevMin = RANK_TIERS[i - 1].minScore;
            const nextMin = RANK_TIERS[i].minScore;
            const progress = (totalScore - prevMin) / (nextMin - prevMin);
            return { nextRank: RANK_TIERS[i], progress, pointsNeeded: nextMin - totalScore };
        }
    }
    return { nextRank: null, progress: 1, pointsNeeded: 0 };
}
