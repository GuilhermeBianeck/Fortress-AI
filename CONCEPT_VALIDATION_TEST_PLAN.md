# Fortress AI Concept Validation Plan

## Executive Call

Fortress AI looks like a plausible niche, not a broad-market casual game.

The strongest position is:

- Desktop/web-first
- Social or creator-led
- "Prompt-to-battle" physics strategy
- Short path into solo play, then friend challenges

The weakest position is:

- Mobile-first
- Long synchronous PvP as the primary hook
- Requiring users to understand AI keys before the first fun moment

Why this is plausible:

- The adjacent market is real. `Forts`, `Besiege`, `ShellShock Live`, and `Worms W.M.D` still show durable demand and positive review depth.
- The concept combines three proven loops: creative construction, physics spectacle, and competitive artillery.
- The differentiator is accessibility: AI can lower the skill barrier that usually keeps more casual players out of fortress-building games.

Why this is risky:

- "AI builds your fortress" is a strong curiosity hook, but it may be a novelty rather than the retention loop.
- Current match pacing is closer to PC session expectations than mobile expectations.
- Synchronous PvP creates coordination friction before the concept is proven.

## Current Product Baseline

The repo already contains a meaningful testable product:

- Lobby with solo training, private rooms, and queue: `src/components/Lobby.tsx`
- Auto-start for first-time users into a solo room: `src/App.tsx`
- AI prompt input during build phase: `src/App.tsx`
- Real-time state and socket event handling: `src/hooks/useGameState.ts`
- Build / reveal / combat / result phase UX: `src/components/PhaseOverlay.tsx`
- Server-authoritative multiplayer rooms and matchmaking: `server/index.ts`, `server/game/RoomManager.ts`
- Single-player bot for build + firing: `server/game/BotAI.ts`
- Existing analytics batching: `src/analytics/tracker.ts`, `server/analytics/events.ts`
- Existing Playwright coverage for lobby, flow, mobile, performance, and phase transitions: `tests/e2e/`

Operational note:

- Frontend and backend both build successfully.
- A local Playwright smoke run did not start cleanly because `playwright.config.ts` timed out waiting for the web servers to come up within 30 seconds. That does not block concept testing, but it does mean test operations are not yet one-command reliable.

## Current Concept-Validation Risks In The Implementation

### 1. AI onboarding trust is fragile

The API key modal says the key is stored locally and "never sent to our servers" in `src/App.tsx`, but the client sends `apiKey` to the server in `src/hooks/useGameState.ts`, and the server consumes it in `server/game/GameSession.ts`. That is a trust problem for early testers.

### 2. The product is not yet consistent about whether an API key is required

The lobby help text says players should set an API key to use AI in `src/components/Lobby.tsx`, but the server already supports a fallback server-side key plus a free-limit path in `server/game/GameSession.ts`. Early test users will not know whether AI is optional, free, limited, or paid.

### 3. The core match loop is long for mobile

The current defaults are 90 seconds build, 5 seconds reveal, 15 seconds per combat turn, first to 2 rounds in `server/config/constants.ts`. That is reasonable for a desktop niche game, but long for a mobile-first concept.

### 4. The product still depends too heavily on synchronous multiplayer

The solo bot path is useful, but the headline experience still pushes toward friend rooms and live matchmaking. That is good later; it is not the easiest path to validate early concept fit.

### 5. Current analytics are not enough for concept truth

The app tracks only a small set of broad events today. The local event log currently shows a large number of `app_loaded` events but almost no meaningful concept funnel depth, which means there is not enough clean data yet to judge actual appeal from usage alone.

## Niche Thesis

Fortress AI should be tested as a niche for:

- Players who like physics chaos and artillery games
- Players who like construction or optimization but are intimidated by manual building depth
- Friend groups willing to share a room link and laugh at emergent failures
- Creators or streamers who can turn "prompt, reveal, destroy" into content

It should not initially be tested as:

- A broad mobile casual title
- A deep strategy esport
- A mass-market AI app for non-gamers

## Core Hypotheses To Validate

### H1. The hook is legible in under 30 seconds

Users should immediately understand: "I describe a fortress, AI builds it, then I battle."

### H2. AI building creates a real "wow" moment

The build result must feel surprising, funny, clever, or tactically useful, not just equivalent to clicking blocks manually.

### H3. Solo play is fun enough to validate before PvP

