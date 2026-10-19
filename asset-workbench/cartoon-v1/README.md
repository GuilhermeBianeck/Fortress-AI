# Fortress AI: Cartoon Art Study V1

Created 2026-10-19 using the built-in image generation tool. No external API key or API workflow was used. This is the first asset batch for the bright cartoon artillery direction chosen by the user.

## Deliverables

- `masters/`: seven full-resolution generated PNGs. C01 is an art-direction illustration, not a runtime backdrop.
- `runtime/`: six validated assets imported by `src/sprites/cartoon.ts` and bundled with hashed production URLs. Existing landing sprites remain unchanged.
- `asset-manifest.json`: measured dimensions, alpha bounds, crop/padding, pivot coordinates and wood edge metrics.
- `generation-record.json`: exact prompts, reference dependencies and transparency settings. The C07 refinement used the first C07 output as its target and C06 as its style reference, preserving transparency.
- `iterations/`: rejected first fortress treatment, preserved for comparison.
- `qa/contact-sheet.png`: actual-size king studies, cannon assembly at 0/35/65 degrees, and independent scenery layers.
- `qa/wood-3x3.png`: repeating material study.

## Art Review

The selected king is expressive and complete, with no cropped crown, cape or boots. It is shown on white, sky-blue and dark backgrounds at 48/64/96px canvas heights. Visible character height is smaller than canvas height because each export preserves safe padding.

The cannon base and barrel are separate. Their measured attachment metadata aligns the layers at every aiming angle. The battlefield rotates the barrel independently and applies a short time-based recoil after an observed server projectile. The authoritative projectile still originates at the existing cannon center, not the illustrated muzzle; the preview uses that real launch origin. Further muzzle/physics alignment requires a coordinated server change.

The first castle was too prominent and elaborate for a distant horizon. The selected refinement removes the large banners and reduces internal detail and contrast. In the review composition, its base is partially occluded by the hills so it stands on their ridge rather than floating. Hills, castle and sky remain independent layers.

The wood texture has no outer frame, so the renderer can provide shape contours without stretching an illustrated block border. Its normalized opposite-edge mean RGB differences are approximately 1.51 horizontally and 4.23 vertically on a 0-255 scale. A 3x3 repeat was visually inspected. Edges are not mathematically identical; repeat density and material scale still require in-game evaluation.

## Technical Validation

All five cutout/layer exports have real alpha transparency. King, base, barrel and castle exports have measured clear edge padding of at least 20/20/24/32px respectively. The hill layer intentionally reaches the bottom and horizontal edges; it is not declared horizontally tileable. The wood export is fully opaque.

Runtime candidate dimensions:

| Asset | Size |
| --- | --- |
| King | 256x320 |
| Cannon base | 512x320 |
| Cannon barrel | 768x320 |
| Wood surface | 512x512 |
| Hills | 1536x512 |
| Distant fortress | 512x448 |

Reproduce preparation and QA sheets from the repository root:

```bash
npx tsx scripts/prepare-cartoon-assets.ts
```

The preparation script validates alpha requirements and normalized padding. It uses source crop rectangles plus explicit source-space attachment coordinates, not independently trimmed animation frames. It does not modify master PNGs or the legacy public sprite manifest. It does overwrite the runtime exports and metadata imported by the cartoon renderer, so changed masters require renewed in-game validation.

The preparation script and targeted ESLint check passed. The contact and repeat sheets were visually inspected. See `docs/cartoon-v1-verification.md` for in-game browser validation; physical-device performance and complete character animation are not established by these checks.

## Next Art Milestone

Author genuinely registered king hit/victory/defeat poses, material break variants, and a matching cartoon menu. Coordinate muzzle geometry with server launch behavior, then test it as a gameplay change. C01 must remain a reference image, not a flattened runtime backdrop. The hills are drawn once, not repeated as an unsupported seamless tile.
