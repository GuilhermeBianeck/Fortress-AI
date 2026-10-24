# Fortress AI: Game Feel Review

Review date: 2026-10-24. Scope: combat pacing, king placement and animation, camera comfort, construction, and desktop/mobile play. The approved menu and soundtrack are preserved.

## Verdict

The biggest problems were mismatches between presentation and simulation, rather than a shortage of decorative art. The player saw an 80px character but was actually aiming at a 24px rolling circle. The camera teleported on every turn, then pursued the same ball after bounces. The king could be alive but lying sideways, or dead while the game waited for unrelated rubble to stop moving. Those behaviors make the game feel arbitrary even with attractive illustrations.

This release prioritizes reliable physical rules, readable character states and comfortable camera travel. No new generated artwork is necessary to fix those defects.

## Findings And Implemented Fixes

### P1: Camera Teleports And Repeated Reframing

**Cause:** The combat/turn effect assigned camera position directly to its new target. That same effect depended on viewport dimensions, so rotating or resizing could also reset snapshot interpolation and reactions during a shot. Projectile following continuously centered every ball, including slow or returning ricochets. Minimap taps also teleported.

**Change:** Added a critically damped camera with continuous velocity, elapsed-time updates and bounded travel in viewport units. Automatic travel has a maximum 1.65 viewport widths/second; explicit navigation is more responsive, capped at 3.2. A central 30%-70% tracking band avoids unnecessary movement. Nearby turn transitions change the target, not the current position. Long-distance combat handoffs use a 360ms smoothstep dissolve between two static views, after the dock layout settles. This avoids both a hard visual cut and a slow multi-screen sweep that would leave the next player's cannon off-screen. Only one temporary frame is retained and then released. First entry initializes immediately. Viewport changes no longer reset the interpolation buffer, effects or character directors. Minimap navigation eases into place, while direct drag remains attached to the finger.

Tracking releases on an impact, slow ball or backward ricochet. Reduced-motion mode removes continuous projectile following and the automatic reveal sweep. Explicit controls remain available.

**Evidence:** `src/game/battleCamera.ts`, `src/components/GameCanvas.tsx`, pure camera tests and a browser frame-by-frame trace across reveal, real fire and turn handoffs. A coordinate discontinuity is accepted only while the previous view conceals the new view at the start of a dissolve. The mirrored multiplayer test still requires the next player's cannon to be on-screen promptly; that assertion was not relaxed. Navigation tests now await the actual camera target instead of assuming every move completes in 150ms; visibility assertions were retained.

**Limit:** A speed cap is not proof of comfort for every person. Portrait phones still display a narrow part of a 2400px battlefield. A selectable fixed/tactical camera and physical-phone playtest remain worthwhile.

### P1: Weak Direct Hits And A Misleading Hitbox

**Cause:** Cannon damage was capped at 45HP, while typical direct hits could be around 25HP. A 100HP king therefore needed three to four clean hits. The visual character was much larger than its 12px-radius circular collision body, so shots through the apparent torso could miss.

**Change:** Kings use a 32x64 upright, rounded collision body beneath the existing 80px character art. Mass and movement are explicitly bounded. Direct cannon damage now uses `min(75, max(0, closingSpeed - 3) * 2.4)`, still subject to the existing meaningful-contact threshold and once-per-projectile/target guard. Solid impacts at speed 24-32 deal approximately 50-70HP; glancing, resting and low-speed contacts remain weaker. Maximum HP remains 100. Material/block durability is unchanged.

**Evidence:** A real Matter.js regression takes a full-health king to about 30.6HP with the first solid hit and 0HP with the second. Score records exactly 100 damage, not the uncapped overkill. Existing low-speed, tangential, duplicate-contact, armor and turn-ownership tests remain active.

**Limit:** Not every contact is a two-hit kill. Weak or tangential hits intentionally do less. Heavy falling structures can still crush a king; stronger cannon damage is not blanket immunity to physics.

### P1: Living Kings Become Sideways Objects

**Cause:** A bouncy circular king freely rolled. The renderer applied its accumulated physical angle to the entire illustrated character. Idle/hit animation did not distinguish falling from landing, and side selection relied on proximity to potentially stale coordinates.

**Change:** Upright infinite-inertia bodies, low restitution, standing friction and bounded knockback prevent uncontrolled rolling without making combat kings static. The renderer anchors art at the feet and does not inherit physical roll. Authoritative side tags select the correct royal even when positions change. Existing independent head, arm, chest and cape pieces now blend airborne and short landing-recovery reactions. A survivor returns to ready/aim/idle; no automatic healing or teleport home is introduced.

**Evidence:** A real king is displaced away from its platform, falls, lands upright and retains its reduced health. Browser presentation fixtures deliberately include a large obsolete body angle and verify airborne/landing/defeat states with screenshots. Fixtures change only that client's presentation, not server physics.

**Limit:** These are articulated reactions using current artwork, not a full walking/ragdoll animation system. Separate knee/foot art should only be commissioned if intentional walking or more expressive landings are added.

### P1: A Dead King Waits For Rubble

**Cause:** Win checks ran only when the turn expired or every dynamic body settled, with a maximum wait of five seconds after a shot. While waiting, a zero-HP king could return to idle. After resolution, the old scene's physics and hazard timers could continue during the result/inter-round display.

