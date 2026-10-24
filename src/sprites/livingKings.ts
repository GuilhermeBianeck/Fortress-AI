import manifest from '../../asset-workbench/living-kings-v6/manifest.json';
import type { Side } from '../types';
import { registerLivingKingImage, type LivingKingPart } from '../game/livingKing';

const urls = import.meta.glob<string>('../../asset-workbench/living-kings-v6/runtime/*.png', { eager: true, query: '?url', import: 'default' });
const images = new Map<string, HTMLImageElement>();
let loading: Promise<void> | undefined;
const key = (side: Side, part: LivingKingPart) => `${side === 'left' ? 'ember' : 'ivory'}_${part}`;

export const livingKings = {
    count: manifest.assets.length,
    url(side: Side, part: LivingKingPart): string { return urls[`../../asset-workbench/living-kings-v6/runtime/${key(side, part)}.png`]; },
    metadata(side: Side, part: LivingKingPart) { return manifest.assets.find(asset => asset.name === key(side, part))!; },
    get(side: Side, part: LivingKingPart) { return images.get(key(side, part)); },
    get loaded() { return images.size; },
    load(): Promise<void> {
        return loading ??= Promise.all(manifest.assets.map(asset => new Promise<void>(resolve => {
            const image = new Image();
            image.onload = () => {
                images.set(asset.name, image);
                registerLivingKingImage(asset.side as Side, asset.part as LivingKingPart, image);
                resolve();
            };
            image.onerror = () => { console.warn(`[Living kings] Unavailable: ${asset.name}`); resolve(); };
            image.src = this.url(asset.side as Side, asset.part as LivingKingPart);
        }))).then(() => { console.info(`[Living kings] Loaded ${images.size}/${manifest.assets.length}`); });
    },
};
