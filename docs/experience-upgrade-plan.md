# Fortress AI: Playing Experience And Graphics Upgrade

Status: original investigation below, plus playable cartoon integration, two distinct royals, material-specific combat effects and the user's reference-driven illustrated menu and battlefield. V6 playtest corrections and the living-character roadmap are in `asset-workbench/living-kings-v6/verification.md`. Battle art/HUD verification is in `asset-workbench/battle-v5/verification.md`; original menu/audio checks are in `asset-workbench/royal-menu-v4/verification.md`. Earlier milestones remain in `docs/cartoon-v1-verification.md`, `asset-workbench/cartoon-v2/verification.md` and `asset-workbench/cartoon-v3/verification.md`. The wider roadmap is not complete. The latest user-provided interface supersedes the earlier minimal-menu styling recommendation below.
Audit date: 2026-10-19. Baseline: `e127edd`.
Chosen art direction: **bright cartoon artillery**, selected by the user during this audit.

## 1. Product Decision

Build a colorful, expressive artillery game whose distinctive pleasure is designing a fortress and watching a well-aimed shot cause an understandable structural collapse.

The target experience is:

> Build something clever. Aim with confidence. Watch a satisfying chain reaction. Understand why you won or lost. Want another round.

The current art and mobile problems are symptoms of a broader presentation and control problem. More generated sprites alone will not resolve it. Prioritize reliable play, then a coherent art direction, then animation and audio that communicate gameplay.

We cannot establish that the game is better than DDTank through screenshots or a plan. Treat that as a measurable product target, with comparative playtests and release gates. This audit reviewed official competitor material; it did not perform a controlled hands-on DDTank comparison.

## 2. Evidence And Scope

Investigation included source inspection, independent mobile and rendering/combat specialist reviews, an inspected sprite contact sheet, development-browser sessions, and production-build browser sessions.

Production viewport checks included 320x568 portrait, 844x390 landscape, 390x844 portrait combat, and 1280px-wide desktop build/combat. Desktop and mobile development sessions were also inspected. The local production build passed.

Evidence is stored in `output/experience-audit-2026-10-19/`:

| Capture | Finding |
| --- | --- |
| `production-small-portrait-build.png` | At 320x568, the build canvas is 320x388. Ground and characters around world y=520 cannot fit in the visible play area. Controls cover its lower region. |
| `production-mobile-landscape-build.png` | At 844x390, rotation enables desktop layout. Canvas bounds extend from y=223 to about y=525, below the viewport. |
| `production-desktop-build.png` | At 1280x900, the build canvas extends to about y=973. The prompt overlays the lower scene. |
| `production-desktop-combat.png` | Large dark sky, small characters, a dominant minimap, and limited environmental identity. |
| `production-mobile-combat.png` | The camera can present terrain and sky without the player or target in the current view. |
| `mobile-build.png` | At 390x844, material/shape tools, tutorial hint and prompt compete with the terrain. |

Physical iOS/Android devices, sound listening tests, thermal performance and comparative player preference have not been validated. Browser touch emulation is evidence of layout and event behavior, not a substitute for those checks.

Verification baseline: `npm run build` passed. `npm test` from `server/` could not start because the local install lacks the `vitest` executable (`sh: vitest: command not found`). No unit-test pass is claimed. Restore the declared test dependencies before using that suite as a release gate.

Earlier menu checks established asset loading and some navigation. They did not establish battlefield visibility, touch correctness, animation continuity or combat quality.

## 3. Priority Problems

### P0: Players must be able to see and trust the game

| Problem | Evidence | Proposed fix |
| --- | --- | --- |
| Battlefield disappears on short portrait screens | Reproduced in production. `src/App.tsx:321`; `src/components/GameCanvas.tsx:160` | One measured play rectangle, camera zoom and world-to-screen transform; reserve control space before sizing the world. |
| Landscape uses desktop sizing | Reproduced in production. `GameCanvas.tsx:160`; `src/index.css:78` | Touch-aware layouts using width, height and pointer capability; keep touch controls across rotation. |
| Cancellation can submit a shot | Source confirmed. `GameCanvas.tsx:1971`, `:2093` | Separate pointer cancellation from commitment; clear gestures on phase changes, blur and rotation; validate turn before commit. |
| Aiming preview and server simulation disagree | Source confirmed. Client integration at `GameCanvas.tsx:1027` omits Matter's timestep-squared force integration; launch positions also differ from `server/game/GameSession.ts:427` | Shared launch configuration and a verified trajectory predictor; use the actual muzzle origin, wind, damping and simulation steps. |
| Previous snapshot transforms are mutated before interpolation | Source confirmed. `src/hooks/useGameState.ts:158`; `GameCanvas.tsx:274` | Independent timestamped snapshots with immutable previous/current transforms and round epochs. |
| Development snapshots can be disabled by StrictMode cleanup | Source confirmed. `useGameState.ts:94`; root uses StrictMode | Correct mount/unmount lifecycle and regression coverage in development and production. |

