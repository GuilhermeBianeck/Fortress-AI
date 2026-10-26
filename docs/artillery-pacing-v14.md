# Artillery Flight And Camera Pacing

26 October 2026. Follow-up to V13 after the user reported that shots still felt too fast and the camera did not follow convincingly. The desired direction is readable cartoon artillery, not a claim of reproducing DDTank's exact physics.

## Requirements And Implementation

- Slow actual authoritative flight, not just a replay on one client. Moving projectiles now pace the battlefield physics clock at0.32 of the previous rate. Building and settled/aiming scenes run normally. Exact Matter half-step sizes, launch velocities, collision energy, wind-step order, bot solving and trajectory preview are preserved. This is cinematic battlefield pacing during flight, not a projectile-only gravity rewrite.
- Keep normal 20Hz authoritative snapshot delivery while the physics clock advances more slowly. Client interpolation still draws only received positions; no speculative ball movement is added.
- Follow displayed coordinates instead of integrating raw Matter velocity into camera position. A held network picture can no longer make the camera drift ahead. Vertical movement happens only when the ball exits the readable band, preserving the ground as a visual anchor whenever possible.
- Match ball trails to the slower display speed. The ball stays distinct instead of looking like a fast streak.
- Keep server turn ownership until flight resolves. Extend the hard flight guard for paced shots and expire projectiles by simulation age, with a bounded wall-clock safety timer. Pause/reconnect freezes both clocks; slow flight cannot allow a second shot or be truncated by the old five-second cutoff.
- Keep current king/block damage rules. No damage reduction is used to obtain slower movement.

## Verification

- Both production builds pass;200 backend and138 frontend tests pass. New tests cover identical fixed-step paths/velocities under slower real time, retained 20Hz delivery, return to normal pace, no premature turn change after five seconds, no camera drift on a held snapshot, and no unnecessary upward pan. The existing decisive-hit/two-shot defeat tests remain green. Scoped lint/whitespace checks pass.
- Phone-sized Chromium and WebKit trials at35 degrees/power40 measured about3.0seconds of presented flight, with no offscreen ball samples or page exceptions. Screenshots from multiple points of each arc are inspected. This is a sample shot duration, not a promise that short ground hits or out-of-bounds misses last three seconds.
- Private two-player phone tests record both directions and visible king damage (55/52HP),354/356 viewer flight samples with none offscreen, Manual reload and persisted result/history. Five WebKit DPR2/3 recovery cases retain touch/cancel, rotation/reload, reduced motion, five-second offline recovery, takeover and all31 loaded battle images. The prescribed game-client screenshot/readout is also inspected.
- Physical iPhone17Pro motion comfort is still user acceptance, not something browser emulation can certify.

## Publication

User explicitly approved publication now with actual commit timestamps, superseding the earlier09:00–18:00 restriction. Matching main/Vercel/VPS publication and live acceptance are recorded below after deployment. Preserve analytics, environment and persistent progression; back up before restart and require no connected game clients.
