/**
 * Sprite loader — loads all PNGs from manifest.json and provides instant access.
 * Falls back gracefully to programmatic rendering if sprites fail to load.
 */

interface SpriteManifestEntry {
    name: string;
    width: number;
    height: number;
    path: string;
}

class SpriteLoader {
    private cache: Map<string, HTMLImageElement> = new Map();
    private _ready = false;
    private _loading = false;

    async loadAll(): Promise<void> {
        if (this._ready || this._loading) return;
        this._loading = true;

        try {
            const res = await fetch('/sprites/manifest.json');
            if (!res.ok) { this._loading = false; return; }
            const data = await res.json() as { sprites: SpriteManifestEntry[] };

            const promises = data.sprites.map(({ name, path }) =>
                new Promise<void>((resolve) => {
                    const img = new Image();
                    img.onload = () => { this.cache.set(name, img); resolve(); };
                    img.onerror = () => resolve(); // Skip broken sprites
                    img.src = path;
                })
            );

            await Promise.all(promises);
            this._ready = true;
            console.log(`[Sprites] Loaded ${this.cache.size}/${data.sprites.length} sprites`);
        } catch {
            console.warn('[Sprites] Failed to load manifest — using fallback rendering');
        } finally {
            this._loading = false;
        }
    }

    get(name: string): HTMLImageElement | null {
        return this.cache.get(name) ?? null;
    }

    isReady(): boolean {
        return this._ready;
    }
}

export const sprites = new SpriteLoader();
