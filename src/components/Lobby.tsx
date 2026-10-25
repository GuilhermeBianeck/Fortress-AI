import { useState, useEffect, useRef, useMemo } from 'react';
import type { FormEvent } from 'react';
import type { RoomState, PlayerProfile, RewardKind, MatchHistoryEntry } from '../types';
import { Check, Target, Gift, Star, Calendar, Trophy, Copy, ChevronDown, ChevronUp, Bot, Users, Swords, KeyRound, Link2, UserRound, BookOpen, Share2, LoaderCircle, ArrowLeft, Plus, Hammer, Eye, Crosshair } from 'lucide-react';
import { RankBadge } from './RankBadge';
import { RoyalMenuStage } from './CartoonMenuScene';
import { kingReactions } from '../sprites/kingReactions';
import './Lobby.css';
import { readStorage, writeStorage } from '../hooks/browserStorage';
import { botDifficulty, type BotDifficulty } from '../../server/shared/difficulty';
import { MatchHistory } from './MatchHistory';
import { getGamificationStats, getDailyMissions, getUtcDayStartMs, getUnlockedAchievements, ACHIEVEMENTS, ACHIEVEMENT_RARITY_COLORS, getWeeklyChallenges, getCheckinReward, CHECKIN_REWARDS, GAMIFICATION_FIRST_WIN_BONUS_EMBERS, MS_PER_DAY } from '../types';
import { track } from '../analytics/tracker';
import { playClick, playSwitch, playBoom } from '../audio/SoundManager';

export interface LobbyProps {
    roomState: RoomState | null;
    queuePosition: number | null;
    playerName: string;
    onPlayerNameChange: (name: string) => void;
    onCreateRoom: (name?: string, mode?: 'pvp' | 'single', difficulty?: BotDifficulty) => void;
    onJoinRoom: (code: string, name?: string) => void;
    onJoinQueue: (name?: string) => void;
    onLeaveQueue: () => void;
    onReady: () => void;
    playerProfile?: PlayerProfile | null;
    onGetProfile?: () => void;
    onClaimReward: (kind: RewardKind) => void;
    rewardNotice: string | null;
    onGetHistory: (cursor?: string) => Promise<{ entries: MatchHistoryEntry[]; cursor: string | null }>;
    error: string | null;
}

const TIPS = [
    '💡 Use beams as roofs to deflect projectiles!',
    '🏰 Stone blocks resist more damage than wood',
    '⚡ Place blocks close together for stability',
    '🎯 Aim at the base of enemy walls for maximum destruction',
    '🛡️ Build walls in front of your King for protection',
    '🔥 Steel blocks are nearly indestructible',
    '🧊 Ice blocks are slippery — shots glance off at odd angles',
    '⚫ Rubber blocks absorb impacts and bounce projectiles back',
    '🤖 Let AI design your fortress, then refine it manually',
    '👑 Protect your King at all costs — losing it ends the round',
];

