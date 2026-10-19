Original prompt: Implement the Royal Landing Page Immersion Upgrade Plan using P14-P18 generated assets.

Progress:
- Imported P14-P18 into deterministic runtime sprites and regenerated the manifest.
- Added royal landing layers, logo ornaments, UI-frame overlays, ambient sprites, and preview-loop icons.
- Build passed; first browser pass found title shimmer was hiding the title during load, then CSS was adjusted so the title remains visible while shimmering.
- Final desktop, mobile, tablet, and reduced-motion screenshots were captured with 30/30 landing sprites loaded and no sprite 404s.
- Interaction flow checked: name entry, Solo/PvP toggle, How to Play expansion, and solo battle transition.
- Follow-up alignment pass fixed clipped flag crops, tightened P16 UI-kit crop boxes, removed the bad duplicated ridge layer, and aligned the segmented/button overlays.
- Revalidated desktop/mobile/tablet screenshots after the correction pass with 29/29 landing sprites loaded and no sprite 404s.

TODO:
- Full-project lint still has pre-existing server/test lint errors unrelated to this landing work.

2026-10-19 - Bright cartoon gameplay upgrade:
- User approved bright cartoon artillery direction and generated art integration.
- Prepared six individual alpha-validated runtime assets, source provenance, and small-size QA sheets in asset-workbench/cartoon-v1. The flattened style reference is not runtime art.
- Implementing measured, uniformly scaled battlefield with explicit firing, safe pointer cancellation, and separate build/combat docks. No physics prediction is added to the authoritative network state.
- Agents are fixing shell/mobile layout, immutable snapshots/StrictMode lifecycle, and Matter-based trajectory previews in disjoint files.
- Physical-device performance, additional character animation poses, and full art replacement remain later milestones; this is a tested first playable slice, not a claim to exceed DDTank yet.
- Completed the cartoon renderer, continuous terrain contour, pivot-aligned cannon, time-based effects, measured responsive shell, Build/Inspect controls, explicit Fire, camera tools and short-landscape tactical/overview views.
- Removed eager loading of the unused 131-image legacy manifest; existing menu images remain on demand. The new six-asset pack is bundled with hashed production URLs.
- Corrected right-king damage feedback and retained king coordinates on HP events. Added regression fixtures.
- 22 focused tests, frontend build, server build and changed-file lint pass. Server dependencies restored from the existing lockfile with Node 22; its suite is 125 pass/8 fail because untouched tests use 15 seconds against the current 25-second turn constant. Existing whole-project lint has 27 unrelated errors.
- Browser size/input/reduced-motion checks pass in desktop and mobile Chromium; two-player chat and mirrored-cannon verification is being finalized. Production art loading and prescribed frame-by-frame gameplay client were inspected.
- No commit, push, server rules change or deployment was made. Preserve the pre-existing events.jsonl changes and generated review artifacts.
- Final visual QA caught lingering-projectile auto-follow hiding the next cannon; tracking now resets per turn and only follows newly observed shots. Added a real two-player framing regression check.
- Placement previews now use actual 30x30 / 30x90 / 90x15 dimensions and mark invalid side positions red; client placement mirrors the unchanged server bounds. All 24 focused tests pass.
- Two-player chat, right-cannon mirroring and mobile mute were visually inspected; both desktop and mobile six-scenario suites passed before the final shape-preview rerun.
- Final production rerun: all 6 browser scenarios pass after the shape-preview and camera fixes. PLAYWRIGHT_BASE_URL can select the production preview; this avoids live-editor reloads interrupting long test runs.
- Invite-room result/forfeit at 320x568 and New Game return were verified separately. Final frame-by-frame client entered gameplay with 6/6 art and no reported client errors. New focused test count is 24; physical-device validation remains outstanding.
