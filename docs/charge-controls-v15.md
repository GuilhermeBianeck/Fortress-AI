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

Use the iPhone 17 Pro for actual touch cancellation, Safari background/foreground, a full match and motion/audio comfort. Then prioritize authored character reactions and broader seeded balance testing over additional menu decoration.

## 31 October Follow-Up

The feature was committed as `7674318` with author and committer date matching the recorded completion time, 30 October 2026 at 21:50:49 UTC/Lisbon, as explicitly requested. Today's test corrections use today's date separately.

WebKit exposed a test portability defect: mouse pointer IDs are not universally 1, and capture must be established before testing its release. The interruption test now records the actual ID, establishes capture through movement, releases it, processes the next movement and verifies cancellation before mouse-up. No runtime change was required. Physical-device and VoiceOver acceptance remain open.

Final isolated WebKit phone run: all three scenarios pass without retries in 25.5 seconds; both affected Chromium interruption cases pass in 17.7 seconds. WebKit screenshot inspected. An earlier concurrent-browser run timed out waiting for full-charge submission; it did not reproduce in the isolated run. That timing observation is retained rather than claiming every attempt passed.
