import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { ChatMessage, Side } from '../types';

interface ChatPanelProps {
    messages: ChatMessage[];
    onSend: (text: string) => void;
    mySide: Side;
    mobile?: boolean;
    onClose?: () => void;
}

export const ChatPanel = ({ messages, onSend, mySide, mobile, onClose }: ChatPanelProps) => {
    const [text, setText] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;
        onSend(trimmed);
        setText('');
    };

    return (
        <div className={`flex flex-col bg-white/70 border border-amber-300/40 backdrop-blur-sm ${
            mobile
                ? 'w-full rounded-t-xl h-[50vh]'
                : 'w-[250px] rounded-xl h-[600px]'
        }`}>
            <div className="px-3 py-2 border-b border-amber-300/40 text-xs text-amber-600 font-bold flex justify-between items-center">
                <span>📜 HERALD</span>
                {mobile && onClose && (
                    <button onClick={onClose} className="min-w-[36px] min-h-[36px] flex items-center justify-center text-amber-500 hover:text-amber-700 active:text-amber-800 text-base transition-colors duration-150 touch-manipulation">✕</button>
                )}
            </div>
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 text-sm"
            >
                {messages.map(msg => (
                    <div key={msg.id}>
                        <span className={`font-bold text-xs ${msg.side === mySide ? 'text-green-600' : 'text-red-500'}`}>
                            {msg.sender}
                        </span>
                        <span className="text-amber-800 ml-1.5 text-xs break-words">{msg.text}</span>
                    </div>
                ))}
                {messages.length === 0 && (
                    <p className="text-amber-400 text-xs italic">The herald awaits your message...</p>
                )}
            </div>
            <form onSubmit={handleSubmit} className="border-t border-amber-300/40 flex">
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Send a message..."
                    maxLength={200}
                    className="flex-1 bg-transparent px-3 py-3 text-xs text-amber-800 placeholder:text-amber-400/60 outline-none"
                />
                <button
                    type="submit"
                    disabled={!text.trim()}
                    className="min-w-[44px] min-h-[44px] px-3 py-2 text-xs text-amber-500 font-bold hover:text-amber-700 active:text-amber-800 transition-colors duration-150 touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    Send
                </button>
            </form>
        </div>
    );
};
