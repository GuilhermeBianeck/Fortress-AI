import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useGameState } from './hooks/useGameState';
import { GameCanvas } from './components/GameCanvas';
import { GodTools, MobileDoneButton } from './components/GodTools';
import { Lobby } from './components/Lobby';
import { PhaseOverlay } from './components/PhaseOverlay';
import { ChatPanel } from './components/ChatPanel';
import { Terminal, Send, Key, Loader2, CheckCircle2, AlertCircle, MessageCircle } from 'lucide-react';
import type { MaterialType, ShapeType, GameMode } from './types';

function App() {
  const {
    gameState, terrain, buildStatus, kingsHp,
    roomState, phase, phaseEndsAt, turnPlayer, matchResult, queuePosition,
    chatMessages, rematchState, roundScore, currentRound, hazards,
    matchScores, playerProfile,
    createRoom, joinRoom, joinQueue, leaveQueue, playerReady,
    spawnBox, requestBuild, fireProjectile,
    sendChatMessage, requestRematch, getProfile,
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
    <div className="h-[100dvh] bg-[#fdf6e3] text-[#3d2b14] selection:bg-amber-300/40 flex flex-col overflow-hidden safe-area-top" style={{ fontFamily: "'Cinzel', Georgia, serif" }}>
      {/* Header — hidden on mobile when in-game */}
      <header className={`px-4 py-2 border-b border-amber-300/50 flex justify-between items-center bg-gradient-to-r from-[#faf0d7]/95 via-[#fff8e7]/95 to-[#faf0d7]/95 backdrop-blur-md sticky top-0 z-50 ${inGame ? 'hidden sm:flex' : ''}`}>
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-br from-amber-400 to-amber-500 p-1.5 rounded-lg shadow-md shadow-amber-400/30">
            <span className="text-xl">🏰</span>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-amber-800" style={{ fontFamily: "'MedievalSharp', cursive" }}>FORTRESS AI</h1>
            <div className="text-[10px] text-amber-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              {inGame && roomState ? `Room: ${roomState.roomId}` : 'ONLINE'}
            </div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {/* Chat toggle (mobile only, in-game) */}
          {inGame && (
            <button
              onClick={() => setShowChat(!showChat)}
              className={`xl:hidden min-w-[44px] min-h-[44px] px-2 py-1.5 text-sm rounded-lg transition-colors duration-200 touch-manipulation
                border flex items-center justify-center gap-1.5
                ${showChat
                  ? 'bg-amber-200/60 border-amber-400/50 text-amber-700'
                  : 'bg-white/60 border-amber-300/40 hover:bg-amber-100/60 active:bg-amber-200/60 text-amber-700'
                }`}
            >
              <MessageCircle size={16} />
              <span className="hidden sm:inline text-xs">Chat</span>
              {chatMessages.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              )}
            </button>
          )}
          {/* API Key toggle */}
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className={`min-w-[44px] min-h-[44px] px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg transition-colors duration-200 touch-manipulation flex items-center justify-center gap-1.5
                       ${apiKey ? 'text-green-700 bg-green-100/60 border border-green-300/50' : 'text-amber-600 bg-amber-100/60 border border-amber-300/50'}
                       hover:bg-amber-200/40 active:bg-amber-200/60`}
          >
            <Key size={14} />
            <span className="hidden sm:inline">{apiKey ? 'Key Set' : 'Set API Key'}</span>
          </button>
        </div>
      </header>

      <main className={`flex-1 flex flex-col items-center overflow-x-hidden overflow-y-auto min-h-0 ${inGame ? 'sm:p-3 sm:gap-3' : ''}`}>
        {/* API Key Input (collapsible) */}
        {showApiKey && (
          <div className="w-full bg-white/70 border border-amber-300/50 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
            <label className="text-xs text-amber-600 mb-2 block">Gemini API Key (stored locally)</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 min-w-0 bg-[#fdf6e3]/80 border border-amber-300/40 rounded-lg px-3 py-2 text-sm text-amber-900 placeholder:text-amber-400/60 outline-none focus:border-amber-500/60 transition-all font-mono"
              />
              <button
                onClick={() => setShowApiKey(false)}
                className="shrink-0 min-h-[44px] px-4 py-2 bg-gradient-to-b from-amber-400 to-amber-500 text-white text-sm font-medium rounded-lg hover:from-amber-500 hover:to-amber-600 active:from-amber-600 active:to-amber-700
                    transition-colors duration-200 touch-manipulation shadow-md shadow-amber-400/30"
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
            <div className="flex gap-4 items-start w-full justify-center">
              <div className="relative group flex-1 min-w-0">
                {/* Glow border — desktop only */}
                <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 to-amber-300 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000 pointer-events-none hidden sm:block"></div>
                <div className="relative">
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
                      phase === 'result' ? 'inset-0 items-center' : 'top-0 pt-1 sm:pt-2'
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
                          hazards={hazards}
                          matchScores={matchScores}
                        />
                      </div>
                    </div>
                  )}

                  {/* Mobile: Chat button — top-right, clear of HP bars, min 44px touch target */}
                  <div className="absolute top-1 right-1 z-20 sm:hidden">
                    <button
                      onClick={() => setShowChat(!showChat)}
                      className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg touch-manipulation border
                        ${showChat
                          ? 'bg-amber-200/50 border-amber-400/50'
                          : 'bg-white/60 border-amber-300/30 active:bg-amber-100/80'
                        }`}
                    >
                      <MessageCircle size={18} className="text-white" />
                      {chatMessages.length > 0 && (
                        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-500"></span>
                      )}
                    </button>
                  </div>

                  {/* Mobile: Done button — top-center, below phase overlay, properly sized for touch */}
                  {phase === 'build' && (
                    <div className="absolute top-10 inset-x-0 z-10 flex justify-center sm:hidden pointer-events-none">
                      <div className="pointer-events-auto">
                        <MobileDoneButton phase={phase} onReady={playerReady} />
                      </div>
                    </div>
                  )}

                  {/* Mobile: God Tools overlaid at bottom of canvas — above minimap */}
                  {phase === 'build' && (
                    <div className="absolute bottom-0 inset-x-0 z-10 p-1.5 sm:hidden pointer-events-auto safe-area-bottom">
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
                  ? 'bg-red-50/80 border-red-300/50 text-red-600'
                  : buildStatus.status === 'success'
                    ? 'bg-green-50/80 border-green-300/50 text-green-700'
                    : 'bg-amber-50/80 border-amber-300/50 text-amber-700'
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
              <div className="fixed inset-0 z-50 xl:hidden flex items-end justify-center bg-[#fdf6e3]/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowChat(false); }}>
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
              <form onSubmit={handleSubmitPrompt} className="w-full bg-white/60 border border-amber-300/40 rounded-xl p-2 sm:p-3 flex gap-2 sm:gap-3 backdrop-blur-sm hidden sm:flex">
                <div className="p-2 sm:p-2.5 bg-[#fdf6e3] rounded-lg shrink-0">
                  <Terminal size={16} className="text-amber-500" />
                </div>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your fortress..."
                  className="w-full min-w-0 bg-transparent outline-none text-amber-900 placeholder:text-amber-400/60 font-mono text-xs sm:text-sm"
                  disabled={isBuilding}
                />
                <button
                  type="submit"
                  disabled={isBuilding || !prompt.trim()}
                  className="p-2 sm:p-2.5 bg-gradient-to-b from-amber-400 to-amber-500 rounded-lg shrink-0 hover:from-amber-500 hover:to-amber-600 active:from-amber-600 active:to-amber-700
                      transition-colors duration-200 touch-manipulation shadow-md shadow-amber-400/30
                      disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isBuilding ? <Loader2 size={16} className="animate-spin text-white" /> : <Send size={16} className="text-white" />}
                </button>
              </form>
            )}

            {/* Combat hint — desktop only */}
            {phase === 'combat' && turnPlayer === mySide && (
              <div className="hidden sm:block text-[10px] sm:text-xs text-amber-500 font-mono text-center">
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
