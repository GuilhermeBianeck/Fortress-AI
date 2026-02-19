import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { ChatMessage, Side } from '../types';
import { Send, X, ScrollText } from 'lucide-react';

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
        <div className={`flex flex-col border border-[var(--border-subtle)] backdrop-blur-md ${mobile
                ? 'w-full rounded-t-xl h-[50vh]'
                : 'w-[250px] rounded-xl h-[600px]'
            }`} style={{ background: 'rgba(10, 10, 18, 0.85)' }}>
            <div className="px-3 py-2 border-b border-[var(--border-subtle)] text-xs text-[var(--gold)] font-bold flex justify-between items-center font-display">
                <span className="flex items-center gap-1.5">
                    <ScrollText size={14} />
                    HERALD
                </span>
                {mobile && onClose && (
                    <button onClick={onClose} className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] text-base transition-colors duration-150 touch-manipulation">
                        <X size={16} />
                    </button>
                )}
            </div>
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 text-sm"
            >
                {messages.map(msg => (
                    <div key={msg.id}>
                        <span className={`font-bold text-xs ${msg.side === mySide ? 'text-[var(--emerald)]' : 'text-[var(--crimson)]'}`}>
                            {msg.sender}
                        </span>
                        <span className="text-[var(--text-primary)] ml-1.5 text-xs break-words">{msg.text}</span>
                    </div>
                ))}
                {messages.length === 0 && (
                    <p className="text-[var(--text-muted)] text-xs italic">The herald awaits your message...</p>
                )}
            </div>
            <form onSubmit={handleSubmit} className="border-t border-[var(--border-subtle)] flex">
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Send a message..."
                    maxLength={200}
                    className="flex-1 bg-transparent px-3 py-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                />
                <button
                    type="submit"
                    disabled={!text.trim()}
                    className="min-w-[44px] min-h-[44px] px-3 py-2 text-xs text-[var(--gold)] font-bold hover:text-[var(--gold)] transition-colors duration-150 touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                >
                    <Send size={14} />
                </button>
            </form>
        </div>
    );
};