The training-bot path should produce enough delight to justify further investment even before live matchmaking is healthy.

### H4. The PvP layer creates better stories than solo

If the concept works, human-vs-human should create a stronger urge to rematch, share, or invite a friend.

### H5. The concept is desktop/web-first

If mobile users consistently bounce before first shot or first round completion, the product should narrow its positioning instead of forcing mobile-first assumptions.

## Specialist Roles

Run the validation program with four specialist tracks:

- `Market Research Agent`
  - Maintains competitor matrix, positioning options, and audience language
- `UX Research Agent`
  - Runs interviews, moderated playtests, and post-session synthesis
- `Analytics Agent`
  - Owns event taxonomy, dashboards, scorecards, and retention readouts
- `Test Ops Agent`
  - Owns smoke tests, playtest setup, session recording, bug triage, and build readiness

One person can cover more than one role, but the outputs should stay separate.

## Phase 0: Test Readiness

### Goal

Remove avoidable noise before spending time recruiting users.

### Required changes before external testing

- Fix API key copy so it truthfully explains what happens to a provided key.
- Align all UX copy on whether AI is free, rate-limited, or BYO key.
- Instrument the concept funnel in detail.
- Add a lightweight in-product feedback form after first round and after match.
- Make one reliable smoke path for solo playtests.

### Minimum event taxonomy to add

- `landing_viewed`
- `cta_clicked`
- `mode_selected`
- `solo_selected`
- `pvp_selected`
- `room_invite_created`
- `room_invite_opened`
- `room_join_attempted`
- `room_join_failed`
- `ready_clicked`
- `build_started`
- `ai_build_requested`
- `ai_build_succeeded`
- `ai_build_failed`
- `manual_block_placed`
- `first_shot_fired`
- `first_round_completed`
- `match_completed`
- `post_match_rating_submitted`
- `would_play_again_yes`
- `would_invite_friend_yes`
- `returned_next_day`

### Phase 0 exit criteria

- Solo flow is smoke-testable in one command
- Analytics dashboard exists for activation, completion, and replay
- Every concept test can be tied to a participant source and device type

## Phase 1: Desirability Test

### Goal

Answer whether the idea is interesting before optimizing the full live product.

### Method

- 12 to 15 concept interviews with target users
- 3 landing-page message variants
- 3 short concept videos or GIFs

### Target audiences

- `Forts` / `Besiege` / `Worms` / `ShellShock Live` players
- Strategy sandbox players
- Small friend groups that already play browser party games
- Streamer or creator micro-audiences

### What to test

- Hook A: "Prompt a fortress, then destroy it"
- Hook B: "AI builds your castle, you fight your friend"
- Hook C: "Physics strategy where your words become the battlefield"

### Success thresholds

- At least 70% can explain the game loop correctly after one sentence
- At least 50% pick one hook as "I would try this"
- At least 30% volunteer for a playtest after seeing the concept
- At least 40% say the AI-building piece is meaningfully more interesting than a normal artillery game

### Failure signals

- Users mostly talk about the AI gimmick but not the combat loop
- Users understand the idea only after a long explanation
- Interest clusters entirely around "funny prompts" with no repeat-play intent

## Phase 2: First-Session Fun Test

### Goal

Validate whether the current product produces a satisfying first session in solo mode.

### Method

- 20 moderated or lightly moderated remote playtests
- Use the training bot only
- Desktop first, mobile as a secondary comparison group

### Tasks

1. Start the game from a clean browser
2. Enter name if prompted
3. Start solo mode
4. Use AI build once
5. Optionally place manual blocks
6. Finish at least one round
7. Give a short post-session scorecard

### Metrics

- Lobby to solo selection rate
- Solo selection to match start rate
- Match start to first build action
- First build action to first shot
- First round completion rate
- Match completion rate
- Session length
- "Fun" score from 1 to 10
- "I understood what to do" score from 1 to 10
- "AI building was worth it" score from 1 to 10

### Success thresholds

- At least 70% reach first build action
- At least 65% reach first shot within 5 minutes
- At least 60% complete one round
- At least 40% complete a full match
- Average fun score >= 7/10
- Average clarity score >= 7/10
- At least 35% say they want another round immediately

### Failure signals

- Testers stall in lobby or before readying up
- AI build causes confusion instead of delight
- Manual building is preferred because AI feels random or weak
- Mobile testers churn before first shot at much higher rates than desktop

