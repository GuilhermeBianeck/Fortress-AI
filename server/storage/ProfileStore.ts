import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
    getUtcDayStartMs, getUtcWeekStartMs, getDailyMissions, getWeeklyChallenges,
    getUnlockedAchievements, getCheckinReward, MS_PER_DAY, GAMIFICATION_FIRST_WIN_BONUS_EMBERS,
    type PlayerProfile, type MatchHistoryEntry, type PeriodStats, type RewardKind,
} from '../shared/progression';

const number = z.number().finite().nonnegative().max(1e12);
const score = z.object({
    damageDealt: number, resourcesUsed: number, combatTimeMs: number, damagePoints: number,
    resourceBonus: number, timeBonus: number, winBonus: number, totalScore: number,
    aiBlocksUsed: number.optional(), aiSynergyBonus: number.optional(),
}).strict();
const entrySchema = z.object({
    matchId: z.uuid(), timestamp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), opponentName: z.string().max(20),
    side: z.enum(['left', 'right']), won: z.boolean(), score,
    rounds: z.object({ left: number.int(), right: number.int() }).strict(),
    mode: z.enum(['single', 'pvp']), difficulty: z.enum(['easy', 'normal', 'hard']),
    reason: z.string().max(80),
}).strict();
export interface Identity { id: string; token: string }
export interface Award { id: string; name: string; entry: MatchHistoryEntry }
export interface MatchRecord { winner: 'left' | 'right'; reason: string; rounds: { left: number; right: number }; mode: 'single' | 'pvp'; difficulty: 'easy' | 'normal' | 'hard'; names: { left: string; right: string }; scores: { left: z.infer<typeof score>; right: z.infer<typeof score> } }
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const emptyStats = (): PeriodStats => ({ matches: 0, wins: 0, damage: 0, score: 0, aiWins: 0 });

/** Single-process, local-disk progression ledger. Never accepts browser totals. */
export class ProfileStore {
    readonly db: DatabaseSync;
    constructor(path = ':memory:') {
        if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        this.db = new DatabaseSync(path);
        try {
            if (path !== ':memory:') chmodSync(path, 0o600);
            this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
            const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
            if (version.user_version > 2) throw new Error('Unsupported progression schema; upgrade the server, do not delete the database');
            this.db.exec(`BEGIN IMMEDIATE;
                CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, profile TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, completed_at INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS results(match_id TEXT NOT NULL REFERENCES matches(id), player_id TEXT NOT NULL REFERENCES players(id), completed_at INTEGER NOT NULL, entry TEXT NOT NULL, PRIMARY KEY(match_id,player_id));
                CREATE INDEX IF NOT EXISTS results_player_time ON results(player_id,completed_at DESC,match_id DESC);
                CREATE TABLE IF NOT EXISTS claims(player_id TEXT NOT NULL REFERENCES players(id), period INTEGER NOT NULL, reward TEXT NOT NULL, amount INTEGER NOT NULL, PRIMARY KEY(player_id,period,reward));
                COMMIT;`);
            const columns = this.db.prepare('PRAGMA table_info(matches)').all() as { name: string }[];
            this.transaction(() => {
                if (!columns.some(column => column.name === 'metadata')) this.db.exec("ALTER TABLE matches ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
                this.db.exec('PRAGMA user_version=2');
            });
            const check = this.db.prepare('PRAGMA quick_check').get() as { quick_check: string };
            if (check.quick_check !== 'ok') throw new Error('Progression database integrity check failed');
            if (this.db.prepare('SELECT id FROM players WHERE NOT json_valid(profile) LIMIT 1').get()) throw new Error('Corrupt player JSON; restore a verified backup');
            if (this.db.prepare('SELECT player_id FROM results WHERE NOT json_valid(entry) LIMIT 1').get()) throw new Error('Corrupt result JSON; restore a verified backup');
        } catch (error) { this.db.close(); throw error; }
    }

    authenticate(candidate: unknown): Identity {
        if (candidate && typeof candidate === 'object') {
            const { id, token } = candidate as Partial<Identity>;
            if (typeof id === 'string' && typeof token === 'string' && token.length === 64) {
                const row = this.db.prepare('SELECT token_hash FROM players WHERE id=?').get(id) as { token_hash: string } | undefined;
                if (row && timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(hash(token), 'hex'))) return { id, token };
            }
        }
        const identity = { id: randomUUID(), token: randomBytes(32).toString('hex') };
        this.db.prepare('INSERT INTO players VALUES(?,?,?)').run(identity.id, hash(identity.token), JSON.stringify(this.emptyProfile(identity.id)));
        return identity;
    }

