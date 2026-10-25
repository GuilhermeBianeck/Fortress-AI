import { afterEach, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';
import { GameSession } from '../GameSession';
import * as gemini from '../../ai/gemini';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it.each(['pause', 'destroy'] as const)('ignores a late paid AI response after %s and clears its heartbeat', async interruption => {
    vi.useFakeTimers();
    let finish: (value: Awaited<ReturnType<typeof gemini.generateFortress>>) => void = () => {};
    vi.spyOn(gemini, 'generateFortress').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const emit = vi.fn(), session = new GameSession({ to: () => ({ emit }) } as unknown as Server, 'AI-test', [
        { socketId: 'human', name: 'Player', side: 'left', ready: true }, { socketId: 'other', name: 'Other', side: 'right', ready: true },
    ], 42);
    const socket = { id: 'human', emit } as unknown as Socket;
    session.getStateMachine().startBuildPhase();
    const before = session.getFullState().n.length;
    const pending = session.handleRequestBuild(socket, { apiKey: 'not-a-real-key', prompt: 'castle' });
    session[interruption]();
    finish({ thought_chain: 'test', bodies: [{ x: 400, y: 400, shape: 'rectangle', material: 'stone', dimensions: [30, 30], angle: 0 }] });
    await pending;
    expect(session.getFullState().n).toHaveLength(before); expect(vi.getTimerCount()).toBe(0);
    expect(emit.mock.calls.filter(c => c[0] === 'build_success')).toHaveLength(0);
    expect(session.buildWasInterrupted('left')).toBe(true); session.destroy();
});