### P1: Combat, rules and camera must feel consistent

| Problem | Evidence | Proposed fix |
| --- | --- | --- |
| Touch cannot select the full configured aiming range | `GameCanvas.tsx:1895`, `:1944`, `:1963`: power starts at 25 and only increases; absolute horizontal distance prevents angles above 90 degrees | Persistent independent angle/power controls, fine adjustment and explicit Fire. Decide legal backward-fire rules and apply them equally on every input method. |
| A first touch can place a block before a two-finger pan | `GameCanvas.tsx:1846`, `:1882`; mobile toolbar exposes BUILD only | Explicit Build/Inspect modes; block ghost and release-to-place; cancel placement when a pan is recognized. |
| No authoritative flight/resolving UI state | `server/game/MatchStateMachine.ts:128`; client can show muzzle feedback before rejection | Aiming -> Shot Accepted -> Flight -> Impact/Settle -> Handoff, with shot IDs and command acknowledgments. |
| Thin surfaces can be missed by fast projectiles | `GameSession.ts:435` sets `isBullet`, but installed Matter does not implement this as continuous collision detection | Swept collision detection or measured adaptive substeps, tested against the thinnest supported roofs. |
| Some build commands/shapes escape consistent durability and budgets | `GameSession.ts:254`, `:341`, `:705`, `:732` | Shared server command validation, explicit HP for every shape, one resource budget, and async build phase/session revalidation. |
| Hazard placement and initiative can favor a side | World is 2400px in current constants; lava/rocks still use x=400..1200 in `server/physics/hazards.ts:37`; left opens rounds | Derive regions from dimensions, validate map fairness, alternate initiative, and measure side/seed outcomes. |
| Mobile connection recovery has no full readiness contract | `useGameState.ts:82`, `:112`, `:437` | Connecting/loading/reconnecting/synchronizing/ready states, authoritative resync, preserved drafts and gated actions. |

### P2: Graphics and audio lack a coherent production system

- The importer exports the king at 24x24 and cannons/material blocks at 32px scale. Fine painterly details cannot survive that reduction and subsequent enlargement.
- Square material sprites stretch over beams and pillars (`GameCanvas.tsx:1305`); collider shapes do not always have matching render metadata.
- King idle has two frames; flags repeat two images under four names. This is insufficient for expressive animation and does not guarantee consistent attachment points.
- Particles, camera easing and some effects advance per frame; animation updates use a fixed 16.67ms. Their perceived speed varies with display refresh and dropped frames.
- The king-hit screen flash is drawn before the opaque sky, hiding the effect.
- `playFire`, `playImpact` and `playExplosion` exist in `src/audio/SoundManager.ts` without gameplay callers. New sound files alone would not fix the event wiring.
- The loader eagerly loads the whole manifest and silently skips failures. Current art is about 3.6MB compressed across 131 PNGs; this is an inventory, not a measured performance bottleneck.
- E2E helpers still look for a "Single Player" button, while the current menu uses Solo + Battle. Mobile tests mostly check visibility, not touch sequences or usable viewport bounds.

## 4. New Visual Direction

### Bright Siege Cartoon

- Clean 2D side-view illustration with deliberate silhouettes and smooth edges. Avoid mixing painterly pixel art, glossy app icons and CSS scenery.
- Broad, readable color groups: blue sky, fresh green terrain, warm neutral masonry, red/blue team accents and restrained gold identity.
- Warm directional light from upper-left, consistent cast/contact shadows, simple material highlights.
- Large enough king and cannon silhouettes to recognize at the intended gameplay camera. Agree visual size separately from collider size; do not secretly enlarge hitboxes for prettier art.
- Expressive king reactions and a visible cannon crew/mascot if it improves character appeal. Start with one king personality before introducing a roster.
- Playful effects: smoke rings, chunky splinters, stone chips, elastic rubber and crisp ice shards. Preserve projectile and target readability during effects.
- Terrain uses a continuous cutaway surface and edge-aware joins. Internal blocks retain joints where those joints represent real physics boundaries; remove decorative borders that make connected structures appear disconnected.
- UI uses clean, sturdy shapes, generous hit targets and restrained illustrated accents. Stop putting every control and page section inside an ornate frame.

