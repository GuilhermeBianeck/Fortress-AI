# Full-Length Theme Score

User supplied both Fortress AI Main Theme MP3s on 2026-10-24. The originals in Downloads are unchanged. Runtime MP3s retain identical decoded audio, with embedded cover images and unnecessary tags removed. See audio-qa.json for source/output hashes, decoded-PCM equality, duration, LUFS, true peak and silent regions.

Reproduce from the repository root:

```sh
npm run prepare:theme-audio -- '/path/to/Fortress AI Main Theme.mp3' '/path/to/Fortress AI Main Theme (Take 2).mp3'
```

Requires local ffmpeg and ffprobe. No paid API or re-encoding is used. The two runtime downloads total 5,686,362 bytes; each is approximately three minutes of stereo 48kHz audio. The second is loaded only near the first track's ending.

## Playback Design

- Completely replaces the active video-derived audio, including its spoken greeting. Archived WAVs/importer tests remain but the app never requests them.
- Two streamed media decks share the effects AudioContext. No full-song WebAudio PCM allocation; native media seeking, buffering and decoding are retained.
- Four-second equal-power crossfades alternate both tracks. Measured near-silent export tails (after174.84s/176.51s) are excluded from the transition window, not destructively edited out of the assets.
- Per-track linear gain matching targets -18 LUFS before the scene mix. Menu multiplier0.42 (~-25.5 LUFS); gameplay multiplier0.24 (~-30.4 LUFS). These are estimated integrated levels, not device SPL or promises about every short passage. Dynamics are preserved rather than compressed.
- Cannon, impact, explosion and Battle-button cues briefly duck music to38%, recovering in0.85s. UI hover/click cues do not pump the score.
- Music continues without restarting through ready/build/combat/result/rematch. Existing persistent speaker controls mute music and effects together. Hidden pages pause; returning resumes position. Suspended effects are stopped, not replayed later.
- Trusted gestures unlock playback; blocked playback retries only on another gesture. An unavailable second track falls back to the healthy one. All-failed playback stops quietly without repeated requests or interrupting the game.

## Quality Boundaries

The source peaks are below0dBFS and runtime gain only attenuates. PCM hashes verify no quality loss from repackaging. Actual browser analyser measurements verify nonzero decoded music, not subjective artistic listening approval. Desktop/mobile Chromium automation is not certification of physical iPhone/Safari, Bluetooth latency, phone speaker balance or interruption by incoming calls. Those remain device-listening checks.

## Verification

- Production build, scoped ESLint and whitespace checks pass. Existing approximately503kB bundle-size warning remains unrelated to audio asset streaming.
- 106 focused game/audio tests pass, including11 new score/effect lifecycle regressions.
- All24 production-preview desktop/mobile Chromium scenarios pass without retries in4.6minutes. Music coverage includes20seconds natural playback per viewport, both real media-decoder transition boundaries, nonzero analyser signal, menu-to-match continuity, lower gameplay gain, real cannon duck/recovery, mute/unmute position preservation, persistent mute after reload, exactly two media decks and no requests for the old voice/loop.
- Prescribed game-client screenshots/readout inspected after entering a real build; all retained/reaction/battle/rig art groups loaded4/7/8/12. Full browser suite also exercised actual combat, bot, king actions, reduced motion, chat and responsive controls. Final battle screenshots are local QA outputs, not additional runtime assets.
- No backend changes or live game-server restart are required for this frontend-only release.
