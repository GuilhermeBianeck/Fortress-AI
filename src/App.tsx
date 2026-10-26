import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useGameState } from './hooks/useGameState';
import { readStorage, writeStorage } from './hooks/browserStorage';
import { MatchPauseNotice } from './components/MatchPauseNotice';
import { GameCanvas } from './components/GameCanvas';
import { GodTools } from './components/GodTools';
import { toggleMute, isMuted } from './audio/SoundManager';
import { setThemeMusic, disposeThemeMusic } from './audio/themeMusic';
import { Lobby } from './components/Lobby';
import { PhaseOverlay } from './components/PhaseOverlay';
import { ChatPanel } from './components/ChatPanel';
import { RankBadge } from './components/RankBadge';
import { KeyRound, Send, Loader2, CheckCircle2, AlertCircle, WifiOff, Volume2, VolumeX, MessageCircle, SlidersHorizontal, X } from 'lucide-react';
import { BattleSettings } from './components/BattleSettings';
import { readBattlePreferences, saveBattlePreferences, type BattlePreferences } from './game/battlePreferences';
import { SpriteIcon } from './components/SpriteIcon';
import type { MaterialType, ShapeType, GameMode } from './types';
import { getRankTier } from './types';
import { track } from './analytics/tracker';
import { royalMenu } from './sprites/royalMenu';
import { turnWindHazard } from '../server/shared/combatTuning';
import { battleArt } from './sprites/battleArt';
import './components/RoyalMenuShell.css';
import './components/BattleShell.css';

const battleShellStyle = {
  '--battle-hud-art': `url("${battleArt.url('hud')}")`,
  '--battle-fire-art': `url("${battleArt.url('fire')}")`,
  '--battle-input-art': `url("${royalMenu.url('field')}")`,
  '--battle-blue-art': `url("${royalMenu.url('button_sapphire')}")`,
  '--battle-green-art': `url("${royalMenu.url('button_emerald')}")`,
} as CSSProperties;

