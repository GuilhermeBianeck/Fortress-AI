# Fortress AI: Complete Game Design & Technical Specification (v10.0)

---

## 1. Executive Summary & Vision

**Genre:** 2D Physics Strategy / Competitive Engineering.
**Platform:** Web App (React 19 / Vite) — future Telegram Mini App (TMA) wrapper.
**Core Loop:** 1v1 Battles. Players act as *Architects*, using natural-language AI prompts to design fortresses. Fortresses must survive environmental hazards, then endure enemy artillery fire. Last King standing wins.
**The "Why":** This fills the gap between passive AI games (text adventures) and active skill games. The LLM becomes a real-time structural engineer where *the quality of your prompt* is the primary weapon.

**One-Sentence Pitch:** "Describe your fortress in words, watch the AI build it in real-time physics, then bombard your opponent's creation until their King falls."

---

## 2. Product Requirements Document (PRD)

### 2.1 Functional Requirements (FR)

| ID | Requirement | Acceptance Criteria |
|:---|:---|:---|
| FR-01 | **Game Loop** | User inputs prompt → AI returns structure ≤ 10s → physics sim runs at 60 Hz → state broadcast at 20 Hz |
| FR-02 | **Matchmaking** | Matched within 30s. No human found → transparent "Ghost" match (replay of previous human game) |
| FR-03 | **Social Challenge** | Generate a shareable deep link (`t.me` or web URL) to challenge a specific friend |
| FR-04 | **Replays** | Every match produces a unique Replay URL that deterministically plays back without re-querying the AI |
| FR-05 | **Progression** | Players earn Elo ("Architect Points") for wins, unlock cosmetic block skins |
| FR-06 | **Account Migration** | Guest progress (localStorage) merges automatically upon Telegram authentication |
| FR-07 | **Sandbox Mode** | Single-player sandbox with God Tools for free-form building and experimentation |
| FR-08 | **Combat Phase** | Turn-based artillery where players fire projectiles at the opponent's fortress |
| FR-09 | **Environmental Hazards** | Procedural hazards (wind, quakes, meteors) that escalate during combat rounds |

### 2.2 Non-Functional Requirements (NFR)

| ID | Requirement | Constraint |
|:---|:---|:---|
| NFR-01 | **Mobile 60 FPS** | Max 50 rigid bodies active per side (100 total on battlefield) on Snapdragon 7-series |
| NFR-02 | **Determinism** | Fixed timestep (16.66ms). Server-authoritative physics. Clients receive state snapshots, not inputs |
| NFR-03 | **AI Latency** | Time-to-first-token < 2s (stream `thought_chain`). Full generation < 10s |
| NFR-04 | **Reliability** | Auto-reconnect within 5s. Graceful degradation on disconnect (see §10.6) |
| NFR-05 | **Data Integrity** | Server declares winner. Client cannot self-report victory. All match results server-validated |
| NFR-06 | **Scalability** | Support 500 concurrent matches per server instance via Socket.io rooms |

---

## 3. Game Flow & Match State Machine

This is the complete lifecycle of a competitive match. Every state has a defined duration, allowed actions, and transition trigger.

### 3.1 State Diagram

```
LOBBY → QUEUE → MATCHED → TERRAIN_GEN → BUILD_PHASE → REVEAL → COMBAT_PHASE → RESULT → REPLAY
                                                            ↑                    |
                                                            └── (next round) ────┘
```

### 3.2 State Definitions

#### STATE: LOBBY
- **Duration:** Indefinite (player-driven).
- **What the player sees:** Main menu with "Find Match", "Sandbox", "Challenge Friend", profile/rank.
- **Allowed actions:** Enter matchmaking queue, open sandbox, generate challenge link, view replays, manage settings.
- **Transition:** Player presses "Find Match" → QUEUE.

#### STATE: QUEUE
- **Duration:** Max 30 seconds.
- **What the player sees:** "Searching for opponent..." spinner with elapsed timer. Cancel button.
- **Allowed actions:** Cancel queue (returns to LOBBY).
- **Server logic:** Match players within Elo band (±150, expanding ±50 every 10s). At 30s timeout, match against Ghost.
- **Transition:** Two players matched (or Ghost assigned) → MATCHED.

#### STATE: MATCHED
- **Duration:** 3 seconds (countdown).
- **What the player sees:** "Opponent Found!" overlay showing opponent name, Elo, and rank badge. A "3... 2... 1..." countdown.
- **Server logic:** Create match record in DB. Generate terrain seed. Assign sides (Player 1 = Left, Player 2 = Right).
- **Transition:** Countdown ends → TERRAIN_GEN.

#### STATE: TERRAIN_GEN
- **Duration:** < 1 second (instant on server).
- **What the player sees:** Brief "Generating Battlefield..." animation while terrain renders on canvas.
- **Server logic:** Run terrain generator with match seed. Broadcast `terrain` event to both clients. Spawn Kings at assigned build zones.
- **Transition:** Both clients ACK terrain receipt → BUILD_PHASE.

#### STATE: BUILD_PHASE
- **Duration:** 60 seconds (configurable per match type; ranked = 60s, casual = 90s).
- **What the player sees:** Their half of the battlefield, prompt input bar, timer counting down, God Tools for manual tweaks. Opponent's side is fog-of-war (dark overlay with "?" icon).
- **Allowed actions:**
  - Submit an AI prompt (max 2 prompt submissions per build phase — prevents spamming the AI).
  - Use God Tools to manually place/remove blocks after AI builds (within the block budget).
  - Press "Done" to end build phase early.
- **Server logic:**
  - On `request_build`: call Gemini, validate via Zod, run Safe Spawn, add bodies to player's side.
  - On `manual_spawn`: validate block is within player's build zone and budget.
  - On `clear_build`: remove all player-placed blocks (not terrain/King).
  - Track block count per player (max 40 per side).
- **Transition:** Timer expires OR both players press "Done" → REVEAL.

#### STATE: REVEAL
- **Duration:** 5 seconds.
- **What the player sees:** Camera pans to show the full battlefield. Fog-of-war lifts. Both fortresses visible side by side. Dramatic "BATTLE BEGINS" text overlay.
- **Server logic:** Broadcast both fortress states to both clients. Record final fortress JSON in match log for replay.
- **Transition:** Animation completes → COMBAT_PHASE (Round 1).

#### STATE: COMBAT_PHASE
- **Duration:** Per turn: 15 seconds to aim + fire. Per round: 2 turns (each player fires once). Max rounds: 10.
- **What the player sees:** Full battlefield. Active player sees aiming UI (angle/power arc). Inactive player sees "Opponent is aiming..." overlay.
- **Turn structure:**
  1. Player 1 aims and fires (15s timer).
  2. Physics simulates projectile impact + settling (up to 5 seconds, or until all bodies sleeping).
  3. Damage calculated. HP bars update.
  4. If a King dies → RESULT.
  5. Player 2 aims and fires (same flow).
  6. If neither King dead after both turns → check for max rounds → next round OR sudden death.
- **Allowed actions (active player):** Aim (angle + power), select ammo type (if unlocked), fire.
- **Allowed actions (inactive player):** Watch. No actions.
- **Transition:** King HP ≤ 0 → RESULT. Max rounds (10) reached with both alive → Sudden Death (see §5.5) → RESULT.

#### STATE: RESULT
- **Duration:** 8 seconds.
- **What the player sees:** "VICTORY" / "DEFEAT" banner. Stats: damage dealt, blocks destroyed, rounds survived, Elo change (+/- N). Buttons: "Rematch", "New Match", "Watch Replay", "Share".
- **Server logic:** Update Elo ratings. Record match result. Generate replay URL. Award cosmetic drops (if applicable).
- **Transition:** Player chooses next action → LOBBY or QUEUE.

#### STATE: REPLAY
- **Duration:** Indefinite (viewer-driven).
- **What the player sees:** Full match playback with controls (play/pause, 0.5x/1x/2x speed, scrub bar). Read-only.
- **Data source:** Terrain seed + both fortress JSONs + all firing vectors. Client regenerates terrain, spawns fortresses, replays shots in sequence.
- **Transition:** Player exits → LOBBY.

### 3.3 Sandbox Mode (FR-07)

Sandbox is a separate flow from competitive, used for experimentation and testing combat mechanics.

- **Entry:** LOBBY → "Sandbox" button → Sandbox.
- **No opponent.** No timer. No win condition. No Elo.
- **Full God Tools access.** All materials, unlimited blocks, manual spawn + AI prompt.
- **Terrain:** Random seed on entry. "New Terrain" button to regenerate.
- **King:** Present (for testing damage) but optional. Can toggle King on/off.
- **This is the current state of the codebase** — the sandbox is what exists today.

#### Sandbox Mode Switch: Build vs Fire

The sandbox has two interaction modes, toggled via the toolbar:

- **Build Mode (default):** Current behavior. Clicking the canvas spawns the selected material/shape. GodTools shows material + shape selectors. AI prompt bar is active.
- **Fire Mode:** Clicking the canvas sets aim direction (angle from cannon) and drag distance sets power. GodTools panel swaps to show a power gauge and "Fire" button. AI prompt bar is hidden.
- **Toggle:** A "Build / Fire" segmented control in the GodTools bar switches modes. Keyboard shortcut: `Tab` key.
- **Cannon position (sandbox):** Since there is no "opponent side," the cannon is placed at the left edge of the canvas: `x = 20, y = terrainY_at_x20 - 20`. It always fires rightward toward the player's fortress.
- **Unlimited shots.** No turn structure in sandbox. Fire as many projectiles as desired. Projectiles auto-remove after 5s lifespan.

---

## 4. Combat & Attack Phase (Deep Dive)

This is the most gameplay-critical section. Combat is what makes Fortress AI a *game* and not just a sandbox.

### 4.1 Projectile System

