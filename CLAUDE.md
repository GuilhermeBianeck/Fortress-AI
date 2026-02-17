# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fortress AI is a real-time multiplayer 2D physics-based strategy game where players use AI prompts to design fortresses, then engage in turn-based cannon combat. Built as a web app (and future mobile browser / Telegram Mini App) with separate frontend and backend. The game features private rooms, quick matchmaking, procedural terrain, environmental hazards, and best-of-3 rounds.

## Commands

### Frontend (run from repo root)
```bash
npm run dev        # Vite dev server at localhost:5173
npm run build      # TypeScript check + Vite production build
npm run lint       # ESLint across all TS/TSX
npm run preview    # Preview production build
```

### Backend (run from server/)
```bash
npm run dev        # ts-node dev server at localhost:3001
npm run build      # Compile TypeScript to dist/
npm run start      # Run compiled JS
```

Both servers must run simultaneously for development. Frontend connects to backend via Socket.io on port 3001.

## Tech Stack

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS 4, Zustand, Socket.io client, Matter.js, Lucide React
- **Backend:** Express 5, Socket.io, Matter.js, Google Gemini AI (`@google/generative-ai`), Zod 4
- **Physics:** Matter.js on both client (rendering) and server (simulation)

## Architecture

### Client-Server Split
The server owns all physics simulation (Matter.js world at 60 Hz). The client is a renderer — it receives state snapshots at 20 Hz over Socket.io and draws them on a 800×600 HTML canvas. There is no client-side physics prediction. The virtual world is 1600×600 pixels (800px per player side in 1v1).

### Game Flow
1. **Lobby** — Players create/join rooms or enter matchmaking queue
2. **Build Phase (90s)** — Each player describes their fortress in plain English or places blocks manually; AI builds on their side of the 1600px map
3. **Reveal Phase (5s)** — Camera pans across the full battlefield showing both fortresses
4. **Combat Phase (15s/turn)** — Turn-based cannon fire; aim with angle/power control
5. **Result** — King that falls first loses the round; first to 2 rounds wins the match

### Key Data Flow: AI Fortress Building
1. User submits a prompt + Gemini API key via the UI
2. Client emits `request_build` over Socket.io
3. Server calls Gemini 2.5 Flash with a system prompt that enforces spatial/physics rules
4. Response is validated against a Zod schema (`FortressSchema` in `server/ai/schema.ts`) — max 50 bodies
5. Overlap resolution (`server/ai/overlap.ts`) shifts colliding blocks before spawning
6. Valid bodies are spawned into the per-room Matter.js world
7. Game loop broadcasts updated state to players in the room

### Socket.io Events

#### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `create_room` | `{ name? }` | Create a new private room |
| `join_room` | `{ roomId, name? }` | Join by 6-character room code |
| `join_queue` | `{ name? }` | Enter matchmaking queue |
| `leave_queue` | — | Leave matchmaking queue |
| `player_ready` | — | Signal ready to start match |
| `spawn` | `{ x, y, material, shape }` | Place a block manually |
| `request_build` | `{ apiKey, prompt }` | AI fortress generation |
| `fire_projectile` | `{ angle, power }` | Fire cannon during combat turn |
| `chat_message` | `{ text }` | Send in-game chat message |
| `request_rematch` | — | Request rematch after result |

#### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `room_created` | `{ roomId }` | Room ready |
| `room_joined` | `{ roomId, side, players }` | Joined room |
| `room_error` | `{ message }` | Room join/create error |
| `player_joined` | `{ name, side }` | Opponent joined room |
| `player_left` | — | Opponent left room |
| `player_ready_ack` | — | Ready acknowledged |
| `queue_status` | `{ position }` | Queue position update |
| `match_found` | `{ roomId }` | Matched with opponent |
| `match_started` | `{ side }` | Game begins |
| `gameState` | `{ bodies[], kings }` | Physics snapshot (20 Hz) |
| `terrain` | `{ points, buildZones, hazards }` | World data |
| `phase_change` | `{ phase, endsAt, turnPlayer? }` | Phase transition |
| `turn_start` | `{ side, endsAt }` | Combat turn begins |
| `build_status` | `{ status, message }` | AI build progress |
| `build_success` | `{ count, thought }` | AI build complete |
| `build_error` | `{ message }` | AI build failed |
| `king_damage` | `{ side, hp, damage }` | King hit |
| `king_dead` | `{ side }` | King destroyed |
| `block_destroyed` | `{ bodyId, position, material }` | Block broken |
| `projectile_impact` | `{ position }` | Projectile hit |
| `match_result` | `{ winner, reason }` | Round result |
| `round_result` | `{ winner, roundScore, isFinalRound }` | Best-of-3 tracking |
| `chat_message` | `{ sender, side, text }` | Chat received |
| `rematch_requested` | `{ side }` | Opponent wants rematch |
| `rematch_start` | — | Rematch accepted, restarting |

