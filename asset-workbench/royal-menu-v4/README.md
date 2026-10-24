# Reference-Driven Royal Menu

The user supplied `reference/interface.png` and `reference/animation.mp4` and requested a close, functional recreation. The still controls geometry; the eight-second animation informs ambient motion and supplies the soundtrack. Its changing text and distorted controls are not reproduced.

## Artwork

Eight separate assets were generated through the built-in `image_gen.imagegen` tool, without an API key. The tool does not expose an independently selectable/verified model version. Exact final prompts are saved in `generation-record.json`. Untouched PNG masters remain in `masters/`; the actual web-ready deliverables are:

| Asset | Saved Runtime File | Purpose |
| --- | --- | --- |
| Sunny courtyard | `runtime/courtyard.webp` | Continuous environment, castle valley and grounded foreground |
| Stone/parchment board | `runtime/panel.webp` | Blank framed surface behind live controls |
| Crowned wordmark | `runtime/logo.webp` | Reference-matched visual identity; semantic HTML title retained |
| Emerald button | `runtime/button_emerald.webp` | Primary action artwork, without baked-in text |
| Sapphire button | `runtime/button_sapphire.webp` | Selected mode, Join and secondary actions |
| Ivory field | `runtime/field.webp` | Name/code fields and neutral controls |
| Torch | `runtime/torch.webp` | Independently animated flame over a stationary bowl |
| Red banner | `runtime/banner_red.webp` | Separate gently swaying corner decoration |

The two existing approved kings and pivot-registered cannons are reused rather than flattened into the background. Ember always represents physical left; Ivory always represents physical right.

`manifest.json` records source dimensions, alpha, trim, visible bounds, pivots, runtime size and bytes. `qa/contact.png` and `qa/normalized/` contain visual checks. The eight WebPs total 729,034 bytes; source masters and reference video are not browser downloads.

## Rebuilding

```sh
npm run prepare:royal-menu
npm run prepare:menu-audio
npm run build
```

Preparation uses the repository's `canvas` package plus installed `cwebp`, `ffmpeg` and `ffprobe`. Normal application builds only consume the prepared files and do not require those external tools. The importer trims by actual alpha, preserves aspect, adds clear padding, decodes the final WebPs and rejects missing alpha or clipped edges. Visible artwork bounds, not invisible PNG padding, drive layout.

## Composition And Motion

Desktop artwork and controls share a 1600x1000 uniformly scaled stage. Portrait and short landscape reflow the controls instead of shrinking desktop text indefinitely. The background fills the viewport; kings/cannons remain at its lower edge. Help and campaign details expand below the scene, not over its controls.

Banner sway, flame flicker and a restrained Battle glint are independent of the HTML controls. Torch clipping separates animated flames from fixed bowls. Reduced-motion preferences freeze all menu effects. No animation changes authoritative gameplay timing.

## Audio

`public/audio/royal-menu-loop.wav` is derived from the supplied video's stereo soundtrack. The 8-second source becomes a 7.25-second PCM16/48kHz loop with a 750ms smoothstep/equal-power tail-to-head crossfade and -3dB preparation attenuation. Runtime gain is 0.6. No playback-speed change or encoded loop padding is introduced.

The track starts only after a trusted interaction, follows the existing global mute preference, fades out for gameplay and stops when the page is hidden. Decoded audio is reused; repeated gestures do not stack tracks. No key or paid API access is needed to play it.

`audio-qa.json` records reproducible numerical preparation checks, not listening approval. See `verification.md` for the separate browser results and remaining limitations.
