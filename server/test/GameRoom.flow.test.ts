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

// Votes only resolve when the 2-minute vote timer expires (not as soon as everyone has voted),
// so every test that needs the elimination to actually happen fires the alarm and waits for the
// resulting broadcast.
async function resolveVoteTimer(stub: DurableObjectStub, sockets: Record<string, WebSocket>) {
  const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
  await runDurableObjectAlarm(stub);
  return next;
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
    // Every anime character carries its source work: self-view gets the label, other players get null.
    const selfPlayer = snapA.players.find((p: any) => p.id === 'a');
    expect(typeof selfPlayer.characterSeries).toBe('string');
    expect(selfPlayer.characterSeries.length).toBeGreaterThan(0);
    const otherPlayer = snapA.players.find((p: any) => p.id !== 'a');
    expect(otherPlayer.characterSeries).toBeNull();

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
    for (const playerId of turnOrder) {
      const ws = sockets[playerId];
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      ws.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      await next;
    }

    const voteSnaps = await resolveVoteTimer(stub, sockets);
    const finalSnap = voteSnaps[0];
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

  it('passes a player\'s clue turn immediately when they disconnect mid-turn, instead of eliminating them', async () => {
    const code = 'FLOW-DISCONNECT-CURRENT-TURN';
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
    const currentPlayerId = turnOrder[clueRoundSnap.currentTurnIndex];
    const others = Object.values(sockets).filter((s) => s !== sockets[currentPlayerId]);

    const afterClose = Promise.all(others.map((s) => waitForMessage(s)));
    sockets[currentPlayerId].close();
    const [snapshot] = await afterClose;

    expect(snapshot.phase).toBe('CLUE_ROUND');
    const skippedPlayer = snapshot.players.find((p: any) => p.id === currentPlayerId);
    expect(skippedPlayer.connected).toBe(false);
    expect(skippedPlayer.alive).toBe(true); // passed, not eliminated
    expect(snapshot.turnOrder[snapshot.currentTurnIndex]).not.toBe(currentPlayerId);
    const recordedClue = snapshot.clues.find(
      (c: any) => c.playerId === currentPlayerId && c.round === clueRoundSnap.round
    );
    expect(recordedClue?.text).toBe('');
  });

  it('skips a disconnected player\'s upcoming turn the moment the rotation reaches it, without waiting for the timer', async () => {
    const code = 'FLOW-DISCONNECT-UPCOMING-TURN';
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
    const currentPlayerId = turnOrder[clueRoundSnap.currentTurnIndex];
    const nextPlayerId = turnOrder[(clueRoundSnap.currentTurnIndex + 1) % turnOrder.length];
    const thirdPlayerId = turnOrder.find((pid) => pid !== currentPlayerId && pid !== nextPlayerId)!;

    // The *next* player in line disconnects while it's still someone else's turn -- not their
    // turn yet, so nothing about the rotation should react immediately.
    const othersOfDrop = Object.values(sockets).filter((s) => s !== sockets[nextPlayerId]);
    const afterDrop = Promise.all(othersOfDrop.map((s) => waitForMessage(s)));
    sockets[nextPlayerId].close();
    await afterDrop;

    // The current player submits their clue -- the rotation should skip straight past the
    // disconnected player onto the third one, recording an empty clue for the one skipped.
    const remaining = Object.values(sockets).filter((s) => s !== sockets[nextPlayerId]);
    const afterClue = Promise.all(remaining.map((s) => waitForMessage(s)));
    sockets[currentPlayerId].send(JSON.stringify({ type: 'SUBMIT_CLUE', text: 'hello' }));
    const [snapshot] = await afterClue;

    expect(snapshot.turnOrder[snapshot.currentTurnIndex]).toBe(thirdPlayerId);
    const skippedClue = snapshot.clues.find(
      (c: any) => c.playerId === nextPlayerId && c.round === clueRoundSnap.round
    );
    expect(skippedClue?.text).toBe('');
    const skippedPlayer = snapshot.players.find((p: any) => p.id === nextPlayerId);
    expect(skippedPlayer.alive).toBe(true);
  });

  it('rejects START_GAME with Mr. White enabled when there are fewer than 5 players', async () => {
    const code = 'FLOW-3';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);

    // Mr. White needs at least 5 players (otherwise a civilian majority isn't possible) --
    // GameRoom rejects this explicitly before even attempting role assignment.
    const errorPromise = waitForMessage(wsA);
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: true },
      })
    );
    const error = await errorPromise;
    expect(error).toMatchObject({ type: 'ERROR', code: 'MR_WHITE_MIN_PLAYERS' });

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

  it('assigns random, distinct notes instead of characters when starting a note-mode game', async () => {
    const code = 'FLOW-NOTE-START';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC };

    const started = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(
      JSON.stringify({
        // The host cannot choose civilNote/undercoverNote -- the server always draws them at
        // random, so any value sent here is ignored.
        type: 'START_GAME',
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note' },
      })
    );
    const snaps = await started;

    const { civilNote, undercoverNote } = snaps[0].settings;
    expect(civilNote).not.toBe(undercoverNote);
    const gap = Math.abs(civilNote - undercoverNote);
    expect(gap).toBeGreaterThanOrEqual(2);
    expect(gap).toBeLessThanOrEqual(6);
    for (const note of [civilNote, undercoverNote]) {
      expect(note).toBeGreaterThanOrEqual(0);
      expect(note).toBeLessThanOrEqual(20);
    }

    for (const [playerId, snap] of Object.entries({ a: snaps[0], b: snaps[1], c: snaps[2] })) {
      expect(snap.phase).toBe('ROLE_REVEAL');
      expect(snap.settings.civilNote).toBe(civilNote);
      expect(snap.settings.undercoverNote).toBe(undercoverNote);
      const self = snap.players.find((p: any) => p.id === playerId);
      expect(self.character).toBeNull();
      expect([civilNote, undercoverNote]).toContain(self.note);
    }
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
    for (const playerId of turnOrder) {
      const ws = sockets[playerId];
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      ws.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      await next;
    }

    const voteSnaps = await resolveVoteTimer(stub, sockets);
    const finalSnap = voteSnaps[0];
    expect(finalSnap.phase).toBe('ELIMINATION');
    const eliminatedPlayer = finalSnap.players.find((p: any) => p.id === target);
    expect(eliminatedPlayer.alive).toBe(false);
  });

  it('does not resolve the vote until the 2-minute timer expires, even once every alive player has voted', async () => {
    const code = 'FLOW-VOTE-TIMER';
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

    await submitFullClueRound(sockets, turnOrder, 1);
    const voteSnaps = await submitFullClueRound(sockets, turnOrder, 2);
    expect(voteSnaps[0].phase).toBe('VOTE');
    expect(voteSnaps[0].turnDeadline).toEqual(expect.any(Number)); // the 2-minute window is now running

    const target = turnOrder[1];
    let lastVoteSnap: any;
    for (const playerId of turnOrder) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[playerId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      [lastVoteSnap] = await next;
    }
    // Every alive player has now voted for the same target, but the room stays in VOTE --
    // resolution only happens when the timer fires (see the next assertion).
    expect(lastVoteSnap.phase).toBe('VOTE');
    expect(lastVoteSnap.turnDeadline).toEqual(expect.any(Number));

    const eliminationSnaps = await resolveVoteTimer(stub, sockets);
    expect(eliminationSnaps[0].phase).toBe('ELIMINATION');
    expect(eliminationSnaps[0].lastEliminatedId).toBe(target);
  });

  it('lets a player abstain, and their abstention does not count toward any candidate', async () => {
    const code = 'FLOW-VOTE-ABSTAIN';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);
    const wsD = await joinPlayer(stub, code, 'Dora', 'd', false, [wsA, wsB, wsC]);
    const wsE = await joinPlayer(stub, code, 'Eve', 'e', false, [wsA, wsB, wsC, wsD]);
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC, d: wsD, e: wsE };

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

    await submitFullClueRound(sockets, turnOrder, 1);
    const voteSnaps = await submitFullClueRound(sockets, turnOrder, 2);
    expect(voteSnaps[0].phase).toBe('VOTE');

    // a, d and e vote for b (3 votes -- an absolute majority of the 5 alive players); b votes for
    // a (1 vote, not enough to matter either way); c abstains. Confirms the abstention isn't
    // tallied toward anyone: with 5 alive, only b's 3 votes clear the strict-majority bar.
    const votes: [string, string | null][] = [
      ['a', 'b'],
      ['b', 'a'],
      ['c', null],
      ['d', 'b'],
      ['e', 'b'],
    ];
    for (const [voterId, targetId] of votes) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId }));
      await next;
    }

    const eliminationSnaps = await resolveVoteTimer(stub, sockets);
    expect(eliminationSnaps[0].phase).toBe('ELIMINATION');
    expect(eliminationSnaps[0].lastEliminatedId).toBe('b');
  });

  it('eliminates a lone leader with just 1 vote out of 4 alive players (plurality, no majority required)', async () => {
    const code = 'FLOW-VOTE-NO-MAJORITY';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);
    const wsD = await joinPlayer(stub, code, 'Dora', 'd', false, [wsA, wsB, wsC]);
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC, d: wsD };

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

    await submitFullClueRound(sockets, turnOrder, 1);
    const voteSnaps = await submitFullClueRound(sockets, turnOrder, 2);
    expect(voteSnaps[0].phase).toBe('VOTE');

    // Only a votes, for b; b, c and d all abstain. b only has 1 of the 4 alive players behind
    // them -- nowhere near a majority -- but plurality no longer requires one: the lone leader
    // still gets eliminated outright.
    const target = 'b';
    const votes: [string, string | null][] = [
      ['a', target],
      ['b', null],
      ['c', null],
      ['d', null],
    ];
    for (const [voterId, targetId] of votes) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId }));
      await next;
    }

    const eliminationSnaps = await resolveVoteTimer(stub, sockets);
    expect(eliminationSnaps[0].phase).toBe('ELIMINATION');
    expect(eliminationSnaps[0].lastEliminatedId).toBe(target);
    expect(eliminationSnaps[0].players.find((p: any) => p.id === target).alive).toBe(false);
  });

  it('resolves with no elimination when every alive player abstains', async () => {
    const code = 'FLOW-VOTE-ALL-ABSTAIN';
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

    await submitFullClueRound(sockets, turnOrder, 1);
    await submitFullClueRound(sockets, turnOrder, 2);

    for (const playerId of turnOrder) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[playerId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: null }));
      await next;
    }

    // No elimination still gets a brief ELIMINATION reveal (with a reason) before the room moves
    // on, exactly like a real elimination does -- it isn't skipped straight to the next phase.
    const noElimSnaps = await resolveVoteTimer(stub, sockets);
    expect(noElimSnaps[0].phase).toBe('ELIMINATION');
    expect(noElimSnaps[0].lastEliminatedId).toBeNull();
    expect(noElimSnaps[0].noEliminationReason).toBe('no_votes');

    const resolvedSnaps = await resolveVoteTimer(stub, sockets);
    expect(resolvedSnaps[0].lastEliminatedId).toBeNull();
    expect(resolvedSnaps[0].phase).toBe('CLUE_ROUND');
    expect(resolvedSnaps[0].players.every((p: any) => p.alive)).toBe(true);
  });

  it('broadcasts a live count of how many alive players have voted, and arms a short grace deadline once everyone has, ending the vote before the main timer expires', async () => {
    const code = 'FLOW-VOTE-LIVE-COUNT';
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

    await submitFullClueRound(sockets, turnOrder, 1);
    const voteSnaps = await submitFullClueRound(sockets, turnOrder, 2);
    expect(voteSnaps[0].votedCount).toBe(0);
    expect(voteSnaps[0].allVotedDeadline).toBeNull();
    const mainDeadline = voteSnaps[0].turnDeadline as number;

    const target = turnOrder[1];
    let lastSnap: any;
    for (const [i, playerId] of turnOrder.entries()) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[playerId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      [lastSnap] = await next;
      expect(lastSnap.votedCount).toBe(i + 1); // live count grows one vote at a time
    }

    // Every alive player has voted: a short grace deadline is armed, well before the still-running
    // main vote timer -- and it's what actually governs resolution, not the main timer.
    expect(lastSnap.phase).toBe('VOTE');
    expect(lastSnap.allVotedDeadline).toEqual(expect.any(Number));
    expect(lastSnap.allVotedDeadline).toBeLessThan(mainDeadline);

    const [resolvedSnap] = await resolveVoteTimer(stub, sockets);
    expect(resolvedSnap.phase).toBe('ELIMINATION');
    expect(resolvedSnap.lastEliminatedId).toBe(target);
  });

  it('retracting a vote after everyone had voted cancels the imminent early resolution', async () => {
    const code = 'FLOW-VOTE-RETRACT';
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

    await submitFullClueRound(sockets, turnOrder, 1);
    await submitFullClueRound(sockets, turnOrder, 2);

    const target = turnOrder[1];
    let lastSnap: any;
    for (const playerId of turnOrder) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[playerId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      [lastSnap] = await next;
    }
    expect(lastSnap.allVotedDeadline).toEqual(expect.any(Number));

    const afterRetract = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[turnOrder[0]].send(JSON.stringify({ type: 'RETRACT_VOTE' }));
    const [retractSnap] = await afterRetract;
    expect(retractSnap.phase).toBe('VOTE');
    expect(retractSnap.votedCount).toBe(turnOrder.length - 1);
    expect(retractSnap.allVotedDeadline).toBeNull();

    // Re-vote to complete it again, then fire whatever alarm is armed -- confirms the room is
    // still a normal, resolvable VOTE phase after the retraction, not stuck.
    const revote = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[turnOrder[0]].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
    await revote;
    const [resolvedSnap] = await resolveVoteTimer(stub, sockets);
    expect(resolvedSnap.phase).toBe('ELIMINATION');
    expect(resolvedSnap.lastEliminatedId).toBe(target);
  });

  it("changing a vote after everyone had voted resets the grace countdown", async () => {
    const code = 'FLOW-VOTE-RESET-GRACE';
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

    await submitFullClueRound(sockets, turnOrder, 1);
    await submitFullClueRound(sockets, turnOrder, 2);

    let lastSnap: any;
    for (const playerId of turnOrder) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[playerId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: turnOrder[1] }));
      [lastSnap] = await next;
    }
    const firstDeadline = lastSnap.allVotedDeadline as number;
    expect(firstDeadline).toEqual(expect.any(Number));

    // Everyone had already voted -- switching a vote to a different target still counts as
    // "everyone voted", but it must restart the 3s grace countdown rather than leaving it be.
    const switched = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[turnOrder[0]].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: turnOrder[2] }));
    const [switchedSnap] = await switched;
    expect(switchedSnap.phase).toBe('VOTE');
    expect(switchedSnap.votedCount).toBe(turnOrder.length);
    expect(switchedSnap.allVotedDeadline).toEqual(expect.any(Number));
    expect(switchedSnap.allVotedDeadline).toBeGreaterThanOrEqual(firstDeadline);
  });

  it('resolves the vote shortly after every alive player has voted when the host disables the vote timer', async () => {
    const code = 'FLOW-VOTE-NO-TIMER';
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
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false, voteTimerEnabled: false },
      })
    );
    await started;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const clueRoundSnap = await afterAlarmA;
    const turnOrder = clueRoundSnap.turnOrder as string[];

    await submitFullClueRound(sockets, turnOrder, 1);
    const voteSnaps = await submitFullClueRound(sockets, turnOrder, 2);
    expect(voteSnaps[0].phase).toBe('VOTE');
    expect(voteSnaps[0].turnDeadline).toBeNull(); // no timer running -- confirms voteTimerEnabled: false took effect

    const target = turnOrder[1];
    let lastSnap: any;
    for (const playerId of turnOrder) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[playerId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      [lastSnap] = await next;
    }
    // No main timer running, but the last vote still only arms the ALL_VOTED_GRACE_MS grace
    // alarm rather than resolving synchronously -- still VOTE until that alarm is fired.
    expect(lastSnap.phase).toBe('VOTE');
    expect(lastSnap.votedCount).toBe(turnOrder.length);
    expect(lastSnap.allVotedDeadline).not.toBeNull();

    const [resolvedSnap] = await resolveVoteTimer(stub, sockets);
    expect(resolvedSnap.phase).toBe('ELIMINATION');
    expect(resolvedSnap.lastEliminatedId).toBe(target);
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
    for (const playerId of turnOrder) {
      const ws = sockets[playerId];
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      ws.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      await next;
    }

    const voteSnaps = await resolveVoteTimer(stub, sockets);
    const eliminationSnap = voteSnaps[0];
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
    for (const playerId of turnOrder) {
      const ws = sockets[playerId];
      const next = Promise.all(order.map((pid) => waitForMessage(sockets[pid])));
      ws.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: mrWhiteId }));
      await next;
    }

    const voteSnaps = await resolveVoteTimer(stub, sockets);
    const eliminationSnap = voteSnaps[0];
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

  it('does not leave a stale alarm pending after Mr. White guesses wrong with the clue timer disabled', async () => {
    // Regression test: enterEliminationPhase always sets a 60s alarm for Mr. White's guess
    // window, regardless of clueTimerEnabled. If Mr. White answers before that alarm fires and
    // the game continues with the clue timer disabled, scheduleClueTimeout used to only null out
    // turnDeadline without cancelling the still-pending 60s alarm -- which would later fire and
    // hit whatever phase the room was in by then (here, CLUE_ROUND's alarm() branch), silently
    // eliminating the current-turn player for no reason.
    const code = 'FLOW-STALE-ALARM';
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
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: true, clueTimerEnabled: false },
      })
    );
    const startResults = await started;
    const ownRole: Record<string, string | null> = {};
    order.forEach((pid, idx) => {
      ownRole[pid] = startResults[idx].players.find((p: any) => p.id === pid).role;
    });
    const mrWhiteId = order.find((pid) => ownRole[pid] === 'mrwhite')!;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const clueRoundSnap = await afterAlarmA;
    expect(clueRoundSnap.turnDeadline).toBeNull(); // no timer -- confirms clueTimerEnabled: false took effect

    const turnOrder = clueRoundSnap.turnOrder as string[];
    await submitFullClueRound(sockets, turnOrder, 1);
    await submitFullClueRound(sockets, turnOrder, 2);

    // Everyone votes to eliminate Mr. White; resolving the vote timer sets the 60s Mr. White
    // guess-window alarm.
    for (const playerId of turnOrder) {
      const next = Promise.all(order.map((pid) => waitForMessage(sockets[pid])));
      sockets[playerId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: mrWhiteId }));
      await next;
    }
    const voteSnaps = await resolveVoteTimer(stub, sockets);
    expect(voteSnaps[0].phase).toBe('ELIMINATION');

    // Mr. White answers wrong well before the 60s alarm would naturally fire -- the game
    // continues into a fresh CLUE_ROUND (5 players, Mr. White gone, 1 undercover + 3 civils
    // still alive), with the clue timer still disabled.
    const guessResult = Promise.all(order.map((pid) => waitForMessage(sockets[pid])));
    sockets[mrWhiteId].send(JSON.stringify({ type: 'MR_WHITE_GUESS', guess: 'definitely-wrong' }));
    const afterGuess = await guessResult;
    expect(afterGuess[0].phase).toBe('CLUE_ROUND');
    expect(afterGuess[0].turnDeadline).toBeNull();
    const currentTurnPlayerId = afterGuess[0].turnOrder[afterGuess[0].currentTurnIndex] as string;

    // If the 60s ELIMINATION alarm was left dangling, firing it now hits CLUE_ROUND's alarm()
    // branch and eliminates currentTurnPlayerId. Fire whatever alarm may or may not be pending,
    // then confirm that player can still submit a clue normally (i.e. they were never touched).
    await runDurableObjectAlarm(stub);
    const ownResponse = waitForMessage(sockets[currentTurnPlayerId]);
    sockets[currentTurnPlayerId].send(JSON.stringify({ type: 'SUBMIT_CLUE', text: 'still here' }));
    const response = await ownResponse;
    expect(response.type).toBe('ROOM_STATE');
    expect(response.players.find((p: any) => p.id === currentTurnPlayerId).alive).toBe(true);
    expect(response.clues.some((c: any) => c.playerId === currentTurnPlayerId && c.text === 'still here')).toBe(true);
  });

  it('caps clue and theme text length to prevent unbounded room state growth', async () => {
    const code = 'FLOW-TEXT-LENGTH-CAP';
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note' },
      })
    );
    await started;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const themeSelectSnap = await afterAlarmA;
    const setterId = themeSelectSnap.themeSetterId as string;

    const longTheme = 'x'.repeat(500);
    const afterTheme = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[setterId].send(JSON.stringify({ type: 'SUBMIT_THEME', text: longTheme }));
    const [clueRoundSnap] = await afterTheme;
    expect(clueRoundSnap.currentTheme.length).toBe(200);

    const longClue = 'y'.repeat(500);
    const firstPlayerId = (clueRoundSnap.turnOrder as string[])[clueRoundSnap.currentTurnIndex];
    const afterClue = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[firstPlayerId].send(JSON.stringify({ type: 'SUBMIT_CLUE', text: longClue }));
    const [afterClueSnap] = await afterClue;
    const storedClue = afterClueSnap.clues.find((c: any) => c.playerId === firstPlayerId);
    expect(storedClue.text.length).toBe(200);
  });

  it('records an accusation vote and passes the turn (no elimination) when a player misses the clue timeout mid-round', async () => {
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
    expect(clueRoundSnap.turnDeadline).toEqual(expect.any(Number));

    const turnOrder = clueRoundSnap.turnOrder as string[];
    const firstPlayerId = turnOrder[0];
    const secondPlayerId = turnOrder[1];

    // First player submits a real clue (moving turn to the second player), then -- instead of
    // the second player submitting -- let the clue timeout alarm fire mid-round to exercise the
    // CLUE_ROUND branch of alarm() (not the ROLE_REVEAL->CLUE_ROUND one already covered by other
    // tests).
    const afterFirstClue = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[firstPlayerId].send(JSON.stringify({ type: 'SUBMIT_CLUE', text: `clue-from-${firstPlayerId}` }));
    await afterFirstClue;

    const afterTimeout = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    await runDurableObjectAlarm(stub);
    const timeoutSnaps = await afterTimeout;
    const timeoutSnap = timeoutSnaps[0];

    // The player who missed the deadline is NOT eliminated -- their turn just passes with an
    // empty clue, and they carry an accusation vote into the next tally instead.
    expect(timeoutSnap.phase).toBe('CLUE_ROUND');
    const secondPlayer = timeoutSnap.players.find((p: any) => p.id === secondPlayerId);
    expect(secondPlayer.alive).toBe(true);
    expect(secondPlayer.connected).toBe(true);
    expect(timeoutSnap.clues.find((c: any) => c.playerId === secondPlayerId && c.text === '')).toBeTruthy();
    expect(timeoutSnap.accusationVotes[secondPlayerId]).toBe(1);
    // Turn moved on to the third player.
    expect(timeoutSnap.turnOrder[timeoutSnap.currentTurnIndex]).toBe(turnOrder[2]);
  });

  it('clamps the host-requested clue timer duration into [30, 90]s', async () => {
    const code = 'FLOW-CLUE-TIMER-CLAMP';
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
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false, clueTimerEnabled: true, clueTimerSeconds: 200 },
      })
    );
    const [startedSnap] = await started;
    expect(startedSnap.settings.clueTimerSeconds).toBe(90);
  });

  it('never sets a turn deadline when the host disables the clue timer', async () => {
    const code = 'FLOW-CLUE-TIMER-DISABLED';
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
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false, clueTimerEnabled: false },
      })
    );
    await started;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const clueRoundSnap = await afterAlarmA;
    expect(clueRoundSnap.phase).toBe('CLUE_ROUND');
    expect(clueRoundSnap.turnDeadline).toBeNull();

    const firstPlayerId = (clueRoundSnap.turnOrder as string[])[0];
    const afterFirstClue = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[firstPlayerId].send(JSON.stringify({ type: 'SUBMIT_CLUE', text: 'clue' }));
    const [afterFirstClueSnap] = await afterFirstClue;
    expect(afterFirstClueSnap.turnDeadline).toBeNull();
  });

  it('lets the host restart a finished game back into the lobby, but rejects non-hosts', async () => {
    const code = 'FLOW-RESTART';
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

    await submitFullClueRound(sockets, turnOrder, 1);
    await submitFullClueRound(sockets, turnOrder, 2);

    // Any single elimination in a 3-player, no-Mr.-White game ends it (civil win or undercover
    // parity win) -- vote for the second player in turn order to reach END deterministically.
    const target = turnOrder[1];
    for (const playerId of turnOrder) {
      const ws = sockets[playerId];
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      ws.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      await next;
    }
    const voteSnaps = await resolveVoteTimer(stub, sockets);
    expect(voteSnaps[0].phase).toBe('ELIMINATION');

    const afterReveal = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    await runDurableObjectAlarm(stub);
    const endSnaps = await afterReveal;
    expect(endSnaps[0].phase).toBe('END');

    // A non-host cannot restart the game.
    const deniedPromise = waitForMessage(wsB);
    wsB.send(JSON.stringify({ type: 'RESTART_GAME' }));
    const denied = await deniedPromise;
    expect(denied).toMatchObject({ type: 'ERROR', code: 'NOT_HOST' });

    // The host restarts: the room returns to LOBBY with every player's role/character/alive
    // reset, same players and same host as before.
    const restartResult = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(JSON.stringify({ type: 'RESTART_GAME' }));
    const restartSnaps = await restartResult;
    const restartSnap = restartSnaps[0];

    expect(restartSnap.phase).toBe('LOBBY');
    expect(restartSnap.hostId).toBe('a');
    expect(restartSnap.players).toHaveLength(3);
    expect(restartSnap.players.every((p: any) => p.alive === true)).toBe(true);
    expect(
      restartSnap.players.every(
        (p: any) => p.role === null && p.character === null && p.characterImage === null && p.characterSeries === null
      )
    ).toBe(true);
  });

  it('enters THEME_SELECT after role reveal in note mode, and SUBMIT_THEME hands off to CLUE_ROUND', async () => {
    const code = 'FLOW-NOTE-THEME';
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note' },
      })
    );
    await started;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const themeSelectSnap = await afterAlarmA;
    expect(themeSelectSnap.phase).toBe('THEME_SELECT');
    expect(['a', 'b', 'c']).toContain(themeSelectSnap.themeSetterId);
    expect(themeSelectSnap.turnDeadline).toEqual(expect.any(Number));

    const setterId = themeSelectSnap.themeSetterId as string;
    const afterTheme = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[setterId].send(JSON.stringify({ type: 'SUBMIT_THEME', text: 'Force brute' }));
    const clueRoundSnaps = await afterTheme;

    for (const snap of clueRoundSnaps) {
      expect(snap.phase).toBe('CLUE_ROUND');
      expect(snap.currentTheme).toBe('Force brute');
      expect(snap.themes).toEqual([{ round: 1, playerId: setterId, text: 'Force brute' }]);
      expect(snap.turnDeadline).toEqual(expect.any(Number));
    }
  });

  it('prefers a connected player when picking the note-mode theme-setter, skipping disconnected ones', async () => {
    const code = 'FLOW-NOTE-THEME-DISCONNECTED-SETTER';
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note' },
      })
    );
    await started;

    // Bob and Carl disconnect before the ROLE_REVEAL alarm even fires -- only Alice is left
    // connected, so she must be the one picked as theme-setter even though turnOrder might not
    // start on her.
    const afterDropB = waitForMessage(wsA);
    wsB.close();
    await afterDropB;
    const afterDropC = waitForMessage(wsA);
    wsC.close();
    await afterDropC;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const themeSelectSnap = await afterAlarmA;

    expect(themeSelectSnap.phase).toBe('THEME_SELECT');
    expect(themeSelectSnap.themeSetterId).toBe('a');
  });

  it('rejects SUBMIT_THEME from anyone other than the designated theme-setter', async () => {
    const code = 'FLOW-NOTE-THEME-WRONG-PLAYER';
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note' },
      })
    );
    await started;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const themeSelectSnap = await afterAlarmA;
    const setterId = themeSelectSnap.themeSetterId as string;
    const impostorId = (['a', 'b', 'c'] as const).find((id) => id !== setterId)!;

    const errorPromise = waitForMessage(sockets[impostorId]);
    sockets[impostorId].send(JSON.stringify({ type: 'SUBMIT_THEME', text: 'Nope' }));
    const errorMsg = await errorPromise;
    expect(errorMsg).toMatchObject({ type: 'ERROR', code: 'NOT_YOUR_TURN' });
  });

  it('rejects SUBMIT_THEME with an empty or whitespace-only theme, keeping the room in THEME_SELECT', async () => {
    const code = 'FLOW-NOTE-THEME-EMPTY';
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note' },
      })
    );
    await started;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const themeSelectSnap = await afterAlarmA;
    const setterId = themeSelectSnap.themeSetterId as string;

    const emptyErrorPromise = waitForMessage(sockets[setterId]);
    sockets[setterId].send(JSON.stringify({ type: 'SUBMIT_THEME', text: '' }));
    const emptyError = await emptyErrorPromise;
    expect(emptyError).toMatchObject({ type: 'ERROR', code: 'EMPTY_THEME' });

    const whitespaceErrorPromise = waitForMessage(sockets[setterId]);
    sockets[setterId].send(JSON.stringify({ type: 'SUBMIT_THEME', text: '   ' }));
    const whitespaceError = await whitespaceErrorPromise;
    expect(whitespaceError).toMatchObject({ type: 'ERROR', code: 'EMPTY_THEME' });

    // The room must still be in THEME_SELECT, waiting for the same setter -- a real theme now
    // succeeds normally.
    const afterTheme = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[setterId].send(JSON.stringify({ type: 'SUBMIT_THEME', text: 'Force brute' }));
    const [clueRoundSnap] = await afterTheme;
    expect(clueRoundSnap.phase).toBe('CLUE_ROUND');
    expect(clueRoundSnap.currentTheme).toBe('Force brute');
  });

  it('passes the theme-setter duty to the next alive player on timeout, without eliminating anyone', async () => {
    const code = 'FLOW-NOTE-THEME-TIMEOUT';
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note' },
      })
    );
    await started;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const themeSelectSnap = await afterAlarmA;
    const firstSetterId = themeSelectSnap.themeSetterId as string;

    const afterTimeout = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    await runDurableObjectAlarm(stub);
    const [timeoutSnap] = await afterTimeout;

    expect(timeoutSnap.phase).toBe('THEME_SELECT');
    expect(timeoutSnap.themeSetterId).not.toBe(firstSetterId);
    expect(timeoutSnap.turnDeadline).toEqual(expect.any(Number));
    // Nobody was eliminated -- all three players are still alive.
    expect(timeoutSnap.players.every((p: any) => p.alive)).toBe(true);
  });

  it('returns to THEME_SELECT (not CLUE_ROUND) after a tied vote resolves without a winner in note mode', async () => {
    const code = 'FLOW-NOTE-RESOLVE';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);
    const wsD = await joinPlayer(stub, code, 'Dora', 'd', false, [wsA, wsB, wsC]);
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC, d: wsD };

    async function playOneThemeAndClueRound(passNumber: number) {
      const afterAlarmA = waitForMessage(wsA);
      await runDurableObjectAlarm(stub);
      const themeSelectSnap = await afterAlarmA;
      const setterId = themeSelectSnap.themeSetterId as string;
      const afterTheme = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[setterId].send(JSON.stringify({ type: 'SUBMIT_THEME', text: `theme-${passNumber}` }));
      const [clueRoundSnap] = await afterTheme;
      const order = clueRoundSnap.turnOrder as string[];
      return submitFullClueRound(sockets, order, passNumber);
    }

    const started = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note' },
      })
    );
    await started;

    await playOneThemeAndClueRound(1);
    const voteSnaps = await playOneThemeAndClueRound(2);
    expect(voteSnaps[0].phase).toBe('VOTE');

    // Two pairs vote for each other -- a 4-way tie among all 4 alive players (nobody has more
    // votes than anyone else). Votes are submitted one at a time (like every other vote loop in
    // this file): SUBMIT_VOTE broadcasts an interim snapshot after every single vote, not only
    // the last, so firing all sends at once would let each socket's one-shot listener consume
    // that first interim (still phase VOTE) broadcast instead of the final resolution.
    const pendingVotes: [string, string][] = [
      ['a', 'b'],
      ['b', 'a'],
      ['c', 'd'],
      ['d', 'c'],
    ];
    for (const [voterId, targetId] of pendingVotes) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId }));
      await next;
    }

    // A tie no longer gets its own "no elimination" reveal -- it goes straight into a
    // tie-breaking runoff, still in VOTE, restricted to the tied leaders (here, all 4).
    const runoffSnaps = await resolveVoteTimer(stub, sockets);
    for (const snap of runoffSnaps) {
      expect(snap.phase).toBe('VOTE');
      expect((snap.voteCandidateIds as string[]).slice().sort()).toEqual(['a', 'b', 'c', 'd']);
      expect(snap.players.every((p: any) => p.alive)).toBe(true);
    }

    // Everyone abstains in the runoff -- genuinely nobody voted for anyone, which still gets its
    // own brief "no elimination" reveal (reason 'no_votes') before the room moves on.
    for (const voterId of Object.keys(sockets)) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: null }));
      await next;
    }

    const noVotesRevealSnaps = await resolveVoteTimer(stub, sockets);
    for (const snap of noVotesRevealSnaps) {
      expect(snap.phase).toBe('ELIMINATION');
      expect(snap.lastEliminatedId).toBeNull();
      expect(snap.noEliminationReason).toBe('no_votes');
    }

    const afterTieSnaps = await resolveVoteTimer(stub, sockets);
    for (const snap of afterTieSnaps) {
      expect(snap.phase).toBe('THEME_SELECT');
      expect(snap.themeSetterId).toEqual(expect.any(String));
      expect(snap.players.every((p: any) => p.alive)).toBe(true);
    }
  });

  // Drives a note-mode game to VOTE with Mr. White enabled, then everyone votes Mr. White out.
  // Uses 5 players (not 3) because mrWhiteEnabled: true needs assignRoles' civilian-majority
  // guard satisfied (civilCount > specialCount): with 3 players that guard throws -- see FLOW-3
  // above, which asserts exactly that CANNOT_START_GAME failure -- while 5 players give
  // undercoverCount=1 + mrWhiteCount=1 = specialCount 2 against civilCount 3, same as the
  // classic-mode setupMrWhiteRound helper already uses for the same reason.
  async function startNoteRolesAndReachVote(code: string, mrWhiteEnabled: boolean) {
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);
    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);
    const wsD = await joinPlayer(stub, code, 'Dora', 'd', false, [wsA, wsB, wsC]);
    const wsE = await joinPlayer(stub, code, 'Eve', 'e', false, [wsA, wsB, wsC, wsD]);
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC, d: wsD, e: wsE };

    const started = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(
      JSON.stringify({
        // The host cannot choose civilNote/undercoverNote -- the server draws them at random.
        type: 'START_GAME',
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled, mode: 'note' },
      })
    );
    const snaps = await started;
    const civilNote = snaps[0].settings.civilNote as number;
    const roleById: Record<string, string> = {};
    Object.keys(sockets).forEach((playerId, idx) => {
      roleById[playerId] = snaps[idx].players.find((p: any) => p.id === playerId).role;
    });

    async function playOneThemeAndClueRound(passNumber: number) {
      const afterAlarmA = waitForMessage(wsA);
      await runDurableObjectAlarm(stub);
      const themeSelectSnap = await afterAlarmA;
      const setterId = themeSelectSnap.themeSetterId as string;
      const afterTheme = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[setterId].send(JSON.stringify({ type: 'SUBMIT_THEME', text: `theme-${passNumber}` }));
      const [clueRoundSnap] = await afterTheme;
      const order = clueRoundSnap.turnOrder as string[];
      return submitFullClueRound(sockets, order, passNumber);
    }

    await playOneThemeAndClueRound(1);
    const voteSnaps = await playOneThemeAndClueRound(2);
    return { stub, sockets, roleById, voteSnaps, civilNote };
  }

  it('lets Mr. White win by guessing the exact civil note', async () => {
    const { stub, sockets, roleById, voteSnaps, civilNote } = await startNoteRolesAndReachVote('FLOW-NOTE-MRWHITE-WIN', true);
    expect(voteSnaps[0].phase).toBe('VOTE');
    const mrWhiteId = Object.keys(roleById).find((id) => roleById[id] === 'mrwhite')!;

    // Votes must be submitted one at a time, awaiting each broadcast in turn -- sending them all
    // in a burst would let each socket's one-shot `waitForMessage` listener consume the first
    // interim (still-VOTE) broadcast instead of the final elimination one (same pitfall the
    // tie-vote test above documents).
    const otherIds = Object.keys(sockets).filter((id) => id !== mrWhiteId);
    const voters = [...otherIds, mrWhiteId];
    for (const voterId of voters) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      const targetId = voterId === mrWhiteId ? otherIds[0] : mrWhiteId;
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId }));
      await next;
    }
    const eliminationSnaps = await resolveVoteTimer(stub, sockets);
    expect(eliminationSnaps[0].phase).toBe('ELIMINATION');

    const afterGuess = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[mrWhiteId].send(JSON.stringify({ type: 'MR_WHITE_GUESS', guess: String(civilNote) }));
    const endSnaps = await afterGuess;
    expect(endSnaps[0].phase).toBe('END');
    expect(endSnaps[0].winner).toBe('mrwhite');
  });

  it('does not let Mr. White win by guessing the wrong note', async () => {
    const { stub, sockets, roleById, voteSnaps, civilNote } = await startNoteRolesAndReachVote('FLOW-NOTE-MRWHITE-LOSE', true);
    expect(voteSnaps[0].phase).toBe('VOTE');
    const mrWhiteId = Object.keys(roleById).find((id) => roleById[id] === 'mrwhite')!;

    const otherIds = Object.keys(sockets).filter((id) => id !== mrWhiteId);
    const voters = [...otherIds, mrWhiteId];
    for (const voterId of voters) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      const targetId = voterId === mrWhiteId ? otherIds[0] : mrWhiteId;
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId }));
      await next;
    }
    const eliminationSnaps = await resolveVoteTimer(stub, sockets);
    expect(eliminationSnaps[0].phase).toBe('ELIMINATION');

    // Wrong on purpose: any value in [0, 20] other than the actual civil note.
    const wrongGuess = civilNote === 0 ? 1 : civilNote - 1;
    const afterGuess = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[mrWhiteId].send(JSON.stringify({ type: 'MR_WHITE_GUESS', guess: String(wrongGuess) }));
    const afterGuessSnaps = await afterGuess;
    expect(afterGuessSnaps[0].winner).toBeNull();
  });

  it('resets note-mode fields when the host restarts a finished note-mode game', async () => {
    const { stub, sockets, roleById, voteSnaps } = await startNoteRolesAndReachVote('FLOW-NOTE-RESTART', false);
    expect(voteSnaps[0].phase).toBe('VOTE');
    const civilId = Object.keys(roleById).find((id) => roleById[id] === 'civil')!;
    const undercoverId = Object.keys(roleById).find((id) => roleById[id] === 'undercover')!;

    // Votes must be submitted one at a time, awaiting each broadcast in turn -- sending them all
    // in a burst would let each socket's one-shot `waitForMessage` listener consume the first
    // interim (still-VOTE) broadcast instead of the final elimination one (same pitfall the
    // tie-vote and Mr. White tests above document).
    for (const voterId of Object.keys(sockets)) {
      const target = voterId === undercoverId ? civilId : undercoverId;
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      await next;
    }
    const afterVoteSnaps = await resolveVoteTimer(stub, sockets);
    expect(afterVoteSnaps[0].phase === 'ELIMINATION' || afterVoteSnaps[0].phase === 'END').toBe(true);

    // Drive to END regardless of whether it took one more reveal step.
    if (afterVoteSnaps[0].phase === 'ELIMINATION') {
      const afterReveal = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      await runDurableObjectAlarm(stub);
      await afterReveal;
    }

    const afterRestart = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets.a.send(JSON.stringify({ type: 'RESTART_GAME' }));
    const restartSnaps = await afterRestart;

    expect(restartSnaps[0].phase).toBe('LOBBY');
    expect(restartSnaps[0].themeSetterId).toBeNull();
    expect(restartSnaps[0].currentTheme).toBeNull();
    expect(restartSnaps[0].themes).toEqual([]);
    for (const p of restartSnaps[0].players) {
      expect(p.note).toBeNull();
    }
  });

  it('plays a complete note-mode game from START_GAME to END, exercising a theme-timeout handoff and a vote elimination, with correct note pairing at the end', async () => {
    const code = 'FLOW-NOTE-E2E';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);
    const wsD = await joinPlayer(stub, code, 'Dora', 'd', false, [wsA, wsB, wsC]);
    const wsE = await joinPlayer(stub, code, 'Eve', 'e', false, [wsA, wsB, wsC, wsD]);
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC, d: wsD, e: wsE };

    // 5 players, Mr. White disabled: 1 undercover + 4 civils, guaranteeing a civilian majority
    // (same reasoning as startNoteRolesAndReachVote above) and a deterministic civil win once
    // the sole undercover is eliminated.
    const started = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(
      JSON.stringify({
        // The host cannot choose civilNote/undercoverNote -- the server draws them at random.
        type: 'START_GAME',
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note' },
      })
    );
    const startSnaps = await started;
    const { civilNote, undercoverNote } = startSnaps[0].settings;
    const roleById: Record<string, string> = {};
    Object.keys(sockets).forEach((playerId, idx) => {
      roleById[playerId] = startSnaps[idx].players.find((p: any) => p.id === playerId).role;
    });
    const undercoverId = Object.keys(roleById).find((pid) => roleById[pid] === 'undercover')!;
    const civilIds = Object.keys(roleById).filter((pid) => roleById[pid] === 'civil');
    expect(civilIds).toHaveLength(4);

    // Round 1: ROLE_REVEAL -> THEME_SELECT, picking a random first theme-setter.
    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const themeSelectSnap = await afterAlarmA;
    expect(themeSelectSnap.phase).toBe('THEME_SELECT');
    const firstSetterId = themeSelectSnap.themeSetterId as string;

    // Let the first setter's timer expire without ever sending SUBMIT_THEME: this exercises the
    // "hand off to the next alive player, no elimination" path, with every player still alive
    // (a normal, non-degenerate case).
    const afterTimeout = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    await runDurableObjectAlarm(stub);
    const [timeoutSnap] = await afterTimeout;
    expect(timeoutSnap.phase).toBe('THEME_SELECT');
    const secondSetterId = timeoutSnap.themeSetterId as string;
    expect(secondSetterId).not.toBe(firstSetterId);
    expect(timeoutSnap.players.every((p: any) => p.alive)).toBe(true);

    // The fresh setter now actually submits a theme, driving the first full clue-round pass.
    const afterTheme1 = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[secondSetterId].send(JSON.stringify({ type: 'SUBMIT_THEME', text: 'theme-1' }));
    const [clueRoundSnap1] = await afterTheme1;
    expect(clueRoundSnap1.phase).toBe('CLUE_ROUND');
    const order1 = clueRoundSnap1.turnOrder as string[];

    // Completing pass 1 puts the room back into THEME_SELECT synchronously (applyClue's mid-pair
    // branch), so the last broadcast from this pass already carries the next theme-setter.
    const afterPass1Snaps = await submitFullClueRound(sockets, order1, 1);
    expect(afterPass1Snaps[0].phase).toBe('THEME_SELECT');
    const thirdSetterId = afterPass1Snaps[0].themeSetterId as string;

    // Second pass: a fresh theme, then the full clue round that opens the vote.
    const afterTheme2 = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[thirdSetterId].send(JSON.stringify({ type: 'SUBMIT_THEME', text: 'theme-2' }));
    const [clueRoundSnap2] = await afterTheme2;
    expect(clueRoundSnap2.phase).toBe('CLUE_ROUND');
    const order2 = clueRoundSnap2.turnOrder as string[];

    const voteSnaps = await submitFullClueRound(sockets, order2, 2);
    expect(voteSnaps[0].phase).toBe('VOTE');

    // Vote out the undercover player: everyone votes for them except the undercover, who votes
    // for a civil -- an unambiguous majority, no tie.
    for (const voterId of Object.keys(sockets)) {
      const target = voterId === undercoverId ? civilIds[0] : undercoverId;
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
      await next;
    }
    const eliminationSnaps = await resolveVoteTimer(stub, sockets);
    expect(eliminationSnaps[0].phase).toBe('ELIMINATION');
    expect(eliminationSnaps[0].lastEliminatedId).toBe(undercoverId);

    // The reveal alarm resolves the elimination: with the sole undercover gone and no Mr.
    // White, civils win immediately.
    const afterReveal = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    await runDurableObjectAlarm(stub);
    const endSnaps = await afterReveal;
    expect(endSnaps[0].phase).toBe('END');
    expect(endSnaps[0].winner).toBe('civil');

    // Note<->role pairing check: at END, buildSnapshot reveals every player's note, so this
    // catches a swapped ternary in handleStartGame's note-assignment logic.
    for (const p of endSnaps[0].players) {
      if (p.role === 'civil') {
        expect(p.note).toBe(civilNote);
      } else if (p.role === 'undercover') {
        expect(p.note).toBe(undercoverNote);
      }
    }
  });

  it('rejects RESTART_GAME outside the END phase', async () => {
    const code = 'FLOW-RESTART-WRONG-PHASE';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);

    // Still in LOBBY (game never started) -- the host cannot restart what hasn't ended.
    const errorPromise = waitForMessage(wsA);
    wsA.send(JSON.stringify({ type: 'RESTART_GAME' }));
    const error = await errorPromise;
    expect(error).toMatchObject({ type: 'ERROR', code: 'WRONG_PHASE' });
  });

  it('broadcasts UPDATE_SETTINGS from the host to every player in the lobby', async () => {
    const code = 'FLOW-SETTINGS-BROADCAST';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);

    const nextSettings = { themes: ['anime'], similarityLevel: 'very_close', mrWhiteEnabled: true };
    const broadcastResult = Promise.all([waitForMessage(wsA), waitForMessage(wsB)]);
    wsA.send(JSON.stringify({ type: 'UPDATE_SETTINGS', settings: nextSettings }));
    const [snapA, snapB] = await broadcastResult;

    expect(snapA.settings).toMatchObject(nextSettings);
    expect(snapB.settings).toMatchObject(nextSettings);
  });

  it('rejects UPDATE_SETTINGS from a non-host', async () => {
    const code = 'FLOW-SETTINGS-NOT-HOST';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);

    const errorPromise = waitForMessage(wsB);
    wsB.send(
      JSON.stringify({
        type: 'UPDATE_SETTINGS',
        settings: { themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false },
      })
    );
    const error = await errorPromise;
    expect(error).toMatchObject({ type: 'ERROR', code: 'NOT_HOST' });
  });

  it('rejects UPDATE_SETTINGS outside the LOBBY phase', async () => {
    const code = 'FLOW-SETTINGS-WRONG-PHASE';
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

    const errorPromise = waitForMessage(wsA);
    wsA.send(
      JSON.stringify({
        type: 'UPDATE_SETTINGS',
        settings: { themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false },
      })
    );
    const error = await errorPromise;
    expect(error).toMatchObject({ type: 'ERROR', code: 'WRONG_PHASE' });
  });

  it('rejects KICK_PLAYER from a non-host', async () => {
    const code = 'FLOW-KICK-NOT-HOST';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);

    const errorPromise = waitForMessage(wsB);
    wsB.send(JSON.stringify({ type: 'KICK_PLAYER', playerId: 'a' }));
    const error = await errorPromise;
    expect(error).toMatchObject({ type: 'ERROR', code: 'NOT_HOST' });
  });

  it('rejects the host trying to kick themselves', async () => {
    const code = 'FLOW-KICK-SELF';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);

    const errorPromise = waitForMessage(wsA);
    wsA.send(JSON.stringify({ type: 'KICK_PLAYER', playerId: 'a' }));
    const error = await errorPromise;
    expect(error).toMatchObject({ type: 'ERROR', code: 'CANNOT_KICK_SELF' });
  });

  it('rejects KICK_PLAYER for a player id that is not in the room', async () => {
    const code = 'FLOW-KICK-NOT-FOUND';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);

    const errorPromise = waitForMessage(wsA);
    wsA.send(JSON.stringify({ type: 'KICK_PLAYER', playerId: 'ghost' }));
    const error = await errorPromise;
    expect(error).toMatchObject({ type: 'ERROR', code: 'PLAYER_NOT_FOUND' });
  });

  it('lets the host kick a player from the lobby, and permanently blocks them from rejoining the room', async () => {
    const code = 'FLOW-KICK-LOBBY';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);

    // Bob first receives the final ROOM_STATE broadcast (his own row already gone), then the
    // dedicated KICKED notice right before his socket is closed.
    const bobFinalBroadcast = waitForMessage(wsB);
    const hostBroadcast = waitForMessage(wsA);
    wsA.send(JSON.stringify({ type: 'KICK_PLAYER', playerId: 'b' }));
    const [, snapA] = await Promise.all([bobFinalBroadcast, hostBroadcast]);
    const notice = await waitForMessage(wsB);

    expect(notice).toMatchObject({ type: 'ERROR', code: 'KICKED' });
    expect(snapA.players.find((p: any) => p.id === 'b')).toBeUndefined();

    // A fresh connection attempting to rejoin with the same (kicked) clientId must be rejected,
    // even though the room is still in LOBBY and would otherwise happily let a new player in.
    const res = await connect(stub);
    const rejoinWs = res.webSocket!;
    rejoinWs.accept();
    const rejoinError = waitForMessage(rejoinWs);
    rejoinWs.send(JSON.stringify({ type: 'JOIN_ROOM', code, name: 'Bob', clientId: 'b', isHost: false }));
    expect(await rejoinError).toMatchObject({ type: 'ERROR', code: 'BANNED' });
  });

  it('kicking the current clue-turn holder passes their turn to the next alive player immediately', async () => {
    const code = 'FLOW-KICK-CLUE-TURN';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    // 5 players (no Mr. White) so the lone Undercover kicked out isn't what's under test here --
    // that's covered by the dedicated win-condition test below. Kicking a civil instead leaves
    // 3 civils + 1 Undercover alive, which checkWinCondition doesn't decide either way.
    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);
    const wsD = await joinPlayer(stub, code, 'Dora', 'd', false, [wsA, wsB, wsC]);
    const wsE = await joinPlayer(stub, code, 'Eve', 'e', false, [wsA, wsB, wsC, wsD]);
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC, d: wsD, e: wsE };

    const started = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false },
      })
    );
    const selfSnaps = await started;
    const selfSnapsById: Record<string, any> = Object.fromEntries(Object.keys(sockets).map((pid, i) => [pid, selfSnaps[i]]));
    const undercoverId = Object.keys(sockets).find(
      (playerId) => selfSnapsById[playerId].players.find((p: any) => p.id === playerId).role === 'undercover'
    )!;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const clueRoundSnap = await afterAlarmA;

    // The host can't kick themselves and kicking the Undercover would end the game outright (see
    // the win-condition test) -- if turn order lands on either, advance past them first so a
    // non-host civil ends up holding the turn we actually kick.
    let currentId = clueRoundSnap.turnOrder[clueRoundSnap.currentTurnIndex];
    for (let guard = 0; guard < 5 && (currentId === 'a' || currentId === undercoverId); guard++) {
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[currentId].send(JSON.stringify({ type: 'SUBMIT_CLUE', text: `clue-from-${currentId}` }));
      const [afterClueSnap] = await next;
      currentId = afterClueSnap.turnOrder[afterClueSnap.currentTurnIndex];
    }

    const afterKick = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(JSON.stringify({ type: 'KICK_PLAYER', playerId: currentId }));
    const [kickSnap] = await afterKick;

    expect(kickSnap.phase).toBe('CLUE_ROUND');
    const kickedPlayer = kickSnap.players.find((p: any) => p.id === currentId);
    expect(kickedPlayer.alive).toBe(false);
    expect(kickedPlayer.connected).toBe(false);
    const newCurrentId = kickSnap.turnOrder[kickSnap.currentTurnIndex];
    expect(newCurrentId).not.toBe(currentId);
  });

  it('kicking the sole Undercover immediately ends the game with a civil win', async () => {
    const code = 'FLOW-KICK-WIN';
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
    // Each player's own role is revealed in the snapshot sent to their own socket as soon as
    // START_GAME broadcasts, regardless of phase -- no need to wait for the round to progress.
    const [snapA, snapB, snapC] = await started;
    const selfSnapsById: Record<string, any> = { a: snapA, b: snapB, c: snapC };
    const undercoverId = Object.keys(sockets).find(
      (playerId) => selfSnapsById[playerId].players.find((p: any) => p.id === playerId).role === 'undercover'
    )!;

    const afterKick = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(JSON.stringify({ type: 'KICK_PLAYER', playerId: undercoverId }));
    const [kickSnap] = await afterKick;

    expect(kickSnap.phase).toBe('END');
    expect(kickSnap.winner).toBe('civil');
  });

  it('kicking a non-voter during VOTE recomputes the deadline, arming the grace period if the remaining alive players had already all voted', async () => {
    const code = 'FLOW-KICK-VOTE';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    // 5 players (no Mr. White) so kicking a civil non-voter leaves 3 civils + 1 Undercover
    // alive -- checkWinCondition stays undecided, isolating the deadline-recompute behavior
    // under test from the win-condition path (covered separately above).
    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);
    const wsD = await joinPlayer(stub, code, 'Dora', 'd', false, [wsA, wsB, wsC]);
    const wsE = await joinPlayer(stub, code, 'Eve', 'e', false, [wsA, wsB, wsC, wsD]);
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC, d: wsD, e: wsE };

    const started = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false },
      })
    );
    const selfSnaps = await started;
    const selfSnapsById: Record<string, any> = Object.fromEntries(Object.keys(sockets).map((pid, i) => [pid, selfSnaps[i]]));
    const undercoverId = Object.keys(sockets).find(
      (playerId) => selfSnapsById[playerId].players.find((p: any) => p.id === playerId).role === 'undercover'
    )!;
    // A non-host civil, guaranteed to exist: only one of the 5 players is the Undercover, so at
    // least 3 of the 4 non-host players are civil.
    const nonVoterId = Object.keys(sockets).find((playerId) => playerId !== 'a' && playerId !== undercoverId)!;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const clueRoundSnap = await afterAlarmA;
    const turnOrder = clueRoundSnap.turnOrder as string[];

    await submitFullClueRound(sockets, turnOrder, 1);
    const voteSnaps = await submitFullClueRound(sockets, turnOrder, 2);
    expect(voteSnaps[0].phase).toBe('VOTE');

    // Everyone except nonVoterId votes (all for 'a', a harmless target) -- nonVoterId never acts
    // and then gets kicked, at which point the remaining alive players turn out to have already
    // all voted.
    for (const voterId of Object.keys(sockets)) {
      if (voterId === nonVoterId) continue;
      const next = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: 'a' }));
      await next;
    }

    const afterKick = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(JSON.stringify({ type: 'KICK_PLAYER', playerId: nonVoterId }));
    const [kickSnap] = await afterKick;

    expect(kickSnap.phase).toBe('VOTE');
    expect(kickSnap.allVotedDeadline).toEqual(expect.any(Number));
  });

  it('lets a vote actually eliminate someone using only the connected players once others have disconnected mid-game', async () => {
    // Regression test: disconnected-but-not-eliminated players used to still count toward the
    // majority denominator, so once enough players dropped out mid-game a majority became
    // mathematically unreachable and every vote resolved as "no majority" forever, looping the
    // game through endless clue rounds with nobody ever getting eliminated.
    const code = 'FLOW-VOTE-GHOST-PLAYERS';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    const wsC = await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);
    const wsD = await joinPlayer(stub, code, 'Dora', 'd', false, [wsA, wsB, wsC]);
    const sockets: Record<string, WebSocket> = { a: wsA, b: wsB, c: wsC, d: wsD };

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

    await submitFullClueRound(sockets, turnOrder, 1);
    const voteSnaps = await submitFullClueRound(sockets, turnOrder, 2);
    expect(voteSnaps[0].phase).toBe('VOTE');

    // Carl and Dora disconnect mid-vote -- only Alice and Bob remain connected.
    const afterCloseC = Promise.all([waitForMessage(wsA), waitForMessage(wsB), waitForMessage(wsD)]);
    wsC.close();
    await afterCloseC;
    const afterCloseD = Promise.all([waitForMessage(wsA), waitForMessage(wsB)]);
    wsD.close();
    await afterCloseD;

    // Alice and Bob both vote for Carl -- with only 2 connected alive players, 2/2 is a full
    // majority, even though Carl and Dora are still nominally "alive" (never eliminated, just
    // disconnected).
    for (const voterId of ['a', 'b']) {
      const next = Promise.all([waitForMessage(wsA), waitForMessage(wsB)]);
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: 'c' }));
      await next;
    }

    const afterGrace = Promise.all([waitForMessage(wsA), waitForMessage(wsB)]);
    await runDurableObjectAlarm(stub);
    const [resolvedSnap] = await afterGrace;

    expect(resolvedSnap.phase).toBe('ELIMINATION');
    expect(resolvedSnap.lastEliminatedId).toBe('c');
  });

  it('bans a player who explicitly LEAVE_ROOMs from the lobby, unlike a player who just disconnects', async () => {
    const code = 'FLOW-LEAVE-LOBBY';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);

    const afterLeave = waitForMessage(wsA);
    wsB.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    wsB.close();
    const snapAfterLeave = await afterLeave;
    expect(snapAfterLeave.players.find((p: any) => p.id === 'b')).toBeUndefined();

    // Unlike a plain disconnect, a fresh connection with the same clientId is rejected outright.
    const res = await connect(stub);
    const rejoinWs = res.webSocket!;
    rejoinWs.accept();
    const rejoinError = waitForMessage(rejoinWs);
    rejoinWs.send(JSON.stringify({ type: 'JOIN_ROOM', code, name: 'Bob', clientId: 'b', isHost: false }));
    expect(await rejoinError).toMatchObject({ type: 'ERROR', code: 'BANNED' });
  });

  it('bans a player who explicitly LEAVE_ROOMs mid-game, but still lets them be voted out normally first', async () => {
    const code = 'FLOW-LEAVE-MIDGAME';
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

    const afterLeave = Promise.all([waitForMessage(wsA), waitForMessage(wsC)]);
    wsB.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    wsB.close();
    const [snapAfterLeave] = await afterLeave;

    // Mid-game a voluntary leave behaves exactly like a disconnect (marked disconnected, still
    // "alive" and normally votable) -- the ban is the only thing LEAVE_ROOM adds.
    const bob = snapAfterLeave.players.find((p: any) => p.id === 'b');
    expect(bob.connected).toBe(false);
    expect(bob.alive).toBe(true);

    const res = await connect(stub);
    const rejoinWs = res.webSocket!;
    rejoinWs.accept();
    const rejoinError = waitForMessage(rejoinWs);
    rejoinWs.send(JSON.stringify({ type: 'JOIN_ROOM', code, name: 'Bob', clientId: 'b', isHost: false }));
    expect(await rejoinError).toMatchObject({ type: 'ERROR', code: 'BANNED' });
  });

  it('lets a player who merely disconnects mid-game (no LEAVE_ROOM) reconnect back into the same seat', async () => {
    const code = 'FLOW-DISCONNECT-RECONNECT';
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

    // No LEAVE_ROOM sent -- just an ordinary connection drop.
    const afterDisconnect = Promise.all([waitForMessage(wsA), waitForMessage(wsC)]);
    wsB.close();
    await afterDisconnect;

    const res = await connect(stub);
    const rejoinWs = res.webSocket!;
    rejoinWs.accept();
    const rejoinResult = waitForMessage(rejoinWs);
    rejoinWs.send(JSON.stringify({ type: 'JOIN_ROOM', code, name: 'Bob', clientId: 'b', isHost: false }));
    const snapshot = await rejoinResult;

    expect(snapshot.type).toBe('ROOM_STATE');
    const bob = snapshot.players.find((p: any) => p.id === 'b');
    expect(bob.connected).toBe(true);
  });

  it('opens the vote after a single clue pass when the host configures cluePassesPerVote: 1', async () => {
    const code = 'FLOW-CLUE-PASSES-1';
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
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false, cluePassesPerVote: 1 },
      })
    );
    const [snapA] = await started;
    expect(snapA.settings.cluePassesPerVote).toBe(1);

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const clueRoundSnap = await afterAlarmA;
    const turnOrder = clueRoundSnap.turnOrder as string[];

    // A single full pass should be enough to open the vote (instead of the default 2).
    const voteSnaps = await submitFullClueRound(sockets, turnOrder, 1);
    expect(voteSnaps[0].phase).toBe('VOTE');
  });

  it('clamps a host-requested cluePassesPerVote outside [1, 5]', async () => {
    const code = 'FLOW-CLUE-PASSES-CLAMP';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    await joinPlayer(stub, code, 'Carl', 'c', false, [wsA, wsB]);

    const started = waitForMessage(wsA);
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: ['anime'], similarityLevel: 'none', mrWhiteEnabled: false, cluePassesPerVote: 99 },
      })
    );
    const snapA = await started;
    expect(snapA.settings.cluePassesPerVote).toBe(5);
  });
});
