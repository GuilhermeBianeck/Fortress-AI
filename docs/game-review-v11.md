# Fortress AI Game Review

Date: 25 October 2026

## Verdict

The largest remaining problems were session reliability and frame cost, not missing artwork. Full-match testing found issues that short launch-and-fire checks had missed. This pass fixes those issues while retaining the approved menu, music, characters, damage balance and server-owned physics.

The game now has clearer round breaks, accurate whole-match results, clean rematches and a usable exit/recovery path. High-density Chromium phone emulation was genuinely slow; measured rendering adjustment substantially improves that case. This is progress toward a polished artillery game, not proof of superiority to DDTank or certification of all phones.

## Findings And Fixes

| Priority | Finding | Correction | Evidence |
| --- | --- | --- | --- |
| High | Reconnecting hid the warning but left a frozen, unusable match. The server had already removed the old socket's room membership. | Reset to the menu after a new connection, explain that the previous session ended, disable offline interaction and discard offline gameplay commands. Refresh the profile on connect. | Offline/online browser reproduction before and after; deliberately invoked offline Ready did not replay. |
| High | Triple-density Chromium phone rendering fell to roughly 15 FPS. | Measure sustained frame times and lower canvas supersampling in 0.5x steps when slow, with a 1x minimum. Recover only after 20 healthy sampling windows and spare rendering time. HTML, physics, world coordinates and image masters are unchanged. | Same phone-sized flow rose to 49.2 FPS at 1.5x; five policy regressions cover bounds, transient stalls and recovery. |
| Medium | Rematch retained the previous round number and score, such as R3 / 2-1. | Reset client round/turn/result data; send authoritative round metadata at every session start. Cancel old rematch timeouts. | Completed match and actual rematch now show R1 / 0-0. |
| Medium | Results credited only the final round's damage, resources and combat time. | Accumulate raw round statistics, compute the match reward once, and exclude round-break/build time. Reset the accumulator for rematches. | Two-round integration test plus timer/resource/AI aggregation test; real three-round result reports 234.7 damage and 57 seconds of combat. |
| Medium | The four-second round break still looked like live combat. | Introduce a non-interactive intermission with round won/lost, score and next-round countdown. | Real round-break screenshot; authoritative canFire check; subsequent round metadata verified. |
| Medium | A replacement joining after the lobby host left received the same side as the survivor. Ready state could also belong to the previous opponent. | Allocate the vacant side and reset remaining lobby readiness. | Failing-before server regression and actual three-browser host/guest/replacement flow. |
| Medium | A departed opponent still left a Rematch request available, and pending next-round work could survive a departure. | Reject absent-opponent rematches, hide impossible requests and cancel tracked round timers on exit/destruction. | Failing-before timer/request tests; actual PvP forfeit and return to menu. |
| Medium | Players had no in-game exit except refreshing; the first exit confirmation clipped in short Chromium landscape. | Add a confirmed Leave battle action in settings. Confirmation replaces the settings content rather than extending an overflowing form. | Cancel/confirm and repeated visit checks; 844x390 layout reproduction and correction. |
| Low | Sound control disappeared on results screens. | Keep an accessible mute button available above the result panel. | Final result-screen check included in verification below. |

Invite links now wait for the real server connection instead of relying on a 500ms startup guess. This is important because offline commands are intentionally no longer buffered into a future connection.

## Playtest Method

- Test the local production build against the actual local Socket.io/Matter.js backend. No client physics cheats, forced king deaths or shortened timers were used in the complete browser matches.
- Play through three real three-round solo matches, both victory and defeat, using a repeatable human-side aim policy. The desktop baseline finished 2-1; the corrected desktop replay finished 1-2 with ten human shots. The final phone-sized match finished 2-1 with ten human shots, 200 damage and 54 seconds of combat; result mute and the R1 / 0-0 rematch also passed. These are examples across procedural worlds, not a statistical balance study.
- Exercise private room creation/invites, a lobby host leaving, a replacement joining the vacant side, reset readiness, two-player chat, both cannon turns, a forfeit and returning to the menu.
- Test 390x844 portrait, 844x390 landscape and 320x568 narrow layouts, dialog controls, reduced motion and explicit Fire. Chromium additionally receives real emulated touch cancellation and two-finger gestures; neither should place a block or fire accidentally.
- Run WebKit 26.6 in iPhone-style emulation as well as Chromium. This tests browser-engine behavior on this Mac, not Safari on a physical iPhone.
- Interrupt the real connection, check inactive offline controls, resume it and start a fresh match. The current server still forfeits/removes disconnected sessions; resumable matches have not been implemented.
- Repeat six enter/leave cycles within the same document and socket, collecting JavaScript heap after forced garbage collection. Do not confuse that short sample with total memory, GPU allocation or a long-session phone test.

## Measured Performance

| Controlled sample | Result |
| --- | --- |
| Chromium phone-sized, DPR 3, before adjustment | 15.3 FPS; p95 67.5ms; p99 68.5ms |
| Same flow after adjustment, settled at 1.5x | 49.2 FPS; p95 25.5ms; p99 26.2ms |
| WebKit phone-style emulation, 180 frames before adjustment was added | 60.1 FPS; p95 18ms; p99 19ms |
| Final WebKit recheck with automatic adjustment, retained 3x | 60.1 FPS; p95 19ms; p99 19ms |
| Desktop build scene, 180 frames | 94.8 FPS; p95 16.8ms; p99 18.1ms |
| JavaScript heap after six same-document enter/leave cycles | 5.29 to 5.50 MB, approximately 0.20 MB growth |