function App() {
  const {
    gameState, terrain, buildStatus, kingsHp,
    roomState, phase, phaseEndsAt, turnPlayer, matchResult, queuePosition,
    chatMessages, rematchState, roundScore, currentRound, hazards, wind,
    matchScores, playerProfile, prevPlayerProfile, isConnected, connectionNotice, roundWinner,
    pauseState, syncRevision, serverHasFired, progressStatus, rewardNotice, claimReward, getHistory,
    identityReplaced,
    lobbyError,
    createRoom, joinRoom, joinQueue, leaveQueue, playerReady,
    spawnBox, requestBuild, fireProjectile,
    sendChatMessage, requestRematch, getProfile, returnToLobby,
    setBlockDestroyedCallback, setProjectileImpactCallback, setKingDamageCallback,
  } = useGameState();
  // Per-turn wind joins the match hazards so the banner, renderer and aim preview all read it.
  const battleHazards = useMemo(() => wind === null ? hazards : [...hazards, turnWindHazard(wind)], [hazards, wind]);

  // God Tools state
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialType>('wood');
  const [selectedShape, setSelectedShape] = useState<ShapeType>('rectangle');
  const [gameMode, setGameMode] = useState<GameMode>('build');
  const [showChat, setShowChat] = useState(false);
  const closeChat = useCallback(() => setShowChat(false), []);
  const [spawnCount, setSpawnCount] = useState(0);

  // Player name state (persisted)
  const [playerName, setPlayerName] = useState(() => readStorage('fortress_player_name') || '');
  const handlePlayerNameChange = (name: string) => {
    setPlayerName(name);
    writeStorage('fortress_player_name', name);
  };

  // AI Architect state
  const [apiKey, setApiKey] = useState(() => readStorage('fortress_api_key') || '');
  const [prompt, setPrompt] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showRankPanel, setShowRankPanel] = useState(false);
  const [muted, setMuted] = useState(isMuted());
  const [battlePreferences, setBattlePreferences] = useState(readBattlePreferences);
  const [showBattleSettings, setShowBattleSettings] = useState(false);
  const changeBattlePreferences = (value: BattlePreferences) => { setBattlePreferences(value); saveBattlePreferences(value); };
  const apiDialogRef = useRef<HTMLDivElement>(null);

  // Determine screen: lobby or game
  const inGame = phase !== 'lobby';
  const [resultVisible, setResultVisible] = useState(phase === 'result');
  useEffect(() => {
    // Let the delayed renderer show the finishing hit before covering the battlefield.
    const timer = setTimeout(() => setResultVisible(phase === 'result'), phase === 'result' ? 950 : 0);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => { setThemeMusic(inGame, muted); }, [inGame, muted]);
  useEffect(() => () => disposeThemeMusic(), []);

  // SpriteIcon images load on demand; the battlefield loads its own small art bundle.
  useEffect(() => {
    track('app_loaded', {
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
    });

  }, []);

  useEffect(() => {
    if (!isConnected) return;
    // Wait for the real connection rather than dropping an invite on slow startup.
    const urlRoom = new URLSearchParams(window.location.search).get('room');
    if (urlRoom && urlRoom.length >= 4) {
      joinRoom(urlRoom, playerName);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [isConnected, joinRoom, playerName]);

  // Reset build controls when a new build phase starts.
  // Pattern: store previous phase in state; check during render (React docs: "Adjusting some state when a prop changes").
  const [prevPhase, setPrevPhase] = useState(phase);
  if (prevPhase !== phase) {
    setPrevPhase(phase);
    if (phase === 'build') {
      setSpawnCount(0);
      setGameMode('build');
    }
    if (phase === 'lobby') { setShowChat(false); setShowBattleSettings(false); }
  }

  useEffect(() => {
    if (!showApiKey) return;
    const dialog = apiDialogRef.current;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowApiKey(false);
      if (event.key !== 'Tab' || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener('keydown', handleKey);
    return () => dialog?.removeEventListener('keydown', handleKey);
  }, [showApiKey]);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    writeStorage('fortress_api_key', value);
  };

  const handleSpawn = (x: number, y: number) => {
    spawnBox(x, y, selectedMaterial, selectedShape);
    setSpawnCount(c => c + 1);
  };

  const handleSubmitPrompt = (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    track('ai_prompt_submitted', {
      prompt_length: prompt.length,
      has_own_key: !!apiKey,
    });
    requestBuild(apiKey, prompt); // apiKey may be empty — server uses its own key as fallback
    setPrompt('');
  };

  const isBuilding = buildStatus.status === 'generating' || buildStatus.status === 'building';
  const mySide = roomState?.side ?? 'left';
  const myRank = playerProfile ? getRankTier(playerProfile.totalScore) : null;
  const isSinglePlayer = roomState?.opponentName === 'Training Bot';

  // Derive pre-match score from post-match data for rank-up detection
  const prevTotalScore = (playerProfile && matchScores)
    ? playerProfile.totalScore - matchScores[mySide].totalScore
    : undefined;

  // Build name map: left/right → name
  const playerNamesMap = roomState ? {
    [roomState.side]: roomState.myName || playerName || 'You',
    [roomState.side === 'left' ? 'right' : 'left']: roomState.opponentName || 'Opponent',
  } as { left: string; right: string } : { left: 'Player 1', right: 'Player 2' };

  return (
    <div className={`h-[100dvh] text-[var(--text-primary)] selection:bg-amber-300/20 flex flex-col overflow-hidden safe-area-top ${inGame ? 'game-shell' : 'menu-shell'} ${connectionNotice || pauseState.paused || !isConnected ? 'has-connection-notice' : ''}`} style={{ fontFamily: "'Inter', 'Cinzel', Georgia, serif", background: inGame ? '#55a9df' : 'var(--bg-deepest)', ...(inGame ? battleShellStyle : {}) }}>
      {/* The approved menu header stays separate from the in-game HUD. */}
      <header className={`px-4 py-2.5 border-b border-[var(--border-subtle)] flex justify-between items-center backdrop-blur-md sticky top-0 z-50 ${inGame ? 'game-header hidden' : 'menu-header'}`} style={{ background: '#f4f8f4', boxShadow: '0 1px 0 #bdcec6' }}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg shrink-0" style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.25), rgba(255,215,0,0.06))', border: '1px solid rgba(255,215,0,0.2)' }}>
            <SpriteIcon name="logo_crest" size={24} alt="Fortress AI" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-[var(--gold)] font-heading leading-none">FORTRESS AI</h1>
            <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5" aria-live="polite" aria-atomic="true">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--emerald)] animate-pulse shrink-0" aria-hidden="true"></span>
              <span className="font-mono">{inGame && roomState ? `Room: ${roomState.roomId}` : 'LIVE'}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {/* Rank indicator (non-game, desktop) */}
          {!inGame && myRank && (
            <button
              onClick={() => setShowRankPanel(!showRankPanel)}
              aria-expanded={showRankPanel}
              aria-label={`Your rank: ${myRank.name}. ${showRankPanel ? 'Hide' : 'Show'} rank details`}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all duration-200 hover:bg-[var(--bg-elevated)]"
              style={{ borderColor: `${myRank.color}44`, background: `${myRank.color}0d` }}
            >
              <span className="text-sm" aria-hidden="true">{myRank.emoji}</span>
              <span className="text-xs font-bold" style={{ color: myRank.color }}>{myRank.name}</span>
            </button>
          )}
          {/* Chat toggle (mobile only, in-game, only for PvP) */}
          {inGame && !isSinglePlayer && (
            <button
              onClick={() => setShowChat(!showChat)}
              aria-pressed={showChat}
              aria-label={showChat ? 'Close chat' : 'Open chat'}
              className={`xl:hidden min-w-[44px] min-h-[44px] px-2 py-1.5 text-sm rounded-lg transition-all duration-200 touch-manipulation
                border flex items-center justify-center gap-1.5
                ${showChat
                  ? 'bg-[var(--bg-elevated)] border-[var(--border-accent)] text-[var(--gold)]'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                }`}
            >
              <SpriteIcon name="ui_chat_bubble" size={18} />
              <span className="hidden sm:inline text-xs">Chat</span>
              {chatMessages.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--ember)]" aria-hidden="true"></span>
              )}
            </button>
          )}
          {/* Mute toggle */}
          <button
            type="button"
            onClick={() => setMuted(toggleMute())}
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            aria-pressed={muted}
            title={muted ? 'Unmute sounds' : 'Mute sounds'}
            className="min-w-[44px] min-h-[44px] px-1.5 py-1.5 text-xs rounded-lg transition-all duration-200 touch-manipulation flex items-center justify-center
              text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]"
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          {/* API Key toggle — only shown when user has a custom key or during build phase */}
          {(apiKey || (inGame && phase === 'build')) && (
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              aria-pressed={showApiKey}
              aria-label={apiKey ? 'API key configured — click to change' : 'Set your own API key for unlimited AI builds'}
              className={`min-w-[44px] min-h-[44px] px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg transition-all duration-200 touch-manipulation flex items-center justify-center gap-1.5
                         ${apiKey
                  ? 'text-[var(--emerald)] bg-[rgba(39,174,96,0.1)] border border-[rgba(39,174,96,0.3)]'
                  : 'text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]'
                }
                         hover:bg-[var(--bg-elevated)]`}
            >
              <SpriteIcon name="ui_api_key" size={18} />
              <span className="hidden sm:inline">{apiKey ? 'Key Set' : 'API Key'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Rank panel dropdown (desktop, lobby) */}
      {showRankPanel && !inGame && playerProfile && (
        <div className="w-full max-w-sm mx-auto px-4 pt-2 z-40 animate-scale-in">
          <RankBadge profile={playerProfile} showProgress />
        </div>
      )}

      {/* Connection lost banner */}
      {!isConnected && (
        <div
          role="alert"
          aria-live="assertive"
          className="w-full px-3 py-2 flex items-center justify-between gap-2 animate-slide-up z-50"
          style={{ background: 'rgba(192,57,43,0.2)', borderBottom: '1px solid rgba(192,57,43,0.4)' }}
        >
          <div className="flex items-center gap-2 text-xs text-[var(--crimson)]">
            <WifiOff size={14} className="shrink-0" aria-hidden="true" />
            {/* Socket.io retries automatically; the Reload button is a manual escape hatch. */}
            <span>Connection lost — attempting to reconnect…</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-[10px] font-bold text-[var(--crimson)] border border-[rgba(192,57,43,0.4)] rounded px-2 py-0.5 hover:bg-[rgba(192,57,43,0.1)] transition-colors shrink-0"
          >
            Reload
          </button>
        </div>
      )}

      {isConnected && connectionNotice && <div role="status" className="connection-notice">{connectionNotice} {identityReplaced && <button type="button" onClick={() => window.location.reload()}>Reload</button>}</div>}
      {isConnected && pauseState.paused && <MatchPauseNotice pause={pauseState} side={mySide} leave={returnToLobby} />}
      {progressStatus === 'pending' && <div className="progress-save-notice" role="status">Progress could not be saved yet. Retrying automatically. New battles are temporarily unavailable.</div>}

      <main inert={!isConnected || pauseState.paused || identityReplaced} className={`flex-1 flex flex-col items-center overflow-x-hidden min-h-0 ${inGame ? 'game-main overflow-hidden' : 'overflow-y-auto'}`}>
        {/* API Key Input (Modal Overlay) */}
        {showApiKey && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="api-key-dialog-title"
            aria-describedby="api-key-dialog-desc"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowApiKey(false); }}
          >
            <div ref={apiDialogRef} className="battle-api-dialog w-full max-w-md card-dark rounded-xl p-5 shadow-2xl border border-[var(--border-accent)] animate-scale-in">
              <div className="flex items-center justify-between gap-3 mb-3">
                <label id="api-key-dialog-title" htmlFor="api-key-input" className="text-sm font-bold text-[var(--gold)] block">Configure AI Architect</label>
                <button type="button" aria-label="Close AI architect settings" onClick={() => setShowApiKey(false)} className="battle-api-close min-w-[44px] min-h-[44px] flex items-center justify-center"><X size={20} aria-hidden="true" /></button>
              </div>
              <p id="api-key-dialog-desc" className="text-xs text-[var(--text-muted)] mb-4">
                Add your Google Gemini API key for AI fortress generation. Your key is saved in this browser and sent with your build requests.
              </p>
              <div className="flex gap-2">
                <input
                  id="api-key-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="AIzaSy..."
                  className="input-medieval flex-1 min-w-0 rounded-lg px-3 py-2 text-sm font-mono"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  onClick={() => setShowApiKey(false)}
                  className="btn-primary shrink-0 min-h-[44px] px-4 py-2 rounded-lg text-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lobby or Game */}
        {!inGame ? (
          <Lobby
            roomState={roomState}
            queuePosition={queuePosition}
            playerName={playerName}
            onPlayerNameChange={handlePlayerNameChange}
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
            onJoinQueue={joinQueue}
            onLeaveQueue={leaveQueue}
            onReady={playerReady}
            playerProfile={playerProfile}
            onGetProfile={getProfile}
            onClaimReward={claimReward}
            rewardNotice={rewardNotice}
            onGetHistory={getHistory}
            error={lobbyError}
          />
        ) : (
          <div className="game-container" data-phase={phase}>
            {roomState?.mode === 'single' && <span className="sr-only">Solo difficulty: {roomState.difficulty}</span>}
            <div className="game-battle-row" inert={(showChat && !isSinglePlayer) || showApiKey}>
              <div className="game-battlefield">
                <div className={phase === 'result' ? `game-phase-result${resultVisible ? '' : ' game-result-pending'}` : 'game-phase-row'}>
                  {phase === 'result' && <button type="button" className="battle-result-sound" onClick={() => setMuted(toggleMute())}
                    aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={muted} title={muted ? 'Unmute sounds' : 'Mute sounds'}>
                    {muted ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
                  </button>}
                  {phase !== 'result' && (
                    <div className="game-battle-identity" aria-label={`Fortress AI. Room ${roomState?.roomId ?? ''}`}>
                      <SpriteIcon name="logo_crest" size={42} />
                      <div>
                        <span className="game-battle-brand">FORTRESS <b>AI</b></span>
                        {roomState?.mode === 'single' && <small className="battle-difficulty">{roomState.difficulty} solo</small>}
                        <span className="game-battle-room">Room: {roomState?.roomId}</span>
                      </div>
                    </div>
                  )}
                  <div className="game-phase-content">
                    <PhaseOverlay
                      pausedAt={pauseState.paused ? pauseState.at : undefined}
                      phase={phase}
                      phaseEndsAt={phaseEndsAt}
                      turnPlayer={turnPlayer}
                      shotInFlight={gameState?.bodies.some(body => body.label === 'projectile' && Math.hypot(body.velocity.x, body.velocity.y) > 1)}
                      turnResolving={serverHasFired}
                      mySide={mySide}
                      matchResult={matchResult}
                      playerNames={playerNamesMap}
                      roundScore={roundScore}
                      currentRound={currentRound}
                      roundWinner={roundWinner}
                      opponentConnected={roomState?.opponentConnected}
                      rematchState={rematchState}
                      onRequestRematch={requestRematch}
                      onReturnToLobby={returnToLobby}
                      hazards={battleHazards}
                      matchScores={matchScores}
                      playerProfile={playerProfile}
                      prevTotalScore={prevTotalScore}
                      prevPlayerProfile={prevPlayerProfile}
                    />
                  </div>
                  {phase !== 'result' && (
                    <div className="game-phase-actions">
                      <button type="button" onClick={() => setShowBattleSettings(true)} aria-label="Game settings" title="Game settings" aria-haspopup="dialog" aria-expanded={showBattleSettings}><SlidersHorizontal size={18} aria-hidden="true" /></button>
                      <button
                        type="button"
                        onClick={() => setMuted(toggleMute())}
                        aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
                        aria-pressed={muted}
                        title={muted ? 'Unmute sounds' : 'Mute sounds'}
                        className="game-phase-sound border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-deep)] text-[var(--text-secondary)] touch-manipulation"
                      >
                        {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
                      </button>
                      {!isSinglePlayer && (
                        <button
                          type="button"
                          onClick={() => setShowChat(!showChat)}
                          aria-pressed={showChat}
                          aria-label={showChat ? 'Close chat' : 'Open chat'}
                          className={`game-phase-chat border rounded-lg touch-manipulation
                            ${showChat
                              ? 'bg-[var(--bg-elevated)] border-[var(--border-accent)]'
                              : 'bg-[var(--bg-deep)] border-[var(--border-subtle)]'
                            }`}
                        >
                          {showChat ? <X size={22} aria-hidden="true" /> : <MessageCircle size={22} aria-hidden="true" />}
                          {chatMessages.length > 0 && (
                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--ember)]" aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {showBattleSettings && <BattleSettings preferences={battlePreferences} onChange={changeBattlePreferences} onClose={() => setShowBattleSettings(false)} onLeave={returnToLobby} />}

                {/* GameCanvas measures this flex slot, including its own combat dock. */}
                <div className="game-canvas-slot">
                  <GameCanvas
                    paused={!isConnected || pauseState.paused}
                    syncRevision={syncRevision}
                    serverHasFired={serverHasFired}
                    preferences={battlePreferences}
                    gameState={gameState}
                    terrain={terrain}
                    onSpawn={handleSpawn}
                    kingsHp={kingsHp}
                    mySide={mySide}
                    gameMode={gameMode}
                    selectedShape={selectedShape}
                    phase={phase}
                    phaseEndsAt={phaseEndsAt}
                    turnPlayer={turnPlayer}
                    onFire={fireProjectile}
                    setBlockDestroyedCallback={setBlockDestroyedCallback}
                    setProjectileImpactCallback={setProjectileImpactCallback}
                    setKingDamageCallback={setKingDamageCallback}
                    playerNames={playerNamesMap}
                    hazards={battleHazards}
                    roundScore={roundScore}
                    currentRound={currentRound}
                    winner={matchResult?.winner}
                  />
                </div>
              </div>

            </div>

            {/* One bounded dock shared by phone, tablet and desktop. */}
            {phase === 'build' && (
              <div className="game-build-dock" inert={(showChat && !isSinglePlayer) || showApiKey}>
                <GodTools
                  selectedMaterial={selectedMaterial}
                  selectedShape={selectedShape}
                  onMaterialChange={setSelectedMaterial}
                  onShapeChange={setSelectedShape}
                  gameMode={gameMode}
                  onModeChange={setGameMode}
                  phase={phase}
                  onReady={playerReady}
                  serverReady={roomState?.buildReady}
                  blockCount={spawnCount}
                />
                <form onSubmit={handleSubmitPrompt} className="game-prompt-row" role="search" aria-label="AI fortress builder">
                  <button
                    type="button"
                    onClick={() => setShowApiKey(true)}
                    aria-label="Configure AI architect API key"
                    title="Configure AI architect API key"
                    className="game-prompt-key"
                  >
                    <KeyRound size={18} aria-hidden="true" />
                  </button>
                  <label htmlFor="ai-prompt-input" className="sr-only">Describe your fortress to the AI architect</label>
                  <input
                    id="ai-prompt-input"
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your fortress to AI..."
                    disabled={isBuilding || gameMode !== 'build'}
                    autoComplete="off"
                    aria-describedby={isBuilding ? 'build-status' : undefined}
                  />
                  <button
                    type="submit"
                    disabled={isBuilding || gameMode !== 'build' || !prompt.trim()}
                    aria-label={isBuilding ? 'Building fortress...' : 'Generate fortress with AI'}
                    title="Generate fortress with AI"
                    className="game-prompt-submit"
                  >
                    {isBuilding ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
                  </button>
                </form>

                {buildStatus.status !== 'idle' && (
                  <div
                    id="build-status"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className={`game-build-status flex items-center gap-2
                      ${buildStatus.status === 'error'
                        ? 'bg-[rgba(192,57,43,0.15)] border-[rgba(192,57,43,0.3)] text-[var(--crimson)]'
                        : buildStatus.status === 'success'
                          ? 'bg-[rgba(39,174,96,0.15)] border-[rgba(39,174,96,0.3)] text-[var(--emerald)]'
                          : 'bg-[rgba(255,215,0,0.1)] border-[var(--border-medium)] text-[var(--gold)]'
                      }`}
                  >
                    {isBuilding && <Loader2 size={14} className="animate-spin shrink-0" aria-hidden="true" />}
                    {buildStatus.status === 'success' && <CheckCircle2 size={14} className="shrink-0" aria-hidden="true" />}
                    {buildStatus.status === 'error' && <AlertCircle size={14} className="shrink-0" aria-hidden="true" />}
                    <span className="text-xs font-mono truncate" title={buildStatus.message}>{buildStatus.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* Chat never consumes battlefield width, including on desktop. */}
            {showChat && !isSinglePlayer && (
              <div className="game-chat-modal" onClick={(e) => { if (e.target === e.currentTarget) setShowChat(false); }}>
                <div className="game-chat-window safe-area-bottom" role="dialog" aria-modal="true" aria-label="Battle chat">
                  <ChatPanel
                    messages={chatMessages}
                    onSend={sendChatMessage}
                    mySide={mySide}
                    mobile
                    onClose={closeChat}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
