# Match Continuity And Solo Progression Requirements

Version: V12, 25 October 2026
Status: defined before implementation; local implementation and automated verification completed. Physical-device acceptance and production publication remain pending. See the separate verification receipt.

## Scope And Quality Contract

Implement four related improvements: reconnectable matches, durable progression, three fair solo difficulties, and a reproducible mobile-validation programme. Preserve the approved art, soundtrack, camera preferences, server-owned physics, collision damage, material durability and best-of-three rules.

No requirement is marked verified merely because code exists. Record automated evidence, inspected screenshots, limitations and outstanding physical-device checks in `docs/match-continuity-v12-verification.md`. Production publication requires matching browser/server changes, a database backup and zero active matches before a restart. This document does not authorize unrelated infrastructure upgrades.

Current constraints: one authoritative Node.js game process; Socket.io websocket transport; 2400x600 world; physics at 60 ticks/second with two substeps; snapshots at 20Hz; build 90s, reveal 5s, turns 25s, round break 4s; 100HP kings and existing projectile damage. Do not use the older timer/world descriptions in AGENTS.md as balance values.

## 1. Reconnect Without Losing The Match

### Identity And Ownership

- **C01:** A room slot belongs to a stable server-issued player identity, not an ephemeral socket ID. Resume requires an unguessable bearer credential, not a room code, display name or client-supplied UUID alone.
- **C02:** Issue a cryptographically random credential, store only its hash on the server and keep the credential in the browser's best-effort local storage plus memory. Do not include it in logs, analytics, room/player lists, history, snapshots or URLs. HTTPS is required outside local development.
- **C03:** If credentials are missing or invalid, create a fresh identity rather than granting access to someone else's profile or slot. Never import client-reported scores. Clearing browser storage loses anonymous identity access; cross-device account recovery is outside this release.
- **C04:** An authenticated reconnect can replace a ghost connection or an older tab for the same identity. The previous tab receives a clear takeover message and stops reconnecting automatically. It cannot continue issuing gameplay commands. No duplicate active slot or second award is possible.

### Grace, Fairness And Timers

- **C05:** Transport loss reserves a human's slot for up to 20 seconds, measured by server wall time. Explicit Leave battle is an immediate forfeit, not a grace-period request. Lobby, build, reveal, active combat, settling and intermission must have defined behaviour.
- **C06:** Limit grace to 60 seconds of accumulated disconnection per identity per match, retained across rounds and reset only for a new match/rematch. Repeated flapping cannot indefinitely stop play. No grace is spent by a healthy tab takeover.
- **C07:** While any human slot is waiting, freeze physics and all simulation timers: phase/turn deadline, settle checks and timeout, bot thinking/building, projectile expiry, lava ticks, falling rocks and next-round transition. Preserve bodies, velocities, HP, terrain, round/turn, accepted shot and ready flags. Do not replay missed physics steps or spawn a burst of hazards on resume.
- **C08:** Grace-expiry timers remain active while simulation timers are paused. Freeze combat scoring time too. Resume with exactly the unused simulation time; do not give a fresh turn or a second shot.
- **C09:** If the only disconnected player expires while an opponent is connected, resolve one forfeit result. If all humans are absent when expiry is resolved, abandon the match without inventing a winner or awarding a match. Dispose expired solo rooms and all their resources. Lobby expiry vacates the slot and resets readiness without awarding a battle.
- **C10:** When both humans disconnect, resume play only after both return. Each slot retains its own deadline/budget. The earliest expiry cannot create two results. Queued players leave matchmaking immediately and return to the menu on reconnect; queue position is not reserved.
- **C11:** A resumed identity receives a complete authoritative sync: own side and player list, readiness/connectivity, room/match ID, difficulty, terrain/hazards, full body metadata and positions, king HP, phase/deadline, turn and fired flag, round score/number/winner, result/scores if any, and bounded recent chat. Missing deltas must not leave invisible terrain or wrong royal identity.
- **C12:** Rebind old-to-new socket ownership in the room, simulation player map, ready set and rematch requests without replacing physical bodies. The full-sync serializer must not corrupt delta state for the other player.
- **C13:** Cancel/invalidate an in-flight AI build on pause or session destruction. A late AI response must not mutate the resumed or ended world. Show that a new request is needed; never silently reissue a paid request. API keys are not stored in progression or resume data.

### Browser Behaviour

