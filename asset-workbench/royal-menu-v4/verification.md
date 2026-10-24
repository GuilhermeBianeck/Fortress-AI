# Royal Menu V4 Verification

Verified locally on 2026-10-19. No commit, push or deployment performed for this request.

## Passed

- All eight generated masters visually inspected. Prepared assets inspected as a contact sheet and in the real menu; complete crowns, ribbons, banners and button corners preserved.
- `npm run prepare:royal-menu`: eight runtime WebPs decoded and validated for dimensions, padding and transparency. Courtyard is fully opaque; isolated artwork retains real alpha. Total new artwork: 729,034 bytes.
- `npm run prepare:menu-audio`: source hash unchanged, no clipping or added silent gap, 7.25-second loop, boundary steps approximately -68dBFS, oversampled peak approximately -12.96dBFS. Numerical checks are not a guarantee of perceptually seamless music.
- `npm run build`: production frontend compilation succeeds.
- `npm run test:game`: 59 focused tests pass, including 17 audio preparation/lifecycle checks and prior rendering/input regressions.
- Targeted ESLint passes for the new menu/audio/import code and `tests/e2e/royal-menu.spec.ts`. This does not claim a clean whole-repository lint run; older unrelated issues remain documented in prior milestones.
- All 18 production-browser scenarios pass in desktop and touch-emulated mobile Chromium, without retries. Includes existing battlefield, two-player chat/cannon, menu/results, material-effects scenarios and four new royal menu/audio runs.
- Actual HTML controls checked at 1440x900, 1280x720, 390x844, 768x1024, 844x390 and 320x568. Main CTA fits the first viewport, controls do not intersect each other, input boxes fit horizontally and artwork loads without asset 404s or client exceptions.
- Screenshots inspected directly for desktop, compact portrait, phone landscape and ready room. Red banners, flame-only motion, real labels, distinct royals, panel alignment and visible standing ground checked.
- Browser audio instrumentation confirms a decoded, non-silent 7.25-second looping buffer after the first interaction, no pre-gesture track fetch, one voice across two real loop boundaries, fade/stop on mute, reuse on unmute, one fetch and stop when gameplay begins. Touch-emulated and desktop cases both pass.
- Reduced-motion menu check freezes banner/flame/other menu animation; fixed torch bowls have no animation.
- Prescribed frame-by-frame web-game client joined a real private room, used Ready and entered build. Inspected screenshot/readout report 6/6 battlefield art, 7/7 reaction images, both kings, physical right-player identity and no captured client errors.

## Reproduce

Run frontend and backend locally, plus a production preview on port 5174. Backend uses the installed Node 22 runtime.

```sh
env PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npx playwright test tests/e2e/royal-menu.spec.ts tests/e2e/cartoon-menu.spec.ts tests/e2e/cartoon-vfx.spec.ts tests/e2e/cartoon-experience.spec.ts --project=desktop --project=mobile --retries=0
```

Screenshots/readout: `output/royal-menu-v4/`. Exact prompts: `generation-record.json`. Audio preparation: `audio-qa.json`. The browser assertions are in `tests/e2e/royal-menu.spec.ts`; audio unit coverage is in `src/audio/menuAmbience.test.ts`.

## Not Claimed

- Physical iPhone/Android, Safari, thermal/GPU profiling or speaker/headphone listening have not been certified. Browser emulation verifies layout/events, not real-device performance or subjective sound quality.
- The provided video is not played behind the form. Its text and layout morph; separate artwork and stable live controls intentionally replace that behavior.
- Flame/banner animation is procedural artwork motion, not a newly authored frame-by-frame character animation cycle. Small distant flags, clouds and landscape detail remain painted into the courtyard.
- This milestone upgrades the opening menu and its audio. It does not complete the wider combat/physics roadmap or establish superiority over another game.
