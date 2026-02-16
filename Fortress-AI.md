# Fortress AI: The "Text-to-Physics" Strategy Master Plan (v9.0 - The Bible)

## 1. Executive Summary & Vision
**Genre:** 2D Physics Strategy / Competitive Engineering.
**Platform:** Web App (React/Vite) wrapped as a Telegram Mini App (TMA).
**Core Loop:** 1v1 Battles. Players act as *Architects*, using AI prompts to design fortresses that must survive procedural environmental hazards and enemy artillery.
**The "Why":** This fills the gap between passive AI games (text adventures) and active skill games. It turns the LLM into a real-time game engine where *intelligence* is the primary weapon.

---

## 2. Product Requirements Document (PRD)

### 2.1 Functional Requirements (FR)
*   **FR-01 (Game Loop):** Users must be able to input text prompts, receive a generated structure within 10s, and watch a deterministic physics simulation.
*   **FR-02 (Matchmaking):** Users must be matched with an opponent within 30 seconds. If no human is found, the system must transparently match against a "Ghost" (Replay of a previous human match).
*   **FR-03 (Social Viral):** Users must be able to generate a `t.me` deep link to challenge a specific friend directly.
*   **FR-04 (Replays):** Every match must generate a unique, shareable Replay URL that plays back the simulation deterministically without re-querying the AI.
*   **FR-05 (Progression):** Users must earn "Architect Points" (Elo) for wins and unlock cosmetic skins for blocks.
*   **FR-06 (Account Migration):** "Guest" progress (local storage) must merge automatically when the user finally authenticates via Telegram.

### 2.2 Non-Functional Requirements (NFR)
*   **NFR-01 (Mobile Performance):** The game must maintain **60 FPS** on mid-range Android devices (Snapdragon 7 series).
    *   *Constraint:* Max **50 rigid bodies** active in the scene at once.
*   **NFR-02 (Determinism):** Physics simulation must remain synchronized between clients.
    *   *Constraint:* A **Fixed Time Step** (16.66ms) accumulator loop must be enforced. Floating point differences are mitigated by syncing *Inputs* only, not positions.
*   **NFR-03 (AI Latency):** "Time to First Token" from the AI (via Optimistic UI or Stream) must be **< 2 seconds**. Full structure generation **< 10 seconds**.
*   **NFR-04 (Reliability):** The game must handle network disconnects gracefully (Auto-reconnect within 5s, else Forfeit).
*   **NFR-05 (Data Integrity):** Match results must be verifiable by the server (Authoritative check) to prevent client-side cheat hacks.

---

## 3. Security & Compliance Standards (Priority Zero)

### 3.1 Secrets Management
*   **Storage:** All API Keys (Google Gemini, Supabase Service Role) reside strictly in **Supabase Vault** (Production) or `.env.local` (Development).
*   **Git Policy:** `.env*` files are strictly added to `.gitignore`. No secrets in commit history.
*   **Leak Prevention:** The Frontend (React) receives *only* the Supabase Anon Key. It **never** receives the Gemini API Key.

### 3.2 Authentication & Cryptography
*   **Identity:** We delegate authentication to **Supabase Auth**.
    *   *Standard:* Secure Remote Password (SRP) protocol via GoTrue.
    *   *Tokens:* Short-lived JWTs (JSON Web Tokens). Stored in `httpOnly` cookies or secure storage.
*   **Encryption:**
    *   **In-Transit:** All traffic forced via HTTPS (TLS 1.3).
    *   **At-Rest:** Database volumes are encrypted by the provider (AWS/Supabase).

### 3.3 Client/Server Separation (The Air Gap)
*   **Client (Untrusted):** The React App is a "Dumb Terminal." It renders physics and sends inputs. It cannot declare "I Won."
*   **Server (Trusted):** Supabase Edge Functions handle all sensitive logic.
    *   *AI Calls:* The Client sends a prompt -> Edge Function calls Gemini -> Edge Function sanitizes JSON -> Client receives JSON.
    *   *Victory:* The Server validates the match result (or relies on peer consensus with audit logs).

### 3.4 Database Security (RLS)
We use Postgres **Row Level Security (RLS)** to enforce access control at the engine level.
*   `matches`: SELECT (All), INSERT (Authenticated).
*   `moves`: INSERT (Only if `auth.uid()` matches `current_turn_player`).
*   **Policy:** `create policy "Players can move" on moves for insert with check (auth.uid() = player_id);`

---

## 4. Technical Architecture

### 4.1 Technology Stack
| Layer | Technology | Justification |
| :--- | :--- | :--- |
| **Frontend** | React 19 + Vite | High performance, component-based, fast HMR. |
| **Language** | TypeScript (Strict) | Essential for sharing types (`FortressPlan`) between Client and Edge Functions. |
| **Physics** | Matter.js (0.19.0) | Proven 2D stability. **Crucial:** We must run the engine with a fixed delta (`Engine.update(engine, 16.666)`) to ensure deterministic replayability across clients. |
| **State** | Zustand | Transient local state (inventory, UI inputs). |
| **Backend** | Supabase | Auth (Anonymous), Database (Match History), Realtime (Lobby Sync). |
| **AI Layer** | Supabase Edge Functions | Deno runtime. Securely holds API keys for Google Gemini / OpenAI. |

