# Playtest Corrections V6

Date: 2026-10-24. Local changes only; not committed, pushed or deployed.

## Six Corrections

1. **Audio:** retain the first six seconds as a once-per-page welcome. Native audio loop bounds exclude that intro permanently. After mute, visibility loss or gameplay, resume only the instrumental buffer. Muted gestures do not consume the welcome. The source video's clean 6-8s tail becomes a 1.6-second crossfaded music period. Speech verification, hashes and seam measurements are in `../royal-menu-v4/audio-speech-verification.json` and `audio-qa.json`. Automated recognition found no lexical words in the tail or repeated loop. This is not human listening approval; a longer instrumental master is still desirable for musical variety.
2. **Readability:** pregrade sky, clouds and distant valley once into cached canvases. Reduce saturation/contrast, add atmospheric haze and a 1.6px source-space blur. Terrain, blocks, characters, projectiles and HUD stay sharp and full color. No per-frame full-scene blur.
3. **Flight:** buffer immutable server snapshots for 100ms and interpolate by their timestamps each animation frame. Camera and minimap use the same presented positions. Creation/removal and impact effects follow the presentation timeline. A single tapered trail replaces repeated ghost balls. Long packet gaps hold authoritative state rather than predicting through walls. Server pacing preserves its 20Hz deadline instead of resetting to arrival time on 16ms ticks.
4. **Damage:** normalize pre-resolution incoming velocity and use collision-normal closing speed. A typical direct king hit now deals 25-45 HP, capped at 45; actual remaining HP bounds scoring. Block impact multiplier is 3 with a 90 HP cap; wood/stone break sooner while steel retains durability. Low-speed/glancing contacts do not become full hits. One ball cannot repeatedly damage the same target through duplicate contacts.
5. **Kings:** generated two genuine part sheets, imported twelve unique transparent pieces, and integrated both rigs into actual gameplay. Boots remain stationary; chest breathes, heads tilt/look/blink, an arm gestures and reacts to shots, and capes sway independently. Existing hit/victory/defeat art remains. Reduced motion freezes every idle articulation. Missing parts retain the existing complete-character fallback.
6. **Bot:** solve from the real cannon, current king position, gravity, wind and cloned live obstacles using Matter.js. Begin with bounded training error, then correct aim from each real tracked shot. Ignore unknown/duplicate observations, retarget moved kings/changed wind, and cancel stale turn timers. Learning resets each round; it is not persistent account-level machine learning. The search has a soft 75ms budget, not a guaranteed worst-case server scheduling bound.

## Verification

- Frontend focused suite: 85 passing tests, covering audio lifecycle/PCM, rig registration/reduced motion, immutable interpolation and existing controls/effects.
- Backend suite: 153 tests including real Matter collisions, both mirrored bot solvers, multi-shot improvement with moving targets/wind, live-session feedback wiring, timer cancellation and snapshot pacing.
- Both production builds pass. Targeted changed-file lint and whitespace checks pass.
- All 22 distinct production Chromium desktop/mobile scenarios pass without retries across batches. They cover menu layout, actual audio loop bounds over repeated playback, mute/route transitions, viewport rotation, placement/inspection/fire, material effects, both reaction/result paths and two-player chat/right-cannon use.
- Additional V6 browser scenario verifies twelve parts load, both kings' open/closed heads and independent pieces are actually drawn, reduced motion freezes poses, and more than 85% of sampled animation frames advance a live projectile between packets. Shot sample evidence is attached to the browser test report.
- Prescribed frame-by-frame web-game client entered a real private room on the right side; inspected `output/playtest-v6/skill-client/shot-0.png` and `state-0.json`. Readout: 4/4 retained art, 7/7 reaction images, 8/8 V5 art and 12/12 rig parts; no client error artifact.
- Reviewed desktop and mobile gameplay screenshots, both king assemblies and the stable foot registration. Review images are under `output/playtest-v6/` and `qa/assembly.png`.

Physical-phone/Safari, long-session thermal performance, dense-room bot-search contention and subjective musical listening remain unverified. Local Chromium emulation is not device certification.

## Next Animation Work

The current release has an articulated idle rig, shot anticipation and registered reaction poses. It is not a full walk cycle or facial animation system.

1. **Action clips:** author ready, aim, recoil/brace, hit/recover, taunt, win and loss clips on the same anchors. Drive transitions from accepted shots, actual impacts and round outcomes. Add 120-200ms blends without translating boots or altering physics bodies. Reuse current parts where anatomy permits; generate a new hand/arm or expression only when the silhouette genuinely changes.
2. **Connected reactions:** opponents glance at the incoming ball and brace before nearby impact; damage produces one short flinch and recovery rather than continuous bouncing. Give Ember and Ivory different gesture timing while preserving equal gameplay dimensions.
3. **Environment and sound:** animate independent flag/cape joints using wind, retain slow cloud drift, and add short material-specific impact/collapse sound variations. Replace the short extracted music bed with a 30-60 second instrumental master without speech; retain the once-only welcome logic.
4. **Acceptance:** inspect every clip at 48/72/112px, check shoulder/neck/foot registration across transitions, test 30/60/120Hz elapsed-time playback and reduced motion, then profile a dense battle on physical iPhone and midrange Android before increasing particles or rig complexity.

Do not generate a stack of unrelated whole-body images and call it animation. Consistent joints, authored timing and transitions create the living-character effect; generated images supply the cleaned parts and key poses.
