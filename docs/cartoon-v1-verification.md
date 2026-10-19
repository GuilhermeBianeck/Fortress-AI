# Cartoon V1 Verification

This is the first playable integration of the approved bright cartoon direction, not the completed premium-game roadmap or a benchmark against DDTank.

## QA Inventory

- Art: all six hashed runtime images load; complete king silhouette, aligned barrel/base, grounded castle, independent hills/sky, no rectangular alpha artifacts.
- Scene: grass is a continuous terrain contour, material blocks retain real physics dimensions, kings and the ground remain inside the canvas at 320x568, 390x844, 768x1024, 844x390 and 1280x720.
- Shell: phase, battlefield, camera dock, build tools and prompt have separate measured areas; controls remain inside the viewport. Landing remains usable.
- Build: Build/Inspect mode, all materials/shapes, preview on press and placement only on release. Inspect drag and cancelled/multi-touch gestures must not place blocks.
- Combat: full 10-170 degree and 5-100 power ranges, pointer aim, explicit Fire, keyboard controls, one local submission per turn, no firing on release/cancel, turn ownership rechecked at submission.
- Camera: buttons, minimap, Inspect pan, two-finger pan, recenter; manual inspection temporarily overrides projectile following. High shots have an offscreen marker.
- Effects: elapsed-time particles, recoil and idle breathing; reduced motion freezes ambient movement and removes debris bursts. Audio is synchronized to observed shots and server impacts; mute remains available.
- State: StrictMode connection replay, immutable snapshot endpoints, round/rematch cache reset.
- Off-happy-path checks: cancel touch while aiming/placing; rotate or resize after firing; inspect while a projectile travels; keep a gesture active during a phase change.

## Scope Limits

The Matter trajectory currently predicts terrain and wind, not future moving blocks or rocks. Gust timing has a bounded launch-phase uncertainty because the server does not send its hazard tick. The illustrated muzzle is not yet the server launch origin. There is one generated king pose with breathing, not a full character animation sheet. Physical phones, network impairment, GPU performance, and long multiplayer sessions require separate validation.

The test client's time shim waits real frames. This server-authoritative game deliberately does not expose a client hook that pretends to advance server physics deterministically.

## Results

- Six independently generated assets pass alpha/padding checks and load as 6/6 in both development and the built production app. Hashed image outputs total about 1.33MB. The flat C01 illustration is not bundled.
- Production browser inspection confirmed that the old 131-image manifest is no longer fetched/preloaded; visible legacy menu images load normally on demand.
- `npm run test:game`: 24 focused tests pass (ballistics, viewport transforms, snapshots, right-side damage feedback, and shape/side placement parity with the server).
- `npm run build`: passes. The server build also passes after restoring its lockfile-declared development dependencies locally.
- Targeted ESLint on every changed TypeScript file passes. Whole-repo lint still reports 27 pre-existing errors in untouched server code and legacy E2E files.
- Server tests under the available Node 22 runtime: 125 pass, 8 fail. All eight failures advance the old 15-second timer while the unchanged production constant is 25 seconds. Neither server source nor these tests was changed for this graphics pass.
- All six scenarios pass against the final production build across desktop/mobile Chromium: five-size fit with safe input and explicit fire, reduced-motion controls, and real two-player chat with mirrored right-side aiming. The turn-handoff check asserts that the active right cannon remains in frame even while the previous cannonball still exists. Run with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174` while serving the built app on 5174. Production validation avoids development hot-reload interruptions encountered during an earlier overlapping edit/test run.
- A separate real invite-room/forfeit check verified the result screen at 320x568 and New Game returning to the menu without browser errors.
- The prescribed frame-by-frame client was run against a real multiplayer room and entered the game through keyboard Ready. Its final screenshot and readout show the right player, live bodies, camera movement and 6/6 art; no client error report was produced. The initial click-based attempts remained on the menu, so they are not counted as gameplay verification.
- Screenshots are in `output/cartoon-v1/`, including the production build and portrait/landscape/touch-emulated states. These are browser checks, not physical-device certification.

## Next Work

Registered king reactions and matching cartoon menu art remain the next visual milestones. A future protocol change should acknowledge shot acceptance and align the illustrated muzzle with the authoritative spawn. Investigate the existing disconnected solo-room cleanup and stale legacy tests before a broad release gate.
