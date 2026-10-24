# V3 Verification

Date: 2026-10-19. Local changes; no new commit, push or deployment.

## Assets

- Four distinct rival masters generated through the built-in image tool, with exact prompts saved in `generation-record.json`.
- `npm run prepare:rival` passes: 256x320 RGBA outputs, meaningful alpha, clear edge padding and a common foot pivot.
- Final boot bounds match across idle/hit/victory/defeat. Hit/victory use a small uniform 1.7% registration correction, not independent silhouette cropping.
- Contact sheet inspected on white, blue and dark at 64px and 112px. Full crown, cape and boots are retained; the face, crown shape and outfit read differently from Ember.
- Actual PNG tests inspect both four-pose rosters for dimensions, clear margins, alpha and boot registration.
- Production loads six battlefield assets and seven additional royal images. Idle Ember is part of the original six; Ivory's idle is part of the seven.

## Build And Tests

- Production TypeScript/Vite build passes.
- Targeted ESLint and `git diff --check` pass.
- `npm run test:game`: 42 tests pass, including real asset validation, muzzle geometry/mirroring, particle budgets, material shape differences, elapsed-time behavior, reset/reduced-motion cleanup, and existing aiming/snapshot/placement logic.
- Chromium desktop/mobile regression run: all 14 scenarios pass. The suite covers the menu, ready room, real opponent-disconnect results, both royal rosters/reactions, material rendering, accepted shot effects, Build/Inspect/cancellation, angle/power, one-shot firing, camera framing, chat and mirrored right-side cannon.

Reproduce the browser checks against a running production preview and backend:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/cartoon-menu.spec.ts tests/e2e/cartoon-vfx.spec.ts tests/e2e/cartoon-experience.spec.ts --project=desktop --project=mobile --retries=0
```

## Visual And Interaction Evidence

Screenshots/state in `output/cartoon-v3/` are local review artifacts:

- Menu at 1280x720, 390x844, 768x1024, 844x390 and 320x568: CTA in first viewport, no horizontal overflow, labels clear of artwork.
- Tall new-player menu fills the viewport with the scene grounded at the bottom. Returning-player profile fixture retains the visible campaign band without horizontal overflow.
- Ready portraits use the correct characters/colors for either local side and face each other in the versus layout.
- Hit feedback actually draws each character's matching hit PNG; it returns to idle. Both result outcomes use the correct pose, and the right-side local player gets Ivory's victory portrait after a real opponent disconnect.
- Material fixtures exercise the real event handlers and verify splinter/chip/shard/fleck/spark counts. They test presentation only, not real collision damage or removal of server blocks.
- A real accepted shot produces bounded muzzle smoke/sparks; the flash follows the barrel. Foreground barrel metal occludes the emerging projectile. Reduced motion clears and suppresses particles.
- The prescribed frame-by-frame game client joined a real private room as the right player, entered build and panned. Its screenshot/state were inspected: 6/6 art, 7/7 royal images, Ember left and Ivory right, no reported client error artifact.

## Not Yet Certified

- Physical iOS/Android and Safari/WebKit. Only Chromium binaries were available locally.
- Thermal/dense-collapse performance, listening tests and comparative player preference.
- Full authored character cycles, character selection, persistent cosmetics or additional rosters.
- Authoritative projectile-origin/art agreement and shot command acknowledgments. Physics/launch/damage rules are unchanged in this visual pass.
- Existing unrelated whole-repository lint and server timer-test failures are not repaired here.
- At a saturated particle budget, new particles can be dropped; the independent barrel flash remains visible. Profile on real phones before raising budgets.
