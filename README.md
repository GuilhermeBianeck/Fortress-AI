<p align="center">
  <img src="https://img.shields.io/badge/status-playable-brightgreen" alt="Status: Playable" />
  <img src="https://img.shields.io/badge/players-2-blue" alt="Players: 2" />
  <img src="https://img.shields.io/badge/platform-web-orange" alt="Platform: Web" />
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="License: MIT" />
</p>

# FORTRESS AI

**A real-time multiplayer fortress-building strategy game where human creativity meets AI architecture.**

Design impenetrable fortresses with natural language prompts powered by Google Gemini, then destroy your opponent's creation in physics-based turn-based combat. Every match features procedurally generated terrain, environmental hazards, and best-of-3 rounds where strategy, engineering, and a little chaos collide.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Game Mechanics](#game-mechanics)
- [Controls](#controls)
- [Configuration](#configuration)
- [Contributing](#contributing)

---

## How It Works

```
 You: "Build a layered fortress with stone walls and a steel roof"
  |
  v
 Gemini 2.5 Flash analyzes terrain, physics constraints, and build zones
  |
  v
 Up to 50 physics bodies spawn into the Matter.js world
  |
  v
 Your opponent does the same on their side
  |
  v
 Turn-based cannon combat begins. Destroy their King to win.
```

1. **Build Phase (90s)** - Describe your fortress in plain English or place blocks manually. The AI interprets your prompt, considers the terrain, and constructs a structurally sound fortress around your King.
2. **Reveal Phase (5s)** - The camera sweeps across the 1600px battlefield, showing both fortresses for the first time.
3. **Combat Phase (15s/turn)** - Take turns firing cannonballs across the map. Aim with precision, account for wind, and bring down their walls.
4. **Result** - The King that falls first loses the round. First to 2 rounds wins the match.

---

## Features

### Core Gameplay
- **AI Fortress Generation** - Describe your fortress in natural language; Gemini 2.5 Flash builds it with real physics constraints
- **Manual Building** - Place individual blocks with full control over material and shape
- **Turn-Based Combat** - Strategic cannon duels with angle and power control
- **Best-of-3 Rounds** - Each round generates new terrain and hazards
- **Server-Authoritative Physics** - No cheating; the server owns the simulation

### Multiplayer
- **Private Rooms** - Create a room and share the 6-character code with a friend
- **Quick Match** - Join the matchmaking queue and get paired automatically
- **Player Names** - Persistent names stored locally
- **In-Game Chat** - Talk to your opponent during any phase
- **Rematch System** - Both players can request a rematch without leaving the room
- **Disconnect Handling** - Automatic forfeit on disconnect; rooms clean up gracefully

### World & Physics
- **Procedural Terrain** - Seeded multi-octave noise generates unique landscapes every round
- **5 Materials** - Wood, Stone, Ice, Rubber, and Steel, each with distinct density, friction, and durability
- **3 Block Shapes** - Rectangle (30x30), Pillar (30x90), and Beam (90x15) for versatile architecture
- **Environmental Hazards** - Wind zones that deflect projectiles, lava pools that melt Kings, and falling rocks that crash from above
- **Particle Effects** - Block destruction debris, projectile impact flashes
- **Minimap** - Full battlefield overview with viewport indicator, clickable for navigation

### Cross-Platform
- **Desktop** - Mouse aiming, keyboard camera panning (A/D), scroll wheel power adjustment
- **Mobile** - Touch aiming with drag-relative power, two-finger camera panning, responsive portrait and landscape layouts
- **Adaptive UI** - God Tools, chat, and phase overlays reposition for screen size

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19 | UI components and state |
| **Styling** | Tailwind CSS 4 | Responsive, utility-first design |
| **Build** | Vite 5 | Fast HMR and optimized production builds |
| **Physics** | Matter.js | 2D rigid body simulation (server + client rendering) |
| **Networking** | Socket.io | Real-time bidirectional WebSocket communication |
| **Backend** | Express 5 | HTTP server and API layer |
| **AI** | Google Gemini 2.5 Flash | Natural language to fortress generation |
| **Validation** | Zod 4 | Runtime schema validation for AI responses |
| **Language** | TypeScript | End-to-end type safety (strict mode) |
| **Icons** | Lucide React | Clean, consistent iconography |

---

## Architecture

```
                    Browser (Client)                          Node.js (Server)
              ┌─────────────────────────┐             ┌──────────────────────────┐
              │                         │  Socket.io  │                          │
              │  React 19 + Vite        │◄───────────►│  Express 5 + Socket.io   │
              │                         │   20 Hz     │                          │
              │  ┌───────────────────┐  │  snapshots  │  ┌────────────────────┐  │
              │  │ useGameState Hook │──┼─────────────┼──│ RoomManager        │  │
              │  │ (Socket.io state) │  │             │  │ (lobbies, queue)   │  │
              │  └───────┬───────────┘  │             │  └────────┬───────────┘  │
              │          │              │             │           │              │
              │  ┌───────▼───────────┐  │             │  ┌────────▼───────────┐  │
              │  │ GameCanvas        │  │             │  │ GameSession        │  │
              │  │ (2D renderer,     │  │             │  │ (per-room physics  │  │
              │  │  camera, input)   │  │             │  │  world, damage)    │  │
              │  └───────────────────┘  │             │  └────────┬───────────┘  │
              │                         │             │           │              │
              │  ┌───────────────────┐  │             │  ┌────────▼───────────┐  │
              │  │ PhaseOverlay      │  │             │  │ MatchStateMachine  │  │
              │  │ GodTools / Lobby  │  │             │  │ (BUILD→REVEAL→     │  │
              │  │ ChatPanel         │  │             │  │  COMBAT→RESULT)    │  │
              │  └───────────────────┘  │             │  └────────────────────┘  │
              │                         │             │                          │
              │  No client-side physics │             │  ┌────────────────────┐  │
              │  Pure renderer          │             │  │ Matter.js @ 60 Hz  │  │
              │                         │             │  │ (authoritative)    │  │
              └─────────────────────────┘             │  └────────────────────┘  │
                                                      │                          │
                                                      │  ┌────────────────────┐  │
                                                      │  │ Gemini AI          │  │
                                                      │  │ (prompt → blocks)  │  │
                                                      │  └────────────────────┘  │
                                                      └──────────────────────────┘
```

### Key Design Decisions

- **Server-authoritative physics.** The server runs Matter.js at 60 Hz with a fixed timestep. Clients receive state snapshots at 20 Hz and render them. There is no client-side prediction or interpolation — the server is the single source of truth.
- **AI validation pipeline.** Gemini responses pass through Zod schema validation (max 50 bodies, valid materials, bounded dimensions) and a spatial overlap checker that shifts colliding blocks upward before spawning.
- **Room-scoped events.** All Socket.io events are emitted to `io.to(roomId)`, never globally. Each room has its own `GameSession` with an isolated Matter.js world.
- **Phase-driven state machine.** The `MatchStateMachine` enforces the BUILD → REVEAL → COMBAT → RESULT flow with timed transitions, settle detection, and turn switching.

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- **Google Gemini API key** (for AI fortress building — [get one free](https://aistudio.google.com/apikey))

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/fortress-ai.git
cd fortress-ai

# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### Environment Setup

```bash
# Create server environment file
cp server/.env.example server/.env
```

Edit `server/.env`:
```env
PORT=3001
GEMINI_API_KEY=your_api_key_here    # Optional: players can also provide their own key in-game
```

### Running

Open two terminals:

```bash
# Terminal 1: Start the backend
cd server
npm run dev
```

```bash
# Terminal 2: Start the frontend
npm run dev
```

The game is now running at **http://localhost:5173**. Both servers must run simultaneously.

### Playing on Local Network

The Vite dev server binds to `0.0.0.0`, so other devices on your network can connect. Find your local IP and share `http://<your-ip>:5173` with a friend. The Socket.io client auto-connects to the server on port 3001.

### Production Build

```bash
# Build frontend
npm run build

# Build backend
cd server
npm run build

# Run production server
npm run start
```

---

## Project Structure

```
fortress-ai/
├── src/                            # Frontend (React + Vite)
│   ├── App.tsx                     # Root layout, routing, prompt input
│   ├── types.ts                    # Shared types and game constants
│   ├── index.css                   # Global styles and responsive rules
│   ├── components/
│   │   ├── GameCanvas.tsx          # Canvas 2D renderer, camera, input handling
│   │   ├── Lobby.tsx               # Room creation, joining, matchmaking UI
│   │   ├── GodTools.tsx            # Material/shape selector toolbar
│   │   ├── PhaseOverlay.tsx        # Phase banners, timers, rematch UI
│   │   └── ChatPanel.tsx           # In-game chat panel
│   ├── hooks/
│   │   └── useGameState.ts         # Socket.io connection and all game state
│   └── effects/
│       └── particles.ts            # Particle system for visual effects
│
├── server/                         # Backend (Express + Socket.io)
│   ├── index.ts                    # Server entry, Socket.io event handlers
│   ├── types.ts                    # Server-side type definitions
│   ├── config/
│   │   └── constants.ts            # Game balance: materials, damage, timers
│   ├── game/
│   │   ├── RoomManager.ts          # Room lifecycle, matchmaking queue
│   │   ├── GameSession.ts          # Per-room physics world and game logic
│   │   └── MatchStateMachine.ts    # Phase transitions and turn management
│   ├── physics/
│   │   ├── world.ts                # Matter.js world initialization
│   │   ├── terrain.ts              # Procedural terrain generation
│   │   ├── hazards.ts              # Wind, lava, and falling rocks
│   │   └── loop.ts                 # 60 Hz fixed-timestep game loop
│   └── ai/
│       ├── gemini.ts               # Gemini API integration
│       ├── prompts.ts              # System prompt for fortress generation
│       ├── schema.ts               # Zod schema for AI response validation
│       └── overlap.ts              # Spatial collision avoidance for spawns
│
├── CLAUDE.md                       # Development guide for AI assistants
├── package.json                    # Frontend dependencies and scripts
└── vite.config.ts                  # Vite configuration
```

---

## Game Mechanics

### Materials

Each material has unique physical properties that affect how your fortress behaves under fire:

| Material | Density | Friction | HP | Best For |
|----------|---------|----------|----|----------|
| **Wood** | Light | High | 30 | Tall structures, scaffolding |
| **Stone** | Heavy | Very High | 80 | Load-bearing walls, bases |
| **Ice** | Medium | Very Low | 15 | Deflection surfaces, ramps |
| **Rubber** | Light | High | 40 | Shock absorption layers |
| **Steel** | Very Heavy | Medium | 200 | Armored roofs, critical protection |

### Damage System

- Projectiles deal impact damage based on collision velocity
- Minimum impact threshold of 3 units prevents trivial damage
- Blocks take 2x damage multiplier from projectile impacts
- Kings take `(impact - 5) * 0.3` damage, with a threshold of 5 units
- Material damage multipliers: Wood/Rubber 1x, Ice 0.5x, Stone 3x, Steel 10x

### Environmental Hazards

Each match randomly generates 1-2 hazards in the center of the battlefield:

| Hazard | Effect |
|--------|--------|
| **Wind Zone** | Constant horizontal force deflects projectiles and loose blocks mid-flight |
| **Lava Pool** | Deals continuous damage to Kings and blocks touching the surface |
| **Falling Rocks** | Stone boulders drop from above every 3 seconds during combat |

### AI Building

When you submit a prompt, the server:
1. Simplifies the terrain into surface points and identifies flat build zones
2. Sends terrain data, King position, and your prompt to Gemini 2.5 Flash
3. Validates the AI response against a Zod schema (max 50 bodies, valid materials)
4. Runs overlap detection to prevent blocks from spawning inside terrain or each other
5. Spawns validated bodies into the physics world

The AI is constrained to build only on your side of the 800px boundary and must respect the physics engine's rules.

---

## Controls

### Desktop

| Action | Input |
|--------|-------|
| Place block | Click on your side of the canvas |
| Aim cannon | Click and drag during your combat turn |
| Adjust power | Drag distance from cannon / Scroll wheel / Arrow keys (Up/Down) |
| Adjust angle | Mouse position relative to cannon / Arrow keys (Left/Right) |
| Fire | Release mouse / Spacebar |
| Pan camera | A / D keys |
| Toggle build/preview | Tab key |
| Send chat | Type in chat panel + Enter |

### Mobile

| Action | Input |
|--------|-------|
| Place block | Tap on your side of the canvas |
| Aim cannon | Tap and hold during your combat turn |
| Adjust power | Drag distance from initial tap point |
| Pan camera | Two-finger drag left/right |
| Navigate minimap | Tap on minimap (bottom-right corner) |

---

## Configuration

### Game Balance

All game constants live in `server/config/constants.ts` and can be tuned:

```typescript
BUILD_PHASE_DURATION    = 90_000   // 90 seconds to build
REVEAL_PHASE_DURATION   = 5_000    // 5 second camera sweep
COMBAT_TURN_DURATION    = 15_000   // 15 seconds per turn
SETTLE_TIMEOUT          = 8_000    // Max wait for physics to settle
ROUNDS_TO_WIN           = 2        // Best-of-3
KING_MAX_HP             = 100      // King hit points
MAX_AI_BODIES           = 50       // AI fortress body limit
```

### Socket Events Reference

<details>
<summary>Client to Server</summary>

| Event | Payload | Description |
|-------|---------|-------------|
| `create_room` | `{ name? }` | Create a new room |
| `join_room` | `{ roomId, name? }` | Join by room code |
| `join_queue` | `{ name? }` | Enter matchmaking |
| `leave_queue` | - | Leave matchmaking |
| `player_ready` | - | Signal ready to start |
| `spawn` | `{ x, y, material, shape }` | Place a block |
| `request_build` | `{ apiKey, prompt }` | AI fortress generation |
| `fire_projectile` | `{ angle, power }` | Fire cannon |
| `send_chat` | `{ text }` | Send chat message |
| `request_rematch` | - | Request rematch |

</details>

<details>
<summary>Server to Client</summary>

| Event | Payload | Description |
|-------|---------|-------------|
| `room_created` | `{ roomId }` | Room ready |
| `room_joined` | `{ roomId, side, players }` | Joined room |
| `match_started` | `{ side }` | Game begins |
| `gameState` | `{ bodies[], kings }` | Physics snapshot (20 Hz) |
| `terrain` | `{ points, buildZones, hazards }` | World data |
| `phase_change` | `{ phase, endsAt, turnPlayer? }` | Phase transition |
| `king_damage` | `{ side, hp, damage }` | King hit |
| `match_result` | `{ winner, reason }` | Round result |
| `round_result` | `{ winner, roundScore, isFinalRound }` | Best-of-3 tracking |
| `chat_message` | `{ sender, side, text }` | Chat received |

</details>

---

## Contributing

Contributions are welcome. Here are some areas where the project could grow:

- **Spectator Mode** - Allow third-party viewers to watch matches live
- **Replay System** - Record and replay matches with deterministic physics
- **Ranked Matchmaking** - Elo-based rating and leaderboards
- **More Hazards** - Earthquakes, floods, meteor showers
- **Custom Game Modes** - Unlimited build time, rapid fire, king of the hill
- **Sound Effects & Music** - Audio feedback for impacts, destruction, and phases
- **Accessibility** - Screen reader support, colorblind-friendly material colors

### Development Tips

- Both servers must run simultaneously (`npm run dev` in root and `server/`)
- The server must be restarted after backend code changes
- If port 3001 is stuck: `lsof -ti:3001 | xargs kill -9`
- Frontend uses strict TypeScript with `noUnusedLocals` and `noUnusedParameters`
- Server uses CommonJS modules — no `noUnusedLocals` enforcement
- All Socket.io events are room-scoped via `io.to(roomId).emit()`

---

<p align="center">
  Built with Matter.js, React, and Gemini AI
</p>
