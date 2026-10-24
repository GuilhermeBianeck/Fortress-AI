import manifest from '../../asset-workbench/royal-menu-v4/manifest.json';

export type RoyalMenuAsset = 'courtyard' | 'panel' | 'logo' | 'button_emerald' | 'button_sapphire' | 'field' | 'torch' | 'banner_red';
const urls = import.meta.glob<string>('../../asset-workbench/royal-menu-v4/runtime/*.webp', { eager: true, query: '?url', import: 'default' });

export const royalMenu = {
    url(name: RoyalMenuAsset): string { return urls[`../../asset-workbench/royal-menu-v4/runtime/${name}.webp`]; },
    metadata(name: RoyalMenuAsset) { return manifest.assets.find(asset => asset.name === name)!; },
};
