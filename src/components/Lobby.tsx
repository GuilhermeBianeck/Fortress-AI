import { useState, useEffect, useRef, useCallback } from 'react';
import type { FormEvent } from 'react';
import type { RoomState, PlayerProfile } from '../types';
import { Swords, Zap, Check, Shield, Crown, Crosshair, Users, LogIn, ChevronRight, Target, Gift, Star, Calendar, Trophy, Copy, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { RankBadge } from './RankBadge';
import { getGamificationStats, getDailyMissions, getUtcDayStartMs, getUnlockedAchievements, ACHIEVEMENTS, ACHIEVEMENT_RARITY_COLORS, getWeeklyChallenges, getCheckinReward, CHECKIN_REWARDS, getUtcWeekStartMs, GAMIFICATION_FIRST_WIN_BONUS_EMBERS, MS_PER_DAY } from '../types';

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

/* ═══════════════════════════════════════
   Ember Particle Component (CSS-driven)
   ═══════════════════════════════════════ */

// Module-level constant — Math.random is called once at module load time, not during render
const EMBER_DATA = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 8}s`,
    duration: `${6 + Math.random() * 8}s`,
    size: 2 + Math.random() * 3,
    opacity: 0.3 + Math.random() * 0.5,
}));

const EmberParticles = () => {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-[1]" aria-hidden="true">
            {EMBER_DATA.map(e => (
                <div
                    key={e.id}
                    className="ember animate-ember"
                    style={{
                        left: e.left,
                        bottom: '-5px',
                        width: `${e.size}px`,
                        height: `${e.size}px`,
                        animationDelay: e.delay,
                        animationDuration: e.duration,
                        opacity: e.opacity,
                    }}
                />
            ))}
        </div>
    );
};

/* ═══════════════════════════════════════
   Mountain Silhouette SVG (CSS art)
   ═══════════════════════════════════════ */
const MountainLayer = ({ color, height, offset, className }: { color: string; height: string; offset: string; className?: string }) => (
    <div className={`absolute bottom-0 left-0 right-0 ${className || ''}`} style={{ height }}>
        <svg viewBox="0 0 1440 320" preserveAspectRatio="none" className="w-full h-full" style={{ transform: `translateY(${offset})` }}>
            <path
                fill={color}
                d="M0,224L48,213.3C96,203,192,181,288,186.7C384,192,480,224,576,229.3C672,235,768,213,864,186.7C960,160,1056,128,1152,133.3C1248,139,1344,181,1392,202.7L1440,224L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
            />
        </svg>
    </div>
);

const MountainLayerAlt = ({ color, height, offset, className }: { color: string; height: string; offset: string; className?: string }) => (
    <div className={`absolute bottom-0 left-0 right-0 ${className || ''}`} style={{ height }}>
        <svg viewBox="0 0 1440 320" preserveAspectRatio="none" className="w-full h-full" style={{ transform: `translateY(${offset})` }}>
            <path
                fill={color}
                d="M0,288L60,261.3C120,235,240,181,360,165.3C480,149,600,171,720,186.7C840,203,960,213,1080,197.3C1200,181,1320,139,1380,117.3L1440,96L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z"
            />
        </svg>
    </div>
);

/* ═══════════════════════════════════════
   Castle Silhouette SVG
   ═══════════════════════════════════════ */
const CastleSilhouette = ({ side, className }: { side: 'left' | 'right'; className?: string }) => (
    <div className={`absolute bottom-[12%] ${side === 'left' ? 'left-[5%]' : 'right-[5%]'} ${className || ''}`} style={{ width: '120px', height: '140px' }}>
        <svg viewBox="0 0 120 140" fill="none" className={`w-full h-full ${side === 'right' ? 'scale-x-[-1]' : ''}`}>
            {/* Main tower */}
            <rect x="35" y="30" width="50" height="110" fill="#0d1117" />
            {/* Left turret */}
            <rect x="15" y="50" width="25" height="90" fill="#0d1117" />
            <rect x="10" y="45" width="35" height="8" fill="#0d1117" />
            {/* Right turret */}
            <rect x="80" y="40" width="25" height="100" fill="#0d1117" />
            <rect x="75" y="35" width="35" height="8" fill="#0d1117" />
            {/* Battlements left */}
            <rect x="10" y="42" width="8" height="10" fill="#0d1117" />
            <rect x="22" y="42" width="8" height="10" fill="#0d1117" />
            <rect x="34" y="42" width="8" height="10" fill="#0d1117" />
            {/* Battlements right */}
            <rect x="75" y="32" width="8" height="10" fill="#0d1117" />
            <rect x="87" y="32" width="8" height="10" fill="#0d1117" />
            <rect x="99" y="32" width="8" height="10" fill="#0d1117" />
            {/* Center top */}
            <rect x="45" y="10" width="30" height="25" fill="#0d1117" />
            <rect x="40" y="5" width="8" height="30" fill="#0d1117" />
            <rect x="72" y="5" width="8" height="30" fill="#0d1117" />
            {/* Flag pole */}
            <rect x="57" y="0" width="2" height="15" fill="#0d1117" />
            <polygon points="59,0 59,8 68,4" fill="#0d1117" />
            {/* Gate */}
            <rect x="48" y="105" width="24" height="35" rx="12" fill="#060810" />
            {/* Windows - subtle glow */}
            <rect x="52" y="60" width="6" height="8" fill="#1a1a2e" opacity="0.6" />
            <rect x="62" y="60" width="6" height="8" fill="#1a1a2e" opacity="0.6" />
            <rect x="52" y="80" width="6" height="8" fill="#ffd700" opacity="0.15" />
            <rect x="62" y="80" width="6" height="8" fill="#ffd700" opacity="0.15" />
        </svg>
    </div>
);

/* ═══════════════════════════════════════
   Main Lobby Component
   ═══════════════════════════════════════ */
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
    playerProfile, onGetProfile,
}: LobbyProps) => {
    const [joinCode, setJoinCode] = useState('');
    const [isReady, setIsReady] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [tipIndex, setTipIndex] = useState(0);
    const [missionDayKey, setMissionDayKey] = useState(() => String(getUtcDayStartMs(new Date())));
    const [missionToast, setMissionToast] = useState<string | null>(null);
    const [claimedMissionDay, setClaimedMissionDay] = useState(() => localStorage.getItem('fortress_missions_claim_day') || '');
    const claimToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [codeCopied, setCodeCopied] = useState(false);
    const [showHowToPlay, setShowHowToPlay] = useState(false);

    // Check-in state
    const [checkinStreak, setCheckinStreak] = useState(() => parseInt(localStorage.getItem('fortress_checkin_streak') || '0', 10));
    const [checkinLastDay, setCheckinLastDay] = useState(() => localStorage.getItem('fortress_checkin_last_day') || '');
    const todayKey = String(getUtcDayStartMs(new Date()));
    const checkinToday = checkinLastDay === todayKey;
    const pendingCheckinStreak = checkinToday ? checkinStreak : checkinStreak + 1;
    const checkinRewardToday = getCheckinReward(pendingCheckinStreak);

    // Weekly challenge claim state
    const [claimedWeekKey, setClaimedWeekKey] = useState(() => localStorage.getItem('fortress_weekly_claim_week') || '');
    const weekKey = String(getUtcWeekStartMs(new Date()));
    const claimedWeekRewards = claimedWeekKey === weekKey;

    const gamification = playerProfile ? getGamificationStats(playerProfile) : null;
    const dailyMissions = playerProfile ? getDailyMissions(playerProfile) : null;
    const weeklyChallenges = playerProfile ? getWeeklyChallenges(playerProfile) : null;
    const claimedMissionRewards = claimedMissionDay === missionDayKey;
    const claimableEmbers = dailyMissions && !claimedMissionRewards ? dailyMissions.claimableEmbers : 0;
    const claimButtonLabel = claimedMissionRewards
        ? 'Rewards claimed today'
        : claimableEmbers > 0
            ? `Claim ${claimableEmbers} Embers`
            : 'Complete missions to claim rewards';
    const weeklyClaimableEmbers = weeklyChallenges && !claimedWeekRewards ? weeklyChallenges.claimableEmbers : 0;
    const weeklyClaimButtonLabel = claimedWeekRewards
        ? 'Weekly rewards claimed'
        : weeklyClaimableEmbers > 0
            ? `Claim ${weeklyClaimableEmbers} Embers`
            : 'Complete challenges to claim';

    useEffect(() => {
        onGetProfile?.();
    }, [onGetProfile]);

    useEffect(() => {
        const t = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 4000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        const t = setInterval(() => {
            const nextDayKey = String(getUtcDayStartMs(new Date()));
            setMissionDayKey(prev => prev === nextDayKey ? prev : nextDayKey);
        }, 60000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        return () => {
            if (claimToastTimeoutRef.current) {
                clearTimeout(claimToastTimeoutRef.current);
            }
        };
    }, []);

    // Parallax mouse tracking
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        setMousePos({ x, y });
    }, []);

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

    const handleClaimMissionRewards = () => {
        if (!dailyMissions || dailyMissions.claimableEmbers <= 0 || claimedMissionRewards) return;
        // Client-only interim claim state; backend reward persistence can replace this flow later.
        setClaimedMissionDay(missionDayKey);
        localStorage.setItem('fortress_missions_claim_day', missionDayKey);
        setMissionToast(`+${dailyMissions.claimableEmbers} Embers claimed!`);
        if (claimToastTimeoutRef.current) clearTimeout(claimToastTimeoutRef.current);
        claimToastTimeoutRef.current = setTimeout(() => setMissionToast(null), 2500);
    };

    const handleCheckin = () => {
        if (checkinToday) return;
        const yesterday = String(getUtcDayStartMs(new Date(Date.now() - MS_PER_DAY)));
        const newStreak = checkinLastDay === yesterday ? checkinStreak + 1 : 1;
        setCheckinStreak(newStreak);
        setCheckinLastDay(todayKey);
        localStorage.setItem('fortress_checkin_streak', String(newStreak));
        localStorage.setItem('fortress_checkin_last_day', todayKey);
        setMissionToast(`+${checkinRewardToday} Embers — Day ${newStreak} check-in!`);
        if (claimToastTimeoutRef.current) clearTimeout(claimToastTimeoutRef.current);
        claimToastTimeoutRef.current = setTimeout(() => setMissionToast(null), 3000);
    };

    const handleClaimWeeklyChallenges = () => {
        if (!weeklyChallenges || weeklyChallenges.claimableEmbers <= 0 || claimedWeekRewards) return;
        setClaimedWeekKey(weekKey);
        localStorage.setItem('fortress_weekly_claim_week', weekKey);
        setMissionToast(`+${weeklyChallenges.claimableEmbers} Embers — Weekly rewards!`);
        if (claimToastTimeoutRef.current) clearTimeout(claimToastTimeoutRef.current);
        claimToastTimeoutRef.current = setTimeout(() => setMissionToast(null), 3000);
    };

    const getMissionStatus = (mission: { completed: boolean; current: number; target: number }) => {
        if (mission.completed && claimedMissionRewards) return { label: 'CLAIMED', className: 'text-[var(--gold)]' };
        if (mission.completed) return { label: 'COMPLETED', className: 'text-[var(--emerald)]' };
        return { label: `${mission.current}/${mission.target}`, className: 'text-[var(--text-muted)]' };
    };

    const handleCopyCode = (code: string) => {
        navigator.clipboard.writeText(code).then(() => {
            setCodeCopied(true);
            setTimeout(() => setCodeCopied(false), 2000);
        }).catch(() => {
            // Clipboard API requires HTTPS / user gesture — silently ignore
            // (text is already selectable with the select-all class on the code element)
            setCodeCopied(true);
            setTimeout(() => setCodeCopied(false), 2000);
        });
    };

    // ─── Waiting Room View — VS Card ───
    if (roomState) {
        const isSinglePlayer = roomState.opponentName === 'Training Bot';

        return (
            <div className="flex-1 w-full flex items-center justify-center p-4 sm:p-6 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a0a12 0%, #0f0e17 50%, #1a1a2e 100%)' }}>
                {/* Subtle stars */}
                <div className="stars-layer absolute inset-0 opacity-40" />
                <EmberParticles />

                <div className="w-full max-w-lg text-center relative z-10">
                    {/* Title */}
                    <div className="flex items-center justify-center gap-3 mb-6">
                        <Swords size={28} className="text-[var(--gold)]" />
                        <h2 className="text-2xl sm:text-3xl font-bold text-[var(--gold)] font-heading text-glow-gold">
                            {isSinglePlayer ? 'Training Grounds' : 'War Room'}
                        </h2>
                        <Swords size={28} className="text-[var(--gold)]" />
                    </div>

                    {/* Room Code for PvP */}
                    {!isSinglePlayer && (
                        <>
                            <div className="flex items-center justify-center gap-3 mb-2">
                                <div className="text-4xl font-mono font-bold text-[var(--gold)] tracking-[0.3em] select-all text-glow-gold">
                                    {roomState.roomId}
                                </div>
                                <button
                                    onClick={() => handleCopyCode(roomState.roomId)}
                                    title="Copy room code"
                                    className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg border transition-all duration-200 touch-manipulation ${
                                        codeCopied
                                            ? 'text-[var(--emerald)] border-[rgba(46,204,113,0.4)] bg-[rgba(46,204,113,0.1)]'
                                            : 'text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--gold)] hover:border-[var(--border-accent)] hover:bg-[var(--bg-elevated)]'
                                    }`}
                                >
                                    {codeCopied ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mb-6">
                                {codeCopied ? '✓ Copied to clipboard!' : 'Share this code with your opponent'}
                            </p>
                        </>
                    )}

                    {/* VS Card */}
                    <div className="card-dark rounded-2xl p-5 sm:p-6 mb-5" style={{ border: '1px solid rgba(255, 215, 0, 0.15)' }}>
                        <div className="flex items-center justify-between gap-3">
                            {/* Player Card */}
                            <div className="flex-1 flex flex-col items-center gap-2">
                                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl"
                                    style={{ background: 'linear-gradient(135deg, rgba(46, 204, 113, 0.2), rgba(46, 204, 113, 0.05))', border: '2px solid rgba(46, 204, 113, 0.4)' }}>
                                    <Shield size={32} className="text-[var(--emerald)]" />
                                </div>
                                <span className="text-sm sm:text-base font-bold text-[var(--text-primary)] font-display truncate max-w-[120px]">
                                    {playerName || 'Knight'}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-display tracking-wider"
                                    style={{ background: 'rgba(46, 204, 113, 0.15)', color: 'var(--emerald)', border: '1px solid rgba(46, 204, 113, 0.3)' }}>
                                    {roomState.side.toUpperCase()}
                                </span>
                            </div>

                            {/* VS Badge */}
                            <div className="relative flex items-center justify-center">
                                <div className="absolute w-16 h-16 rounded-full opacity-30 animate-pulse" style={{ background: 'radial-gradient(circle, var(--gold), transparent 70%)' }} />
                                <div className="w-12 h-12 rounded-full flex items-center justify-center font-heading text-lg font-bold text-[var(--gold)] z-10"
                                    style={{ background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 215, 0, 0.05))', border: '2px solid rgba(255, 215, 0, 0.4)', boxShadow: '0 0 20px rgba(255, 215, 0, 0.15)' }}>
                                    VS
                                </div>
                            </div>

                            {/* Opponent Card */}
                            <div className="flex-1 flex flex-col items-center gap-2">
                                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl ${!roomState.opponentConnected ? 'animate-pulse' : ''}`}
                                    style={{ background: roomState.opponentConnected ? 'linear-gradient(135deg, rgba(231, 76, 60, 0.2), rgba(231, 76, 60, 0.05))' : 'linear-gradient(135deg, rgba(100, 100, 100, 0.2), rgba(100, 100, 100, 0.05))', border: `2px solid ${roomState.opponentConnected ? 'rgba(231, 76, 60, 0.4)' : 'rgba(100, 100, 100, 0.3)'}` }}>
                                    {roomState.opponentConnected
                                        ? <Swords size={32} className="text-[var(--crimson)]" />
                                        : <div className="w-6 h-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                                    }
                                </div>
                                <span className={`text-sm sm:text-base font-bold font-display truncate max-w-[120px] ${roomState.opponentConnected ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                                    {roomState.opponentConnected ? (roomState.opponentName || 'Challenger') : 'Awaiting...'}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-display tracking-wider"
                                    style={{ background: 'rgba(231, 76, 60, 0.15)', color: 'var(--crimson)', border: '1px solid rgba(231, 76, 60, 0.3)' }}>
                                    {roomState.side === 'left' ? 'RIGHT' : 'LEFT'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Tip Carousel */}
                    <div className="text-xs sm:text-sm text-[var(--text-secondary)] mb-5 h-6 flex items-center justify-center transition-opacity duration-500"
                        style={{ fontStyle: 'italic' }}>
                        {TIPS[tipIndex]}
                    </div>

                    {/* Ready Button */}
                    {roomState.opponentConnected && (
                        <button
                            onClick={handleReady}
                            disabled={isReady}
                            className={`w-full max-w-sm mx-auto min-h-[52px] py-3.5 rounded-xl text-lg touch-manipulation
                                transition-all duration-300
                                ${isReady
                                    ? 'card-dark text-[var(--emerald)] border-[var(--emerald)] cursor-default'
                                    : 'btn-emerald cursor-pointer animate-pulse-subtle'
                                }`}
                        >
                            {isReady ? (
                                <span className="flex items-center justify-center gap-2 font-bold">
                                    <Check size={22} /> READY FOR BATTLE
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2 font-bold">
                                    <Swords size={20} /> READY FOR BATTLE
                                </span>
                            )}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // ─── Queue View ───
    if (queuePosition !== null) {
        return (
            <div className="flex-1 w-full flex items-center justify-center p-6 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a0a12 0%, #0f0e17 50%, #1a1a2e 100%)' }}>
                <div className="stars-layer absolute inset-0 opacity-40" />

                <div className="w-full text-center relative z-10">
                    <div className="w-12 h-12 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                    <h2 className="text-2xl font-bold text-[var(--gold)] mb-3 font-heading text-glow-gold">Seeking Challenger...</h2>
                    <p className="text-base text-[var(--text-secondary)]">Queue position: {queuePosition + 1}</p>
                    <button
                        onClick={onLeaveQueue}
                        className="mt-6 btn-medieval min-h-[48px] px-8 py-3 rounded-xl text-base"
                    >
                        Retreat
                    </button>
                </div>
            </div>
        );
    }

    // ─── Main Lobby — Parallax Landing Page ───
    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            className="parallax-container flex-1 w-full flex flex-col items-center"
            style={{ background: 'linear-gradient(180deg, #070710 0%, #0a0a16 20%, #0f0e17 40%, #1a1a2e 70%, #16213e 100%)' }}
        >
            {/* ═══ PARALLAX LAYERS ═══ */}

            {/* Layer 0: Stars */}
            <div
                className="stars-layer parallax-layer"
                style={{ transform: `translate(${mousePos.x * -5}px, ${mousePos.y * -5}px)` }}
            />

            {/* Horizon glow */}
            <div
                className="absolute bottom-0 left-0 right-0 h-[40%] pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse 80% 40% at 50% 100%, rgba(230, 126, 34, 0.08) 0%, transparent 70%)',
                    transform: `translate(${mousePos.x * -3}px, ${mousePos.y * -2}px)`,
                }}
            />

            {/* Layer 1: Far mountains */}
            <MountainLayerAlt
                color="#0d0d1a"
                height="55%"
                offset="10px"
                className="opacity-80"
            />

            {/* Layer 2: Mid mountains */}
            <MountainLayer
                color="#0b0b15"
                height="45%"
                offset="20px"
            />

            {/* Castle silhouettes */}
            <CastleSilhouette side="left" className="opacity-60" />
            <CastleSilhouette side="right" className="opacity-60" />

            {/* Layer 3: Near hills */}
            <MountainLayerAlt
                color="#090912"
                height="30%"
                offset="0px"
            />

            {/* Fog overlay */}
            <div
                className="absolute bottom-0 left-0 right-0 h-[25%] pointer-events-none z-[2]"
                style={{
                    background: 'linear-gradient(0deg, rgba(10, 10, 18, 0.95) 0%, rgba(10, 10, 18, 0.5) 40%, transparent 100%)',
                }}
            />

            {/* Ember particles */}
            <EmberParticles />

            {/* ═══ CONTENT ═══ */}
            <div className="relative z-10 flex flex-col items-center justify-center flex-1 w-full max-w-lg px-6 py-8 sm:py-12">

                {/* Logo & Branding */}
                <div className="flex flex-col items-center mb-8 sm:mb-10 animate-float">
                    {/* Crown icon */}
                    <div className="relative mb-3">
                        <div className="absolute inset-0 blur-xl bg-[var(--gold)] opacity-20 rounded-full scale-150" />
                        <Crown size={48} className="text-[var(--gold)] relative" strokeWidth={1.5} />
                    </div>

                    <h1
                        className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-wide text-[var(--gold)] font-heading text-glow-gold"
                    >
                        FORTRESS AI
                    </h1>

                    <div className="ornament-divider w-48 my-3">
                        <span className="text-[var(--gold-dim)] text-xs font-display tracking-[0.3em]">✦</span>
                    </div>

                    <p className="text-sm sm:text-base text-[var(--text-secondary)] font-display tracking-wider">
                        CASTLE WAR — BUILD & CONQUER
                    </p>
                </div>

                {/* Feature pills — visible on larger screens */}
                <div className="hidden sm:flex gap-6 mb-8 text-[var(--text-secondary)] text-xs">
                    <div className="flex items-center gap-2">
                        <Shield size={14} className="text-[var(--gold-dim)]" />
                        <span>AI-Powered Castles</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Crosshair size={14} className="text-[var(--ember)]" />
                        <span>Physics Destruction</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Swords size={14} className="text-[var(--crimson)]" />
                        <span>Turn-Based Combat</span>
                    </div>
                </div>

                {/* Action Panel */}
                <div className="w-full flex flex-col gap-3">
                    {/* Player Name */}
                    <label htmlFor="player-name-input" className="sr-only">Player name</label>
                    <input
                        id="player-name-input"
                        type="text"
                        value={playerName}
                        onChange={(e) => onPlayerNameChange(e.target.value)}
                        placeholder="Enter thy name..."
                        maxLength={20}
                        autoComplete="nickname"
                        className="input-medieval w-full rounded-xl px-4 py-3.5 text-center text-base sm:text-lg font-display font-bold tracking-wide touch-manipulation"
                    />

                    {/* Single Player */}
                    <button
                        onClick={() => onCreateRoom(playerName, 'single')}
                        className="btn-blue w-full min-h-[52px] py-3.5 sm:py-4 rounded-xl text-base sm:text-lg touch-manipulation flex items-center justify-center gap-2.5"
                    >
                        <Zap size={20} aria-hidden="true" />
                        <span>Single Player</span>
                    </button>

                    {/* Create Kingdom */}
                    <button
                        onClick={() => onCreateRoom(playerName, 'pvp')}
                        className="btn-primary w-full min-h-[52px] py-3.5 sm:py-4 rounded-xl text-base sm:text-lg touch-manipulation flex items-center justify-center gap-2.5"
                    >
                        <Crown size={20} aria-hidden="true" />
                        <span>Create Kingdom</span>
                        <span className="text-xs opacity-70 ml-1">(PvP)</span>
                    </button>

                    {/* Join Room */}
                    <form onSubmit={handleJoinSubmit} className="flex gap-2 w-full" aria-label="Join existing room">
                        <label htmlFor="room-code-input" className="sr-only">Room code</label>
                        <input
                            id="room-code-input"
                            type="text"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            placeholder="ROOM CODE"
                            maxLength={6}
                            autoComplete="off"
                            className="input-medieval min-w-0 flex-1 rounded-xl px-3 py-3.5 text-center text-base font-mono font-bold uppercase tracking-[0.15em] touch-manipulation"
                        />
                        <button
                            type="submit"
                            disabled={joinCode.trim().length < 4}
                            className="btn-emerald shrink-0 min-h-[52px] px-6 py-3 rounded-xl text-base touch-manipulation
                                flex items-center gap-2
                                disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                        >
                            <LogIn size={18} aria-hidden="true" />
                            Join
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="ornament-divider mx-4" role="separator" aria-label="or">
                        <span className="text-[10px] text-[var(--text-muted)] font-display tracking-widest" aria-hidden="true">OR</span>
                    </div>

                    {/* Quick Match */}
                    <button
                        onClick={() => onJoinQueue(playerName)}
                        className="btn-medieval w-full min-h-[52px] py-3.5 rounded-xl text-base touch-manipulation flex items-center justify-center gap-2.5"
                    >
                        <Users size={18} aria-hidden="true" />
                        <span>Quick Battle</span>
                        <ChevronRight size={16} className="opacity-50" aria-hidden="true" />
                    </button>

                    {/* How to Play */}
                    <div className="card-dark rounded-xl overflow-hidden">
                        <button
                            onClick={() => setShowHowToPlay(!showHowToPlay)}
                            aria-expanded={showHowToPlay}
                            aria-controls="how-to-play-content"
                            className="w-full flex items-center justify-between px-4 py-3 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors touch-manipulation"
                        >
                            <span className="flex items-center gap-2 font-display font-bold tracking-wider">
                                <HelpCircle size={16} className="text-[var(--gold-dim)]" aria-hidden="true" />
                                HOW TO PLAY
                            </span>
                            {showHowToPlay ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                        </button>
                        {showHowToPlay && (
                            <div id="how-to-play-content" className="px-4 pb-4 text-xs text-[var(--text-secondary)] flex flex-col gap-3 animate-scale-in">
                                <div className="flex gap-3 items-start">
                                    <span className="text-lg leading-none mt-0.5" aria-hidden="true">🏗️</span>
                                    <div>
                                        <p className="font-bold text-[var(--emerald)] mb-0.5">1. Build Phase (90s)</p>
                                        <p>Design your fortress! Place blocks manually by clicking on your side, or describe your fortress to the AI architect using the prompt bar. Protect your King at all costs.</p>
                                    </div>
                                </div>
                                <div className="flex gap-3 items-start">
                                    <span className="text-lg leading-none mt-0.5" aria-hidden="true">👁️</span>
                                    <div>
                                        <p className="font-bold text-[var(--gold)] mb-0.5">2. Reveal Phase (5s)</p>
                                        <p>The camera pans across the battlefield, revealing both fortresses and any environmental hazards.</p>
                                    </div>
                                </div>
                                <div className="flex gap-3 items-start">
                                    <span className="text-lg leading-none mt-0.5" aria-hidden="true">💥</span>
                                    <div>
                                        <p className="font-bold text-[var(--crimson)] mb-0.5">3. Combat Phase (15s/turn)</p>
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
                                        <span><span aria-hidden="true">⌨️</span> <b>A/D</b> to pan camera · <b>↑↓</b> adjust power · <b>Space</b> to fire</span>
                                        <span><span aria-hidden="true">🤖</span> <b>Set an API key</b> and type a prompt to let AI build your fortress</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Player Profile & History */}
                    {playerProfile && (
                        <div className="mt-2">
                            <RankBadge profile={playerProfile} showProgress />

                            {/* Daily Check-in */}
                            <div className="mt-2 card-dark rounded-xl p-3">
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
                                <div className="mt-2 card-dark rounded-xl p-3">
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
                                <div className="mt-2 card-dark rounded-xl p-3">
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
                                <div className="mt-2 card-dark rounded-xl p-3">
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
                                            const isClaimed = claimedWeekRewards && isCompleted;
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
                                <div className="mt-2 rounded-lg px-3 py-2 text-xs text-center font-bold border border-[rgba(46,204,113,0.35)] text-[var(--emerald)]" style={{ background: 'rgba(46,204,113,0.12)' }}>
                                    {missionToast}
                                </div>
                            )}

                            {/* Achievements Panel */}
                            {(() => {
                                const unlockedIds = new Set(getUnlockedAchievements(playerProfile).map(a => a.id));
                                const unlockedCount = unlockedIds.size;
                                return (
                                    <div className="mt-2 card-dark rounded-xl p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                                                <Star size={12} />
                                                Achievements
                                            </p>
                                            <span className="text-[10px] text-[var(--gold)] font-bold font-mono">
                                                {unlockedCount}/{ACHIEVEMENTS.length}
                                            </span>
                                        </div>
                                        {/* Progress bar */}
                                        <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                            <div className="h-full rounded-full transition-all duration-500"
                                                style={{ width: `${Math.round((unlockedCount / ACHIEVEMENTS.length) * 100)}%`, background: 'linear-gradient(90deg, #A78BFA, #F59E0B)' }} />
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
                                );
                            })()}

                            {playerProfile.history.length > 0 && (
                                <div className="mt-2 card-dark rounded-xl p-3">
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
                </div>
            </div>
        </div>
    );
};
