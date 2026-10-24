# Cartoon V2: Menu And King Reactions

## Purpose

Continue the approved bright cartoon artillery direction. The lobby, queue, ready room and campaign band reuse the six approved V1 assets, so they match the actual battlefield rather than introducing another art style.

Three new, individual king poses add readable hit, victory and defeat feedback. These are key poses with restrained procedural breathing/flinching, not a complete frame-by-frame animation set.

## Sources

Generated through the built-in ChatGPT image tool using C02's king as the edit reference. No API key was required. The exact prompts and source paths are preserved in `generation-record.json`; untouched masters are in `masters/`.

The generation interface did not expose a selectable model identifier. We therefore record the tool honestly rather than claim an independently verified Images 2.0 model version.

## Registration

Run `npm run prepare:reactions` to regenerate runtime assets, the manifest and `qa/registration.png`.

- All three 1254x1254 RGBA masters use the V1 reference's full-canvas transform.
- Runtime canvases are 256x320 with a shared foot pivot.
- No per-pose silhouette trimming or stretching.
- Meaningful transparent padding is required on every side.
- Feet are checked against the idle pose and import fails on material drift.
- The current assets need no corrective scaling or translation: all feet span x=87..217, bottom y=292.
- QA displays each pose at 64px and 112px on light, sky and dark backgrounds.

## Integration

`src/sprites/kingReactions.ts` loads the three hashed runtime PNGs, falling back to the approved idle king if an image cannot load. `src/game/kingAnimation.ts` selects poses from damage events and the server's result. Result portraits remain visible independently of the physics body's survival.

Reduced motion keeps the expressive poses but disables breathing and flinch transforms. The menu uses separate hills, castle, king, cannon base and barrel layers. Castle grounding is derived from the landscape alpha, not a baked moon/castle composite.

## Verification

See `verification.md` for completed browser and build checks. Physical-device performance and full multi-frame animation cycles remain future milestones. This release does not claim parity with, or superiority to, a shipped commercial game.
