import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useGameSocket } from '@/lib/useGameSocket';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];
  closed = false;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }

  triggerOpen() {
    this.onopen?.();
  }

  triggerMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useGameSocket', () => {
  it('connects and reports status transitions', async () => {
    const { result } = renderHook(() => useGameSocket('wss://example.com/ws?code=ABCDE'));
    expect(result.current.status).toBe('connecting');

    act(() => MockWebSocket.instances[0].triggerOpen());
    await waitFor(() => expect(result.current.status).toBe('open'));
  });

  it('exposes incoming messages as lastMessage', async () => {
    const { result } = renderHook(() => useGameSocket('wss://example.com/ws?code=ABCDE'));
    act(() => MockWebSocket.instances[0].triggerOpen());
    act(() => MockWebSocket.instances[0].triggerMessage({ type: 'ROOM_STATE', phase: 'LOBBY' }));
    await waitFor(() => expect(result.current.lastMessage).toEqual({ type: 'ROOM_STATE', phase: 'LOBBY' }));
  });

  it('serializes messages sent through send()', () => {
    const { result } = renderHook(() => useGameSocket('wss://example.com/ws?code=ABCDE'));
    act(() => MockWebSocket.instances[0].triggerOpen());
    act(() => result.current.send({ type: 'JOIN_ROOM', code: 'ABCDE', name: 'Seb', clientId: 'c1' }));
    expect(JSON.parse(MockWebSocket.instances[0].sent[0])).toEqual({
      type: 'JOIN_ROOM',
      code: 'ABCDE',
      name: 'Seb',
      clientId: 'c1',
    });
  });
});
