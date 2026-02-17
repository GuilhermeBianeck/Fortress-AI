import { useState, useEffect } from 'react';
import type { MatchPhase, Side } from '../types';

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
    hazards?: { type: string; id: string }[];
}

export const PhaseOverlay = ({ phase, phaseEndsAt, turnPlayer, mySide, matchResult, playerNames, roundScore, currentRound, rematchState, onRequestRematch, hazards }: PhaseOverlayProps) => {
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
                <div className="flex items-center gap-1.5 sm:gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 backdrop-blur-sm">
                    <span className="text-emerald-400 font-bold text-xs sm:text-sm">
                        {currentRound ? `R${currentRound} — ` : ''}BUILD
                    </span>
                    {roundScore && (
                        <span className="text-neutral-400 text-[10px] sm:text-xs ml-1 sm:ml-2">
                            [{roundScore.left} - {roundScore.right}]
                        </span>
                    )}
                </div>
                {timeLeft !== null && (
                    <div className={`font-mono font-bold text-sm sm:text-lg ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-neutral-300'}`}>
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
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg px-4 sm:px-6 py-2 sm:py-3 backdrop-blur-sm text-center">
                    <span className="text-violet-400 font-bold text-sm sm:text-base">REVEALING FORTRESSES</span>
                    <p className="text-[10px] sm:text-xs text-violet-300/60 mt-0.5">Camera is panning across the battlefield...</p>
                    {hazards && hazards.length > 0 && (
                        <p className="text-xs text-amber-400/80 mt-1">
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
        return (
            <div className="flex items-center justify-between w-full w-full">
                <div className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 backdrop-blur-sm border ${
                    isMyTurn
                        ? 'bg-red-500/10 border-red-500/20'
                        : 'bg-neutral-500/10 border-neutral-500/20'
                }`}>
                    <span className={`font-bold text-xs sm:text-sm ${isMyTurn ? 'text-red-400' : 'text-neutral-400'}`}>
                        {isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN"}
                    </span>
                </div>
                {timeLeft !== null && (
                    <div className={`font-mono font-bold text-sm sm:text-lg ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-neutral-300'}`}>
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
            ? '(Opponent disconnected)'
            : matchResult.reason === 'king_destroyed'
                ? '(King destroyed)'
                : '';
        const winnerName = playerNames?.[matchResult.winner] || (isWinner ? 'You' : 'Opponent');

        return (
            <div className="flex items-center justify-center w-full w-full">
                <div className={`rounded-xl sm:rounded-2xl px-5 sm:px-8 py-4 sm:py-6 backdrop-blur-sm border text-center ${
                    isWinner
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                }`}>
                    <div className={`text-xl sm:text-3xl font-bold mb-1 ${isWinner ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isWinner ? 'VICTORY' : 'DEFEAT'}
                    </div>
                    <p className="text-xs sm:text-sm text-neutral-300 mb-1">{winnerName} wins!</p>
                    {roundScore && (
                        <p className="text-xs sm:text-sm text-neutral-400 mb-1">
                            Score: {roundScore.left} - {roundScore.right}
                        </p>
                    )}
                    {reasonText && (
                        <p className="text-[10px] sm:text-sm text-neutral-400">{reasonText}</p>
                    )}

                    {/* Rematch button */}
                    {onRequestRematch && (
                        <div className="mt-3 sm:mt-4">
                            {rematchState === 'none' && (
                                <button
                                    onClick={onRequestRematch}
                                    className="px-4 sm:px-6 py-1.5 sm:py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition-colors text-sm"
                                >
                                    REMATCH
                                </button>
                            )}
                            {rematchState === 'requested' && (
                                <p className="text-xs sm:text-sm text-amber-400">Waiting for opponent...</p>
                            )}
                            {rematchState === 'opponent_requested' && (
                                <div>
                                    <p className="text-xs sm:text-sm text-emerald-400 mb-2">Opponent wants a rematch!</p>
                                    <button
                                        onClick={onRequestRematch}
                                        className="px-4 sm:px-6 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors text-sm"
                                    >
                                        ACCEPT
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
