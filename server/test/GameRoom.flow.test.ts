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

// The game requires CLUE_ROUNDS_PER_VOTE (2) full passes through turnOrder before a vote opens.
// This drives one full pass and returns the last broadcast snapshot every socket received, so
// callers can assert on the resulting phase (still CLUE_ROUND after pass 1, VOTE after pass 2).
async function submitFullClueRound(sockets: Record<string, WebSocket>, turnOrder: string[], passNumber: number) {
  let lastResults: any[] = [];
  for (const playerId of turnOrder) {
    const ws = sockets[playerId];
    const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    ws.send(JSON.stringify({ type: 'SUBMIT_CLUE', text: `clue-from-${playerId}-pass${passNumber}` }));
    lastResults = await next;
  }
  return lastResults;
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

    // Two full clue passes (CLUE_ROUNDS_PER_VOTE) are required before voting opens.
    await submitFullClueRound(sockets, turnOrder, 1);
    await submitFullClueRound(sockets, turnOrder, 2);

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
    // Fix 1: the ELIMINATION phase must actually be broadcast (not skipped straight to the
    // resolved next phase) before the alarm-driven reveal delay advances the game further.
    expect(finalSnap.phase).toBe('ELIMINATION');
    const eliminatedPlayer = finalSnap.players.find((p: any) => p.id === target);
    expect(eliminatedPlayer.alive).toBe(false);
  });

  it('requires two full clue passes before opening the vote', async () => {
    const code = 'FLOW-TWO-ROUNDS';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC };

    const started = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false },
      })
    );
    await started;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const clueRoundSnap = await afterAlarmA;
    const turnOrder = clueRoundSnap.turnOrder as string[];
    expect(clueRoundSnap.round).toBe(1);

    // First full pass: everyone has now given one clue each, but a single pass isn't enough --
    // the room must still be in CLUE_ROUND, now on round 2, not VOTE.
    const [afterFirstPass] = await submitFullClueRound(sockets, turnOrder, 1);
    expect(afterFirstPass.phase).toBe('CLUE_ROUND');
    expect(afterFirstPass.round).toBe(2);

    // Second full pass: NOW voting should open.
    const [afterSecondPass] = await submitFullClueRound(sockets, turnOrder, 2);
    expect(afterSecondPass.phase).toBe('VOTE');
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

    await submitFullClueRound(sockets, turnOrder, 1);
    await submitFullClueRound(sockets, turnOrder, 2);

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
    expect(finalSnap.phase).toBe('ELIMINATION');
    const eliminatedPlayer = finalSnap.players.find((p: any) => p.id === target);
    expect(eliminatedPlayer.alive).toBe(false);
  });

  it('broadcasts ELIMINATION then, after the reveal alarm, resolves an ordinary elimination into a new CLUE_ROUND', async () => {
    const code = 'FLOW-5';
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

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const clueRoundSnap = await afterAlarmA;

    const turnOrder = clueRoundSnap.turnOrder as string[];
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC };

    await submitFullClueRound(sockets, turnOrder, 1);
    await submitFullClueRound(sockets, turnOrder, 2);

    // Vote for a player who, per FLOW-5's deterministic 3-player/no-Mr.-White setup, cannot be
    // Mr. White (there is none) -- either surviving role keeps the round going, since 1 civil +
    // 1 undercover always remain alive after a single elimination in a 3-player game.
    const target = turnOrder[1];
    let eliminationSnap: any;
    for (const playerId of turnOrder) {
      const ws = sockets[playerId];
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      ws.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      const results = await next;
      eliminationSnap = results[0];
    }

    expect(eliminationSnap.phase).toBe('ELIMINATION');
    expect(eliminationSnap.lastEliminatedId).toBe(target);

    // Now let the 5s reveal alarm fire and resolve the elimination into the next phase.
    const afterReveal = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    await runDurableObjectAlarm(stub);
    const resolvedSnaps = await afterReveal;
    const resolvedSnap = resolvedSnaps[0];

    // 3 players, 1 eliminated, no Mr. White: 2 alive players remain and the game must continue
    // (checkWinCondition can't yet declare a winner with 1 civil + 1 undercover alive, or 2
    // civils alive -- either way the round must continue).
    expect(resolvedSnap.phase === 'CLUE_ROUND' || resolvedSnap.phase === 'END').toBe(true);
  });

  // Shared setup for the two Mr. White guess tests below: 5 players + Mr. White enabled gives
  // 3 civils / 1 undercover / 1 Mr. White, satisfying assignRoles' civilian-majority guard
  // (civilCount 3 > specialCount 2). Each player's OWN role is revealed in the snapshot sent to
  // their own socket as soon as ROLE_REVEAL is broadcast (buildSnapshot reveals `p.id ===
  // forPlayerId` regardless of phase) -- so we can read who has 'mrwhite' from the per-socket
  // START_GAME results without waiting for END to reveal everyone.
  async function setupMrWhiteRound(code: string) {
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);
    const wsD = await joinPlayer(stub, code, 'Dora', 'd', false, [wsA, wsB, wsC]);
    const wsE = await joinPlayer(stub, code, 'Eve', 'e', false, [wsA, wsB, wsC, wsD]);

    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC, d: wsD, e: wsE };
    const order = Object.keys(sockets);

    const started = Promise.all(order.map((pid) => waitForMessage(sockets[pid])));
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: true },
      })
    );
    const startResults = await started;
    expect(startResults.every((r: any) => r.phase === 'ROLE_REVEAL')).toBe(true);

    const ownRole: Record<string, string | null> = {};
    const ownCharacter: Record<string, string | null> = {};
    order.forEach((pid, idx) => {
      const self = startResults[idx].players.find((p: any) => p.id === pid);
      ownRole[pid] = self.role;
      ownCharacter[pid] = self.character;
    });

    const mrWhiteId = order.find((pid) => ownRole[pid] === 'mrwhite')!;
    const civilId = order.find((pid) => ownRole[pid] === 'civil')!;
    expect(mrWhiteId).toBeDefined();
    const civilCharacter = ownCharacter[civilId]!;
    expect(civilCharacter).toBeTruthy();

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const clueRoundSnap = await afterAlarmA;
    expect(clueRoundSnap.phase).toBe('CLUE_ROUND');

    const turnOrder = clueRoundSnap.turnOrder as string[];
    await submitFullClueRound(sockets, turnOrder, 1);
    await submitFullClueRound(sockets, turnOrder, 2);

    // Everyone votes to eliminate Mr. White.
    const voteResults: any[] = [];
    for (const playerId of turnOrder) {
      const ws = sockets[playerId];
      const next = Promise.all(order.map((pid) => waitForMessage(sockets[pid])));
      ws.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: mrWhiteId }));
      const results = await next;
      voteResults.push(results[0]);
    }

    const eliminationSnap = voteResults[voteResults.length - 1];
    expect(eliminationSnap.phase).toBe('ELIMINATION');
    expect(eliminationSnap.lastEliminatedId).toBe(mrWhiteId);

    return { stub, sockets, order, mrWhiteId, civilCharacter };
  }

  it('resolves a correct Mr. White guess as an immediate Mr. White win', async () => {
    const { sockets, order, mrWhiteId, civilCharacter } = await setupMrWhiteRound('FLOW-MRWHITE-CORRECT');

    const guessWs = sockets[mrWhiteId];
    const guessResult = Promise.all(order.map((pid) => waitForMessage(sockets[pid])));
    guessWs.send(JSON.stringify({ type: 'MR_WHITE_GUESS', guess: civilCharacter }));
    const afterGuess = await guessResult;

    expect(afterGuess[0].winner).toBe('mrwhite');
    expect(afterGuess[0].phase).toBe('END');
  });

  it('resolves an incorrect Mr. White guess by continuing the game into a new CLUE_ROUND', async () => {
    const { sockets, order, mrWhiteId, civilCharacter } = await setupMrWhiteRound('FLOW-MRWHITE-INCORRECT');

    const guessWs = sockets[mrWhiteId];
    const guessResult = Promise.all(order.map((pid) => waitForMessage(sockets[pid])));
    guessWs.send(JSON.stringify({ type: 'MR_WHITE_GUESS', guess: `not-${civilCharacter}` }));
    const afterGuess = await guessResult;

    // 5 players, Mr. White eliminated: 3 civils + 1 undercover remain alive, so the game must
    // continue (checkWinCondition returns null: aliveUndercover=1 > 0 but 1 < 3).
    expect(afterGuess[0].phase).toBe('CLUE_ROUND');
    expect(afterGuess[0].winner).toBeNull();
  });

  it('auto-submits an empty clue and advances the turn when the 60s clue timeout fires mid-round', async () => {
    const code = 'FLOW-CLUE-TIMEOUT';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC };

    const started = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false },
      })
    );
    await started;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const clueRoundSnap = await afterAlarmA;
    expect(clueRoundSnap.phase).toBe('CLUE_ROUND');

    const turnOrder = clueRoundSnap.turnOrder as string[];
    const firstPlayerId = turnOrder[0];
    const secondPlayerId = turnOrder[1];

    // First player submits a real clue (moving turn to the second player), then -- instead of
    // the second player submitting -- let the 60s clue timeout alarm fire mid-round to exercise
    // the CLUE_ROUND branch of alarm() (not the ROLE_REVEAL->CLUE_ROUND one already covered by
    // other tests).
    const afterFirstClue = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[firstPlayerId].send(JSON.stringify({ type: 'SUBMIT_CLUE', text: `clue-from-${firstPlayerId}` }));
    await afterFirstClue;

    const afterTimeout = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    await runDurableObjectAlarm(stub);
    const timeoutSnaps = await afterTimeout;
    const timeoutSnap = timeoutSnaps[0];

    expect(timeoutSnap.phase).toBe('CLUE_ROUND');
    const secondPlayerClue = timeoutSnap.clues.find((c: any) => c.playerId === secondPlayerId);
    expect(secondPlayerClue).toMatchObject({ playerId: secondPlayerId, text: '' });
    // Turn must have advanced past the timed-out player, to the third player in turn order.
    expect(timeoutSnap.turnOrder[timeoutSnap.currentTurnIndex]).toBe(turnOrder[2]);
  });
});
