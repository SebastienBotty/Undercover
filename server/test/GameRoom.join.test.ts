import { describe, it, expect } from 'vitest';
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

  it('rejects a reconnect that renames to a name already held by a different connected player', async () => {
    const id = env.GAME_ROOM.idFromName('TEST-JOIN-RENAME-COLLISION');
    const stub = env.GAME_ROOM.get(id);

    const resHost = await connect(stub);
    const wsHost = resHost.webSocket!;
    wsHost.accept();
    const hostJoined = waitForMessage(wsHost);
    wsHost.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-RENAME-COLLISION', name: 'Alice', clientId: 'c1', isHost: true }));
    await hostJoined;

    const resBob = await connect(stub);
    const wsBob = resBob.webSocket!;
    wsBob.accept();
    const bobJoined = waitForMessage(wsBob);
    wsBob.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-RENAME-COLLISION', name: 'Bob', clientId: 'c2', isHost: false }));
    await bobJoined;

    // c2 ("Bob") reconnects but tries to rename itself to "Alice", already held by c1.
    const resBobReconnect = await connect(stub);
    const wsBobReconnect = resBobReconnect.webSocket!;
    wsBobReconnect.accept();
    const renameAttempt = waitForMessage(wsBobReconnect);
    wsBobReconnect.send(
      JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-RENAME-COLLISION', name: 'Alice', clientId: 'c2', isHost: false }),
    );
    const errorMsg = await renameAttempt;

    expect(errorMsg).toMatchObject({ type: 'ERROR', code: 'NAME_TAKEN' });
  });

  it('rejects an 11th player when the room is full', async () => {
    const id = env.GAME_ROOM.idFromName('TEST-JOIN-FULL');
    const stub = env.GAME_ROOM.get(id);

    for (let i = 1; i <= 10; i++) {
      const res = await connect(stub);
      const ws = res.webSocket!;
      ws.accept();
      const joined = waitForMessage(ws);
      ws.send(
        JSON.stringify({
          type: 'JOIN_ROOM',
          code: 'TEST-JOIN-FULL',
          name: `Player${i}`,
          clientId: `c${i}`,
          isHost: i === 1,
        }),
      );
      await joined;
    }

    const res11 = await connect(stub);
    const ws11 = res11.webSocket!;
    ws11.accept();
    const eleventh = waitForMessage(ws11);
    ws11.send(
      JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-FULL', name: 'Player11', clientId: 'c11', isHost: false }),
    );
    const errorMsg = await eleventh;

    expect(errorMsg).toMatchObject({ type: 'ERROR', code: 'ROOM_FULL' });
  });

  it('rejects a new player joining after the game has started', async () => {
    const id = env.GAME_ROOM.idFromName('TEST-JOIN-GAME-STARTED');
    const stub = env.GAME_ROOM.get(id);

    const resA = await connect(stub);
    const wsA = resA.webSocket!;
    wsA.accept();
    const joinedA = waitForMessage(wsA);
    wsA.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-GAME-STARTED', name: 'Alice', clientId: 'a', isHost: true }));
    await joinedA;

    const resB = await connect(stub);
    const wsB = resB.webSocket!;
    wsB.accept();
    const joinedB = waitForMessage(wsB);
    const drainA1 = waitForMessage(wsA);
    wsB.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-GAME-STARTED', name: 'Bob', clientId: 'b', isHost: false }));
    await Promise.all([joinedB, drainA1]);

    const resC = await connect(stub);
    const wsC = resC.webSocket!;
    wsC.accept();
    const joinedC = waitForMessage(wsC);
    const drainA2 = waitForMessage(wsA);
    const drainB1 = waitForMessage(wsB);
    wsC.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-GAME-STARTED', name: 'Carl', clientId: 'c', isHost: false }));
    await Promise.all([joinedC, drainA2, drainB1]);

    const started = Promise.all([waitForMessage(wsA), waitForMessage(wsB), waitForMessage(wsC)]);
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false },
      })
    );
    const [snapA] = await started;
    expect(snapA.phase).toBe('ROLE_REVEAL');

    const resD = await connect(stub);
    const wsD = resD.webSocket!;
    wsD.accept();
    const errorPromise = waitForMessage(wsD);
    wsD.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TEST-JOIN-GAME-STARTED', name: 'Dora', clientId: 'd', isHost: false }));
    const errorMsg = await errorPromise;

    expect(errorMsg).toMatchObject({ type: 'ERROR', code: 'GAME_STARTED' });
  });
});
