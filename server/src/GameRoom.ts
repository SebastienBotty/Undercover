import { DurableObject } from 'cloudflare:workers';
import type { Role, RoomSettings, RoomState } from './types';
import type { ClientMessage } from './messages';
import { buildSnapshot } from './game/snapshot';
import { assignRoles, buildTurnOrder } from './game/roles';
import { nextAliveIndex, isClueRoundComplete } from './game/clueRound';
import { tallyVotes, checkWinCondition, checkMrWhiteGuess } from './game/voting';
import { selectCharacterPair } from './characters/selectPair';
import { CHARACTERS } from './characters/data';

const STORAGE_KEY = 'room';

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
      case 'SUBMIT_CLUE':
        await this.handleSubmitClue(attachment.playerId, msg.text);
        break;
      case 'SUBMIT_VOTE':
        await this.handleSubmitVote(attachment.playerId, msg.targetId);
        break;
      case 'MR_WHITE_GUESS':
        await this.handleMrWhiteGuess(attachment.playerId, msg.guess);
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
      room.phase = 'CLUE_ROUND';
      await this.saveRoom();
      this.broadcast();
      await this.scheduleClueTimeout();
      return;
    }

    if (room.phase === 'CLUE_ROUND') {
      const playerId = room.turnOrder[room.currentTurnIndex];
      await this.applyClue(playerId, '');
    }
  }

  private async scheduleClueTimeout() {
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
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
    let selection: ReturnType<typeof selectCharacterPair>;
    let roles: ReturnType<typeof assignRoles>;
    try {
      // Both can throw for invalid combinations (e.g. too few characters in the selected
      // themes, or a player/role-count combo that can't guarantee a civilian majority) — catch
      // here so the host gets a typed error instead of an uncaught exception and a half-started room.
      selection = selectCharacterPair(CHARACTERS, settings.themes, settings.similarityLevel);
      roles = assignRoles(playerIds, settings);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de démarrer la partie';
      this.sendErrorTo(playerId, 'CANNOT_START_GAME', message);
      return;
    }
    const { civilCharacter, undercoverCharacter, levelUsed, wasRelaxed } = selection;

    for (const player of room.players) {
      const role = roles[player.id];
      player.role = role;
      player.character = role === 'civil' ? civilCharacter.name : role === 'undercover' ? undercoverCharacter.name : null;
    }

    room.settings = { ...settings, similarityLevel: levelUsed };
    room.turnOrder = buildTurnOrder(playerIds);
    room.currentTurnIndex = 0;
    room.round = 1;
    room.clues = [];
    room.votes = {};
    room.winner = null;
    room.lastEliminatedId = null;
    room.phase = 'ROLE_REVEAL';

    await this.saveRoom();
    this.broadcast();

    if (wasRelaxed) {
      this.sendErrorTo(
        room.hostId,
        'SIMILARITY_RELAXED',
        `Pas assez de personnages pour le niveau demandé, niveau "${levelUsed}" utilisé à la place.`
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
    await this.applyClue(playerId, text);
  }

  private async applyClue(playerId: string, text: string) {
    const room = this.room!;
    room.clues.push({ playerId, round: room.round, text });

    const aliveIds = new Set(room.players.filter((p) => p.alive).map((p) => p.id));
    if (isClueRoundComplete(room.clues, room.round, aliveIds)) {
      room.phase = 'VOTE';
      await this.saveRoom();
      this.broadcast();
      return;
    }

    room.currentTurnIndex = nextAliveIndex(room.turnOrder, aliveIds, room.currentTurnIndex);
    await this.saveRoom();
    this.broadcast();
    await this.scheduleClueTimeout();
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

    const eliminatedPlayer = room.players.find((p) => p.id === eliminatedId)!;
    eliminatedPlayer.alive = false;
    room.lastEliminatedId = eliminatedId;
    room.phase = 'ELIMINATION';

    if (eliminatedPlayer.role === 'mrwhite') {
      await this.saveRoom();
      this.broadcast();
      return;
    }

    await this.resolveAfterElimination(room);
    await this.saveRoom();
    this.broadcast();
  }

  private async handleMrWhiteGuess(playerId: string, guess: string) {
    const room = this.room!;
    const player = room.players.find((p) => p.id === playerId);
    if (room.phase !== 'ELIMINATION' || !player || player.role !== 'mrwhite' || player.alive) {
      this.sendErrorTo(playerId, 'INVALID_GUESS_ATTEMPT', 'Tu ne peux pas deviner maintenant');
      return;
    }

    const civilCharacter = room.players.find((p) => p.role === 'civil')?.character ?? '';
    if (checkMrWhiteGuess(guess, civilCharacter)) {
      room.winner = 'mrwhite';
      room.phase = 'END';
    } else {
      await this.resolveAfterElimination(room);
    }

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
      return;
    }
    room.round += 1;
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
