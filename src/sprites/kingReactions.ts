import manifest from '../../asset-workbench/cartoon-v2/manifest.json';
import rival from '../../asset-workbench/cartoon-v3/manifest.json';
import { cartoon } from './cartoon';
import type { KingPose } from '../game/kingAnimation';
import type { Side } from '../types';

const urls = import.meta.glob<string>('../../asset-workbench/cartoon-v2/runtime/*.png', { eager: true, query: '?url', import: 'default' });
const rivalUrls = import.meta.glob<string>('../../asset-workbench/cartoon-v3/runtime/*.png', { eager: true, query: '?url', import: 'default' });
const images = new Map<string, HTMLImageElement>();
let loading: Promise<void> | undefined;
const roster = { left: 'ember', right: 'ivory' } as const;

export const kingReactions = {
    identity(side: Side) { return roster[side]; },
    metadata(side: Side = 'left') { return side === 'right' ? rival.assets[0] : cartoon.metadata('king'); },
    url(pose: KingPose, side: Side = 'left'): string {
        if (side === 'right') return rivalUrls[`../../asset-workbench/cartoon-v3/runtime/rival_${pose}.png`];
        return pose === 'idle' ? cartoon.url('king') : urls[`../../asset-workbench/cartoon-v2/runtime/king_${pose}.png`];
    },
    load(): Promise<void> {
        const assets = [
            ...manifest.assets.map(asset => ({ key: `left:${asset.name}`, url: urls[`../../asset-workbench/cartoon-v2/${asset.path}`] })),
            ...rival.assets.map(asset => ({ key: `right:${asset.name}`, url: rivalUrls[`../../asset-workbench/cartoon-v3/${asset.path}`] })),
        ];
        return loading ??= Promise.all(assets.map(asset => new Promise<void>(resolve => {
            const image = new Image();
            image.onload = () => { images.set(asset.key, image); resolve(); };
            image.onerror = () => { console.warn(`[King reactions] Unavailable: ${asset.key}`); resolve(); };
            image.src = asset.url;
        }))).then(() => { console.info(`[King reactions] Loaded ${images.size}/${assets.length}`); });
    },
    get(pose: KingPose, side: Side = 'left') {
        return images.get(`${side}:${pose}`) ?? (side === 'right' ? images.get('right:idle') : undefined) ?? cartoon.get('king');
    },
    get loaded() { return images.size; },
};
