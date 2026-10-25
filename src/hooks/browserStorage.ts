export function readStorage(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}
export function writeStorage(key: string, value: string | null): boolean {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); return true; }
    catch { return false; }
}
