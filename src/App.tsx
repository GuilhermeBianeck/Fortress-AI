import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useGameState } from './hooks/useGameState';
import { GameCanvas } from './components/GameCanvas';
import { GodTools, MobileDoneButton } from './components/GodTools';
import { Lobby } from './components/Lobby';
import { PhaseOverlay } from './components/PhaseOverlay';
import { ChatPanel } from './components/ChatPanel';
import { RankBadge } from './components/RankBadge';
import { Terminal, Send, Key, Loader2, CheckCircle2, AlertCircle, MessageCircle, WifiOff } from 'lucide-react';
import type { MaterialType, ShapeType, GameMode } from './types';
import { getRankTier } from './types';

function App() {
  const {
    gameState, terrain, buildStatus, kingsHp,
    roomState, phase, phaseEndsAt, turnPlayer, matchResult, queuePosition,
    chatMessages, rematchState, roundScore, currentRound, hazards,
    matchScores, playerProfile, prevPlayerProfile, isConnected,
    createRoom, joinRoom, joinQueue, leaveQueue, playerReady,
    spawnBox, requestBuild, fireProjectile,
    sendChatMessage, requestRematch, getProfile, returnToLobby,
    setBlockDestroyedCallback, setProjectileImpactCallback, setKingDamageCallback,
  } = useGameState();

  // God Tools state
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialType>('wood');
  const [selectedShape, setSelectedShape] = useState<ShapeType>('rectangle');
  const [gameMode, setGameMode] = useState<GameMode>('build');
  const [showChat, setShowChat] = useState(false);
  const [spawnCount, setSpawnCount] = useState(0);

  // Player name state (persisted)
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('fortress_player_name') || '');
  const handlePlayerNameChange = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('fortress_player_name', name);
  };

  // AI Architect state
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('fortress_api_key') || '');
  const [prompt, setPrompt] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showRankPanel, setShowRankPanel] = useState(false);

  // Determine screen: lobby or game
  const inGame = phase !== 'lobby';

  // Tab key to toggle mode (only during build phase)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        if (phase === 'build') {
          e.preventDefault();
          setGameMode(prev => prev === 'build' ? 'fire' : 'build');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase]);

  // Reset spawn counter when build phase starts
  useEffect(() => {
    if (phase === 'build') {
      setSpawnCount(0);
    }
  }, [phase]);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    localStorage.setItem('fortress_api_key', value);
  };

  const handleSpawn = (x: number, y: number) => {
    spawnBox(x, y, selectedMaterial, selectedShape);
    setSpawnCount(c => c + 1);
  };

  const handleSubmitPrompt = (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    if (!apiKey.trim()) {
      setShowApiKey(true);
      return;
    }

    requestBuild(apiKey, prompt);
    setPrompt('');
  };

  const isBuilding = buildStatus.status === 'generating' || buildStatus.status === 'building';
  const mySide = roomState?.side ?? 'left';
  const myRank = playerProfile ? getRankTier(playerProfile.totalScore) : null;

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
    <div className="h-[100dvh] text-[var(--text-primary)] selection:bg-amber-300/20 flex flex-col overflow-hidden safe-area-top" style={{ fontFamily: "'Inter', 'Cinzel', Georgia, serif", background: 'var(--bg-deepest)' }}>
      {/* Header — hidden on mobile when in-game */}
      <header className={`px-4 py-2.5 border-b border-[var(--border-subtle)] flex justify-between items-center backdrop-blur-md sticky top-0 z-50 ${inGame ? 'hidden sm:flex' : ''}`} style={{ background: 'rgba(10, 10, 18, 0.9)', boxShadow: '0 1px 0 rgba(255,215,0,0.08), 0 2px 16px rgba(0,0,0,0.4)' }}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg shrink-0" style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.25), rgba(255,215,0,0.06))', border: '1px solid rgba(255,215,0,0.2)' }}>
            <img src="/favicon.svg" alt="Fortress AI" width={20} height={20} className="block" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-[var(--gold)] font-heading leading-none">FORTRESS AI</h1>
            <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--emerald)] animate-pulse shrink-0"></span>
              <span className="font-mono">{inGame && roomState ? `Room: ${roomState.roomId}` : 'LIVE'}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {/* Rank indicator (non-game, desktop) */}
          {!inGame && myRank && (
            <button
              onClick={() => setShowRankPanel(!showRankPanel)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all duration-200 hover:bg-[var(--bg-elevated)]"
              style={{ borderColor: `${myRank.color}44`, background: `${myRank.color}0d` }}
              title="Your Rank"
            >
              <span className="text-sm">{myRank.emoji}</span>
              <span className="text-xs font-bold" style={{ color: myRank.color }}>{myRank.name}</span>
            </button>
          )}
          {/* Chat toggle (mobile only, in-game) */}
          {inGame && (
            <button
              onClick={() => setShowChat(!showChat)}
              className={`xl:hidden min-w-[44px] min-h-[44px] px-2 py-1.5 text-sm rounded-lg transition-all duration-200 touch-manipulation
                border flex items-center justify-center gap-1.5
                ${showChat
                  ? 'bg-[var(--bg-elevated)] border-[var(--border-accent)] text-[var(--gold)]'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                }`}
            >
              <MessageCircle size={16} />
              <span className="hidden sm:inline text-xs">Chat</span>
              {chatMessages.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--ember)]"></span>
              )}
            </button>
          )}
          {/* API Key toggle */}
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className={`min-w-[44px] min-h-[44px] px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg transition-all duration-200 touch-manipulation flex items-center justify-center gap-1.5
                       ${apiKey
              ? 'text-[var(--emerald)] bg-[rgba(39,174,96,0.1)] border border-[rgba(39,174,96,0.3)]'
              : 'text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]'
            }
                       hover:bg-[var(--bg-elevated)]`}
          >
            <Key size={14} />
            <span className="hidden sm:inline">{apiKey ? 'Key Set' : 'Set API Key'}</span>
          </button>
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
        <div className="w-full px-3 py-2 flex items-center justify-between gap-2 animate-slide-up z-50"
          style={{ background: 'rgba(192,57,43,0.2)', borderBottom: '1px solid rgba(192,57,43,0.4)' }}>
          <div className="flex items-center gap-2 text-xs text-[var(--crimson)]">
            <WifiOff size={14} className="shrink-0" />
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

      <main className={`flex-1 flex flex-col items-center overflow-x-hidden overflow-y-auto min-h-0 ${inGame ? 'sm:p-3 sm:gap-3' : ''}`}>
        {/* API Key Input (collapsible) */}
        {showApiKey && (
          <div className="w-full card-dark rounded-xl p-3 sm:p-4">
            <label className="text-xs text-[var(--text-muted)] mb-2 block">Gemini API Key (stored locally)</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="AIzaSy..."
                className="input-medieval flex-1 min-w-0 rounded-lg px-3 py-2 text-sm font-mono"
              />
              <button
                onClick={() => setShowApiKey(false)}
                className="btn-primary shrink-0 min-h-[44px] px-4 py-2 rounded-lg text-sm"
              >
                Save
              </button>
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
          />
        ) : (
          /* Desktop: constrained 4:3. Mobile: full width, fills available height. */
          <div className="flex flex-col items-center flex-1 w-full sm:gap-3 game-container safe-area-bottom">

            {/* Canvas + Chat row */}
            <div className="flex flex-1 sm:flex-initial gap-4 items-stretch sm:items-start w-full justify-center">
              <div className="relative group flex-1 min-w-0">
                {/* Glow border — desktop only */}
                <div className="absolute -inset-1 bg-gradient-to-r from-[var(--gold)] to-[var(--ember)] rounded-xl blur opacity-10 group-hover:opacity-20 transition duration-1000 pointer-events-none hidden sm:block"></div>
                <div className="relative h-full sm:h-auto">
                  <GameCanvas
                    gameState={gameState}
                    terrain={terrain}
                    onSpawn={handleSpawn}
                    kingsHp={kingsHp}
                    mySide={mySide}
                    gameMode={gameMode}
                    phase={phase}
                    turnPlayer={turnPlayer}
                    onFire={fireProjectile}
                    setBlockDestroyedCallback={setBlockDestroyedCallback}
                    setProjectileImpactCallback={setProjectileImpactCallback}
                    setKingDamageCallback={setKingDamageCallback}
                    playerNames={playerNamesMap}
                    hazards={hazards}
                    roundScore={roundScore}
                    currentRound={currentRound}
                  />
                  {/* Phase overlay — on top of canvas */}
                  {phase && (
                    <div className={`absolute inset-x-0 z-10 flex justify-center pointer-events-none ${phase === 'result' ? 'inset-0 items-center' : 'top-0 pt-1 sm:pt-2'
                      }`}>
                      <div className="pointer-events-auto max-w-[calc(100%-5rem)] sm:max-w-none">
                        <PhaseOverlay
                          phase={phase}
                          phaseEndsAt={phaseEndsAt}
                          turnPlayer={turnPlayer}
                          mySide={mySide}
                          matchResult={matchResult}
                          playerNames={playerNamesMap}
                          roundScore={roundScore}
                          currentRound={currentRound}
                          rematchState={rematchState}
                          onRequestRematch={requestRematch}
                          onReturnToLobby={returnToLobby}
                          hazards={hazards}
                          matchScores={matchScores}
                          playerProfile={playerProfile}
                          prevTotalScore={prevTotalScore}
                          prevPlayerProfile={prevPlayerProfile}
                        />
                      </div>
                    </div>
                  )}

                  {/* Mobile: Chat button — top-right, moved down to clear header */}
                  <div className="absolute top-20 right-1 z-20 sm:hidden">
                    <button
                      onClick={() => setShowChat(!showChat)}
                      className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg touch-manipulation border
                        ${showChat
                          ? 'bg-[var(--bg-elevated)] border-[var(--border-accent)]'
                          : 'bg-[rgba(10,10,18,0.6)] border-[var(--border-subtle)] active:bg-[var(--bg-elevated)]'
                        }`}
                    >
                      <MessageCircle size={18} className="text-[var(--gold)]" />
                      {chatMessages.length > 0 && (
                        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[var(--ember)]"></span>
                      )}
                    </button>
                  </div>

                  {/* Mobile: Done button - moved down below centered banner */}
                  {phase === 'build' && (
                    <div className="absolute top-[60px] inset-x-0 z-10 flex justify-center sm:hidden pointer-events-none">
                      <div className="pointer-events-auto">
                        <MobileDoneButton phase={phase} onReady={playerReady} />
                      </div>
                    </div>
                  )}

                  {/* Mobile: God Tools overlaid at bottom of canvas (with spacing) */}
                  {phase === 'build' && (
                    <div className="absolute bottom-2 inset-x-0 z-10 p-1.5 sm:hidden pointer-events-auto safe-area-bottom">
                      <GodTools
                        selectedMaterial={selectedMaterial}
                        selectedShape={selectedShape}
                        onMaterialChange={setSelectedMaterial}
                        onShapeChange={setSelectedShape}
                        gameMode={gameMode}
                        onModeChange={setGameMode}
                        phase={phase}
                        onReady={playerReady}
                        blockCount={spawnCount}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Chat — visible on xl screens, toggleable overlay on smaller */}
              <div className="hidden xl:block">
                <ChatPanel
                  messages={chatMessages}
                  onSend={sendChatMessage}
                  mySide={mySide}
                />
              </div>
            </div>

            {/* Desktop: God Tools (build phase only) */}
            {phase === 'build' && (
              <div className="hidden sm:block w-full order-first">
                <GodTools
                  selectedMaterial={selectedMaterial}
                  selectedShape={selectedShape}
                  onMaterialChange={setSelectedMaterial}
                  onShapeChange={setSelectedShape}
                  gameMode={gameMode}
                  onModeChange={setGameMode}
                  phase={phase}
                  onReady={playerReady}
                  blockCount={spawnCount}
                />
              </div>
            )}

            {/* Build Status Overlay */}
            {buildStatus.status !== 'idle' && (
              <div className={`w-full border rounded-xl p-2 sm:p-3 backdrop-blur-sm flex items-center gap-2 sm:gap-3 transition-all order-first
                ${buildStatus.status === 'error'
                  ? 'bg-[rgba(192,57,43,0.15)] border-[rgba(192,57,43,0.3)] text-[var(--crimson)]'
                  : buildStatus.status === 'success'
                    ? 'bg-[rgba(39,174,96,0.15)] border-[rgba(39,174,96,0.3)] text-[var(--emerald)]'
                    : 'bg-[rgba(255,215,0,0.1)] border-[var(--border-medium)] text-[var(--gold)]'
                }`}
              >
                {isBuilding && <Loader2 size={14} className="animate-spin shrink-0" />}
                {buildStatus.status === 'success' && <CheckCircle2 size={14} className="shrink-0" />}
                {buildStatus.status === 'error' && <AlertCircle size={14} className="shrink-0" />}
                <span className="text-xs sm:text-sm font-mono truncate">{buildStatus.message}</span>
              </div>
            )}

            {/* Mobile chat overlay */}
            {showChat && (
              <div className="fixed inset-0 z-50 xl:hidden flex items-end justify-center bg-[rgba(10,10,18,0.7)] backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowChat(false); }}>
                <div className="w-full max-w-md mb-0 sm:mb-4 safe-area-bottom">
                  <ChatPanel
                    messages={chatMessages}
                    onSend={sendChatMessage}
                    mySide={mySide}
                    mobile
                    onClose={() => setShowChat(false)}
                  />
                </div>
              </div>
            )}

            {/* Prompt Input — only in build mode during build phase */}
            {phase === 'build' && gameMode === 'build' && (
              <form onSubmit={handleSubmitPrompt} className="w-full card-dark rounded-xl p-2 sm:p-3 flex gap-2 sm:gap-3">
                <div className="p-2 sm:p-2.5 bg-[var(--bg-deep)] rounded-lg shrink-0">
                  <Terminal size={16} className="text-[var(--gold)]" />
                </div>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your fortress to AI..."
                  className="w-full min-w-0 bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono text-xs sm:text-sm"
                  disabled={isBuilding}
                />
                <button
                  type="submit"
                  disabled={isBuilding || !prompt.trim()}
                  className="p-2 sm:p-2.5 bg-gradient-to-b from-[var(--gold)] to-[var(--gold-dim)] rounded-lg shrink-0
                      transition-all duration-200 touch-manipulation shadow-md shadow-[var(--gold-glow)]
                      disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-lg"
                >
                  {isBuilding ? <Loader2 size={16} className="animate-spin text-[var(--bg-deepest)]" /> : <Send size={16} className="text-[var(--bg-deepest)]" />}
                </button>
              </form>
            )}

            {/* Combat hint — desktop only (mobile hint is shown in PhaseOverlay) */}
            {phase === 'combat' && turnPlayer === mySide && (
              <div className="hidden sm:block text-[10px] sm:text-xs text-[var(--text-muted)] font-mono text-center">
                Drag to aim &amp; fire &middot; Scroll / &uarr;&darr; to adjust power &middot; &larr;&rarr; to adjust angle &middot; Space to fire &middot; A/D to pan
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
