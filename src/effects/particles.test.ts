/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ParticleSystem } from './particles';
import type { ParticleKind, ParticleMaterial } from './particles';

function seeded(seed = 42): () => number {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
}

interface Command {
    name: string;
    args: number[];
    color: string;
    alpha: number;
}

function recordingContext() {
    const commands: Command[] = [];
    const stack: { alpha: number; fill: string; stroke: string; width: number; cap: string }[] = [];
    const context = {
        globalAlpha: 1, fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineCap: 'butt',
        save() {
            stack.push({ alpha: this.globalAlpha, fill: this.fillStyle, stroke: this.strokeStyle,
                width: this.lineWidth, cap: this.lineCap });
        },
        restore() {
            const state = stack.pop();
            assert.ok(state, 'balanced canvas saves/restores');
            this.globalAlpha = state.alpha; this.fillStyle = state.fill;
            this.strokeStyle = state.stroke; this.lineWidth = state.width; this.lineCap = state.cap;
        },
        translate(...args: number[]) { record('translate', args); },
        rotate(...args: number[]) { record('rotate', args); },
        scale(...args: number[]) { record('scale', args); },
        beginPath() { record('beginPath'); },
        closePath() { record('closePath'); },
        moveTo(...args: number[]) { record('moveTo', args); },
        lineTo(...args: number[]) { record('lineTo', args); },
        quadraticCurveTo(...args: number[]) { record('quadraticCurveTo', args); },
        ellipse(...args: number[]) { record('ellipse', args); },
        fillRect(...args: number[]) { record('fillRect', args); },
        fill() { record('fill'); },
        stroke() { record('stroke'); },
    };
    function record(name: string, args: number[] = []) {
        commands.push({ name, args, color: name === 'stroke' ? context.strokeStyle : context.fillStyle,
            alpha: context.globalAlpha });
    }
    return { context: context as unknown as CanvasRenderingContext2D, commands, stack };
}

function draw(system: ParticleSystem): Command[] {
    const recording = recordingContext();
    system.draw(recording.context, -1000, 4000);
    assert.equal(recording.stack.length, 0);
    return recording.commands;
}

function orderedDraw(system: ParticleSystem): Command[] {
    // Swap-and-pop expiry may reorder otherwise identical surviving particles.
    const particles: Command[][] = [];
    for (const command of draw(system)) {
        if (command.name === 'translate') particles.push([]);
        particles[particles.length - 1].push(command);
    }
    return particles.sort((a, b) => a[0].args[0] - b[0].args[0] || a[0].args[1] - b[0].args[1]).flat();
}

const materialKinds: readonly [Exclude<ParticleMaterial, 'generic'>, ParticleKind][] = [
    ['wood', 'splinter'], ['stone', 'chip'], ['ice', 'shard'], ['rubber', 'fleck'], ['steel', 'spark'],
];

test('all emitters respect the global pool and per-kind budgets', () => {
    const system = new ParticleSystem(seeded());
    for (let i = 0; i < 100; i++) {
        for (const [material] of materialKinds) system.emitMaterial(100, 100, material);
        system.emit(100, 100, Number.MAX_SAFE_INTEGER, '#FFFFFF');
        system.emitImpact(100, 100); system.emitSmoke(100, 100); system.emitMuzzle(100, 100, 0);
    }
    const counts = system.debugCounts();
    assert.equal(counts.total, 300);
    assert.equal(Object.values(counts.byKind).reduce((a, b) => a + b, 0), system.count);
    assert.equal(Object.values(counts.byMaterial).reduce((a, b) => a + b, 0), system.count);
    assert.ok(counts.byKind.smoke <= 48);
    assert.ok(counts.byKind.spark <= 96);

    const smoke = new ParticleSystem(seeded());
    const sparks = new ParticleSystem(seeded());
    const generic = new ParticleSystem(seeded());
    generic.emit(0, 0, Number.MAX_SAFE_INTEGER, '#FFFFFF');
    assert.equal(generic.count, 32, 'untrusted counts cannot create an unbounded burst');
    for (let i = 0; i < 100; i++) { smoke.emitSmoke(0, 0); sparks.emitImpact(0, 0); }
    assert.equal(smoke.count, 48); assert.equal(sparks.count, 96);
});

