import { useState, useEffect } from 'react';
import type { MatchPhase, Side } from '../types';

interface PhaseOverlayProps {
    phase: MatchPhase;
    phaseEndsAt: number | null;
    turnPlayer: Side | null;
    mySide: Side;
    matchResult: { winner: Side; reason: string } | null;
}

export const PhaseOverlay = ({ phase, phaseEndsAt, turnPlayer, mySide, matchResult }: PhaseOverlayProps) => {
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
            <div className="flex items-center justify-between w-full max-w-[800px]">
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2 backdrop-blur-sm">
                    <span className="text-emerald-400 font-bold text-sm">BUILD YOUR FORTRESS</span>
                </div>
                {timeLeft !== null && (
                    <div className={`font-mono font-bold text-lg ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-neutral-300'}`}>
                        {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                    </div>
                )}
            </div>
        );
    }

    // Reveal phase banner
    if (phase === 'reveal') {
        return (
            <div className="flex items-center justify-center w-full max-w-[800px]">
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg px-6 py-3 backdrop-blur-sm text-center">
                    <span className="text-violet-400 font-bold">REVEALING FORTRESSES</span>
                    <p className="text-xs text-violet-300/60 mt-0.5">Camera is panning across the battlefield...</p>
                </div>
            </div>
        );
    }

    // Combat phase banner
    if (phase === 'combat') {
        const isMyTurn = turnPlayer === mySide;
        return (
            <div className="flex items-center justify-between w-full max-w-[800px]">
                <div className={`flex items-center gap-2 rounded-lg px-4 py-2 backdrop-blur-sm border ${
                    isMyTurn
                        ? 'bg-red-500/10 border-red-500/20'
                        : 'bg-neutral-500/10 border-neutral-500/20'
                }`}>
                    <span className={`font-bold text-sm ${isMyTurn ? 'text-red-400' : 'text-neutral-400'}`}>
                        {isMyTurn ? 'YOUR TURN — AIM & FIRE!' : "OPPONENT'S TURN"}
                    </span>
                </div>
                {timeLeft !== null && (
                    <div className={`font-mono font-bold text-lg ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-neutral-300'}`}>
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

        return (
            <div className="flex items-center justify-center w-full max-w-[800px]">
                <div className={`rounded-2xl px-8 py-6 backdrop-blur-sm border text-center ${
                    isWinner
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                }`}>
                    <div className={`text-3xl font-bold mb-1 ${isWinner ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isWinner ? 'VICTORY' : 'DEFEAT'}
                    </div>
                    {reasonText && (
                        <p className="text-sm text-neutral-400">{reasonText}</p>
                    )}
                </div>
            </div>
        );
    }

    return null;
};
