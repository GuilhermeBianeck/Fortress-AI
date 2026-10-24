# Camera Comfort, Network Presentation And Hit Feedback

## What Changed

Game settings are available from the sliders icon beside the speaker. Choices are saved locally and work without an account:

- **Follow shots:** existing turn framing, reveal tour and projectile tracking.
- **Turn focus:** frame the active cannon at turn boundaries without following the ball or touring the map.
- **Manual:** keep the player's chosen view through reveal, shots and turn changes. Pan, minimap and recenter remain available.
- **Motion:** System respects the operating-system preference; Reduced also disables automatic camera tracking, ambient animation, particle bursts and moving hit text. Essential projectile/body movement still follows the same physics.
- **Hit labels:** hide descriptive popups and block labels while retaining actual king-damage numbers and health bars.

The dialog supports keyboard wrapping, Escape, backdrop dismissal and focus restoration. Fullscreen targets the game container so settings and the other game controls remain available. The approved menu and soundtrack are unchanged.

Viewport resizing preserves the viewed world center rather than a stale left edge. This also fixes initial phone framing that could leave the king off-screen. A pending automatic handoff recomputes the active cannon target after layout changes. Resizing does not reset the interpolation buffer or character animation.

## Adaptive Network Presentation

The renderer measures snapshot arrivals, transit variation and delivery gaps. It chooses a visual jitter budget between 100ms and240ms rather than always using 100ms. The budget increases gently and recovers more slowly after a bad stretch; the presentation clock never rewinds. Routine catch-up is capped at 1.15x real time.

This is not client physics prediction. Bodies are rendered only from received authoritative states. A pair of snapshots separated by more than 300ms does not create an invented straight-line trajectory through unknown collisions. Severe backlog over 400ms rebases to the current authoritative range rather than replaying seconds of old movement. Long outages can still produce holds or resynchronization; interpolation cannot repair a missing connection.

The 100-240ms limit is the adaptive buffer budget, not a promise about end-to-end latency. Network transit and recovery can add delay. Inputs, health, turn ownership and results remain server-authoritative and are not delayed by a client-side physics simulation.

A repeatable 250ms-batch test compares held display frames with the old fixed 100ms timeline, requiring at least 60% fewer holds after warm-up. A separate browser scenario actually batches Socket.io state messages during a private game and verifies buffer adaptation, clock monotonicity and real firing. These controlled tests are not a claim about every 4G connection.

## Honest Combat Cues

Server events now include timestamps and, where relevant, position, projectile/target identity, material, destruction state and actual applied damage. Damage is capped to remaining target HP before it is displayed; a wooden block with 30HP does not claim 90 damage. Combat balance and the V9 king-body rules are unchanged.

The presentation queue waits for an event's server timestamp to reach the displayed snapshot timeline. Older servers/fixtures without timestamps retain a bounded arrival-time fallback. Pending cues are bounded, and cues that arrive over 800ms behind the presented timeline are discarded instead of replaying old explosions.

King cues distinguish heavy, light, normal, crush, fall, lava and defeat using confirmed event data. Blocks distinguish armor, normal contact and breakage; ice can show Shattered. Ground/legacy position-only impacts do not invent a successful hit label. Captions and actual damage numbers provide more than color alone.

Text is laid out in screen space at consistent readable sizes. Important king feedback takes priority, repeated target labels are suppressed, and the placement pass avoids health panels, the minimap and other labels. Visible cues are capped at three on narrow layouts or six on larger layouts. Reduced motion removes their upward travel; no full-screen flash or screen shake is added.

Steel, ice and ground contacts have distinct short procedural impact tones. They use the existing shared audio context, mute preference, effect cleanup and music ducking. No new audio download or generated image is required.

## Verification

- Frontend/backend production builds and focused static checks.
- Unit coverage: preference validation/storage failures, camera center preservation, adaptive-buffer response/recovery and authority bounds, no long-gap invented path, invalid/reordered clocks, comparative held-frame benchmark, feedback classification/layout and material sound parameters.
- Real Matter.js tests check that impact metadata matches actual damage/destruction and that damage/impact timestamps agree.
- Browser coverage: saved modes across reload; Manual view through real turn changes; reduced motion; focus wrapping/Escape/fullscreen; settings/header geometry down to 320px; batched WebSocket delivery during firing; real canvas text rendering; timestamped cue ordering; optional labels with numeric health feedback retained.
- Existing menu, king action, physics/render, multiplayer, VFX and full-song audio regressions remain release gates. Final results and deployment receipt are recorded in progress.md.

Physical iPhone/Safari, subjective motion comfort, phone speaker balance and sustained-session performance remain device-playtest work. Native dialog/fullscreen and Chromium mobile emulation do not certify every browser.

## Release

The server change is backward compatible, but matching timestamps and rich target cues require the backend update as well as Vercel deployment. Preserve the existing server environment/data, check for active games and restart only the game process after its build/tests pass. No dependency, infrastructure, firewall, credential or operating-system changes are part of this release.