### One World Across Menu And Match

Use a bright fortress courtyard as the menu setting. Place the player character and cannon on visible ground, with a separate distant fortress on the horizon. Menus occupy a clean part of the scene with enough contrast for real HTML labels.

Environment stack: opaque sky -> independent cloud banks -> distant terrain -> distant fortress -> playable terrain/structures -> characters/weapons -> foreground accents/effects -> HUD. Every layer has a horizon, scale, parallax factor and placement rule.

Remove the old moon/citadel postcard and unsupported floating ornaments from this direction. Backgrounds must never obscure colliders, projectiles or placement ghosts. Portrait uses a deliberately composed crop; landscape uses a dedicated control arrangement.

## 5. Playing Experience

### Mobile Build

Reserve three regions: compact HUD, unobstructed battlefield, bottom controls. The AI prompt opens as a keyboard-aware drawer. Material and shape selectors share a compact bottom dock instead of stacking over the king.

Flow: choose material/shape -> inspect ghost with valid/invalid feedback -> drag to position -> release to place -> undo an eligible placement. Inspect mode pans without placing. Templates provide an immediate playable fortress, and AI generation enhances that experience instead of being required for a first match.

AI generation: preview the proposed footprint, show resource use and validation issues, then accept it during build. Preserve prompts on failure. If generation finishes after build ends, do not modify the live combat world; offer the design for a later round.

### Mobile Combat

Recommended default: tap/drag to aim, adjust power independently, then press Fire. Keep angle and power persistent and visible. Provide fine-adjust buttons. Gesture release and interruption do not fire by default.

Landscape places controls near the thumbs while retaining the battlefield between them. Portrait reserves a bottom firing dock and frames relevant terrain vertically. Rotate without resetting the shot, firing, or entering desktop controls.

Add Inspect, Follow Shot and Recenter actions. Manual inspection temporarily owns the camera. The camera frames the firing cannon, follows a shot with look-ahead, holds briefly at the impact and hands off to the next player with a readable transition.

### Shot Presentation

1. Local aim changes feel immediate, with a correct preview and clear valid-shot state.
2. Fire submits one command. Acknowledgment supplies a shot ID and locks duplicate input.
3. Cannon recoil, muzzle flash and launch audio align with accepted flight. Local anticipation may begin immediately but must reconcile rejection without a fake projectile.
4. Projectile trail, travel sound and camera tracking communicate speed and direction.
5. Impact chooses effects by material, intensity and outcome. Dust reveals the structural result quickly.
6. Unsupported sections fall; fractures, debris and sound make the cause understandable. Decorative debris has bounded lifetimes and cannot change authoritative outcomes.
7. King reaction, damage feedback and short camera hold communicate consequences.
8. Turn handoff occurs after bounded settling, with a clean input reset.

Visual slowdown or hit emphasis must be a synchronized presentation technique. Never alter one client's authoritative physics timing to create a dramatic effect.

### Learning And Replay

Start with a short guided encounter: place a support, fire a useful shot, watch a collapse and protect the king. Supply a fallback blueprint and fair bot. Add named bot difficulties based on the verified shot solver, with deliberately bounded errors rather than hidden aim advantages.

Later add a small set of genuinely different ammunition types and challenge maps. Defer progression systems, more currencies, large rosters and multiple biomes until the core encounter is good. Existing rewards are secondary to the battlefield and rematch action.

## 6. Technical Approach

Keep React for menus/HUD and server-authoritative Matter.js for rules and simulation.

First separate responsibilities currently concentrated in `GameCanvas.tsx`: viewport transforms, input, snapshot buffer, camera director, world drawing, animation and combat events. Extract where the boundary enables focused fixes; avoid refactoring the whole file before delivering a playable improvement.

### Renderer Options

