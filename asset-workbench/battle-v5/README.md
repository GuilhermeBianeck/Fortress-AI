# Illustrated Battlefield V5

The user approved the V4 menu and supplied `reference/battle.png` as the visual target for actual gameplay. This pack brings that sunny alpine castle, crisp natural terrain and gold/sapphire game UI into the existing server-authoritative game. It is not a flattened screenshot behind fake controls.

## Generated Assets

All eight assets were generated with the built-in `image_gen.imagegen` tool, without an API key. The tool does not expose an independently selectable model version. Exact final prompts are in `generation-record.json`; untouched source PNGs are in `masters/`.

| Saved Runtime File | Value In The Game |
| --- | --- |
| `runtime/sky.webp` | Opaque illustrated blue sky, replacing the flat color/CSS cloud treatment |
| `runtime/valley.webp` | A continuous grounded castle/mountain/waterfall environment with transparent sky |
| `runtime/cloud.webp` | Independent drifting cloud layer behind the mountain skyline |
| `runtime/earth.webp` | Continuous rock-and-soil cutaway, without framed square ground tiles |
| `runtime/grass.webp` | Alpha foliage fringe mapped along the real sloping terrain |
| `runtime/stone.webp` | Pale chiseled material for stone blocks and foundations |
| `runtime/hud.webp` | Nine-sliced sapphire/gold health panels, minimap and control dock |
| `runtime/fire.webp` | Ruby/gold Fire artwork behind an accessible live button |

The existing approved kings, registered reaction poses, separate cannon barrel/base and wood material are reused. Ice, rubber and steel retain their material-specific rendering and effects rather than being disguised as barrels. Colliders, material rules and the launch contract remain unchanged.

## Preparation And Layout

```sh
npm run prepare:battle-art
npm run build
```

Preparation uses the repository's `canvas` dependency and installed `cwebp`/`ffmpeg`. Application builds consume the prepared files without requiring those tools. The importer records real alpha bounds, crop, dimensions, bytes and source provenance in `manifest.json`, decodes the exported WebPs, checks opaque surfaces for holes and produces `qa/contact.png`.

Earth and grass receive a premultiplied-alpha overlap normalization for horizontal repetition; source masters remain untouched. Terrain follows the existing server contour. Grass uses small overlapping contour quads with world-anchored texture coordinates, so panning does not make the ground texture swim. Block textures repeat at a fixed material scale instead of stretching a square image into beams and pillars.

New runtime artwork totals 1,221,536 bytes. The obsolete hills/castle images are no longer bundled or fetched by the active cartoon loader, saving 658,169 bytes of superseded art. The active retained-art count is now 4, reactions 7, and V5 art 8.

## Clarity, Motion And Controls

- Canvas backing resolution follows device density up to 3x, with a 4,194,304-pixel budget above 1x. Very large viewports never render below one backing pixel per CSS pixel.
- Rounded backing-buffer dimensions drive the actual context transform. The scene is not CSS-scaled from an 800px bitmap and has no scene blur filter.
- Sky and valley retain their native aspect ratios. Portrait uses an intentional castle-side crop instead of squashing the scenery.
- Separate clouds drift using elapsed time; landscape has restrained camera parallax. King reactions, recoil, muzzle flash and bounded material-specific particles remain live.
- Reduced motion freezes cloud drift and suppresses procedural king/muzzle/particle motion; necessary camera movement and damage information remain available.
- The parchment phase banner and corner identity overlay the scene. Health panels sit below the banner, and their shared hit regions prevent taps from placing blocks or changing aim behind the HUD.
- Fire, angle, power, camera, Build/Inspect and shape/material controls remain real controls. Mobile rotation preserves the existing explicit-fire/cancel behavior.
- Chat opens as an overlay on desktop and phone instead of permanently narrowing the battlefield. Results, AI settings and builder controls share the illustrated UI palette.
- The banner distinguishes a moving projectile from an opponent still aiming. This is a presentation derived from authoritative snapshots, not a new shot-acknowledgment protocol.

This is a substantial visual integration, not completion of the broader physics/reliability roadmap. Distant waterfall/flag details are painted into the valley, not authored animation cycles. Physical-device performance and subjective audio review remain separate checks.
