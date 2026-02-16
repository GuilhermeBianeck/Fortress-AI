# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fortress AI is a 2D physics-based strategy game where players use AI prompts to design fortresses that must survive environmental hazards. Built as a web app with separate frontend and backend.

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

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS 4, Zustand, Socket.io client, Matter.js
- **Backend:** Express 5, Socket.io, Matter.js, Google Gemini AI (`@google/generative-ai`), Zod 4
- **Physics:** Matter.js on both client (rendering) and server (simulation)

## Architecture

### Client-Server Split
The server owns all physics simulation (Matter.js world at 60 Hz). The client is a renderer — it receives state snapshots at 20 Hz over Socket.io and draws them on a 800x600 HTML canvas. There is no client-side physics prediction.

### Key Data Flow: AI Fortress Building
1. User submits a prompt + Gemini API key via the UI
2. Client emits `request_build` over Socket.io
3. Server calls Gemini 2.5 Flash with a system prompt that enforces spatial/physics rules
4. Response is validated against a Zod schema (`FortressSchema` in `server/ai/schema.ts`) — max 50 bodies
5. Valid bodies are spawned into the Matter.js world
6. Game loop broadcasts updated state to all connected clients

### Socket.io Events
- **Client → Server:** `spawn`, `request_build`, `clear_world`
- **Server → Client:** `gameState`, `terrain`, `build_status`, `build_success`, `build_error`

### Frontend Structure
- `src/App.tsx` — Main layout, prompt form, status overlay
- `src/hooks/useGameState.ts` — Socket.io connection and all game state (Zustand-based)
- `src/components/GameCanvas.tsx` — Canvas 2D rendering of bodies and terrain
- `src/components/GodTools.tsx` — Material/shape selector for manual spawning

### Backend Structure
- `server/index.ts` — Express server, Socket.io handlers, world lifecycle
- `server/physics/world.ts` — Matter.js world initialization with material properties
- `server/physics/loop.ts` — `GameLoop` class: 60 Hz fixed timestep, 20 Hz broadcast
- `server/physics/terrain.ts` — Procedural terrain via seeded noise; identifies flat build zones
- `server/ai/gemini.ts` — Gemini API integration
- `server/ai/schema.ts` — Zod schemas for AI response validation
- `server/ai/prompts.ts` — System prompt defining physics rules for the AI

### Material System
Five materials (wood, stone, ice, rubber, steel) each with distinct density, friction, and restitution values defined in `server/physics/world.ts`. The same material type names are used across the Zod schema, AI prompts, and client-side color mapping.

## Environment Variables

Backend requires a `.env` file in `server/` (see `server/.env.example`):
- `PORT` — Server port (default 3001)
- `GEMINI_API_KEY` — Google Gemini API key (can also be provided per-request from the client)

## TypeScript Configuration

Strict mode is enabled. `noUnusedLocals` and `noUnusedParameters` are enforced. The project uses ES modules throughout (`"type": "module"` in both package.json files).
