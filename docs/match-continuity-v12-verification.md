# V12 Verification Receipt

25 October 2026. V12 shipped together with the V13 mobile/camera release in `535eafe`; matching Vercel and VPS publication is verified. **Physical-device sign-off remains pending.** The local measurements below are the original V12 evidence; current counts and live acceptance are in `mobile-camera-v13.md`. Requirements were written first in `match-continuity-v12-requirements.md`.

## Delivered

- Authenticated anonymous identity, 20-second reconnect grace with a 60-second accumulated match budget, authoritative full-state restoration, safe tab takeover, and simulation/scoring timer freeze.
- Transactional SQLite progression: both-side match facts, lifetime achievements/streaks, complete history with pagination, UTC rewards, idempotent claims and failed-save retries. Database files and credentials are not build artifacts.
- Easy/Normal/Hard Solo with the same fortress, HP, projectile properties and damage rules. Mode is retained through rounds, rematches and history.
- Mobile pause/resume controls, immutable snapshot restoration, cleared gestures/effects, right-side Manual camera initialization, denied-storage handling and bounded diagnostic readout. Approved art/music remain in use.

## Automated Evidence

Runtime: Node 22.22.2. Browser-engine checks: Chromium 134.0.6998.166 and WebKit 26.6 on this Mac, without device CPU throttling. These are not physical iPhone/Android results.

| Check | Result |
| --- | --- |
| Frontend production build | Passed; existing large-chunk warning remains, approximately 528kB main JS before gzip |
| Server TypeScript build | Passed |
| Frontend game/audio/snapshot/storage unit tests | 130 passed |
| Backend physics/lifecycle/difficulty/storage unit tests | 197 passed, including the existing two-solid-shot king defeat regression |
| Real socket/process regression | Seven scenarios passed: ownership/full sync, forged credential, takeover, reveal/accepted shot restore, failed transaction/retry, process restart, real 20-second solo expiry |
| Browser layout matrix | Ten scenarios passed: both engines at 320x568, 390x844, 768x1024, 844x390 and 1280x720; phone/tablet backing density 3, wide views 2 |
| Visual validation | All 31 battle art assets loaded, nonblank canvas pixel checks, screenshots inspected; no horizontal overflow in the matrix |
| Browser interaction coverage | Native touch placement; canceled pointer; mid-shot rotation/reload; fired flag preserved; short outage recovery; takeover notice |
| Extra UI recovery | Both engines: paused banner at 320/390/844px, frozen phase clock/inert mutations, right-side Manual reload with no sweep, result reload |
| Delayed UI callbacks | Both engines: an earlier build-error timeout cannot erase a newer generating state; no paid AI requests issued |
| Multi-touch/settings | Chromium native two-finger pan without firing/stuck pointers; settings focus trap and saved camera preference |
| Real audio decoders | Seven checks per engine: trusted unlock, nonzero PCM RMS, eight seconds unseeked playback, mute hold/unmute continuation, battle transition, both crossfade boundaries, no obsolete welcome/loop requests |
| SQLite backup/reopen | Online backup API succeeded, `quick_check` passed, backup reopened/migrated to schema 2 with ten saved results intact |
| Targeted lint | Passed for all app code, new shared/storage/scripts/tests and changed runtime modules |
| Whole-repository lint | Still fails on 27 existing violations in legacy tests and the Gemini control-character regex; not represented as a clean lint run |

A denied-localStorage browser was also able to enter a battle without a page error. Anonymous reload recovery without storage is intentionally unavailable; memory identity can support the current document.

## Difficulty Measurements

The reproducible benchmark uses 12 procedural terrain seeds, both firing sides and six observed shots per level: **432 independent Matter replays**. It includes 32x64 kings, ceiling geometry, four covered scenarios, wind reversal and a 160px target move after shot three. Identical seeded uncertainty streams are used across modes. Observations come from replayed collisions, not the solver's predicted result.

| Mode | Early mean distance | Late mean distance | Early / late hit fraction | Solve p50 / p95 / max |
| --- | --- | --- | --- | --- |
| Easy | 116.74px | 31.42px | 6.25% / 77.08% | 2.93 / 3.75 / 17.18ms |
| Normal | 72.72px | 15.30px | 25% / 100% | 2.86 / 3.48 / 4.42ms |
| Hard | 28.27px | 12.73px | 79.17% / 100% | 2.75 / 3.23 / 4.05ms |

Early is shots 1-2; late is shots 5-6. All modes improved and aggregate late distance ordered Hard, Normal, Easy. The underlying search retains its soft 75ms deadline; these timings do not establish a guaranteed CPU bound under contention. Cold-start/JIT work is included in the maximum. Fixture hit rates are **not human win rates**, and global damage was not retuned from this benchmark. Human first-player advantage and fortress-diversity studies remain future balancing work.

## Sustained Session

A real 20-minute Chromium session sampled 240 times while progressing through build, reveal, combat, intermission, result, rematch and return-to-menu paths. It included portrait/landscape changes, 12 sampled menu visits and an offline/reconnect exercise lasting 5.253 seconds with the same king IDs restored.

After the first 60-second warm-up, sampled rolling FPS was minimum **60.20**, median **89.33**, p95 **115.38** on this host's high-refresh browser. This is not a claim that every frame stayed above 60 or that a physical phone will match it. Sampled JS heap was **9.45-26.49MiB**, median **12.09MiB**. Samples are not a total device/GPU-memory measurement or a full-frame latency distribution.