- **C14:** Keep the existing battlefield visible while reconnecting; show which side is disconnected and the server deadline. Disable all world mutations, Ready, Fire, AI generation and rematch while paused/resyncing. Camera/settings/mute may remain usable where safe. Do not announce every countdown tick to screen readers.
- **C15:** Reconnect automatically within the same document and after reload when the identity is available. Wait for the server's resume decision; do not flash a new lobby or erase a recoverable battle on the connect event.
- **C16:** Clear offline outgoing gameplay commands. A click made offline, duplicate resume packet or browser reload cannot fire a second ball, place blocks or repeat an AI request later. A fully rehydrated client must respect an already-fired turn even if no ball remains visible during settling.
- **C17:** On sync, reset interpolation endpoints, pending cosmetic events and gesture state so old explosions/shots do not replay. Preserve the chosen camera and comfort settings in an existing document. Never interpolate across a different round/world. New-page resume frames the correct side sensibly.
- **C18:** If grace expired, the server restarted, a match no longer exists or another tab took over, show the real reason and a usable menu. Do not claim that an active physics world survived a server restart. Completed progression must survive it.
- **C19:** Notices, pause status and controls must fit 320x568, 390x844, 768x1024, 844x390 and desktop. Keep the primary action visible, no floating-header overlap, no countdown text resizing the layout. Respect reduced motion and keyboard focus.

### Required Evidence

Test loss/rejoin in build, reveal, each player's combat turn, mid-projectile, settling, intermission and result. Assert exact body identity/HP/velocities, remaining phase/projectile timers, no off-screen auto-shot, expired grace, accumulated budget, both-absent cleanup, explicit leave, tab takeover, wrong credential, two-player isolation, stale AI result, chat/ready/rematch restoration and metadata completeness. Use real sockets/browser contexts in addition to fake-timer unit tests.

## 2. Save Progression Reliably

### Storage And Data Model

- **P01:** Use durable transactional SQLite storage outside build output and Git, configurable by `FORTRESS_DB_PATH`, with an explicit production data directory. Use prepared statements, foreign keys, WAL journalling, full synchronous commits and a bounded busy timeout. Preserve the existing analytics file independently.
- **P02:** Maintain a schema version and idempotent startup migration. Refuse an unsupported future schema, unreadable/corrupt database or unwritable location with an actionable server error. Never replace an existing bad database with an empty one silently.
- **P03:** Persist player identity/hash, authoritative profile totals, unique match results, unlocked achievement IDs, lifetime streak/AI statistics and reward claims/balance. Rank and level remain derived from saved authoritative points.
- **P04:** A match gets a globally unique ID distinct from its six-character invite code. All rounds share it; a rematch receives a new ID. Store difficulty/mode, winner/reason, sides, names, final rounds, per-side score breakdown and server completion timestamp.
- **P05:** Award each completed match once per human, and commit both participants and history atomically. Unique database constraints enforce idempotence across callback retries and restarts. Do not create bot profiles, reward intermediate rounds as matches, or double-award a resume/rematch/result refresh.
- **P06:** Preserve all completed match facts durably; return the latest 20 entries in the normal profile response with bounded pagination for older history. Daily/weekly progress and lifetime achievements must not shrink when a match drops out of that 20-entry window.
- **P07:** Existing achievement definitions remain recognisable. Unlocks are monotonic and saved once; streaks and AI-win totals span more than 20 matches. Match history remains read-only from the browser. A display name change is not identity ownership.
- **P08:** Replace local-only check-in/daily/weekly claim flags with server-validated, idempotent reward claims. Use server UTC days/weeks, one check-in per day, proper consecutive-day reset, and independently claimed completed missions/challenges so claiming early cannot lose later eligible rewards. First-win bonus is credited once per UTC day. Keep Embers separate from rank score.
- **P09:** Expose only the requesting identity's profile/history/claims; validate page limits/cursors and reward kind. No arbitrary score/profile setter or unsigned UUID lookup is added. Reject malformed/non-finite/negative score data at the storage boundary even though scores originate on the server.

### Failure And Lifecycle