test('saturated emitters stop work before consuming randomness', () => {
    let calls = 0;
    const system = new ParticleSystem(() => { calls++; return 0.5; });
    system.emit(0, 0, Number.MAX_SAFE_INTEGER, '#FFFFFF');
    system.emit(0, 0, Number.MAX_SAFE_INTEGER, '#FFFFFF');
    const before = calls;
    system.emit(0, 0, Number.MAX_SAFE_INTEGER, '#FFFFFF');
    assert.equal(calls, before);
    assert.equal(system.count, 64);
});

test('each material has a distinct silhouette, palette and particle kind', () => {
    const signatures = new Set<string>();
    const palettes = new Set<string>();
    for (const [material, kind] of materialKinds) {
        const system = new ParticleSystem(seeded());
        system.emitMaterial(100, 100, material);
        const counts = system.debugCounts();
        assert.equal(counts.byKind[kind], system.count);
        assert.equal(counts.byMaterial[material], system.count);
        const commands = draw(system);
        const first = commands.slice(1, commands.findIndex((c, i) => i > 0 && c.name === 'translate'));
        signatures.add(first.map(c => c.name).join(','));
        palettes.add(commands.find(c => c.name === 'fill' || c.name === 'stroke')!.color);
        if (material === 'rubber') assert.ok(commands.some(c => c.name === 'quadraticCurveTo'));
        if (material === 'steel') assert.ok(!commands.some(c => c.name === 'fill'));
    }
    assert.equal(signatures.size, 5);
    assert.equal(palettes.size, 5);
});

test('material motion differs and rubber has time-based elastic deformation', () => {
    const locations = new Set<string>();
    for (const [material] of materialKinds) {
        const system = new ParticleSystem(seeded());
        system.emitMaterial(100, 100, material);
        const before = draw(system).find(c => c.name === 'scale');
        system.update(100);
        const commands = draw(system);
        locations.add(JSON.stringify(commands.find(c => c.name === 'translate')!.args));
        if (material === 'rubber') {
            const after = commands.find(c => c.name === 'scale');
            assert.notDeepEqual(before!.args, after!.args);
            assert.ok(Math.abs(after!.args[0] * after!.args[1] - 1) < 1e-12);
        }
    }
    assert.equal(locations.size, 5);
});

function mixedSystem() {
    const system = new ParticleSystem(seeded());
    for (const [material] of materialKinds) system.emitMaterial(100, 100, material, { x: 3, y: -2 });
    system.emitSmoke(100, 100); system.emitImpact(100, 100);
    system.emit(100, 100, 8, '#FFFFFF'); system.emitMuzzle(100, 100, Math.PI / 4);
    return system;
}

test('identical seeds reproduce emissions without using browser globals', () => {
    assert.deepEqual(draw(mixedSystem()), draw(mixedSystem()));
    assert.doesNotThrow(() => new ParticleSystem());
});

test('motion, opacity, deformation and cleanup depend on elapsed time, not frame rate', () => {
    const single = mixedSystem();
    single.update(300);
    const expected = orderedDraw(single);
    for (const frames of [9, 18, 43, 72]) {
        const partitioned = mixedSystem();
        for (let i = 0; i < frames; i++) partitioned.update(300 / frames);
        assert.deepEqual(partitioned.debugCounts(), single.debugCounts());
        const actual = orderedDraw(partitioned);
        assert.equal(actual.length, expected.length);
        for (let i = 0; i < actual.length; i++) {
            assert.equal(actual[i].name, expected[i].name);
            assert.equal(actual[i].color, expected[i].color);
            assert.ok(Math.abs(actual[i].alpha - expected[i].alpha) < 1e-9);
            for (let a = 0; a < actual[i].args.length; a++) {
                assert.ok(Math.abs(actual[i].args[a] - expected[i].args[a]) < 1e-8,
                    `${frames} partitions: ${actual[i].name} argument ${a}`);
            }
        }
        partitioned.update(10_000);
        assert.equal(partitioned.count, 0);
    }
});

test('default updates retain the 60 Hz API and invalid deltas do not corrupt particles', () => {
    const system = mixedSystem();
    const explicit = mixedSystem();
    system.update(); explicit.update(1000 / 60);
    assert.deepEqual(draw(system), draw(explicit));
    const before = draw(system);
    for (const delta of [0, -1, NaN, Infinity, -Infinity]) system.update(delta);
    assert.deepEqual(draw(system), before);
    system.update(60_000);
    assert.equal(system.count, 0, 'a suspended tab must not leave old effects alive');
    assert.ok(Object.values(system.debugCounts().byKind).every(n => n === 0));
    assert.ok(Object.values(system.debugCounts().byMaterial).every(n => n === 0));
    assert.equal(draw(system).length, 0);
});