**Change:** Death is checked after both physics substeps. It resolves the round without waiting for unrelated debris, while retaining the existing simultaneous-death/attacker rule. Zero HP selects defeat immediately, before a result message is required. Resolved sessions stop physics, bot and hazard timers while preserving the final world for the result display. A new round gets a fresh session. Leaving the world counts as defeat rather than an unwinnable missing king.

**Evidence:** Two-shot regression verifies one damage/death/result sequence, no delayed duplicate result, exact scoring and frozen final positions. Best-of-three, rematch and session cleanup regressions remain in the server suite.

### P2: Unsafe Or Visually Floating King Placement

**Cause:** The bot computed its foundation top using old 360px/20px dimensions while spawning used 180px/34px dimensions. Its original roof also left insufficient room for the larger visible character. Platforms positioned from the highest terrain point could end above lower ground at one edge. Manually spawned blocks could overlap the king, and build-phase collisions could damage it before combat began.

**Change:** Bot building reads the actual platform body. Taller supports and raised roof/battlements leave a royal chamber clear of the crown. The front shield is mirrored for either bot side. Prefer suitable interior build zones near the side center. Platforms extend into the lowest ground across their footprint; rendering buries their lower edge along the actual terrain contour. Construction supports keep kings in place until combat and then release completely. Block spawning reserves the visible character's space, and build-phase collisions do not reduce HP.

**Evidence:** Tests cover both supports releasing, non-overlapping manual placement, bot wall/roof geometry and foundation grounding across multiple terrain seeds. Screenshot review caught the remaining floating slab after the first physics pass; the grounding/render correction was added rather than accepting it.

### P2: Stale King Positions In Snapshots

**Cause:** King state coordinates were refreshed only when collision damage happened. Positional feedback and consumers of compact king state could lag behind the actual moving body.

**Change:** Synchronize king positions after the full physics step, before broadcast. Compact king coordinates and body updates now describe the same step even without damage. The renderer/directors use authoritative side ownership rather than guessing from stale proximity.

**Evidence:** Moving-without-damage regression compares king coordinates against the same packet's body tuple.

## Next Improvements, In Order

1. **Camera comfort controls and phone playtest.** Add a persistent follow/fixed/tactical choice without crowding the firing dock. Evaluate portrait versus landscape, one-handed navigation and return-to-cannon timing with actual players. Acceptance: no unexpected view movement in fixed mode, all important actions reachable and no lost firing input during a handoff.
2. **Network-jitter resilience.** Measure snapshot gaps and presentation holds on real 4G/Wi-Fi. The existing 100ms interpolation buffer still holds authority during long gaps; it cannot erase network stalls. Evaluate a bounded adaptive buffer before introducing any speculative physics. Acceptance: frame traces, perceived latency and visible-hold counts improve together, without showing false impacts.
3. **Impact readability and pacing telemetry.** Distinguish weak contact, armor hit, direct king hit and crush using actual server damage. Avoid full-screen flashes/shake that would undermine comfort. Record anonymized shots-to-kill, match length and bot miss/hit rates before further damage changes. Acceptance: direct hits are unmistakable; a stronger bot remains beatable.
4. **Targeted character animation.** Only after the movement/landing rules are accepted, consider short matching landing/stagger clips or separated lower-leg pieces for both kings. Validate feet registration, two character identities, alpha and 48-80px readability before import. Do not buy a large miscellaneous sprite sheet just to add animation count.
5. **Hazard/material cohesion.** Falling rocks still use simpler circular art than the royal environment. Reuse the existing stone texture or commission a small, isolated rock/tumbling-debris set if visual comparison shows a real improvement. Keep collision silhouettes honest and debris bounded on phones.
6. **Loading and long-session performance.** The production bundle still triggers the existing roughly 505kB warning. Lazy-load the battle renderer/rig after lobby interaction and benchmark 30-minute sessions on a physical midrange phone. Preserve the new streaming soundtrack rather than decoding full songs into large PCM buffers.

## Verification And Release Notes

- Frontend and backend TypeScript/production builds pass. 111 focused frontend tests and 167 server tests pass in the development run.
- All 28 desktop/mobile production-preview scenarios passed without retries in 5.6 minutes, including the existing mirrored multiplayer cannon-framing check, music, menu, VFX, reduced motion and real shots. Final focused checks also cover a small pillar-clearance refinement and visible mobile defeat framing.
- Inspect real desktop/mobile screenshots, canvas pixels, character states and camera traces. Presentation fixtures are explicitly separated from real physics tests.
- A public release needs both Vercel frontend deployment and the VPS backend update; a push to main alone cannot activate server damage or king-body changes.
- Release `9d03e51` is deployed on both. The VPS repeated all 167 tests successfully and its production dependency audit reports zero findings. Desktop and mobile-sized private solo checks on the public site both passed, including actual new king-body metadata, accepted shots and bot/turn camera handoffs; live screenshots were inspected. Existing configuration/data and unrelated host applications were preserved.
- Physical iPhone/Safari, subjective motion comfort, phone-speaker listening and sustained mobile performance remain unverified. Browser emulation is not physical-device certification.
