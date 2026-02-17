import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useGameState } from './hooks/useGameState';
import { GameCanvas } from './components/GameCanvas';
import { GodTools } from './components/GodTools';
import { Lobby } from './components/Lobby';
import { PhaseOverlay } from './components/PhaseOverlay';
import { ChatPanel } from './components/ChatPanel';
import { Bot, Terminal, Send, Key, Loader2, CheckCircle2, AlertCircle, MessageCircle } from 'lucide-react';
import type { MaterialType, ShapeType, GameMode } from './types';

function App() {
  const {
    gameState, terrain, buildStatus, kingsHp,
    roomState, phase, phaseEndsAt, turnPlayer, matchResult, queuePosition,
    chatMessages, rematchState, roundScore, currentRound, hazards,
    createRoom, joinRoom, joinQueue, leaveQueue, playerReady,
    spawnBox, requestBuild, fireProjectile,
    sendChatMessage, requestRematch,
    setBlockDestroyedCallback, setProjectileImpactCallback,
  } = useGameState();

  // God Tools state
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialType>('wood');
  const [selectedShape, setSelectedShape] = useState<ShapeType>('rectangle');
  const [gameMode, setGameMode] = useState<GameMode>('build');
  const [showChat, setShowChat] = useState(false);

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

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    localStorage.setItem('fortress_api_key', value);
  };

  const handleSpawn = (x: number, y: number) => {
    spawnBox(x, y, selectedMaterial, selectedShape);
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

  // Build name map: left/right → name
  const playerNamesMap = roomState ? {
    [roomState.side]: roomState.myName || playerName || 'You',
    [roomState.side === 'left' ? 'right' : 'left']: roomState.opponentName || 'Opponent',
  } as { left: string; right: string } : { left: 'Player 1', right: 'Player 2' };

  return (
    <div className="h-screen bg-neutral-950 text-white font-sans selection:bg-rose-500/30 flex flex-col overflow-hidden">
      {/* Header — hidden on mobile when in-game */}
      <header className={`px-4 py-2 border-b border-white/10 flex justify-between items-center bg-black/20 backdrop-blur-md sticky top-0 z-50 ${inGame ? 'hidden sm:flex' : ''}`}>
        <div className="flex items-center gap-2">
          <div className="bg-rose-600 p-1.5 rounded-lg">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">FORTRESS AI</h1>
            <div className="text-[10px] text-neutral-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {inGame && roomState ? `Room: ${roomState.roomId}` : 'ONLINE'}
            </div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {/* Chat toggle (mobile only, in-game) */}
          {inGame && (
            <button
              onClick={() => setShowChat(!showChat)}
              className={`xl:hidden px-2 py-1.5 text-sm rounded-lg transition-colors duration-200 touch-manipulation
                border flex items-center gap-1.5
                ${showChat
                  ? 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                  : 'bg-neutral-800 border-white/10 hover:bg-neutral-700 active:bg-neutral-900 text-white'
                }`}
            >
              <MessageCircle size={14} />
              <span className="hidden sm:inline text-xs">Chat</span>
              {chatMessages.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              )}
            </button>
          )}
          {/* API Key toggle */}
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg transition-colors duration-200 touch-manipulation flex items-center gap-1.5
                       ${apiKey ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border border-amber-500/20'}
                       hover:bg-white/10 active:bg-white/15`}
          >
            <Key size={14} />
            <span className="hidden sm:inline">{apiKey ? 'Key Set' : 'Set API Key'}</span>
          </button>
        </div>
      </header>

      <main className={`flex-1 flex flex-col items-center overflow-x-hidden overflow-y-auto min-h-0 ${inGame ? 'sm:p-3 sm:gap-3' : ''}`}>
        {/* API Key Input (collapsible) */}
        {showApiKey && (
          <div className="w-full bg-black/60 border border-white/10 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
            <label className="text-xs text-neutral-400 mb-2 block">Gemini API Key (stored locally)</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 min-w-0 bg-neutral-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-rose-500/50 transition-all font-mono"
              />
              <button
                onClick={() => setShowApiKey(false)}
                className="shrink-0 px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-500 active:bg-rose-700
                    transition-colors duration-200 touch-manipulation"
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
          />
        ) : (
          /* Mobile: fill the entire screen. Desktop: constrained 4:3. */
          <div className="flex flex-col items-center flex-1 w-full relative
                          sm:gap-3 sm:max-w-none"
               style={{ maxWidth: 'calc((100vh - 10rem) * 4 / 3)' }}>

            {/* === Mobile: Canvas fills screen, overlays on top === */}
            {/* Canvas container */}
            <div className="flex gap-4 items-start w-full justify-center flex-1 sm:flex-initial">
              <div className="relative group flex-1 min-w-0 sm:flex-initial sm:w-full">
                {/* Glow border — desktop only */}
                <div className="absolute -inset-1 bg-gradient-to-r from-rose-600 to-violet-600 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 pointer-events-none hidden sm:block"></div>
                <div className="relative h-full">
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
                    playerNames={playerNamesMap}
                    hazards={hazards}
                    roundScore={roundScore}
                    currentRound={currentRound}
                  />
                  {/* Phase overlay — on top of canvas */}
                  {phase && (
                    <div className={`absolute inset-x-0 z-10 flex justify-center pointer-events-none ${
                      phase === 'result' ? 'inset-0 items-center' : 'top-0 pt-2'
                    }`}>
                      <div className="pointer-events-auto">
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
                          hazards={hazards}
                        />
                      </div>
                    </div>
                  )}

                  {/* Mobile: God Tools overlaid at bottom of canvas */}
                  {phase === 'build' && (
                    <div className="absolute bottom-0 inset-x-0 z-10 p-1.5 sm:hidden pointer-events-auto">
                      <GodTools
                        selectedMaterial={selectedMaterial}
                        selectedShape={selectedShape}
                        onMaterialChange={setSelectedMaterial}
                        onShapeChange={setSelectedShape}
                        gameMode={gameMode}
                        onModeChange={setGameMode}
                        phase={phase}
                        onReady={playerReady}
                      />
                    </div>
                  )}

                  {/* Mobile: Chat + menu buttons overlay top-right */}
                  <div className="absolute top-1 right-1 z-10 flex gap-1 sm:hidden">
                    <button
                      onClick={() => setShowChat(!showChat)}
                      className="p-1.5 bg-black/60 border border-white/10 rounded-lg touch-manipulation"
                    >
                      <MessageCircle size={14} className="text-white" />
                    </button>
                  </div>
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

            {/* Desktop: God Tools (build phase only) — above canvas on sm+ */}
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
                />
              </div>
            )}

            {/* Build Status Overlay */}
            {buildStatus.status !== 'idle' && (
              <div className={`w-full border rounded-xl p-2 sm:p-3 backdrop-blur-sm flex items-center gap-2 sm:gap-3 transition-all order-first
                ${buildStatus.status === 'error'
                  ? 'bg-red-500/10 border-red-500/20 text-red-300'
                  : buildStatus.status === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-violet-500/10 border-violet-500/20 text-violet-300'
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
              <div className="fixed inset-0 z-50 xl:hidden flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowChat(false); }}>
                <div className="w-full max-w-md mb-0 sm:mb-4">
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
              <form onSubmit={handleSubmitPrompt} className="w-full bg-black/40 border border-white/10 rounded-xl p-2 sm:p-3 flex gap-2 sm:gap-3 backdrop-blur-sm hidden sm:flex">
                <div className="p-2 sm:p-2.5 bg-neutral-900 rounded-lg shrink-0">
                  <Terminal size={16} className="text-neutral-400" />
                </div>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your fortress..."
                  className="w-full min-w-0 bg-transparent outline-none text-neutral-200 placeholder:text-neutral-600 font-mono text-xs sm:text-sm"
                  disabled={isBuilding}
                />
                <button
                  type="submit"
                  disabled={isBuilding || !prompt.trim()}
                  className="p-2 sm:p-2.5 bg-rose-600 rounded-lg shrink-0 hover:bg-rose-500 active:bg-rose-700
                      transition-colors duration-200 touch-manipulation
                      disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isBuilding ? <Loader2 size={16} className="animate-spin text-white" /> : <Send size={16} className="text-white" />}
                </button>
              </form>
            )}

            {/* Combat hint — desktop only */}
            {phase === 'combat' && turnPlayer === mySide && (
              <div className="hidden sm:block text-[10px] sm:text-xs text-neutral-500 font-mono text-center">
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