These are short, machine-specific browser measurements, not phone hardware benchmarks. Before/after Chromium samples use the same viewport, high-density emulation and reduced-motion mode. A separate DPR 1/2/3 comparison confirmed increasing pixel cost. A terrain cache experiment did not help and was removed; it is not part of the shipped implementation.

Resolution adjustment trades some supersampling for motion when needed. It does not pretend to make a 1.5x image identical to a 3x render. Stable capable devices keep their existing higher resolution. No blanket claim of sustained 60 FPS is made.

## Graphics, Animation And Balance

The current asset groups load as 4/4 core artwork, 7/7 reactions, 8/8 battle artwork and 12/12 rig parts. Inspected phone/landscape screenshots retain distinct foreground terrain, kings, cannons, health bars and muted scenery. No new generated assets are necessary for the fixes in this report.

Existing automated physics checks still cover upright kings, construction support, landing, reserved placement space, real coordinates and two solid-shot defeat. At the established test impact, damage is about 69 HP, making a second comparable hit lethal. No further damage increase is justified by this small playtest alone.

Bot tests exercise both mirrored cannons, wind, changed targets/geometry, real impact feedback and adaptation. Actual matches show the bot can win or lose; that is not proof of fair difficulty across all fortresses. Authored action frames, alternate difficulty settings and broader seeded balance sampling remain later work.

## Audio

Keep both full-length supplied themes and the existing music/effect mix. Browser regression covers real decoding, playback progress, both track boundaries/crossfades, mute persistence, gameplay continuity and effect ducking. Unit checks cover hidden-page pause/resume and sound cleanup. Results now retain the mute control.

No subjective listening, phone-speaker assessment or Bluetooth latency certification is claimed. No new soundtrack was generated and the old repeating welcome loop was not restored.

## Verification Status

- Frontend unit checks: 129 passed, including a pre-publication correction so sustained 150ms frames can trigger adjustment while isolated severe hitches do not.
- Backend unit/integration checks: 175 passed, including eight added review regressions. Final review also caught and corrected timer cleanup in this patch that could cancel a live intermission; periodic cleanup and shutdown now have separate regressions.
- Frontend/backend production builds and scoped lint: passed.
- All 34 current Chromium desktop/mobile scenarios passed across batches. The initial run had 32 passes and two obsolete fixed-density assertions; the revised graphics gate checks the actual density, CSS-pixel minimum and memory ceiling. All 14 final focused scenarios passed without retries (2.2 minutes). These include both revised graphics cases, touch/placement, real two-player play, saved comfort settings, fullscreen, batched network delivery and hit feedback. The first batch also passed both full-theme/crossfade checks.
- Final private-room acceptance additionally passed with a 1.5-second delayed initial connection: invite join, host replacement, chat, firing from both sides, exit-forfeit, result mute/unmute and a hidden impossible rematch. No page errors were reported.
- Final WebKit 26.6 phone-style checks passed on the final build at all three sizes, with real firing, reduced motion and complete artwork. Its 180-frame sample stayed at 60.1 FPS and retained 3x density, with no page/asset failures.
- Local screenshots and CLI playtest probes: `output/playwright/review-v11-*`. Temporary diagnostics/analytics are intentionally not part of the code change.

## Remaining Work

1. **Physical devices:** iPhone Safari and mid-range Android, audio unlock/speaker balance, browser toolbars, incoming interruptions and 20-minute sessions. WebKit/Chromium emulation cannot replace this.
2. **Resumable multiplayer:** an authenticated rejoin/grace-period protocol is needed if brief outages should not forfeit a game. This release recovers honestly instead of displaying a dead board.
3. **Balance study:** record shots-to-defeat, first-player win rate, fortress material use and bot win rate across many controlled seeds and human matches before changing damage again.
4. **Character polish:** authored aim/recoil/landing/defeat frames where the present joint rig visibly needs them, then evaluate at real phone sizes. Do not commission an unrelated asset batch first.
5. **Longer performance coverage:** thermal behavior, GPU/decoded-image memory and CPU-throttled sustained sessions, beyond the short samples above.
6. **Test maintenance:** older pre-redesign browser suites still use removed menu labels and fixed waits. The current release suite is the relevant gate; the entire historical browser directory is not certified green.
7. **Hosting maintenance:** stage runtime/OS and dependency maintenance separately with rollback protection. This review does not modify production infrastructure or unrelated services.

## Publication

Published gameplay commit `62ce1d8` to main on 25 October 2026. Vercel reports success, and the matching VPS backend passed its build and all 175 tests before restarting only the game service with zero connected players. Its production dependency audit reports zero vulnerabilities; the environment file is unchanged and protected code/configuration/data rollback backups were retained. No dependency or shared-infrastructure changes were required.

Private live acceptance on [Fortress Battle](https://www.fortressbattle.com) passed: a complete phone-sized 2-0 solo match with eight human shots and 200 combined king damage, round breaks, result mute/unmute and a fresh R1 / 0-0 rematch; real PvP host replacement with a 1.5-second delayed invite connection, chat, both cannon turns, exit-forfeit and no impossible rematch; forced offline recovery with blocked/discarded actions, a fresh usable menu, cancel/confirm exit and one additional enter/leave cycle. No page errors occurred; the forced outage produced the expected browser network error. Live screenshots were inspected, test clients closed and game-port connections returned to zero.

Physical-device testing and the remaining work listed above are not implied complete by deployment. Local review remains available at `http://localhost:5174` (production preview) and `http://localhost:5173` (development).
