import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Hand, Crown, Flag, MoveLeft, MoveRight, Flame, ZoomIn, ZoomOut } from 'lucide-react';
import type { GameState, TerrainData, GameMode, Vector, Side, MatchPhase, KingHpState, ShapeType } from '../types';
import { WORLD_WIDTH } from '../types';
import { ParticleSystem } from '../effects/particles';
import { debugStats, debugVisible, toggleDebug } from '../debug/debugStats';
import { track } from '../analytics/tracker';
import { playFire, playImpact, playExplosion } from '../audio/SoundManager';
import { cartoon } from '../sprites/cartoon';
import { kingReactions } from '../sprites/kingReactions';
import { livingKings } from '../sprites/livingKings';
import { livingKingState } from '../game/livingKing';
import { KingActionDirector, type KingActionPose } from '../game/kingActions';
import { battleArt } from '../sprites/battleArt';
import { healthPanel, renderPixelRatio } from '../game/battlePresentation';
import { RenderQuality } from '../game/renderQuality';
import { PRESENTATION_DELAY_MS, renderedPosition, SnapshotInterpolator, type RenderSnapshot } from '../game/snapshotInterpolation';
import { kingPresentation } from '../game/kingAnimation';
import { cannonMuzzle } from '../game/cannonPresentation';
import { drawBattle, type BattleEffect, type BattleHazard } from '../game/BattleRenderer';
import { cannonPosition, predictTrajectory } from '../game/ballistics';
import { chargePower, MAX_POWER } from '../game/chargePower';
import { kingFeedbackPosition, projectileOwner } from '../game/battleFeedback';
import { canPlace, PLACEMENT_DIMENSIONS } from '../game/placement';
import { clampCamera, createViewport, minimapRect, screenToWorld, showBattleMinimap } from '../game/viewport';
import { advanceBattleCamera, trackBattleCamera, resizeBattleCamera, type BattleCameraState } from '../game/battleCamera';
import type { BattlePreferences } from '../game/battlePreferences';
import type { KingDamageEvent, ProjectileImpactEvent, BlockDestroyedEvent } from '../types';
import { ShotCamera, type ShotReceipt } from '../game/shotCamera';
import './GameCanvas.css';

interface GameCanvasProps {
    paused?: boolean;
    syncRevision?: number;
    serverHasFired?: boolean;
    preferences: BattlePreferences;
    gameState: GameState | null;
    terrain: TerrainData | null;
    onSpawn: (x: number, y: number) => void;
    kingsHp: { left: KingHpState; right: KingHpState };
    mySide: Side;
    gameMode: GameMode;
    selectedShape?: ShapeType;
    phase: MatchPhase;
    phaseEndsAt?: number | null;
    turnPlayer: Side | null;
    onFire: (angle: number, power: number) => void;
    setBlockDestroyedCallback: (cb: ((data: BlockDestroyedEvent) => void) | null) => void;
    setProjectileImpactCallback: (cb: ((data: ProjectileImpactEvent) => void) | null) => void;
    setKingDamageCallback: (cb: ((data: KingDamageEvent) => void) | null) => void;
    playerNames?: { left: string; right: string };
    hazards?: BattleHazard[];
    roundScore?: { left: number; right: number };
    currentRound?: number;
    winner?: Side | null;
}

