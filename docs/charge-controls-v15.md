# Reliable Charge Controls

30 October 2026. Follow-up to the per-turn wind and hold-to-charge release.

## Requirements

- A charge belongs to the initiating pointer or key. Other input cannot release it.
- Space charges globally outside editable controls. Space and Enter work on the focused Fire button. Release submits once; native button activation cannot add another shot.
- Pointer cancellation, lost capture, keyboard focus loss, inspection, pause, authoritative resync and phase/turn changes cancel without firing.
- Full charge still auto-fires. Releasing afterward cannot submit twice.
- Assistive click activation can start a charge and activate again to release it. The pressed state is exposed programmatically. Physical screen-reader usability requires separate human acceptance.
- Keep the approved artwork, flight pacing, server damage, wind and power curve unchanged.

## Changes

`GameCanvas` tracks the initiating pointer ID or key, cancels interrupted input, supports Enter and assistive activation, and exposes `aria-pressed` on Fire. No new asset or backend protocol is needed.

## Verification

- Frontend unit tests: 140 passing. Backend tests: 205 passing.
- Both production builds and scoped lint pass.
- All six new browser scenarios pass without retries (55.6 seconds), exercising interrupted capture, keyboard focus loss, Enter release, mixed keyboard/pointer input, automatic full-power firing, one outgoing submission and assistive activation on desktop and phone-sized Chromium.
- Gameplay screenshots inspected at desktop and phone size. Phone controls remain inside the viewport with clear angle, power and Fire controls.
- This is not physical iPhone, VoiceOver or sustained-session certification. No hosting, OpenClaw, Tailscale or production configuration changes were made. Publication is separate from local implementation.

## Next Acceptance

Use the iPhone 17 Pro for actual touch cancellation, Safari background/foreground, a full match and motion/audio comfort. Repeat the new browser cases in WebKit before the next coordinated release. Then prioritize authored character reactions and broader seeded balance testing over additional menu decoration.
