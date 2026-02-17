import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { ChatMessage, Side } from '../types';

interface ChatPanelProps {
    messages: ChatMessage[];
    onSend: (text: string) => void;
    mySide: Side;
}

export const ChatPanel = ({ messages, onSend, mySide }: ChatPanelProps) => {
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
        <div className="w-[250px] bg-black/60 border border-white/10 rounded-xl backdrop-blur-sm flex flex-col h-[600px]">
            <div className="px-3 py-2 border-b border-white/10 text-xs text-neutral-400 font-bold">
                CHAT
            </div>
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 text-sm"
            >
                {messages.map(msg => (
                    <div key={msg.id}>
                        <span className={`font-bold text-xs ${msg.side === mySide ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {msg.sender}
                        </span>
                        <span className="text-neutral-300 ml-1.5 text-xs break-words">{msg.text}</span>
                    </div>
                ))}
                {messages.length === 0 && (
                    <p className="text-neutral-600 text-xs italic">No messages yet</p>
                )}
            </div>
            <form onSubmit={handleSubmit} className="border-t border-white/10 flex">
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message..."
                    maxLength={200}
                    className="flex-1 bg-transparent px-3 py-2 text-xs text-white placeholder:text-neutral-600 outline-none"
                />
                <button
                    type="submit"
                    disabled={!text.trim()}
                    className="px-3 py-2 text-xs text-rose-400 font-bold hover:text-rose-300 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    Send
                </button>
            </form>
        </div>
    );
};
