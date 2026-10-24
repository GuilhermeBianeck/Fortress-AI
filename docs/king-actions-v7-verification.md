# King Actions And Session Cleanup V7

Date: 2026-10-24.

## Publication

- Published the previously verified menu, battlefield, audio, damage, bot and idle-rig work to `main` in `ee011fd`.
- GitHub's Vercel check and Production deployment status both reported success. This verifies the frontend deployment, not the separately hosted game server. Backend hosting confirmation was requested from the user.
- Excluded `server/data/events.jsonl`, browser scratch files and `output/` review artifacts from Git. Retained generated asset provenance, original masters, importers and runtime files.

## New Behavior

- Both kings blend grounded ready, aim, accepted-shot recoil, brace and recovery joint poses. Damage/result artwork blends at the existing registered foot pivot. Idle breathing, blinking, gestures and cape movement continue underneath where appropriate.
- Transitions use elapsed time with 70ms recoil, 110ms brace and 180ms general blends. No whole-character translation or collision-body change is introduced. Reduced motion neutralizes joint movement and makes reaction swaps immediate.
- Bracing is a nearby-ball presentation cue, not a predicted authoritative hit. Ignore resting, receding, distant and current own-shot projectiles. Both kings retain independent directors, clocks and reaction history.
- Projectile metadata now carries the server-recorded owning side through initial/full-sync packets and immutable deltas. Recoil no longer guesses ownership from the active turn, which may already have changed during the 100ms presentation delay. Old-server compatibility falls back to the initial projectile's map side.
- No additional runtime images are needed. All clips reuse the twelve registered V6 rig pieces. `npm run prepare:king-action-qa` renders the actual directors/rigs in `asset-workbench/living-kings-v6/qa/action-clips.png` for visual inspection at 48/72/112px and larger sizes.

## Cleanup Defect Found During Verification

The first long regression run exposed server saturation after many solo sessions. A solo room retained its dummy bot when the human left, so it was never considered empty. Forfeiting destroyed the turn state machine but did not stop the physics loop. Repeated sessions therefore accumulated live simulations.

- Five targeted lifecycle regressions failed on the old code, including twelve abandoned solo sessions leaving twelve rooms behind, and a forfeit retaining its physics timer.
- Rooms with no human players now dispose their sessions, player mappings and rematch state immediately. The periodic cleanup applies the same rule.
- Forfeit now uses the existing complete session cleanup path: stop physics, bot, hazards and projectile timers, while retaining the final world data for results/rematch handling.
- Those five tests now pass. The local backend previously consumed about 99% CPU after repeated test sessions; after restarting with the fix it measured about 2% while active test matches were running. This is diagnostic evidence, not a device-performance benchmark.
- The interrupted run's original failure artifacts were preserved locally under `output/king-actions-v7/pre-cleanup-failures/`. No timeout was widened to hide the issue.

## Verification And Limits

- Frontend focused suite: 95 tests, including clock-rate independence, continuous transitions, reaction blending, grounded attachment bounds, reduced-motion recovery and projectile ownership across deltas.
- Backend suite: 159 tests, including initial/full-sync ownership metadata and the five resource-lifecycle regressions. Both production builds and scoped lint pass.
- Final complete affected browser rerun: all 24 Chromium desktop/mobile scenarios passed without retries in one 3.7-minute run after the cleanup fix. The local backend measured about 0.3% CPU after the run and QA host were closed.
- Vite reports a non-fatal main-chunk warning at about 503KB minified / 153KB gzip. No new runtime bitmap payload is added by this milestone. A renderer/loading split remains a separate optimization task.
- Browser action checks use a real accepted player shot for recoil/recovery. Deterministic brace/damage fixtures enter through a test-only intercepted network boundary on both sides; they do not mutate the real server or add production cheat hooks.
- The prescribed frame-by-frame game client joined a real right-side private-room game with all 12 rig pieces loaded and both action directors in ready state. Its screenshot and readout were inspected under `output/king-actions-v7/skill-client/`.
- Large/runtime-size joint contact sheet and actual desktop/mobile aim, brace and recovery screenshots were inspected. Feet remain grounded and crown, neck, shoulder and cape registrations remain intact.

Physical-phone/Safari, dense-room scheduling contention, subjective audio listening and long thermal runs remain open. These are bounded joint gestures and transitions, not a walk cycle, full facial-expression system or cinematics.

## Next Work

1. Confirm and verify the live backend deployment so server-side damage, bot learning and resource cleanup match the frontend release.
2. Author a small expression/hand set only where a pose genuinely changes anatomy: pointing command, guarded face, pleased victory and startled hit. Register new art to the existing neck/shoulder anchors before use.
3. Add a longer speech-free instrumental master for musical variety, then audition transitions on real mobile speakers/headphones.
4. Profile physical iPhone/Android sessions and dense destruction before adding more particles or adopting a different renderer.
