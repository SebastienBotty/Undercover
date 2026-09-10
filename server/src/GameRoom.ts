import { DurableObject } from 'cloudflare:workers';
import type { Role, RoomSettings, RoomState } from './types';
import type { ClientMessage } from './messages';
import { buildSnapshot } from './game/snapshot';
import { assignRoles, buildTurnOrder } from './game/roles';
import { nextAliveIndex, isClueRoundComplete, nextOddRound, resolveClueTimerSeconds } from './game/clueRound';
import { tallyVotes, checkWinCondition, checkMrWhiteGuess, checkMrWhiteNoteGuess, resolveVoteTimerSeconds, ALL_VOTED_GRACE_MS } from './game/voting';
import { selectCharacterPair } from './characters/selectPair';
import { CHARACTERS } from './characters/data';
import { SERIES_LABELS } from './characters/seriesLabels';
import { generateDistinctNotes, pickRandomThemeSetter } from './game/notes';

/** Human-readable source-work label for an anime character (e.g. "One Piece"), null for every other theme. */
function seriesLabelFor(character: { theme: string; series?: string } | null | undefined): string | null {
  if (!character || character.theme !== 'anime' || !character.series) return null;
  return SERIES_LABELS[character.series] ?? character.series;
}

const STORAGE_KEY = 'room';
const CLUE_ROUNDS_PER_VOTE = 2;
/** Caps clue/theme text length so a room's persisted state can't grow unbounded. */
const MAX_TEXT_LENGTH = 200;
/** Mr. White can only be enabled with this many players or more, so a civilian majority stays possible. */
const MR_WHITE_MIN_PLAYERS = 5;

interface ConnAttachment {
  playerId: string;
}

export class GameRoom extends DurableObject {
  private room: RoomState | null = null;
  private loaded = false;

  protected async loadRoom(): Promise<void> {
    if (this.loaded) return;
    const stored = await this.ctx.storage.get<RoomState>(STORAGE_KEY);
    this.room = stored ?? null;
    this.loaded = true;
  }