### 4.2 Directory Structure
```text
/src
  /components
    /GameScene       # The Canvas/Matter.js wrapper
    /UI              # Overlay prompts, inventory, health bars
    /Effects         # Particles, Screen Shake
  /hooks
    useGameLoop.ts   # Manages the 60fps physics tick (Accumulator)
    useMatchSync.ts  # Supabase Realtime subscriber
  /logic
    /physics
      world.ts       # Singleton engine instance
      materials.ts   # Material property definitions
      terrain.ts     # Perlin noise generator
      collisions.ts  # Damage calculation logic
    /ai
      parser.ts      # Validates & sanitizes LLM JSON
      prompts.ts     # System prompt templates
      overlap.ts     # "Safe Spawn" algorithms
    /net
      protocol.ts    # WebSocket event definitions
  /types
    schema.ts        # Shared interfaces (FortressPlan, MatchState)
/supabase
  /functions         # SECURE SERVER-SIDE LOGIC
    /architect       # Calls Gemini API (Secrets Here)
    /matchmaker      # Queues players
```

---

## 5. Game Mechanics & Physics Implementation

### 5.1 Material Properties Table
To ensure gameplay depth, materials must have distinct physical behaviors.

| Material | Color (Hex) | Density | Friction | Restitution (Bounce) | HP Multiplier | Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Wood** | `#A67C52` | 0.001 | 0.5 (High) | 0.1 (Low) | 1.0x | Structural Skeleton |
| **Stone** | `#7D7D7D` | 0.005 | 0.8 (Rough) | 0.0 (No) | 3.0x | Heavy Armor / Base |
| **Ice** | `#A5F2F3` | 0.002 | 0.01 (Slippery) | 0.1 | 0.5x | Deflecting shots |
| **Rubber** | `#FF69B4` | 0.001 | 0.9 (Sticky) | 0.9 (Super) | 1.0x | Repelling projectiles |
| **Steel** | `#434B4D` | 0.008 | 0.3 | 0.05 | 10.0x | Anchor points (Rare) |