    private emptyProfile(id: string): PlayerProfile {
        return { uuid: id, name: 'Player', totalScore: 0, matchesPlayed: 0, matchesWon: 0, history: [], unlockedAchievements: [],
            progression: { currentStreak: 0, bestStreak: 0, aiWins: 0 },
            rewards: { embers: 0, checkinStreak: 0, checkinDay: null, dailyPeriod: 0, dailyClaims: [], weeklyPeriod: 0, weeklyClaims: [] } };
    }

    profile(id: string, now = Date.now()): PlayerProfile | null {
        const row = this.db.prepare('SELECT profile FROM players WHERE id=?').get(id) as { profile: string } | undefined;
        if (!row) return null;
        const profile = JSON.parse(row.profile) as PlayerProfile;
        const dayStart = getUtcDayStartMs(new Date(now)), weekStart = getUtcWeekStartMs(new Date(now));
        const entries = this.db.prepare('SELECT entry FROM results WHERE player_id=? ORDER BY completed_at DESC,match_id DESC LIMIT 20').all(id) as { entry: string }[];
        profile.history = entries.map(row => JSON.parse(row.entry));
        const stats = (start: number): PeriodStats => {
            const rows = this.db.prepare(`SELECT count(*) matches, coalesce(sum(json_extract(entry,'$.won')),0) wins,
                coalesce(sum(json_extract(entry,'$.score.damageDealt')),0) damage, coalesce(sum(json_extract(entry,'$.score.totalScore')),0) score,
                coalesce(sum(CASE WHEN json_extract(entry,'$.won')=1 AND json_extract(entry,'$.score.aiBlocksUsed')>0 THEN 1 ELSE 0 END),0) aiWins
                FROM results WHERE player_id=? AND completed_at>=? AND completed_at<=?`).get(id, start, now) as unknown as PeriodStats;
            return rows ?? emptyStats();
        };
        profile.periodStats = { dayStart, weekStart, day: stats(dayStart), week: stats(weekStart) };
        const claims = this.db.prepare('SELECT period,reward FROM claims WHERE player_id=? AND period IN (?,?)').all(id, dayStart, weekStart) as { period: number; reward: string }[];
        profile.rewards!.dailyPeriod = dayStart;
        profile.rewards!.weeklyPeriod = weekStart;
        profile.rewards!.dailyClaims = claims.filter(c => c.period === dayStart && c.reward.startsWith('daily:')).map(c => c.reward.slice(6));
        profile.rewards!.weeklyClaims = claims.filter(c => c.period === weekStart && c.reward.startsWith('weekly:')).map(c => c.reward.slice(7));
        return profile;
    }