### Frontend Structure
- `src/App.tsx` — Root layout, prompt input, routing between lobby and game
- `src/types.ts` — Shared types: `BodyState`, `GameState`, `MatchPhase`, `RoomState`, `ChatMessage`, `MaterialType`
- `src/hooks/useGameState.ts` — Socket.io connection, all game state (Zustand-based), event handlers
- `src/components/GameCanvas.tsx` — Canvas 2D renderer: terrain, bodies, Kings, HP bars, cannon, aiming trajectory, camera system, touch/mouse input
- `src/components/Lobby.tsx` — Room creation, room joining by code, matchmaking queue UI, ready button
- `src/components/GodTools.tsx` — Material/shape selector toolbar for manual block spawning
- `src/components/PhaseOverlay.tsx` — Phase banners (build/reveal/combat/result), timers, score, rematch UI, hazard indicators
- `src/components/ChatPanel.tsx` — In-game chat panel with message history and input
- `src/effects/particles.ts` — `ParticleSystem` class for block destruction debris and projectile impact effects

### Backend Structure
- `server/index.ts` — Express server, Socket.io event routing, delegates to RoomManager and GameSession
- `server/types.ts` — Server-side types: `PlayerInfo`, `PlayerState`, `KingState`, `HazardType`, `HazardData`
- `server/config/constants.ts` — Game balance constants: material properties, damage formulas, phase durations, world dimensions
- `server/game/RoomManager.ts` — Room lifecycle: create/join rooms, matchmaking queue, disconnect handling, rematch flow
- `server/game/GameSession.ts` — Per-room physics world: Matter.js engine, terrain, Kings, block spawning, projectile handling, damage system
- `server/game/MatchStateMachine.ts` — Phase transitions (BUILD→REVEAL→COMBAT→RESULT), turn management, timers
- `server/physics/world.ts` — Matter.js world initialization with material properties
- `server/physics/loop.ts` — `GameLoop` class: 60 Hz fixed timestep, 20 Hz state broadcast
- `server/physics/terrain.ts` — Procedural terrain generation via seeded noise; build zone detection
- `server/physics/hazards.ts` — Environmental hazards: wind zones (force application), lava pools (continuous damage), falling rocks
- `server/ai/gemini.ts` — Gemini API integration with structured JSON output
- `server/ai/schema.ts` — Zod schemas for AI response validation (`BodySchema`, `FortressSchema`)
- `server/ai/prompts.ts` — System prompt builder with terrain context and physics rules
- `server/ai/overlap.ts` — Safe Spawn collision resolution for overlapping blocks

### Material System
Five materials (wood, stone, ice, rubber, steel) each with distinct density, friction, restitution, and block HP values defined in `server/config/constants.ts`. The same material type names are used across the Zod schema, AI prompts, and client-side color mapping.

### Key Architecture Patterns
- **Room-scoped events** — All Socket.io events are emitted to `io.to(roomId)`, never globally. Each room has its own `GameSession` with an isolated Matter.js world.
- **Phase-driven state machine** — `MatchStateMachine` enforces BUILD → REVEAL → COMBAT → RESULT flow with timed transitions, settle detection, and turn switching.
- **Per-room physics** — Each `GameSession` creates its own Matter.js engine instance. When a match ends, the engine is destroyed.
- **Server-authoritative** — The client cannot modify HP, place blocks outside its zone, or fire out of turn.

## Environment Variables

Backend requires a `.env` file in `server/` (see `server/.env.example`):
- `PORT` — Server port (default 3001)
- `GEMINI_API_KEY` — Google Gemini API key (can also be provided per-request from the client)

## TypeScript Configuration

Strict mode is enabled. `noUnusedLocals` and `noUnusedParameters` are enforced. The project uses ES modules throughout (`"type": "module"` in both package.json files).

## Mobile & Cross-Platform

The game supports both desktop and mobile browsers:
- **Desktop** — Mouse aiming, keyboard camera panning (A/D), scroll wheel power adjustment
- **Mobile** — Touch aiming with drag-relative power, two-finger camera panning, responsive layouts
- **Adaptive UI** — Components reposition for screen size; portrait and landscape orientations supported
