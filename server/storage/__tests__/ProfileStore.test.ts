import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ProfileStore, type Award } from '../ProfileStore';
import { getDailyMissions, getWeeklyChallenges, MS_PER_DAY } from '../../shared/progression';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() { const dir = mkdtempSync(join(tmpdir(), 'fortress-progression-')); dirs.push(dir); return join(dir, 'data.sqlite'); }
function award(id: string, timestamp = Date.now(), matchId: string = randomUUID()): Award {
    return { id, name: 'Alice', entry: { matchId, timestamp, side: 'left', opponentName: 'Bot', won: true, rounds: { left: 2, right: 0 }, mode: 'single', difficulty: 'normal', reason: 'king_destroyed',
        score: { damageDealt: 400, resourcesUsed: 10, combatTimeMs: 20000, damagePoints: 800, resourceBonus: 100, timeBonus: 100, winBonus: 500, aiBlocksUsed: 10, aiSynergyBonus: 100, totalScore: 1600 } } };
}
describe('durable authoritative progression', () => {
    it('saves both-side match metadata without creating a bot profile', () => {
        const store = new ProfileStore(), identity = store.authenticate(null), fact = award(identity.id);
        store.award([fact], { winner: 'left', reason: fact.entry.reason!, mode: 'single', difficulty: 'hard', rounds: fact.entry.rounds,
            names: { left: 'Alice', right: 'Training Bot' }, scores: { left: fact.entry.score, right: { ...fact.entry.score, winBonus: 0, totalScore: 500 } } });
        const row = store.db.prepare('SELECT metadata FROM matches').get() as { metadata: string };
        expect(JSON.parse(row.metadata).scores.right.totalScore).toBe(500);
        expect(JSON.parse(row.metadata).difficulty).toBe('hard');
        expect(store.db.prepare('SELECT count(*) count FROM players').get()?.count).toBe(1); store.close();
    });
    it('claims weekly milestones independently, including rewards completed after an early claim', () => {
        const store = new ProfileStore(), { id } = store.authenticate(null), time = Date.UTC(2026, 9, 20, 12);
        for (let i = 0; i < 15; i++) {
            const fact = award(id, time + i); fact.entry.won = false; fact.entry.score.damageDealt = 0;
            store.award([fact]);
        }
        expect(store.claim(id, 'weekly', time + 20)).toBe(400); expect(store.claim(id, 'weekly', time + 20)).toBe(0);
        for (let i = 0; i < 7; i++) store.award([award(id, time + 30 + i)]);
        expect(store.claim(id, 'weekly', time + 40)).toBe(1100); expect(store.claim(id, 'weekly', time + 40)).toBe(0);
        expect(store.profile(id, time + 40)?.rewards?.weeklyClaims.sort()).toEqual(['weekly_battles', 'weekly_damage', 'weekly_wins']); store.close();
    });
    it('rejects a corrupt file without replacing it', () => {
        const path = fixture(); writeFileSync(path, 'not a SQLite database');
        expect(() => new ProfileStore(path)).toThrow(); expect(readFileSync(path, 'utf8')).toBe('not a SQLite database');
    });
    it('serializes duplicate callback attempts across database handles', async () => {
        const path = fixture(), first = new ProfileStore(path), second = new ProfileStore(path);
        const identity = first.authenticate(null), fact = award(identity.id);
        await Promise.all(Array.from({ length: 12 }, (_, i) => Promise.resolve().then(() => (i % 2 ? first : second).award([fact]))));
        expect(second.profile(identity.id)?.matchesPlayed).toBe(1); first.close(); second.close();
    });
    it('reopens credentials, totals, claims and achievement unlocks from an on-disk ledger', () => {
        const path = fixture(); let store = new ProfileStore(path); const identity = store.authenticate(null);
        const fact = award(identity.id); store.award([fact]); store.claim(identity.id, 'checkin'); store.claim(identity.id, 'daily');
        const before = store.profile(identity.id); store.close(); store = new ProfileStore(path);
        expect(store.authenticate(identity)).toEqual(identity); expect(store.profile(identity.id)).toEqual(before);
        store.award([fact]); expect(store.profile(identity.id)?.matchesPlayed).toBe(1);
        expect(statSync(path).mode & 0o777).toBe(0o600); store.close();
    });
    it('keeps lifetime/period facts beyond 20 entries and paginates without duplicates', () => {
        const store = new ProfileStore(); const { id } = store.authenticate(null); const now = Date.now();
        for (let i = 0; i < 26; i++) store.award([award(id, now - i)]);
        const profile = store.profile(id, now)!;
        expect(profile.history).toHaveLength(20); expect(profile.periodStats?.day.matches).toBe(26);
        expect(profile.progression).toEqual({ currentStreak: 26, bestStreak: 26, aiWins: 26 });
        expect(profile.unlockedAchievements).toContain('ai_overlord');
        const page = store.history(id); const second = store.history(id, page.cursor!);
        expect(second.entries).toHaveLength(6); expect(new Set([...page.entries, ...second.entries].map(e => e.matchId)).size).toBe(26);
        expect(store.history(store.authenticate(null).id).entries).toEqual([]); store.close();
    });
    it('rolls both awards back on failure and can retry exactly once', () => {
        const store = new ProfileStore(); const a = store.authenticate(null), b = store.authenticate(null); const fact = award(a.id);
        const other = { ...award(b.id, fact.entry.timestamp, fact.entry.matchId), name: 'Bob' };
        store.db.exec("CREATE TRIGGER fail_result BEFORE INSERT ON results WHEN NEW.player_id='" + b.id + "' BEGIN SELECT RAISE(ABORT,'test disk failure'); END;");
        expect(() => store.award([fact, other])).toThrow(); expect(store.profile(a.id)?.matchesPlayed).toBe(0);
        store.db.exec('DROP TRIGGER fail_result'); store.award([fact, other]); store.award([other, fact]);
        expect(store.profile(a.id)?.matchesPlayed).toBe(1); expect(store.profile(b.id)?.matchesPlayed).toBe(1); store.close();
    });
    it('rejects malformed totals, conflicting IDs and invalid cursors without damage', () => {
        const store = new ProfileStore(); const { id } = store.authenticate(null); const fact = award(id);
        expect(() => store.award([{ ...fact, entry: { ...fact.entry, score: { ...fact.entry.score, totalScore: NaN } } }])).toThrow();
        store.award([fact]); expect(() => store.award([{ ...fact, name: 'Changed' }])).toThrow();
        expect(() => store.history(id, 'garbage')).toThrow(); expect(() => store.history(id, undefined, 1000)).toThrow();
        expect(store.profile(id)?.matchesPlayed).toBe(1); expect(JSON.stringify(store.profile(id))).not.toContain('token'); store.close();
    });
    it('claims UTC check-ins once, resets gaps, and leaves later missions claimable', () => {
        const store = new ProfileStore(); const { id } = store.authenticate(null); const day = Date.UTC(2026, 9, 25, 12);
        expect(store.claim(id, 'checkin', day)).toBe(50); expect(store.claim(id, 'checkin', day + 100)).toBe(0);
        expect(store.claim(id, 'checkin', day + MS_PER_DAY)).toBe(75);
        expect(store.claim(id, 'checkin', day + 3 * MS_PER_DAY)).toBe(50);
        store.award([award(id, day)]); const first = store.claim(id, 'daily', day);
        expect(first).toBeGreaterThan(0); expect(store.claim(id, 'daily', day)).toBe(0);
        store.award([award(id, day + 1)]); store.award([award(id, day + 2)]);
        const profile = store.profile(id, day + 3)!;
        expect(getDailyMissions(profile).claimableEmbers).toBeGreaterThan(0);
        expect(store.claim(id, 'daily', day + 3)).toBeGreaterThan(0);
        expect(getWeeklyChallenges(store.profile(id, day + 3)!).challenges[0].current).toBe(3);
        store.close();
    });
    it('refuses unsupported future schemas instead of replacing data', () => {
        const path = fixture(); const db = new DatabaseSync(path); db.exec('PRAGMA user_version=99'); db.close();
        expect(() => new ProfileStore(path)).toThrow(/Unsupported/);
    });
});