### 5.2 The "King" Unit & Health System
*   **Properties:** A small, round body. Density: 0.003. Restitution: 0.5.
*   **Health:** `MaxHP = 100`.
*   **Damage Logic:**
    *   Trigger: `collisionStart` event.
    *   Formula: `ImpactForce = (BodyA.speed * BodyA.mass) + (BodyB.speed * BodyB.mass)`
    *   **Threshold:** If `ImpactForce < 5`, ignore (tiny bumps don't hurt).
    *   **Damage:** `HP -= (ImpactForce - 5) * Multiplier`.
    *   *Result:* A King can survive falling a short distance, but a heavy stone block landing on it is fatal.

### 5.3 Procedural Terrain Algorithm
*   **Goal:** Generate "Unfair" maps that require adaptation.
*   **Method:**
    1.  Generate a set of `X` coordinates (0 to MapWidth) at intervals of 50px.
    2.  For each `X`, calculate `Y` using 1D Noise (Simplex/Perlin) + a "Biased Slope" factor.
    3.  Create a Matter.js `Vertices` body from these points.
    4.  **Critical:** Define valid "Build Zones" (flat-ish areas) so the AI has a fair starting point, even on a mountain.

### 5.4 Core Physics Kernel (Pseudo-Code)
```typescript
// src/logic/physics/loop.ts
const FIXED_DT = 1000 / 60; // 16.666ms
let accumulator = 0;
let lastTime = performance.now();

function gameLoop(currentTime: number) {
  const frameTime = currentTime - lastTime;
  lastTime = currentTime;
  accumulator += frameTime;
  if (accumulator > 200) accumulator = 200; // Spiral of Doom check

  while (accumulator >= FIXED_DT) {
    Matter.Engine.update(engine, FIXED_DT); // Step Physics
    GameLogic.tick(); // Run Game Logic
    accumulator -= FIXED_DT;
  }
  Renderer.draw(engine, accumulator / FIXED_DT); // Interpolate
  requestAnimationFrame(gameLoop);
}
```

---

## 6. The AI Protocol (Prompt-to-Physics)

### 6.1 System Prompt Engineering
The prompt must force the LLM to think spatially.
> "You are a structural engineer. Gravity is vertical (Y+). The ground is uneven.
> Input: A terrain array of [x,y] points.
> Input: An inventory list.
> Task: Build a stable structure that protects the 'King' unit at [Tx, Ty].
> Output: STRICT JSON only. No markdown."

### 6.2 JSON Schema & Validation (Zod)
We use **Zod** to validate the AI response before passing it to the physics engine.

```typescript
// types/schema.ts
import { z } from 'zod';

export const BodySchema = z.object({
  shape: z.enum(['rectangle', 'circle', 'triangle']),
  material: z.enum(['wood', 'stone', 'ice', 'rubber', 'steel']),
  x: z.number(),
  y: z.number(),
  dimensions: z.array(z.number()), // [width, height] or [radius]
  angle: z.number().optional().default(0)
});

export const FortressSchema = z.object({
  thought_chain: z.string(), // "I placed stone at the bottom for stability..."
  bodies: z.array(BodySchema).max(50), // Cap entity count for performance
  joints: z.array(z.object({
    body_a_index: z.number(),
    body_b_index: z.number(),
    stiffness: z.number().min(0).max(1)
  })).optional()
});
```

### 6.3 Physics Sanitization (The "Safe Spawn" Layer)
**Problem:** AI might generate blocks inside the ground or overlapping each other, causing physics explosions.
**Solution:** The `overlap.ts` utility.
1.  **Parse JSON.**
2.  **Virtual Spawn:** Create bodies in a "Ghost World" (no rendering).
3.  **Check Collisions:** Use `Matter.Query.collides`.
4.  **Resolve:** If Block A overlaps Block B, shift Block A upwards by (Height/2). If it overlaps Terrain, shift upwards.
5.  **Finalize:** Once valid, spawn in the real world.

### 6.4 Latency Management
*   **Optimistic UI:** Show a "Constructing..." animation on the build zone immediately.
*   **Streaming Reasoning:** Stream the `thought_chain` text to the UI *before* the JSON arrives.

---

## 7. Multiplayer Architecture (Supabase)

### 7.1 Database Schema
```sql
-- public.match_queue
create table match_queue (
  player_id uuid primary key references auth.users,
  elo_score int default 1000,
  joined_at timestamptz default now()
);

-- public.matches
create table matches (
  id uuid primary key default gen_random_uuid(),
  status text check (status in ('waiting', 'building', 'combat', 'finished')),
  terrain_seed text not null, -- Deterministic seed for map gen
  player_1_id uuid references auth.users,
  player_2_id uuid references auth.users,
  current_turn uuid, -- Who is firing?
  winner_id uuid,
  replay_json jsonb, -- Stores the entire input sequence for playback
  created_at timestamptz default now()
);

-- public.moves
create table moves (
  id uuid primary key,
  match_id uuid references matches,
  player_id uuid references auth.users,
  phase text, -- 'build' or 'attack'
  payload jsonb, -- The FortressJSON or the FiringVector {angle, power}
  created_at timestamptz default now()
);
```

### 7.2 Sync Protocol (Realtime)
We use **Input Lockstep**. We do *not* sync the position of every falling block over the network.
1.  **Match Start:** Server sends `terrain_seed`. Both clients gen terrain.
2.  **Draft:** Players submit Prompts -> Server -> AI -> JSON -> Broadcast JSON via Realtime.
3.  **Build:** Player B receives JSON. Player B's engine spawns the blocks locally.
4.  **Combat:** Player A sends `{ angle: 45, power: 80 }`. Player B receives it. Both engines fire the projectile locally.

---

## 8. Project Roadmap (Phased Engineering Tasks)

### Phase 1: The "God Hand" Sandbox (Days 1-2)
*   [ ] **Init:** `npm create vite@latest`, install dependencies (`matter-js`, `zustand`).
*   [ ] **Physics Core:** Create `GameScene.tsx` with Fixed Timestep.
*   [ ] **Input:** Create a "God Tools" UI (Click to spawn Wood/Stone).
*   [ ] **Terrain:** Implement `terrain.ts` using 1D Noise.
*   [ ] **Goal:** A user can manually stack 5 stone blocks on a hill without them sliding off immediately.

### Phase 2: The Architect Pipeline (Days 3-4)
*   [ ] **Function:** Create `supabase/functions/architect/index.ts`.
*   [ ] **Integration:** Connect Gemini API (Server-Side).
*   [ ] **Client:** Create a text input. "Build a wall".
*   [ ] **Rendering:** Parse the returned JSON and instantiate Matter.js bodies.
*   [ ] **Goal:** Typing "Make a pyramid" spawns a recognizable pyramid in the physics world.

### Phase 3: The Multiplayer Arena (Days 5-7)
*   [ ] **DB:** Run the SQL migrations.
*   [ ] **Lobby:** Create simple "Find Match" button (Queue logic).
*   [ ] **Sync:** Use `supabase.channel('match:ID').on('postgres_changes', ...)` to listen for enemy moves.
*   [ ] **Reconnection:** Implement "Fast-Forward" logic to replay history on reload.

### Phase 4: Polish & Productization (Days 8+)
*   [ ] **Visuals:** Apply textures to the bodies (`render.sprite.texture`).
*   [ ] **Juice:** Screen shake on impact. Sound effects.
*   [ ] **TMA:** Integrate Telegram user data (Avatar, Name) into the UI.
*   **Analytics:** Hook up PostHog to track prompt success rates.

---

## 9. Monetization & "Pro" Features
*   **Model Tiering:** 
    *   **Free:** Uses System Default (Gemini Flash). Fast, basic logic.
    *   **Pro:** Player provides their own API Key (BYOK) or subscribes. Uses Gemini 1.5 Pro. Better reasoning, more complex joints.
*   **Cosmetics:** AI-generated "Skins" for blocks (e.g., "Cyberpunk Neon", "Medieval Stone").
