# Cartoon V3: Rival King, Refined Menu And Combat Effects

## Player Identity

Two distinct royals are assigned to physical battlefield sides, not independently to each client's local player:

| Side | Character | Visual identity |
| --- | --- | --- |
| Left | Ember | Brown hair/beard, red cape, rounded gold crown, blue tunic |
| Right | Ivory | Silver hair/pointed beard, ivory fur-collared cape, taller teal-gem crown, teal/silver tunic |

Both clients use the same mapping in menu scenery, ready portraits, canvas poses, health/minimap colors and result portraits. This is a two-character roster for the current 1v1 game, not a persistent character-selection or cosmetic-unlock system.

## Generated Assets

The built-in image generator created four independent RGBA masters without an API key. The interface does not expose a selectable model version, so no independently verified Images 2.0 model claim is made.

- `masters/C11-rival-idle.png`
- `masters/C12-rival-hit.png`
- `masters/C13-rival-victory.png`
- `masters/C14-rival-defeat.png`

Exact prompts and reference roles are in [generation-record.json](generation-record.json). The original Ember king is a style reference for the new identity; the rival idle master is the registration reference for its three reaction edits.

Run `npm run prepare:rival` to regenerate the four 256x320 runtime PNGs, manifest and `qa/registration.png`. Runtime assets are in `runtime/`, approximately 284KB total. Source masters remain untouched.

All poses use one full-canvas transform and one foot pivot (156.5, 299.5). Hit/victory need a small uniform 1.7% registration correction; idle/defeat need none. All final boot bounds match, and there is at least 8px of clear padding. Import fails for missing alpha, clipped art, incompatible dimensions or excessive registration drift. Automated tests also inspect the real runtime PNGs.

## Menu

The opening screen now uses centered HTML typography, restrained controls and a separate bottom scene. Neither character nor castle overlaps the form. No-progression layouts fill the remaining viewport; returning-player campaign content retains its natural full-width band. Inputs, labels, modes, private-room actions, matchmaking, help and reward behavior remain real accessible controls.

## Effects

Particles are pooled and capped at 300, with separate per-kind budgets:

- Wood: rotating splinters.
- Stone: faceted chips.
- Ice: translucent-looking triangular shards.
- Rubber: elastic flecks.
- Steel: short streak sparks.
- Muzzle: forward sparks and low-opacity light smoke at the painted barrel aperture.

The flash follows the barrel's angle and mirror transform. Effects begin on an observed server projectile, not on a speculative button click. Damage/breakage still comes from authoritative events. The server launch origin, collision bodies and damage rules are unchanged by this visual attachment work.

Particles use elapsed milliseconds and analytic motion; they expire after a tab stall rather than resuming an old burst. Round changes and reduced-motion activation clear the pool. Reduced motion suppresses new particles, flash and recoil while retaining readable pose/HP feedback.

## Validation And Remaining Work

See [verification.md](verification.md). Physical-phone performance, audio listening, complete frame-by-frame character cycles, shot-acceptance/rejection events and authoritative projectile-origin/art contracts remain later gates. A browser-emulated phone pass is not physical-device certification or proof of superiority to a commercial game.
