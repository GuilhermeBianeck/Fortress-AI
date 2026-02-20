import { getRankTier, getNextRankProgress, getGamificationStats } from '../types';
import type { PlayerProfile } from '../types';

interface RankBadgeProps {
    profile: PlayerProfile;
    compact?: boolean;
    showProgress?: boolean;
}

export const RankBadge = ({ profile, compact = false, showProgress = false }: RankBadgeProps) => {
    const rank = getRankTier(profile.totalScore);
    const { nextRank, progress, pointsNeeded } = getNextRankProgress(profile.totalScore);
    const gamification = getGamificationStats(profile);
    const winRate = profile.matchesPlayed > 0
        ? Math.round((profile.matchesWon / profile.matchesPlayed) * 100)
        : 0;

    if (compact) {
        return (
            <div className="flex items-center gap-1.5">
                <span className="text-base">{rank.emoji}</span>
                <span className="text-xs font-bold" style={{ color: rank.color }}>{rank.name}</span>
            </div>
        );
    }

    return (
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'rgba(10,10,18,0.6)', border: `1px solid ${rank.color}33` }}>
            {/* Rank header */}
            <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0"
                    style={{ background: `${rank.color}18`, border: `2px solid ${rank.color}55` }}>
                    {rank.emoji}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-lg font-bold font-display" style={{ color: rank.color }}>{rank.name}</span>
                        <span className="text-xs text-[var(--text-muted)] font-mono">{profile.totalScore.toLocaleString()} pts</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 italic">{rank.description}</p>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,215,0,0.07)' }}>
                    <p className="text-base font-bold text-[var(--gold)]">{profile.matchesPlayed}</p>
                    <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide">Matches</p>
                </div>
                <div className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(46,204,113,0.07)' }}>
                    <p className="text-base font-bold text-[var(--emerald)]">{profile.matchesWon}</p>
                    <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide">Wins</p>
                </div>
                <div className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(52,152,219,0.07)' }}>
                    <p className="text-base font-bold text-[var(--royal-blue)]">{winRate}%</p>
                    <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide">Win Rate</p>
                </div>
            </div>

            {/* Rank progress bar */}
            {showProgress && (
                <div>
                    {nextRank ? (
                        <>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] text-[var(--text-muted)]">Progress to <span style={{ color: nextRank.color }}>{nextRank.emoji} {nextRank.name}</span></span>
                                <span className="text-[10px] text-[var(--text-muted)] font-mono">{pointsNeeded.toLocaleString()} pts needed</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{
                                        width: `${Math.round(progress * 100)}%`,
                                        background: `linear-gradient(90deg, ${rank.color}, ${nextRank.color})`,
                                    }}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${rank.color}, #ffffff44)` }} />
                            <span className="text-[10px] font-bold" style={{ color: rank.color }}>MAX RANK ✨</span>
                        </div>
                    )}
                </div>
            )}

            {showProgress && (
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <p className="text-base font-bold text-[var(--gold)]">Lv {gamification.level}</p>
                        <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide">{gamification.pointsToNextLevel} to next</p>
                    </div>
                    <div className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(231,76,60,0.08)' }}>
                        <p className="text-base font-bold text-[var(--ember)]">{gamification.currentStreak}</p>
                        <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide">Win Streak</p>
                    </div>
                    <div className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(52,152,219,0.08)' }}>
                        <p className="text-base font-bold text-[var(--royal-blue)]">{gamification.momentum}%</p>
                        <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide">Momentum</p>
                    </div>
                </div>
            )}
        </div>
    );
};