  protected async saveRoom(): Promise<void> {
    if (this.room) {
      await this.ctx.storage.put(STORAGE_KEY, this.room);
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    await this.loadRoom();
    const msg = JSON.parse(raw as string) as ClientMessage;

    if (msg.type === 'JOIN_ROOM') {
      await this.handleJoin(ws, msg);
      return;
    }

    const attachment = ws.deserializeAttachment() as ConnAttachment | null;
    if (!attachment || !this.room) {
      this.sendError(ws, 'NOT_JOINED', "Vous devez rejoindre la salle d'abord");
      return;
    }

    switch (msg.type) {
      case 'START_GAME':
        await this.handleStartGame(attachment.playerId, msg.settings);
        break;
      case 'UPDATE_SETTINGS':
        await this.handleUpdateSettings(attachment.playerId, msg.settings);
        break;
      case 'SUBMIT_CLUE':
        await this.handleSubmitClue(attachment.playerId, msg.text);
        break;
      case 'SUBMIT_THEME':
        await this.handleSubmitTheme(attachment.playerId, msg.text);
        break;
      case 'SUBMIT_VOTE':
        await this.handleSubmitVote(attachment.playerId, msg.targetId);
        break;
      case 'RETRACT_VOTE':
        await this.handleRetractVote(attachment.playerId);
        break;
      case 'MR_WHITE_GUESS':
        await this.handleMrWhiteGuess(attachment.playerId, msg.guess);
        break;
      case 'RESTART_GAME':
        await this.handleRestartGame(attachment.playerId);
        break;
      case 'KICK_PLAYER':
        await this.handleKickPlayer(attachment.playerId, msg.playerId);
        break;
      case 'LEAVE_ROOM':
        await this.handleLeaveRoom(attachment.playerId);
        break;
      default:
        this.sendError(ws, 'UNKNOWN_MESSAGE', 'Unsupported message type at this stage');
    }
  }

  async alarm() {
    await this.loadRoom();
    const room = this.room;
    if (!room) return;

    if (room.phase === 'ROLE_REVEAL') {
      if (room.settings.mode === 'note') {
        await this.enterThemeSelect(room);
      } else {
        room.phase = 'CLUE_ROUND';
        await this.settleClueTurn(room);
      }
      await this.saveRoom();
      this.broadcast();
      return;
    }

    if (room.phase === 'ELIMINATION') {
      await this.resolveAfterElimination(room);
      await this.saveRoom();
      this.broadcast();
      return;
    }

    if (room.phase === 'VOTE') {
      // With the vote timer enabled, resolution happens only here, when the window closes --
      // not as soon as every alive player has voted, so a slow or absent voter never gets
      // fast-forwarded past.
      await this.resolveVotePhase();
      return;
    }

    if (room.phase === 'THEME_SELECT') {
      await this.settleThemeSetterTurn(room);
      await this.saveRoom();
      this.broadcast();
      return;
    }

    if (room.phase === 'CLUE_ROUND') {
      const playerId = room.turnOrder[room.currentTurnIndex];
      const player = room.players.find((p) => p.id === playerId);
      if (player && !player.connected) {
        // They disconnected after their clue timer had already started running -- pass their
        // turn instead of eliminating someone just for losing their connection.
        await this.settleClueTurn(room);
        await this.saveRoom();
        this.broadcast();
        return;
      }
      await this.enterEliminationPhase(playerId);
    }
  }

  private async scheduleClueTimeout() {
    const room = this.room!;
    if (!room.settings.clueTimerEnabled) {
      room.turnDeadline = null;
      // A previous phase (e.g. Mr. White's 60s guess window) may have left an alarm pending --
      // without deleting it, that stale alarm would still fire and hit whatever phase this room
      // is in by then, mutating state nobody asked for (see the 2026-09-10 review finding).
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const deadline = Date.now() + resolveClueTimerSeconds(room.settings.clueTimerSeconds) * 1000;
    room.turnDeadline = deadline;
    await this.ctx.storage.setAlarm(deadline);
  }

  /** Call whenever room.currentTurnIndex has just been set to whoever should act next in
   * CLUE_ROUND (game start, a fresh round, resuming after an elimination, etc). Auto-skips any
   * disconnected players in a row by recording an empty clue on their behalf -- so a dropped
   * connection can never stall the game waiting for a clue nobody can submit -- landing on
   * either a connected player's turn (arming their clue timer) or, if skipping completes the
   * round along the way, whatever phase transition that triggers. Pure mutation: does not save
   * or broadcast, same as scheduleClueTimeout/enterThemeSelect. */
  private async settleClueTurn(room: RoomState) {
    for (;;) {
      const currentId = room.turnOrder[room.currentTurnIndex];
      const currentPlayer = room.players.find((p) => p.id === currentId);
      if (currentPlayer?.connected !== false) {
        await this.scheduleClueTimeout();
        return;
      }

      room.clues.push({ playerId: currentId, round: room.round, text: '' });
      const aliveIds = new Set(room.players.filter((p) => p.alive).map((p) => p.id));
      if (isClueRoundComplete(room.clues, room.round, aliveIds)) {
        await this.finishClueRound(room, aliveIds);
        return;
      }
      room.currentTurnIndex = nextAliveIndex(room.turnOrder, aliveIds, room.currentTurnIndex);
    }
  }

  /** The round's clues are all in -- figure out what comes next (open the vote, a new theme in
   * note mode, or the next classic-mode clue turn). Shared by a real final SUBMIT_CLUE and by
   * settleClueTurn auto-skipping disconnected players into completing the round. Pure mutation:
   * does not save or broadcast. */
  private async finishClueRound(room: RoomState, aliveIds: Set<string>) {
    // Players give clues for CLUE_ROUNDS_PER_VOTE full passes before a vote is allowed -- room
    // round increments once per pass (odd = first pass of the pair, even = second), so only an
    // even round number after completion actually opens the vote.
    if (room.round % CLUE_ROUNDS_PER_VOTE === 0) {
      room.phase = 'VOTE';
      await this.scheduleVoteTimeout();
      return;
    }

    room.round += 1;
    if (room.settings.mode === 'note') {
      await this.enterThemeSelect(room);
      return;
    }
    room.currentTurnIndex = nextAliveIndex(room.turnOrder, aliveIds, -1);
    await this.settleClueTurn(room);
  }

  /** Advances room.themeSetterId to the next alive player, skipping past any other disconnected
   * players too (bounded so an all-disconnected room can't loop forever) -- used both when the
   * current setter's timer expires and when they disconnect mid-turn, for an immediate pass
   * instead of waiting out the timer. Pure mutation: does not save or broadcast. */
  private async settleThemeSetterTurn(room: RoomState) {
    const aliveIds = new Set(room.players.filter((p) => p.alive).map((p) => p.id));
    let nextIndex = nextAliveIndex(room.turnOrder, aliveIds, room.turnOrder.indexOf(room.themeSetterId!));
    for (let guard = 0; guard < room.turnOrder.length; guard++) {
      const candidate = room.players.find((p) => p.id === room.turnOrder[nextIndex]);
      if (candidate?.connected !== false) break;
      nextIndex = nextAliveIndex(room.turnOrder, aliveIds, nextIndex);
    }
    room.themeSetterId = room.turnOrder[nextIndex];
    await this.scheduleClueTimeout();
  }

  private async scheduleVoteTimeout() {
    const room = this.room!;
    room.allVotedDeadline = null;
    if (!room.settings.voteTimerEnabled) {
      room.turnDeadline = null;
      // Mirrors scheduleClueTimeout's stale-alarm fix: without this, an alarm left pending by a
      // previous phase would still fire and hit whatever phase the room is in by then.
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const deadline = Date.now() + resolveVoteTimerSeconds(room.settings.voteTimerSeconds) * 1000;
    room.turnDeadline = deadline;
    await this.ctx.storage.setAlarm(deadline);
  }

  /** Tallies the current votes and moves the room out of VOTE into ELIMINATION, whether or not
   * anyone was actually eliminated -- a tie/no-votes result still gets its own brief reveal (with
   * a reason) before the alarm moves the room on, exactly like a real elimination does. Shared by
   * the vote-timer alarm and by handleSubmitVote's no-timer fast path. */
  private async resolveVotePhase() {
    const room = this.room!;
    // Majority is computed against players who can actually still vote -- a disconnected player
    // stays "alive" (they can still be voted out normally) but must not inflate the denominator,
    // or a majority could become permanently unreachable once enough people drop out mid-game.
    const aliveCount = room.players.filter((p) => p.alive && p.connected).length;
    const { eliminatedId, reason } = tallyVotes(room.votes, aliveCount);
    room.votes = {};
    room.allVotedDeadline = null;
    if (!eliminatedId) {
      room.lastEliminatedId = null;
      room.noEliminationReason = reason;
      room.phase = 'ELIMINATION';
      room.turnDeadline = null;
      await this.saveRoom();
      this.broadcast();
      await this.ctx.storage.setAlarm(Date.now() + 5_000);
      return;
    }
    await this.enterEliminationPhase(eliminatedId);
  }

  /** Enters THEME_SELECT for the round in progress: picks a random alive theme-setter and starts the shared turn timer. Reused both after ROLE_REVEAL and after an elimination resolves without a winner. */
  private async enterThemeSelect(room: RoomState) {
    const aliveIds = room.players.filter((p) => p.alive).map((p) => p.id);
    // Prefer a still-connected player so a freshly-disconnected one isn't handed a turn nobody
    // will ever act on; fall back to any alive player if literally everyone has disconnected.
    const connectedAliveIds = room.players.filter((p) => p.alive && p.connected).map((p) => p.id);
    room.themeSetterId = pickRandomThemeSetter(connectedAliveIds.length > 0 ? connectedAliveIds : aliveIds, Math.random);
    room.currentTheme = null;
    room.phase = 'THEME_SELECT';
    await this.scheduleClueTimeout();
  }

  private async handleSubmitTheme(playerId: string, text: string) {
    const room = this.room!;
    if (room.phase !== 'THEME_SELECT') {
      this.sendErrorTo(playerId, 'WRONG_PHASE', "Ce n'est pas le moment de proposer un thème");
      return;
    }
    if (playerId !== room.themeSetterId) {
      this.sendErrorTo(playerId, 'NOT_YOUR_TURN', "Ce n'est pas ton tour de proposer un thème");
      return;
    }
    const trimmedText = text.trim().slice(0, MAX_TEXT_LENGTH);
    if (!trimmedText) {
      this.sendErrorTo(playerId, 'EMPTY_THEME', 'Le thème ne peut pas être vide');
      return;
    }
    room.themes.push({ round: room.round, playerId, text: trimmedText });
    room.currentTheme = trimmedText;
    room.phase = 'CLUE_ROUND';
    const aliveIds = new Set(room.players.filter((p) => p.alive).map((p) => p.id));
    room.currentTurnIndex = nextAliveIndex(room.turnOrder, aliveIds, -1);
    await this.settleClueTurn(room);
    await this.saveRoom();
    this.broadcast();
  }

  private async handleUpdateSettings(playerId: string, settings: RoomSettings) {
    const room = this.room!;
    if (playerId !== room.hostId) {
      this.sendErrorTo(playerId, 'NOT_HOST', "Seul l'hôte peut modifier les réglages");
      return;
    }
    if (room.phase !== 'LOBBY') {
      this.sendErrorTo(playerId, 'WRONG_PHASE', 'Les réglages ne peuvent être modifiés que dans le salon');
      return;
    }
    room.settings = settings;
    await this.saveRoom();
    this.broadcast();
  }

  private async handleStartGame(playerId: string, settings: RoomSettings) {
    const room = this.room!;
    if (playerId !== room.hostId) {
      this.sendErrorTo(playerId, 'NOT_HOST', "Seul l'hôte peut lancer la partie");
      return;
    }
    if (room.phase !== 'LOBBY') {
      this.sendErrorTo(playerId, 'ALREADY_STARTED', 'La partie a déjà commencé');
      return;
    }
    if (room.players.length < 3) {
      this.sendErrorTo(playerId, 'NOT_ENOUGH_PLAYERS', 'Il faut au moins 3 joueurs');
      return;
    }
    if (settings.mrWhiteEnabled && room.players.length < MR_WHITE_MIN_PLAYERS) {
      this.sendErrorTo(playerId, 'MR_WHITE_MIN_PLAYERS', `Mr. White nécessite au moins ${MR_WHITE_MIN_PLAYERS} joueurs`);
      return;
    }

    const playerIds = room.players.map((p) => p.id);
    const mode = settings.mode ?? 'classic';
    let selection: ReturnType<typeof selectCharacterPair> | null = null;
    let roles: ReturnType<typeof assignRoles>;
    let civilNote = 0;
    let undercoverNote = 0;
    try {
      // Can throw for invalid combinations (e.g. too few characters in the selected themes, or
      // a player/role-count combo that can't guarantee a civilian majority) -- catch here so the
      // host gets a typed error instead of an uncaught exception and a half-started room.
      roles = assignRoles(playerIds, settings);
      if (mode === 'note') {
        // Notes are never chosen by the host -- always drawn at random, guaranteed distinct.
        ({ civilNote, undercoverNote } = generateDistinctNotes(Math.random));
      } else {
        selection = selectCharacterPair(
          CHARACTERS,
          settings.themes,
          settings.similarityLevel,
          Math.random,
          settings.animeSeries ?? []
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de démarrer la partie';
      this.sendErrorTo(playerId, 'CANNOT_START_GAME', message);
      return;
    }

    for (const player of room.players) {
      const role = roles[player.id];
      player.role = role;
      if (mode === 'note') {
        player.note = role === 'civil' ? civilNote : role === 'undercover' ? undercoverNote : null;
        player.character = null;
        player.characterImage = null;
        player.characterSeries = null;
      } else {
        const assignedCharacter = role === 'civil' ? selection!.civilCharacter : role === 'undercover' ? selection!.undercoverCharacter : null;
        player.character = assignedCharacter?.name ?? null;
        player.characterImage = assignedCharacter?.image ?? null;
        player.characterSeries = seriesLabelFor(assignedCharacter);
        player.note = null;
      }
    }

    room.settings = {
      ...settings,
      mode,
      similarityLevel: selection?.levelUsed ?? settings.similarityLevel,
      clueTimerEnabled: settings.clueTimerEnabled ?? true,
      clueTimerSeconds: resolveClueTimerSeconds(settings.clueTimerSeconds),
      voteTimerEnabled: settings.voteTimerEnabled ?? true,
      voteTimerSeconds: resolveVoteTimerSeconds(settings.voteTimerSeconds),
      ...(mode === 'note' ? { civilNote, undercoverNote } : {}),
    };
    room.turnOrder = buildTurnOrder(playerIds);
    room.currentTurnIndex = 0;
    room.round = 1;
    room.clues = [];
    room.votes = {};
    room.winner = null;
    room.lastEliminatedId = null;
    room.turnDeadline = null;
    room.allVotedDeadline = null;
    room.noEliminationReason = null;
    room.themeSetterId = null;
    room.currentTheme = null;
    room.themes = [];
    room.phase = 'ROLE_REVEAL';

    await this.saveRoom();
    this.broadcast();

    if (selection?.wasRelaxed) {
      this.sendErrorTo(
        room.hostId,
        'SIMILARITY_RELAXED',
        `Pas assez de personnages pour le niveau demandé, niveau "${selection.levelUsed}" utilisé à la place.`
      );
    }

    await this.ctx.storage.setAlarm(Date.now() + 5_000);
  }

  private async handleSubmitClue(playerId: string, text: string) {
    const room = this.room!;
    if (room.phase !== 'CLUE_ROUND') {
      this.sendErrorTo(playerId, 'WRONG_PHASE', "Ce n'est pas le moment de donner un indice");
      return;
    }
    if (playerId !== room.turnOrder[room.currentTurnIndex]) {
      this.sendErrorTo(playerId, 'NOT_YOUR_TURN', "Ce n'est pas ton tour");
      return;
    }
    await this.applyClue(playerId, text.slice(0, MAX_TEXT_LENGTH));
  }

  private async applyClue(playerId: string, text: string) {
    const room = this.room!;
    room.clues.push({ playerId, round: room.round, text });

    const aliveIds = new Set(room.players.filter((p) => p.alive).map((p) => p.id));
    if (isClueRoundComplete(room.clues, room.round, aliveIds)) {
      await this.finishClueRound(room, aliveIds);
    } else {
      room.currentTurnIndex = nextAliveIndex(room.turnOrder, aliveIds, room.currentTurnIndex);
      await this.settleClueTurn(room);
    }

    await this.saveRoom();
    this.broadcast();
  }

  private async handleSubmitVote(playerId: string, targetId: string | null) {
    const room = this.room!;
    if (room.phase !== 'VOTE') {
      this.sendErrorTo(playerId, 'WRONG_PHASE', "Ce n'est pas le moment de voter");
      return;
    }
    const voter = room.players.find((p) => p.id === playerId);
    if (!voter || !voter.alive) {
      this.sendErrorTo(playerId, 'NOT_ALIVE', 'Tu ne peux plus voter');
      return;
    }

    if (targetId !== null) {
      const target = room.players.find((p) => p.id === targetId);
      if (!target || !target.alive) {
        this.sendErrorTo(playerId, 'INVALID_VOTE_TARGET', 'Cible de vote invalide');
        return;
      }
    }

    // The vote never resolves synchronously here -- it only actually counts when the window
    // closes (see alarm()'s VOTE branch). A player can change their mind (including switching
    // to/from abstaining) as many times as they want before then.
    room.votes[playerId] = targetId;
    await this.recomputeVoteDeadline();

    await this.saveRoom();
    this.broadcast();
  }

  private async handleRetractVote(playerId: string) {
    const room = this.room!;
    if (room.phase !== 'VOTE') {
      this.sendErrorTo(playerId, 'WRONG_PHASE', "Ce n'est pas le moment de voter");
      return;
    }
    const voter = room.players.find((p) => p.id === playerId);
    if (!voter || !voter.alive) {
      this.sendErrorTo(playerId, 'NOT_ALIVE', 'Tu ne peux plus voter');
      return;
    }

    delete room.votes[playerId];
    await this.recomputeVoteDeadline();

    await this.saveRoom();
    this.broadcast();
  }

  /** Re-arms the DO's single alarm around whichever deadline is now relevant for VOTE: the
   * ALL_VOTED_GRACE_MS grace period once every alive, connected player has voted (started or
   * restarted by every call to this while that stays true, so a changed vote resets the
   * countdown), or the original main vote timer once someone retracts and it's no longer
   * everyone. A disconnected player is excluded from "everyone" -- they can never cast a vote,
   * so counting them here would mean the grace period (and, via resolveVotePhase's majority
   * check) elimination itself could never trigger once enough people drop out mid-game. */
  private async recomputeVoteDeadline() {
    const room = this.room!;
    const aliveIds = room.players.filter((p) => p.alive && p.connected).map((p) => p.id);
    const everyoneVoted = aliveIds.length > 0 && aliveIds.every((id) => id in room.votes);

    if (everyoneVoted) {
      const deadline = Date.now() + ALL_VOTED_GRACE_MS;
      room.allVotedDeadline = deadline;
      await this.ctx.storage.setAlarm(deadline);
      return;
    }

    room.allVotedDeadline = null;
    if (room.settings.voteTimerEnabled && room.turnDeadline) {
      await this.ctx.storage.setAlarm(room.turnDeadline);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  /**
   * Marks a player eliminated (by vote or by clue-timeout) and enters the ELIMINATION reveal
   * phase. Broadcasts the reveal to every client first, then resolves what comes next
   * (CLUE_ROUND/END, or a Mr. White guess window) via alarm(). Mr. White gets a real 60s
   * window to type a guess (matching the clue-submission timeout); an ordinary elimination
   * only needs a short reveal pause before the game moves on. If a Mr. White guess arrives
   * before the alarm fires, handleMrWhiteGuess resolves the room itself and schedules its
   * own follow-up alarm (or reaches END, needing none), which replaces this one -- Durable
   * Object alarms replace rather than stack, so this alarm becoming a no-op by the time it
   * fires (phase no longer ELIMINATION) is safe.
   */
  private async enterEliminationPhase(eliminatedId: string) {
    const room = this.room!;
    const eliminatedPlayer = room.players.find((p) => p.id === eliminatedId)!;
    eliminatedPlayer.alive = false;
    room.lastEliminatedId = eliminatedId;
    room.noEliminationReason = null;
    room.phase = 'ELIMINATION';
    room.turnDeadline = null;

    await this.saveRoom();
    this.broadcast();
    const revealDelayMs = eliminatedPlayer.role === 'mrwhite' ? 60_000 : 5_000;
    await this.ctx.storage.setAlarm(Date.now() + revealDelayMs);
  }

  private async handleMrWhiteGuess(playerId: string, guess: string) {
    const room = this.room!;
    const player = room.players.find((p) => p.id === playerId);
    if (room.phase !== 'ELIMINATION' || !player || player.role !== 'mrwhite' || player.alive) {
      this.sendErrorTo(playerId, 'INVALID_GUESS_ATTEMPT', 'Tu ne peux pas deviner maintenant');
      return;
    }

    let guessedCorrectly: boolean;
    if (room.settings.mode === 'note') {
      const civilNote = room.players.find((p) => p.role === 'civil')?.note ?? null;
      guessedCorrectly = civilNote !== null && checkMrWhiteNoteGuess(guess, civilNote);
    } else {
      const civilCharacter = room.players.find((p) => p.role === 'civil')?.character ?? '';
      guessedCorrectly = checkMrWhiteGuess(guess, civilCharacter);
    }

    if (guessedCorrectly) {
      room.winner = 'mrwhite';
      room.phase = 'END';
      room.turnDeadline = null;
    } else {
      await this.resolveAfterElimination(room);
    }

    await this.saveRoom();
    this.broadcast();
  }

  private async handleRestartGame(playerId: string) {
    const room = this.room!;
    if (playerId !== room.hostId) {
      this.sendErrorTo(playerId, 'NOT_HOST', "Seul l'hôte peut relancer une partie");
      return;
    }
    if (room.phase !== 'END') {
      this.sendErrorTo(playerId, 'WRONG_PHASE', "Ce n'est pas le moment de relancer une partie");
      return;
    }

    for (const player of room.players) {
      player.role = null;
      player.character = null;
      player.characterImage = null;
      player.characterSeries = null;
      player.note = null;
      player.alive = true;
    }
    room.phase = 'LOBBY';
    room.turnOrder = [];
    room.currentTurnIndex = 0;
    room.clues = [];
    room.votes = {};
    room.round = 0;
    room.winner = null;
    room.lastEliminatedId = null;
    room.turnDeadline = null;
    room.allVotedDeadline = null;
    room.noEliminationReason = null;
    room.themeSetterId = null;
    room.currentTheme = null;
    room.themes = [];

    await this.saveRoom();
    this.broadcast();
  }

  /**
   * Removes a player from the room, at any phase, and bans their client id from ever rejoining
   * this room again (checked in handleJoin). In LOBBY they're simply spliced out of the player
   * list; mid-game they're instead marked not alive/not connected (same as any other elimination,
   * so turn rotation, vote tallies, and win-condition checks all treat them as already gone)
   * without the reveal ceremony a real elimination gets, and any consequence of their sudden
   * departure -- it being their clue turn, their theme-setter turn, a vote tally that now decides
   * the game, or a vote phase that's now unanimous -- is resolved immediately.
   */
  private async handleKickPlayer(requesterId: string, targetId: string) {
    const room = this.room!;
    if (requesterId !== room.hostId) {
      this.sendErrorTo(requesterId, 'NOT_HOST', "Seul l'hôte peut exclure un joueur");
      return;
    }
    if (targetId === requesterId) {
      this.sendErrorTo(requesterId, 'CANNOT_KICK_SELF', "Tu ne peux pas t'exclure toi-même");
      return;
    }
    const target = room.players.find((p) => p.id === targetId);
    if (!target) {
      this.sendErrorTo(requesterId, 'PLAYER_NOT_FOUND', 'Ce joueur ne fait plus partie de la salle');
      return;
    }

    if (!room.bannedClientIds.includes(targetId)) {
      room.bannedClientIds.push(targetId);
    }

    if (room.phase === 'LOBBY') {
      room.players = room.players.filter((p) => p.id !== targetId);
      await this.saveRoom();
      this.broadcast();
      this.closeAndNotify(targetId, 'KICKED', "L'hôte t'a exclu de la salle");
      return;
    }

    const wasClueTurn = room.phase === 'CLUE_ROUND' && room.turnOrder[room.currentTurnIndex] === targetId;
    const wasThemeSetter = room.phase === 'THEME_SELECT' && room.themeSetterId === targetId;

    target.alive = false;
    target.connected = false;
    delete room.votes[targetId];

    if (room.phase !== 'END') {
      // Safe: by the time a kick can affect the outcome, START_GAME has already assigned a
      // non-null role to every player, so this narrowing away of `Role | null` is sound.
      const winner = checkWinCondition(room.players as { role: Role; alive: boolean }[]);
      if (winner) {
        room.winner = winner;
        room.phase = 'END';
        room.turnDeadline = null;
        room.allVotedDeadline = null;
        await this.saveRoom();
        this.broadcast();
        this.closeAndNotify(targetId, 'KICKED', "L'hôte t'a exclu de la salle");
        return;
      }
    }

    if (wasClueTurn) {
      // Reuses the exact same "pass their turn" path a disconnected current turn-holder's
      // timeout already takes -- they're marked disconnected above, so this settles immediately
      // instead of waiting for their clue timer to expire.
      await this.settleClueTurn(room);
    } else if (wasThemeSetter) {
      // Same idea for the theme-setter's turn -- reuses the disconnect/timeout hand-off path.
      await this.settleThemeSetterTurn(room);
    } else if (room.phase === 'VOTE') {
      await this.recomputeVoteDeadline();
    }

    await this.saveRoom();
    this.broadcast();
    this.closeAndNotify(targetId, 'KICKED', "L'hôte t'a exclu de la salle");
  }

  /** Sends a player a final error explaining why, then closes their socket -- used once a kick's
   * room-state mutation is already saved and broadcast, so the rest of the room always sees the
   * consequences even if this player's socket happened to already be gone. */
  protected closeAndNotify(playerId: string, code: string, message: string) {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as ConnAttachment | null;
      if (attachment?.playerId === playerId) {
        this.sendError(ws, code, message);
        ws.close(1000, code);
      }
    }
  }

  /**
   * The player is explicitly choosing to leave (clicked "Quitter la partie"), not merely losing
   * their connection -- ban their client id from ever rejoining this room, same as a host kick.
   * Unlike a kick, this does NOT itself touch their `alive`/`connected` state or the game's turn
   * rotation/vote tally: the client sends this right before closing its own socket, so the normal
   * webSocketClose flow that follows handles all of that exactly as it would for any disconnect
   * (LOBBY: spliced out; mid-game: marked disconnected, reconnectable) -- the only difference a
   * voluntary leave adds is that reconnecting afterward is now permanently rejected.
   */
  private async handleLeaveRoom(playerId: string) {
    const room = this.room!;
    if (!room.bannedClientIds.includes(playerId)) {
      room.bannedClientIds.push(playerId);
    }
    await this.saveRoom();
  }

  private async resolveAfterElimination(room: RoomState) {
    // Safe: by the time an elimination can be resolved, START_GAME has already assigned a
    // non-null role to every player, so this narrowing away of `Role | null` is sound.
    const winner = checkWinCondition(room.players as { role: Role; alive: boolean }[]);
    if (winner) {
      room.winner = winner;
      room.phase = 'END';
      room.turnDeadline = null;
      return;
    }
    room.round = nextOddRound(room.round);
    if (room.settings.mode === 'note') {
      await this.enterThemeSelect(room);
      return;
    }
    const aliveIds = new Set(room.players.filter((p) => p.alive).map((p) => p.id));
    room.currentTurnIndex = nextAliveIndex(room.turnOrder, aliveIds, -1);
    room.phase = 'CLUE_ROUND';
    await this.settleClueTurn(room);
  }

  async webSocketClose(ws: WebSocket) {
    await this.loadRoom();
    const attachment = ws.deserializeAttachment() as ConnAttachment | null;
    if (attachment && this.room) {
      const room = this.room;
      const player = room.players.find((p) => p.id === attachment.playerId);
      if (player) {
        if (room.phase === 'LOBBY') {
          // Before the game starts, a disconnected player is just gone -- "disconnected" (greyed
          // out, kept in the roster so they can reconnect into the same seat) only makes sense
          // once a game is actually in progress for them to reconnect back into.
          room.players = room.players.filter((p) => p.id !== player.id);
          if (room.hostId === player.id) {
            const nextHost = room.players[0];
            if (nextHost) room.hostId = nextHost.id;
          }
        } else {
          player.connected = false;
          // The host disconnected -- hand hosting to another still-connected player so the room
          // doesn't get stuck forever (only the host can start/restart the game or change
          // settings). The original host regains nothing special by reconnecting later; whoever
          // was promoted stays host.
          if (room.hostId === player.id) {
            const nextHost = room.players.find((p) => p.connected);
            if (nextHost) room.hostId = nextHost.id;
          }
          // If it was their turn to act, pass it on immediately instead of leaving everyone else
          // waiting out the full clue timer for someone who just lost their connection.
          if (room.phase === 'CLUE_ROUND' && room.turnOrder[room.currentTurnIndex] === player.id) {
            await this.settleClueTurn(room);
          } else if (room.phase === 'THEME_SELECT' && room.themeSetterId === player.id) {
            await this.settleThemeSetterTurn(room);
          } else if (room.phase === 'VOTE') {
            // Their disconnection shrinks who still needs to vote -- recompute now in case the
            // remaining connected players had already all voted, rather than leaving the room
            // waiting out the full vote timer for someone who just left.
            await this.recomputeVoteDeadline();
          }
        }
      }
      await this.saveRoom();
      this.broadcast();
    }
  }

  protected async handleJoin(ws: WebSocket, msg: Extract<ClientMessage, { type: 'JOIN_ROOM' }>) {
    if (!this.room && !msg.isHost) {
      this.sendError(ws, 'UNKNOWN_ROOM', "Cette salle n'existe pas ou n'a pas encore été créée");
      return;
    }

    if (!this.room) {
      this.room = {
        code: msg.code,
        hostId: msg.clientId,
        phase: 'LOBBY',
        settings: { themes: [], similarityLevel: 'close', mrWhiteEnabled: false },
        players: [],
        turnOrder: [],
        currentTurnIndex: 0,
        clues: [],
        votes: {},
        round: 0,
        winner: null,
        lastEliminatedId: null,
        turnDeadline: null,
        allVotedDeadline: null,
        noEliminationReason: null,
        themeSetterId: null,
        currentTheme: null,
        themes: [],
        bannedClientIds: [],
      };
    }

    if (this.room.bannedClientIds.includes(msg.clientId)) {
      // Covers both a host kick and the player's own past LEAVE_ROOM -- either way they can't
      // get back in, and there's no need to distinguish which it was at this point.
      this.sendError(ws, 'BANNED', 'Tu ne peux pas rejoindre cette salle');
      return;
    }

    const existing = this.room.players.find((p) => p.id === msg.clientId);
    if (existing) {
      if (this.room.players.some((p) => p.id !== msg.clientId && p.name === msg.name)) {
        this.sendError(ws, 'NAME_TAKEN', 'Ce pseudo est déjà pris dans cette salle');
        return;
      }
      existing.connected = true;
      existing.name = msg.name;
    } else {
      if (this.room.phase !== 'LOBBY') {
        this.sendError(ws, 'GAME_STARTED', 'La partie a déjà commencé');
        return;
      }
      if (this.room.players.length >= 10) {
        this.sendError(ws, 'ROOM_FULL', 'La salle est pleine (10 joueurs max)');
        return;
      }
      if (this.room.players.some((p) => p.name === msg.name)) {
        this.sendError(ws, 'NAME_TAKEN', 'Ce pseudo est déjà pris dans cette salle');
        return;
      }
      this.room.players.push({
        id: msg.clientId,
        name: msg.name,
        role: null,
        character: null,
        characterImage: null,
        characterSeries: null,
        note: null,
        alive: true,
        connected: true,
      });
    }

    ws.serializeAttachment({ playerId: msg.clientId } satisfies ConnAttachment);
    await this.saveRoom();
    this.broadcast();
  }

  protected sendError(ws: WebSocket, code: string, message: string) {
    ws.send(JSON.stringify({ type: 'ERROR', code, message }));
  }

  protected sendErrorTo(playerId: string, code: string, message: string) {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as ConnAttachment | null;
      if (attachment?.playerId === playerId) {
        this.sendError(ws, code, message);
      }
    }
  }

  protected broadcast() {
    if (!this.room) return;
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as ConnAttachment | null;
      if (!attachment) continue;
      ws.send(JSON.stringify(buildSnapshot(this.room, attachment.playerId)));
    }
  }
}