## Phase 3: Social Proof Test

### Goal

Validate whether friend-vs-friend play creates stronger pull than solo.

### Method

- 12 to 20 recruited pairs
- Private room links only
- No public matchmaking in this phase

### Tasks

1. Player A creates a room
2. Player B joins from the link or room code
3. Both ready up
4. Both use AI build at least once
5. Complete one full match
6. Decide whether to rematch

### Metrics

- Invite sent to invite opened
- Invite opened to room joined
- Room joined to ready clicked
- Match start rate
- Match completion rate
- Rematch request rate
- Chat usage rate
- "Would play with this friend again" rate

### Success thresholds

- At least 60% of opened invites become joined rooms
- At least 70% of joined pairs start a match
- At least 50% of started matches complete
- At least 25% of completed matches trigger a rematch request
- At least 40% say they would play again with a friend

### Failure signals

- Joining a room is harder than understanding the game
- The game is fun alone but not better with friends
- Most matches end before the interesting physics payoff happens

## Phase 4: Repeatability Test

### Goal

Answer whether the game has repeat value beyond first curiosity.

### Method

- 50 to 100 invited users over 2 to 3 weeks
- Desktop/web-first distribution
- Track solo and friend-invite cohorts separately

### Metrics

- D1 return
- D7 return
- Average sessions per user
- Average matches per user
- Average AI builds per user
- Share or invite rate
- Return source: direct, shared link, creator link, paid test ad

### Success thresholds

- D1 return >= 15%
- D7 return >= 4%
- Average completed matches per activated user >= 1.5
- At least 20% of activated users either invite a friend or accept an invite
- At least 25% of returning users use both AI build and manual adjustment

### Borderline zone

- D1 return between 10% and 15%
- D7 return between 2% and 4%
- Strong first-session scores but weak social conversion

### Failure signals

- Most users play exactly once
- AI build is used once, then abandoned
- Social invitations do not materially improve replay

## Phase 5: Positioning Test

### Goal

Decide what this product actually is in market terms.

### Packaging variants to test

- `AI artillery party game`
- `Physics fortress battler`
- `Prompt-to-battle strategy game`
- `Browser game for friends`

### What to measure

- Click-through rate on creative
- Waitlist or playtest signup rate
- Invite acceptance rate
- Post-session recall: what players think the game is

### Recommendation

Do not lead with "AI game" alone. Lead with the outcome:

- build weird fortresses fast
- watch them collapse
- fight your friend

## Decision Scorecard

### Green: keep pushing

- Solo first-session fun clears thresholds
- Friend mode materially improves replay or rematch
- AI build is named as a real differentiator
- Desktop/web cohorts show acceptable repeat behavior

### Yellow: narrow the scope

- Solo works, but PvP setup is too heavy
- The AI hook works, but only as a first-session curiosity
- Mobile performs much worse than desktop

Likely response:

- Position as desktop browser-first
- Emphasize solo challenges, async competitions, or creator content
- De-emphasize broad matchmaking

### Red: pivot the concept

- Most users do not reach first fun
- AI is not meaningfully better than presets or manual templates
- Replay intent is weak even when sessions are bug-free

Likely response:

- Keep the physics battler, drop AI as the headline
- Or keep AI generation, but pivot away from synchronous artillery combat

## My Read Right Now

This is a valid niche if the team tests it as:

- a desktop/web-first multiplayer sandbox battler
- a toy with emergent physics stories
- an accessible alternative to deeper building games

It is not yet validated as:

- a mobile-first game
- a broad casual game
- a sticky live-service based on current instrumentation

The best near-term product question is not "Will everyone want this?"

It is:

"Can we get a small but enthusiastic group to say: this is funny, readable, and worth replaying with friends?"

If the answer is yes, there is room for a real niche product here.

## Source Notes

Market and benchmark sources used for this assessment:

- Forts on Steam: https://store.steampowered.com/app/410900/Forts/
- ShellShock Live on Steam: https://store.steampowered.com/app/326460/ShellShock_Live/
- Worms W.M.D on Steam: https://store.steampowered.com/app/327030/Worms_WMD/
- Besiege on Steam: https://store.steampowered.com/app/346010/Besiege/
- 2026 Mobile & PC Gaming Benchmarks: https://investgame.net/news/pdf/2026-01-27-2026-mobile-pc-benchmarks_compressed/
