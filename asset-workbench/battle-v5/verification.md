# Battlefield V5 Verification

Local verification on 2026-10-19. No commit, push or deployment requested/performed for this milestone. The approved menu and supplied references are preserved.

## Asset And Static Checks

- All eight generated masters and the prepared light/dark contact sheet inspected visually. Castle is grounded in its landscape; sky/clouds remain separate. No labels or UI are baked into battlefield scenery.
- Preparation validates decoded runtime dimensions and meaningful alpha; sky, earth and stone have no transparent holes. Source masters and exact prompts are retained.
- New WebPs total 1,221,536 bytes. The old standalone hills/castle no longer appear in the production bundle; 658,169 superseded bytes removed.
- Production frontend build and scoped ESLint pass. No new dependency or server physics change.
- 63 focused tests pass, including density budgeting, scenery proportions, world-anchored terrain UVs, responsive HUD bounds and previous input/physics-presentation/audio tests.

## Browser Checks

- Production-browser checks exercise both desktop and touch-emulated mobile Chromium. The V5 scenario uses a 3x device scale and checks the actual backing-buffer ratio rather than only CSS size.
- Viewports: 1440x900, 390x844, 768x1024, 844x390 and 320x568; existing regressions also cover 1280x720.
- All eight V5 images load. Instrumented canvas calls confirm actual sky, valley, cloud, grass and HUD drawing. The generated Fire border image is active.
- Health taps do not emit block placement; controls stay in bounds, the main action remains at least 44px high, and the phase overlay does not allocate an extra header band or intersect the health panels.
- Real build-to-combat, firing, flight label, reduced motion, safe touch cancellation, full aim ranges, mirrored right cannon, two-player chat, king reactions and authoritative results remain under regression coverage.
- Desktop, small-phone build, phone/landscape combat and results screenshots directly inspected. There are no reported asset 404s or client exceptions in the successful runs.
- The prescribed frame-by-frame game client joined a real private room and entered build. Screenshot/readout inspected: retained art 4/4, reactions 7/7, V5 artwork 8/8 and correct right-side Ivory identity.
- A separate real UI play-through placed stone columns and wood beams, entered combat and inspected the resulting live physics scene. No production cheat hooks or fake gameplay screenshot were added.

Final production-browser rerun: all 20 scenarios passed without retries after the HUD hit-region protection. Captures are in `output/battle-v5/`; exact prompts are in `generation-record.json`.

## Reproduce

Run frontend/backend plus the production preview on port 5174, then:

```sh
env PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/battle-art.spec.ts tests/e2e/royal-menu.spec.ts tests/e2e/cartoon-menu.spec.ts tests/e2e/cartoon-vfx.spec.ts tests/e2e/cartoon-experience.spec.ts --project=desktop --project=mobile --retries=0
```

## Limits

No physical-phone/Safari, thermal/GPU or long-session frame-rate certification is claimed. Browser screenshot sharpness and correct backing density do not establish native 4K source detail or mobile 60fps. Existing whole-repository lint/backend timer-test issues remain documented in earlier milestones. No human speaker/headphone review was performed; existing mute/menu-loop and combat-event audio behavior is retained.
