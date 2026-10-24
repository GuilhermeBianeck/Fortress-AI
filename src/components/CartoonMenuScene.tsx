import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cartoon } from '../sprites/cartoon';
import { kingReactions } from '../sprites/kingReactions';
import { royalMenu } from '../sprites/royalMenu';

const SIDES = ['left', 'right'] as const;
const SURFACES = [['emerald', 'button_emerald'], ['sapphire', 'button_sapphire'], ['field', 'field']] as const;

type RoyalArtName = Parameters<typeof royalMenu.url>[0];

const surface = (name: RoyalArtName) => {
    const { width, height, bounds } = royalMenu.metadata(name);
    return {
        image: `url("${royalMenu.url(name)}")`,
        size: `${width / bounds.width * 100}% ${height / bounds.height * 100}%`,
        position: `${width === bounds.width ? 50 : bounds.x / (width - bounds.width) * 100}% ${height === bounds.height ? 50 : bounds.y / (height - bounds.height) * 100}%`,
    };
};

const RoyalArt = ({ name, className }: { name: RoyalArtName; className: string }) => {
    const { width, height, bounds } = royalMenu.metadata(name);
    // Layout boxes describe visible artwork, not the transparent export padding.
    const style: CSSProperties = {
        left: `${-bounds.x / bounds.width * 100}%`,
        top: `${-bounds.y / bounds.height * 100}%`,
        width: `${width / bounds.width * 100}%`,
        height: `${height / bounds.height * 100}%`,
    };
    return <div className={className} aria-hidden="true"><img src={royalMenu.url(name)} alt="" draggable={false} style={style} /></div>;
};

export const RoyalMenuStage = ({ children, variant = 'home' }: { children: ReactNode; variant?: 'home' | 'room' | 'queue' }) => {
    const viewportRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const measure = () => {
            const { width, height } = viewport.getBoundingClientRect();
            viewport.style.setProperty('--menu-stage-scale', String(Math.min(width / 1600, height / 1000)));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(viewport);
        return () => observer.disconnect();
    }, []);

    const surfaces = Object.fromEntries(SURFACES.flatMap(([key, name]) => {
        const art = surface(name);
        return [
            [`--menu-${key}-art`, art.image],
            [`--menu-${key}-size`, art.size],
            [`--menu-${key}-position`, art.position],
        ];
    })) as CSSProperties;

    return (
        <div className="menu-viewport" ref={viewportRef} style={surfaces}>
            <img className="royal-courtyard" src={royalMenu.url('courtyard')} alt="" aria-hidden="true" draggable={false} fetchPriority="high" />
            <div className={`menu-stage menu-stage--${variant}`}>
                <CartoonMenuScene />
                <div className="menu-brand">
                    <h1 className="menu-sr-only">FORTRESS AI</h1>
                    <RoyalArt name="logo" className="royal-wordmark" />
                </div>
                {children}
            </div>
        </div>
    );
};

export const CartoonMenuScene = () => {
    const base = cartoon.metadata('cannon_base');
    const barrel = cartoon.metadata('cannon_barrel');
    const baseFootPadding = base.outputInfo.height - base.outputInfo.bounds.y - base.outputInfo.bounds.height;
    const barrelWidth = 105 / 78;
    const originX = barrel.pivot.x / barrel.outputInfo.width * 100;
    const originY = barrel.pivot.y / barrel.outputInfo.height * 100;
    const torch = royalMenu.metadata('torch');
    const flameSplit = ((torch.flameSplit ?? 0.56) * torch.height - torch.bounds.y) / torch.bounds.height;
    const torchStyle = { '--torch-split': `${flameSplit * 100}%` } as CSSProperties;

    // Match the battlefield's barrel scale and pivot, keeping both wheels on the turf.
    const barrelStyle: CSSProperties = {
        width: `${barrelWidth * 100}%`,
        left: `${base.pivot.x / base.outputInfo.width * 100}%`,
        top: `${(base.pivot.y + baseFootPadding) / base.outputInfo.height * 100}%`,
        transformOrigin: `${originX}% ${originY}%`,
        transform: `translate(${-originX}%, ${-originY}%) rotate(-28deg)`,
    };

    return (
        <div className="cartoon-menu-scene" aria-hidden="true">
            <RoyalArt name="panel" className="royal-panel" />
            {SIDES.map(side => (
                <div key={`banner-${side}`} className="royal-corner" data-side={side}>
                    <RoyalArt name="banner_red" className="royal-corner-banner" />
                </div>
            ))}
            {SIDES.map(side => (
                <div key={`ornaments-${side}`} className="royal-ornaments" data-side={side} style={torchStyle}>
                    <RoyalArt name="torch" className="royal-torch royal-torch--bowl" />
                    <RoyalArt name="torch" className="royal-torch royal-torch--flame" />
                </div>
            ))}
            {SIDES.map(side => {
                const king = kingReactions.metadata(side);
                return (
                    <div key={side} className="menu-scene-army" data-side={side}>
                        <img className="menu-scene-king" data-side={side} data-king-identity={kingReactions.identity(side)} src={kingReactions.url('idle', side)} alt="" draggable={false}
                            style={{ transform: `translateY(${(1 - king.pivot.y / king.outputInfo.height) * 100}%)` }} />
                        <div className="menu-scene-cannon">
                            <img className="menu-scene-barrel" src={cartoon.url('cannon_barrel')} alt="" draggable={false} style={barrelStyle} />
                            <img className="menu-scene-base" src={cartoon.url('cannon_base')} alt="" draggable={false}
                                style={{ transform: `translateY(${baseFootPadding / base.outputInfo.height * 100}%)` }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
