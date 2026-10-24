import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { ChatMessage, Side } from '../types';
import { Send, X, MessageCircle } from 'lucide-react';
import { track } from '../analytics/tracker';

interface ChatPanelProps {
    messages: ChatMessage[];
    onSend: (text: string) => void;
    mySide: Side;
    mobile?: boolean;
    onClose?: () => void;
}

function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export const ChatPanel = ({ messages, onSend, mySide, mobile, onClose }: ChatPanelProps) => {
    const [text, setText] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!mobile || !onClose) return;
        const previousFocus = document.activeElement as HTMLElement | null;
        const panel = panelRef.current;
        inputRef.current?.focus({ preventScroll: true });
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); onClose(); }
            if (event.key !== 'Tab' || !panel) return;
            const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        panel?.addEventListener('keydown', handleKey);
        return () => {
            panel?.removeEventListener('keydown', handleKey);
            if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        };
    }, [mobile, onClose]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;
        track('chat_message_sent', { message_length: trimmed.length });
        onSend(trimmed);
        setText('');
    };

    return (
        <div ref={panelRef} className={`battle-chat-panel flex flex-col border border-[var(--border-subtle)] backdrop-blur-md ${mobile
                ? 'w-full rounded-t-xl h-[50vh]'
                : 'w-[250px] rounded-xl h-[600px]'
            }`} style={{ background: 'var(--chat-bg, rgba(10, 10, 18, 0.88))' }}>
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] flex justify-between items-center">
                <span className="text-xs text-[var(--gold)] font-bold flex items-center gap-1.5 font-display tracking-wider">
                    <MessageCircle size={13} />
                    CHAT
                </span>
                {mobile && onClose && (
                    <button onClick={onClose} aria-label="Close chat" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors duration-150 touch-manipulation rounded-lg hover:bg-[var(--bg-elevated)]">
                        <X size={15} />
                    </button>
                )}
            </div>

            {/* Message list */}
            <div
                ref={scrollRef}
                role="log"
                aria-label="Battle messages"
                aria-live="polite"
                className="flex-1 overflow-y-auto px-2.5 py-2 space-y-2 text-sm"
            >
                {messages.length === 0 && (
                    <p className="text-[var(--text-muted)] text-xs italic text-center mt-4 px-2">No messages yet — say hello!</p>
                )}
                {messages.map(msg => {
                    const isMine = msg.side === mySide;
                    return (
                        <div
                            key={msg.id}
                            className={`flex flex-col animate-slide-up ${isMine ? 'items-end' : 'items-start'}`}
                        >
                            {/* Sender name + time */}
                            <div className={`flex items-center gap-1.5 mb-0.5 px-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                <span className={`text-[10px] font-bold ${isMine ? 'text-[var(--emerald)]' : 'text-[var(--crimson)]'}`}>
                                    {msg.sender}
                                </span>
                                <span className="text-[10px] text-[var(--text-muted)]">{formatTime(msg.timestamp)}</span>
                            </div>
                            {/* Bubble */}
                            <div className={`max-w-[90%] px-2.5 py-1.5 text-xs break-words ${isMine ? 'chat-bubble-mine text-[var(--text-primary)]' : 'chat-bubble-theirs text-[var(--text-primary)]'}`}>
                                {msg.text}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="border-t border-[var(--border-subtle)] flex items-center gap-1 px-2 py-1.5">
                <input
                    ref={inputRef}
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Send a message..."
                    aria-label="Chat message"
                    maxLength={200}
                    className="flex-1 bg-transparent px-2 py-2 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none min-w-0 min-h-[44px]"
                />
                <button
                    type="submit"
                    disabled={!text.trim()}
                    aria-label="Send chat message"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--gold)] hover:bg-[var(--bg-elevated)] transition-all duration-150 touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <Send size={13} />
                </button>
            </form>
        </div>
    );
};
