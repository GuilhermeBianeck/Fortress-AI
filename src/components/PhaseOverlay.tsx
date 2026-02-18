import { useState, useEffect } from 'react';
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
            <div className="flex items-center justify-between w-full w-full">
                <div className="flex items-center gap-1.5 sm:gap-2 bg-green-900/20 border border-green-800/30 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 backdrop-blur-sm">
                    <span className="text-green-400 font-bold text-xs sm:text-sm">
                        {currentRound ? `R${currentRound} — ` : ''}🔨 BUILD
                    </span>
                    {roundScore && (
                        <span className="text-amber-600 text-[10px] sm:text-xs ml-1 sm:ml-2">
                            [{roundScore.left} - {roundScore.right}]
                        </span>
                    )}
                </div>
                {timeLeft !== null && (
                    <div className={`font-mono font-bold text-sm sm:text-lg ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-amber-200'}`}>
                        {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
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
            <div className="flex items-center justify-center w-full w-full">
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg px-4 sm:px-6 py-2 sm:py-3 backdrop-blur-sm text-center">
                    <span className="text-amber-300 font-bold text-sm sm:text-base">🔭 REVEALING KINGDOMS</span>
                    <p className="text-[10px] sm:text-xs text-amber-600/80 mt-0.5">The scout surveys the battlefield...</p>
                    {hazards && hazards.length > 0 && (
                        <p className="text-xs text-amber-400/80 mt-1">
                            ⚠️ Hazards: {hazards.map(h => hazardNames[h.type] || h.type).join(', ')}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // Combat phase banner
    if (phase === 'combat') {
        const isMyTurn = turnPlayer === mySide;
        const windHazard = hazards?.find(h => h.type === 'wind_zone');
        return (
            <div className="flex items-center justify-between w-full w-full gap-2">
                <div className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 backdrop-blur-sm border ${
                    isMyTurn
                        ? 'bg-red-900/20 border-red-800/30'
                        : 'bg-amber-900/15 border-amber-800/20'
                }`}>
                    <span className={`font-bold text-xs sm:text-sm ${isMyTurn ? 'text-red-400' : 'text-amber-600'}`}>
                        {isMyTurn ? '💥 YOUR TURN — FIRE!' : "⏳ OPPONENT'S TURN"}
                    </span>
                </div>
                {windHazard && (
                    <div className="flex items-center gap-1 bg-cyan-900/20 border border-cyan-800/30 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 backdrop-blur-sm">
                        <span className="text-cyan-400 text-sm sm:text-base">
                            {(windHazard.windDirection ?? 1) > 0 ? '\u2192' : '\u2190'}
                        </span>
                        <span className="text-cyan-300 text-[10px] sm:text-xs font-bold">
                            WIND {Math.round(((windHazard.windStrength ?? 0.0003) / 0.0003) * 100)}%
                        </span>
                    </div>
                )}
                {timeLeft !== null && (
                    <div className={`font-mono font-bold text-sm sm:text-lg ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-amber-200'}`}>
                        {timeLeft}s
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
            <div className="flex items-center justify-center w-full w-full">
                <div className={`rounded-xl sm:rounded-2xl px-5 sm:px-8 py-4 sm:py-6 backdrop-blur-sm border text-center ${
                    isWinner
                        ? 'bg-amber-900/20 border-amber-600/30'
                        : 'bg-red-900/20 border-red-800/30'
                }`}>
                    <div className={`text-xl sm:text-3xl font-bold mb-1 ${isWinner ? 'text-amber-300' : 'text-red-400'}`} style={{ fontFamily: "'MedievalSharp', cursive" }}>
                        {isWinner ? '👑 VICTORY' : '💀 DEFEAT'}
                    </div>
                    <p className="text-xs sm:text-sm text-amber-200 mb-1">{winnerName} conquers!</p>
                    {roundScore && (
                        <p className="text-xs sm:text-sm text-amber-600 mb-1">
                            Rounds: {roundScore.left} - {roundScore.right}
                        </p>
                    )}
                    {reasonText && (
                        <p className="text-[10px] sm:text-sm text-amber-700">{reasonText}</p>
                    )}

                    {/* Score breakdown */}
                    {myScore && (
                        <div className="mt-2 sm:mt-3 border-t border-amber-900/30 pt-2 sm:pt-3">
                            <p className="text-xs sm:text-sm font-bold text-amber-400 mb-1.5">
                                YOUR SCORE: {myScore.totalScore}
                            </p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] sm:text-xs text-amber-600">
                                <span className="text-right">Damage dealt:</span>
                                <span className="text-left text-amber-200">+{myScore.damagePoints}</span>
                                <span className="text-right">Resource bonus:</span>
                                <span className="text-left text-amber-200">+{myScore.resourceBonus}</span>
                                <span className="text-right">Time bonus:</span>
                                <span className="text-left text-amber-200">+{myScore.timeBonus}</span>
                                {myScore.winBonus > 0 && (
                                    <>
                                        <span className="text-right">Win bonus:</span>
                                        <span className="text-left text-green-400">+{myScore.winBonus}</span>
                                    </>
                                )}
                            </div>
                            <p className="text-[10px] sm:text-xs text-amber-800 mt-1">
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
                                    className="min-h-[44px] min-w-[120px] px-6 sm:px-6 py-2.5 sm:py-2 bg-gradient-to-b from-amber-700 to-amber-800 hover:from-amber-600 hover:to-amber-700 active:from-amber-800 active:to-amber-900 text-amber-100 font-bold rounded-lg text-sm
                                        transition-colors duration-200 touch-manipulation shadow-md shadow-amber-900/30"
                                >
                                    ⚔️ REMATCH
                                </button>
                            )}
                            {rematchState === 'requested' && (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                    <p className="text-xs sm:text-sm text-amber-400">Awaiting opponent&apos;s response...</p>
                                </div>
                            )}
                            {rematchState === 'opponent_requested' && (
                                <div>
                                    <p className="text-xs sm:text-sm text-green-400 mb-2 animate-pulse">⚔️ The enemy demands a rematch!</p>
                                    <button
                                        onClick={onRequestRematch}
                                        className="min-h-[44px] min-w-[120px] px-6 sm:px-6 py-2.5 sm:py-2 bg-gradient-to-b from-green-700 to-green-800 hover:from-green-600 hover:to-green-700 active:from-green-800 active:to-green-900 text-green-100 font-bold rounded-lg text-sm
                                            transition-colors duration-200 touch-manipulation shadow-md shadow-green-900/30"
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