export const Lobby = ({
    roomState, queuePosition,
    playerName, onPlayerNameChange,
    onCreateRoom, onJoinRoom, onJoinQueue, onLeaveQueue, onReady,
    playerProfile, onGetProfile, onClaimReward, rewardNotice, onGetHistory, error,
}: LobbyProps) => {
    const [joinCode, setJoinCode] = useState('');
    const [isReady, setIsReady] = useState(roomState?.ready ?? false);
    const ready = isReady || roomState?.ready;
    const [hadOpponent, setHadOpponent] = useState(roomState?.opponentConnected ?? false);
    if (hadOpponent !== (roomState?.opponentConnected ?? false)) {
        setHadOpponent(roomState?.opponentConnected ?? false);
        if (!roomState?.opponentConnected) setIsReady(false);
    }
    const [tipIndex, setTipIndex] = useState(0);
    const missionToast = rewardNotice;
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [codeCopied, setCodeCopied] = useState(false);
    const [showHowToPlay, setShowHowToPlay] = useState(false);
    const [battleMode, setBattleMode] = useState<'solo' | 'pvp'>('solo');
    const [battlePending, setBattlePending] = useState(false);
    const [previousError, setPreviousError] = useState(error);
    if (previousError !== error) { setPreviousError(error); if (error) setBattlePending(false); }

    const [difficulty, setDifficulty] = useState<BotDifficulty>(() => botDifficulty(readStorage('fortress_solo_difficulty')));
    const day = playerProfile?.periodStats?.dayStart ?? getUtcDayStartMs(new Date());
    const checkinStreak = playerProfile?.rewards?.checkinStreak ?? 0;
    const checkinLastDay = playerProfile?.rewards?.checkinDay;
    const checkinToday = checkinLastDay === day;
    const pendingCheckinStreak = checkinToday ? checkinStreak : checkinLastDay === day - MS_PER_DAY ? checkinStreak + 1 : 1;
    const checkinRewardToday = getCheckinReward(pendingCheckinStreak);
    const gamification = playerProfile ? getGamificationStats(playerProfile) : null;
    const dailyMissions = playerProfile ? getDailyMissions(playerProfile) : null;
    const weeklyChallenges = playerProfile ? getWeeklyChallenges(playerProfile) : null;
    const claimedMissionRewards = dailyMissions?.missions.every(m => m.claimed) ?? false;
    const claimedWeekRewards = weeklyChallenges?.challenges.every(c => c.claimed) ?? false;
    const claimableEmbers = dailyMissions?.claimableEmbers ?? 0;
    const weeklyClaimableEmbers = weeklyChallenges?.claimableEmbers ?? 0;
    const claimButtonLabel = claimableEmbers > 0 ? 'Claim ' + claimableEmbers + ' Embers' : 'No new daily rewards';
    const weeklyClaimButtonLabel = weeklyClaimableEmbers > 0 ? 'Claim ' + weeklyClaimableEmbers + ' Embers' : 'No new weekly rewards';

    // Memoize achievement unlocked set to avoid re-creating on every render
    const unlockedIds = useMemo(
        () => new Set(playerProfile ? getUnlockedAchievements(playerProfile).map(a => a.id) : []),
        [playerProfile]
    );

    useEffect(() => {
        onGetProfile?.();
    }, [onGetProfile]);

    useEffect(() => {
        const t = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 4000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        const t = setInterval(() => onGetProfile?.(), 60000);
        return () => clearInterval(t);
    }, [onGetProfile]);

    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (!battlePending) return;
        const timeout = window.setTimeout(() => setBattlePending(false), 8000);
        return () => window.clearTimeout(timeout);
    }, [battlePending]);

    const handleBattle = () => {
        if (battlePending) return;
        setBattlePending(true);
        playBoom();
        if (battleMode === 'solo') {
            track('room_created', { mode: 'single' });
            onCreateRoom(playerName, 'single', difficulty);
        } else {
            track('queue_joined');
            onJoinQueue(playerName);
        }
    };

    const handleJoinSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (joinCode.trim().length >= 4) {
            playClick();
            track('room_joined', { room_code: joinCode.trim() });
            onJoinRoom(joinCode.trim(), playerName);
        }
    };

    const handleReady = () => {
        if (ready) return;
        setIsReady(true);
        onReady();
    };

    const handleClaimMissionRewards = () => onClaimReward('daily');
    const handleCheckin = () => onClaimReward('checkin');
    const handleClaimWeeklyChallenges = () => onClaimReward('weekly');

    const getMissionStatus = (mission: { completed: boolean; current: number; target: number; claimed?: boolean }) => {
        if (mission.claimed) return { label: 'CLAIMED', className: 'text-[var(--gold)]' };
        if (mission.completed) return { label: 'COMPLETED', className: 'text-[var(--emerald)]' };
        return { label: `${mission.current}/${mission.target}`, className: 'text-[var(--text-muted)]' };
    };

    const handleCopyCode = (code: string) => {
        const shareUrl = `${window.location.origin}?room=${code}`;
        const resetCopy = () => {
            setCodeCopied(true);
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = setTimeout(() => setCodeCopied(false), 2000);
        };
        navigator.clipboard.writeText(shareUrl).then(resetCopy).catch(resetCopy);
    };

    const handleShare = (code: string) => {
        const shareUrl = `${window.location.origin}?room=${code}`;
        if (navigator.share) {
            navigator.share({ title: 'Fortress Battle', text: 'Join my fortress battle!', url: shareUrl }).catch(() => {});
        } else {
            handleCopyCode(code);
        }
    };

    if (roomState) {
        const isSinglePlayer = roomState.opponentName === 'Training Bot';
        const contenderSides = [roomState.side, roomState.side === 'left' ? 'right' : 'left'] as const;
        const contenders = contenderSides.map(side => {
            const isLocalPlayer = side === roomState.side;
            return {
                side,
                connected: isLocalPlayer || roomState.opponentConnected,
                name: isLocalPlayer ? (playerName || 'Knight') : roomState.opponentConnected ? (roomState.opponentName || 'Challenger') : 'Awaiting...',
            };
        });

        return (
            <div className="cartoon-lobby">
                <RoyalMenuStage variant="room">
                    <section className={`menu-controls menu-ready-room${isSinglePlayer ? ' menu-ready-room--solo' : ''}`} data-side={roomState.side} data-king-character={kingReactions.identity(roomState.side)} aria-labelledby="ready-room-title">
                        <h2 id="ready-room-title">{isSinglePlayer ? 'Training Grounds' : 'War Room'}</h2>
                        {roomState.mode === 'single' && <p className="menu-difficulty-note">{roomState.difficulty ?? 'normal'} difficulty</p>}
                        {!isSinglePlayer && (
                            <div className="menu-invite">
                                <span className="menu-field-label">Room code</span>
                                <div className="menu-invite-code">
                                    <strong>{roomState.roomId}</strong>
                                    <button type="button" className="menu-icon-button" onClick={() => handleCopyCode(roomState.roomId)} title="Copy invite link" aria-label="Copy invite link">
                                        {codeCopied ? <Check size={20} /> : <Copy size={20} />}
                                    </button>
                                    <button type="button" className="menu-icon-button" onClick={() => handleShare(roomState.roomId)} title="Share invite link" aria-label="Share invite link">
                                        <Share2 size={20} />
                                    </button>
                                </div>
                                <p role="status">{codeCopied ? 'Link copied!' : 'Send the link to your opponent'}</p>
                            </div>
                        )}
                        <div className="menu-versus">
                            {contenders.map((contender, index) => (
                                <div key={contender.side} className="menu-contender" data-side={contender.side} data-king-character={kingReactions.identity(contender.side)}>
                                    {index === 1 && <span className="menu-vs" aria-label="versus">VS</span>}
                                    {contender.connected
                                        ? <img src={kingReactions.url('idle', contender.side)} alt="" data-side={contender.side} data-king-identity={kingReactions.identity(contender.side)} className="menu-portrait" draggable={false} />
                                        : <div className="menu-portrait menu-portrait--waiting"><LoaderCircle className="menu-spinner" size={28} aria-label="Waiting for opponent" /></div>}
                                    <strong title={contender.name}>{contender.name}</strong>
                                    <span className="menu-side-label">{contender.side.toUpperCase()}</span>
                                </div>
                            ))}
                        </div>
                        {roomState.opponentConnected && (
                            <button type="button" onClick={handleReady} disabled={Boolean(ready) || !roomState.opponentConnected} autoFocus data-side={roomState.side} data-king-character={kingReactions.identity(roomState.side)} className="menu-battle-button menu-ready-button">
                                {ready ? <Check size={22} aria-hidden="true" /> : <Swords size={22} aria-hidden="true" />}
                                READY FOR BATTLE
                            </button>
                        )}
                        <p className="menu-battle-tip"><Target size={16} aria-hidden="true" /><span>{TIPS[tipIndex]}</span></p>
                    </section>
                </RoyalMenuStage>
            </div>
        );
    }

    if (queuePosition !== null) {
        return (
            <div className="cartoon-lobby">
                <RoyalMenuStage variant="queue">
                    <section className="menu-controls menu-queue" aria-labelledby="queue-title">
                        <Users size={28} aria-hidden="true" />
                        <h2 id="queue-title">Seeking Challenger...</h2>
                        <div className="menu-queue-status" role="status">
                            <LoaderCircle className="menu-spinner" size={22} aria-hidden="true" />
                            <span>Queue position: {queuePosition + 1}</span>
                        </div>
                        <button type="button" onClick={() => { track('queue_left'); setBattlePending(false); onLeaveQueue(); }} className="menu-secondary-button">
                            <ArrowLeft size={18} aria-hidden="true" /> Retreat
                        </button>
                    </section>
                </RoyalMenuStage>
            </div>
        );
    }

    return (
        <div className="cartoon-lobby">
            <RoyalMenuStage>
                <div className="menu-controls">
                    <div className="menu-field">
                        <label htmlFor="player-name-input">Player name</label>
                        <div className="menu-input-wrap">
                            <UserRound aria-hidden="true" />
                            <input id="player-name-input" type="text" value={playerName}
                                onChange={(e) => onPlayerNameChange(e.target.value)}
                                placeholder="Enter your name" maxLength={20} autoComplete="nickname" />
                        </div>
                    </div>
                    <div className={`menu-mode-line${battleMode === 'solo' ? ' menu-mode-line--solo' : ''}`}>
                    <div className="menu-mode-switch" role="radiogroup" aria-label="Game mode"
                        onKeyDown={(event) => {
                            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
                            event.preventDefault();
                            const mode = event.key === 'Home' ? 'solo' : event.key === 'End' ? 'pvp' : battleMode === 'solo' ? 'pvp' : 'solo';
                            setBattleMode(mode);
                            playSwitch();
                            event.currentTarget.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)?.focus();
                        }}>
                        <button type="button" role="radio" data-mode="solo" aria-checked={battleMode === 'solo'} tabIndex={battleMode === 'solo' ? 0 : -1}
                            onClick={() => { setBattleMode('solo'); playSwitch(); }}>
                            <Bot size={18} aria-hidden="true" /> Solo
                        </button>
                        <button type="button" role="radio" data-mode="pvp" aria-checked={battleMode === 'pvp'} tabIndex={battleMode === 'pvp' ? 0 : -1}
                            onClick={() => { setBattleMode('pvp'); playSwitch(); }}>
                            <Users size={18} aria-hidden="true" /> PvP
                        </button>
                    </div>
                    {battleMode === 'solo' && <label className="menu-difficulty">Difficulty
                        <select aria-label="Solo difficulty" value={difficulty} onChange={event => {
                            const value = botDifficulty(event.target.value); setDifficulty(value); writeStorage('fortress_solo_difficulty', value); playSwitch();
                        }}><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select>
                        <ChevronDown size={18} aria-hidden="true" />
                    </label>}
                    </div>
                    <button type="button" disabled={battlePending} onClick={handleBattle} className="menu-battle-button" aria-busy={battlePending}>
                        {battlePending ? <LoaderCircle className="menu-spinner" size={20} aria-hidden="true" /> : <Swords size={20} aria-hidden="true" />}
                        <span>BATTLE</span>
                        <span className="menu-battle-detail">{battleMode === 'solo' ? 'vs Bot' : 'Find Opponent'}</span>
                    </button>
                    <form onSubmit={handleJoinSubmit} className="menu-field">
                        <div className="menu-join-label">
                            <label htmlFor="room-code-input">Room code</label>
                            {battleMode === 'pvp' && (
                                <button type="button" className="menu-create-room" disabled={battlePending}
                                    onClick={() => {
                                        if (battlePending) return;
                                        setBattlePending(true);
                                        playClick();
                                        track('room_created', { mode: 'pvp' });
                                        onCreateRoom(playerName, 'pvp');
                                    }}>
                                    <Plus size={14} aria-hidden="true" /> Create room
                                </button>
                            )}
                        </div>
                        <div className="menu-join-row">
                            <div className="menu-input-wrap">
                                <KeyRound aria-hidden="true" />
                                <input id="room-code-input" type="text" value={joinCode}
                                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                                    placeholder="ROOM CODE" maxLength={6} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
                            </div>
                            <button type="submit" disabled={joinCode.trim().length < 4} className="menu-secondary-button">
                                <Link2 size={22} aria-hidden="true" /> Join
                            </button>
                        </div>
                    </form>
                    <div className="menu-howto">
                        <button type="button" onClick={() => setShowHowToPlay(!showHowToPlay)}
                            aria-expanded={showHowToPlay} aria-controls="how-to-play-content" className="menu-howto-toggle">
                            <BookOpen size={18} aria-hidden="true" />
                            <span>How to Play</span>
                            {showHowToPlay ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                        </button>
                    </div>
                </div>
            </RoyalMenuStage>
            {showHowToPlay && (
                <section id="how-to-play-content" className="menu-howto-content" aria-label="How to Play">
                    <div className="flex gap-3 items-start">
                        <Hammer size={18} aria-hidden="true" />
                        <div>
                            <p className="font-bold text-[var(--emerald)] mb-0.5">1. Build Phase (90s)</p>
                            <p>Design your fortress! Place blocks manually by clicking on your side, or describe your fortress to the AI architect using the prompt bar. Protect your King at all costs.</p>
                        </div>
                    </div>
                    <div className="flex gap-3 items-start">
                        <Eye size={18} aria-hidden="true" />
                        <div>
                            <p className="font-bold text-[var(--gold)] mb-0.5">2. Reveal Phase (5s)</p>
                            <p>The camera pans across the battlefield, revealing both fortresses and any environmental hazards.</p>
                        </div>
                    </div>
                    <div className="flex gap-3 items-start">
                        <Crosshair size={18} aria-hidden="true" />
                        <div>
                            <p className="font-bold text-[var(--crimson)] mb-0.5">3. Combat Phase (25s/turn)</p>
                            <p>Take turns firing cannonballs! Drag to aim and release to fire. Destroy the enemy King to win the round. First to win 2 rounds wins the match.</p>
                        </div>
                    </div>
                    <div className="border-t border-[var(--border-subtle)] pt-2 mt-1">
                        <p className="font-bold text-[var(--text-primary)] mb-1.5">Materials</p>
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                            <span><span aria-hidden="true">🪵</span> <b>Wood</b> — 30 HP, high grip</span>
                            <span><span aria-hidden="true">🪨</span> <b>Stone</b> — 80 HP, heavy</span>
                            <span><span aria-hidden="true">🧊</span> <b>Ice</b> — 15 HP, slippery</span>
                            <span><span aria-hidden="true">⚫</span> <b>Rubber</b> — 40 HP, bouncy</span>
                            <span><span aria-hidden="true">⚙️</span> <b>Steel</b> — 200 HP, very dense</span>
                        </div>
                    </div>
                    <div className="border-t border-[var(--border-subtle)] pt-2">
                        <p className="font-bold text-[var(--text-primary)] mb-1.5">Controls</p>
                        <div className="grid grid-cols-1 gap-1 text-[10px]">
                            <span><span aria-hidden="true">🖱️</span> <b>Click</b> to place blocks during build phase</span>
                            <span><span aria-hidden="true">🎯</span> <b>Drag</b> on the cannon to aim, release to fire</span>
                            <span><span aria-hidden="true">⌨️</span> <b>A/D</b> to pan camera · <b>↑↓</b> to adjust power · <b>Space</b> to fire</span>
                            <span><span aria-hidden="true">🤖</span> <b>Set an API key</b> and type a prompt to let AI build your fortress</span>
                        </div>
                    </div>
                </section>
            )}
            {playerProfile && (
                <details className="menu-progression">
                    <summary className="menu-campaign-heading">
                        <h2 id="campaign-title"><Trophy size={20} aria-hidden="true" /> Your campaign</h2>
                        <span><Gift size={16} aria-hidden="true" /> Rewards <ChevronDown size={16} aria-hidden="true" /></span>
                    </summary>
                    {/* Player Profile & History */}
                    {playerProfile && (
                        <div className="menu-progression-grid">
                            <div className="menu-rank-summary"><RankBadge profile={playerProfile} showProgress />
                                <p className="menu-ember-balance">{playerProfile.rewards?.embers ?? 0} Embers</p>
                                <MatchHistory profile={playerProfile} load={onGetHistory} />
                            </div>

                            {/* Daily Check-in */}
                            <div className="menu-progress-section">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                                        <Calendar size={12} />
                                        Daily Check-in
                                    </p>
                                    {checkinToday && (
                                        <span className="text-[10px] text-[var(--emerald)] font-bold">✓ Claimed</span>
                                    )}
                                </div>
                                {/* Streak day bubbles */}
                                <div className="flex justify-between gap-1 mb-2">
                                    {CHECKIN_REWARDS.map((reward, idx) => {
                                        const dayNum = idx + 1;
                                        const totalDays = CHECKIN_REWARDS.length;
                                        // A day slot is "past" when the confirmed streak has passed it
                                        const isPast = checkinStreak >= dayNum;
                                        // A day slot is "today" when it matches the pending streak position
                                        const isTodaySlot = !isPast && (
                                            pendingCheckinStreak % totalDays === dayNum % totalDays ||
                                            (pendingCheckinStreak === totalDays && idx === totalDays - 1)
                                        );
                                        const isWeekly = idx === totalDays - 1;
                                        return (
                                            <div key={idx} className="flex-1 flex flex-col items-center gap-0.5">
                                                <div className={`w-full aspect-square rounded-lg flex items-center justify-center text-[9px] font-bold transition-all ${
                                                    isPast ? 'opacity-50' : isTodaySlot ? 'ring-1 ring-[var(--gold)]' : ''
                                                }`} style={{
                                                    background: isPast
                                                        ? 'rgba(46,204,113,0.25)'
                                                        : isWeekly
                                                            ? 'rgba(245,158,11,0.18)'
                                                            : 'rgba(255,255,255,0.06)',
                                                    border: isPast ? '1px solid rgba(46,204,113,0.4)' : isTodaySlot ? '1px solid rgba(255,215,0,0.6)' : '1px solid rgba(255,255,255,0.08)',
                                                }}>
                                                    {isPast ? '✓' : isWeekly ? '🌟' : `${reward}`}
                                                </div>
                                                <span className="text-[8px] text-[var(--text-muted)]">D{dayNum}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <button
                                    onClick={handleCheckin}
                                    disabled={checkinToday}
                                    className="btn-primary w-full min-h-[38px] rounded-lg text-xs touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                                >
                                    {checkinToday
                                        ? `Come back tomorrow (+${getCheckinReward(pendingCheckinStreak + 1)} Embers)`
                                        : `Check in — Claim ${checkinRewardToday} Embers${checkinStreak > 0 ? ` · Day ${pendingCheckinStreak}` : ''}`}
                                </button>
                            </div>

                            {gamification && (
                                <div className="menu-progress-section">
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Campaign Board</p>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-lg p-2" style={{ background: 'rgba(255,215,0,0.06)' }}>
                                            <p className="text-[var(--gold)] font-bold">Level {gamification.level}</p>
                                            <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                                <div className="h-full rounded-full" style={{ width: `${Math.round(gamification.levelProgress * 100)}%`, background: 'linear-gradient(90deg, var(--gold-dim), var(--gold))' }} />
                                            </div>
                                        </div>
                                        <div className="rounded-lg p-2" style={{ background: 'rgba(231,76,60,0.08)' }}>
                                            <p className="text-[var(--ember)] font-bold">Streak x{gamification.currentStreak}</p>
                                            <p className="text-[10px] text-[var(--text-muted)] mt-1">Best x{gamification.bestStreak}</p>
                                        </div>
                                        <div className="rounded-lg p-2" style={{ background: 'rgba(46,204,113,0.08)' }}>
                                            <p className="text-[var(--emerald)] font-bold">Daily Battles</p>
                                            <p className="text-[10px] text-[var(--text-muted)] mt-1">{gamification.dailyMatches}/{gamification.dailyMatchTarget} matches</p>
                                        </div>
                                        <div className="rounded-lg p-2" style={{ background: 'rgba(52,152,219,0.08)' }}>
                                            <p className="text-[var(--royal-blue)] font-bold">Daily Victories</p>
                                            <p className="text-[10px] text-[var(--text-muted)] mt-1">{gamification.dailyWins}/{gamification.dailyWinTarget} wins</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {dailyMissions && (
                                <div className="menu-progress-section">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                                            <Target size={12} />
                                            Daily Missions
                                        </p>
                                        <span className="text-[10px] text-[var(--gold)] font-bold flex items-center gap-1">
                                            <Gift size={11} />
                                            {claimableEmbers} Embers
                                        </span>
                                    </div>
                                    {dailyMissions.firstWinOfDay && (
                                        <div className="mb-2 rounded-lg px-2 py-1.5 flex items-center gap-1.5 text-[10px] font-bold"
                                            style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', color: 'var(--gold)' }}>
                                            <span>⭐</span>
                                            <span>First win of the day! +{GAMIFICATION_FIRST_WIN_BONUS_EMBERS} Embers</span>
                                        </div>
                                    )}
                                    <div className="flex flex-col gap-2">
                                        {dailyMissions.missions.map((mission) => {
                                            const missionStatus = getMissionStatus(mission);
                                            return (
                                            <div key={mission.id} className="rounded-lg px-2 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <p className="text-xs text-[var(--text-secondary)]">{mission.title}</p>
                                                    <span className={`text-[10px] font-bold ${missionStatus.className}`}>
                                                        {missionStatus.label}
                                                    </span>
                                                </div>
                                                <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                                    <div
                                                        className="h-full rounded-full transition-all duration-500"
                                                        style={{ width: `${Math.round(mission.progress * 100)}%`, background: mission.completed ? 'linear-gradient(90deg, var(--emerald), #9be7b3)' : 'linear-gradient(90deg, var(--royal-blue), #75b8ff)' }}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-[var(--gold)] font-mono">Reward: {mission.reward} Embers</p>
                                            </div>
                                        )})}
                                    </div>
                                    <div className="mt-2">
                                        <button
                                            onClick={handleClaimMissionRewards}
                                            disabled={claimableEmbers <= 0 || claimedMissionRewards}
                                            className="btn-emerald w-full min-h-[40px] rounded-lg text-xs touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                                        >
                                            {claimButtonLabel}
                                        </button>
                                        <p className="text-[9px] text-[var(--text-muted)] mt-1 text-center">Resets at 00:00 UTC</p>
                                    </div>
                                </div>
                            )}

                            {/* Weekly Challenges */}
                            {weeklyChallenges && (
                                <div className="menu-progress-section">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                                            <Trophy size={12} />
                                            Weekly Challenges
                                        </p>
                                        <span className="text-[10px] text-[var(--gold)] font-bold flex items-center gap-1">
                                            <Gift size={11} />
                                            {weeklyClaimableEmbers} Embers
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        {weeklyChallenges.challenges.map((challenge) => {
                                            const isCompleted = challenge.completed;
                                            const isClaimed = challenge.claimed && isCompleted;
                                            return (
                                                <div key={challenge.id} className="rounded-lg px-2 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                                                            <span className="text-sm leading-none">{challenge.icon}</span>
                                                            {challenge.title}
                                                        </p>
                                                        <span className={`text-[10px] font-bold ${isClaimed ? 'text-[var(--gold)]' : isCompleted ? 'text-[var(--emerald)]' : 'text-[var(--text-muted)]'}`}>
                                                            {isClaimed ? 'CLAIMED' : isCompleted ? 'DONE' : `${challenge.current}/${challenge.target}`}
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                                        <div
                                                            className="h-full rounded-full transition-all duration-500"
                                                            style={{ width: `${Math.round(challenge.progress * 100)}%`, background: isCompleted ? 'linear-gradient(90deg, #F59E0B, #FFD700)' : 'linear-gradient(90deg, #A78BFA, #7C3AED)' }}
                                                        />
                                                    </div>
                                                    <p className="text-[10px] font-mono" style={{ color: '#F59E0B' }}>Reward: {challenge.reward} Embers</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-2">
                                        <button
                                            onClick={handleClaimWeeklyChallenges}
                                            disabled={weeklyClaimableEmbers <= 0 || claimedWeekRewards}
                                            className="w-full min-h-[40px] rounded-lg text-xs touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none font-bold"
                                            style={{ background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.4)', color: '#F59E0B' }}
                                        >
                                            {weeklyClaimButtonLabel}
                                        </button>
                                        <p className="text-[9px] text-[var(--text-muted)] mt-1 text-center">Resets every Monday 00:00 UTC</p>
                                    </div>
                                </div>
                            )}

                            {missionToast && (
                                <div role="status" className="menu-reward-toast" style={{ background: 'rgba(46,204,113,0.12)' }}>
                                    {missionToast}
                                </div>
                            )}

                            {/* Achievements Panel */}
                            <div className="menu-progress-section">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                                        <Star size={12} />
                                        Achievements
                                    </p>
                                    <span className="text-[10px] text-[var(--gold)] font-bold font-mono">
                                        {unlockedIds.size}/{ACHIEVEMENTS.length}
                                    </span>
                                </div>
                                {/* Progress bar */}
                                <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                    <div className="h-full rounded-full transition-all duration-500"
                                        style={{ width: `${Math.round((unlockedIds.size / ACHIEVEMENTS.length) * 100)}%`, background: 'linear-gradient(90deg, #A78BFA, #F59E0B)' }} />
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {ACHIEVEMENTS.map(achievement => {
                                        const unlocked = unlockedIds.has(achievement.id);
                                        return (
                                            <div key={achievement.id}
                                                title={`${achievement.title}: ${achievement.description}`}
                                                className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-bold transition-all cursor-default"
                                                style={{
                                                    background: unlocked ? `${ACHIEVEMENT_RARITY_COLORS[achievement.rarity]}18` : 'rgba(255,255,255,0.04)',
                                                    border: `1px solid ${unlocked ? ACHIEVEMENT_RARITY_COLORS[achievement.rarity] + '55' : 'rgba(255,255,255,0.08)'}`,
                                                    color: unlocked ? ACHIEVEMENT_RARITY_COLORS[achievement.rarity] : 'var(--text-muted)',
                                                    opacity: unlocked ? 1 : 0.45,
                                                    filter: unlocked ? 'none' : 'grayscale(100%)',
                                                }}>
                                                <span className="text-sm leading-none">{achievement.icon}</span>
                                                <span className="hidden sm:inline">{achievement.title}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {playerProfile.history.length > 0 && (
                                <div className="menu-progress-section">
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Recent Battles</p>
                                    <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                                        {playerProfile.history.slice(0, 5).map((entry, i) => (
                                            <div key={`${entry.matchId}-${i}`} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                                <span className={`font-bold w-5 ${entry.won ? 'text-[var(--emerald)]' : 'text-[var(--crimson)]'}`}>
                                                    {entry.won ? 'W' : 'L'}
                                                </span>
                                                <span className="text-[var(--text-secondary)] truncate flex-1 mx-2">vs {entry.opponentName}</span>
                                                <span className="text-[var(--text-muted)] text-[10px] mr-2">{entry.rounds.left}–{entry.rounds.right}</span>
                                                <span className="text-[var(--gold)] font-mono font-bold">+{entry.score.totalScore}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </details>
            )}
        </div>
    );
};
