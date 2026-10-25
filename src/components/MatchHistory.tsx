import { useState } from 'react';
import { History, LoaderCircle } from 'lucide-react';
import type { MatchHistoryEntry, PlayerProfile } from '../types';

export function MatchHistory({ profile, load }: { profile: PlayerProfile; load: (cursor?: string) => Promise<{ entries: MatchHistoryEntry[]; cursor: string | null }> }) {
    const [entries, setEntries] = useState<MatchHistoryEntry[] | null>(null);
    const [cursor, setCursor] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function more(reset = false) {
        if (busy) return;
        setBusy(true); setError('');
        try {
            const page = await load(reset ? undefined : cursor ?? undefined);
            setEntries(previous => reset ? page.entries : [...previous ?? [], ...page.entries]); setCursor(page.cursor);
        } catch { setError('History could not be loaded. Try again.'); }
        finally { setBusy(false); }
    }
    return <details className="campaign-history" onToggle={event => { if (event.currentTarget.open && !entries) void more(true); }}>
        <summary><History size={16} aria-hidden="true" /> Match history ({profile.matchesPlayed})</summary>
        <ol>{(entries ?? profile.history).map(entry => <li key={entry.matchId}>
            <span><b>{entry.won ? 'Victory' : 'Defeat'}</b> vs {entry.opponentName}</span>
            <span>{entry.score.totalScore} pts · {new Date(entry.timestamp).toLocaleDateString()}{entry.mode === 'single' ? ' · ' + entry.difficulty : ''}</span>
        </li>)}</ol>
        {error && <p role="status">{error}</p>}
        {(cursor || error) && <button type="button" disabled={busy} onClick={() => void more(!entries)}>{busy && <LoaderCircle size={14} aria-hidden="true" />} {error ? 'Retry' : 'Older matches'}</button>}
        {!profile.matchesPlayed && <p>No battles recorded yet.</p>}
    </details>;
}
