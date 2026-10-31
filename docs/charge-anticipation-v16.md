# King Charge Anticipation

31 October 2026.

## Requirements

- Show deliberate, power-scaled upper-body preparation while the local player holds Fire. No whole-body translation, foot sliding, camera shake, flashes or extra bitmap downloads.
- Blend into preparation and back to aim on cancellation. Retain the last intensity during the exit blend rather than snapping joints to neutral.
- Recoil still requires a server-confirmed projectile. Charge animation must not predict damage or imply a shot was accepted.
- Never invent opponent charge state; only local input is available. Both existing royal identities must support the same rig behavior.
- Hit, airborne/landing, threat, accepted-shot recovery and death/result actions retain priority. Charging is valid only during the character's combat turn without its accepted projectile in flight.
- Pause, resync, inspection and control cancellation end the charge through the existing input lifecycle. Reduced motion neutralizes the new joint movement immediately.
- Test power scaling, smooth cancellation, priority, both rigs, grounded anchors, reduced motion and actual browser charge/release/cancel sequences. Preserve existing controls, sound, physics and balance.

## Verification

- 144 frontend unit tests pass. New coverage exercises power scaling, smooth cancellation, authoritative-action priority, both sides at 30/60/120Hz, grounded anchors and reduced motion.
- Frontend production build, scoped lint and whitespace checks pass. Existing main-bundle size warning remains; no new image downloads were added.
- All eight desktop/phone-sized Chromium charge-control scenarios pass without retries. All four WebKit phone scenarios pass without retries in33.2seconds. The existing desktop action-sequence regression passes, covering accepted recoil, recovery, both bracing directions and reduced motion.
- The full-power browser assertion now counts outgoing fire submissions rather than polling a transient pending flag. A prior WebKit attempt timed out on that flag; it is not claimed as a clean attempt or a proven runtime defect.
- Inspected desktop, phone and WebKit combat screenshots, plus the prescribed unmodified frame-client screenshot/readout from a real private right-side build. All12 rig images load; both identities retain their own artwork.
- No backend, production, music, damage or network-protocol changes. The opponent's charge is intentionally not predicted; synchronized opponent preparation needs a separately validated input-state protocol.
- Physical iPhone motion comfort and VoiceOver remain human acceptance steps. Local frontend: http://localhost:5173/.
