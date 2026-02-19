import { useState, useEffect } from 'react';
import { Swords, Crown, Skull, RotateCcw, Wind, Eye, Hammer, Clock, Flame, AlertTriangle } from 'lucide-react';
import type { MatchPhase, Side, MatchScores } from '../types';

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
    hazards?: { type: string; id: string; windDirection?: number; windStrength?: number }[];
    matchScores?: MatchScores | null;
}

export const PhaseOverlay = ({ phase, phaseEndsAt, turnPlayer, mySide, matchResult, playerNames, roundScore, currentRound, rematchState, onRequestRematch, hazards, matchScores }: PhaseOverlayProps) => {
    const [timeLeft, setTimeLeft] = useState<number | null>(null);

    useEffect(() => {
        if (!phaseEndsAt) {
            setTimeLeft(null);
            return;
        }

        const tick = () => {
            const remaining = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
            setTimeLeft(remaining);
        };

        tick();
        const interval = setInterval(tick, 250);
        return () => clearInterval(interval);
    }, [phaseEndsAt]);

    if (phase === 'lobby') return null;

    // Build phase banner
    if (phase === 'build') {
        return (
            <div className="w-full relative pointer-events-none">
                {/* Build Banner - Centered, Two Lines */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 sm:gap-1 rounded-xl px-4 sm:px-8 py-2 sm:py-2.5 backdrop-blur-xl border border-[rgba(39,174,96,0.3)] pointer-events-auto shadow-2xl text-center" style={{ background: 'rgba(22, 33, 62, 0.85)' }}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Hammer size={14} className="text-[var(--emerald)]" />
                        <span className="text-[var(--emerald)] font-bold text-xs sm:text-sm font-display">
                            {currentRound ? `R${currentRound} — ` : ''}BUILD
                        </span>
                    </div>
                    {roundScore && (
                        <span className="text-[var(--gold-dim)] text-[10px] sm:text-xs font-medium tracking-wider">
                            {roundScore.left} — {roundScore.right}
                        </span>
                    )}
                </div>

                {/* Build Timer - Centered and Moved Down (below Done button) */}
                {timeLeft !== null && (
                    <div className="absolute top-[110px] left-1/2 -translate-x-1/2 pointer-events-auto flex flex-col items-center">
                        <div className={`font-mono font-bold text-sm sm:text-lg transition-all duration-300 ${timeLeft <= 10 ? 'timer-urgent' : 'text-[var(--text-primary)]'}`}>
                            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                        </div>
                    </div>
                )}
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
                <div className="rounded-xl px-5 sm:px-8 py-3 sm:py-4 backdrop-blur-xl text-center border border-[var(--border-accent)] pointer-events-auto shadow-2xl" style={{ background: 'rgba(22, 33, 62, 0.9)' }}>
                    <div className="flex items-center justify-center gap-2">
                        <Eye size={16} className="text-[var(--gold)]" />
                        <span className="text-[var(--gold)] font-bold text-sm sm:text-base font-display">REVEALING KINGDOMS</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-[var(--text-muted)] mt-0.5">The scout surveys the battlefield...</p>
                    {hazards && hazards.length > 0 && (
                        <p className="text-xs text-[var(--ember)] mt-1 flex items-center justify-center gap-1">
                            <AlertTriangle size={12} />
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
        return (
            <div className="w-full relative pointer-events-none">
                {/* Combat Banner - Centered */}
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 sm:gap-1 rounded-xl px-4 sm:px-8 py-2 sm:py-2.5 backdrop-blur-xl border pointer-events-auto shadow-2xl text-center ${isMyTurn
                    ? 'border-[rgba(192,57,43,0.4)]'
                    : 'border-[var(--border-subtle)]'
                    }`} style={{ background: isMyTurn ? 'rgba(192,57,43,0.12)' : 'rgba(22, 33, 62, 0.85)' }}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        {isMyTurn ? <Flame size={14} className="text-[var(--crimson)]" /> : <Clock size={14} className="text-[var(--text-muted)]" />}
                        <span className={`font-bold text-xs sm:text-sm font-display ${isMyTurn ? 'text-[var(--crimson)]' : 'text-[var(--text-muted)]'}`}>
                            {isMyTurn ? 'YOUR TURN — FIRE!' : (isBot ? "BOT'S TURN..." : "OPPONENT'S TURN")}
                        </span>
                    </div>
                </div>

                {/* Wind Indicator - Centered Below Banner */}
                {windHazard && (
                    <div className="absolute top-[45px] left-1/2 -translate-x-1/2 pointer-events-auto">
                        <div className="flex items-center gap-1 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 backdrop-blur-md border border-[rgba(52,152,219,0.3)]" style={{ background: 'rgba(52,152,219,0.1)' }}>
                            <Wind size={14} className="text-[var(--royal-blue)]" />
                            <span className="text-[var(--royal-blue)] text-[10px] sm:text-xs font-bold">
                                {(windHazard.windDirection ?? 1) > 0 ? '\u2192' : '\u2190'} {Math.round((windHazard.windStrength ?? 0.0003) * 20000)} KNOTS
                            </span>
                        </div>
                    </div>
                )}

                {/* Combat Timer - Centered Below (similar position to Build timer) */}
                {timeLeft !== null && (
                    <div className="absolute top-[110px] left-1/2 -translate-x-1/2 pointer-events-auto flex flex-col items-center">
                        <div className={`font-mono font-bold text-sm sm:text-lg transition-all duration-300 ${timeLeft <= 5 ? 'timer-urgent' : 'text-[var(--text-primary)]'}`}>
                            {timeLeft}s
                        </div>
                    </div>
                )}
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

        return (
            <div className="flex items-center justify-center w-full">
                <div className={`rounded-2xl px-6 sm:px-10 py-5 sm:py-8 backdrop-blur-xl border text-center shadow-2xl ${isWinner
                    ? 'border-[var(--border-accent)]'
                    : 'border-[rgba(192,57,43,0.4)]'
                    }`} style={{ background: isWinner ? 'rgba(22, 33, 62, 0.92)' : 'rgba(22, 20, 30, 0.92)' }}>
                    <div className={`text-xl sm:text-3xl font-bold mb-1 font-heading ${isWinner ? 'text-[var(--gold)] text-glow-gold' : 'text-[var(--crimson)] text-glow-ember'}`}>
                        <span className="flex items-center justify-center gap-2">
                            {isWinner ? <Crown size={28} /> : <Skull size={28} />}
                            {isWinner ? 'VICTORY' : 'DEFEAT'}
                        </span>
                    </div>
                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-1">{winnerName} conquers!</p>
                    {roundScore && (
                        <p className="text-xs sm:text-sm text-[var(--text-muted)] mb-1">
                            Rounds: {roundScore.left} - {roundScore.right}
                        </p>
                    )}
                    {reasonText && (
                        <p className="text-[10px] sm:text-sm text-[var(--text-muted)]">{reasonText}</p>
                    )}

                    {/* Score breakdown */}
                    {myScore && (
                        <div className="mt-2 sm:mt-3 border-t border-[var(--border-subtle)] pt-2 sm:pt-3">
                            <p className="text-xs sm:text-sm font-bold text-[var(--gold)] mb-1.5 font-display">
                                YOUR SCORE: {myScore.totalScore}
                            </p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] sm:text-xs text-[var(--text-muted)]">
                                <span className="text-right">Damage dealt:</span>
                                <span className="text-left text-[var(--text-secondary)]">+{myScore.damagePoints}</span>
                                <span className="text-right">Resource bonus:</span>
                                <span className="text-left text-[var(--text-secondary)]">+{myScore.resourceBonus}</span>
                                <span className="text-right">Time bonus:</span>
                                <span className="text-left text-[var(--text-secondary)]">+{myScore.timeBonus}</span>
                                {myScore.winBonus > 0 && (
                                    <>
                                        <span className="text-right">Win bonus:</span>
                                        <span className="text-left text-[var(--emerald)]">+{myScore.winBonus}</span>
                                    </>
                                )}
                            </div>
                            <p className="text-[10px] sm:text-xs text-[var(--text-muted)] mt-1">
                                {myScore.resourcesUsed} blocks · {Math.round(myScore.combatTimeMs / 1000)}s combat · {myScore.damageDealt.toFixed(1)} dmg
                            </p>
                        </div>
                    )}

                    {/* Rematch button */}
                    {onRequestRematch && (
                        <div className="mt-3 sm:mt-4">
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
                </div>
            </div>
        );
    }

    return null;
};
