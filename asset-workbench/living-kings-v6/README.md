# Living Kings V6

Genuine cutout idle puppets for Ember and Ivory. Two generated rig sheets yield twelve separately cropped transparent PNG parts, not duplicated full-body animation frames. Source prompts and correction record: `generation-record.json`. Built-in ImageGen was used without an API key.

## Integration

```ts
import { livingKings } from '../../src/sprites/livingKings';
import { drawLivingKing, livingKingState } from '../../src/game/livingKing';

void livingKings.load();
// Renderer has already translated to the foot, applied world angle and facing.
const drawn = drawLivingKing(ctx, { side, now, height: 80, reducedMotion });
// If false, retain the existing registered full-body fallback.
const debug = livingKingState({ side, now, reducedMotion });
```

- `livingKings.count`: 12. `loaded`: successfully loaded part count.
- `url(side, part)`, `get(side, part)`, `metadata(side, part)`, `load()`.
- Parts: `body`, `head_open`, `head_closed`, `arm`, `cape`, `chest`.
- `drawLivingKing` returns false until all six pieces for that side load. Does not mirror, translate the complete figure, or change the caller's transform.
- Pure debug/state API: `livingKingState({ side, now, reducedMotion?, shootAt?, looking? })`; optional looking is a local-space number from -1 to 1. All time values are milliseconds on the same elapsed-time clock.
- `livingKingAttachments(...)` exposes per-part anchors, rotations and scales.

Foot anchor is (0,0). Nominal height is 320 rig units. The body base and boots stay rigid. The chest breathes at the waist, the head follows by under one rig unit, shoulders remain attached, the front arm makes a short modest gesture on an 11.4-second cycle, and the cape rotates/scales at its hidden shoulder attachment. A separate closed-eye head displays for 120ms every 5.3 seconds; sides have different timing. Reduced motion freezes every articulation and keeps eyes open. Hit, victory and defeat remain the approved full-body assets and are not replaced by this pack.

## Reproduce And Review

Run `npx tsx scripts/prepare-living-kings.ts`. The importer checks real alpha, uses inspected cell rectangles and the largest opaque connected component, normalizes joints and heads, writes metadata, and renders large and small QA. Equal-grid slicing is deliberately not assumed because the generated sheet row spacing varies. The two heads share output dimensions and anchors so blinking does not translate the crown.

Review `qa/assembly.png`: both kings, three independent time samples, 300px plus 48/72/112px views, aligned foot baselines. This was visually inspected for attachment, complete crowns and complete boots. Browser and actual game integration are performed by Main; no servers or browser were started for this asset task.

This is bounded idle cutout animation, not a walk cycle, facial lip-sync, or a replacement for physical collision bodies. Keep full-body reaction poses and fallbacks.
