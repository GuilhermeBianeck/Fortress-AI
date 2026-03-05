import { useState, useEffect } from 'react';
import { Swords, Crown, Skull, RotateCcw, Wind, Eye, Hammer, Clock, Flame, AlertTriangle, TrendingUp, Zap, Home } from 'lucide-react';
import type { MatchPhase, Side, MatchScores, PlayerProfile } from '../types';
import { getRankTier, getNextRankProgress, getUnlockedAchievements, getPerformanceGrade, PERFORMANCE_GRADE_COLORS, ACHIEVEMENT_RARITY_COLORS, getUtcDayStartMs, GAMIFICATION_FIRST_WIN_BONUS_EMBERS } from '../types';
interface PhaseOverlayProps {
    phase: MatchPhase;
    phaseEndsAt: number | null;
    turnPlayer: Side | null;
    mySide: Side;
    matchResult: { winner: Side; reason: string } | null;
    playerNames?: { left: string; right: string };
    roundScore?: { left: number; right: number };
    currentRound?: number;
    rematchState?: 'none' | 'requested' | 'opponent_requested';
    onRequestRematch?: () => void;
    onReturnToLobby?: () => void;
    hazards?: { type: string; id: string; windDirection?: number; windStrength?: number }[];
    matchScores?: MatchScores | null;
    playerProfile?: PlayerProfile | null;
    prevTotalScore?: number;
    prevPlayerProfile?: PlayerProfile | null;
}