| Option | Benefit | Cost / decision |
| --- | --- | --- |
| Improve current Canvas 2D | Smallest immediate risk; enough for control/camera fixes and first art tests | Default for stabilization and baseline profiling. Cache static layers and use atlas source rectangles. |
| Incremental PixiJS renderer | Sprite atlases, batching, animation containers and scalable compositing | Recommended candidate for the richer cartoon scene, pending a representative mobile prototype. Preserve protocol and React shell. |
| Phaser client rebuild | Integrated scene/input/audio/animation tooling | Broader ownership and migration cost. Consider only if the team chooses a full client-engine direction. |

PixiJS's official guidance recommends spritesheets, batching and restrained filters; it also advises profiling before optimizing. It is not a promise that a new engine automatically makes this game faster or better: [PixiJS performance guidance](https://pixijs.com/8.x/guides/concepts/performance-tips).

Prototype the same dense collapse scene in Canvas and Pixi only after a baseline exists. Choose from device frame time, memory, implementation complexity and art-tooling needs. Keep the first playable improvements independent of that choice.

### Shared Contracts

- Shared world dimensions, legal aim range, launch origin, projectile configuration and material/shape identifiers.
- Timestamped transforms with simulation tick, match/round epoch and explicit spawn/despawn.
- Shot command IDs, acceptance/rejection, impact and turn-resolution events.
- Correct fixed-timestep accumulator with bounded catch-up and overload reporting.
- Seeded fixtures and seeded visual variants for repeatable captures; document where production randomness remains.
- Asset records with source size, trim rectangle, untrimmed size, pivot, attachments, animation FPS/loop and scene bundle.
- One real elapsed-time presentation clock, bounded frame deltas, quality tiers and reduced-motion settings.

## 7. Asset Production And Validation

The initial prompts and validation contract are in [cartoon-art-assets.md](cartoon-art-assets.md).

Generate one asset per file. Use an approved reference image for consistency. Compose test scenes in the actual renderer before commissioning variants. Do not repeat the loose generated-grid + hand-guessed-crop approach.

Work order:

1. Approve one visual reference and king master.
2. Approve cannon base/barrel as a compatible pair and one wood material surface.
3. Test one independent background layer with correct horizon and scale.
4. Integrate a still in the real battlefield at phone and desktop resolution.
5. Build one complete animated shot/collapse sequence.
6. Expand remaining materials, effects and environments only after this is accepted.

Generated pose images are references and source art, not automatically a valid animation. Use cutout rigs, authored transforms or cleaned frame sequences. Reuse exact source size and pivots; validate silhouettes across every frame. Keep physics dimensions independent of transparent image padding.

Each asset must pass alpha/halo inspection on light and dark backgrounds, complete-silhouette/crop checks, runtime-size readability, lighting/perspective checks, memory/bundle checks and in-scene overlap checks. Material surfaces need seam tests; UI frames need resize tests. A successful HTTP request is not a visual-quality test.

## 8. Delivery Milestones

These are planning ranges for focused implementation effort, not delivery promises. Re-estimate after the first milestone and device baseline. Art generation/cleanup and player recruitment may run in parallel or add calendar time.

| Milestone | Scope | Approximate effort | Exit gate |
| --- | --- | --- | --- |
| A. Trustworthy mobile match | Viewport transforms, touch cancellation, full aim controls, trajectory agreement, snapshots, accurate test helpers | 5-8 engineering days | One complete match is visible/playable in portrait and landscape; prediction and commands are reliable. |
| B. Approved cartoon direction | One king, cannon, material, terrain/background study and menu/match compositions | 3-5 art/integration days plus review | User approves the actual phone/desktop scene, not only source artwork. |
| C. Polished encounter | Animation clock, recoil, impacts, material breakage, audio, camera and readable collapse; renderer pilot if needed | 8-15 engineering/art days | One encounter meets visual, control and device-performance gates. |
| D. Full loop and reliability | Build preview/templates, bot difficulty, round/results/rematch, resync, fair maps/budgets | 5-10 engineering days | Full matches survive failures and remain fair; no blocked exit/rematch paths. |
| E. Comparative quality pass | Physical-device tuning, beginner sessions and controlled reference comparison | 3-5 implementation days plus recruitment | Players understand and prefer the core interaction; regressions and frame-time spikes are resolved. |

Do not launch a broad asset-generation campaign before Milestone B approval. Do not schedule a mass renderer rewrite and content expansion in the same milestone.

## 9. Acceptance Gates

Targets below are proposed acceptance criteria, not measurements already achieved.

### Controls And Viewport

