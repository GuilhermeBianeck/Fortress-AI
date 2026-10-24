import manifest from '../../asset-workbench/battle-v5/manifest.json';

export type BattleArtName = 'sky' | 'valley' | 'cloud' | 'earth' | 'grass' | 'stone' | 'hud' | 'fire';
const urls = import.meta.glob<string>('../../asset-workbench/battle-v5/runtime/*.webp', { eager: true, query: '?url', import: 'default' });
const images = new Map<BattleArtName, HTMLImageElement>();
let loading: Promise<void> | undefined;

export const battleArt = {
    url(name: BattleArtName): string { return urls[`../../asset-workbench/battle-v5/runtime/${name}.webp`]; },
    metadata(name: BattleArtName) { return manifest.assets.find(asset => asset.name === name)!; },
    get(name: BattleArtName) { return images.get(name); },
    load(): Promise<void> {
        return loading ??= Promise.all(manifest.assets.map(asset => new Promise<void>(resolve => {
            const image = new Image();
            image.onload = () => { images.set(asset.name as BattleArtName, image); resolve(); };
            image.onerror = () => { console.warn(`[Battle art] Unavailable: ${asset.name}`); resolve(); };
            image.src = battleArt.url(asset.name as BattleArtName);
        }))).then(() => { console.info(`[Battle art] Loaded ${images.size}/${manifest.assets.length}`); });
    },
    get loaded() { return images.size; },
};
