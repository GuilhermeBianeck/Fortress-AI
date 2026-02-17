import { useState } from 'react';
import type { FormEvent } from 'react';
import type { RoomState } from '../types';
import { Bot, Swords, Zap, Check } from 'lucide-react';

interface LobbyProps {
    roomState: RoomState | null;
    queuePosition: number | null;
    playerName: string;
    onPlayerNameChange: (name: string) => void;
    onCreateRoom: (name?: string) => void;
    onJoinRoom: (code: string, name?: string) => void;
    onJoinQueue: (name?: string) => void;
    onLeaveQueue: () => void;
    onReady: () => void;
}

export const Lobby = ({
    roomState, queuePosition,
    playerName, onPlayerNameChange,
    onCreateRoom, onJoinRoom, onJoinQueue, onLeaveQueue, onReady,
}: LobbyProps) => {
    const [joinCode, setJoinCode] = useState('');
    const [isReady, setIsReady] = useState(false);

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
        return (
            <div className="flex-1 w-full flex items-center justify-center bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 p-6">
                <div className="w-full text-center">
                    <h2 className="text-2xl font-bold text-white mb-3">Room Code</h2>
                    <div className="text-5xl font-mono font-bold text-rose-400 tracking-[0.3em] mb-6 select-all">
                        {roomState.roomId}
                    </div>
                    <p className="text-base text-neutral-400 mb-4">
                        Share this code with your opponent
                    </p>

                    <div className="p-4 rounded-xl bg-black/40 border border-white/5 inline-block">
                        <div className="flex items-center justify-center gap-2 text-base">
                            <span className={`w-2.5 h-2.5 rounded-full ${roomState.opponentConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                            <span className={roomState.opponentConnected ? 'text-emerald-400' : 'text-amber-400'}>
                                {roomState.opponentConnected ? 'Opponent connected' : 'Waiting for opponent...'}
                            </span>
                        </div>
                        <p className="text-sm text-neutral-500 mt-2">
                            You are: <span className="text-white font-medium">{roomState.side.toUpperCase()}</span> player
                        </p>
                    </div>

                    {roomState.opponentConnected && (
                        <div>
                            <button
                                onClick={handleReady}
                                disabled={isReady}
                                className={`mt-8 w-full py-4 font-bold rounded-xl text-xl touch-manipulation
                                    transition-colors duration-200
                                    ${isReady
                                        ? 'bg-emerald-700 text-emerald-200 ring-2 ring-emerald-400/50 cursor-default'
                                        : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white cursor-pointer'
                                    }`}
                            >
                                {isReady ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Check size={22} /> READY
                                    </span>
                                ) : 'READY'}
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
            <div className="flex-1 w-full flex items-center justify-center bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 p-6">
                <div className="w-full text-center">
                    <div className="w-10 h-10 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                    <h2 className="text-2xl font-bold text-white mb-3">Finding Match...</h2>
                    <p className="text-base text-neutral-400">Queue position: {queuePosition + 1}</p>
                    <button
                        onClick={onLeaveQueue}
                        className="mt-8 px-8 py-3 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-neutral-300 rounded-xl
                            transition-colors duration-200 touch-manipulation text-base"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    // Main lobby — fills full width, two columns on wide screens
    return (
        <div className="flex-1 w-full flex flex-col lg:flex-row items-stretch bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 overflow-hidden">
            {/* Left side — Branding */}
            <div className="flex flex-col items-center justify-center lg:flex-1 p-8 lg:p-12">
                <div className="flex items-center gap-4 mb-6">
                    <div className="bg-rose-600 p-3 rounded-2xl shadow-lg shadow-rose-600/20">
                        <Bot size={40} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">FORTRESS AI</h1>
                        <p className="text-base text-neutral-400 mt-1">2-Player AI Battle</p>
                    </div>
                </div>
                <div className="hidden lg:flex flex-col gap-4 text-neutral-500 text-sm">
                    <div className="flex items-center gap-3">
                        <Swords size={18} className="text-rose-400 shrink-0" />
                        <span>Build AI-powered fortresses and destroy your opponent</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Zap size={18} className="text-amber-400 shrink-0" />
                        <span>Turn-based combat with physics-based destruction</span>
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="hidden lg:block w-px self-stretch bg-white/10 my-10" />
            <div className="lg:hidden w-2/3 h-px bg-white/10 mx-auto" />

            {/* Right side — Actions: fills all available width */}
            <div className="flex flex-col items-center justify-center lg:flex-1 p-8 lg:p-12">
                <div className="flex flex-col gap-4 w-full">
                    {/* Player Name */}
                    <input
                        type="text"
                        value={playerName}
                        onChange={(e) => onPlayerNameChange(e.target.value)}
                        placeholder="Your name..."
                        maxLength={20}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-center text-lg font-medium text-white placeholder:text-neutral-600 outline-none focus:border-rose-500/50 transition-all touch-manipulation"
                    />

                    {/* Create Room */}
                    <button
                        onClick={() => onCreateRoom(playerName)}
                        className="w-full py-5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold rounded-xl text-xl shadow-lg shadow-rose-600/20
                            transition-colors duration-200 touch-manipulation"
                    >
                        Create Room
                    </button>

                    {/* Join Room */}
                    <form onSubmit={handleJoinSubmit} className="flex gap-2 w-full">
                        <input
                            type="text"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            placeholder="CODE"
                            maxLength={6}
                            className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-4 text-center text-lg font-mono font-bold text-white placeholder:text-neutral-600 uppercase tracking-[0.15em] outline-none focus:border-rose-500/50 touch-manipulation"
                        />
                        <button
                            type="submit"
                            disabled={joinCode.trim().length < 4}
                            className="shrink-0 px-8 py-4 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-bold rounded-xl text-lg
                                transition-colors duration-200 touch-manipulation
                                disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            Join
                        </button>
                    </form>

                    <div className="flex items-center gap-3 my-1">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-xs text-neutral-500">or</span>
                        <div className="flex-1 h-px bg-white/10" />
                    </div>

                    {/* Quick Match */}
                    <button
                        onClick={() => onJoinQueue(playerName)}
                        className="w-full py-5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-neutral-200 font-bold rounded-xl text-lg border border-white/5
                            transition-colors duration-200 touch-manipulation"
                    >
                        Quick Match
                    </button>
                </div>
            </div>
        </div>
    );
};
