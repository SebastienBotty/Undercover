import { describe, it, expect } from 'vitest';
import { env, runDurableObjectAlarm } from 'cloudflare:test';

function connect(stub: DurableObjectStub) {
  return stub.fetch('https://do/ws', { headers: { Upgrade: 'websocket' } });
}

function waitForMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.addEventListener('message', (event) => resolve(JSON.parse(event.data as string)), { once: true });
  });
}

// NOTE: joining broadcasts the updated room snapshot to every already-connected socket (Task 7
// behaviour, unchanged here). Since each test keeps long-lived sockets across many actions, any
// broadcast a socket doesn't immediately drain stays queued and is delivered to the *next*
// `waitForMessage` call on that socket (delivery is FIFO but not tied to real wall-clock time) —
// so `othersToDrain` must consume the fan-out broadcast on every previously-joined socket in the
// same tick as this join, keeping every socket's backlog at zero before the game-flow assertions.
async function joinPlayer(
  stub: DurableObjectStub,
  code: string,
  name: string,
  clientId: string,
  isHost = false,
  othersToDrain: WebSocket[] = []
) {
  const res = await connect(stub);
  const ws = res.webSocket!;
  ws.accept();
  const snapshotPromise = waitForMessage(ws);
  const drainPromises = othersToDrain.map((s) => waitForMessage(s));
  ws.send(JSON.stringify({ type: 'JOIN_ROOM', code, name, clientId, isHost }));
  await Promise.all([snapshotPromise, ...drainPromises]);
  return ws;
}

describe('GameRoom game flow', () => {
  it('runs a full 3-player round without Mr. White', async () => {
    const code = 'FLOW-1';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);

    const started = Promise.all([waitForMessage(wsA), waitForMessage(wsB), waitForMessage(wsC)]);
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false },
      })
    );
    const [snapA] = await started;
    expect(snapA.phase).toBe('ROLE_REVEAL');

    const id2 = env.GAME_ROOM.idFromName(code);
    const stub2 = env.GAME_ROOM.get(id2);
    // Attach the listener BEFORE triggering the alarm: the alarm handler's broadcast() call sends
    // its message as soon as the alarm runs, and a socket's `message` event only fires to whatever
    // listener is attached at that moment (nothing replays it afterwards) — so waiting to attach
    // the listener until after `runDurableObjectAlarm` resolves would miss the broadcast entirely.
    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub2);
    const clueRoundSnap = await afterAlarmA;
    expect(clueRoundSnap.phase).toBe('CLUE_ROUND');

    const players = clueRoundSnap.players as { id: string; name: string }[];
    const turnOrder = clueRoundSnap.turnOrder as string[];
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC };

    for (const playerId of turnOrder) {
      const ws = sockets[playerId];
      const next = Promise.all(
        Object.values(sockets).map((s) => waitForMessage(s))
      );
      ws.send(JSON.stringify({ type: 'SUBMIT_CLUE', text: `clue-from-${playerId}` }));
      await next;
    }

    // Now in VOTE phase: everyone votes to eliminate player 'b' or 'c' etc. Vote for whichever
    // player is NOT the last one to have sent SUBMIT_CLUE is irrelevant here — just check the
    // vote flow resolves. Vote all for 'a' being safe is wrong if 'a' must survive; instead vote
    // for the second player in turnOrder to keep the test deterministic regardless of role assignment.
    const target = turnOrder[1];
    const voteResults: any[] = [];
    for (const playerId of turnOrder) {
      const ws = sockets[playerId];
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      ws.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      const results = await next;
      voteResults.push(results[0]);
    }

    const finalSnap = voteResults[voteResults.length - 1];
    expect(['ELIMINATION', 'END', 'CLUE_ROUND']).toContain(finalSnap.phase);
    const eliminatedPlayer = finalSnap.players.find((p: any) => p.id === target);
    expect(eliminatedPlayer.alive).toBe(false);
  });

  it('rejects SUBMIT_CLUE from a player who is not the current turn', async () => {
    const code = 'FLOW-2';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);

    const started = waitForMessage(wsA);
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false },
      })
    );
    await started;

    const id2 = env.GAME_ROOM.idFromName(code);
    const stub2 = env.GAME_ROOM.get(id2);
    const afterAlarm = waitForMessage(wsA);
    await runDurableObjectAlarm(stub2);
    const clueRoundSnap = await afterAlarm;

    const notCurrentPlayerWs = clueRoundSnap.turnOrder[0] === 'a' ? wsB : wsA;
    const errorPromise = waitForMessage(notCurrentPlayerWs);
    notCurrentPlayerWs.send(JSON.stringify({ type: 'SUBMIT_CLUE', text: 'out of turn' }));
    const error = await errorPromise;
    expect(error).toMatchObject({ type: 'ERROR', code: 'NOT_YOUR_TURN' });
  });

  it('rejects START_GAME when the settings cannot guarantee a civilian majority', async () => {
    const code = 'FLOW-3';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);

    // 3 players + mrWhiteEnabled: true => 1 undercover + 1 Mr. White + only 1 civil left,
    // which fails assignRoles' civilian-majority guard (civilCount <= specialCount).
    const errorPromise = waitForMessage(wsA);
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: true },
      })
    );
    const error = await errorPromise;
    expect(error).toMatchObject({ type: 'ERROR', code: 'CANNOT_START_GAME' });

    // The room must not have been half-mutated by the failed attempt: a valid START_GAME
    // right afterwards should still succeed normally.
    const started = Promise.all([waitForMessage(wsA), waitForMessage(wsB), waitForMessage(wsC)]);
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false },
      })
    );
    const [snapA] = await started;
    expect(snapA.phase).toBe('ROLE_REVEAL');
  });

  it('rejects SUBMIT_VOTE targeting a nonexistent player without recording the vote', async () => {
    const code = 'FLOW-4';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);

    const started = Promise.all([waitForMessage(wsA), waitForMessage(wsB), waitForMessage(wsC)]);
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false },
      })
    );
    await started;

    const id2 = env.GAME_ROOM.idFromName(code);
    const stub2 = env.GAME_ROOM.get(id2);
    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub2);
    const clueRoundSnap = await afterAlarmA;

    const turnOrder = clueRoundSnap.turnOrder as string[];
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC };

    for (const playerId of turnOrder) {
      const ws = sockets[playerId];
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      ws.send(JSON.stringify({ type: 'SUBMIT_CLUE', text: `clue-from-${playerId}` }));
      await next;
    }

    // Now in VOTE phase. First player attempts to vote for a player id that doesn't exist.
    const firstVoterWs = sockets[turnOrder[0]];
    const errorPromise = waitForMessage(firstVoterWs);
    firstVoterWs.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: 'does-not-exist' }));
    const error = await errorPromise;
    expect(error).toMatchObject({ type: 'ERROR', code: 'INVALID_VOTE_TARGET' });

    // The bogus vote must not have been recorded: a full, valid round of voting (including a
    // real vote from the same first player) must still resolve the round normally afterwards.
    const target = turnOrder[1];
    const voteResults: any[] = [];
    for (const playerId of turnOrder) {
      const ws = sockets[playerId];
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      ws.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      const results = await next;
      voteResults.push(results[0]);
    }

    const finalSnap = voteResults[voteResults.length - 1];
    expect(['ELIMINATION', 'END', 'CLUE_ROUND']).toContain(finalSnap.phase);
    const eliminatedPlayer = finalSnap.players.find((p: any) => p.id === target);
    expect(eliminatedPlayer.alive).toBe(false);
  });
});
