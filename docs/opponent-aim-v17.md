# Synchronized Opponent Preparation

1 November 2026.

## Requirements

- Relay aim angle, cosmetic charge power and charge/cancel state only for the authenticated active player before firing. Never accept a client-provided side or modify launch physics, damage or turn ownership.
- Server-issued per-turn epoch rejects delayed input from earlier turns/rounds. Rotate and clear on pause, turn/phase transition and disposal; reconnect full sync supplies the current epoch but never replays a held charge.
- Bound accepted updates to10Hz, with at most one immediate cancellation per accepted charge. Use volatile client transport so offline input is not queued. Stop publishing when not aiming, paused, hidden or after firing.
- Both observers use the same validated preview; local input remains immediate. Interpolate opponent barrel angles; respect reduced motion. Expire stale previews after900ms to avoid a frozen charging character.
- Recoil still comes only from server-owned projectiles. No new art/audio, gameplay balance or infrastructure changes.
- Test validation, authority, turn epochs, throttling/cancellation, expiry, reset/reconnect and two real players aiming/charging/firing in both directions, plus existing charge/action regressions.

## Implementation

- `aim_preview` is an optional cosmetic input/event. The session derives side from its authenticated socket map and requires an unfired active turn. It validates finite/ranged values and the current random turn epoch; canonical previews receive a server sequence number.
- Turn preparation, firing, pause, rebinding, phase exit and disposal clear the preview and rotate its epoch. Full reconnect state includes the new epoch; held charge input is never restored.
- The active browser publishes volatile updates every100ms. Each receiver uses local receipt time for expiry, so differing computer clocks cannot prolong stale charges. Exponential barrel smoothing and existing joint blends provide motion; reduced motion uses immediate barrel changes and neutral joints.
- No preview launches a projectile. Bots do not advertise invented preparation; their existing accepted-shot animations remain intact. No new images, sound, balance or paid API usage.
- Screenshot review exposed an existing HUD defect: a leftover moving ball from the previous turn could label a new aiming turn as flight. The banner now requires an accepted current-turn shot with matching projectile ownership, covered by a regression.
- Browser/server runtime timing constants have a parity test across the ESM/CommonJS boundary, without changing either project's module configuration.

## Verification

- 148 frontend tests and208 backend tests pass; both builds pass. Scoped lint and whitespace checks pass. The existing bundle-size warning remains.
- Ten combined desktop/phone charge and two-player scenarios pass without retries. Two-player coverage includes both directions, real cancellation and firing, intentionally dropped preview packets and reloading the observer during a held charge without accidentally firing afterward.
- The initial desktop test fixture incorrectly required historical shot diagnostics to be null on the second turn; corrected to require no shot from the preparing side. This was test bookkeeping, not an invented shot or server regression.
- Final HUD-aware/invite-link desktop and phone runs pass without retries in50.0seconds; the extended WebKit phone run passes in22.6seconds. One earlier desktop run stalled in manual room-join setup before combat; the final test uses a validated six-character invite and the application's authenticated invite-link flow. No claim that every intermediate attempt passed.
- Inspected both royal identities from the opposing viewer, including the corrected aiming banner. The prescribed unmodified frame client joined a real private right-side build:12/12 rig pieces loaded, both kings ready, no stale preview. Its screenshot and text readout were inspected separately from the combat evidence.
- Physical iPhone/VoiceOver and sustained network/load acceptance remain unverified. Publication requires matching frontend and backend; this feature is not automatically deployed by local implementation.

## Production Release: 1 November 2026

- Runtime `dd56fcd` published to main; Vercel reports a successful deployment. Local revalidation passed148 frontend tests,208 backend tests and both production builds.
- VPS fast-forwarded from791f120 to the same runtime, built successfully and passed208/208 backend tests there. Restarted only `fortress-backend` after a fresh zero-connected-client check; saved PM2 state. Production environment was byte-identical to its protected backup. Analytics retained; no dependency, proxy, firewall, OpenClaw or Tailscale change.
- Verified online progression snapshot: `/var/backups/fortress-ai/fortress-v17-20261101.iMGiRq.sqlite`. Protected configuration/PM2/source rollback information: `/root/fortress-v17-20261101.iMGiRq/`. Same-host backups do not replace offsite recovery.
- Public-site private two-player acceptance passed without retries in mobile-sized Chromium (31.0seconds) and WebKit (30.5seconds). Both runs cover both aim/charge directions, cancellation, actual accepted fire, the correct aiming banner, deliberately dropped preview messages and a real reload during held input with no accidental shot. No page exceptions. Inspected live screenshots; test browser contexts closed.
- Physical iPhone, VoiceOver and sustained-load acceptance are still separate. This receipt does not claim those tests.
