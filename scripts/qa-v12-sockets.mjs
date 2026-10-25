import { io } from 'socket.io-client';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const folder = resolve('output/v12/socket-' + Date.now()); mkdirSync(folder, { recursive: true });
const dbPath = resolve(folder, 'progression.sqlite');
const url = 'http://127.0.0.1:3002', sockets = [], passed = [];
let server;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function event(socket, name, predicate = () => true, ms = 10000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.off(name, listener); reject(new Error('Timeout: ' + name)); }, ms);
        const listener = value => { if (predicate(value)) { clearTimeout(timer); socket.off(name, listener); resolve(value); } };
        socket.on(name, listener);
    });
}
async function start() {
    server = spawn(process.execPath, ['dist/index.js'], { cwd: resolve('server'), env: { ...process.env, PORT: '3002', FORTRESS_DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stderr.on('data', data => { if (!String(data).includes('ExperimentalWarning') && !String(data).includes('trace-warnings')) process.stderr.write(data); });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
        server.stdout.on('data', data => { if (String(data).includes('Game Server running')) { clearTimeout(timer); resolve(); } });
    });
}
async function stop() { const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited; }
async function connect(identity) {
    const socket = io(url, { transports: ['websocket'], auth: { identity, protocol: 12 }, autoConnect: false, reconnection: false });
    sockets.push(socket); socket.on('identity', value => { socket.identity = value; });
    socket.bodies = new Map(); socket.on('gameState', state => {
        if (state.f) socket.bodies.clear(); for (const body of state.n) socket.bodies.set(body.id, body);
        for (const id of state.r) socket.bodies.delete(id);
    });
    const ready = Promise.race([event(socket, 'session_ready').then(value => ({ kind: 'ready', value })), event(socket, 'session_state').then(value => ({ kind: 'state', value }))]);
    socket.connect(); socket.resume = await ready;
    if (socket.resume.kind === 'state') for (const body of socket.resume.value.state?.n ?? []) socket.bodies.set(body.id, body);
    return socket;
}
async function action(socket, emit, payload, receive, predicate) { const next = event(socket, receive, predicate); socket.emit(emit, payload); return next; }
async function profile(socket) { return action(socket, 'get_profile', undefined, 'profile_update'); }
try {
    await start();
    let a = await connect(), b = await connect(); const identityA = a.identity, identityB = b.identity;
    const created = await action(a, 'create_room', { name: 'Alice', mode: 'pvp' }, 'room_joined');
    await action(b, 'join_room', { roomId: created.roomId, name: 'Bob' }, 'room_joined');
    a.emit('player_ready'); await action(b, 'player_ready', undefined, 'phase_change', p => p.phase === 'build');
    await event(a, 'gameState');
    await action(a, 'chat_message', { text: 'QA chat retained' }, 'chat_message');
    const paused = event(b, 'match_paused'); a.disconnect(); await paused; await delay(1100);
    a = await connect(identityA); assert.equal(a.resume.kind, 'state');
    assert.equal(a.resume.value.side, 'left'); assert.equal(a.resume.value.chat[0].text, 'QA chat retained');
    assert(a.resume.value.terrain.points.length > 50); assert(a.resume.value.state.n.length > 50); assert.equal(a.resume.value.pause.paused, false);
    passed.push('real socket build reload restores terrain/full metadata/chat/ownership');
    const forged = await connect({ id: identityA.id, token: '0'.repeat(64) });
    assert.equal(forged.resume.kind, 'ready'); assert.notEqual(forged.identity.id, identityA.id); assert.equal((await profile(forged)).matchesPlayed, 0);
    passed.push('wrong token cannot reclaim slot or profile');
    const takeover = event(a, 'identity_replaced'); const replacement = await connect(identityA); await takeover;
    assert.equal(replacement.resume.value.side, 'left'); a = replacement;
    passed.push('healthy tab takeover displaces old socket without forfeit');
    a.emit('player_ready'); await action(b, 'player_ready', undefined, 'phase_change', p => p.phase === 'reveal');
    const pausedReveal = event(b, 'match_paused'); a.disconnect(); await pausedReveal; await delay(1200); a = await connect(identityA);
    assert.equal(a.resume.value.phase, 'reveal'); await event(a, 'turn_start', p => p.side === 'left');
    const ball = event(a, 'gameState', p => p.n.some(body => body.label === 'projectile'));
    a.emit('fire_projectile', { angle: Math.PI / 4, power: 55 }); await ball;
    const pausedShot = event(b, 'match_paused'); a.disconnect(); await pausedShot; await delay(1000); a = await connect(identityA);
    assert.equal(a.resume.value.hasFired, true); assert.equal(a.resume.value.state.n.filter(body => body.label === 'projectile').length, 1);
    a.emit('fire_projectile', { angle: 0.5, power: 90 }); await delay(100);
    assert.equal([...a.bodies.values()].filter(body => body.label === 'projectile').length, 1);
    passed.push('reveal/mid-projectile restore preserves accepted shot and rejects duplicate fire');
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TRIGGER qa_fail BEFORE INSERT ON results BEGIN SELECT RAISE(ABORT,'QA temporary storage failure'); END;");
    const pendingSave = event(a, 'progress_saved', p => p.status === 'pending');
    b.emit('leave_room'); await pendingSave; assert.equal((await profile(a)).matchesPlayed, 0);
    const rejected = await action(forged, 'create_room', { mode: 'single' }, 'room_error'); assert.match(rejected.message, /saving/);
    const saved = event(a, 'progress_saved', p => p.status === 'saved'); db.exec('DROP TRIGGER qa_fail'); await saved;
    const finalA = await profile(a), finalB = await profile(b);
    assert.equal(finalA.matchesPlayed, 1); assert.equal(finalA.matchesWon, 1); assert.equal(finalB.matchesPlayed, 1);
    assert.equal(finalA.history[0].matchId, finalB.history[0].matchId); assert.notEqual(finalA.history[0].matchId, created.roomId);
    const claim = await a.timeout(5000).emitWithAck('claim_reward', { kind: 'checkin' }); assert.equal(claim.amount, 50);
    assert.equal((await a.timeout(5000).emitWithAck('claim_reward', { kind: 'checkin' })).amount, 0);
    assert((await a.timeout(5000).emitWithAck('claim_reward', { kind: 'forged' })).error);
    assert.equal((await a.timeout(5000).emitWithAck('get_history', {})).entries.length, 1);
    assert.equal((await forged.timeout(5000).emitWithAck('get_history', {})).entries.length, 0);
    db.close(); passed.push('failed award rolls back both players, blocks starts, retries once; claims/history isolated');
    for (const socket of sockets) socket.disconnect(); await stop(); await start();
    a = await connect(identityA); assert.equal(a.resume.kind, 'ready');
    const reopened = await profile(a); assert.equal(reopened.matchesPlayed, 1); assert.equal(reopened.rewards.embers, finalA.rewards.embers + 50);
    assert.deepEqual(reopened.unlockedAchievements, finalA.unlockedAchievements);
    passed.push('actual process restart keeps profile/history/rewards but does not pretend to restore physics');
    const solo = await connect(); const joined = await action(solo, 'create_room', { mode: 'single', difficulty: 'easy' }, 'room_joined');
    await action(solo, 'player_ready', undefined, 'phase_change', p => p.phase === 'build'); solo.disconnect();
    await delay(20500); const expired = await connect(solo.identity); assert.equal(expired.resume.kind, 'ready');
    assert.equal((await profile(expired)).matchesPlayed, 0);
    assert.notEqual(joined.roomId, undefined); passed.push('real 20-second solo expiry abandons without invented rewards');
    const report = { completedAt: new Date().toISOString(), passed, checks: passed.length };
    writeFileSync(resolve('output/v12/socket-verification.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally {
    for (const socket of sockets) socket.disconnect();
    if (server && server.exitCode === null) await stop();
}