Observed resource maxima: 32 buffered snapshots, 79 particles, five queued effects and 185 active DOM elements during gameplay. There were no captured gameplay exceptions and no overflow samples. The concurrent multi-browser load hit the existing analytics request limiter; those HTTP429s and deliberately broken-network console messages are not sprite/audio404s, but the run is not described as having a completely empty browser console.

A separate 28-cycle enter/confirmed-leave test collected garbage only for leak diagnostics. Native event listeners stabilized at **295**, one document remained, active elements plateaued at **519**, and total DOM counters at **1002** once the 20-row history cap was reached. This is not a GPU-memory or thermal test. Initial test sampling before UI commits produced a false growth signal; waiting for two presentation frames before collection confirmed the plateau.

The soak preceded the last localized camera/notice/read-failure corrections. Those paths were then rechecked with targeted browser tests and unit/build checks; this is not claimed to be a second 20-minute soak of every final line.

## Requirement Trace

| Requirements | Evidence and boundary |
| --- | --- |
| C01-C04 | Server-issued credential/hash; forged-token and takeover unit/real-socket checks; old tab becomes inert with explicit Reload |
| C05-C06 | Wall-clock grace, per-match budget and healthy takeover tests; real solo expiry; explicit leave regression |
| C07-C08 | Pausable timers, immutable bodies and projectile TTL, preserved reveal/intermission time, bot delay, paused scoring test; browser frozen countdown |
| C09-C10 | Both-absent abandonment, one-connected forfeit, both-return waiting and cumulative budget tests; queue loss now clears the browser queue state |
| C11-C12 | Full metadata/terrain/readiness/chat/turn/result sync; socket/ready/rematch rebinding; serializer does not consume peer delta metadata |
| C13 | Delayed AI responses after pause/destroy cannot spawn; heartbeat cleanup tested; resumed UI exposes interrupted-build status; no paid automatic retry |
| C14-C17 | Inert mutations, transport buffers cleared, accepted-fired flag restored, gestures/effects/snapshot epochs reset; right-side Manual initialization verified |
| C18-C19 | Honest unavailable/restarted/taken-over notices; active physics is not persisted; narrow-layout/pause/takeover tests and screenshots |
| P01-P04 | Prepared SQLite schema/WAL/FULL, owner permissions, migrations, corrupt/future-version refusal, complete bot-side metadata and unique match IDs |
| P05-P07 | Two-side rollback/retry, duplicate callbacks/handles, reopen, 26-result history/streak/AI-win tests, pagination and monotonic achievements |
| P08-P09 | Server UTC check-in/gap/rollover, independent early/later daily and weekly claims, first-win idempotence, invalid totals/cursors/kinds and per-user isolation |
| P10-P12 | Pending notice, independent retry and start blocking; actual process restart restores committed progression; uncommitted disk/process loss is explicitly not guaranteed |
| P13-P15 | Safe storage wrappers and denied-storage browser check; no cache import; backup/reopen rehearsal and operations/legacy/recovery documentation |
| B01-B07 | Accessible persisted selector, enum/default propagation, retained mode, identical blueprint, observed feedback and delayed-work pause/cancel tests |
| B08-B10 | Reproducible 432-shot benchmark, aggregate ordering and solver timing receipt; no human-win-rate claim |
| B11 | Existing damage regression retained; human fairness study not performed |
| M01-M05 | Two-engine/DPR/viewport matrix; native touch and pointer cancellation; reduced motion, art pixels, decoding/crossfade checks and bounded non-secret diagnostics |
| M06-M07 | 20-minute sampled soak plus 28-cycle listener/history plateau; physical FPS, all-frame worst latency and GPU/thermal behaviour not certified |
| M08-M11 | Physical checklist prepared for the user's iPhone 17 Pro and a mid-range Android; **not run** and not signed off |

## Reproduction And Artifacts

Run server builds/tests from `server/`; frontend build and `npm run test:game` from the repository root. After building the server, `node scripts/qa-v12-sockets.mjs` runs an isolated real-process regression on port3002; `node server/dist/scripts/benchmarkDifficulty.js` prints the seeded benchmark. The `scripts/qa-v12-*.js` browser functions run through the Playwright CLI against the local preview on port5174. Start from a clean browser context and close prior QA pages between independent runs.

Raw, non-secret receipts are local under `output/v12/`: `backend-tests.txt`, `frontend-tests.txt`, `socket-verification.json`, `difficulty-benchmark.json`, `soak.json`, `chromium-verification.json`, `webkit-verification.json` and `lint.txt`. Inspected screenshots are under `output/playwright/v12-*`; the prescribed game-client run has `shot-*.png` and `state-*.json` in `output/playwright/v12-client/`. Generated diagnostic files, databases and credentials are not intended for commits.

## Release Gate

Use `mobile-device-acceptance.md` for the iPhone 17 Pro test. iOS/Safari version, sound comfort, heat, battery, interruptions and physical network transitions are still unverified; Android hardware has not been supplied. Coordinate matching frontend/server publication only after acceptance, a verified database backup and zero active production matches. No production restart or push to main was performed in this work.

See `progression-operations.md` for persistence boundaries, backup/restore, anonymous credential loss and the one-time legacy in-memory-score limitation.
