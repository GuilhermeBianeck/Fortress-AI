# Progression Operations

## Runtime And Boundaries

Use the tested Node.js 22.22.2 runtime or a compatible newer runtime with `node:sqlite` and its backup API. Node 22 reports an experimental SQLite warning. The frontend and game server must be released together for the V12 identity/resume protocol. Never restart the live game process during active matches: completed results persist, active physics worlds do not.

This is a single authoritative process with a local SQLite database. Do not put it on an ephemeral deploy filesystem, network share or several independent replicas. A multi-host deployment needs a separate storage/room-coordination design.

Set `FORTRESS_DB_PATH` to a persistent absolute path, for example `/var/lib/fortress-ai/progression.sqlite`. The default is `data/progression.sqlite` relative to the server's working directory. That default is convenient for local development, not a guarantee about a production host's working directory. Keep `server/data/events.jsonl` separately; this release does not migrate or delete analytics.

The store creates parent directories with mode 0700 and its database with mode 0600, enables WAL, FULL synchronous commits, foreign keys and a 5-second busy timeout. SQLite's journal companions inherit database permissions. Run under the service's dedicated OS user; do not grant web users file access. The data directory is ignored by Git. Schema version 2 adds complete match metadata, including bot scores, to the initial identity/results/rewards schema. Migration is idempotent; future versions or bad integrity checks stop startup instead of wiping data.

## Before A Release

1. Verify frontend build, server build, unit tests and socket regression on the intended Node runtime.
2. Inspect active matches in the service, stop accepting new joins, and wait for existing players to finish. Do not infer zero matches from an empty browser tab.
3. Make and verify a fresh backup with the service account. Keep backups outside the checkout and database directory, on independent durable storage. No tokens should be printed or pasted into logs.
4. Confirm the service environment points to the persistent path, then update the matching browser/server build and restart once.
5. Reopen an existing test identity, check saved totals/history/check-in, then test a fresh solo game and a short reconnect. Keep the rollback build and verified backup until acceptance.

## Consistent Backup

After the server build, run from `server/`:

```bash
node dist/scripts/backupProgression.js /var/lib/fortress-ai/progression.sqlite /secure-backups/fortress-new-backup.sqlite
```

The destination must not exist. This uses SQLite's online backup API, so committed WAL data is included consistently. The tool restricts permissions and runs `quick_check` on the result. A live main-file-only copy is not a safe backup. Alternatively, stop the service cleanly and preserve the database and any WAL/SHM companions together before copying.

Rehearse restoration locally: open the backup in a separate server process/data directory, verify profile/history/rewards using the same anonymous credential, and confirm that it does not attempt to restore an old Matter world. Backups contain credential hashes and player history; protect and rotate them like production data.

## Restore And Save Failure

Stop all writers before restore. Preserve the current database plus its WAL/SHM files in a dated recovery directory; never delete a live WAL. Restore the verified snapshot to a clean destination with no stale journal companions, ownership matching the service user and mode 0600. Point `FORTRESS_DB_PATH` at that destination, start one server process, and repeat the identity/profile/history check before opening the service to players. Restoring an older snapshot necessarily loses later results and claims; communicate that loss.

An award is one transaction for both humans. A failed commit publishes a pending notice, keeps an idempotent retry in memory, and blocks new progression-producing starts. The retry is independent of ended physics and runs every 5 seconds. Do not call a pending result saved. If the process or disk is lost before any successful commit, the pending in-memory award can be lost; investigate storage capacity, permissions and I/O errors before restarting. A duplicate committed match ID cannot award twice, and conflicting facts for an existing ID are rejected.

## Anonymous Identity And Legacy Scores

Only a server-issued ID plus its 256-bit bearer token restores a profile or live slot. The server stores the hash, not the token. Names, invite codes and the old browser UUID cannot claim ownership. Clearing browser storage loses anonymous identity access; no account recovery or cross-device login is provided by this release. Private/incognito or disabled storage may only retain identity in the current document.

Previous releases kept profiles in server memory. Scores already lost in historical restarts cannot be reconstructed safely from unsigned browser caches. V12 deliberately does not import those values. Disclose this one-time legacy limitation; newly committed V12 results are durable.
