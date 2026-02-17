import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useGameState } from './hooks/useGameState';
import { GameCanvas } from './components/GameCanvas';
import { GodTools } from './components/GodTools';
import { Bot, Terminal, Send, Key, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { MaterialType, ShapeType, GameMode } from './types';

function App() {
  const {
    gameState, terrain, buildStatus, kingHp, kingMaxHp,
    spawnBox, requestBuild, clearWorld, fireProjectile,
    setBlockDestroyedCallback, setProjectileImpactCallback,
  } = useGameState();

  // God Tools state
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialType>('wood');
  const [selectedShape, setSelectedShape] = useState<ShapeType>('rectangle');
  const [gameMode, setGameMode] = useState<GameMode>('build');

  // AI Architect state
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('fortress_api_key') || '');
  const [prompt, setPrompt] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Tab key to toggle mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setGameMode(prev => prev === 'build' ? 'fire' : 'build');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-rose-500/30">
      {/* Header */}
      <header className="p-4 sm:p-6 border-b border-white/10 flex justify-between items-center bg-black/20 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-rose-600 p-2 rounded-lg">
            <Bot size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">FORTRESS AI</h1>
            <div className="text-xs text-neutral-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              ONLINE
            </div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {/* API Key toggle */}
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 flex items-center gap-2
                       ${apiKey ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border border-amber-500/20'}
                       hover:bg-white/10`}
          >
            <Key size={14} />
            <span className="hidden sm:inline">{apiKey ? 'Key Set' : 'Set API Key'}</span>
          </button>
        </div>
      </header>

      <main className="flex flex-col items-center justify-center p-4 sm:p-8 gap-4">
        {/* API Key Input (collapsible) */}
        {showApiKey && (
          <div className="w-full max-w-[800px] bg-black/60 border border-white/10 rounded-xl p-4 backdrop-blur-sm animate-in slide-in-from-top-2">
            <label className="text-xs text-neutral-400 mb-2 block">Gemini API Key (stored locally, never sent to our servers)</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 bg-neutral-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 transition-all font-mono"
              />
              <button
                onClick={() => setShowApiKey(false)}
                className="px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-500 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Build Status Overlay */}
        {buildStatus.status !== 'idle' && (
          <div className={`w-full max-w-[800px] border rounded-xl p-3 backdrop-blur-sm flex items-center gap-3 transition-all
            ${buildStatus.status === 'error'
              ? 'bg-red-500/10 border-red-500/20 text-red-300'
              : buildStatus.status === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-violet-500/10 border-violet-500/20 text-violet-300'
            }`}
          >
            {isBuilding && <Loader2 size={16} className="animate-spin" />}
            {buildStatus.status === 'success' && <CheckCircle2 size={16} />}
            {buildStatus.status === 'error' && <AlertCircle size={16} />}
            <span className="text-sm font-mono truncate">{buildStatus.message}</span>
          </div>
        )}

        {/* God Tools */}
        <GodTools
          selectedMaterial={selectedMaterial}
          selectedShape={selectedShape}
          onMaterialChange={setSelectedMaterial}
          onShapeChange={setSelectedShape}
          onClear={clearWorld}
          gameMode={gameMode}
          onModeChange={setGameMode}
        />

        {/* Game Canvas */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-rose-600 to-violet-600 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 pointer-events-none"></div>
          <GameCanvas
            gameState={gameState}
            terrain={terrain}
            onSpawn={handleSpawn}
            kingHp={kingHp}
            kingMaxHp={kingMaxHp}
            gameMode={gameMode}
            onFire={fireProjectile}
            setBlockDestroyedCallback={setBlockDestroyedCallback}
            setProjectileImpactCallback={setProjectileImpactCallback}
          />
        </div>

        {/* Prompt Input — only in build mode */}
        {gameMode === 'build' && (
          <form onSubmit={handleSubmitPrompt} className="w-full max-w-[800px] bg-black/40 border border-white/10 rounded-xl p-3 flex gap-3 backdrop-blur-sm">
            <div className="p-2.5 bg-neutral-900 rounded-lg shrink-0">
              <Terminal size={18} className="text-neutral-400" />
            </div>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your fortress... (e.g., 'Build a stone tower with a wood base')"
              className="w-full bg-transparent outline-none text-neutral-200 placeholder:text-neutral-600 font-mono text-sm"
              disabled={isBuilding}
            />
            <button
              type="submit"
              disabled={isBuilding || !prompt.trim()}
              className="p-2.5 bg-rose-600 rounded-lg shrink-0 hover:bg-rose-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isBuilding ? <Loader2 size={18} className="animate-spin text-white" /> : <Send size={18} className="text-white" />}
            </button>
          </form>
        )}

        {/* Fire mode hint */}
        {gameMode === 'fire' && (
          <div className="text-xs text-neutral-500 font-mono">
            Drag on canvas to aim &amp; fire &middot; Arrow keys to fine-tune &middot; Tab to switch mode
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
