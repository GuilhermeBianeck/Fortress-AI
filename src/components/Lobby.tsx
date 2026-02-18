import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { RoomState, PlayerProfile } from '../types';
import { Swords, Zap, Check, Trophy } from 'lucide-react';

export interface LobbyProps {
    roomState: RoomState | null;
    queuePosition: number | null;
    playerName: string;
    onPlayerNameChange: (name: string) => void;
    onCreateRoom: (name?: string, mode?: 'pvp' | 'single') => void;
    onJoinRoom: (code: string, name?: string) => void;
    onJoinQueue: (name?: string) => void;
    onLeaveQueue: () => void;
    onReady: () => void;
    playerProfile?: PlayerProfile | null;
    onGetProfile?: () => void;
}

export const Lobby = ({
    roomState, queuePosition,
    playerName, onPlayerNameChange,
    onCreateRoom, onJoinRoom, onJoinQueue, onLeaveQueue, onReady,
    playerProfile, onGetProfile,
}: LobbyProps) => {
    const [joinCode, setJoinCode] = useState('');
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        onGetProfile?.();
    }, [onGetProfile]);

    const handleJoinSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (joinCode.trim().length >= 4) {
            onJoinRoom(joinCode.trim(), playerName);
        }
    };

    const handleReady = () => {
        if (isReady) return;
        setIsReady(true);
        onReady();
    };

    // Waiting room view
    if (roomState) {
        const isSinglePlayer = roomState.opponentName === 'Training Bot';

        return (
            <div className="flex-1 w-full flex items-center justify-center bg-gradient-to-br from-[#fdf6e3] via-[#faf0d7] to-[#fdf6e3] p-6">
                <div className="w-full max-w-md text-center">
                    <h2 className="text-2xl font-bold text-amber-700 mb-3" style={{ fontFamily: "'MedievalSharp', cursive" }}>
                        {isSinglePlayer ? '⚔️ Training Grounds' : '⚔️ War Room'}
                    </h2>

                    {!isSinglePlayer && (
                        <>
                            <div className="text-5xl font-mono font-bold text-amber-500 tracking-[0.3em] mb-6 select-all">
                                {roomState.roomId}
                            </div>
                            <p className="text-base text-amber-600 mb-4">
                                Share this code with your opponent
                            </p>
                        </>
                    )}

                    <div className="p-4 rounded-xl bg-white/60 border border-amber-300/30 inline-block w-full">
                        <div className="flex items-center justify-center gap-2 text-base">
                            <span className={`w-2.5 h-2.5 rounded-full ${roomState.opponentConnected ? 'bg-green-500' : 'bg-amber-400 animate-pulse'}`} />
                            <span className={roomState.opponentConnected ? 'text-green-600' : 'text-amber-500'}>
                                {roomState.opponentConnected
                                    ? (isSinglePlayer ? 'Bot is ready' : 'Opponent has arrived')
                                    : 'Awaiting challenger...'}
                            </span>
                        </div>
                        <p className="text-sm text-amber-500 mt-2">
                            You are: <span className="text-amber-800 font-medium">{roomState.side.toUpperCase()}</span> kingdom
                        </p>
                    </div>

                    {roomState.opponentConnected && (
                        <div>
                            <button
                                onClick={handleReady}
                                disabled={isReady}
                                className={`mt-6 sm:mt-8 w-full max-w-sm mx-auto min-h-[48px] py-3.5 sm:py-4 font-bold rounded-xl text-lg sm:text-xl touch-manipulation
                                    transition-colors duration-200 shadow-lg
                                    ${isReady
                                        ? 'bg-green-200 text-green-700 ring-2 ring-green-400/50 cursor-default shadow-green-300/30'
                                        : 'bg-gradient-to-b from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 active:from-green-600 active:to-green-700 text-white cursor-pointer shadow-green-400/30'
                                    }`}
                            >
                                {isReady ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Check size={22} /> READY FOR BATTLE
                                    </span>
                                ) : '⚔️ READY FOR BATTLE'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Queue view
    if (queuePosition !== null) {
        return (
            <div className="flex-1 w-full flex items-center justify-center bg-gradient-to-br from-[#fdf6e3] via-[#faf0d7] to-[#fdf6e3] p-6">
                <div className="w-full text-center">
                    <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                    <h2 className="text-2xl font-bold text-amber-700 mb-3" style={{ fontFamily: "'MedievalSharp', cursive" }}>Seeking Challenger...</h2>
                    <p className="text-base text-amber-500">Queue position: {queuePosition + 1}</p>
                    <button
                        onClick={onLeaveQueue}
                        className="mt-6 sm:mt-8 min-h-[48px] px-8 py-3 bg-white/70 hover:bg-amber-100/60 active:bg-amber-200/60 text-amber-600 rounded-xl border border-amber-300/40
                            transition-colors duration-200 touch-manipulation text-base"
                    >
                        Retreat
                    </button>
                </div>
            </div>
        );
    }

    // Main lobby — fills full width, two columns on wide screens
    return (
        <div className="flex-1 w-full flex flex-col lg:flex-row items-stretch bg-gradient-to-br from-[#fdf6e3] via-[#faf0d7] to-[#fdf6e3] overflow-hidden">
            {/* Left side — Branding */}
            <div className="flex flex-col items-center justify-center lg:flex-1 p-6 sm:p-8 lg:p-12">
                <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                    <div className="text-5xl">🏰</div>
                    <div>
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-amber-700" style={{ fontFamily: "'MedievalSharp', cursive" }}>FORTRESS AI</h1>
                        <p className="text-sm sm:text-base text-amber-500 mt-1">⚔️ Castle War — Build & Conquer</p>
                    </div>
                </div>
                <div className="hidden lg:flex flex-col gap-4 text-amber-600 text-sm">
                    <div className="flex items-center gap-3">
                        <Swords size={18} className="text-amber-500 shrink-0" />
                        <span>Build AI-powered castles and siege your enemy&apos;s kingdom</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Zap size={18} className="text-amber-400 shrink-0" />
                        <span>Turn-based combat with cannon fire and physics destruction</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-lg shrink-0">🛡️</span>
                        <span>Defend your King against enemy bombardment</span>
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="hidden lg:block w-px self-stretch bg-amber-300/40 my-10" />
            <div className="lg:hidden w-2/3 h-px bg-amber-300/40 mx-auto" />

            {/* Right side — Actions: fills all available width */}
            <div className="flex flex-col items-center justify-center lg:flex-1 p-6 sm:p-8 lg:p-12">
                <div className="flex flex-col gap-3 sm:gap-4 w-full max-w-md">
                    {/* Player Name */}
                    <input
                        type="text"
                        value={playerName}
                        onChange={(e) => onPlayerNameChange(e.target.value)}
                        placeholder="Enter thy name..."
                        maxLength={20}
                        className="w-full bg-white/60 border border-amber-300/40 rounded-xl px-4 py-3 sm:py-4 text-center text-base sm:text-lg font-medium text-amber-800 placeholder:text-amber-400/60 outline-none focus:border-amber-500/60 transition-all touch-manipulation"
                    />

                    {/* Single Player */}
                    <button
                        onClick={() => onCreateRoom(playerName, 'single')}
                        className="w-full min-h-[48px] py-3.5 sm:py-5 bg-gradient-to-b from-blue-400 to-blue-500 hover:from-blue-500 hover:to-blue-600 active:from-blue-600 active:to-blue-700 text-white font-bold rounded-xl text-lg sm:text-xl shadow-lg shadow-blue-400/30
                            transition-colors duration-200 touch-manipulation mb-3 sm:mb-4"
                    >
                        🧙 Single Player (Training)
                    </button>

                    {/* Create Room */}
                    <button
                        onClick={() => onCreateRoom(playerName, 'pvp')}
                        className="w-full min-h-[48px] py-3.5 sm:py-5 bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 active:from-amber-600 active:to-amber-700 text-white font-bold rounded-xl text-lg sm:text-xl shadow-lg shadow-amber-400/30
                            transition-colors duration-200 touch-manipulation"
                    >
                        🏰 Create Kingdom (PvP)
                    </button>

                    {/* Join Room */}
                    <form onSubmit={handleJoinSubmit} className="flex gap-2 w-full">
                        <input
                            type="text"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            placeholder="CODE"
                            maxLength={6}
                            className="min-w-0 flex-1 bg-white/60 border border-amber-300/40 rounded-xl px-3 py-3 sm:py-4 text-center text-base sm:text-lg font-mono font-bold text-amber-800 placeholder:text-amber-400/60 uppercase tracking-[0.15em] outline-none focus:border-amber-500/60 touch-manipulation"
                        />
                        <button
                            type="submit"
                            disabled={joinCode.trim().length < 4}
                            className="shrink-0 min-h-[48px] px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-b from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 active:from-green-600 active:to-green-700 text-white font-bold rounded-xl text-base sm:text-lg
                                transition-colors duration-200 touch-manipulation shadow-lg shadow-green-400/30
                                disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            Join
                        </button>
                    </form>

                    <div className="flex items-center gap-3 my-0.5 sm:my-1">
                        <div className="flex-1 h-px bg-amber-300/40" />
                        <span className="text-xs text-amber-400">or</span>
                        <div className="flex-1 h-px bg-amber-300/40" />
                    </div>

                    {/* Quick Match */}
                    <button
                        onClick={() => onJoinQueue(playerName)}
                        className="w-full min-h-[48px] py-3.5 sm:py-5 bg-white/60 hover:bg-amber-100/60 active:bg-amber-200/60 text-amber-600 font-bold rounded-xl text-base sm:text-lg border border-amber-300/30
                            transition-colors duration-200 touch-manipulation"
                    >
                        ⚔️ Quick Battle
                    </button>

                    {/* Player Profile & History */}
                    {playerProfile && playerProfile.matchesPlayed > 0 && (
                        <div className="mt-2 p-4 rounded-xl bg-white/60 border border-amber-300/30">
                            <div className="flex items-center gap-2 mb-3">
                                <Trophy size={16} className="text-amber-500" />
                                <span className="text-sm font-bold text-amber-800">Your Stats</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center mb-3">
                                <div>
                                    <p className="text-lg font-bold text-amber-500">{playerProfile.totalScore}</p>
                                    <p className="text-[10px] text-amber-400">Total Score</p>
                                </div>
                                <div>
                                    <p className="text-lg font-bold text-amber-800">{playerProfile.matchesPlayed}</p>
                                    <p className="text-[10px] text-amber-400">Matches</p>
                                </div>
                                <div>
                                    <p className="text-lg font-bold text-green-600">{playerProfile.matchesWon}</p>
                                    <p className="text-[10px] text-amber-400">Wins</p>
                                </div>
                            </div>
                            {playerProfile.history.length > 0 && (
                                <div>
                                    <p className="text-xs text-amber-500 mb-1.5">Recent Matches</p>
                                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                                        {playerProfile.history.slice(0, 5).map((entry, i) => (
                                            <div key={`${entry.matchId}-${i}`} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-amber-100/50">
                                                <span className={entry.won ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                                                    {entry.won ? 'W' : 'L'}
                                                </span>
                                                <span className="text-amber-600 truncate mx-2">vs {entry.opponentName}</span>
                                                <span className="text-amber-500 font-mono">{entry.score.totalScore}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