test('muzzle emission starts exactly at the supplied point and mirrors its forward cone', () => {
    const right = new ParticleSystem(seeded());
    const left = new ParticleSystem(seeded());
    const x = 500, y = 300;
    right.emitMuzzle(x, y, Math.PI / 4);
    left.emitMuzzle(x, y, Math.PI / 4, -1);
    assert.equal(right.debugCounts().byKind.spark, 10);
    assert.equal(right.debugCounts().byKind.smoke, 5);
    for (const c of draw(right).filter(c => c.name === 'translate')) assert.deepEqual(c.args, [x, y]);
    for (const c of draw(right).filter(c => c.name === 'moveTo')) assert.deepEqual(c.args, [-0, 0]);
    assert.ok(!draw(right).some(c => c.name === 'fillRect'), 'no opaque flash rectangle');
    right.update(50); left.update(50);
    const r = draw(right).filter(c => c.name === 'translate');
    const l = draw(left).filter(c => c.name === 'translate');
    assert.equal(r.length, 15); assert.equal(l.length, 15);
    for (let i = 0; i < r.length; i++) {
        assert.ok(r[i].args[0] > x); assert.ok(l[i].args[0] < x);
        assert.ok(r[i].args[1] < y);
        const elevation = Math.atan2(y - r[i].args[1], r[i].args[0] - x);
        assert.ok(Math.abs(elevation - Math.PI / 4) <= (i < 10 ? 0.21 : 0.36));
        assert.ok(Math.abs(r[i].args[0] + l[i].args[0] - 2 * x) < 1e-9);
        assert.equal(r[i].args[1], l[i].args[1]);
    }
});

test('reset clears every count and the pool remains reusable across rounds', () => {
    const system = mixedSystem();
    const diagnostic = system.debugCounts();
    diagnostic.byKind.smoke = 1234; diagnostic.byMaterial.wood = 1234;
    assert.notEqual(system.debugCounts().byKind.smoke, 1234, 'diagnostics are detached');
    for (let round = 0; round < 100; round++) {
        system.reset();
        assert.equal(system.count, 0);
        assert.ok(Object.values(system.debugCounts().byKind).every(n => n === 0));
        assert.ok(Object.values(system.debugCounts().byMaterial).every(n => n === 0));
        system.emitMuzzle(100, 100, 0);
        assert.equal(system.count, 15);
        system.update(2000);
        assert.equal(system.count, 0);
    }
});

test('smoke stays light and translucent, respects culling and restores canvas state', () => {
    const system = new ParticleSystem(seeded());
    system.emitSmoke(100, 100);
    system.update(100);
    const recording = recordingContext();
    const ctx = recording.context;
    ctx.globalAlpha = 0.4; ctx.fillStyle = '#123456'; ctx.strokeStyle = '#654321';
    ctx.lineWidth = 7; ctx.lineCap = 'square';
    system.draw(ctx);
    const fills = recording.commands.filter(c => c.name === 'fill');
    assert.equal(fills.length, 15);
    for (const fill of fills) {
        assert.ok(['#FFF8E8', '#EDF5FC', '#FFFFFF'].includes(fill.color));
        assert.ok(fill.alpha > 0 && fill.alpha < 0.04);
    }
    assert.equal(ctx.globalAlpha, 0.4); assert.equal(ctx.fillStyle, '#123456');
    assert.equal(ctx.strokeStyle, '#654321'); assert.equal(ctx.lineWidth, 7); assert.equal(ctx.lineCap, 'square');
    assert.equal(recording.stack.length, 0);
    const offscreen = recordingContext();
    system.draw(offscreen.context, 1000, 800);
    assert.equal(offscreen.commands.length, 0);
});

test('unknown materials fall back safely and invalid origins never enter the pool', () => {
    const system = new ParticleSystem(seeded());
    for (const material of ['unknown', 'constructor', '__proto__']) system.emitMaterial(0, 0, material);
    assert.equal(system.debugCounts().byMaterial.wood, 36);
    for (const value of [NaN, Infinity, -Infinity]) {
        system.emit(value, 0, 4, '#FFFFFF'); system.emit(0, value, 4, '#FFFFFF');
        system.emitMaterial(value, 0, 'wood'); system.emitImpact(0, value); system.emitSmoke(value, 0);
        system.emitMuzzle(0, 0, value); system.emitMuzzle(0, 0, 0, value);
    }
    assert.equal(system.count, 36);
});
