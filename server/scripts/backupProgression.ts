import { DatabaseSync, backup } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

async function main() {
    const [source, destination] = process.argv.slice(2);
    if (!source || !destination) throw new Error('Usage: node dist/scripts/backupProgression.js /absolute/source.sqlite /absolute/new-backup.sqlite');
    const from = resolve(source), to = resolve(destination);
    if (!existsSync(from) || existsSync(to) || from === to) throw new Error('Source must exist and backup destination must be new');
    const mask = process.umask(0o077);
    mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
    const database = new DatabaseSync(from, { readOnly: true });
    try {
        await backup(database, to); chmodSync(to, 0o600);
        const restored = new DatabaseSync(to, { readOnly: true });
        try {
            const check = restored.prepare('PRAGMA quick_check').get() as { quick_check: string };
            if (check.quick_check !== 'ok') throw new Error('Backup verification failed');
        } finally { restored.close(); }
        console.log('Verified progression backup: ' + to);
    } finally { database.close(); process.umask(mask); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Backup failed'); process.exitCode = 1; });
