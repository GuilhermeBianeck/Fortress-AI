import manifest from '../../asset-workbench/cartoon-v1/asset-manifest.json';

const urls = import.meta.glob<string>([
    '../../asset-workbench/cartoon-v1/runtime/king.png',
    '../../asset-workbench/cartoon-v1/runtime/cannon_*.png',
    '../../asset-workbench/cartoon-v1/runtime/wood_surface.png',
], {
    eager: true, query: '?url', import: 'default',
});

type CartoonName = 'king' | 'cannon_base' | 'cannon_barrel' | 'wood_surface';
const active = manifest.assets.filter(asset => ['king', 'cannon_base', 'cannon_barrel', 'wood_surface'].includes(asset.name));
const images = new Map<string, HTMLImageElement>();
let loading: Promise<void> | undefined;

export const cartoon = {
    url(name: CartoonName): string { return urls[`../../asset-workbench/cartoon-v1/runtime/${name}.png`]; },
    load(): Promise<void> {
        return loading ??= Promise.all(active.map(asset => new Promise<void>(resolve => {
            const url = urls[`../../asset-workbench/cartoon-v1/${asset.path}`];
            if (!url) { resolve(); return; }
            const image = new Image();
            image.onload = () => { images.set(asset.name, image); resolve(); };
            image.onerror = () => { console.warn(`[Cartoon art] Unavailable: ${asset.name}`); resolve(); };
            image.src = url;
        }))).then(() => { console.info(`[Cartoon art] Loaded ${images.size}/${active.length}`); });
    },
    get(name: CartoonName) { return images.get(name); },
    metadata(name: CartoonName) { return manifest.assets.find(asset => asset.name === name)!; },
    get loaded() { return images.size; },
};
