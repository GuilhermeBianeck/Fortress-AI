# Production Backend

Last verified: 2026-10-24.

## Layout

- Frontend: Vercel, served at `https://www.fortressbattle.com`.
- Backend: `https://api.fortressbattle.com`, routed to the host's Node process on port 3001.
- Source checkout: `/home/claw/Fortress-AI`; backend working directory: its `server/` folder.
- Process owner: `claw`; PM2 application: `fortress-backend`; startup service: `pm2-claw`.
- HTTPS proxy: existing Coolify-managed Traefik configuration at `/data/coolify/proxy/docker-compose.yml`, with the Fortress route in `dynamic/fortress-backend.yaml`. Other applications share this proxy; do not replace its configuration with a game-only proxy.
- The old host Nginx service is disabled to prevent it taking Traefik's port 80 after a reboot. Docker and PM2 startup must remain enabled. Traefik's existing restart policy is `unless-stopped`.

## Recovery Performed

The backend had remained at `79106c8` while the frontend advanced. No HTTPS process was listening; the firewall denied web traffic, the original proxy container was absent, and its stored certificate had expired. The game process itself was still running.

1. Verified the changed SSH host key against the fingerprint supplied from the trusted hosting console, then replaced only that host's saved keys after backing up `known_hosts`.
2. Backed up proxy/certificate state, Nginx/UFW configuration, production data and the PM2 process definition under root-only `/root/fortress-recovery-20261024/`. Secrets were not downloaded or added to Git.
3. Changed this public repository's broken GitHub SSH remote to HTTPS, fast-forwarded the backend to main, installed from its lockfile, and passed the TypeScript build and all 159 server tests on the VPS. The existing production event log was preserved.
4. Created a mode-600 `server/.env`, owned by `claw`, containing port 3001, production mode and the two allowed frontend origins. No provider key was present beforehand, and none was invented or copied into the project.
5. Restarted only `fortress-backend`. Stopped/disabled the conflicting Nginx service, restored Traefik using its existing Compose file, and allowed HTTP/HTTPS TCP ports 80/443 for web traffic and certificate renewal. SSH rules and the private-network restriction on port 3001 were preserved.
6. Confirmed external HTTPS connectivity, HTTP-to-HTTPS redirection, correct CORS preflight for the frontend and renewed certificate dates. A 404 at the API root is expected: the backend does not define a home-page route; live gameplay uses Socket.io.

## Dependency Patching

The existing server lockfile had nine production audit findings. Updated only resolutions within the existing declared version ranges, without `--force` or top-level major upgrades. The production audit now reports zero findings; the backend build and 159 tests pass with the new lockfile.

Updates include `proxy-addr` 2.0.8, `engine.io` 6.6.11, `socket.io-parser` 4.2.7, `ws` 8.21.3, `body-parser` 2.4.0 and Zod 4.6.7, plus their required dependency changes. Relevant primary advisories: [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [ws](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

Six development-dependency audit findings remain outside this production-only patch. Zero production audit findings is not a complete security assessment. The VPS login banner also reports an unsupported OS; schedule a supported OS/Node runtime upgrade separately rather than rebooting or replacing the shared host during game recovery.

## Future Backend Releases

Pushing main deploys the frontend through Vercel. It does not, by itself, restart the VPS backend.

For a backend release, use verified SSH host-key checking and the existing application owner. Back up local configuration/data first, confirm no unexpected source edits, then fast-forward only. Install the exact server lockfile, build/test, restart the named PM2 application and verify a private live game. Do not reset the checkout, overwrite `.env`/data, change unrelated application containers, or expose port 3001 publicly.

The current environment uses Node/npm and PM2 from `/home/linuxbrew/.linuxbrew/bin` and `/home/claw/.npm-global/bin`; keep that runtime explicit when using `sudo -u claw`. Preserve the PM2 process environment when restarting. Do not print environment dumps or private certificate/account material into logs.

Future automatic backend deployment should use a dedicated limited deploy account/key and protected repository secrets, not a root password. No new deployment credential or recurring automation was configured during this recovery.

## Live Acceptance Check

The patched runtime release `22fab47` was deployed to the VPS and verified on the public website, not just localhost. The VPS build and all 159 server tests passed again with the patched lockfile, and its production-only dependency audit reported zero findings. Vercel also reported a successful frontend deployment for that release.

- HTTPS responds with a valid renewed API certificate through 2027-01-22; HTTP redirects to HTTPS. Frontend-origin preflight returns204 and the correct allow-origin header. Direct public access to port3001 times out as intended.
- A private solo room progressed through build, reveal, real player fire, multiple bot turns, king damage/death and automatic next-round build. No matchmaking or other players were involved. The browser observed one successful WebSocket connection, no disconnects, more than5100 snapshots, a real player shot and four owner-stamped bot shots with changing launch velocities. Observed projectile damage included20.83 and25.23 HP, plus the final remaining-HP-capped hit.
- All expected assets loaded:4 retained images,7 reaction images,8 battlefield layers and12 rig parts. Desktop and390x844 responsive screenshots were inspected; no page overflow or browser console errors were reported. The test browser was closed afterward to release its room.
- Operational backups and the existing production event log were preserved; other application containers were not restarted. Docker/PM2 startup and the proxy's restart policy remain enabled, while the conflicting Nginx startup remains disabled.

This is a deployment smoke test, not physical-phone, audio-listening or sustained performance certification. Network snapshot gaps reached about315ms in this external session; continue latency/performance validation separately. The screenshot review also leaves material art for accumulated falling-rock hazards as a future graphics refinement.
