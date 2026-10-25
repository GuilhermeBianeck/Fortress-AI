# Physical Mobile Acceptance

Status: **Not yet run on physical hardware.** Browser-engine emulation does not sign off sound quality, heat, battery or comfort.

## Test Record

| Field | iPhone | Android |
| --- | --- | --- |
| Hardware | iPhone 17 Pro, supplied by user | Mid-range Android phone, not supplied |
| OS / browser version | Record exact iOS and Safari version | Record exact Android and Chrome version |
| Date / tester | Pending | Pending |
| Connection | Record Wi-Fi/carrier, signal and network changes | Record Wi-Fi/carrier, signal and network changes |
| Build / URL | Record the tested release; local link below is V12 work-in-progress until final verification | Same release |
| Settings | Normal Solo; Follow shots; system motion; speaker then headphones | Same settings |
| Start/end battery, charging, initial warmth | Pending | Pending |

Local test link while this computer and phone share trusted Wi-Fi: `http://192.168.1.52:5174/`. The computer must stay awake with both local services running. This private address can change. Do not expose the development ports publicly; use the HTTPS production URL only after a coordinated browser/server release. The production website does not acquire these unshipped changes merely by opening it.

## Twenty-Minute Safari Session

1. **Minutes 0-2:** Open the link in a fresh Safari tab. Record OS/browser and battery. Confirm name field, Solo/PvP, difficulty, Battle and sound button fit. Tap to unlock music; listen for balanced volume, clipping, abrupt starts and any repeated welcome speech. Try mute/unmute. Enter a name with the keyboard visible and hide it again; the Battle button must remain reachable without a trapped page.
2. **Minutes 2-5:** Start Normal Solo. Place blocks with one finger. Pan with two fingers, lift one finger first, then cancel a gesture by switching apps. None of these actions should shoot accidentally. Rotate portrait/landscape during a drag and while a ball is flying. Check terrain/king sharpness, HUD labels, aiming sliders, explicit Fire and minimap positions. Expand/collapse Safari's address bar.
3. **Minutes 5-8:** Fire several turns with Follow shots. Check for flicker, long uncomfortable sweeps, abrupt camera reversals and stale explosions. Compare Turn focus and Manual in settings. Use Reduced motion and verify the camera is comfortable. Complete a round; confirm the next round begins with the correct score and separate kings.
4. **Minutes 8-11:** Switch away, lock/unlock and return. Music must stop while hidden, then resume only when unmuted; no backlog of shots or repeated welcome voice. Reload mid-build and mid-shot. You must keep the same king/battle and cannot shoot twice in one turn. Try speaker and headphones, including the device volume buttons. Note audio delay and your comfort rating.
5. **Minutes 11-14:** In a disposable test battle, interrupt connectivity for approximately 5, then 15 seconds. The server's grace starts once it detects the lost connection, so record both actual outage time and the shown reconnect time. The game should freeze and resume without a fresh turn. Switch between Wi-Fi and mobile data where the test URL is reachable. A local-only Wi-Fi link cannot test cellular recovery; use the coordinated HTTPS release for that part.
6. **Minutes 14-16:** In another disposable battle, stay disconnected beyond the *displayed* 20-second server grace, then return. Expect a truthful unavailable/expired session, not a fake restored world. Repeat in PvP with a second browser: pause while one player is absent; reopen the same player in another tab and verify the old tab stops controlling it. The 60-second cumulative budget should prevent repeated outages from holding a match forever.
7. **Minutes 16-19:** Complete a best-of-three and rematch. Inspect result scrolling, sound control and safe exit. Open Your campaign, claim check-in/rewards, view history, then reload. Saved totals/claims must remain, with no second payment. Check ordinary and 20-character player names.
8. **Minute 19-20:** Record battery, warmth, perceived frame rate, sound/comfort ratings and any accidental touches. Note whether performance worsened after 10-15 minutes. Capture a screenshot or short recording of every failure, its phase, orientation and exact steps. Do not include an API key or player credential in the recording.

Use the same sequence on Android Chrome. Do not shorten it to a menu-only check. A first-player advantage or difficulty judgment needs several human matches, not just one 20-minute session.

## Sign-Off

| Criterion | iPhone 17 Pro | Android |
| --- | --- | --- |
| Layout, keyboard, browser bars and safe areas | Not run | Not run |
| Single/multi-touch, cancellation and rotation | Not run | Not run |
| No camera discomfort (human rating 1-5) | Not rated | Not rated |
| Speaker/headphone mix, transitions and latency (1-5) | Not rated | Not rated |
| Lock/unlock, hidden audio and interruptions | Not run | Not run |
| Reachable-network 5/15/25-second outage, reload and takeover | Not run | Not run |
| Best-of-three, rematch and persistent campaign | Not run | Not run |
| Battery, heat and sustained smoothness | Not observed | Not observed |

Release gate: no lost/duplicated turns, claims or ownership; no obscured primary controls or accidental fire; no repeated welcome speech; no sustained severe stutter or uncomfortable camera motion. Investigate any sustained observed frame rate below 30. Browser benchmark averages are not a promise about this physical device.