export type HazardData = BattleHazard;
interface Gesture {
    kind: 'aim' | 'place' | 'pan' | 'minimap';
    start: Vector;
    camera: number;
    cancelled: boolean;
}
// The aim preview shows only the opening of the arc: reading wind and power is the skill.
const PREVIEW_FRAMES = 18;
const MIN_ANGLE = 10 * Math.PI / 180;
const MAX_ANGLE = 170 * Math.PI / 180;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function GameCanvasInner(props: GameCanvasProps) {
    const latest = useRef(props);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderQuality = useRef(new RenderQuality());
    const stageRef = useRef<HTMLDivElement>(null);
    const camera = useRef<BattleCameraState>({ x: 0, target: 0, velocity: 0, manualUntil: 0, initialized: false });
    const cameraDissolve = useRef<{ frame: HTMLCanvasElement; at: number } | null>(null);
    const cameraHandoff = useRef<number | null>(null);
    const lastResize = useRef(0);
    const [size, setSize] = useState({ width: 800, height: 560 });
    const [overview, setOverview] = useState(false);
    const view = useRef(createViewport(800, 560));
    const [aim, setAimState] = useState({ angle: Math.PI / 4, power: 60 });
    const aimRef = useRef(aim);
    const [charging, setCharging] = useState(false);
    const chargeStart = useRef<number | null>(null);
    const chargeInput = useRef<number | ' ' | 'Enter' | 'assistive' | null>(null);
    const [lastPower, setLastPower] = useState<number | null>(null);
    const [inspect, setInspect] = useState(false);
    const inspectRef = useRef(false);
    const [shotPending, setShotPending] = useState(false);
    const pendingRef = useRef(false);
    const snapshots = useRef(new SnapshotInterpolator());
    const presented = useRef<RenderSnapshot | undefined>(undefined);
    const presentationEvents = useRef<{ at: number; timestamp?: number; run: () => void }[]>([]);
    const trajectory = useRef<Vector[]>([]);
    const particles = useRef(new ParticleSystem());
    const effects = useRef<BattleEffect[]>([]);
    const shot = useRef<{ id: number; side: Side; at: number; angle: number } | undefined>(undefined);
    const kingDirectors = useRef({ left: new KingActionDirector(), right: new KingActionDirector() });
    const kingActions = useRef<Partial<Record<Side, KingActionPose>>>({});
    const seenProjectiles = useRef(new Set<number>());
    const followedProjectile = useRef<number | null>(null);
    const shotCamera = useRef(new ShotCamera());
    const impactHold = useRef(false);
    const lastReceiptAt = useRef(0);
    const [receipt, setReceipt] = useState<ShotReceipt | null>(null);
    const [shotViewMode, setShotViewMode] = useState<'flight' | 'impact' | null>(null);
    const shotViewModeRef = useRef<'flight' | 'impact' | null>(null);
    const lastSound = useRef(0);
    const pointers = useRef(new Map<number, Vector>());
    const gesture = useRef<Gesture | null>(null);
    const ghost = useRef<Vector | undefined>(undefined);
    const reducedMotion = useRef(false);
    const keys = useRef(new Set<string>());

    useEffect(() => { void cartoon.load(); void kingReactions.load(); void battleArt.load(); void livingKings.load(); }, []);
    useEffect(() => {
        const media = matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => {
            reducedMotion.current = media.matches || props.preferences.motion === 'reduced';
            if (reducedMotion.current) { particles.current.reset(); cameraDissolve.current = null; }
        };
        update(); media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, [props.preferences.motion]);
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const update = () => {
            const { width, height } = stage.getBoundingClientRect();
            if (width > 0 && height > 0) setSize({ width: Math.round(width), height: Math.round(height) });
        };
        const observer = new ResizeObserver(update);
        observer.observe(stage); update();
        return () => observer.disconnect();
    }, []);

    const updateAim = useCallback((angle: number, power: number) => {
        const next = { angle: clamp(angle, MIN_ANGLE, MAX_ANGLE), power: clamp(power, 5, 100) };
        aimRef.current = next; setAimState(next);
    }, []);
    const focus = useCallback((x: number, manual = false) => {
        if (manual) cameraHandoff.current = null;
        camera.current.manualUntil = manual ? performance.now() + 12000 : 0;
        camera.current.target = clampCamera(x - view.current.worldWidth / 2, view.current);
    }, []);
    const teamCenter = useCallback((side: Side) => {
        const p = latest.current;
        const kingX = p.gameState?.kings[side].x ?? p.kingsHp[side].x ?? (side === 'left' ? 600 : 1800);
        return (kingX + cannonPosition(side, p.terrain?.points ?? [], p.terrain?.cannons).x) / 2;
    }, []);
    const recenter = useCallback(() => focus(teamCenter(latest.current.mySide), true), [focus, teamCenter]);
    const ownKingId = props.gameState?.bodies.find(body => body.label === 'king' && body.side === props.mySide)?.id;
    const hasCannonOrigins = Boolean(props.terrain?.cannons);
    const resetShotPresentation = useCallback(() => {
        shotCamera.current.reset(); impactHold.current = false; lastReceiptAt.current = 0;
        shotViewModeRef.current = null; setShotViewMode(null); setReceipt(null);
    }, []);
    useEffect(() => {
        if (!receipt) return;
        const timer = setTimeout(() => setReceipt(null), 2600);
        return () => clearTimeout(timer);
    }, [receipt]);

    useEffect(() => {
        const previous = view.current;
        view.current = createViewport(size.width, size.height, overview);
        lastResize.current = performance.now();
        resizeBattleCamera(camera.current, previous, view.current);
        gesture.current = null; ghost.current = undefined; pointers.current.clear();
        const p = latest.current;
        if (cameraHandoff.current !== null && p.phase === 'combat' && p.preferences.camera !== 'manual') {
            focus(teamCenter(p.turnPlayer ?? p.mySide));
        }
    }, [size, overview, focus, teamCenter]);
    useEffect(() => {
        pendingRef.current = false; setShotPending(false);
        chargeStart.current = null; chargeInput.current = null; setCharging(false);
        if (shotCamera.current.id === null) followedProjectile.current = null;
    }, [props.phase, props.turnPlayer]);
    useEffect(() => {
        latest.current = props;
    }, [props]);
    useEffect(() => {
        if (props.phase !== 'build' || ownKingId === undefined || !hasCannonOrigins) return;
        // The first snapshot can arrive after terrain; don't retain a fallback spawn framing.
        focus(teamCenter(props.mySide));
        camera.current.x = camera.current.target; camera.current.velocity = 0;
    }, [ownKingId, hasCannonOrigins, props.terrain?.seed, props.phase, props.mySide, focus, teamCenter]);
    useEffect(() => {
        gesture.current = null; ghost.current = undefined; pointers.current.clear(); keys.current.clear();
        effects.current = []; particles.current.reset(); presentationEvents.current = []; shot.current = undefined;
        resetShotPresentation();
        snapshots.current.reset(); presented.current = undefined;
        seenProjectiles.current = new Set(props.gameState?.bodies.filter(body => body.label === 'projectile').map(body => body.id) ?? []);
        followedProjectile.current = null; cameraDissolve.current = null; cameraHandoff.current = null;
        camera.current.target = camera.current.x; camera.current.velocity = 0;
        if (props.gameState) snapshots.current.push(props.gameState, performance.now());
        pendingRef.current = Boolean(props.serverHasFired); setShotPending(Boolean(props.serverHasFired));
        const ball = props.gameState?.bodies.find(body => body.label === 'projectile' && projectileOwner(body) === props.turnPlayer);
        if (ball && !props.paused) shotCamera.current.begin(ball.id, projectileOwner(ball), ball.position);
        // A full sync flushes stale presentation without changing the user's camera preference.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.syncRevision, props.paused]);
    useEffect(() => {
        // shot_fired reaches both players; only the shooter's controls become "Fired".
        if (props.serverHasFired && props.turnPlayer === props.mySide) { pendingRef.current = true; setShotPending(true); }
    }, [props.serverHasFired, props.turnPlayer, props.mySide]);
    useEffect(() => {
        if (props.gameState) snapshots.current.push(props.gameState, performance.now());
    }, [props.gameState]);
    useEffect(() => {
        gesture.current = null; ghost.current = undefined; pointers.current.clear();
        camera.current.manualUntil = 0;
        if (!camera.current.initialized && props.phase !== 'build') {
            const side = props.preferences.camera === 'manual' ? props.mySide : props.turnPlayer ?? props.mySide;
            focus(teamCenter(side));
            camera.current.x = camera.current.target; camera.current.initialized = true;
        }
        if (props.phase === 'build') {
            resetShotPresentation();
            cameraHandoff.current = null; cameraDissolve.current = null;
            effects.current = []; seenProjectiles.current.clear(); particles.current.reset(); shot.current = undefined;
            snapshots.current.reset(); presented.current = undefined; presentationEvents.current = [];
            kingDirectors.current.left.reset(); kingDirectors.current.right.reset(); kingActions.current = {};
            if (props.gameState) snapshots.current.push(props.gameState, performance.now());
            if (!camera.current.initialized || props.preferences.camera !== 'manual') focus(teamCenter(props.mySide));
            if (!camera.current.initialized) { camera.current.x = camera.current.target; camera.current.initialized = true; }
        } else if (props.phase === 'combat' && props.preferences.camera !== 'manual' && shotCamera.current.id === null) {
            focus(teamCenter(props.turnPlayer ?? props.mySide));
            cameraHandoff.current = performance.now();
        }
        // A resize must not reset interpolation, reactions or camera motion mid-shot.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.phase, props.turnPlayer, props.mySide]);
    useEffect(() => {
        if (props.phase !== 'reveal' || props.preferences.camera === 'manual' || props.paused) return;
        const remaining = Math.max(0, (props.phaseEndsAt ?? Date.now() + 5000) - Date.now());
        const opponent = props.mySide === 'left' ? 'right' : 'left';
        const showOpponent = () => { focus(teamCenter(opponent)); cameraHandoff.current = performance.now(); };
        if (remaining < 3600) { showOpponent(); return; }
        focus(teamCenter(props.mySide));
        const timer = setTimeout(showOpponent, Math.min(800, remaining - 2800));
        return () => clearTimeout(timer);
    }, [props.phase, props.mySide, props.preferences.camera, props.phaseEndsAt, props.paused, focus, teamCenter]);
    useEffect(() => {
        followedProjectile.current = null; cameraHandoff.current = null; cameraDissolve.current = null;
        camera.current.target = camera.current.x; camera.current.velocity = 0;
        const p = latest.current;
        if (p.preferences.camera !== 'manual' && p.phase === 'combat' && shotCamera.current.id === null) {
            focus(teamCenter(p.turnPlayer ?? p.mySide));
            cameraHandoff.current = performance.now();
            if (p.preferences.camera === 'follow') followedProjectile.current = p.gameState?.bodies.find(body => body.label === 'projectile' && projectileOwner(body) === p.turnPlayer)?.id ?? null;
        }
    }, [props.preferences.camera, focus, teamCenter]);
    useEffect(() => {
        if (props.phase !== 'combat' || props.turnPlayer !== props.mySide || shotPending || inspect) {
            trajectory.current = []; return;
        }
        trajectory.current = predictTrajectory({ side: props.mySide, angle: aim.angle, power: aim.power,
            terrainPoints: props.terrain?.points ?? [], cannons: props.terrain?.cannons, hazards: props.hazards ?? [],
            maxFrames: PREVIEW_FRAMES });
    }, [aim, props.phase, props.turnPlayer, props.mySide, props.terrain, props.hazards, shotPending, inspect]);

    const fire = useCallback(() => {
        const p = latest.current;
        if (p.paused || impactHold.current || p.phase !== 'combat' || p.turnPlayer !== p.mySide || pendingRef.current || inspectRef.current) return;
        pendingRef.current = true; setShotPending(true);
        if (p.preferences.camera === 'follow') camera.current.manualUntil = 0;
        gesture.current = null; trajectory.current = [];
        track('projectile_fired', { angle: Math.round(aimRef.current.angle * 180 / Math.PI), power: Math.round(aimRef.current.power) });
        setLastPower(aimRef.current.power);
        p.onFire(aimRef.current.angle, aimRef.current.power);
    }, []);
    const canCharge = () => {
        const p = latest.current;
        return !p.paused && !impactHold.current && p.phase === 'combat' && p.turnPlayer === p.mySide
            && !pendingRef.current && !inspectRef.current && chargeStart.current === null;
    };
    const startCharge = useCallback((input: number | ' ' | 'Enter' | 'assistive') => {
        if (!canCharge()) return;
        chargeInput.current = input;
        chargeStart.current = performance.now(); setCharging(true);
        updateAim(aimRef.current.angle, chargePower(0));
    }, [updateAim]);
    const cancelCharge = useCallback(() => { chargeStart.current = null; chargeInput.current = null; setCharging(false); }, []);
    // Release fires with the power reached at that instant, not the last rendered frame.
    const releaseCharge = useCallback(() => {
        const start = chargeStart.current;
        if (start === null) return;
        chargeStart.current = null; chargeInput.current = null; setCharging(false);
        updateAim(aimRef.current.angle, chargePower(performance.now() - start));
        fire();
    }, [fire, updateAim]);
    useEffect(() => {
        if (!charging) return;
        let frame = requestAnimationFrame(function tick() {
            const start = chargeStart.current;
            if (start === null) return;
            const power = chargePower(performance.now() - start);
            if (power >= MAX_POWER) { releaseCharge(); return; }
            updateAim(aimRef.current.angle, power);
            frame = requestAnimationFrame(tick);
        });
        return () => cancelAnimationFrame(frame);
    }, [charging, releaseCharge, updateAim]);
    useEffect(() => { if (props.paused) cancelCharge(); }, [props.paused, cancelCharge]);
    useEffect(() => { cancelCharge(); }, [props.syncRevision, cancelCharge]);
    useEffect(() => {
        const addEffect = (effect: BattleEffect, sound: () => void) => {
            effects.current.push(effect);
            if (effects.current.length > 48) effects.current.shift();
            if (performance.now() - lastSound.current > 80) { sound(); lastSound.current = performance.now(); }
        };
        const { setBlockDestroyedCallback, setProjectileImpactCallback, setKingDamageCallback } = latest.current;
        const later = (run: () => void, timestamp?: number) => {
            presentationEvents.current.push({ at: performance.now() + snapshots.current.delay, timestamp: Number.isFinite(timestamp) ? timestamp : undefined, run });
            if (presentationEvents.current.length > 128) presentationEvents.current.shift();
        };
        const captureImpact = (id: number | undefined, side: Side, position: Vector, kind: ShotReceipt['kind'], text: string) => {
            if (shotCamera.current.impact(id, side, position, kind, text, performance.now()) && latest.current.preferences.camera === 'follow') {
                camera.current.manualUntil = 0; cameraHandoff.current = performance.now();
            }
        };
        setBlockDestroyedCallback(data => later(() => {
            if (!reducedMotion.current) {
                particles.current.emitMaterial(data.position.x, data.position.y, data.material, data.velocity);
                particles.current.emitSmoke(data.position.x, data.position.y);
            }
            addEffect({ ...data.position, at: performance.now(), kind: 'break', material: data.material }, playExplosion);
        }, data.timestamp));
        setProjectileImpactCallback(data => later(() => {
            const p = latest.current;
            const kind = data.target === 'king' ? 'king' : data.target === 'block' ? 'block' : 'ground';
            const material = data.material ? data.material[0].toUpperCase() + data.material.slice(1) : 'Block';
            const text = kind === 'king' ? 'King hit' + (data.damage ? ' -' + Math.ceil(data.damage) + ' HP' : '')
                : kind === 'block' ? material + (data.destroyed ? ' destroyed' : ' hit') : 'Ground hit';
            captureImpact(data.projectileId, data.side ?? p.turnPlayer ?? p.mySide, data.position, kind, text);
            if (!reducedMotion.current) particles.current.emitImpact(data.position.x, data.position.y);
            addEffect({ ...data, ...data.position, at: performance.now(), kind: 'impact' }, () => playImpact(data.material));
        }, data.timestamp));
        setKingDamageCallback(data => later(() => {
            const p = latest.current;
            const position = data.position ?? kingFeedbackPosition(data.side, p.gameState, p.kingsHp[data.side]);
            if (data.source === 'projectile') captureImpact(data.projectileId, data.attackerSide ?? (data.side === 'left' ? 'right' : 'left'), position, 'king', 'King hit -' + Math.ceil(data.damage) + ' HP');
            addEffect({ ...data, ...position, at: performance.now(), kind: 'damage' }, playImpact);
        }, data.timestamp));
        return () => {
            setBlockDestroyedCallback(null); setProjectileImpactCallback(null); setKingDamageCallback(null);
        };
    }, [props.setBlockDestroyedCallback, props.setProjectileImpactCallback, props.setKingDamageCallback]);

    useEffect(() => {
        let raf = 0;
        let lastFrame = 0;
        const render = (now: number) => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            const p = latest.current;
            if (canvas && ctx) {
                const renderStart = performance.now();
                const v = view.current;
                const dpr = Math.min(renderQuality.current.maxRatio, renderPixelRatio(v.width, v.height, window.devicePixelRatio));
                const w = Math.round(v.width * dpr), h = Math.round(v.height * dpr);
                if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
                ctx.setTransform(w / v.width, 0, 0, h / v.height, 0, 0);
                ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                const elapsed = lastFrame ? Math.max(0, now - lastFrame) : 16.667;
                const delta = Math.min(50, elapsed);
                lastFrame = now;
                const cam = camera.current;
                const sample = p.paused ? undefined : snapshots.current.sample(now);
                presented.current = sample;
                const renderState = sample?.state ?? p.gameState;
                const transforms = sample?.transforms ?? new Map();
                const liveIds = new Set(renderState?.bodies.filter(body => body.label === 'projectile').map(body => body.id));
                for (const id of seenProjectiles.current) if (!liveIds.has(id)) seenProjectiles.current.delete(id);
                for (const body of renderState?.bodies ?? []) {
                    if (p.paused || document.hidden || body.label !== 'projectile' || seenProjectiles.current.has(body.id)) continue;
                    seenProjectiles.current.add(body.id);
                    const side = projectileOwner(body);
                    shotCamera.current.begin(body.id, side, renderedPosition(body, transforms));
                    if (p.preferences.camera === 'follow') { followedProjectile.current = body.id; cam.manualUntil = 0; }
                    const facing = side === 'left' ? 1 : -1;
                    const angle = side === p.mySide ? aimRef.current.angle : Math.atan2(-body.velocity.y, body.velocity.x * facing);
                    shot.current = { id: body.id, side, at: now, angle };
                    const muzzle = cannonMuzzle(side, angle, p.terrain?.points ?? [], p.terrain?.cannons);
                    if (!reducedMotion.current) particles.current.emitMuzzle(muzzle.x, muzzle.y, angle, facing);
                    playFire();
                }
                const ready = (event: (typeof presentationEvents.current)[number]) => event.timestamp === undefined
                    ? event.at <= now : sample !== undefined && event.timestamp <= sample.timestamp;
                const due = presentationEvents.current.filter(ready);
                presentationEvents.current = presentationEvents.current.filter(event => !ready(event));
                due.forEach(event => { if (!p.paused && !document.hidden && (event.timestamp === undefined || !sample || sample.timestamp - event.timestamp < 800)) event.run(); });
                if (keys.current.has('a')) { cam.target -= delta * 0.55 / v.scale; cam.manualUntil = now + 12000; }
                if (keys.current.has('d')) { cam.target += delta * 0.55 / v.scale; cam.manualUntil = now + 12000; }
                const ball = renderState?.bodies.find(body => body.id === shotCamera.current.id);
                const shotFocus = shotCamera.current.sample(now, p.turnPlayer, ball ? { position: renderedPosition(ball, transforms), velocity: ball.velocity } : undefined);
                const autoShot = p.preferences.camera === 'follow' && !p.paused && cam.manualUntil < now;
                impactHold.current = autoShot && shotFocus?.kind === 'impact';
                const mode = shotFocus?.kind ?? null;
                if (shotViewModeRef.current !== mode) {
                    const previous = shotViewModeRef.current;
                    shotViewModeRef.current = mode; setShotViewMode(mode);
                    if (previous && !mode && p.phase === 'combat' && p.preferences.camera !== 'manual') {
                        focus(teamCenter(p.turnPlayer ?? p.mySide)); cameraHandoff.current = now;
                    }
                }
                const nextReceipt = shotCamera.current.receipt;
                if (nextReceipt && nextReceipt.at !== lastReceiptAt.current) { lastReceiptAt.current = nextReceipt.at; setReceipt(nextReceipt); }
                let tracking = false;
                if (shotFocus && autoShot && (!reducedMotion.current || shotFocus.kind === 'impact')) {
                    const target = clampCamera(shotFocus.point.x - v.worldWidth / 2, v);
                    const far = shotFocus.kind === 'impact' && Math.abs(target - cam.x) > v.worldWidth * 0.8;
                    if (far) { cam.target = target; if (cameraHandoff.current === null) cameraHandoff.current = now; }
                    else if (reducedMotion.current) { cam.target = target; }
                    else {
                        const hp = healthPanel(v.width, v.height, 'left');
                        const feedbackSpace = v.height < 320 && v.width / v.height > 1.8 ? 20 : 56;
                        trackBattleCamera(cam, v, shotFocus.point, shotFocus.velocity, delta, hp.y + hp.height + feedbackSpace);
                        tracking = true; cameraHandoff.current = null;
                    }
                } else {
                    v.top += (600 - v.worldHeight - v.top) * (1 - Math.exp(-delta / 120));
                }
                followedProjectile.current = autoShot && shotFocus?.kind === 'flight' ? shotCamera.current.id : null;
                const pendingHandoff = cameraHandoff.current !== null;
                const handoffReady = pendingHandoff && now - Math.max(cameraHandoff.current!, lastResize.current) > 60;
                const distantHandoff = handoffReady && Math.abs(cam.target - cam.x) > v.worldWidth * 0.8 && !reducedMotion.current;
                if (handoffReady) cameraHandoff.current = null;
                if (!tracking && !distantHandoff && (!pendingHandoff || handoffReady)) advanceBattleCamera(cam, v, delta, p.phase === 'reveal', reducedMotion.current, cam.manualUntil > now);
                particles.current.update(elapsed);
                effects.current = effects.current.filter(e => now - e.at < (e.kind === 'damage' || e.target === 'block' ? 950 : 420));
                const balls = renderState?.bodies.filter(body => body.label === 'projectile').map(body => ({
                    id: body.id, position: renderedPosition(body, transforms), velocity: body.velocity,
                })) ?? [];
                for (const side of ['left', 'right'] as const) {
                    const hp = p.kingsHp[side];
                    const reference = { x: hp.x ?? (side === 'left' ? 600 : 1800), y: hp.y ?? 480 };
                    const body = renderState?.bodies.find(body => body.label === 'king' && body.side === side)
                        ?? renderState?.bodies.filter(body => body.label === 'king' && !body.side).sort((a, b) =>
                            Math.hypot(a.position.x - reference.x, a.position.y - reference.y) - Math.hypot(b.position.x - reference.x, b.position.y - reference.y))[0];
                    const hit = [...effects.current].reverse().find(effect => effect.kind === 'damage' && effect.side === side);
                    kingActions.current[side] = kingDirectors.current[side].update({ now, side, phase: p.phase, turn: p.turnPlayer,
                        winner: p.winner, king: body ? renderedPosition(body, transforms) : reference, projectiles: balls,
                        velocity: body?.velocity, hp: hp.hp,
                        shot: shot.current, hitAt: hit?.at, reducedMotion: reducedMotion.current,
                        aimAngle: side === p.mySide ? aimRef.current.angle : shot.current?.side === side ? shot.current.angle : Math.PI / 4 });
                }
                const frame = { view: v, camera: cam.x, now, reducedMotion: reducedMotion.current,
                    state: renderState, terrain: p.terrain, transforms, kings: p.kingsHp,
                    names: p.playerNames, side: p.mySide, phase: p.phase, turn: p.turnPlayer, winner: p.winner,
                    angle: aimRef.current.angle, trajectory: trajectory.current, hazards: p.hazards ?? [],
                    effects: effects.current, particles: particles.current, shot: shot.current, ghost: ghost.current,
                    projectileId: followedProjectile.current,
                    kingActions: kingActions.current, hitLabels: p.preferences.hitLabels,
                    placementDimensions: PLACEMENT_DIMENSIONS[p.selectedShape ?? 'rectangle'] };
                drawBattle(ctx, frame);
                if (distantHandoff) {
                    const previous = document.createElement('canvas'); previous.width = w; previous.height = h;
                    previous.getContext('2d')!.drawImage(canvas, 0, 0);
                    cameraDissolve.current = { frame: previous, at: now };
                    cam.x = clampCamera(cam.target, v); cam.velocity = 0;
                    drawBattle(ctx, { ...frame, camera: cam.x });
                }
                const dissolve = cameraDissolve.current;
                if (dissolve) {
                    const t = Math.min(1, Math.max(0, (now - dissolve.at) / 360));
                    if (t >= 1 || reducedMotion.current || dissolve.frame.width !== w || dissolve.frame.height !== h) cameraDissolve.current = null;
                    else {
                        ctx.save(); ctx.globalAlpha = 1 - t * t * (3 - 2 * t);
                        ctx.drawImage(dissolve.frame, 0, 0, v.width, v.height); ctx.restore();
                    }
                }
                if (debugVisible) {
                    debugStats.updateFrame(now); debugStats.totalBodies = p.gameState?.bodies.length ?? 0;
                    debugStats.particlesActive = particles.current.count; debugStats.phase = p.phase;
                }
                renderQuality.current.record(elapsed, performance.now() - renderStart);
            }
            raf = requestAnimationFrame(render);
        };
        raf = requestAnimationFrame(render);
        return () => cancelAnimationFrame(raf);
    }, [focus, teamCenter]);
    useEffect(() => {
        const host = window as Window & { render_game_to_text?: () => string };
        const read = () => {
            const p = latest.current;
            return JSON.stringify({ coordinates: 'world origin top-left; x right, y down; 2400x600', phase: p.phase,
                connection: { paused: Boolean(p.paused), syncRevision: p.syncRevision, fired: p.serverHasFired },
                diagnostics: { fps: debugStats.fps, frameMs: debugStats.frameTimeMs, heapMB: debugStats.jsHeapMB, queuedEffects: presentationEvents.current.length, seenProjectiles: seenProjectiles.current.size, pointers: pointers.current.size },
                side: p.mySide, turn: p.turnPlayer, mode: p.phase === 'build' ? p.gameMode : inspectRef.current ? 'inspect' : 'aim',
                shotFocus: { mode: shotViewModeRef.current, receipt: shotCamera.current.receipt },
                cannons: p.terrain?.cannons,
                aim: { degrees: Math.round(aimRef.current.angle * 180 / Math.PI), power: aimRef.current.power, pending: pendingRef.current, charging: chargeStart.current !== null },
                viewport: view.current, camera: camera.current.x,
                cameraMotion: { target: camera.current.target, velocity: camera.current.velocity, following: followedProjectile.current,
                    mode: p.preferences.camera, motion: p.preferences.motion, hitLabels: p.preferences.hitLabels,
                    handoff: cameraDissolve.current ? { type: 'dissolve', age: performance.now() - cameraDissolve.current.at, duration: 360 } : null },
                kings: p.kingsHp, artLoaded: cartoon.loaded,
                reactionsLoaded: kingReactions.loaded,
                livingKingsLoaded: livingKings.loaded,
                kingActions: kingActions.current,
                livingKingStates: Object.fromEntries((['left', 'right'] as const).map(side => [side, livingKingState({
                    side, now: performance.now(), reducedMotion: reducedMotion.current,
                    shootAt: shot.current?.side === side ? shot.current.at : undefined,
                    looking: kingActions.current[side]?.look ?? 0,
                    action: kingActions.current[side],
                })])),
                battleArtLoaded: battleArt.loaded,
                rendering: { pixelRatio: canvasRef.current ? canvasRef.current.width / view.current.width : 1, reducedMotion: reducedMotion.current },
                presentation: { delayMs: presented.current?.delayMs ?? PRESENTATION_DELAY_MS, targetDelayMs: presented.current?.targetDelayMs,
                    held: presented.current?.held, resynced: presented.current?.resynced, timestamp: presented.current?.timestamp,
                    snapshots: presented.current?.buffered ?? 0,
                    projectiles: presented.current?.state.bodies.filter(b => b.label === 'projectile').map(b => ({ id: b.id, ...renderedPosition(b, presented.current!.transforms) })) ?? [] },
                kingCharacters: { left: kingReactions.identity('left'), right: kingReactions.identity('right') },
                particles: particles.current.debugCounts(),
                shot: shot.current ? { side: shot.current.side, age: Math.round(performance.now() - shot.current.at), muzzle: cannonMuzzle(shot.current.side, shot.current.angle, p.terrain?.points ?? [], p.terrain?.cannons) } : null,
                kingPoses: Object.fromEntries((['left', 'right'] as const).map(side => {
                    const hit = [...effects.current].reverse().find(e => e.kind === 'damage' && e.side === side);
                    return [side, kingPresentation({ now: performance.now(), side, phase: p.phase, winner: p.winner, hp: p.kingsHp[side].hp, hitAt: hit?.at }).pose];
                })),
                bodies: p.gameState?.bodies.filter(b => !b.isStatic).map(b => ({ id: b.id, kind: b.label, side: b.side,
                    x: b.position.x, y: b.position.y, angle: b.angle, velocity: b.velocity, width: b.width, height: b.height, hp: b.blockHp })) ?? [] });
        };
        host.render_game_to_text = read;
        return () => { if (host.render_game_to_text === read) delete host.render_game_to_text; };
    }, []);
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (latest.current.paused) return;
            // Suppress native button activation so key release submits exactly once.
            if ((e.key === ' ' || e.key === 'Enter') && e.target instanceof HTMLElement && e.target.matches('.battle-fire')) {
                e.preventDefault();
                if (!e.repeat) startCharge(e.key);
                return;
            }
            if (e.target instanceof HTMLElement && (e.target.matches('input, textarea, button, select') || e.target.isContentEditable)) return;
            if (e.key === '`') { toggleDebug(); return; }
            if (['a', 'd'].includes(e.key.toLowerCase())) keys.current.add(e.key.toLowerCase());
            const p = latest.current;
            if (e.key.toLowerCase() === 'f' && !e.repeat) {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void (stageRef.current?.closest<HTMLElement>('.game-container') ?? stageRef.current?.parentElement)?.requestFullscreen();
            }
            if (p.phase !== 'combat' || p.turnPlayer !== p.mySide || pendingRef.current || inspectRef.current) return;
            const { angle, power } = aimRef.current;
            const degree = Math.PI / 180;
            // Power comes only from charging; arrows set the angle (Up/Down for fine steps).
            if (e.key === 'ArrowLeft') updateAim(angle + 2 * degree, power);
            else if (e.key === 'ArrowRight') updateAim(angle - 2 * degree, power);
            else if (e.key === 'ArrowUp') updateAim(angle + degree, power);
            else if (e.key === 'ArrowDown') updateAim(angle - degree, power);
            else if (e.key === ' ') { if (!e.repeat) startCharge(' '); }
            else return;
            e.preventDefault();
        };
        const up = (e: KeyboardEvent) => {
            keys.current.delete(e.key.toLowerCase());
            if (e.key === chargeInput.current && chargeStart.current !== null) { e.preventDefault(); releaseCharge(); }
        };
        const cancel = () => { keys.current.clear(); pointers.current.clear(); gesture.current = null; ghost.current = undefined; cancelCharge(); };
        const visibility = () => {
            cancel(); effects.current = []; particles.current.reset(); presentationEvents.current = []; shot.current = undefined;
            const state = latest.current.gameState;
            seenProjectiles.current = new Set(state?.bodies.filter(body => body.label === 'projectile').map(body => body.id) ?? []);
            snapshots.current.reset(); if (state) snapshots.current.push(state, performance.now());
            camera.current.target = camera.current.x; camera.current.velocity = 0; cameraDissolve.current = null;
            resetShotPresentation();
        };
        window.addEventListener('keydown', down); window.addEventListener('keyup', up);
        window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', visibility);
        return () => {
            window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
            window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', visibility);
        };
    }, [startCharge, releaseCharge, cancelCharge, updateAim, resetShotPresentation]);

    const screenPoint = (e: React.PointerEvent<HTMLCanvasElement>): Vector => {
        const rect = e.currentTarget.getBoundingClientRect();
        return { x: (e.clientX - rect.left) * view.current.width / rect.width, y: (e.clientY - rect.top) * view.current.height / rect.height };
    };
    const panMap = (x: number) => {
        const box = minimapRect(view.current);
        focus(clamp((x - box.x) / box.width, 0, 1) * WORLD_WIDTH, true);
    };
    const aimAt = (point: Vector) => {
        const p = latest.current;
        const cannon = cannonPosition(p.mySide, p.terrain?.points ?? [], p.terrain?.cannons);
        const world = screenToWorld(point, camera.current.x, view.current);
        const direction = p.mySide === 'left' ? 1 : -1;
        // Signed x permits the complete 10-170 degree range on either side.
        updateAim(Math.atan2(cannon.y - world.y, direction * (world.x - cannon.x)), aimRef.current.power);
    };
    const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (latest.current.paused) return;
        if (e.button !== 0 && e.pointerType !== 'touch') return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const point = screenPoint(e);
        pointers.current.set(e.pointerId, point);
        const p = latest.current;
        if (pointers.current.size > 1) {
            const all = [...pointers.current.values()];
            gesture.current = { kind: 'pan', start: { x: (all[0].x + all[1].x) / 2, y: 0 }, camera: camera.current.x, cancelled: true };
            ghost.current = undefined; camera.current.manualUntil = performance.now() + 12000; return;
        }
        const onHealth = (['left', 'right'] as const).some(side => {
            const box = healthPanel(view.current.width, view.current.height, side);
            return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
        });
        if (onHealth) {
            gesture.current = { kind: 'pan', start: point, camera: camera.current.x, cancelled: true };
            ghost.current = undefined;
            return;
        }
        const box = minimapRect(view.current);
        const onMap = showBattleMinimap(view.current) && point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
        const kind = onMap ? 'minimap' : p.phase === 'build' && p.gameMode === 'build' ? 'place'
            : p.phase === 'combat' && p.turnPlayer === p.mySide && !inspectRef.current && !pendingRef.current && !impactHold.current ? 'aim' : 'pan';
        gesture.current = { kind, start: point, camera: camera.current.x, cancelled: false };
        if (kind === 'aim') aimAt(point);
        if (kind === 'place') ghost.current = screenToWorld(point, camera.current.x, view.current);
        if (kind === 'minimap') panMap(point.x);
        if (kind === 'pan') camera.current.manualUntil = performance.now() + 12000;
    };
    const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!pointers.current.has(e.pointerId)) return;
        const point = screenPoint(e); pointers.current.set(e.pointerId, point);
        const action = gesture.current;
        if (!action) return;
        if (action.cancelled && pointers.current.size < 2) return;
        if (action.kind === 'pan') {
            cameraHandoff.current = null;
            const all = [...pointers.current.values()];
            const x = all.length > 1 ? (all[0].x + all[1].x) / 2 : point.x;
            camera.current.target = clampCamera(action.camera + (action.start.x - x) / view.current.scale, view.current);
            camera.current.x = camera.current.target; camera.current.velocity = 0; camera.current.manualUntil = performance.now() + 12000;
        } else if (action.kind === 'minimap') panMap(point.x);
        else if (action.kind === 'aim') aimAt(point);
        else if (action.kind === 'place') ghost.current = screenToWorld(point, camera.current.x, view.current);
    };
    const endPointer = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
        const action = gesture.current;
        const point = screenPoint(e);
        pointers.current.delete(e.pointerId);
        if (!cancelled && action && !action.cancelled && action.kind === 'place' && pointers.current.size === 0) {
            const p = latest.current;
            const world = screenToWorld(point, camera.current.x, view.current);
            const rect = e.currentTarget.getBoundingClientRect();
            if (p.phase === 'build' && p.gameMode === 'build' && canPlace(world, p.mySide) && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) p.onSpawn(world.x, world.y);
        }
        // Release/cancel never fires. Multi-touch stays cancelled until all fingers lift.
        if (pointers.current.size === 0) { gesture.current = null; ghost.current = undefined; }
        else if (gesture.current) gesture.current.cancelled = true;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    };
    const isMyTurn = props.phase === 'combat' && props.turnPlayer === props.mySide;
    const toggleInspect = () => { cancelCharge(); inspectRef.current = !inspectRef.current; setInspect(inspectRef.current); gesture.current = null; };
    const nudge = (direction: number) => {
        cameraHandoff.current = null;
        camera.current.manualUntil = performance.now() + 12000;
        camera.current.target = clampCamera(camera.current.target + direction * view.current.worldWidth * 0.45, view.current);
    };

    return <div className="battle-shell">
        <div ref={stageRef} className="battle-stage">
            {receipt && <div className={`shot-receipt shot-receipt--${receipt.kind}`} role="status" style={{ top: healthPanel(size.width, size.height, 'left').y + healthPanel(size.width, size.height, 'left').height + 8 }}>{receipt.text}</div>}
            <canvas ref={canvasRef} aria-label="Fortress battlefield" className="battle-canvas"
                onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={e => endPointer(e, false)}
                onPointerCancel={e => endPointer(e, true)} onLostPointerCapture={e => { if (pointers.current.has(e.pointerId)) endPointer(e, true); }}
                onWheel={e => { if (isMyTurn && !shotPending && !charging && !inspect && !impactHold.current) updateAim(aim.angle + (e.deltaY < 0 ? 1 : -1) * Math.PI / 180, aim.power); }} />
        </div>
        <div className={`battle-dock ${props.phase === 'combat' ? 'battle-dock-combat' : ''}`}>
            <nav className="battle-camera" aria-label="Battlefield camera">
                <button type="button" title="Pan left" aria-label="Pan left" onClick={() => nudge(-1)}><MoveLeft size={18} /></button>
                <button type="button" title="Your fortress" aria-label="Recenter battlefield" onClick={recenter}><Crown size={18} /></button>
                <button type="button" title="Enemy fortress" aria-label="Enemy fortress" onClick={() => focus(teamCenter(props.mySide === 'left' ? 'right' : 'left'), true)}><Flag size={18} /></button>
                <button type="button" title="Pan right" aria-label="Pan right" onClick={() => nudge(1)}><MoveRight size={18} /></button>
                {props.phase === 'combat' && <button type="button" title={inspect ? 'Aim cannon' : 'Inspect battlefield'} aria-label={inspect ? 'Aim cannon' : 'Inspect battlefield'} aria-pressed={inspect} onClick={toggleInspect}>{inspect ? <Hand size={18} /> : <Crosshair size={18} />}</button>}
                {size.height < 320 && size.width / size.height > 1.8 && <button type="button" title={overview ? 'Tactical view' : 'Zoom out'} aria-label={overview ? 'Tactical view' : 'Zoom out'} aria-pressed={overview} onClick={() => setOverview(!overview)}>{overview ? <ZoomIn size={18} /> : <ZoomOut size={18} />}</button>}
            </nav>
            {props.phase === 'combat' && <>
                <div className="battle-aim-controls">
                    <label htmlFor="cannon-angle"><span>Angle <output>{Math.round(aim.angle * 180 / Math.PI)}&deg;</output></span>
                        <input id="cannon-angle" type="range" min="10" max="170" step="1" value={Math.round(aim.angle * 180 / Math.PI)} disabled={!isMyTurn || shotPending || inspect || (shotViewMode === 'impact' && props.preferences.camera === 'follow')} onChange={e => updateAim(Number(e.target.value) * Math.PI / 180, aim.power)} /></label>
                    <div className={`battle-power ${charging ? 'battle-power--charging' : ''}`}>
                        <span>{charging ? 'Power' : 'Last'} <output>{charging ? Math.round(aim.power) : lastPower === null ? '–' : Math.round(lastPower)}</output></span>
                        <div className="battle-power-track" role="meter" aria-label="Shot power" aria-valuemin={0} aria-valuemax={100}
                            aria-valuenow={Math.round(charging ? aim.power : lastPower ?? 0)}>
                            <div className="battle-power-fill" style={{ width: `${charging ? aim.power : 0}%` }} />
                            {lastPower !== null && <div className="battle-power-last" style={{ left: `${lastPower}%` }} />}
                            {!charging && lastPower === null && isMyTurn && <span className="battle-power-hint">Hold Fire or Space</span>}
                        </div>
                    </div>
                </div>
                <button className={`battle-fire ${charging ? 'battle-fire--charging' : ''}`} type="button" title="Hold to charge, release to fire"
                    aria-pressed={charging}
                    disabled={!isMyTurn || shotPending || inspect || (shotViewMode === 'impact' && props.preferences.camera === 'follow')}
                    onPointerDown={e => { if (e.button !== 0 || !e.isPrimary) return; startCharge(e.pointerId); if (chargeInput.current === e.pointerId) e.currentTarget.setPointerCapture(e.pointerId); }}
                    onPointerUp={e => { if (chargeInput.current === e.pointerId) releaseCharge(); }}
                    onPointerCancel={e => { if (chargeInput.current === e.pointerId) cancelCharge(); }}
                    onLostPointerCapture={e => { if (chargeInput.current === e.pointerId) cancelCharge(); }}
                    onBlur={() => { if (typeof chargeInput.current !== 'number') cancelCharge(); }}
                    onClick={e => { if (e.detail === 0) { if (chargeInput.current === 'assistive') releaseCharge(); else startCharge('assistive'); } }}
                    onContextMenu={e => e.preventDefault()}><Flame size={20} /><span>{shotViewMode === 'impact' ? 'Impact' : shotPending ? 'Fired' : isMyTurn ? 'Fire' : 'Waiting'}</span></button>
            </>}
        </div>
    </div>;
}

export const GameCanvas = React.memo(GameCanvasInner);
