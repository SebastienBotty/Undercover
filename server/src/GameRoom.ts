import { DurableObject } from 'cloudflare:workers';
import type { Role, RoomSettings, RoomState } from './types';
import type { ClientMessage } from './messages';
import { buildSnapshot } from './game/snapshot';
import { assignRoles, buildTurnOrder } from './game/roles';
import { nextAliveIndex, isClueRoundComplete, nextOddRound, resolveClueTimerSeconds } from './game/clueRound';
import { tallyVotes, checkWinCondition, checkMrWhiteGuess, checkMrWhiteNoteGuess } from './game/voting';
import { selectCharacterPair } from './characters/selectPair';
import { CHARACTERS } from './characters/data';
import { generateDistinctNotes, pickRandomThemeSetter } from './game/notes';

const STORAGE_KEY = 'room';
const CLUE_ROUNDS_PER_VOTE = 2;
/** Caps clue/theme text length so a room's persisted state can't grow unbounded. */
const MAX_TEXT_LENGTH = 200;

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
      case 'MR_WHITE_GUESS':
        await this.handleMrWhiteGuess(attachment.playerId, msg.guess);
        break;
      case 'RESTART_GAME':
        await this.handleRestartGame(attachment.playerId);
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
        await this.scheduleClueTimeout();
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

    if (room.phase === 'THEME_SELECT') {
      const aliveIds = new Set(room.players.filter((p) => p.alive).map((p) => p.id));
      const currentIndex = room.turnOrder.indexOf(room.themeSetterId!);
      const nextIndex = nextAliveIndex(room.turnOrder, aliveIds, currentIndex);
      room.themeSetterId = room.turnOrder[nextIndex];
      await this.scheduleClueTimeout();
      await this.saveRoom();
      this.broadcast();
      return;
    }

    if (room.phase === 'CLUE_ROUND') {
      const playerId = room.turnOrder[room.currentTurnIndex];
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

  /** Enters THEME_SELECT for the round in progress: picks a random alive theme-setter and starts the shared turn timer. Reused both after ROLE_REVEAL and after an elimination resolves without a winner. */
  private async enterThemeSelect(room: RoomState) {
    const aliveIds = room.players.filter((p) => p.alive).map((p) => p.id);
    room.themeSetterId = pickRandomThemeSetter(aliveIds, Math.random);
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
    await this.scheduleClueTimeout();
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
      } else {
        const assignedCharacter = role === 'civil' ? selection!.civilCharacter : role === 'undercover' ? selection!.undercoverCharacter : null;
        player.character = assignedCharacter?.name ?? null;
        player.characterImage = assignedCharacter?.image ?? null;
        player.note = null;
      }
    }

    room.settings = {
      ...settings,
      mode,
      similarityLevel: selection?.levelUsed ?? settings.similarityLevel,
      clueTimerEnabled: settings.clueTimerEnabled ?? true,
      clueTimerSeconds: resolveClueTimerSeconds(settings.clueTimerSeconds),
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
      // Players give clues for CLUE_ROUNDS_PER_VOTE full passes before a vote is allowed --
      // room.round increments once per pass (odd = first pass of the pair, even = second),
      // so only an even round number after completion actually opens the vote.
      if (room.round % CLUE_ROUNDS_PER_VOTE === 0) {
        room.phase = 'VOTE';
        room.turnDeadline = null;
        await this.saveRoom();
        this.broadcast();
        return;
      }

      room.round += 1;
      if (room.settings.mode === 'note') {
        await this.enterThemeSelect(room);
        await this.saveRoom();
        this.broadcast();
        return;
      }
      room.currentTurnIndex = nextAliveIndex(room.turnOrder, aliveIds, -1);
      await this.scheduleClueTimeout();
      await this.saveRoom();
      this.broadcast();
      return;
    }

    room.currentTurnIndex = nextAliveIndex(room.turnOrder, aliveIds, room.currentTurnIndex);
    await this.scheduleClueTimeout();
    await this.saveRoom();
    this.broadcast();
  }

  private async handleSubmitVote(playerId: string, targetId: string) {
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

    const target = room.players.find((p) => p.id === targetId);
    if (!target || !target.alive) {
      this.sendErrorTo(playerId, 'INVALID_VOTE_TARGET', 'Cible de vote invalide');
      return;
    }

    room.votes[playerId] = targetId;

    const aliveIds = room.players.filter((p) => p.alive).map((p) => p.id);
    if (!aliveIds.every((id) => room.votes[id])) {
      await this.saveRoom();
      this.broadcast();
      return;
    }

    const { eliminatedId, tie } = tallyVotes(room.votes);
    room.votes = {};

    if (tie || !eliminatedId) {
      room.lastEliminatedId = null;
      await this.resolveAfterElimination(room);
      await this.saveRoom();
      this.broadcast();
      return;
    }

    await this.enterEliminationPhase(eliminatedId);
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
    room.themeSetterId = null;
    room.currentTheme = null;
    room.themes = [];

    await this.saveRoom();
    this.broadcast();
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
    await this.scheduleClueTimeout();
  }

  async webSocketClose(ws: WebSocket) {
    await this.loadRoom();
    const attachment = ws.deserializeAttachment() as ConnAttachment | null;
    if (attachment && this.room) {
      const player = this.room.players.find((p) => p.id === attachment.playerId);
      if (player) player.connected = false;
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
        themeSetterId: null,
        currentTheme: null,
        themes: [],
      };
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
