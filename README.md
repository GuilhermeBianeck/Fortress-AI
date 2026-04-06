# Fortress AI

**Real-time multiplayer 2D physics-based strategy game.** Design fortresses with AI prompts, then engage in turn-based cannon combat.

**Live at [fortressbattle.com](https://www.fortressbattle.com)**

## How It Works

1. **Build Phase (90s)** — Describe your fortress to AI ("build a stone castle with towers") or place blocks manually. The AI uses Google Gemini to generate fortress structures from natural language.
2. **Reveal Phase (5s)** — Camera pans across the battlefield showing both fortresses and any environmental hazards.
3. **Combat Phase** — Take turns firing your cannon to destroy the enemy's King. Aim with mouse/touch, adjust power, and fire. Physics simulation handles the rest.
4. **Best of 3** — First to destroy the enemy King wins a round. Win 2 rounds to claim victory.

## Features

- **AI Fortress Builder** — Describe any structure and Gemini 2.5 Flash builds it with up to 50 physics blocks
- **5 Materials** — Wood, stone, ice, rubber, steel — each with distinct physics properties and pixel art textures
- **Environmental Hazards** — Wind zones, lava pools, falling rocks affect gameplay
- **Multiplayer** — Private rooms with invite links, matchmaking queue, or solo vs Training Bot
- **Pixel Art Sprites** — 39 procedurally generated sprites for blocks, characters, terrain, and effects
- **Procedural Sound** — All sound effects synthesized via Web Audio API (zero audio files)
- **Debug Overlay** — Press `` ` `` or add `?debug=1` to URL for real-time FPS, network, and render stats
- **Analytics** — Built-in funnel tracking with `/api/stats` endpoint
- **Mobile Support** — Touch aiming, responsive layout, portrait and landscape

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS 4 |
| Game Rendering | Canvas 2D with pixel art sprites, particle system, animated effects |
| State | Zustand (client), Socket.io (real-time sync) |
| Backend | Express 5, Socket.io, TypeScript |
| Physics | Matter.js (server-authoritative, 60Hz simulation, 20Hz broadcast) |
| AI | Google Gemini 2.5 Flash with structured JSON output + Zod validation |
| Testing | Playwright E2E (game flow, performance, visual regression, mobile) |

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Create server environment
cp server/.env.example server/.env
# Edit server/.env and set your GEMINI_API_KEY
```

### Development

Run both servers simultaneously:

```bash
# Terminal 1 — Backend (port 3001)
cd server
npm run dev

# Terminal 2 — Frontend (port 5173)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Production Build

```bash
# Frontend
npm run build

# Server
cd server
npm run build
npm start
```

## Project Structure

```
src/
  components/
    GameCanvas.tsx        Canvas 2D renderer (terrain, bodies, HUD, minimap, particles)
    Lobby.tsx             Landing page, room creation, matchmaking
    PhaseOverlay.tsx      Phase banners, timers, result screen
    ChatPanel.tsx         In-game chat
    GodTools.tsx          Block placement toolbar
  hooks/
    useGameState.ts       Socket.io connection, all game state
  sprites/
    SpriteLoader.ts       Async manifest-based sprite loader
    AnimatedSprite.ts     Frame-based animation state machine
  effects/
    particles.ts          Material-specific particle system (pool-based, zero allocation)
  audio/
    SoundManager.ts       Procedural Web Audio API sound effects
  analytics/
    tracker.ts            Lightweight event tracking via sendBeacon
  debug/
    debugStats.ts         Real-time FPS, network, memory stats

server/
  index.ts                Express + Socket.io server
  game/
    RoomManager.ts        Room lifecycle, matchmaking, rematch
    GameSession.ts        Per-room physics world, combat, AI building
    MatchStateMachine.ts  Phase transitions (BUILD -> REVEAL -> COMBAT -> RESULT)
    BotAI.ts              Training bot
    ScoreManager.ts       Damage tracking, performance grading
  physics/
    world.ts              Matter.js world setup
    loop.ts               60Hz fixed timestep, 20Hz delta-encoded broadcast
    terrain.ts            Procedural terrain via seeded noise
    hazards.ts            Wind, lava, falling rocks
  ai/
    gemini.ts             Gemini API integration
    schema.ts             Zod validation for AI responses
    prompts.ts            System prompt with terrain context
    overlap.ts            AABB collision resolution for block placement
  analytics/
    events.ts             Event ingestion + /api/stats endpoint

scripts/
  generate-sprites.ts     Procedural pixel art generator (39 sprites)

public/sprites/           Generated PNG sprites
tests/e2e/                Playwright test suite
```

## Environment Variables

### Server (`server/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3001) | No |
| `GEMINI_API_KEY` | Google Gemini API key for AI fortress generation | Yes |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (default: localhost) | Production |
| `ADMIN_KEY` | Key for accessing `/api/stats` endpoint | Production |

## Commands

```bash
npm run dev              # Vite dev server
npm run build            # TypeScript + Vite production build
npm run lint             # ESLint
npm run generate:sprites # Regenerate all 39 pixel art sprites
npm run test:e2e         # Run Playwright E2E tests
npm run test:e2e:headed  # Run tests with visible browser
```

## Architecture

### Client-Server Model

The server owns all physics simulation. The client is a renderer — it receives delta-encoded state snapshots at 20Hz over Socket.io and draws them on a Canvas 2D element with interpolation between snapshots. No client-side physics prediction.

### Game World

- **2400px wide** (1200px per player side)
- **600px tall** canvas viewport
- **Procedural terrain** via seeded multi-octave noise
- **5 material types** with distinct density, friction, restitution, and HP

### AI Pipeline

1. Player submits a natural language prompt
2. Server calls Gemini 2.5 Flash with terrain-aware system prompt
3. Response validated against Zod schema (max 50 blocks, bounded coordinates)
4. AABB collision resolution shifts overlapping blocks
5. Validated blocks spawned into the Matter.js world

### Security

- CORS locked to allowed origins
- API keys never forwarded in error messages
- Socket.io message size capped at 100KB
- AI prompts sanitized (500 char limit)
- Analytics endpoints rate-limited and auth-protected
- Player names sanitized server-side
- Input validation on all game events

## License

MIT
