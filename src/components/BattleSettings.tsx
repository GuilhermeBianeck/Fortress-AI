import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { BattlePreferences } from '../game/battlePreferences';
import './BattleSettings.css';

export function BattleSettings({ preferences, onChange, onClose }: {
    preferences: BattlePreferences; onChange: (value: BattlePreferences) => void; onClose: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.current?.showModal();
        const node = dialog.current;
        return () => { node?.close(); previous?.focus(); };
    }, []);
    return <dialog ref={dialog} className="battle-settings" aria-labelledby="battle-settings-title" onCancel={event => { event.preventDefault(); onClose(); }}
        onKeyDown={event => {
            if (event.key !== 'Tab') return;
            const controls = event.currentTarget.querySelectorAll<HTMLElement>('button, select, input');
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
        onClick={event => {
            if (event.target !== event.currentTarget) return;
            const box = event.currentTarget.getBoundingClientRect();
            if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
        }}>
        <header><h2 id="battle-settings-title">Game settings</h2><button type="button" onClick={onClose} aria-label="Close game settings" title="Close"><X size={20} /></button></header>
        <label htmlFor="battle-camera-mode">Camera</label>
        <select id="battle-camera-mode" autoFocus value={preferences.camera} onChange={event => onChange({ ...preferences, camera: event.target.value as BattlePreferences['camera'] })}>
            <option value="follow">Follow shots</option><option value="turn">Turn focus</option><option value="manual">Manual</option>
        </select>
        <label htmlFor="battle-motion-mode">Motion</label>
        <select id="battle-motion-mode" value={preferences.motion} onChange={event => onChange({ ...preferences, motion: event.target.value as BattlePreferences['motion'] })}>
            <option value="system">System</option><option value="reduced">Reduced</option>
        </select>
        <label className="battle-settings-check"><input type="checkbox" checked={preferences.hitLabels} onChange={event => onChange({ ...preferences, hitLabels: event.target.checked })} />Hit labels</label>
    </dialog>;
}
