# Mobile Layout And Shot Readability

## Requirements

1. Preserve the approved illustrated royal menu while uncramping the phone controls. Separate difficulty from the Solo/PvP segments, provide at least 44px input/select targets, keep Battle in the first viewport on ordinary phones, and allow vertical scrolling on short screens instead of shrinking controls or hiding text. Verify 320x568, 390x844, 402x874, tablet and short landscape, including keyboard/recovery notices.
2. Put each cannon about 160 world pixels in front of its king, on the attacking side rather than firing through its own royal. Server terrain/sync data owns the origins. Renderer, aiming path, bot solver and actual projectile must use those same coordinates. Keep them stable during a round and refresh on every new terrain/round/resume. Retain legacy origin fallback only for older packets/test fixtures.
3. Track the *presented* authoritative ball through fast flight in either direction. A new shot releases temporary inspection; Manual preference remains manual. Do not drop tracking merely because a ball reverses or slows. Keep the ball inside a safe viewport band without adding physics prediction or high-speed map sweeps between unrelated turns.
4. Show both fortresses during the five-second reveal, with a completed opponent view before combat starts. Use short crossfades for distant switches instead of a slow pan that cannot finish on a narrow screen. Reduced motion uses static switches. Pause/resume and resize must not restart a stale reveal timer.
5. Retain the impact location for a readable hold even when the server immediately starts the next turn or destroys the final round scene. Associate impact camera requests with projectile IDs; unrelated hazards must not steal the camera. Surface a concise, honest shot result (king damage, material hit/break, ground/miss), not an invented hit. Timestamp cues remain aligned with snapshot presentation and are cleared on sync/new rounds.
6. Provide distinct, reachable camera/aim/fire controls. No clipped toolbar, accidental firing on drag release, or inaccessible pan arrows. Keep keyboard aiming, range values, two-finger panning, settings, chat and reduced motion. Inspect/wait/fire states must be obvious without exposing internal diagnostics.
7. Recheck real Solo/PvP shots from both sides, reveal completion, impacts and next-turn handoff, all difficulty levels, reload/reconnect and round transitions. Keep existing damage and progression guarantees. Publish the unshipped V12 work together with these fixes, excluding analytics, credentials and generated QA output. Coordinate matching Vercel/browser and VPS/server publication, preserve environment/data, back up progression and restart only after a no-active-player check.

## Verification Receipt

25 October 2026. Local implementation complete. Publication receipt will be added after the matching browser/server release.

### Changes

- Portrait menu reflows rather than scaling down desktop controls. Difficulty has its own row; native selectors have explicit 44px sizing and a visible chevron, including WebKit. Short screens scroll below the primary action. The approved illustrated assets are retained.
- Phone combat has separate camera, aim and full-width fire rows. Material/shape selectors replace the horizontally crowded build toolbar. Narrow landscape uses direct own/enemy fortress controls and touch panning, with enough room for both range labels/values. Small screens no longer have a minimap hiding the cannon or king; desktop retains it.
- Cannons are placed 160 world pixels in front of the initial king position. Authoritative origins are included with terrain/full resync data and shared by real firing, bot solving, rendering and trajectory prediction. Initial framing is corrected when the first full king snapshot arrives, rather than retaining fallback coordinates.
- Shot presentation tracks interpolated authoritative positions with observed velocity, not speculative ball physics. Horizontal and vertical safe bands keep fast shots visible. A new shot releases temporary inspection; Manual preference stays manual. Slow/reversed flight does not silently lose tracking.
- Reveal visits the enemy after 800ms, using a 360ms distant-view crossfade rather than an unfinished slow map sweep. Reduced motion uses static switches. Server turn changes cannot steal a 1.3-second impact hold.
- ID-stamped shot outcomes distinguish king damage, material contact and ground/miss. Lower-priority or old contacts cannot replace the current king impact. Short landscape retains the in-world feedback without adding a duplicate overlay over the king. A final full snapshot is emitted before physics destruction, and the final result panel waits 950ms to let finishing feedback render.

### Automated Checks

- Both production builds pass. **136 frontend and 198 backend tests pass**. New regressions cover high-speed safe bands at 30/60/120Hz in both directions, stale/removed projectiles, impact ownership across turns, cannon/trajectory origin parity, narrow-screen map policy and the terminal zero-HP snapshot. Scoped lint and whitespace checks pass; the previously recorded whole-repository lint debt remains outside this release.
- Seven real socket/process regressions pass again: forged credential isolation, tab takeover, full-state reconnect, accepted-shot deduplication, failed award rollback/retry, process restart persistence and real 20-second expiry.
- Chromium and WebKit menu matrices cover 320x568, 390x844, 402x874, 768x1024, 568x320, 844x390 and 1280x720. Battle stays above the fold; portrait difficulty is separate and 44px tall; no horizontal overflow. Real Solo reveal, manual enemy inspection followed by fire, full flight/impact through a server turn switch, and combat/control-label geometry are checked in both engines. Browser screenshots are inspected, not just generated.
- Real two-player phone-sized play records both left-to-right and right-to-left shots with no offscreen flight samples in either viewer. Observed king hits were 55 and 52 HP. Right-side Manual reload and result visibility pass. These are private test rooms, not matchmaking or real users.
- Ten DPR2/3 recovery scenarios pass across both engines: touch placement/cancel, mid-shot rotation/reload, ownership/fired-state retention, reduced motion, five-second offline/reconnect and takeover notice. All 31 battle images load; canvas pixel diversity is nonblank. The prescribed game client is also run and its screenshot/readout inspected.

### Revised Cannon Benchmark

The independent Matter benchmark was rerun with the new 760/1640 canonical cannon origins: 12 seeds, both sides, six shots per mode, 432 replays. Early/late mean target distances are Easy 119.29/30.00px, Normal 76.33/15.24px and Hard 32.14/15.87px. Early/late hit fractions are 16.67/70.83%, 25/100% and 64.58/100%, respectively. A hit stops at the king's edge, not its center, so two perfect late hit rates cannot be meaningfully ranked by their subpixel center distances. All modes learn; Hard is more accurate from the start. Damage rules were not changed. These are fixture hit rates, not human win rates.

### Remaining Acceptance

Physical iPhone 17 Pro listening, heat/battery and subjective motion comfort still need the user's device. Browser emulation is not hardware certification. The V12 20-minute soak is historical evidence for that implementation, not a new soak of V13. Legacy scores that were already lost in old in-memory server restarts cannot be reconstructed; new V12 results persist, but active physics worlds do not survive a server restart.
