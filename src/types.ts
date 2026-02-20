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
    aiBlocksUsed?: number;
    aiSynergyBonus?: number;
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

export interface GamificationStats {
    level: number;
    levelProgress: number;
    pointsToNextLevel: number;
    currentStreak: number;
    bestStreak: number;
    momentum: number;
    dailyMatches: number;
    dailyWins: number;
    dailyMatchTarget: number;
    dailyWinTarget: number;
}

export interface DailyMission {
    id: string;
    title: string;
    current: number;
    target: number;
    reward: number;
    unit: 'matches' | 'wins' | 'damage' | 'points';
    completed: boolean;
    progress: number;
}

export const GAMIFICATION_LEVEL_SIZE = 750;
export const GAMIFICATION_DAILY_MATCH_TARGET = 3;
export const GAMIFICATION_DAILY_WIN_TARGET = 2;
export const GAMIFICATION_DAILY_DAMAGE_TARGET = 250;
export const GAMIFICATION_DAILY_SCORE_TARGET = 900;

export function getUtcDayStartMs(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
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

export function getGamificationStats(profile: PlayerProfile): GamificationStats {
    const dailyMatchTarget = GAMIFICATION_DAILY_MATCH_TARGET;
    const dailyWinTarget = GAMIFICATION_DAILY_WIN_TARGET;
    const now = new Date();
    const todayStart = getUtcDayStartMs(now);
    const isUnordered = profile.history.some((entry, idx, arr) => idx > 0 && arr[idx - 1].timestamp < entry.timestamp);
    const orderedHistory = !isUnordered
        ? profile.history
        : [...profile.history].sort((a, b) => b.timestamp - a.timestamp);

    const level = Math.floor(profile.totalScore / GAMIFICATION_LEVEL_SIZE) + 1;
    const levelRemainder = profile.totalScore % GAMIFICATION_LEVEL_SIZE;
    const levelProgress = levelRemainder / GAMIFICATION_LEVEL_SIZE;
    const pointsToNextLevel = GAMIFICATION_LEVEL_SIZE - levelRemainder;

    let currentStreak = 0;
    let bestStreak = 0;
    let streakCounter = 0;
    let trackingCurrentStreak = true;
    for (const entry of orderedHistory) {
        if (entry.won) {
            streakCounter++;
            bestStreak = Math.max(bestStreak, streakCounter);
            if (trackingCurrentStreak) currentStreak++;
        } else {
            streakCounter = 0;
            trackingCurrentStreak = false;
        }
    }

    const recent = orderedHistory.slice(0, 5);
    const momentum = recent.length > 0
        ? Math.round((recent.filter(entry => entry.won).length / recent.length) * 100)
        : 0;

    const todayEntries = orderedHistory.filter(entry => entry.timestamp >= todayStart);
    const dailyMatches = todayEntries.length;
    const dailyWins = todayEntries.filter(entry => entry.won).length;

    return {
        level,
        levelProgress,
        pointsToNextLevel,
        currentStreak,
        bestStreak,
        momentum,
        dailyMatches,
        dailyWins,
        dailyMatchTarget,
        dailyWinTarget,
    };
}

export function getDailyMissions(profile: PlayerProfile): { missions: DailyMission[]; claimableEmbers: number } {
    const createMission = (
        id: DailyMission['id'],
        title: DailyMission['title'],
        current: DailyMission['current'],
        target: DailyMission['target'],
        reward: DailyMission['reward'],
        unit: DailyMission['unit'],
    ): DailyMission => ({
        id,
        title,
        current,
        target,
        reward,
        unit,
        completed: current >= target,
        progress: target > 0 ? Math.min(1, current / target) : 0,
    });

    const now = new Date();
    const todayStart = getUtcDayStartMs(now);
    const todayEntries = profile.history.filter(entry => entry.timestamp >= todayStart);

    const dailyMatches = todayEntries.length;
    const dailyWins = todayEntries.filter(entry => entry.won).length;
    const dailyDamage = Math.round(todayEntries.reduce((sum, entry) => sum + entry.score.damageDealt, 0));
    const dailyScore = Math.round(todayEntries.reduce((sum, entry) => sum + entry.score.totalScore, 0));

    const missions: DailyMission[] = [
        createMission('play_matches', 'Fight daily battles', dailyMatches, GAMIFICATION_DAILY_MATCH_TARGET, 120, 'matches'),
        createMission('win_matches', 'Claim daily victories', dailyWins, GAMIFICATION_DAILY_WIN_TARGET, 200, 'wins'),
        createMission('deal_damage', 'Deal King damage', dailyDamage, GAMIFICATION_DAILY_DAMAGE_TARGET, 160, 'damage'),
        createMission('earn_points', 'Earn score points', dailyScore, GAMIFICATION_DAILY_SCORE_TARGET, 220, 'points'),
    ];

    const claimableEmbers = missions
        .filter(mission => mission.completed)
        .reduce((sum, mission) => sum + mission.reward, 0);

    return { missions, claimableEmbers };
}

// === Achievements ===

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Achievement {
    id: string;
    title: string;
    description: string;
    icon: string;
    rarity: AchievementRarity;
}

export const ACHIEVEMENT_RARITY_COLORS: Record<AchievementRarity, string> = {
    common:    '#9CA3AF',
    rare:      '#60A5FA',
    epic:      '#A78BFA',
    legendary: '#F59E0B',
};

export const ACHIEVEMENTS: readonly Achievement[] = [
    { id: 'first_match',    title: 'First Steps',        description: 'Fought your first battle',             icon: '⚔️',  rarity: 'common'    },
    { id: 'first_win',      title: 'First Victory',      description: 'Claimed your first conquest',          icon: '🏆',  rarity: 'common'    },
    { id: 'on_fire',        title: 'On Fire',            description: 'Achieved a 3-win streak',              icon: '🔥',  rarity: 'rare'      },
    { id: 'unstoppable',    title: 'Unstoppable',        description: 'Achieved a 5-win streak',              icon: '🌪️', rarity: 'epic'      },
    { id: 'veteran',        title: 'Seasoned Warrior',   description: 'Played 10 matches',                    icon: '🛡️', rarity: 'rare'      },
    { id: 'champion',       title: 'Champion',           description: 'Won 10 matches',                       icon: '👑',  rarity: 'epic'      },
    { id: 'ai_pioneer',     title: 'AI Pioneer',         description: 'Built your first AI-designed fortress', icon: '🤖',  rarity: 'rare'      },
    { id: 'ai_synergy',     title: 'Human+AI Synergy',   description: 'Won 3 matches with AI builds',         icon: '🔗',  rarity: 'epic'      },
    { id: 'full_auto',      title: 'Full Automation',    description: 'Won using only AI-placed blocks',      icon: '✨',  rarity: 'legendary' },
    { id: 'minimalist',     title: 'Minimalist',         description: 'Won with 10 or fewer blocks',          icon: '🎯',  rarity: 'rare'      },
    { id: 'siege_breaker',  title: 'Siege Breaker',      description: 'Dealt 300+ damage in one match',       icon: '💥',  rarity: 'rare'      },
    { id: 'lightning',      title: 'Lightning Strike',   description: 'Won in under 30s of combat',           icon: '⚡',  rarity: 'epic'      },
    { id: 'score_master',   title: 'Score Master',       description: 'Earned 1500+ pts in one match',        icon: '📈',  rarity: 'epic'      },
    { id: 'synergist_rank', title: 'Ascendant',          description: 'Reached Synergist rank',               icon: '🌟',  rarity: 'legendary' },
    { id: 'ai_overlord',    title: 'AI Overlord',        description: 'Won 10 matches with AI builds',        icon: '🧠',  rarity: 'legendary' },
] as const;

export function getUnlockedAchievements(profile: PlayerProfile): Achievement[] {
    const stats = getGamificationStats(profile);
    const history = profile.history;

    return ACHIEVEMENTS.filter(achievement => {
        switch (achievement.id) {
            case 'first_match':
                return profile.matchesPlayed >= 1;
            case 'first_win':
                return profile.matchesWon >= 1;
            case 'on_fire':
                return stats.bestStreak >= 3;
            case 'unstoppable':
                return stats.bestStreak >= 5;
            case 'veteran':
                return profile.matchesPlayed >= 10;
            case 'champion':
                return profile.matchesWon >= 10;
            case 'ai_pioneer':
                return history.some(e => (e.score.aiBlocksUsed ?? 0) > 0);
            case 'ai_synergy':
                return history.filter(e => e.won && (e.score.aiBlocksUsed ?? 0) > 0).length >= 3;
            case 'full_auto':
                return history.some(e =>
                    e.won &&
                    (e.score.aiBlocksUsed ?? 0) > 0 &&
                    e.score.resourcesUsed > 0 &&
                    (e.score.aiBlocksUsed ?? 0) >= e.score.resourcesUsed
                );
            case 'minimalist':
                return history.some(e => e.won && e.score.resourcesUsed > 0 && e.score.resourcesUsed <= 10);
            case 'siege_breaker':
                return history.some(e => e.score.damageDealt >= 300);
            case 'lightning':
                return history.some(e => e.won && e.score.combatTimeMs > 0 && e.score.combatTimeMs <= 30000);
            case 'score_master':
                return history.some(e => e.score.totalScore >= 1500);
            case 'synergist_rank':
                return profile.totalScore >= 10000;
            case 'ai_overlord':
                return history.filter(e => e.won && (e.score.aiBlocksUsed ?? 0) > 0).length >= 10;
            default:
                return false;
        }
    });
}

// === Performance Grade ===

export type PerformanceGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export const PERFORMANCE_GRADE_COLORS: Record<PerformanceGrade, string> = {
    S: '#FFD700',
    A: '#34D399',
    B: '#60A5FA',
    C: '#F59E0B',
    D: '#EF4444',
};

export function getPerformanceGrade(score: MatchScoreBreakdown): PerformanceGrade {
    const total = score.totalScore;
    if (total >= 1500) return 'S';
    if (total >= 900)  return 'A';
    if (total >= 500)  return 'B';
    if (total >= 200)  return 'C';
    return 'D';
}
