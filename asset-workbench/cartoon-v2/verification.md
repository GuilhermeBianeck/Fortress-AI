# V2 Verification

Date: 2026-10-19. Local changes, not committed or deployed.

## Passed

- `npm run prepare:reactions`: three RGBA masters produce complete 256x320 runtime sprites with meaningful alpha and padding. All three share the idle foot bounds and need no registration corrections.
- Inspected `qa/registration.png`: idle, hit, victory and defeat remain recognizable at 64px and 112px on white, blue and dark backgrounds. No clipped crown, boots or cape, opaque rectangle or obvious halo.
- `npm run build`: TypeScript and production build pass. Three additional runtime PNGs total approximately 208KB.
- `npm run test:game`: 27 focused tests pass, including bounded hit duration, result priority and reduced-motion transforms.
- Targeted ESLint passes for all changed TS/TSX files and the new importer/tests.
- `git diff --check` passes.

## Browser Verification

Production preview, Chromium desktop and mobile projects:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/cartoon-menu.spec.ts tests/e2e/cartoon-experience.spec.ts --project=desktop --project=mobile --retries=0
```

All 12 scenarios pass:

- Menu checks at 1280x720, 390x844, 768x1024, 844x390 and 320x568. Battle stays in the first viewport; no horizontal overflow or missing images.
- New visitors stay on the menu rather than being moved into Solo by the old one-second timer.
- Player name persistence, Solo/PvP selection, expanded help, queue and Retreat.
- Ready room at 320x568 and 844x390; full king portraits and reachable Ready button.
- Reduced-motion menu and gameplay.
- All six battlefield images and three reaction images load.
- Controlled network-boundary fixtures verify actual canvas drawing of the hit image, return to idle, and both result poses. These fixtures do not claim to simulate real collision damage and add no production cheat interface.
- A separate real two-player room verifies opponent-disconnect victory and New Game return.
- Existing placement/Inspect/cancellation checks, angle/power limits, one-shot firing, camera framing, chat and right-side cannon checks still pass.

The prescribed web-game client also joined a real private room, entered build, panned and captured gameplay. Its readout reports `artLoaded: 6`, `reactionsLoaded: 3`, and both kings idle, with no client error artifact. The screenshot and text were inspected.

Screenshots and state are in `output/cartoon-v2/` (local QA artifacts). Menu, ready room, hit, victory, defeat and the frame-by-frame gameplay capture were visually inspected.

## Remaining Gates

- These are expressive key poses with small procedural transforms, not cleaned multi-frame animation cycles.
- Physical iOS/Android, touch keyboard behavior, audio listening, thermal performance and dense-destruction profiling remain unverified.
- The established unrelated server timer-test failures and whole-project lint issues from V1 are not repaired by this art/menu change.
- Next graphics work should complete one readable shot/collapse sequence: muzzle flash, projectile/impact timing and distinct material breakage. Approve that in real gameplay before broad asset expansion.
- Comparative playtesting is still required before claiming quality above DDTank or another commercial artillery game.