- **P10:** Publish saved progression only after a successful commit. On failure, preserve existing data, report progress-save failure clearly and keep an idempotent retry path for the pending result. Never say "saved" when only a browser cache changed. A failed transaction must not partially award one participant.
- **P11:** Save failures and unavailable storage block new ranked/progression-producing starts until healthy; result display and safe exit remain possible. Retries cannot busy-loop or depend on the ended world's physics timers. Disk failure followed by process loss before a commit cannot be represented as a durability guarantee.
- **P12:** A graceful process shutdown closes connections and flushes committed storage safely. Restart tests must reopen the actual database and recover identity, points, achievements, history and claims without client state. No active Matter world is persisted in this release.
- **P13:** Browser identity/profile storage failures must not crash play. Reconnect within the current document can use memory credentials. Explain that clearing/unavailable storage prevents anonymous recovery across reload; cached profile values are never trusted as a server import.
- **P14:** Do not fabricate a migration from previous in-memory profiles already lost during historical restarts. An initial rollout must disclose the legacy limitation; subsequent V12 results are durable. Back up SQLite using its backup API or a consistent stopped-service copy including WAL, never only a live main database file.
- **P15:** Keep database files owner-restricted and excluded from commits. Document backup, restore, schema/runtime prerequisites and the single-process/local-disk deployment boundary. Do not add an untested multi-host SQLite architecture.

### Required Evidence

Use temporary on-disk databases for migration/reopen tests; duplicate and simultaneous award attempts; per-user isolation; forged token; achievements surviving >20 history entries; UTC rollover/check-in gaps; partial mission claims; malformed input; failed transaction rollback and retry; both-side atomicity; invalid/future schema; no secret in public DTOs; fresh/rematch match IDs. Check that persistent data lives outside `dist` and survives rebuild/restart.

## 3. Improve Solo Difficulty

### Product And Fairness

- **B01:** Offer Easy, Normal and Hard in the Solo menu through a labelled select/segmented control. Default to Normal and preserve the selected value safely on this browser. Keep PvP room/queue behaviour unchanged.
- **B02:** The server validates the enum; invalid/missing values become Normal. Store the accepted setting on the room, every next-round session, rematches and history. A player cannot change difficulty mid-match by sending a new setting.
- **B03:** Keep the same bot royal, HP, cannon origin, projectile/body properties, turn length, damage rules, build budget and baseline fortress across modes. Difficulty changes uncertainty, learning speed and thinking delay, not hidden bonuses or punishment.
- **B04:** Normal preserves the existing training behaviour. Easy begins with a larger miss offset, more uncertainty, slower correction and more thinking time. Hard begins closer, retains nonzero uncertainty and learns faster; it is not an omniscient guaranteed-hit mode.
- **B05:** All modes solve against current authoritative cannon, king, obstacles and wind using the existing Matter-based solver. Learn only from each accepted real shot once; do not learn from rejected/duplicate/unknown feedback. Re-evaluate target movement and changed wind; reset learning each round.
- **B06:** Pause/resume preserves mode, pending thinking time and learning. Destroy/forfeit cancels pending work. A bot cannot fire during grace, after a lost turn or into a new room/world.
- **B07:** Make accepted difficulty visible in the ready room and accessible in battle without competing with the primary turn/action. Keep "Training Bot" identity compatibility; use explicit mode metadata rather than relying on display-name changes.

### Quantitative Validation

- **B08:** Add a reproducible seeded benchmark spanning at least 12 seeds, both sides, six observed shots per mode, target movement/wind changes and blocking geometry. Use identical scenarios/random streams across difficulty levels and independent real Matter replays, not a label-only settings test.
- **B09:** Report early/late closest distance to king, hit fraction, learning improvement, solve p50/p95/max and cancelled/duplicate shots. Normal/Hard should improve after observed shots; aggregate late accuracy should order Hard, Normal, Easy. Do not demand monotonic improvement in every single stochastic turn.
- **B10:** Keep solve work within the existing bounded candidate search. Report measured solver timing honestly; a soft search deadline is not a guaranteed CPU bound under contention. Benchmark fixture outcomes do not establish human win rates.
- **B11:** No global damage retuning based only on this benchmark. Plan a later human study of first-player advantage, shots-to-defeat and fortress diversity. Preserve the current two-solid-hit exposed-king test.

### Required Evidence

Server enum/default propagation, rematch/new-round retention, browser persistence/accessible controls, identical physics/fortress definitions across modes, seeded learning ordering, duplicate cancellation, pause during bot delay and solver contention measurements. Record actual numbers and failures rather than inventing a difficulty win-rate claim.

## 4. Validate Mobile And Long Sessions

### Automated And Instrumented Checks