    history(id: string, cursor?: string, limit = 20): { entries: MatchHistoryEntry[]; cursor: string | null } {
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('History limit must be 1-50');
        let time = Number.MAX_SAFE_INTEGER, match = '\uffff';
        if (cursor !== undefined) {
            if (cursor.length > 160) throw new Error('Invalid history cursor');
            const parsed = z.tuple([z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), z.uuid()]).parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
            [time, match] = parsed;
        }
        const rows = this.db.prepare('SELECT entry FROM results WHERE player_id=? AND (completed_at<? OR (completed_at=? AND match_id<?)) ORDER BY completed_at DESC,match_id DESC LIMIT ?').all(id, time, time, match, limit + 1) as { entry: string }[];
        const entries: MatchHistoryEntry[] = rows.slice(0, limit).map(r => JSON.parse(r.entry));
        const last = entries[entries.length - 1];
        return { entries, cursor: rows.length > limit && last ? Buffer.from(JSON.stringify([last.timestamp, last.matchId])).toString('base64url') : null };
    }

    private transaction<T>(action: () => T): T {
        this.db.exec('BEGIN IMMEDIATE');
        try { const result = action(); this.db.exec('COMMIT'); return result; }
        catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }
    private save(profile: PlayerProfile): void {
        this.db.prepare('UPDATE players SET profile=? WHERE id=?').run(JSON.stringify({ ...profile, history: [], periodStats: undefined }), profile.uuid!);
    }

    award(awards: Award[], metadata?: MatchRecord): void {
        if (awards.length < 1 || awards.length > 2 || new Set(awards.map(a => a.id)).size !== awards.length) throw new Error('Invalid participants');
        for (const award of awards) { z.uuid().parse(award.id); entrySchema.parse(award.entry); z.string().max(20).parse(award.name); }
        const { matchId, timestamp } = awards[0].entry;
        if (awards.some(a => a.entry.matchId !== matchId || a.entry.timestamp !== timestamp)) throw new Error('Inconsistent match');
        if (metadata) {
            score.parse(metadata.scores.left); score.parse(metadata.scores.right);
            z.object({ winner: z.enum(['left', 'right']), reason: z.string().max(80), rounds: z.object({ left: number.int(), right: number.int() }),
                mode: z.enum(['single', 'pvp']), difficulty: z.enum(['easy', 'normal', 'hard']), names: z.object({ left: z.string().max(20), right: z.string().max(20) }), scores: z.object({ left: score, right: score }) }).strict().parse(metadata);
        }
        const fingerprint = hash(JSON.stringify({ awards: [...awards].sort((a, b) => a.id.localeCompare(b.id)), metadata }));
        this.transaction(() => {
            const existing = this.db.prepare('SELECT fingerprint FROM matches WHERE id=?').get(matchId) as { fingerprint: string } | undefined;
            if (existing) { if (existing.fingerprint !== fingerprint) throw new Error('Conflicting result for match ID'); return; }
            this.db.prepare('INSERT INTO matches(id,fingerprint,completed_at,metadata) VALUES(?,?,?,?)').run(matchId, fingerprint, timestamp, JSON.stringify(metadata ?? {}));
            for (const { id, name, entry } of awards) {
                const profile = this.profile(id, timestamp);
                if (!profile) throw new Error('Unknown result identity');
                this.db.prepare('INSERT INTO results VALUES(?,?,?,?)').run(matchId, id, timestamp, JSON.stringify(entry));
                profile.name = name;
                profile.totalScore += entry.score.totalScore;
                profile.matchesPlayed++;
                if (entry.won) profile.matchesWon++;
                profile.progression!.currentStreak = entry.won ? profile.progression!.currentStreak + 1 : 0;
                profile.progression!.bestStreak = Math.max(profile.progression!.bestStreak, profile.progression!.currentStreak);
                if (entry.won && (entry.score.aiBlocksUsed ?? 0) > 0) profile.progression!.aiWins++;
                profile.history.unshift(entry);
                profile.unlockedAchievements = getUnlockedAchievements(profile).map(a => a.id);
                if (entry.won) this.credit(profile, getUtcDayStartMs(new Date(timestamp)), 'first_win', GAMIFICATION_FIRST_WIN_BONUS_EMBERS);
                this.save(profile);
            }
        });
    }

    private credit(profile: PlayerProfile, period: number, reward: string, amount: number): number {
        const result = this.db.prepare('INSERT OR IGNORE INTO claims VALUES(?,?,?,?)').run(profile.uuid!, period, reward, amount);
        if (!result.changes) return 0;
        profile.rewards!.embers += amount;
        return amount;
    }

    claim(id: string, kind: RewardKind, now = Date.now()): number {
        if (!['checkin', 'daily', 'weekly'].includes(kind)) throw new Error('Unknown reward');
        return this.transaction(() => {
            const profile = this.profile(id, now);
            if (!profile) throw new Error('Unknown identity');
            const day = getUtcDayStartMs(new Date(now));
            let amount = 0;
            if (kind === 'checkin' && profile.rewards!.checkinDay !== day) {
                const streak = profile.rewards!.checkinDay === day - MS_PER_DAY ? profile.rewards!.checkinStreak + 1 : 1;
                amount = this.credit(profile, day, 'checkin', getCheckinReward(streak));
                profile.rewards!.checkinDay = day; profile.rewards!.checkinStreak = streak;
            } else if (kind === 'daily' || kind === 'weekly') {
                const items = kind === 'daily' ? getDailyMissions(profile).missions : getWeeklyChallenges(profile).challenges;
                for (const item of items.filter(i => i.completed && !i.claimed)) {
                    amount += this.credit(profile, kind === 'daily' ? day : getUtcWeekStartMs(new Date(now)), `${kind}:${item.id}`, item.reward);
                }
            }
            this.save(profile);
            return amount;
        });
    }
    close(): void { this.db.close(); }
}
