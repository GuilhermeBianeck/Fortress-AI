import { useState } from 'react';
import type { FormEvent } from 'react';
import type { RoomState } from '../types';
import { Bot } from 'lucide-react';

interface LobbyProps {
    roomState: RoomState | null;
    queuePosition: number | null;
    onCreateRoom: () => void;
    onJoinRoom: (code: string) => void;
    onJoinQueue: () => void;
    onLeaveQueue: () => void;
    onReady: () => void;
}

export const Lobby = ({
    roomState, queuePosition,
    onCreateRoom, onJoinRoom, onJoinQueue, onLeaveQueue, onReady,
}: LobbyProps) => {
    const [joinCode, setJoinCode] = useState('');

    const handleJoinSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (joinCode.trim().length >= 4) {
            onJoinRoom(joinCode.trim());
        }
    };

    // Waiting room view — room created, waiting for opponent or ready
    if (roomState) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <div className="bg-black/60 border border-white/10 rounded-2xl p-8 backdrop-blur-sm max-w-md w-full text-center">
                    <h2 className="text-lg font-bold text-white mb-2">Room Code</h2>
                    <div className="text-4xl font-mono font-bold text-rose-400 tracking-[0.3em] mb-4 select-all">
                        {roomState.roomId}
                    </div>
                    <p className="text-sm text-neutral-400 mb-2">
                        Share this code with your opponent
                    </p>

                    <div className="mt-4 p-3 rounded-lg bg-neutral-900/50 border border-white/5">
                        <div className="flex items-center gap-2 text-sm">
                            <span className={`w-2 h-2 rounded-full ${roomState.opponentConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                            <span className={roomState.opponentConnected ? 'text-emerald-400' : 'text-amber-400'}>
                                {roomState.opponentConnected ? 'Opponent connected' : 'Waiting for opponent...'}
                            </span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-1">
                            You are: <span className="text-white font-medium">{roomState.side.toUpperCase()}</span> player
                        </p>
                    </div>

                    {roomState.opponentConnected && (
                        <button
                            onClick={onReady}
                            className="mt-6 w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors text-lg"
                        >
                            READY
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Queue view
    if (queuePosition !== null) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <div className="bg-black/60 border border-white/10 rounded-2xl p-8 backdrop-blur-sm max-w-md w-full text-center">
                    <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <h2 className="text-lg font-bold text-white mb-2">Finding Match...</h2>
                    <p className="text-sm text-neutral-400">Queue position: {queuePosition + 1}</p>
                    <button
                        onClick={onLeaveQueue}
                        className="mt-6 px-6 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors text-sm"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    // Main lobby — choose action
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="bg-rose-600 p-3 rounded-xl">
                    <Bot size={32} className="text-white" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">FORTRESS AI</h1>
                    <p className="text-sm text-neutral-400">2-Player AI Battle</p>
                </div>
            </div>

            <div className="flex flex-col gap-4 w-full max-w-sm">
                {/* Create Room */}
                <button
                    onClick={onCreateRoom}
                    className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition-colors text-lg shadow-lg shadow-rose-600/20"
                >
                    Create Room
                </button>

                {/* Join Room */}
                <form onSubmit={handleJoinSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="ROOM CODE"
                        maxLength={6}
                        className="flex-1 bg-neutral-900/80 border border-white/10 rounded-xl px-4 py-3 text-center text-lg font-mono font-bold text-white placeholder:text-neutral-600 uppercase tracking-[0.2em] outline-none focus:border-rose-500/50"
                    />
                    <button
                        type="submit"
                        disabled={joinCode.trim().length < 4}
                        className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                    onClick={onJoinQueue}
                    className="w-full py-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold rounded-xl transition-colors border border-white/5"
                >
                    Quick Match
                </button>
            </div>
        </div>
    );
};