- **M01:** Maintain a matrix for Chromium and WebKit phone emulation, desktop and tablet layouts, portrait/landscape switches, 320px width and high-density backing buffers. Test the actual game, not a marketing screen.
- **M02:** Exercise single-touch aiming, two-finger pan, canceled/lost pointers, orientation during a gesture and while a projectile is flying, range inputs, explicit Fire, pause/resume, chat/settings focus, result scrolling and primary-action reachability. No accidental placement/fire, clipping or horizontal overflow.
- **M03:** Preserve adaptive rendering, camera preferences, reduced motion and world-coordinate correctness. Resume must not reset camera into a long sweep or replay particles/shot sounds. Respect safe-area insets and browser viewport changes.
- **M04:** Check real media decoding/progress, both full-theme crossfade boundaries, muted starts, user-gesture unlock, hidden/visible transitions, reconnect/return-to-game and volume control during results. Hidden/paused game effects cannot burst on return.
- **M05:** Provide a bounded, local diagnostic readout for frame intervals/density, snapshot presentation, connection/pause state and visible resource counts. No credentials, API keys, full chat or PII is recorded in performance exports. Do not add an always-on analytics stream for every frame.
- **M06:** Perform a 20-minute automated soak with representative play/reconnect/leave/rejoin/resize cycles, monitor page errors, asset errors, late callbacks, bounded snapshots/particles/listeners and sampled JS heap. Separate loading/warm-up, steady-state and worst-frame measurements. Do not call a forced-GC JS sample total device/GPU memory.
- **M07:** Set release gates for correctness and bounded resources; report observed FPS without claiming every device sustains 60. Prefer >=45 FPS on the controlled emulated reference after warm-up; investigate a sustained drop below30 rather than hiding it in averages.

### Physical Device Acceptance

- **M08:** Prepare a 20-minute checklist for an actual iPhone Safari and a mid-range Android Chrome. Record exact hardware, OS/browser versions, viewport, connection and graphics/motion settings, date and tester. Mark tests not run when hardware is unavailable.
- **M09:** Cover cold load, sound unlock, screen rotation, browser chrome/address bar expansion, keyboard appearance, two-finger gestures, incoming interruptions/tab switches/lock-unlock, speaker/headphone balance, 3G/4G/Wi-Fi change, 5/15/25-second disconnections, tab takeover, a full best-of-three and rematch.
- **M10:** Record touch misfires, motion discomfort, thermal throttling, battery/heat observations, clipped controls, audio restarts/latency and actual observed frame behaviour. A human must rate comfort and listening; browser emulation cannot sign those fields off.
- **M11:** Release notes distinguish automated results, engine emulation and physical sign-off. If no real phones are connected, implement the available validation tooling and leave physical rows visibly unverified. Do not claim this objective is fully achieved without that evidence.

## Protocol And Implementation Boundaries

Identity handshake: browser supplies protocol version and stored credential; server returns a private identity event and then either a complete `session_state` or `session_ready` with a truthful no-resume decision. `match_paused` carries disconnected sides/deadlines, not credentials. Full state/resume includes authoritative fired/readiness flags. Existing room, build, chat, phase, impact and result events remain supported. Server validates room mutation permissions even if UI is inert.

Persistence: use the runtime's `node:sqlite` prepared-statement/transaction APIs available on the tested Node22.22 runtime, avoiding newer-only API assumptions. Production startup and backup must be rehearsed locally first. Socket.io supports a fresh auth callback per connection; use it to supply the current credential rather than an outdated initial object. Primary references: [Node SQLite](https://nodejs.org/api/sqlite.html), [Socket.io client authentication](https://socket.io/docs/v4/client-options/#auth).

Implementation order: (1) pure difficulty/progression contracts and durable storage; (2) reusable pausable timers and session freeze/full sync; (3) authenticated reconnect coordinator and result persistence; (4) browser identity/sync/pause UI, difficulty/reward controls; (5) seeded benchmark, restart/security/lifecycle regressions; (6) browser/soak/visual verification and physical checklist; (7) write a requirement-by-requirement verification receipt. No production restart during implementation or testing.

## Completion Ledger

| Area | Implementation | Automated verification | Physical verification |
| --- | --- | --- | --- |
| Reconnect/grace/security | Implemented locally | Unit, real sockets and two-engine UI checks passed | Physical network transitions pending |
| Durable progression/rewards | Implemented locally | Transactions, reopen/restart, reward and backup checks passed | Not applicable to database correctness |
| Solo difficulty/benchmark | Implemented locally | 432-shot seeded benchmark and propagation/pause tests passed | Human fairness feedback pending |
| Mobile/soak/audio | Implemented and instrumented | Ten layouts, audio decoders, 20-minute soak and 28-cycle resource checks passed | iPhone 17 Pro identified; physical checklist not run; Android unavailable |