- Battlefield, active cannon, relevant terrain and essential HUD fit inside the measured play rectangle.
- Input world/screen transforms round-trip correctly across zoom, camera movement, DPR and rotation.
- 44-48 CSS-pixel primary hit targets; accessible names for icon controls; no color-only state.
- Zero shots or placements from cancellation, interrupted drags, rotation, minimap input or Inspect mode.
- Same legal aiming/power ranges across keyboard, mouse and touch; explicit Fire disabled outside its accepted state.
- Keyboard does not cover submit/cancel; results can scroll while rematch/exit remain reachable.

### Physics And Networking

- Under identical seed/launch/wind settings, a verified prediction agrees with authoritative flight within a proposed 4 world-pixel tolerance at sampled points before the first collision.
- Every supported thin wall/roof fixture collides across the supported shot-speed envelope.
- Each accepted command generates one shot; stale, duplicate and out-of-turn commands are rejected and acknowledged.
- Correct interpolation and round resets under proposed 50/150/250ms round-trip latency profiles and jitter; websocket interruption triggers resync or a clear ended-match outcome.
- Late AI results cannot build into combat or a different round; every block shares enforced material, durability and budget rules.

### Graphics And Performance

- Recognizable king/cannon/materials at real runtime size, including the smallest supported phone.
- No clipped source art, alpha rectangles, floating props, changing pivots, stretched bevels or visible terrain seams.
- Shadows, lighting, line weight and world scale are consistent across menu and battlefield.
- Motion duration differs by less than a proposed 5% between 30/60/120Hz presentation tests.
- Target sustained 60fps on selected reference phones, with p95 presented frame interval at or below 20ms in the stress scene. Offer a stable 30fps quality tier on agreed lower-end devices.
- Measure dense destruction for at least 10 minutes on physical devices, recording thermal degradation, long frames, memory trend and server tick backlog.
- Proposed cold-load target: first playable tutorial within 5 seconds on a defined network profile, with an initial compressed gameplay bundle around 5MB or less. Establish the baseline before fixing the budget.
- No missing gameplay assets silently accepted; explicit fallback/retry behavior tested.

### Player Experience

- Initial formative sample: 8-12 new players for controls and comprehension; useful for discovery, not statistical proof.
- At least 90% complete the first intended aim-and-fire action without explanation, with no unintended shots during the task.
- At least 80% can explain why their fortress failed after watching an impact.
- For a later within-player comparison, use the same device/session length and comparable first-time tasks; counterbalance game order and record familiarity with each reference game.
- Ask separately about control confidence, target readability, impact satisfaction, character appeal and desire to replay. Track actual rematch choice in addition to ratings.
- Aim for at least 70% preference on the chosen core-experience questions in the formative comparison; report sample size and uncertainty. A larger study is required before broad superiority claims.

### Device Matrix

Automated Chromium/WebKit: 320x568, 375x667, 390x844, 430x932, 768x1024, 1280x720 and 1440x900; phone dimensions reversed; explicit 639/640px breakpoint regression.

Physical validation: small iPhone Safari, notched iPhone Safari/PWA, midrange Android Chrome, Samsung Internet where supported. Telegram host testing is a separate gate if that release target is retained.

Test rotation mid-aim, keyboard open/dismiss, background/lock, incoming interruption, reconnect, reduced motion, high DPR, audio resume and accessibility. Automated emulation cannot sign off all of these.

## 10. Competitive Target And Next Decision

DDTank's official presentation emphasizes ballistic play, a colorful character style and social competition: [DDTank official introduction](https://www.ddtank.com/EN/). Team17 presents Worms W.M.D Mobilize around destructible landscapes, weapons, training and multiplayer: [official game page](https://www.team17.com/games/worms-w-m-d-mobilize).

Fortress AI should compete on precision, expressive characters, clear destruction and effortless mobile controls. Its differentiator is the player's own fortress design, with AI as a useful architect. It does not need to match a mature game's entire content catalog to prove a compelling first encounter.

Current progress: the first viewport/control/trajectory fixes are integrated, and the bright king/cannon art now appears in both menu and match. V2 adds registered reaction poses; V3 refines the centered menu, adds the distinct Ivory rival with matching poses, and improves muzzle/material feedback. Physical-device and reliability gates from Milestone A remain open.

Recommended next implementation: **authoritative shot acceptance/origin contracts and a physical-phone baseline**, then a dense collapse/audio/character-animation pass. Muzzle and material feedback now have a tested first implementation; do not treat this as completion of all encounter or networking gates.
