export type Side = 'left' | 'right';

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
    mode?: 'single' | 'pvp';
    difficulty?: 'easy' | 'normal' | 'hard';
    reason?: string;
}

export interface PeriodStats {
    matches: number; wins: number; damage: number; score: number; aiWins: number;
}

export interface ProfileRewards {
    embers: number;
    checkinStreak: number;
    checkinDay: number | null;
    dailyPeriod: number;
    dailyClaims: string[];
    weeklyPeriod: number;
    weeklyClaims: string[];
}

export type RewardKind = 'checkin' | 'daily' | 'weekly';

export interface PlayerProfile {
    uuid?: string;
    name: string;
    totalScore: number;
    matchesPlayed: number;
    matchesWon: number;
    history: MatchHistoryEntry[];
    unlockedAchievements?: string[];
    progression?: { currentStreak: number; bestStreak: number; aiWins: number };
    periodStats?: { dayStart: number; weekStart: number; day: PeriodStats; week: PeriodStats };
    rewards?: ProfileRewards;
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
    claimed?: boolean;
}

export const GAMIFICATION_LEVEL_SIZE = 750;
export const GAMIFICATION_DAILY_MATCH_TARGET = 3;
export const GAMIFICATION_DAILY_WIN_TARGET = 2;
export const GAMIFICATION_DAILY_DAMAGE_TARGET = 250;
export const GAMIFICATION_DAILY_SCORE_TARGET = 900;
export const GAMIFICATION_FIRST_WIN_BONUS_EMBERS = 150;

export const MS_PER_DAY = 86_400_000;

// === Daily Check-in ===

/** Ember rewards for consecutive check-in days (index = streak day − 1, cycles). */
export const CHECKIN_REWARDS = [50, 75, 100, 125, 150, 175, 300] as const;

export interface CheckinStatus {
    streak: number;      // consecutive days including today (0 = not checked in yet today)
    todayClaimed: boolean;
    nextReward: number;  // Embers awarded on next (or current) claim
}

export function getCheckinReward(streakAfterClaim: number): number {
    const idx = Math.min(streakAfterClaim - 1, CHECKIN_REWARDS.length - 1);
    return CHECKIN_REWARDS[idx];
}

// === Weekly Challenges ===

export interface WeeklyChallenge {
    id: string;
    title: string;
    description: string;
    icon: string;
    current: number;
    target: number;
    reward: number;
    unit: 'matches' | 'wins' | 'damage';
    completed: boolean;
    progress: number;
    claimed?: boolean;
}

export function getWeeklyChallenges(profile: PlayerProfile): { challenges: WeeklyChallenge[]; claimableEmbers: number } {
    const now = new Date();
    const weekStart = getUtcWeekStartMs(now);
    const weekEntries = profile.history.filter(entry => entry.timestamp >= weekStart);

    const weekMatches = profile.periodStats?.week.matches ?? weekEntries.length;
    const weekWins = profile.periodStats?.week.wins ?? weekEntries.filter(e => e.won).length;
    const weekDamage = Math.round(profile.periodStats?.week.damage ?? weekEntries.reduce((sum, e) => sum + e.score.damageDealt, 0));

    const makeChallenge = (
        id: string, title: string, description: string, icon: string,
        current: number, target: number, reward: number,
        unit: WeeklyChallenge['unit'],
    ): WeeklyChallenge => ({
        id, title, description, icon, current, target, reward, unit,
        completed: current >= target,
        progress: target > 0 ? Math.min(1, current / target) : 0,
        claimed: profile.rewards?.weeklyClaims.includes(id) ?? false,
    });

    const challenges: WeeklyChallenge[] = [
        makeChallenge('weekly_battles',  'War Veteran',   'Fight 15 battles this week',       '🛡️', weekMatches, 15,   400, 'matches'),
        makeChallenge('weekly_wins',     'Conqueror',     'Win 7 battles this week',           '👑', weekWins,    7,    600, 'wins'),
        makeChallenge('weekly_damage',   'Siege Master',  'Deal 1500 total damage this week',  '💥', weekDamage,  1500, 500, 'damage'),
    ];

    const claimableEmbers = challenges.filter(c => c.completed && !c.claimed).reduce((sum, c) => sum + c.reward, 0);
    return { challenges, claimableEmbers };
}