#### Base Projectile
- **Shape:** Circle, radius 8px.
- **Density:** 0.05 (very heavy — heavier than steel blocks, so it punches through).
- **Restitution:** 0.3 (mild bounce).
- **Friction:** 0.2.
- **Label:** `projectile`.
- **Lifespan:** 5 seconds after firing, then auto-removed (prevents stuck projectiles).
- **Collision behavior:** Normal physics. On first contact with a non-terrain body, apply impact damage per §5.2 formula. Projectile persists (doesn't vanish on hit) — it tumbles through the structure.

#### Ammo Types (Unlockable via Progression)

| Ammo | Unlock | Radius | Density | Special Behavior |
|:---|:---|:---|:---|:---|
| **Stone Shot** | Default | 8 | 0.05 | Standard. No special effect. |
| **Heavy Boulder** | Elo 1200 | 12 | 0.08 | Larger, heavier. Breaks through walls. |
| **Ice Shard** | Elo 1100 | 6 | 0.03 | Splits into 3 smaller shards on first impact (each radius 3, density 0.01). |
| **Rubber Ball** | Elo 1300 | 8 | 0.04 | Restitution 0.95. Bounces wildly inside structures. |
| **Steel Slug** | Elo 1500 | 5 | 0.10 | Tiny, extremely dense. Pierces through bodies. Ignores first block hit. |

Each player selects ammo *before* aiming. Only unlocked ammo is available.

### 4.2 Aiming & Firing UI

- **Cannon position:**
  - **Sandbox:** Left edge only: `x = 20, y = terrain surface at x=20`. Fires rightward.
  - **1v1 — Player 1 (Left):** `x = 20, y = terrain surface at x=20`. Fires rightward.
  - **1v1 — Player 2 (Right):** `x = mapWidth - 20, y = terrain surface at x=mapWidth-20`. Fires leftward.
- **Aiming input:** Click/touch and drag from the cannon. A trajectory preview arc (dotted line, 15 steps of ballistic prediction) shows the estimated path. The arc accounts for gravity but NOT wind (wind is hidden during aim to require adaptation).
- **Power:** Determined by drag distance. Min power = 5, max power = 30 (velocity magnitude applied to projectile).
- **Angle:** Determined by drag angle. Clamped to 10°–170° from horizontal (can't fire straight down or backwards).
- **Fire:** Release the drag to fire. Projectile spawned at cannon position with calculated velocity vector.
- **Keyboard fallback:** Arrow keys adjust angle (±2° per press), Up/Down adjusts power (±1 per press), Spacebar fires.

### 4.3 Projectile Flight & Impact

1. Projectile is spawned with velocity `{ x: power * cos(angle), y: -power * sin(angle) }`.
2. Physics engine handles the flight (gravity, wind forces applied each tick).
3. On `collisionStart` with any body:
   - If body is King → apply King damage formula (§5.2).
   - If body is a structure block → apply block damage formula (§5.4).
   - If body is terrain → projectile stops/bounces normally.
4. After 5 seconds OR all bodies sleeping (settled), the turn ends.

### 4.4 Camera During Combat

- **Default view:** Zoomed out to show the full battlefield (both fortresses visible).
- **On fire:** Camera smoothly tracks the projectile during flight (ease-out follow).
- **On impact:** Camera shakes proportionally to impact force. Brief 0.3s zoom toward impact point, then ease back to full view.
- **Spectator view (inactive player):** Same camera behavior, auto-tracking the opponent's projectile.

---

## 5. Game Mechanics & Physics Implementation

### 5.1 Material Properties Table

These are the **actual values in the codebase** (as of latest commit). The HP Multiplier column is used for the King damage formula (§5.2), not block HP.

| Material | Color (Hex) | Stroke | Density | Friction | Restitution | King Damage Mult | Block HP | Use Case |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **Wood** | `#A67C52` | `#8B6914` | 0.005 | 0.6 | 0.1 | 1.0x | 30 | Structural skeleton, cheap filler |
| **Stone** | `#7D7D7D` | `#5a5a5a` | 0.02 | 0.9 | 0.05 | 3.0x | 80 | Heavy armor, foundations |
| **Ice** | `#A5F2F3` | `#7FD4D5` | 0.008 | 0.02 | 0.05 | 0.5x | 15 | Deflection surfaces (slippery) |
| **Rubber** | `#FF69B4` | `#D4508A` | 0.005 | 1.0 | 0.8 | 1.0x | 40 | Shock absorbers, projectile repellers |
| **Steel** | `#434B4D` | `#2e3436` | 0.04 | 0.4 | 0.05 | 10.0x | 200 | Indestructible anchors (budget-expensive) |

### 5.2 The "King" Unit & Health System

- **Shape:** Circle, radius 12px.
- **Density:** 0.003. Restitution: 0.5. Friction: 0.5.
- **Visual:** Gold fill (`#FFD700`), chess king glyph (♚) rendered at center.
- **MaxHP:** 100.
- **Damage formula (on `collisionStart`):**
  ```
  impactForce = (bodyA.speed * bodyA.mass) + (bodyB.speed * bodyB.mass)
  if impactForce < IMPACT_THRESHOLD (5): ignore
  damage = ((impactForce - 5) * materialMultiplier) * 0.3
  kingHP = max(0, kingHP - damage)
  ```
- **Damage scaling factor (0.3):** Compensates for high-gravity (2.0) / high-density physics tuning. Without it, a single stone block falling 100px would instant-kill the King.
- **King death:** When `kingHP ≤ 0`, server emits `king_dead`. In competitive mode, this triggers RESULT state. In sandbox, the King stays at 0 HP until world is cleared.

### 5.3 Block HP & Destruction System

Blocks are not invincible. They have HP based on their material (see §5.1 table). This creates cascading structural failures.

- **Block HP assignment:** When a body is spawned, stamp `(body as any).blockHp = MATERIAL_BLOCK_HP[material]`.
- **Block damage formula (on `collisionStart` between projectile and block):**
  ```
  impactForce = projectile.speed * projectile.mass
  if impactForce < 3: ignore (minor tap)
  blockDamage = impactForce * 2.0
  blockHp = max(0, blockHp - blockDamage)
  ```
- **On block death (HP ≤ 0):**
  1. Remove the body from the physics world.
  2. Emit `block_destroyed` event with position, material, and velocity at death.
  3. Client renders destruction particles (§12.2).
  4. Remaining structure collapses naturally via physics (gravity pulls unsupported blocks down).
- **Visual damage indicators:**
  - HP > 66%: normal appearance.
  - HP 33%–66%: cracks overlay (thin dark lines drawn on block surface).
  - HP < 33%: heavy cracks + color desaturation (mix 30% gray into material color).

### 5.4 Procedural Terrain Algorithm

- **Goal:** Generate varied maps that force different building strategies.
- **Method:**
  1. Generate X coordinates from 0 to `mapWidth` at 25px intervals (configurable `resolution`).
  2. For each X, calculate Y using multi-octave 1D noise (sine harmonics with seeded phase offsets). Base height ~520px, amplitude ~60px, 3 octaves.
  3. Create a Matter.js concave body from the surface points + canvas-bottom closure.
  4. Identify "Build Zones": contiguous runs of points where slope < 15° and width ≥ 80px. These are where Kings spawn and where the AI is instructed to build.
- **1v1 terrain:**
  - Map is 1600px wide (2x current 800px). Each player's half is 800px.
  - Terrain is generated across the full 1600px width with the same seed. It is NOT mirrored — asymmetry is intentional ("adapt or die").
  - Each side has at least 1 guaranteed build zone (algorithm re-rolls if a side has zero flat areas).
- **Terrain body properties:** `isStatic: true`, `label: 'Terrain'`, `friction: 0.8`.

### 5.5 Sudden Death

If neither King is dead after 10 combat rounds:

1. **Round 11 onward:** After each round, the terrain at the edges of the map crumbles inward by 50px per round (bodies on crumbled terrain fall into the void and are removed).
2. **Round 13 onward:** Gravity increases by 0.5 per round (structures compress, top-heavy designs collapse).
3. **Round 15:** If still tied, the player with more remaining King HP wins. If HP is equal, it's a draw (both get +0 Elo).

---

## 6. Environmental Hazards

Hazards activate during the combat phase to prevent stalemates and reward adaptive fortress design. They are **announced 1 turn before activation** so the player can factor them into their aim.

### 6.1 Hazard Types

| Hazard | Trigger | Effect | Duration | Visual Warning |
|:---|:---|:---|:---|:---|
| **Wind Gust** | Rounds 3, 6, 9 | Constant horizontal force (±0.002 per tick) on all non-static bodies. Direction randomized. | 2 turns | Wind arrow overlay + particle streamers |
| **Earthquake** | Round 5 | Sinusoidal horizontal displacement of the terrain body (amplitude 3px, frequency 30Hz) for 2 seconds. Destabilizes tall structures. | 2 seconds, once | Screen shake + "EARTHQUAKE!" banner |
| **Meteor Strike** | Round 8 | A large circle (radius 15, density 0.1) spawns at a random X at y=-50 and falls straight down. Hits whatever is below. | Single impact | Red crosshair on impact zone for 3 seconds before drop |
| **Rising Flood** | Round 10+ (Sudden Death) | A static body (water surface) rises from the bottom at 2px/second. Bodies submerged below it are removed. | Ongoing, escalating | Blue translucent water overlay rising from bottom |

### 6.2 Hazard Selection

- Each match selects 2 hazards from the pool at match start (seeded random from terrain seed).
- Hazards are revealed to both players during TERRAIN_GEN state: "This match: Wind Gust (Round 3) + Earthquake (Round 5)".
- Players can factor this into their building strategy.

### 6.3 Hazard Implementation

- **Wind:** In `GameLoop.tick()`, if wind is active, apply `Matter.Body.applyForce(body, body.position, { x: windForce, y: 0 })` to every non-static body each tick.
- **Earthquake:** Temporarily modify terrain body position with `Matter.Body.setPosition(terrainBody, { x: originalX + sin(tick * 30) * 3, y: originalY })` for 120 ticks.
- **Meteor:** Spawn a circle body at `(randomX, -50)` with zero initial velocity. Gravity handles the rest. Remove after 5s.
- **Flood:** Spawn a static rectangle at `(mapWidth/2, 650)` and translate it upward by 2px/s. Run `Matter.Query.region()` to find bodies below the water line and remove them.

---

## 7. Map & Arena Layout (1v1)

### 7.1 Battlefield Dimensions

- **Total map:** 1600 x 600 pixels.
- **Player 1 (Left side):** x = 0 to x = 800. Build zone within this half.
- **Player 2 (Right side):** x = 800 to x = 1600. Build zone within this half.
- **No-man's-land:** There is no enforced gap. The dividing line at x=800 is conceptual. Projectiles cross freely.

### 7.2 Camera & Viewport

- **Canvas render size:** 800x600 (the HTML canvas element).
- **Virtual world size:** 1600x600 (scrollable).
- **Build phase camera:** Locked to the player's half (x 0–800 for P1, x 800–1600 for P2). Cannot see opponent.
- **Reveal phase camera:** Smooth pan from left to right across the full 1600px over 5 seconds.
- **Combat phase camera:**
  - Default: zoomed to fit the full 1600px width into the 800px canvas (0.5x scale).
  - On fire: camera tracks projectile at 1.0x zoom, scrolling as needed. Eases back to 0.5x after impact settles.
- **Sandbox camera:** Fixed 800x600, no scroll (current behavior).

### 7.3 King Placement

- Each side's King spawns at the center of the first build zone detected on that side.
- King Y = build zone surface Y - 15 (radius 12 + 3px gap).
- If no build zone exists on a side (extremely rare), King spawns at `(sideCenter, 400)` and falls to terrain.

### 7.4 Cannon Placement

- Player 1 cannon: `(10, terrainY_at_x10 - 20)`. Fires rightward.
- Player 2 cannon: `(1590, terrainY_at_x1590 - 20)`. Fires leftward.
- Cannons are static visual elements (not physics bodies). They rotate to match the player's aim angle.

---

## 8. Building Phase (Deep Dive)

### 8.1 Block Budget System

Instead of unlimited blocks, each player has a **Weight Budget** that constrains fortress complexity and forces material trade-offs.

| Match Type | Weight Budget |
|:---|:---|
| Ranked | 100 weight units |
| Casual | 150 weight units |
| Sandbox | Unlimited |

**Material weight costs:**

| Material | Weight per block |
|:---|:---|
| Wood | 1 |
| Stone | 3 |
| Ice | 2 |
| Rubber | 2 |
| Steel | 8 |

- A budget of 100 allows: 100 wood blocks, OR 33 stone blocks, OR 12 steel blocks, OR any mix.
- The AI prompt includes the remaining budget, so the AI can plan accordingly.
- The UI shows a "Budget: 72/100" bar that updates as blocks are placed.
- Max bodies per side hard cap: 40 (regardless of budget, for performance).

### 8.2 AI Prompt Rules

- **Max 2 prompt submissions per build phase.** This prevents spamming the AI with trial-and-error and rewards thoughtful prompts.
- **Each submission clears the previous build** (blocks from the prior prompt are removed before spawning the new set).
- **Prompt character limit:** 500 characters. Prevents token-stuffing and keeps latency low.
- **After AI build, God Tools remain available** for manual tweaks (add/remove individual blocks within budget).

### 8.3 Build Validation (Server-Side)

Before spawning any block, the server validates:

1. **Build zone enforcement:** Block center X must be within the player's half of the map (±10px tolerance for edge blocks).
2. **Budget check:** Total weight of all player blocks must not exceed the budget.
3. **Body cap:** Total body count must not exceed 40 per side.
4. **Bounds check:** Block position must be within `(0, 0)` to `(mapWidth, 600)`.
5. **King exclusion zone:** No block center can be within 20px of the King's center (prevents smothering).
6. **Overlap resolution:** Safe Spawn algorithm (§8.4) handles overlapping blocks.

### 8.4 Safe Spawn Algorithm (Overlap Resolution)

Implemented in `server/ai/overlap.ts`. Prevents physics explosions from overlapping blocks.

1. Create a temporary "ghost world" with no gravity.
2. Clone all existing world bodies (terrain, King, previously placed blocks) as static ghosts.
3. For each AI-generated body plan (in order):
   a. Create a ghost body at the specified position.
   b. Run `Matter.Query.collides()` against all existing ghosts.
   c. If collision detected → shift body upward by 5px. Repeat up to 10 times (50px max shift).
   d. If still colliding after 10 attempts → place at final adjusted position anyway (physics will resolve).
   e. Add the placed ghost as a static body for future collision checks.
4. Return adjusted body plans with adjustment count for logging.

---

## 9. AI Protocol (Prompt-to-Physics)

### 9.1 System Prompt Architecture

The system prompt is dynamically assembled from modules based on the current game context.

**Prompt structure:**
```
[Role definition]
[Physics rules: gravity, coordinates, canvas size]
[Terrain data: simplified surface points, build zones]
[King position]
[Block size guidance: default 30px, range 10-60px]
[Material descriptions with strategic hints]
[Budget remaining]
[Output format: JSON schema example]
[Critical instructions: stacking math, ground support, economy]
```

**Current implementation:** `server/ai/prompts.ts` → `buildSystemPrompt(ctx)`.

### 9.2 Terrain Context Injection

The AI receives:
- Simplified surface points (every other point, to reduce tokens): `(0,520) (50,515) (100,530)...`
- Build zones with surface Y: `x=200 to x=450, surface Y~510`
- King position: `(325, 498)`

This allows the AI to compute correct Y positions for block placement on uneven terrain.

### 9.3 JSON Schema & Validation (Zod)

```typescript
BodySchema = {
  shape: 'rectangle' | 'circle' | 'triangle',
  material: 'wood' | 'stone' | 'ice' | 'rubber' | 'steel',
  x: number,
  y: number,
  dimensions: number[],   // [width, height] or [radius]
  angle?: number,          // radians, default 0
  description?: string     // AI's reasoning for this block
}

FortressSchema = {
  thought_chain: string,   // AI's full reasoning
  bodies: BodySchema[]     // max 50 bodies
}
```

Validation runs on the server after Gemini responds. If validation fails, the server retries the AI call once. If the retry also fails, `build_error` is emitted to the client.

### 9.4 Prompt Injection Defense

- **Input sanitization:** User prompts are escaped (strip control characters, limit to 500 chars) before insertion into the system prompt.
- **Schema enforcement:** Even if the AI produces unexpected text, the Zod schema rejects anything that doesn't match the exact structure. Extra fields are stripped.
- **Coordinate clamping:** After Zod validation, all `x` values are clamped to the player's build zone range. All `y` values are clamped to `(0, 600)`. This prevents the AI from placing blocks on the opponent's side.
- **Body count cap:** Hard max of 50 bodies per response. Responses with more are truncated, not rejected.

### 9.5 AI Failure Handling

| Failure | Response |
|:---|:---|
| Gemini returns invalid JSON | Retry once with same prompt. On second failure → `build_error` with "AI couldn't design that — try a simpler prompt." |
| Gemini timeout (>15s) | Abort. Emit `build_error` with "AI took too long. Try again." Player's prompt count is NOT consumed. |
| Gemini rate limit (429) | Emit `build_error` with "AI is busy. Wait a few seconds." |
| Network error to Gemini | Emit `build_error` with "Connection to AI failed." |

### 9.6 AI Difficulty Tiers (Ghost/Bot Matches)

When matched against a Ghost (no human opponent), the AI's build quality is tuned to the player's Elo:

| Player Elo | Ghost AI Model | Prompt Modifier |
|:---|:---|:---|
| < 1000 | Gemini Flash | "Build a simple wall. Use only wood and stone. Max 10 blocks." |
| 1000–1300 | Gemini Flash | Standard prompt (no modifier). |
| > 1300 | Gemini Flash (higher temp) | "Build an advanced fortress. Use angled supports, a reinforced roof, and layered materials." |

### 9.7 Latency Management

- **Optimistic UI:** On prompt submit, immediately show "Architect is thinking..." overlay with a pulsing build-zone highlight.
- **Streaming:** The Gemini API supports streaming. Stream `thought_chain` tokens to the client in real-time via `build_status` events while the full JSON is still generating. Once the complete response arrives, parse and spawn.
- **Target latency:** < 2s to first visible text in the status overlay. < 10s to full build completion.

---

## 10. Technical Architecture

### 10.1 Technology Stack (Actual — As Built)

| Layer | Technology | Justification |
|:---|:---|:---|
| **Frontend** | React 19 + Vite + TypeScript | Component-based, fast HMR, strict types |
| **Styling** | Tailwind CSS 4 | Utility-first, zero CSS files to manage |
| **State** | Zustand | Lightweight store for UI state (material/shape selection, build status) |
| **Rendering** | HTML Canvas 2D | Direct pixel control, no DOM overhead for 100+ bodies |
| **Realtime** | Socket.io Client | Bidirectional events with auto-reconnect |
| **Backend** | Express 5 + Socket.io (Node.js) | Server-authoritative physics, single process handles game loop + AI |
| **Physics** | Matter.js (both server + client reference) | Server runs the simulation; client only renders snapshots |
| **AI** | Google Gemini 2.5 Flash (`@google/generative-ai`) | Fast structured JSON output, good spatial reasoning |
| **Validation** | Zod 4 | Runtime schema validation for AI responses |
| **Database** | Supabase (Postgres) — planned | Match history, replays, user profiles, Elo |
| **Auth** | Supabase Auth — planned | Anonymous → Telegram identity upgrade |

### 10.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React)                           │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ GameCanvas│  │  GodTools │  │ PromptBar│  │  StatusHUD   │   │
│  │ (Canvas2D)│  │ (Material │  │ (Text    │  │ (HP, Timer,  │   │
│  │  renders  │  │  + Shape  │  │  Input)  │  │  Budget)     │   │
│  │  bodies)  │  │  select)  │  │          │  │              │   │
│  └─────┬─────┘  └─────┬─────┘  └────┬─────┘  └──────────────┘   │
│        │              │              │                            │
│        └──────────────┴──────────────┘                            │
│                        │                                          │
│               useGameState.ts (Zustand + Socket.io)               │
│                        │                                          │
└────────────────────────┼──────────────────────────────────────────┘
                         │ Socket.io (WebSocket)
                         │ Events: spawn, request_build, clear_world,
                         │         fire_projectile, aim_update
                         │
┌────────────────────────┼──────────────────────────────────────────┐
│                    SERVER (Express + Socket.io)                    │
│                        │                                          │
│  ┌─────────────────────┴──────────────────────────┐               │
│  │              index.ts (Event Router)            │               │
│  │  - Socket.io handlers for all client events     │               │
│  │  - Collision damage system                      │               │
│  │  - Match state management                       │               │
│  └──────┬──────────┬──────────┬───────────────────┘               │
│         │          │          │                                    │
│  ┌──────▼──┐ ┌─────▼────┐ ┌──▼──────────┐                        │
│  │ Physics │ │   AI     │ │   Match     │                        │
│  │ Engine  │ │ Pipeline │ │   Manager   │                        │
│  │         │ │          │ │  (planned)  │                        │
│  │ world.ts│ │gemini.ts │ │             │                        │
│  │ loop.ts │ │schema.ts │ │ Supabase DB │                        │
│  │terrain.ts│ │prompts.ts│ │ connection  │                        │
│  │         │ │overlap.ts│ │             │                        │
│  └─────────┘ └──────────┘ └─────────────┘                        │
│                                                                   │
│  GameLoop: 60 Hz physics tick → 20 Hz state broadcast             │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### 10.3 Directory Structure (Actual)

```
/
├── src/                          # Frontend (React)
│   ├── main.tsx                  # React entry point
│   ├── App.tsx                   # Main layout, prompt form, status overlay, API key
│   ├── App.css                   # Legacy CSS (unused)
│   ├── index.css                 # Tailwind directives
│   ├── types.ts                  # Shared client types: BodyState, GameState, etc.
│   ├── components/
│   │   ├── GameCanvas.tsx        # Canvas 2D renderer (background, terrain, bodies, HP)
│   │   └── GodTools.tsx          # Material/shape selector buttons
│   └── hooks/
│       └── useGameState.ts       # Socket.io connection + Zustand state
│
├── server/                       # Backend (Express)
│   ├── index.ts                  # Server entry: Express, Socket.io handlers, damage system
│   ├── types.ts                  # Server types: KingState, BodyState, GameState
│   ├── physics/
│   │   ├── world.ts              # Matter.js engine creation, gravity, terrain init
│   │   ├── loop.ts               # GameLoop class: 60Hz tick, 20Hz broadcast
│   │   └── terrain.ts            # Procedural terrain: noise gen, build zone detection
│   └── ai/
│       ├── gemini.ts             # Gemini API caller with structured output
│       ├── schema.ts             # Zod schemas: BodySchema, FortressSchema
│       ├── prompts.ts            # System prompt builder with terrain context
│       └── overlap.ts            # Safe Spawn collision resolution
│
├── Fortress-AI.md                # This document
├── CLAUDE.md                     # Claude Code project instructions
├── package.json                  # Frontend dependencies
├── vite.config.ts                # Vite + React + Tailwind config
├── tsconfig.json                 # TypeScript project references
├── tsconfig.app.json             # Frontend TS config (strict)
├── eslint.config.js              # ESLint rules
└── index.html                    # HTML shell
```

### 10.4 Socket.io Event Protocol (Complete)

#### Client → Server

| Event | Payload | Handler | Phase |
|:---|:---|:---|:---|
| `spawn` | `{ x, y, material?, shape?, dimensions? }` | Create physics body at position | Build / Sandbox |
| `request_build` | `{ apiKey, prompt }` | Call Gemini → validate → Safe Spawn → add bodies | Build / Sandbox |
| `clear_world` | — | Remove all dynamic bodies, reset King | Build / Sandbox |
| `fire_projectile` | `{ angle, power, ammoType? }` | Spawn projectile with velocity vector | Combat (planned) |
| `aim_update` | `{ angle, power }` | Broadcast to opponent for live aim preview | Combat (planned) |
| `player_ready` | — | Signal build phase complete | Build (planned) |
| `join_queue` | `{ elo }` | Enter matchmaking queue | Lobby (planned) |
| `leave_queue` | — | Exit matchmaking queue | Queue (planned) |

#### Server → Client

| Event | Payload | Frequency | Phase |
|:---|:---|:---|:---|
| `gameState` | `{ bodies[], timestamp, kingHp, kingMaxHp }` | 20 Hz | Always |
| `terrain` | `{ points[], buildZones[], seed }` | Once on connect | Init |
| `build_status` | `{ status, message }` | Per AI stage | Build |
| `build_success` | `{ count, thought }` | Once after build | Build |
| `build_error` | `{ message }` | Once on failure | Build |
| `king_damage` | `{ hp, maxHp, damage, source }` | Per collision | Combat |
| `king_dead` | — | Once | Combat |
| `block_destroyed` | `{ bodyId, position, material, velocity }` | Per destruction | Combat (planned) |
| `world_cleared` | — | Once | Build / Sandbox |
| `match_found` | `{ matchId, opponentName, opponentElo, side, hazards[] }` | Once | Queue (planned) |
| `combat_turn` | `{ activePlayerId, round, turnTimer }` | Per turn start | Combat (planned) |
| `hazard_warning` | `{ type, activatesInTurns, params }` | 1 turn before | Combat (planned) |
| `hazard_active` | `{ type, params }` | On activation | Combat (planned) |
| `match_result` | `{ winnerId, eloChange, stats }` | Once | Result (planned) |

### 10.5 Physics Engine Configuration

- **Engine:** `Matter.Engine.create()` with `gravity.y = 2`, `enableSleeping = true`.
- **Tick rate:** 60 Hz fixed timestep (`Matter.Engine.update(engine, 16.666)`).
- **Broadcast rate:** 20 Hz (every 3rd tick).
- **Body dimension stamping:** All rectangles and triangles get `originalWidth`/`originalHeight` stamped at creation to prevent AABB-flicker during rotation. Broadcast reads these instead of bounds.
- **Sleeping:** Enabled. Bodies at rest stop consuming physics cycles. Important for post-build settlement and turn transitions ("all bodies sleeping" = turn is over).

### 10.6 Network Failure Handling

| Scenario | Server Behavior | Client Behavior |
|:---|:---|:---|
| **Client disconnect during BUILD** | Timer continues. If player doesn't reconnect within 15s, their current build (if any) stands as-is. If no build at all, server auto-builds a basic wall. | Show "Reconnecting..." overlay. On reconnect, resync terrain + current build state. |
| **Client disconnect during COMBAT** | If it's disconnected player's turn, auto-skip after 5s (no shot fired). If it's opponent's turn, no effect. If disconnected for 30s total, forfeit. | Show "Reconnecting..." overlay with countdown. On reconnect, fast-forward to current state. |
| **Gemini API timeout** | Emit `build_error`. Player's prompt attempt is NOT consumed (can retry). | Show error message. Re-enable prompt input. |
| **Gemini API down entirely** | After 2 consecutive failures, offer God-Tools-only build mode for the match. | Show "AI unavailable — build manually" message. |
| **Server crash** | Match is lost. When server restarts, incomplete matches are marked as `cancelled` (no Elo change). | Socket disconnect → "Server unreachable" → auto-retry → if new server instance, return to LOBBY. |

---

## 11. Multiplayer Architecture

### 11.1 Match Rooms (Socket.io)

Each competitive match runs in a Socket.io **room** (`match:{matchId}`). This isolates game state broadcasts to the two players in the match.

```typescript
// Server creates room on match start
socket.join(`match:${matchId}`);

// Broadcasts go to room only
io.to(`match:${matchId}`).emit('gameState', state);
```

- Each match has its own `Matter.Engine` instance (isolated physics worlds).
- The `GameLoop` is per-match. When a match ends, the loop is stopped and the engine is destroyed.
- Sandbox mode uses a global room (current behavior).

### 11.2 Database Schema (Supabase Postgres)

```sql
-- Player profiles (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Architect',
  elo int not null default 1000,
  games_played int not null default 0,
  games_won int not null default 0,
  unlocked_ammo text[] not null default '{"stone_shot"}',
  unlocked_skins text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Matchmaking queue
create table match_queue (
  player_id uuid primary key references profiles(id) on delete cascade,
  elo int not null,
  joined_at timestamptz not null default now()
);

-- Match records
create table matches (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('building', 'combat', 'finished', 'cancelled')),
  terrain_seed int not null,
  hazards text[] not null default '{}',
  player_1_id uuid not null references profiles(id),
  player_2_id uuid references profiles(id),  -- null for ghost matches
  player_1_fortress jsonb,                     -- FortressPlan JSON
  player_2_fortress jsonb,
  winner_id uuid references profiles(id),
  player_1_elo_change int default 0,
  player_2_elo_change int default 0,
  rounds_played int default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Combat moves (for replay)
create table moves (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references profiles(id),
  round int not null,
  move_type text not null check (move_type in ('fire', 'build')),
  payload jsonb not null,  -- { angle, power, ammoType } or FortressPlan
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_matches_status on matches(status);
create index idx_matches_players on matches(player_1_id, player_2_id);
create index idx_moves_match on moves(match_id, round);
create index idx_queue_elo on match_queue(elo);
```

### 11.3 Row Level Security (RLS)

```sql
-- Profiles: users can read all, update only own
alter table profiles enable row level security;
create policy "Public profiles" on profiles for select using (true);
create policy "Own profile" on profiles for update using (auth.uid() = id);

-- Matches: all authenticated can read, server inserts via service role
alter table matches enable row level security;
create policy "Read matches" on matches for select using (true);

-- Moves: players can insert only their own moves
alter table moves enable row level security;
create policy "Read moves" on moves for select using (true);
create policy "Insert own moves" on moves for insert
  with check (auth.uid() = player_id);

-- Queue: players manage only their own entry
alter table match_queue enable row level security;
create policy "Own queue" on match_queue for all using (auth.uid() = player_id);
```

### 11.4 Matchmaking Algorithm

```
1. Player joins queue with their Elo.
2. Server polls queue every 2 seconds.
3. Sort by joined_at (oldest first).
4. For each player P:
   a. Search for another player Q where |P.elo - Q.elo| ≤ eloBand.
   b. eloBand starts at 150. Increases by 50 every 10s that P has been waiting.
   c. If match found: remove both from queue, create match, emit match_found.
5. If P has waited 30s with no match: create Ghost match.
   a. Query a random finished match where winner Elo ≈ P.elo.
   b. Replay that match's fortress as the Ghost opponent.
   c. Ghost fires pre-recorded shots from the original match's move history.
```

### 11.5 Elo Rating System

- **K-factor:** 32 (standard for new systems).
- **Starting Elo:** 1000.
- **Floor:** 100 (can't drop below).
- **Formula:**
  ```
  expected = 1 / (1 + 10^((opponentElo - playerElo) / 400))
  newElo = oldElo + K * (result - expected)
  ```
  Where `result` = 1 (win), 0.5 (draw), 0 (loss).
- **Ghost matches:** Win = half K-factor (+16 max). Loss = no Elo change (can't lose Elo to a bot).

---

## 12. Visual Effects & Audio

### 12.1 Screen Shake

- **Trigger:** Projectile impact, earthquake hazard, King damage, block destruction.
- **Implementation:** On trigger, apply a random offset `(±amplitude, ±amplitude)` to the canvas context translation for `duration` ticks, decaying linearly to zero.
- **Parameters:**
  | Trigger | Amplitude (px) | Duration (ticks) |
  |:---|:---|:---|
  | Projectile impact | 4 | 12 |
  | Earthquake | 3 | 120 (2 seconds) |
  | King damage | 6 | 18 |
  | Block destroyed | 2 | 8 |

### 12.2 Particle System

Lightweight particle system for destruction feedback. Each particle is `{ x, y, vx, vy, life, color, size }`.

- **Block destruction:** On `block_destroyed`, spawn 8–12 particles at the block's position:
  - Color = block's material color (with slight random hue shift ±10%).
  - Velocity = random spread from block's velocity at death (±3 px/tick in each axis).
  - Size = 2–4px squares.
  - Life = 30–60 ticks (0.5–1 second), with alpha fade.
- **Projectile impact:** On projectile collision, spawn 6 particles:
  - Color = gray (#888).
  - Velocity = radial spread from impact point.
  - Size = 1–3px.
  - Life = 20 ticks.
- **King damage:** On `king_damage`, flash the screen red (canvas overlay with `rgba(255, 0, 0, 0.15)`) for 6 ticks.
- **Rendering:** Particles are updated and drawn in `GameCanvas.tsx` each frame. No physics bodies — just simple `x += vx, y += vy, vy += 0.1` (mini-gravity).

### 12.3 Audio Design

All sounds are short WAV/MP3 clips, preloaded on game start. Volume controlled by a global setting.

| Event | Sound | Duration | Notes |
|:---|:---|:---|:---|
| Block placed (God Tools) | Soft thud | 0.2s | Pitch varies by material (wood=low, ice=high) |
| AI build start | Mechanical whir | 1.0s | Loops while generating |
| AI build complete | Triumphant chime | 0.5s | |
| Projectile fire | Cannon boom | 0.4s | |
| Projectile impact (structure) | Crash / crumble | 0.5s | Pitch/volume scales with impact force |
| Projectile impact (terrain) | Dull thud | 0.3s | |
| Block destroyed | Material-specific shatter | 0.3s | Wood=crack, stone=crumble, ice=shatter, rubber=pop, steel=clang |
| King damage | Pain grunt + alarm | 0.4s | Urgency increases as HP decreases |
| King death | Dramatic death tone | 1.0s | Minor chord / defeat sting |
| Victory | Fanfare | 1.5s | |
| Defeat | Somber tone | 1.0s | |
| Turn start (your turn) | Bell ding | 0.2s | |
| Timer warning (5s left) | Tick-tock | Loops 5s | |
| Hazard warning | Alarm siren | 0.5s | |
| Earthquake | Rumble | 2.0s | Low-frequency rumble |
| Background music (build phase) | Calm ambient | Loops | Low volume, atmospheric |
| Background music (combat phase) | Tense percussion | Loops | Builds intensity per round |

**Audio implementation:** Use the Web Audio API (`AudioContext`). Preload all clips into `AudioBuffer` objects. Play via `AudioBufferSourceNode` for zero-latency playback. No external audio libraries needed.

### 12.4 Animation Timings

| Animation | Duration | Easing |
|:---|:---|:---|
| Block spawn (AI build) | 0.3s per block, staggered 50ms apart | Ease-out (pop-in scale 0→1) |
| Fog-of-war lift (Reveal phase) | 2.0s | Linear left-to-right wipe |
| "BATTLE BEGINS" text | 1.5s | Scale up + fade in, hold 1s, fade out |
| Victory/Defeat banner | 0.5s in, hold 3s, 0.5s out | Bounce ease-in, linear fade-out |
| HP bar damage flash | 0.2s | Flash white then return to color |
| Camera projectile track | Smooth, 0.1s response lag | Ease-out follow |

---

## 13. Progression & Ranking System

### 13.1 Rank Tiers

| Tier | Elo Range | Badge Color | Name |
|:---|:---|:---|:---|
| Bronze | 0–999 | `#CD7F32` | Apprentice |
| Silver | 1000–1199 | `#C0C0C0` | Builder |
| Gold | 1200–1399 | `#FFD700` | Engineer |
| Platinum | 1400–1599 | `#E5E4E2` | Architect |
| Diamond | 1600–1899 | `#B9F2FF` | Master Architect |
| Champion | 1900+ | `#FF4500` | Grand Architect |

### 13.2 Unlockable Content

#### Ammo Types (see §4.1)
Unlocked at specific Elo thresholds. Once unlocked, always available (no re-locking on Elo drop).

#### Block Skins (Cosmetic Only)
Block skins change the visual appearance but not physics properties. Applied to all blocks of that material.

| Skin | Material | Unlock Condition |
|:---|:---|:---|
| Default | All | Free |
| Medieval Stone | Stone | Win 10 matches |
| Cyberpunk Neon | Steel | Reach Gold rank |
| Frozen Crystal | Ice | Win 5 matches using only ice |
| Cherry Blossom | Wood | Play 25 matches |
| Volcanic | Rubber | Win a match with King HP > 80 |

Skins are stored in the player's `profiles.unlocked_skins` array. Selected skin is sent to the server and broadcast to the opponent (so they see your custom blocks).

### 13.3 Post-Match Rewards

After each match:
- **Elo change:** Displayed as "+12" or "-8" with animation.
- **Skin progress:** If the player is close to unlocking a skin, show progress bar: "Medieval Stone: 7/10 wins".
- **"Play again" incentive:** If the player won, show "Win streak: 3! Keep going?"

### 13.4 Leaderboard

- **Global top 100:** Sorted by Elo. Updated every 5 minutes (cached).
- **Accessible from LOBBY:** "Leaderboard" button.
- **Columns:** Rank #, Name, Elo, Win Rate, Matches Played.

---

## 14. Replay System

### 14.1 Data Format

A replay is fully reconstructible from:
```json
{
  "matchId": "uuid",
  "terrainSeed": 42,
  "hazards": ["wind_gust", "earthquake"],
  "player1": {
    "name": "Alice",
    "fortress": { /* FortressPlan JSON */ }
  },
  "player2": {
    "name": "Bob",
    "fortress": { /* FortressPlan JSON */ }
  },
  "moves": [
    { "round": 1, "playerId": "p1", "type": "fire", "angle": 0.78, "power": 20, "ammo": "stone_shot" },
    { "round": 1, "playerId": "p2", "type": "fire", "angle": 2.36, "power": 18, "ammo": "stone_shot" }
  ]
}
```

**Estimated size:** ~5–15 KB per match (JSON, uncompressed). Trivial to store.

### 14.2 Playback Engine

1. Client receives replay JSON.
2. Generates terrain from `terrainSeed`.
3. Spawns both fortresses from their JSON plans.
4. Sequentially replays each `fire` move: spawns projectile with saved angle/power/ammo, lets physics run until settled.
5. Between moves, applies hazard effects at the correct round triggers.
6. Result is deterministic because: same terrain seed + same fortress JSON + same fire vectors + same fixed timestep = identical simulation.

### 14.3 Playback Controls

- **Play / Pause** (Spacebar or tap).
- **Speed:** 0.5x / 1x / 2x / 4x (adjusts how many physics ticks per frame).
- **Scrub bar:** Timeline from Round 1 to final round. Clicking a point fast-forwards/rewinds to that round.
  - Implementation: For rewind, restart from scratch and fast-forward (replay is cheap). Cache state snapshots every round for faster scrubbing.
- **Camera:** Same as combat phase (full view, can manually zoom in).

### 14.4 Sharing

- **URL format:** `https://fortress.ai/replay/{matchId}` (or `t.me/FortressAIBot?start=replay_{matchId}`).
- **Open Graph meta tags:** Generate a preview image (screenshot of both fortresses pre-combat) for social media embeds.
- **No authentication required** to view a replay. Replays are public.
- **Expiry:** Replays are stored indefinitely. If storage becomes an issue, archive matches older than 90 days to cold storage.

---

## 15. Telegram Mini App (TMA) Integration

### 15.1 SDK Initialization

```typescript
import WebApp from '@twa-dev/sdk';

// On app load:
WebApp.ready();
WebApp.expand();   // Full-height mode
WebApp.setHeaderColor('#0a0a1a');  // Match game background
WebApp.setBackgroundColor('#0a0a1a');
```

### 15.2 User Identity

- On TMA load, extract `WebApp.initDataUnsafe.user` (Telegram user ID, name, avatar).
- Send `initData` to the server for validation (HMAC check against bot token).
- Server creates or links a Supabase auth user using the Telegram user ID as the external identity.
- If the user previously played as a Guest (localStorage), merge their stats into the authenticated profile (FR-06).

### 15.3 Deep Links

- **Challenge link:** `t.me/FortressAIBot?start=challenge_{challengerId}`
  - When the challenged user opens the link, the TMA auto-joins a private match room with the challenger.
- **Replay link:** `t.me/FortressAIBot?start=replay_{matchId}`
  - Opens the TMA in replay mode.

### 15.4 Haptic Feedback

| Event | Haptic Type |
|:---|:---|
| Block placed | `impactOccurred('light')` |
| Projectile fired | `impactOccurred('heavy')` |
| King damage | `notificationOccurred('error')` |
| Victory | `notificationOccurred('success')` |
| Button press | `impactOccurred('light')` |

### 15.5 Viewport & Scaling

- TMA runs in a webview with variable height (depends on Telegram UI).
- The game canvas (800x600) is scaled to fit the webview width using `transform: scale()` with `aspect-ratio: 4/3` on the container.
- On very tall screens, extra vertical space is used for the prompt input and status HUD (below the canvas).
- `WebApp.viewportStableHeight` is used to avoid resize jitter from the Telegram keyboard.

### 15.6 Main Button

- **LOBBY state:** Main button text = "FIND MATCH". Color = green. Taps → join queue.
- **BUILD state:** Main button text = "DONE BUILDING". Taps → signal ready.
- **COMBAT state (your turn):** Main button text = "FIRE!". Taps → fire projectile.
- **RESULT state:** Main button text = "PLAY AGAIN". Taps → rejoin queue.

---

## 16. Security & Compliance

### 16.1 Secrets Management

- **Production:** API keys stored in server environment variables (hosting provider secrets management, or Supabase Vault when Edge Functions are used).
- **Development:** `.env` file in `server/` (gitignored).
- **BYOK (Bring Your Own Key):** Players can supply their own Gemini API key via the client UI. This key is sent per-request over the Socket.io connection and used for that request only — never stored server-side.
- **Frontend:** Never receives server-side API keys. Only receives the Supabase Anon Key (public, safe to expose).

### 16.2 Client-Server Trust Boundary

- **Client is a dumb terminal.** It sends inputs (prompts, clicks, fire vectors) and renders state.
- **Server is authoritative.** It runs physics, validates builds, determines damage, declares winners.
- **The client CANNOT:**
  - Declare itself the winner.
  - Modify its own King HP.
  - Place blocks outside its build zone.
  - Fire more than once per turn.
  - Exceed the block budget.
- **All game-critical logic is server-side.** The client's only role is rendering and collecting input.

### 16.3 Anti-Cheat

- **Modified client detection:** Server validates all inputs. A modified client can't gain advantage because it can only send the same events a legitimate client would.
- **Rate limiting:** Max 2 build requests per build phase. Max 1 fire event per turn. Excess events are silently dropped.
- **Coordinate validation:** All spawn coordinates are clamped to the player's build zone. Out-of-bounds values are rejected.
- **Replay auditing:** All match inputs are stored. Suspicious matches (e.g., impossible accuracy) can be flagged for review.

### 16.4 Encryption

- **In transit:** HTTPS / WSS (TLS 1.3) for all traffic.
- **At rest:** Supabase encrypts database volumes. No PII beyond Telegram user ID and display name.

---

## 17. Monetization & Pro Features

### 17.1 AI Model Tiering

| Tier | Model | Access | Quality |
|:---|:---|:---|:---|
| **Free** | Gemini 2.5 Flash | All players | Fast (~3s), good structural reasoning |
| **BYOK** | Player's own key | Player provides API key | Same model, player pays token costs directly |
| **Pro (future)** | Gemini 2.5 Pro | Subscription ($4.99/mo) | Better spatial reasoning, more creative designs |

### 17.2 Cosmetic Shop (Future)

- Block skins, King skins, background themes, cannon skins.
- Purchased with "Gems" (premium currency) or earned through gameplay.
- **No pay-to-win.** All cosmetics are visual only. No gameplay advantage.

### 17.3 Telegram Stars Integration (Future)

- If deployed as a TMA, use Telegram Stars for in-app purchases.
- `WebApp.openInvoice()` for purchase flow.
- Server validates payment via Telegram Bot API before crediting Gems.

---

## 18. Testing Strategy

### 18.1 Unit Tests

| Module | Test Coverage |
|:---|:---|
| `server/ai/schema.ts` | Zod schema validation: valid plans pass, invalid plans reject (missing fields, wrong types, too many bodies, out-of-range dimensions) |
| `server/ai/overlap.ts` | Ghost world collision: overlapping blocks get shifted, non-overlapping stay put, terrain collisions resolved |
| `server/physics/terrain.ts` | Same seed → identical terrain. Build zone detection finds flat areas. Edge cases: all-flat, all-steep |
| Damage formula | Known inputs → expected HP change. Threshold filtering. Material multipliers. Edge: exactly at threshold |
| Elo calculator | Known Elo pairs + result → expected new Elo. Edge: at floor (100). Draw handling |
| Budget system | Material weight costs sum correctly. Over-budget rejected. Exactly-at-budget accepted |

**Framework:** Vitest (already in the Vite ecosystem).

### 18.2 Integration Tests

| Test | What It Validates |
|:---|:---|
| AI pipeline E2E | Send prompt → receive valid FortressPlan → Safe Spawn adjusts → bodies added to world |
| Socket.io round-trip | Client emits `spawn` → server creates body → next `gameState` broadcast includes new body |
| Match lifecycle | Queue → match → build → combat → result. Verify state transitions and event emissions |
| Reconnection | Disconnect client mid-build → reconnect → verify state is resynchronized |

### 18.3 Performance Benchmarks

| Metric | Target | How to Measure |
|:---|:---|:---|
| 60 FPS with 50 bodies per side (100 total) | No frame drops below 55 FPS | Chrome DevTools Performance tab on Snapdragon 7 device |
| GameLoop tick time | < 10ms per tick (60 Hz budget = 16.6ms) | `console.time` around `Matter.Engine.update` |
| AI response time | < 10s for 40-body fortress | Measure from `request_build` emit to `build_success` receipt |
| State broadcast size | < 5 KB per snapshot | Measure `JSON.stringify(gameState).length` |

### 18.4 Manual QA Checklist

- [ ] Spawn rectangle, rotate it — size stays visually constant (no AABB flicker).
- [ ] Drop stone vs wood — stone falls noticeably faster.
- [ ] Stack 4 blocks — settle without jitter (sleeping works).
- [ ] AI build places blocks on terrain surface, not floating or underground.
- [ ] King takes damage from falling blocks. HP bar updates.
- [ ] Clear world resets King HP and removes all blocks.
- [ ] Disconnect and reconnect — game state resynchronizes.

---

## 19. Deployment & Infrastructure

### 19.1 Hosting Strategy

| Component | Service | Justification |
|:---|:---|:---|
| **Game Server** (Express + Socket.io) | Railway / Fly.io | WebSocket support, easy scaling, auto-deploy from Git |
| **Frontend** (Static React build) | Vercel / Cloudflare Pages | Edge CDN, instant deploys, zero config |
| **Database** | Supabase (managed Postgres) | Built-in Auth, Realtime, RLS, free tier sufficient for launch |
| **Domain** | `fortress.ai` or `play-fortress.ai` | Short, memorable |

### 19.2 CI/CD Pipeline (GitHub Actions)

```yaml
# On push to main:
1. Lint (eslint) — both frontend and server
2. Type check (tsc --noEmit) — both frontend and server
3. Unit tests (vitest) — server
4. Build frontend (vite build)
5. Build server (tsc)
6. Deploy frontend to Vercel (auto)
7. Deploy server to Railway (auto via Dockerfile)
```

### 19.3 Environment Management

| Environment | Purpose | Database |
|:---|:---|:---|
| **Local** | Development | Local Supabase (or mocked) |
| **Staging** | Pre-release testing | Supabase staging project |
| **Production** | Live game | Supabase production project |

### 19.4 Scaling Considerations

- Each server instance handles multiple matches via Socket.io rooms.
- Target: 500 concurrent matches per instance (1000 connected sockets).
- If demand exceeds one instance: deploy multiple instances behind a load balancer with **sticky sessions** (required for Socket.io WebSocket connections).
- Redis adapter for Socket.io if multi-instance pub/sub is needed.

---

## 20. Project Roadmap (Phased Engineering Tasks)

> **Dependency note:** Combat mechanics (Phase 4) are built for sandbox first, then multiplayer wraps around them. VFX (particles, screen shake) are pulled into Phase 4 because combat feels broken without them. Phases 7 and 8 are independent of each other.

### Phase 1: Sandbox Foundation [COMPLETE]
- [x] Vite + React + TypeScript + Tailwind init
- [x] Express + Socket.io server with Matter.js physics (60 Hz tick, 20 Hz broadcast)
- [x] Procedural terrain generation (seeded noise, build zone detection)
- [x] God Tools: manual spawn with material + shape selection
- [x] Canvas 2D renderer (background, terrain, bodies, King, HP bars)
- [x] King unit with HP, collision damage system

### Phase 2: AI Architect Pipeline [COMPLETE]
- [x] Gemini API integration with structured JSON output
- [x] Zod schema validation for AI responses
- [x] System prompt with terrain context, King position, block size guidance
- [x] Safe Spawn overlap resolution
- [x] BYOK (Bring Your Own Key) API key management
- [x] Build status overlay (generating → building → success/error)

### Phase 3: Physics Polish [COMPLETE]
- [x] Fix AABB size flicker (stamp original dimensions)
- [x] Gravity tuning (1 → 2), sleeping enabled
- [x] Material property rebalancing (densities 4-5x heavier)
- [x] Block size reduction (50px → 30px default)
- [x] Damage scaling factor (0.3x) for new physics values

---

### Phase 4: Sandbox Combat [NEXT]

Single-player combat in the sandbox. Player builds a fortress, switches to fire mode, and bombards it. This phase delivers all combat *mechanics* without any multiplayer complexity.

#### 4-A: Build/Fire Mode Switch
> *Goal: Player can toggle between building and firing in the sandbox.*

- [ ] **4-A.1 — Add `sandboxMode` state to `App.tsx`**
  - New state: `sandboxMode: 'build' | 'fire'` (default `'build'`).
  - Pass down to `GameCanvas` and `GodTools` as props.

- [ ] **4-A.2 — Mode toggle in GodTools**
  - Add a segmented control ("Build / Fire") at the left edge of the GodTools bar.
  - When `fire` mode is selected, hide the material/shape selectors. Show the ammo label ("Stone Shot") and a power readout.
  - Keyboard shortcut: `Tab` toggles mode.

- [ ] **4-A.3 — Canvas click behavior by mode**
  - In `GameCanvas.tsx`, the existing `onClick` handler calls `onSpawn(x, y)`.
  - When mode is `fire`, the click should instead emit `fire_projectile` (not `spawn`).
  - Implementation: add a new prop `onFire: (angle: number, power: number) => void` to `GameCanvas`. `App.tsx` calls `fireProjectile(angle, power)` from `useGameState`.

#### 4-B: Cannon & Aiming UI
> *Goal: Player sees a cannon on the left edge and can aim/fire with click-drag.*

- [ ] **4-B.1 — Cannon rendering in `GameCanvas.tsx`**
  - Draw a simple cannon when in `fire` mode: a dark rectangle (20x8px) at `(20, terrainY_at_x20 - 20)`, rotated to match current aim angle.
  - The cannon base is a small circle (radius 6) at the pivot point.
  - No physics body — purely visual.

- [ ] **4-B.2 — Drag-to-aim interaction**
  - On `mousedown` / `touchstart` (fire mode only): record start position.
  - On `mousemove` / `touchmove`: calculate angle (from cannon to cursor) and power (drag distance, clamped 5–30). Update cannon rotation. Draw trajectory preview.
  - On `mouseup` / `touchend`: fire. Emit `fire_projectile` event with `{ angle, power }`.
  - Store `aimAngle` and `aimPower` in component state for real-time preview rendering.

- [ ] **4-B.3 — Trajectory preview arc**
  - While dragging, draw a dotted arc from the cannon position.
  - Compute 15 ballistic steps: `x += vx * dt`, `y += vy * dt`, `vy += gravity * dt` per step.
  - Draw as small circles (radius 2, white, 50% opacity) connected by nothing (dots only).
  - Arc does NOT account for wind (even when wind hazard is active later).

- [ ] **4-B.4 — Keyboard fallback aiming**
  - Left/Right arrows: adjust angle ±2° (display current angle in power readout area).
  - Up/Down arrows: adjust power ±1 (display current power).
  - Spacebar: fire with current angle + power.
  - Visual: show numeric readout "Angle: 45° | Power: 20" near cannon when using keyboard.

#### 4-C: Projectile System (Server)
> *Goal: Server spawns projectile bodies and handles their lifecycle.*

- [ ] **4-C.1 — `fire_projectile` Socket.io handler in `server/index.ts`**
  - New event handler: `socket.on('fire_projectile', (data) => { ... })`.
  - Payload: `{ angle: number, power: number }`.
  - Calculate cannon position: `x = 20, y = interpolateTerrainY(20) - 20` (reuse terrain points).
  - Create projectile body: `Matter.Bodies.circle(cannonX, cannonY, 8, { density: 0.05, restitution: 0.3, friction: 0.2, label: 'projectile' })`.
  - Set velocity: `Matter.Body.setVelocity(body, { x: power * cos(angle), y: -power * sin(angle) })`.
  - Add to world.

- [ ] **4-C.2 — Projectile lifespan (auto-remove after 5s)**
  - After spawning, start a `setTimeout(5000)` that removes the projectile body from the world.
  - Also remove if projectile goes out of bounds (y > 650 or x < -50 or x > 850).
  - Emit `projectile_removed` event to client (so it can clean up any tracking state).

- [ ] **4-C.3 — Projectile rendering in `GameCanvas.tsx`**
  - Bodies with `label === 'projectile'` get special rendering: dark gray fill (`#333`), white stroke, slight motion blur (draw a faint trail — 3 translucent circles behind it at previous positions).
  - Store last 3 positions in a `useRef` map keyed by body ID for trail rendering.

#### 4-D: Block HP & Destruction (Server)
> *Goal: Blocks take damage from projectile impacts and break apart.*

- [ ] **4-D.1 — Block HP constants and stamping**
  - Add `MATERIAL_BLOCK_HP` table to `server/index.ts`: `{ wood: 30, stone: 80, ice: 15, rubber: 40, steel: 200 }`.
  - In `stampDimensions()` (or a new `stampBlockProps()` called alongside it), also stamp `(body as any).blockHp = MATERIAL_BLOCK_HP[material]`.
  - Apply to both manual spawn and AI build paths.

- [ ] **4-D.2 — Projectile-vs-block collision handler**
  - In the existing `Matter.Events.on(engine, 'collisionStart', ...)` handler, add a new branch:
    - If one body is `projectile` and the other is a structure block (not terrain, not King):
      ```
      impactForce = projectile.speed * projectile.mass
      if impactForce < 3: skip
      blockDamage = impactForce * 2.0
      block.blockHp = max(0, block.blockHp - blockDamage)
      ```
    - If `blockHp <= 0`: remove body from world, emit `block_destroyed { bodyId, position, material, velocity }`.
  - Existing King damage handler remains unchanged (projectiles hitting King use the King formula).

- [ ] **4-D.3 — Block HP in gameState broadcast**
  - In `loop.ts` `broadcastState()`, include `blockHp` and `blockMaxHp` in each body's data (if present).
  - Client uses this for visual damage indicators.

- [ ] **4-D.4 — Visual damage indicators in `GameCanvas.tsx`**
  - After drawing a block's fill, overlay crack lines based on HP ratio:
    - HP > 66%: no overlay.
    - HP 33%–66%: draw 2–3 thin dark lines (cracks) across the block surface at fixed positions.
    - HP < 33%: draw 5+ crack lines + desaturate the fill color (blend 30% gray).
  - Cracks are deterministic per body ID (use `bodyId % 7` to seed crack positions so they're stable between frames).

#### 4-E: Screen Shake
> *Goal: Canvas shakes on impacts for game feel.*

- [ ] **4-E.1 — Screen shake state in `GameCanvas.tsx`**
  - Add a `useRef` for shake state: `{ amplitude: number, remaining: number }`.
  - Each frame, if `remaining > 0`: apply random offset `(±amplitude * (remaining/max), ±amplitude * (remaining/max))` to canvas `ctx.translate()` before drawing. Decrement `remaining`.
  - Decay is linear (amplitude scales down as remaining ticks decrease).

- [ ] **4-E.2 — Shake triggers from Socket.io events**
  - On `king_damage`: set shake `{ amplitude: 6, remaining: 18 }`.
  - On `block_destroyed`: set shake `{ amplitude: 2, remaining: 8 }`.
  - If a shake is already active and a new trigger arrives, take the larger amplitude and reset remaining.

#### 4-F: Destruction Particles
> *Goal: Blocks burst into colored debris when destroyed.*

- [ ] **4-F.1 — Particle system module: `src/effects/particles.ts`**
  - Export a `ParticleSystem` class:
    ```typescript
    interface Particle { x, y, vx, vy, life, maxLife, color, size }
    class ParticleSystem {
      particles: Particle[] = [];
      emit(x, y, count, color, velocity): void;   // spawn N particles
      update(): void;                                // tick all particles (position + life)
      draw(ctx: CanvasRenderingContext2D): void;    // render living particles
    }
    ```
  - `update()`: for each particle, `x += vx`, `y += vy`, `vy += 0.1` (mini-gravity), `life--`. Remove when `life <= 0`.
  - `draw()`: fill rect at `(x, y)` with `size` and `color`, alpha = `life / maxLife`.
  - Cap at 200 particles max (old ones evicted FIFO if exceeded).

- [ ] **4-F.2 — Integrate particles into `GameCanvas.tsx`**
  - Create a `ParticleSystem` instance via `useRef`.
  - On `block_destroyed` event: call `particles.emit(position.x, position.y, 10, materialColor, baseVelocity)`.
  - In the render loop: call `particles.update()` then `particles.draw(ctx)` after drawing all bodies.

- [ ] **4-F.3 — Projectile impact particles**
  - Listen for a new `projectile_impact` event (emitted by server on first collision of a projectile).
  - Spawn 6 gray particles at impact position.
  - Alternatively, detect client-side by watching for projectile velocity changes between frames.

#### 4-G: Integration & Polish
> *Goal: Everything works together smoothly in sandbox.*

- [ ] **4-G.1 — `useGameState.ts` additions**
  - Add `fireProjectile(angle: number, power: number)` callback: emits `fire_projectile` event.
  - Add `block_destroyed` event listener: store in a ref or emit to a callback for particles/shake.
  - Add `projectile_impact` event listener for impact particles.

- [ ] **4-G.2 — Projectile cleanup**
  - When a projectile is removed (lifespan or out-of-bounds), ensure it vanishes from the next `gameState` broadcast. No ghost bodies.

- [ ] **4-G.3 — End-to-end testing**
  - Build a fortress (AI or manual) → switch to fire mode → aim → fire → projectile flies → hits blocks → blocks take damage (cracks visible) → block destroyed (particles + shake) → structure collapses → King takes damage from falling debris.
  - Verify: projectile auto-removes after 5s. Screen shake decays. Particles fade. King HP updates.

---

### Phase 5: 1v1 Battlefield Architecture

Refactor the server from a single global engine to per-match isolated instances. Widen the map to 1600px. This is a **major architectural change** and the hardest phase.

#### 5-A: Match Manager (Server Refactor)
- [ ] **5-A.1 — `server/match/MatchManager.ts`**
  - New class that creates, tracks, and destroys match instances.
  - `createMatch(player1Socket, player2Socket, seed): MatchInstance`
  - `destroyMatch(matchId): void`
  - Each `MatchInstance` owns: its own `Matter.Engine`, `Matter.World`, `GameLoop`, terrain, two Kings, match state machine.

- [ ] **5-A.2 — `server/match/MatchInstance.ts`**
  - Encapsulates everything that currently lives as globals in `server/index.ts`: engine, world, terrain, kingBody, kingState, gameLoop, collision handlers.
  - Broadcasts `gameState` only to sockets in its room (`match:{id}`).
  - Has a `phase` property: `'building' | 'reveal' | 'combat' | 'finished'`.

- [ ] **5-A.3 — Refactor `server/index.ts`**
  - Move all physics/game logic out of `index.ts` into `MatchInstance`.
  - `index.ts` becomes a thin router: handles `connection`, `join_queue`, `leave_queue`, and delegates `spawn` / `request_build` / `fire_projectile` to the player's active `MatchInstance`.
  - Keep sandbox mode as a special `MatchInstance` with no opponent and no phase timer (preserves current behavior).

#### 5-B: 1600px Battlefield
- [ ] **5-B.1 — Terrain generator: 1600px width**
  - Update `server/physics/terrain.ts` to accept `width` parameter (currently hardcoded 800).
  - For 1v1 matches, pass `width: 1600`. For sandbox, pass `width: 800`.
  - Guarantee at least 1 build zone per 800px half (re-roll if needed).

- [ ] **5-B.2 — Two Kings, two build zones**
  - `MatchInstance` spawns King 1 in the first build zone of the left half (x < 800).
  - King 2 in the first build zone of the right half (x ≥ 800).
  - Each player's build zone is restricted to their half.

- [ ] **5-B.3 — Two cannons**
  - Player 1 cannon at `(10, terrainY - 20)`, fires rightward.
  - Player 2 cannon at `(1590, terrainY - 20)`, fires leftward (angle is mirrored: velocity x is negated).

- [ ] **5-B.4 — Client camera system**
  - Add `cameraX` state to `GameCanvas.tsx`. Default 0. Range `[0, worldWidth - canvasWidth]`.
  - All drawing coordinates offset by `-cameraX`.
  - Build phase: lock camera to player's half.
  - Combat phase: zoom out (scale 0.5x to fit 1600px) or allow manual scroll.

#### 5-C: Per-Socket State
- [ ] **5-C.1 — Player-to-match mapping**
  - Server tracks: `Map<socketId, { matchId, side: 'left' | 'right' }>`.
  - When a socket emits `spawn` or `fire_projectile`, the server looks up which match and which side, then routes to the correct `MatchInstance`.

- [ ] **5-C.2 — Build zone enforcement**
  - `spawn` and `request_build` handlers validate that block X is within the player's half.
  - Reject (silently drop) blocks placed on the opponent's side.

---

### Phase 6: Multiplayer Combat Flow

Build the full match lifecycle around the combat mechanics from Phase 4 and the architecture from Phase 5.

- [ ] **6.1 — Matchmaking queue**
  - `join_queue` / `leave_queue` handlers in `server/index.ts`.
  - In-memory queue (array of `{ socketId, elo }`). Polled every 2s.
  - Elo banding: ±150, expanding ±50 every 10s. At 30s → Ghost match.
  - On match: create `MatchInstance`, join both sockets to room, emit `match_found`.

- [ ] **6.2 — Build phase with timer**
  - `MatchInstance` enters `building` phase. Starts 60s countdown.
  - Emits `build_phase_start { timer: 60 }` to room.
  - Tracks prompt count per player (max 2). Tracks weight budget (100 per player).
  - On timer expire or both players signal `player_ready` → transition to reveal.

- [ ] **6.3 — Fog-of-war (client)**
  - During build phase, `GameCanvas` renders the opponent's half as a dark overlay with "?" icon.
  - Server only includes bodies from the player's own half in `gameState` during build phase.

- [ ] **6.4 — Reveal phase**
  - Server broadcasts full state (both sides) to both clients.
  - Client plays 5s camera pan animation across the full 1600px.
  - "BATTLE BEGINS" text overlay with scale-up animation.

- [ ] **6.5 — Turn system**
  - `MatchInstance` tracks: `currentTurn: 'player1' | 'player2'`, `round: number`, `turnTimer: number`.
  - Emits `combat_turn { activePlayerId, round, turnTimer: 15 }` at start of each turn.
  - Only the active player's `fire_projectile` events are accepted. Inactive player's are dropped.
  - After fire: wait for all bodies to sleep (or 5s timeout) → evaluate King HP → next turn or result.

- [ ] **6.6 — Match result**
  - On King death: emit `match_result { winnerId, loserId, eloChange, stats }`.
  - Stats: rounds played, damage dealt, blocks destroyed.
  - `MatchInstance` phase → `finished`. Stop game loop. Clean up after 10s.

- [ ] **6.7 — Sudden death (round 11+)**
  - Round 11+: shrink terrain by 50px from each edge per round (remove bodies on crumbled terrain).
  - Round 13+: increase `engine.gravity.y` by 0.5 per round.
  - Round 15: highest remaining King HP wins. Equal = draw.

- [ ] **6.8 — Ghost matches**
  - Query a previous match's fortress JSON + move history.
  - Spawn the ghost's fortress. Replay the ghost's fire moves on a timer (one per turn).
  - Win = half Elo gain. Loss = no Elo loss.

---

### Phase 7: Persistence & Progression

- [ ] **7.1 — Supabase setup**
  - Create Supabase project. Run SQL migrations (§11.2 schema).
  - Install `@supabase/supabase-js` in server.
  - Configure `.env` with Supabase URL + service role key.

- [ ] **7.2 — Auth integration**
  - Anonymous auth on first visit (Supabase anonymous sign-in).
  - Store JWT in `httpOnly` cookie or `localStorage`.
  - Server validates JWT on socket connection.

- [ ] **7.3 — Player profiles**
  - Auto-create `profiles` row on first auth.
  - Elo, games played, games won tracked and updated after each match.

- [ ] **7.4 — Match history**
  - `MatchInstance` writes to `matches` table on match start and on finish.
  - `moves` table records each `fire` event for replay.

- [ ] **7.5 — Replay system**
  - Replay page/component that loads match data by ID.
  - Generates terrain from seed, spawns fortresses, replays fire moves sequentially.
  - Playback controls: play/pause, 0.5x/1x/2x/4x speed, scrub bar.
  - Share URL: `/replay/{matchId}`.

- [ ] **7.6 — Elo calculation**
  - K=32, floor=100. Standard Elo formula (§11.5).
  - Ghost matches: half K on win, zero on loss.

- [ ] **7.7 — Ammo unlocks**
  - Check player Elo against unlock thresholds (§4.1 table) on match start.
  - Send unlocked ammo list in `match_found` payload.
  - Ammo selection UI in fire mode (dropdown or button row).

- [ ] **7.8 — Leaderboard**
  - API endpoint: `/api/leaderboard?limit=100`.
  - Cached in-memory, refreshed every 5 minutes.
  - Client component: table with rank, name, Elo, win rate.

---

### Phase 8: Environmental Hazards

Can be done in parallel with Phase 7. No database dependency.

- [ ] **8.1 — Hazard selection per match**
  - On `MatchInstance` creation, select 2 hazards from the pool using `terrainSeed` as RNG seed.
  - Include in `match_found` and `terrain` payloads so both clients know.
  - Display hazard icons + trigger rounds during build phase.

- [ ] **8.2 — Wind gust**
  - In `GameLoop.tick()`, if wind is active, apply horizontal force to all non-static bodies.
  - Direction and magnitude seeded per activation. Lasts 2 turns.
  - Client: draw wind particle streamers (small dots moving horizontally across canvas).

- [ ] **8.3 — Earthquake**
  - Oscillate terrain body position horizontally (amplitude 3px, 30Hz) for 2 seconds.
  - Client: screen shake overlay + "EARTHQUAKE!" banner.

- [ ] **8.4 — Meteor strike**
  - Spawn a large dense circle at random X, y=-50. Gravity drops it.
  - Client: red crosshair overlay on impact zone for 3s before drop.
  - Remove meteor body after 5s.

- [ ] **8.5 — Rising flood (sudden death)**
  - Spawn a static rectangle at bottom, translate upward at 2px/s.
  - Remove bodies submerged below water line.
  - Client: blue translucent water overlay.

- [ ] **8.6 — Hazard warning UI**
  - Emit `hazard_warning` 1 turn before activation.
  - Client: show hazard icon + "Wind Gust in 1 turn!" banner.

---

### Phase 9: Audio & Visual Polish

- [ ] **9.1 — Web Audio API sound manager**
  - `src/audio/SoundManager.ts`: preload all clips into `AudioBuffer` map. `play(name)` method.
  - Volume control (global slider in settings).
  - Mute toggle.

- [ ] **9.2 — Combat sound effects**
  - Cannon fire, projectile impact (structure/terrain), block destroyed (per material), King damage/death.
  - Pitch/volume scale with impact force.

- [ ] **9.3 — UI sound effects**
  - Block placed, AI build start/complete, button clicks, mode switch.

- [ ] **9.4 — Background music**
  - Build phase: calm ambient loop.
  - Combat phase: tense percussion loop.
  - Crossfade on phase transition (1s fade).

- [ ] **9.5 — Block spawn animation**
  - On AI build, blocks appear with staggered pop-in (scale 0→1, 0.3s each, 50ms stagger).

- [ ] **9.6 — Phase transition animations**
  - Fog-of-war lift: left-to-right wipe (2s).
  - "BATTLE BEGINS" text: scale up + fade in, hold 1s, fade out.
  - Victory/Defeat banner: bounce-in, hold 3s, fade-out.

- [ ] **9.7 — Victory/Defeat screen**
  - Full-screen overlay with result, stats, Elo change, action buttons (Rematch, New Match, Replay, Share).

---

### Phase 10: Telegram Mini App

- [ ] **10.1 — TMA SDK integration**
  - Install `@twa-dev/sdk`. Initialize `WebApp.ready()`, `expand()`, theme colors.
  - Detect TMA environment vs standalone web.

- [ ] **10.2 — Telegram Auth → Supabase linking**
  - Extract `initData` from TMA. Send to server for HMAC validation.
  - Create/link Supabase auth user with Telegram user ID.
  - Guest progress merge (FR-06).

- [ ] **10.3 — Deep link challenges**
  - Generate `t.me/FortressAIBot?start=challenge_{userId}` links.
  - Parse `start` param on TMA load → auto-join private match room.

- [ ] **10.4 — Haptic feedback**
  - Wire up `impactOccurred` / `notificationOccurred` to game events (§15.4 table).

- [ ] **10.5 — Viewport scaling**
  - Scale canvas to fit webview width. Use `viewportStableHeight` to avoid keyboard jitter.
  - Prompt input and HUD adapt to remaining vertical space.

- [ ] **10.6 — Main button state management**
  - Map game state to Telegram Main Button text/color (§15.6).

- [ ] **10.7 — Telegram Stars payments (cosmetics)**
  - `WebApp.openInvoice()` for Gem purchases.
  - Server validates via Bot API before crediting.

---

### Phase 11: Launch & Scale

- [ ] **11.1 — CI/CD pipeline**
  - GitHub Actions: lint → type check → unit tests → build → deploy.
  - Separate jobs for frontend (Vercel) and server (Railway/Fly.io).

- [ ] **11.2 — Staging environment**
  - Separate Supabase project. Separate server instance.
  - Deploy on every PR merge to `develop` branch.

- [ ] **11.3 — Production deployment**
  - Deploy on merge to `main`.
  - Domain setup, SSL, CORS configuration.

- [ ] **11.4 — Performance profiling**
  - Test 100 bodies at 60 FPS on target device (Snapdragon 7-series).
  - Profile `GameLoop.tick()` duration. Optimize if > 10ms.
  - Measure `gameState` payload size. Compress if > 5 KB.

- [ ] **11.5 — Load testing**
  - Simulate 500 concurrent matches (1000 sockets) with Artillery.io or k6.
  - Identify bottleneck (CPU, memory, network).
  - Add Redis adapter for Socket.io if multi-instance needed.

- [ ] **11.6 — Monitoring & analytics**
  - Sentry for error tracking (both client and server).
  - PostHog for product analytics (prompt success rates, match completion rates, retention).
  - Uptime monitoring (Uptime Robot or similar).

- [ ] **11.7 — Public launch**
  - Submit TMA to BotFather for review.
  - Social media announcement. Share deep links.
  - Monitor error rates and server load for first 48 hours.

---

## Appendix A: Glossary

| Term | Definition |
|:---|:---|
| **Architect** | A player. The person writing prompts to design fortresses. |
| **King** | The unit each player must protect. Circle, radius 12, 100 HP. |
| **God Tools** | Manual block spawning tools (sandbox / post-AI-build tweaking). |
| **Safe Spawn** | Server-side algorithm that resolves overlapping blocks before adding to physics world. |
| **Ghost Match** | A match against a bot that replays a real human's previous fortress + combat moves. |
| **BYOK** | Bring Your Own Key. Player supplies their own Gemini API key. |
| **Build Zone** | A flat area on the terrain surface suitable for building. Detected automatically. |
| **AABB** | Axis-Aligned Bounding Box. The rectangular bounds of a rotated body — changes size with rotation angle. |
| **Sleeping** | Matter.js optimization. Bodies at rest stop consuming physics calculations. |
| **Elo** | Rating system measuring player skill. Named after Arpad Elo. |
| **TMA** | Telegram Mini App. A web app running inside the Telegram client. |