export const PhaseOverlay = ({ phase, phaseEndsAt, turnPlayer, mySide, matchResult, playerNames, roundScore, currentRound, rematchState, onRequestRematch, onReturnToLobby, hazards, matchScores, playerProfile, prevTotalScore, prevPlayerProfile }: PhaseOverlayProps) => {
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [botDots, setBotDots] = useState(1);

    useEffect(() => {
        if (!phaseEndsAt) {
            // Use a microtask to avoid the synchronous setState-in-effect lint warning
            // while still resetting the timer display promptly when the phase ends.
            const id = setTimeout(() => setTimeLeft(null), 0);
            return () => clearTimeout(id);
        }

        const tick = () => {
            const remaining = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
            setTimeLeft(remaining);
        };

        tick();
        const interval = setInterval(tick, 250);
        return () => clearInterval(interval);
    }, [phaseEndsAt]);

    // Derive display value: null when there's no active phase end time
    const displayTimeLeft = phaseEndsAt ? timeLeft : null;

    // Animate bot thinking dots (cycles 1–3)
    useEffect(() => {
        const isBot = turnPlayer ? playerNames?.[turnPlayer] === 'Training Bot' : false;
        if (!isBot || turnPlayer === mySide) return;
        const t = setInterval(() => setBotDots(d => (d % 3) + 1), 450);
        return () => clearInterval(t);
    }, [turnPlayer, mySide, playerNames]);

    if (phase === 'lobby') return null;

    // Build phase banner
    if (phase === 'build') {
        return (
            <div className="w-full relative pointer-events-none">
                {/* Build Banner - Centered, inline timer */}
                <div role="status" aria-live="polite" aria-atomic="true" className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 sm:gap-1 rounded-xl px-4 sm:px-8 py-2 sm:py-2.5 backdrop-blur-xl border border-[rgba(39,174,96,0.3)] pointer-events-auto shadow-2xl text-center" style={{ background: 'rgba(22, 33, 62, 0.85)' }}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Hammer size={14} className="text-[var(--emerald)]" aria-hidden="true" />
                        <span className="text-[var(--emerald)] font-bold text-xs sm:text-sm font-display">
                            {currentRound ? `R${currentRound} — ` : ''}BUILD
                        </span>
                        {displayTimeLeft !== null && (
                            <span
                                aria-label={`${Math.floor(displayTimeLeft / 60)} minutes ${displayTimeLeft % 60} seconds remaining`}
                                className={`font-mono font-bold text-xs sm:text-sm ml-1 transition-all duration-300 ${displayTimeLeft <= 10 ? 'timer-urgent' : 'text-[var(--text-secondary)]'}`}
                            >
                                {Math.floor(displayTimeLeft / 60)}:{String(displayTimeLeft % 60).padStart(2, '0')}
                            </span>
                        )}
                    </div>
                    {roundScore && (
                        <span className="text-[var(--gold-dim)] text-[10px] sm:text-xs font-medium tracking-wider" aria-label={`Score: left ${roundScore.left}, right ${roundScore.right}`}>
                            {roundScore.left} — {roundScore.right}
                        </span>
                    )}
                </div>
            </div>
        );
    }

    // Reveal phase banner
    if (phase === 'reveal') {
        const hazardNames: Record<string, string> = {
            wind_zone: 'Wind Zone',
            lava_pool: 'Lava Pool',
            falling_rocks: 'Falling Rocks',
        };
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                <div role="status" aria-live="polite" className="rounded-xl px-5 sm:px-8 py-3 sm:py-4 backdrop-blur-xl text-center border border-[var(--border-accent)] pointer-events-auto shadow-2xl" style={{ background: 'rgba(22, 33, 62, 0.9)' }}>
                    <div className="flex items-center justify-center gap-2">
                        <Eye size={16} className="text-[var(--gold)]" aria-hidden="true" />
                        <span className="text-[var(--gold)] font-bold text-sm sm:text-base font-display">REVEALING KINGDOMS</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-[var(--text-muted)] mt-0.5">The scout surveys the battlefield...</p>
                    {hazards && hazards.length > 0 && (
                        <p className="text-xs text-[var(--ember)] mt-1 flex items-center justify-center gap-1">
                            <AlertTriangle size={12} aria-hidden="true" />
                            Hazards: {hazards.map(h => hazardNames[h.type] || h.type).join(', ')}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // Combat phase banner
    if (phase === 'combat') {
        const isMyTurn = turnPlayer === mySide;
        const isBot = turnPlayer ? playerNames?.[turnPlayer] === 'Training Bot' : false;
        const windHazard = hazards?.find(h => h.type === 'wind_zone');
        const botDotStr = '.'.repeat(botDots);
        return (
            <div className="w-full relative pointer-events-none">
                {/* Combat Banner - Centered, inline timer */}
                <div role="status" aria-live="polite" aria-atomic="true" className={`absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 sm:gap-1 rounded-xl px-4 sm:px-8 py-2 sm:py-2.5 backdrop-blur-xl border pointer-events-auto shadow-2xl text-center ${isMyTurn
                    ? 'border-[rgba(192,57,43,0.4)]'
                    : 'border-[var(--border-subtle)]'
                    }`} style={{ background: isMyTurn ? 'rgba(192,57,43,0.12)' : 'rgba(22, 33, 62, 0.85)' }}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        {isMyTurn ? <Flame size={14} className="text-[var(--crimson)]" /> : <Clock size={14} className="text-[var(--text-muted)]" />}
                        <span className={`font-bold text-xs sm:text-sm font-display ${isMyTurn ? 'text-[var(--crimson)]' : 'text-[var(--text-muted)]'}`}>
                            {isMyTurn ? 'YOUR TURN — FIRE!' : (isBot ? `BOT AIMING${botDotStr}` : "OPPONENT'S TURN")}
                        </span>
                        {displayTimeLeft !== null && (
                            <span
                                aria-label={`${displayTimeLeft} seconds remaining`}
                                className={`font-mono font-bold text-xs sm:text-sm ml-1 transition-all duration-300 ${displayTimeLeft <= 5 ? 'timer-urgent' : isMyTurn ? 'text-[var(--crimson)]' : 'text-[var(--text-muted)]'}`}
                            >
                                {displayTimeLeft}s
                            </span>
                        )}
                    </div>
                    {/* Wind Indicator — inline with turn banner */}
                    {windHazard && (() => {
                        const windSpeed = Math.round((windHazard.windStrength ?? 0.0003) * 20000);
                        const windLabel = windSpeed < 4 ? 'Light' : windSpeed < 8 ? 'Moderate' : 'Strong';
                        return (
                            <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: 'rgba(52,152,219,0.9)' }}>
                                <Wind size={11} />
                                <span>{(windHazard.windDirection ?? 1) > 0 ? '→' : '←'} {windLabel} Wind</span>
                            </div>
                        );
                    })()}
                    {/* Mobile: compact controls hint when it's your turn */}
                    {isMyTurn && (
                        <p className="sm:hidden text-[10px] text-[var(--text-muted)] mt-0.5">
                            Tap and drag to aim · release to fire
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // Result phase
    if (phase === 'result' && matchResult) {
        const isWinner = matchResult.winner === mySide;
        const reasonText = matchResult.reason === 'opponent_disconnected'
            ? '(Opponent fled the battlefield)'
            : matchResult.reason === 'king_destroyed'
                ? '(The King has fallen)'
                : '';
        const winnerName = playerNames?.[matchResult.winner] || (isWinner ? 'You' : 'Opponent');
        const myScore = matchScores?.[mySide];

        // Performance grade
        const grade = myScore ? getPerformanceGrade(myScore) : null;
        const gradeColor = grade ? PERFORMANCE_GRADE_COLORS[grade] : '#9CA3AF';

        // AI synergy
        const aiBlocksUsed = myScore?.aiBlocksUsed ?? 0;
        const aiSynergyBonus = myScore?.aiSynergyBonus ?? 0;
        const aiRatio = (myScore && myScore.resourcesUsed > 0) ? Math.min(100, Math.round((aiBlocksUsed / myScore.resourcesUsed) * 100)) : 0;

        // Rank progression
        const currentRankInfo = playerProfile ? getRankTier(playerProfile.totalScore) : null;
        const prevRankInfo = (prevTotalScore !== undefined) ? getRankTier(prevTotalScore) : null;
        const didRankUp = currentRankInfo && prevRankInfo && currentRankInfo.name !== prevRankInfo.name;
        const rankProgress = playerProfile ? getNextRankProgress(playerProfile.totalScore) : null;

        // Achievement unlocks
        const currentAchievements = playerProfile ? getUnlockedAchievements(playerProfile) : [];
        const prevAchievements = prevPlayerProfile ? getUnlockedAchievements(prevPlayerProfile) : [];
        const prevAchievementIds = new Set(prevAchievements.map(a => a.id));
        const newlyUnlocked = currentAchievements.filter(a => !prevAchievementIds.has(a.id));

        // First-win-of-day detection
        const todayStart = getUtcDayStartMs(new Date());
        const prevDailyWins = prevPlayerProfile?.history.filter(e => e.timestamp >= todayStart && e.won).length ?? 0;
        const currDailyWins = playerProfile?.history.filter(e => e.timestamp >= todayStart && e.won).length ?? 0;
        const isFirstWinOfDay = isWinner && prevDailyWins === 0 && currDailyWins >= 1;

        return (
            <div className="flex items-center justify-center w-full">
                <div className={`rounded-2xl px-5 sm:px-8 py-4 sm:py-6 backdrop-blur-xl border text-center shadow-2xl w-full max-w-sm ${isWinner
                    ? 'border-[var(--border-accent)]'
                    : 'border-[rgba(192,57,43,0.4)]'
                    }`} style={{ background: isWinner ? 'rgba(22, 33, 62, 0.95)' : 'rgba(22, 20, 30, 0.95)' }}>

                    {/* Header row: Grade + Result + AI badge */}
                    <div className="flex items-center justify-between mb-2 gap-2">
                        {/* Performance grade */}
                        {grade && (
                            <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl shrink-0"
                                style={{ background: `${gradeColor}18`, border: `2px solid ${gradeColor}66` }}>
                                <span className="text-xl font-black font-mono leading-none" style={{ color: gradeColor }}>{grade}</span>
                                <span className="text-[8px] text-[var(--text-muted)] uppercase tracking-wide mt-0.5">Grade</span>
                            </div>
                        )}

                        {/* Victory / Defeat */}
                        <div className="flex-1">
                            <div className={`text-lg sm:text-2xl font-bold font-heading ${isWinner ? 'text-[var(--gold)] text-glow-gold' : 'text-[var(--crimson)] text-glow-ember'}`}>
                                <span className="flex items-center justify-center gap-1.5">
                                    {isWinner ? <Crown size={22} /> : <Skull size={22} />}
                                    {isWinner ? 'VICTORY' : 'DEFEAT'}
                                </span>
                            </div>
                            <p className="text-[10px] sm:text-xs text-[var(--text-secondary)]">{winnerName} conquers!</p>
                            {roundScore && (
                                <p className="text-[10px] text-[var(--text-muted)]">Rounds: {roundScore.left}–{roundScore.right}</p>
                            )}
                            {reasonText && (
                                <p className="text-[10px] sm:text-xs text-[var(--text-muted)]">{reasonText}</p>
                            )}
                        </div>

                        {/* AI Synergy indicator */}
                        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl shrink-0"
                            style={{ background: aiBlocksUsed > 0 ? 'rgba(168,139,250,0.12)' : 'rgba(255,255,255,0.04)', border: `2px solid ${aiBlocksUsed > 0 ? 'rgba(168,139,250,0.4)' : 'rgba(255,255,255,0.1)'}` }}>
                            <span className="text-base leading-none">{aiBlocksUsed > 0 ? '🤖' : '🔨'}</span>
                            <span className="text-[8px] mt-0.5 font-bold" style={{ color: aiBlocksUsed > 0 ? '#A78BFA' : 'var(--text-muted)' }}>
                                {aiBlocksUsed > 0 ? `${aiRatio}% AI` : 'Manual'}
                            </span>
                        </div>
                    </div>

                    {/* Score breakdown */}
                    {myScore && (
                        <div className="border-t border-[var(--border-subtle)] pt-2 mt-1">
                            <p className="text-xs sm:text-sm font-bold text-[var(--gold)] mb-1.5 font-display">
                                YOUR SCORE: +{myScore.totalScore}
                            </p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] sm:text-xs text-[var(--text-muted)]">
                                <span className="text-right">Damage dealt:</span>
                                <span className="text-left text-[var(--text-secondary)]">+{myScore.damagePoints}</span>
                                <span className="text-right">Resource bonus:</span>
                                <span className="text-left text-[var(--text-secondary)]">+{myScore.resourceBonus}</span>
                                {aiSynergyBonus > 0 && (
                                    <>
                                        <span className="text-right" style={{ color: '#A78BFA' }}>AI synergy:</span>
                                        <span className="text-left font-bold" style={{ color: '#A78BFA' }}>+{aiSynergyBonus} 🤖</span>
                                    </>
                                )}
                                <span className="text-right">Time bonus:</span>
                                <span className="text-left text-[var(--text-secondary)]">+{myScore.timeBonus}</span>
                                {myScore.winBonus > 0 && (
                                    <>
                                        <span className="text-right">Win bonus:</span>
                                        <span className="text-left text-[var(--emerald)]">+{myScore.winBonus}</span>
                                    </>
                                )}
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">
                                {myScore.resourcesUsed} blocks · {Math.round(myScore.combatTimeMs / 1000)}s combat · {myScore.damageDealt.toFixed(1)} dmg
                            </p>
                        </div>
                    )}

                    {/* Newly unlocked achievements */}
                    {newlyUnlocked.length > 0 && (
                        <div className="mt-2 border-t border-[var(--border-subtle)] pt-2">
                            <p className="text-[10px] font-bold text-[var(--emerald)] uppercase tracking-wider mb-1.5 flex items-center justify-center gap-1">
                                <Zap size={10} />
                                Achievement{newlyUnlocked.length > 1 ? 's' : ''} Unlocked!
                            </p>
                            <div className="flex flex-wrap justify-center gap-1.5">
                                {newlyUnlocked.map(a => (
                                    <div key={a.id} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold"
                                        style={{ background: `${ACHIEVEMENT_RARITY_COLORS[a.rarity]}18`, border: `1px solid ${ACHIEVEMENT_RARITY_COLORS[a.rarity]}55`, color: ACHIEVEMENT_RARITY_COLORS[a.rarity] }}>
                                        <span>{a.icon}</span>
                                        <span>{a.title}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* First Win of the Day badge */}
                    {isFirstWinOfDay && (
                        <div className="mt-2 border-t border-[var(--border-subtle)] pt-2">
                            <div className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2"
                                style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.35)' }}>
                                <span className="text-base leading-none">⭐</span>
                                <div className="text-center">
                                    <p className="text-[11px] font-bold text-[var(--gold)]">First Win of the Day!</p>
                                    <p className="text-[10px] text-[var(--text-muted)]">+{GAMIFICATION_FIRST_WIN_BONUS_EMBERS} Embers bonus · Come back tomorrow!</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Rank progression */}
                    {currentRankInfo && (
                        <div className="mt-2 border-t border-[var(--border-subtle)] pt-2">
                            {didRankUp ? (
                                <div className="text-center animate-pulse mb-1.5">
                                    <p className="text-xs font-bold text-[var(--emerald)]">🎉 RANK UP!</p>
                                    <p className="text-sm font-bold" style={{ color: currentRankInfo.color }}>
                                        {currentRankInfo.emoji} {currentRankInfo.name}
                                    </p>
                                    <p className="text-[10px] text-[var(--text-muted)] italic">{currentRankInfo.description}</p>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center gap-2 mb-1.5">
                                    <span className="text-base">{currentRankInfo.emoji}</span>
                                    <span className="text-xs font-bold" style={{ color: currentRankInfo.color }}>{currentRankInfo.name}</span>
                                    {playerProfile && (
                                        <span className="text-[10px] text-[var(--text-muted)] font-mono">{playerProfile.totalScore.toLocaleString()} pts</span>
                                    )}
                                </div>
                            )}
                            {rankProgress && rankProgress.nextRank && (
                                <div>
                                    <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1">
                                        <span>Next: <span style={{ color: rankProgress.nextRank.color }}>{rankProgress.nextRank.emoji} {rankProgress.nextRank.name}</span></span>
                                        <span className="flex items-center gap-1">
                                            <TrendingUp size={10} />
                                            {rankProgress.pointsNeeded.toLocaleString()} pts
                                        </span>
                                    </div>
                                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                        <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{
                                                width: `${Math.round(rankProgress.progress * 100)}%`,
                                                background: `linear-gradient(90deg, ${currentRankInfo.color}, ${rankProgress.nextRank.color})`,
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Rematch button */}
                    {onRequestRematch && (
                        <div className="mt-3">
                            {rematchState === 'none' && (
                                <button
                                    onClick={onRequestRematch}
                                    className="btn-primary min-h-[44px] min-w-[120px] px-6 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 mx-auto"
                                >
                                    <RotateCcw size={16} />
                                    REMATCH
                                </button>
                            )}
                            {rematchState === 'requested' && (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="w-3 h-3 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
                                    <p className="text-xs sm:text-sm text-[var(--text-muted)]">Awaiting opponent&apos;s response...</p>
                                </div>
                            )}
                            {rematchState === 'opponent_requested' && (
                                <div>
                                    <p className="text-xs sm:text-sm text-[var(--ember)] mb-2 animate-pulse flex items-center justify-center gap-1">
                                        <Swords size={14} /> The enemy demands a rematch!
                                    </p>
                                    <button
                                        onClick={onRequestRematch}
                                        className="btn-emerald min-h-[44px] min-w-[120px] px-6 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 mx-auto"
                                    >
                                        ACCEPT CHALLENGE
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* New Game — return to lobby cleanly */}
                    <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
                        <button
                            onClick={() => onReturnToLobby?.()}
                            className="btn-medieval min-h-[40px] px-5 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 mx-auto"
                        >
                            <Home size={13} />
                            New Game
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};
