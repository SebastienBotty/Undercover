import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';

function connect(stub: DurableObjectStub) {
  return stub.fetch('https://do/ws', { headers: { Upgrade: 'websocket' } });
}

function waitForMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.addEventListener('message', (event) => resolve(JSON.parse(event.data as string)), { once: true });
  });
}

describe('GameRoom join lifecycle', () => {
  it('adds a new player to the room on JOIN_ROOM and broadcasts a snapshot', async () => {
    const id = env.GAME_ROOM.idFromName('TEST-JOIN-1');
    const stub = env.GAME_ROOM.get(id);

    const res = await connect(stub);
    const ws = res.webSocket!;
    ws.accept();

    const messagePromise = waitForMessage(ws);
    ws.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-1', name: 'Alice', clientId: 'c1', isHost: true }));
    const snapshot = await messagePromise;

    expect(snapshot.type).toBe('ROOM_STATE');
    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.players[0]).toMatchObject({ name: 'Alice', connected: true });
    expect(snapshot.hostId).toBe('c1');
  });

  it('rejects joining a room that a host has not created yet', async () => {
    const id = env.GAME_ROOM.idFromName('TEST-JOIN-UNKNOWN');
    const stub = env.GAME_ROOM.get(id);

    const res = await connect(stub);
    const ws = res.webSocket!;
    ws.accept();
    const messagePromise = waitForMessage(ws);
    ws.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-UNKNOWN', name: 'Bob', clientId: 'c2', isHost: false }));
    const errorMsg = await messagePromise;

    expect(errorMsg).toMatchObject({ type: 'ERROR', code: 'UNKNOWN_ROOM' });
  });

  it('rejects a duplicate name in the same room', async () => {
    const id = env.GAME_ROOM.idFromName('TEST-JOIN-2');
    const stub = env.GAME_ROOM.get(id);

    const res1 = await connect(stub);
    const ws1 = res1.webSocket!;
    ws1.accept();
    const first = waitForMessage(ws1);
    ws1.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-2', name: 'Alice', clientId: 'c1', isHost: true }));
    await first;

    const res2 = await connect(stub);
    const ws2 = res2.webSocket!;
    ws2.accept();
    const second = waitForMessage(ws2);
    ws2.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-2', name: 'Alice', clientId: 'c2', isHost: false }));
    const errorMsg = await second;

    expect(errorMsg).toMatchObject({ type: 'ERROR', code: 'NAME_TAKEN' });
  });

  it('reconnects an existing clientId instead of adding a duplicate player', async () => {
    const id = env.GAME_ROOM.idFromName('TEST-JOIN-3');
    const stub = env.GAME_ROOM.get(id);

    const res1 = await connect(stub);
    const ws1 = res1.webSocket!;
    ws1.accept();
    const first = waitForMessage(ws1);
    ws1.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-3', name: 'Alice', clientId: 'c1', isHost: true }));
    await first;
    ws1.close();

    const res2 = await connect(stub);
    const ws2 = res2.webSocket!;
    ws2.accept();
    const second = waitForMessage(ws2);
    ws2.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-3', name: 'Alice', clientId: 'c1', isHost: false }));
    const snapshot = await second;

    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.players[0].connected).toBe(true);
  });
});