export function getUtcDayStartMs(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function getUtcWeekStartMs(date: Date): number {
    // Returns the UTC ms for Monday 00:00 of the current week.
    // Days back to Monday: Sun(0)→6, Mon(1)→0, Tue(2)→1, …, Sat(6)→5
    const dayOfWeek = date.getUTCDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diffToMonday);
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
    const dailyMatches = profile.periodStats?.day.matches ?? todayEntries.length;
    const dailyWins = profile.periodStats?.day.wins ?? todayEntries.filter(entry => entry.won).length;

    return {
        level,
        levelProgress,
        pointsToNextLevel,
        currentStreak: profile.progression?.currentStreak ?? currentStreak,
        bestStreak: profile.progression?.bestStreak ?? bestStreak,
        momentum,
        dailyMatches,
        dailyWins,
        dailyMatchTarget,
        dailyWinTarget,
    };
}

export function getDailyMissions(profile: PlayerProfile): { missions: DailyMission[]; claimableEmbers: number; firstWinOfDay: boolean } {
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
        claimed: profile.rewards?.dailyClaims.includes(id) ?? false,
    });

    const now = new Date();
    const todayStart = profile.periodStats?.dayStart ?? getUtcDayStartMs(now);
    const todayEntries = profile.history.filter(entry => entry.timestamp >= todayStart);

    const dailyMatches = profile.periodStats?.day.matches ?? todayEntries.length;
    const dailyWins = profile.periodStats?.day.wins ?? todayEntries.filter(entry => entry.won).length;
    const dailyDamage = Math.round(profile.periodStats?.day.damage ?? todayEntries.reduce((sum, entry) => sum + entry.score.damageDealt, 0));
    const dailyScore = Math.round(profile.periodStats?.day.score ?? todayEntries.reduce((sum, entry) => sum + entry.score.totalScore, 0));
    const dailyAiWins = profile.periodStats?.day.aiWins ?? todayEntries.filter(e => e.won && (e.score.aiBlocksUsed ?? 0) > 0).length;

    // Rotating extra missions — one of two alternates picked by UTC day parity
    const dayIndex = Math.floor(todayStart / 86_400_000);
    const useHardVariant = dayIndex % 2 === 0;

    // Six-mission pool: always include the four core missions; slot the 5th and 6th from rotating pairs
    const allMissions: DailyMission[] = [
        createMission('play_matches', 'Fight daily battles',   dailyMatches, GAMIFICATION_DAILY_MATCH_TARGET, 120, 'matches'),
        createMission('win_matches',  'Claim daily victories', dailyWins,    GAMIFICATION_DAILY_WIN_TARGET,   200, 'wins'),
        createMission('deal_damage',  'Deal King damage',      dailyDamage,  GAMIFICATION_DAILY_DAMAGE_TARGET, 160, 'damage'),
        createMission('earn_points',  'Earn score points',     dailyScore,   GAMIFICATION_DAILY_SCORE_TARGET,  220, 'points'),
        useHardVariant
            ? createMission('play_matches_hard', 'Relentless warrior', dailyMatches, 5, 250, 'matches')
            : createMission('win_ai', 'Win with AI fortress', dailyAiWins, 1, 220, 'wins'),
        useHardVariant
            ? createMission('deal_damage_hard', 'Devastating barrage', dailyDamage, 500, 280, 'damage')
            : createMission('earn_points_hard', 'Score champion', dailyScore, 1800, 300, 'points'),
    ];

    // Select 4 core missions plus 1 rotating bonus mission (5 total).
    // Comment below is intentional: we always show exactly 5 missions.
    const missions = allMissions.slice(0, 4);
    // Append the rotating 5th mission (index 4)
    missions.push(allMissions[4]);

    // firstWinOfDay: true when the player has exactly one win today,
    // meaning they just earned their first win of the day.
    const firstWinOfDay = dailyWins === 1;

    const claimableEmbers = missions
        .filter(mission => mission.completed && !mission.claimed)
        .reduce((sum, mission) => sum + mission.reward, 0);

    return { missions, claimableEmbers, firstWinOfDay };
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
        if (profile.unlockedAchievements?.includes(achievement.id)) return true;
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
                return (profile.progression?.aiWins ?? history.filter(e => e.won && (e.score.aiBlocksUsed ?? 0) > 0).length) >= 3;
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
                return (profile.progression?.aiWins ?? history.filter(e => e.won && (e.score.aiBlocksUsed ?? 0) > 0).length) >= 10;
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
