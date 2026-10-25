import { useEffect, useState } from 'react';
import { WifiOff, LogOut } from 'lucide-react';
import type { PauseState, Side } from '../types';

export function MatchPauseNotice({ pause, side, leave }: { pause: PauseState; side: Side; leave: () => void }) {
    const [now, setNow] = useState(Date.now);
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
    const deadline = Math.min(...pause.missing.map(p => p.deadline));
    const own = pause.missing.some(p => p.side === side);
    return <div className="match-pause-notice">
        <WifiOff size={18} aria-hidden="true" />
        <div><strong role="status">Battle paused. {own ? 'Restoring your connection.' : 'Waiting for your opponent.'}</strong>
            <span aria-live="off">Reconnect time: {Math.max(0, Math.ceil((deadline - now) / 1000))}s</span></div>
        <button type="button" onClick={() => { if (window.confirm('Leave this battle? Leaving during play forfeits the match.')) leave(); }}><LogOut size={16} aria-hidden="true" /> Leave</button>
    </div>;
}
