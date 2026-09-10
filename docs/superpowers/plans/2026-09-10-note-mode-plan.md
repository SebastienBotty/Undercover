# Note Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second game mode ("Note") where players receive a numeric note (0-20) instead of a character, and a randomly-designated player announces a free-text theme before each clue round.

**Architecture:** Extend the existing `GameRoom` Durable Object and `RoomState`/`RoomSettings`/`Player` types with a `mode: 'classic' | 'note'` switch, a new `THEME_SELECT` phase, and a handful of mode-aware branches. All shared machinery (join/reconnect, turn order, vote, elimination, timer, end screen, restart) is reused unchanged.

**Tech Stack:** Cloudflare Workers + Durable Objects (backend), Next.js/React + CSS Modules (frontend), Vitest (+ `@cloudflare/vitest-pool-workers` for backend, React Testing Library for frontend).

**Spec:** `docs/superpowers/specs/2026-09-09-note-mode-design.md`

## Global Constraints

- Notes are integers clamped to [0, 20] server-side, regardless of what the host sends.
- `civilNote` and `undercoverNote` must differ; otherwise `START_GAME` is rejected with a typed `CANNOT_START_GAME` error (same pattern as classic mode's character-selection failures).
- The clue/theme timer settings (`clueTimerEnabled`, `clueTimerSeconds`) are shared across both modes — no new timer settings.
- No character/note dataset is built for this mode: themes and clues are free text, unvalidated by the server.
- Every new/changed server-side field on `RoomState`/`Player` is a **required, nullable** field (never `?`), matching the existing convention for `turnDeadline`/`lastEliminatedId`/`character`. Every new/changed field on `RoomSettings` is **optional** with a default resolved in `handleStartGame`, matching the existing convention for `animeSeries`/`clueTimerEnabled`.
- Follow existing test patterns exactly: backend flow tests reuse the `joinPlayer`/`waitForMessage`/`submitFullClueRound`/`connect` helpers already defined at the top of `server/test/GameRoom.flow.test.ts`; frontend tests follow the existing per-component `*.test.tsx` structure under `web/test/components/`.

---

## Task 1: Data model — types, messages, snapshot pass-through

**Files:**
- Modify: `server/src/types.ts`
- Modify: `server/src/messages.ts`
- Modify: `server/src/game/snapshot.ts`
- Modify: `server/src/GameRoom.ts:389-436` (`handleJoin` only — new room/player defaults)
- Modify: `server/test/game/snapshot.test.ts`

**Interfaces:**
- Produces: `Phase` gains `'THEME_SELECT'`; `RoomSettings` gains `mode?: 'classic' | 'note'`, `civilNote?: number`, `undercoverNote?: number`; `Player` gains `note: number | null`; `RoomState` gains `themeSetterId: string | null`, `currentTheme: string | null`, `themes: ThemeEntry[]` where `ThemeEntry = { round: number; playerId: string; text: string }`; `ClientMessage` gains `{ type: 'SUBMIT_THEME'; text: string }`. All later tasks rely on these exact names.

- [ ] **Step 1: Update `server/src/types.ts`**

Replace the whole file with:

```ts
export type Role = 'civil' | 'undercover' | 'mrwhite';

export type Phase = 'LOBBY' | 'ROLE_REVEAL' | 'THEME_SELECT' | 'CLUE_ROUND' | 'VOTE' | 'ELIMINATION' | 'END';

export type SimilarityLevel = 'none' | 'close' | 'very_close';

export type GameMode = 'classic' | 'note';

export interface RoomSettings {
  themes: string[];
  similarityLevel: SimilarityLevel;
  mrWhiteEnabled: boolean;
  /** Which anime series to draw characters from when 'anime' is in themes. Empty/omitted = all. */
  animeSeries?: string[];
  /** Whether players get a countdown to submit their clue before being eliminated. Default true. */
  clueTimerEnabled?: boolean;
  /** Clue submission window in seconds, clamped to [30, 90]. Default 60. */
  clueTimerSeconds?: number;
  /** 'classic' (character-based, default) or 'note' (numeric-note-based). */
  mode?: GameMode;
  /** Note given to Civils in 'note' mode, clamped to [0, 20]. */
  civilNote?: number;
  /** Note given to Undercover in 'note' mode, clamped to [0, 20]. */
  undercoverNote?: number;
}

export interface Player {
  id: string; // equals the client's persisted clientId
  name: string;
  role: Role | null;
  character: string | null;
  characterImage: string | null;
  /** Numeric note in 'note' mode, null otherwise (and always null for Mr. White). */
  note: number | null;
  alive: boolean;
  connected: boolean;
}

export interface Clue {
  playerId: string;
  round: number;
  text: string;
}

export interface ThemeEntry {
  round: number;
  playerId: string;
  text: string;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  settings: RoomSettings;
  players: Player[];
  turnOrder: string[];
  currentTurnIndex: number;
  clues: Clue[];
  votes: Record<string, string>;
  round: number;
  winner: Role | null;
  lastEliminatedId: string | null;
  /** Unix ms timestamp when the current clue/theme submission window closes. Null outside CLUE_ROUND/THEME_SELECT. */
  turnDeadline: number | null;
  /** Player designated to submit the theme this round ('note' mode only). Null outside THEME_SELECT. */
  themeSetterId: string | null;
  /** Theme submitted for the round currently in progress ('note' mode only). */
  currentTheme: string | null;
  /** History of every theme submitted so far, one per round ('note' mode only). */
  themes: ThemeEntry[];
}
```

- [ ] **Step 2: Update `server/src/messages.ts`**

```ts
import type { RoomSettings } from './types';

export type ClientMessage =
  | { type: 'JOIN_ROOM'; code: string; name: string; clientId: string; isHost: boolean }
  | { type: 'START_GAME'; settings: RoomSettings }
  | { type: 'SUBMIT_CLUE'; text: string }
  | { type: 'SUBMIT_THEME'; text: string }
  | { type: 'SUBMIT_VOTE'; targetId: string }
  | { type: 'MR_WHITE_GUESS'; guess: string }
  | { type: 'RESTART_GAME' };

export interface ErrorMessage {
  type: 'ERROR';
  code: string;
  message: string;
}
```

- [ ] **Step 3: Write the failing snapshot tests**

Replace `server/test/game/snapshot.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { buildSnapshot } from '../../src/game/snapshot';
import type { RoomState } from '../../src/types';

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABCDE',
    hostId: 'p1',
    phase: 'CLUE_ROUND',
    settings: { themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false },
    players: [
      { id: 'p1', name: 'Alice', role: 'civil', character: 'Goku', characterImage: 'https://example.com/goku.jpg', note: null, alive: true, connected: true },
      { id: 'p2', name: 'Bob', role: 'undercover', character: 'Vegeta', characterImage: 'https://example.com/vegeta.jpg', note: null, alive: true, connected: true },
      { id: 'p3', name: 'Carl', role: 'civil', character: 'Goku', characterImage: 'https://example.com/goku.jpg', note: null, alive: false, connected: true },
    ],
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    clues: [],
    votes: {},
    round: 1,
    winner: null,
    lastEliminatedId: 'p3',
    turnDeadline: null,
    themeSetterId: null,
    currentTheme: null,
    themes: [],
    ...overrides,
  };
}

describe('buildSnapshot', () => {
  it('reveals role and character only for the requesting player among the alive players', () => {
    const snapshot = buildSnapshot(makeRoom(), 'p1');
    const me = snapshot.players.find((p) => p.id === 'p1')!;
    const other = snapshot.players.find((p) => p.id === 'p2')!;
    expect(me.role).toBe('civil');
    expect(me.character).toBe('Goku');
    expect(me.characterImage).toBe('https://example.com/goku.jpg');
    expect(other.role).toBeNull();
    expect(other.character).toBeNull();
    expect(other.characterImage).toBeNull();
  });

  it('always reveals role and character for eliminated players', () => {
    const snapshot = buildSnapshot(makeRoom(), 'p1');
    const eliminated = snapshot.players.find((p) => p.id === 'p3')!;
    expect(eliminated.role).toBe('civil');
    expect(eliminated.character).toBe('Goku');
    expect(eliminated.characterImage).toBe('https://example.com/goku.jpg');
  });

  it('reveals everything for everyone once the game has ended', () => {
    const snapshot = buildSnapshot(makeRoom({ phase: 'END' }), 'p1');
    const other = snapshot.players.find((p) => p.id === 'p2')!;
    expect(other.role).toBe('undercover');
    expect(other.character).toBe('Vegeta');
    expect(other.characterImage).toBe('https://example.com/vegeta.jpg');
  });

  it('passes through room-level fields unchanged', () => {
    const room = makeRoom({ themeSetterId: 'p1', currentTheme: 'La force', themes: [{ round: 1, playerId: 'p1', text: 'La force' }] });
    const snapshot = buildSnapshot(room, 'p1');
    expect(snapshot.code).toBe(room.code);
    expect(snapshot.phase).toBe(room.phase);
    expect(snapshot.turnOrder).toEqual(room.turnOrder);
    expect(snapshot.lastEliminatedId).toBe('p3');
    expect(snapshot.themeSetterId).toBe('p1');
    expect(snapshot.currentTheme).toBe('La force');
    expect(snapshot.themes).toEqual([{ round: 1, playerId: 'p1', text: 'La force' }]);
  });

  it('reveals note only for the requesting player among the alive players, mirroring character', () => {
    const room = makeRoom({
      players: [
        { id: 'p1', name: 'Alice', role: 'civil', character: null, characterImage: null, note: 14, alive: true, connected: true },
        { id: 'p2', name: 'Bob', role: 'undercover', character: null, characterImage: null, note: 10, alive: true, connected: true },
        { id: 'p3', name: 'Carl', role: 'civil', character: null, characterImage: null, note: 14, alive: false, connected: true },
      ],
    });
    const snapshot = buildSnapshot(room, 'p1');
    const me = snapshot.players.find((p) => p.id === 'p1')!;
    const other = snapshot.players.find((p) => p.id === 'p2')!;
    const eliminated = snapshot.players.find((p) => p.id === 'p3')!;
    expect(me.note).toBe(14);
    expect(other.note).toBeNull();
    expect(eliminated.note).toBe(14);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd server && npx vitest run test/game/snapshot.test.ts`
Expected: FAIL (TypeScript errors: `RoomState`/`Player` literals missing `note`/`themeSetterId`/`currentTheme`/`themes`; `buildSnapshot` doesn't return those fields yet).

- [ ] **Step 5: Update `server/src/game/snapshot.ts`**

```ts
import type { RoomState } from '../types';

export function buildSnapshot(state: RoomState, forPlayerId: string) {
  const revealEverything = state.phase === 'END';
  return {
    type: 'ROOM_STATE' as const,
    code: state.code,
    hostId: state.hostId,
    phase: state.phase,
    settings: state.settings,
    round: state.round,
    currentTurnIndex: state.currentTurnIndex,
    turnOrder: state.turnOrder,
    clues: state.clues,
    winner: state.winner,
    lastEliminatedId: state.lastEliminatedId,
    turnDeadline: state.turnDeadline,
    themeSetterId: state.themeSetterId,
    currentTheme: state.currentTheme,
    themes: state.themes,
    players: state.players.map((p) => {
      const reveal = revealEverything || !p.alive || p.id === forPlayerId;
      return {
        id: p.id,
        name: p.name,
        alive: p.alive,
        connected: p.connected,
        role: reveal ? p.role : null,
        character: reveal ? p.character : null,
        characterImage: reveal ? p.characterImage : null,
        note: reveal ? p.note : null,
      };
    }),
  };
}
```

- [ ] **Step 6: Update `handleJoin` in `server/src/GameRoom.ts` so the project compiles**

In the `if (!this.room)` block, change the initial room literal to:

```ts
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
```

And in the `else` branch that pushes a new player, change the pushed literal to:

```ts
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
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS, all suites (this also confirms `tsc` compiles since vitest transpiles via esbuild but the CI-relevant check is the next step).

Run: `cd server && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 8: Commit**

```bash
git add server/src/types.ts server/src/messages.ts server/src/game/snapshot.ts server/src/GameRoom.ts server/test/game/snapshot.test.ts
git commit -m "feat(server): add Note mode data model (types, messages, snapshot)"
```

---

## Task 2: Pure note helpers (`game/notes.ts`)

**Files:**
- Create: `server/src/game/notes.ts`
- Create: `server/test/game/notes.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `NOTE_MIN = 0`, `NOTE_MAX = 20`, `NOTE_DEFAULT = 10`, `clampNote(value: number | undefined): number`, `notesAreDistinct(civilNote: number, undercoverNote: number): boolean`, `pickRandomThemeSetter(aliveIds: string[], random?: () => number): string`. Task 4 uses `clampNote`/`notesAreDistinct`; Tasks 5 and 6 use `pickRandomThemeSetter`.

- [ ] **Step 1: Write the failing tests**

Create `server/test/game/notes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NOTE_MIN, NOTE_MAX, NOTE_DEFAULT, clampNote, notesAreDistinct, pickRandomThemeSetter } from '../../src/game/notes';

describe('clampNote', () => {
  it('defaults to NOTE_DEFAULT when the host requested no value', () => {
    expect(clampNote(undefined)).toBe(NOTE_DEFAULT);
  });

  it('passes through a value already within [0, 20]', () => {
    expect(clampNote(14)).toBe(14);
  });

  it('clamps values below the minimum', () => {
    expect(clampNote(-5)).toBe(NOTE_MIN);
  });

  it('clamps values above the maximum', () => {
    expect(clampNote(35)).toBe(NOTE_MAX);
  });
});

describe('notesAreDistinct', () => {
  it('returns true when the two notes differ', () => {
    expect(notesAreDistinct(14, 10)).toBe(true);
  });

  it('returns false when the two notes are equal', () => {
    expect(notesAreDistinct(12, 12)).toBe(false);
  });
});

describe('pickRandomThemeSetter', () => {
  it('picks the only alive player when there is just one', () => {
    expect(pickRandomThemeSetter(['a'], () => 0)).toBe('a');
  });

  it('uses the injected random function to pick among alive players', () => {
    const aliveIds = ['a', 'b', 'c'];
    expect(pickRandomThemeSetter(aliveIds, () => 0)).toBe('a');
    expect(pickRandomThemeSetter(aliveIds, () => 0.5)).toBe('b');
    expect(pickRandomThemeSetter(aliveIds, () => 0.99)).toBe('c');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run test/game/notes.test.ts`
Expected: FAIL with "Cannot find module '../../src/game/notes'".

- [ ] **Step 3: Implement `server/src/game/notes.ts`**

```ts
export const NOTE_MIN = 0;
export const NOTE_MAX = 20;
export const NOTE_DEFAULT = 10;

/** Clamps the host's requested note into the [0, 20] range the note fields allow. */
export function clampNote(value: number | undefined): number {
  const v = value ?? NOTE_DEFAULT;
  return Math.min(NOTE_MAX, Math.max(NOTE_MIN, v));
}

/** The note only carries deduction value if Civils and Undercover actually differ. */
export function notesAreDistinct(civilNote: number, undercoverNote: number): boolean {
  return civilNote !== undercoverNote;
}

/** Uniform random pick among currently alive players, used to designate the theme-setter each round. */
export function pickRandomThemeSetter(aliveIds: string[], random: () => number = Math.random): string {
  const index = Math.floor(random() * aliveIds.length);
  return aliveIds[index];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run test/game/notes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/game/notes.ts server/test/game/notes.test.ts
git commit -m "feat(server): add pure note-mode helpers (clamp, distinctness, random setter)"
```

---

## Task 3: Mr. White numeric guess check (`game/voting.ts`)

**Files:**
- Modify: `server/src/game/voting.ts`
- Modify: `server/test/game/voting.test.ts`

**Interfaces:**
- Produces: `checkMrWhiteNoteGuess(guess: string, civilNote: number): boolean`. Task 7 uses this.

- [ ] **Step 1: Write the failing tests**

Append to `server/test/game/voting.test.ts` (add the import and the new `describe` block):

```ts
import { describe, it, expect } from 'vitest';
import { tallyVotes, checkWinCondition, checkMrWhiteGuess, checkMrWhiteNoteGuess } from '../../src/game/voting';
```

```ts
describe('checkMrWhiteNoteGuess', () => {
  it('matches an exact numeric guess, ignoring surrounding whitespace', () => {
    expect(checkMrWhiteNoteGuess('14', 14)).toBe(true);
    expect(checkMrWhiteNoteGuess('  14 ', 14)).toBe(true);
  });

  it('returns false for a wrong guess', () => {
    expect(checkMrWhiteNoteGuess('12', 14)).toBe(false);
  });

  it('returns false for a non-numeric guess', () => {
    expect(checkMrWhiteNoteGuess('quatorze', 14)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run test/game/voting.test.ts`
Expected: FAIL with "checkMrWhiteNoteGuess is not a function" (or a named-export TS error).

- [ ] **Step 3: Implement in `server/src/game/voting.ts`**

Append at the end of the file:

```ts
export function checkMrWhiteNoteGuess(guess: string, civilNote: number): boolean {
  const parsed = Number(guess.trim());
  return Number.isFinite(parsed) && parsed === civilNote;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run test/game/voting.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/game/voting.ts server/test/game/voting.test.ts
git commit -m "feat(server): add numeric Mr. White guess check for Note mode"
```

---

## Task 4: START_GAME — note assignment & validation

**Files:**
- Modify: `server/src/GameRoom.ts:118-191` (`handleStartGame`)
- Modify: `server/test/GameRoom.flow.test.ts`

**Interfaces:**
- Consumes: `clampNote`, `notesAreDistinct` from `server/src/game/notes.ts` (Task 2).
- Produces: after `START_GAME` with `settings.mode === 'note'`, every player has `role` set, `note` set to `civilNote`/`undercoverNote`/`null` per role, `character`/`characterImage` set to `null`; `room.settings.civilNote`/`undercoverNote` hold the clamped values. Task 5 relies on `room.phase` becoming `'ROLE_REVEAL'` exactly as in classic mode (unchanged).

- [ ] **Step 1: Write the failing tests**

Add to `server/test/GameRoom.flow.test.ts` (near the other `START_GAME`-related tests):

```ts
  it('assigns notes instead of characters when starting a note-mode game', async () => {
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
        type: 'START_GAME',
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note', civilNote: 14, undercoverNote: 10 },
      })
    );
    const snaps = await started;

    for (const [playerId, snap] of Object.entries({ a: snaps[0], b: snaps[1], c: snaps[2] })) {
      expect(snap.phase).toBe('ROLE_REVEAL');
      expect(snap.settings.civilNote).toBe(14);
      expect(snap.settings.undercoverNote).toBe(10);
      const self = snap.players.find((p: any) => p.id === playerId);
      expect(self.character).toBeNull();
      expect([10, 14]).toContain(self.note);
    }
  });

  it('rejects starting a note-mode game when both notes are equal', async () => {
    const code = 'FLOW-NOTE-EQUAL';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    await joinPlayer(stub, code, 'Bob', 'b', false, [wsA]);
    await joinPlayer(stub, code, 'Carl', 'c', false, [wsA]);

    const errorPromise = waitForMessage(wsA);
    wsA.send(
      JSON.stringify({
        type: 'START_GAME',
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note', civilNote: 12, undercoverNote: 12 },
      })
    );
    const errorMsg = await errorPromise;
    expect(errorMsg).toMatchObject({ type: 'ERROR', code: 'CANNOT_START_GAME' });
  });

  it('clamps note-mode notes into [0, 20]', async () => {
    const code = 'FLOW-NOTE-CLAMP';
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note', civilNote: -5, undercoverNote: 999 },
      })
    );
    const [snapA] = await started;
    expect(snapA.settings.civilNote).toBe(0);
    expect(snapA.settings.undercoverNote).toBe(20);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run test/GameRoom.flow.test.ts -t "note-mode"`
Expected: FAIL — notes come back `null`/`undefined` and no `CANNOT_START_GAME` is raised for equal notes, because `handleStartGame` doesn't branch on `mode` yet.

- [ ] **Step 3: Implement in `server/src/GameRoom.ts`**

Add the import:

```ts
import { clampNote, notesAreDistinct } from './game/notes';
```

Replace the body of `handleStartGame` from the `const playerIds = ...` line through the `room.settings = {...}` assignment with:

```ts
    const playerIds = room.players.map((p) => p.id);
    const mode = settings.mode ?? 'classic';
    let selection: ReturnType<typeof selectCharacterPair> | null = null;
    let roles: ReturnType<typeof assignRoles>;
    let civilNote = 0;
    let undercoverNote = 0;
    try {
      // Both branches can throw for invalid combinations (e.g. too few characters in the
      // selected themes, equal notes, or a player/role-count combo that can't guarantee a
      // civilian majority) -- catch here so the host gets a typed error instead of an
      // uncaught exception and a half-started room.
      roles = assignRoles(playerIds, settings);
      if (mode === 'note') {
        civilNote = clampNote(settings.civilNote);
        undercoverNote = clampNote(settings.undercoverNote);
        if (!notesAreDistinct(civilNote, undercoverNote)) {
          throw new Error('Les notes des Civils et des Undercover doivent être différentes');
        }
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
```

Leave the rest of the method (`room.turnOrder = ...` through the trailing `setAlarm` call) unchanged, **except** the `wasRelaxed` check just below, which must now read from `selection`:

```ts
    if (selection?.wasRelaxed) {
      this.sendErrorTo(
        room.hostId,
        'SIMILARITY_RELAXED',
        `Pas assez de personnages pour le niveau demandé, niveau "${selection.levelUsed}" utilisé à la place.`
      );
    }
```

Also add the three new room fields to the mid-method reset block (next to `room.lastEliminatedId = null;`):

```ts
    room.lastEliminatedId = null;
    room.turnDeadline = null;
    room.themeSetterId = null;
    room.currentTheme = null;
    room.themes = [];
    room.phase = 'ROLE_REVEAL';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS, all suites (including the pre-existing classic-mode `START_GAME` tests — `selection` is non-null whenever `mode !== 'note'`, so behavior is unchanged there).

Run: `cd server && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/GameRoom.ts server/test/GameRoom.flow.test.ts
git commit -m "feat(server): assign notes and validate them on START_GAME in Note mode"
```

---

## Task 5: THEME_SELECT phase entry + SUBMIT_THEME → CLUE_ROUND handoff

**Files:**
- Modify: `server/src/GameRoom.ts` (`alarm`'s `ROLE_REVEAL` branch, `webSocketMessage`, new `enterThemeSelect` and `handleSubmitTheme` private methods)
- Modify: `server/test/GameRoom.flow.test.ts`

**Interfaces:**
- Consumes: `pickRandomThemeSetter` from `server/src/game/notes.ts` (Task 2).
- Produces: `enterThemeSelect(room: RoomState): Promise<void>` (private) — sets `room.phase = 'THEME_SELECT'`, `room.themeSetterId`, `room.currentTheme = null`, and schedules the shared turn timer. Task 6 reuses this exact method from `resolveAfterElimination`.

- [ ] **Step 1: Write the failing test**

Add to `server/test/GameRoom.flow.test.ts`:

```ts
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note', civilNote: 14, undercoverNote: 10 },
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note', civilNote: 14, undercoverNote: 10 },
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run test/GameRoom.flow.test.ts -t "THEME_SELECT"`
Expected: FAIL — the room stays in `CLUE_ROUND` after the role-reveal alarm (note mode isn't special-cased yet), and `SUBMIT_THEME` isn't a handled message type.

- [ ] **Step 3: Implement in `server/src/GameRoom.ts`**

Add the import:

```ts
import { clampNote, notesAreDistinct, pickRandomThemeSetter } from './game/notes';
```

In `webSocketMessage`'s `switch`, add a case right after `SUBMIT_CLUE`:

```ts
      case 'SUBMIT_THEME':
        await this.handleSubmitTheme(attachment.playerId, msg.text);
        break;
```

In `alarm()`, replace the `ROLE_REVEAL` branch:

```ts
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
```

Add these two new private methods (e.g. right after `scheduleClueTimeout`):

```ts
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
    room.themes.push({ round: room.round, playerId, text });
    room.currentTheme = text;
    room.phase = 'CLUE_ROUND';
    const aliveIds = new Set(room.players.filter((p) => p.alive).map((p) => p.id));
    room.currentTurnIndex = nextAliveIndex(room.turnOrder, aliveIds, -1);
    await this.scheduleClueTimeout();
    await this.saveRoom();
    this.broadcast();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS, all suites (classic-mode games never see `mode === 'note'`, so `alarm()`'s `ROLE_REVEAL` branch behaves exactly as before for them).

Run: `cd server && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/GameRoom.ts server/test/GameRoom.flow.test.ts
git commit -m "feat(server): add THEME_SELECT phase and SUBMIT_THEME handling"
```

---

## Task 6: Theme-select timeout hand-off + resolve-after-elimination loop-back + mid-pair loop-back

**Files:**
- Modify: `server/src/GameRoom.ts` (`alarm`'s new `THEME_SELECT` branch, `resolveAfterElimination`, `applyClue`'s mid-pair branch)
- Modify: `server/test/GameRoom.flow.test.ts`

**Interfaces:**
- Consumes: `enterThemeSelect` (Task 5), `nextAliveIndex` (existing, from `game/clueRound.ts`).
- Produces: no elimination on a theme-select timeout; `resolveAfterElimination` re-enters `THEME_SELECT` (not `CLUE_ROUND`) when `room.settings.mode === 'note'` and no one has won; `applyClue` also re-enters `THEME_SELECT` (not `CLUE_ROUND`) when a pass completes mid-pair (no vote yet) in note mode.

**Plan note (pre-flight ruling):** the spec requires a **new theme every clue-round pass**, not just once per vote cycle. Task 5 only wires the *first* pass of each pair (`ROLE_REVEAL` → `THEME_SELECT` → `CLUE_ROUND`) and the vote-triggering completion (`CLUE_ROUND` → `VOTE`, unchanged). The transition from the *first* pass's completion into the *second* pass (`applyClue`'s "mid-pair, not yet vote time" branch) was not yet mode-aware — this task fixes that too, alongside the two hand-offs already described. Without this fix, the second test below (which calls `runDurableObjectAlarm` a second time expecting a fresh `THEME_SELECT`) would instead fire the stale `CLUE_ROUND` clue-timeout alarm and eliminate a player.

- [ ] **Step 1: Write the failing tests**

Add to `server/test/GameRoom.flow.test.ts`:

```ts
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note', civilNote: 14, undercoverNote: 10 },
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

  it('returns to THEME_SELECT (not CLUE_ROUND) after an elimination resolves without a winner in note mode', async () => {
    const code = 'FLOW-NOTE-RESOLVE';
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note', civilNote: 14, undercoverNote: 10 },
      })
    );
    const startedSnaps = await started;
    const turnOrder = startedSnaps[0].turnOrder ?? undefined;

    const afterAlarmA = waitForMessage(wsA);
    await runDurableObjectAlarm(stub);
    const themeSelectSnap = await afterAlarmA;
    const setterId = themeSelectSnap.themeSetterId as string;

    const afterTheme = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[setterId].send(JSON.stringify({ type: 'SUBMIT_THEME', text: 'Force brute' }));
    const [clueRoundSnap] = await afterTheme;
    const order = clueRoundSnap.turnOrder as string[];

    await submitFullClueRound(sockets, order, 1);

    // Second theme of the pair.
    const themeSelect2 = await waitForMessage(sockets[order[0]]).catch(() => null); // placeholder, replaced below
  });
```

The second test above needs a second theme-selection round before the vote can happen (2 clue passes per vote, each preceded by its own `THEME_SELECT`). Replace it with this simpler, complete version instead — a 4-player game where the vote outcome is a tie (so `resolveAfterElimination` runs from the tie branch, which is the same code path a clue-timeout elimination would hit):

```ts
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled: false, mode: 'note', civilNote: 14, undercoverNote: 10 },
      })
    );
    await started;

    await playOneThemeAndClueRound(1);
    const voteSnaps = await playOneThemeAndClueRound(2);
    expect(voteSnaps[0].phase).toBe('VOTE');

    // Two players vote for each other -- a 2-2 tie among 4 alive players resolves with no elimination.
    const afterVotes = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    wsA.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: 'b' }));
    wsB.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: 'a' }));
    wsC.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: 'd' }));
    wsD.send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: 'c' }));
    const afterTieSnaps = await afterVotes;

    for (const snap of afterTieSnaps) {
      expect(snap.phase).toBe('THEME_SELECT');
      expect(snap.themeSetterId).toEqual(expect.any(String));
      expect(snap.players.every((p: any) => p.alive)).toBe(true);
    }
  });
```

Remove the earlier, incomplete draft of this test (the one containing the `// placeholder, replaced below` comment) so only the complete version remains.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run test/GameRoom.flow.test.ts -t "THEME_SELECT"`
Expected: FAIL — a theme-select timeout currently does nothing (no `THEME_SELECT` branch in `alarm()`), and a tie resolves into `CLUE_ROUND` instead of `THEME_SELECT`.

- [ ] **Step 3: Implement in `server/src/GameRoom.ts`**

In `alarm()`, add a new branch after the `ELIMINATION` branch and before the `CLUE_ROUND` branch:

```ts
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
```

In `resolveAfterElimination`, replace the tail (everything after `room.round = nextOddRound(room.round);`) with:

```ts
    room.round = nextOddRound(room.round);
    if (room.settings.mode === 'note') {
      await this.enterThemeSelect(room);
      return;
    }
    const aliveIds = new Set(room.players.filter((p) => p.alive).map((p) => p.id));
    room.currentTurnIndex = nextAliveIndex(room.turnOrder, aliveIds, -1);
    room.phase = 'CLUE_ROUND';
    await this.scheduleClueTimeout();
```

In `applyClue`, the mid-pair branch (a pass completed but it isn't vote time yet) currently reads:

```ts
      room.round += 1;
      room.currentTurnIndex = nextAliveIndex(room.turnOrder, aliveIds, -1);
      await this.scheduleClueTimeout();
      await this.saveRoom();
      this.broadcast();
      return;
```

Replace it with:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS, all suites.

Run: `cd server && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/GameRoom.ts server/test/GameRoom.flow.test.ts
git commit -m "feat(server): loop back to THEME_SELECT every pass, timeout, and post-elimination"
```

---

## Task 7: Mr. White numeric guess in Note mode

**Files:**
- Modify: `server/src/GameRoom.ts:303-322` (`handleMrWhiteGuess`)
- Modify: `server/test/GameRoom.flow.test.ts`

**Interfaces:**
- Consumes: `checkMrWhiteNoteGuess` from `server/src/game/voting.ts` (Task 3).

- [ ] **Step 1: Write the failing tests**

Add to `server/test/GameRoom.flow.test.ts`. With `CLUE_ROUNDS_PER_VOTE = 2`, note mode needs **two** full theme+clue-round passes before a vote opens (Task 6 makes every pass go through its own `THEME_SELECT`) — the helper below drives exactly that, then everyone votes Mr. White out:

```ts
  async function startNoteRolesAndReachVote(code: string, mrWhiteEnabled: boolean) {
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
        settings: { themes: [], similarityLevel: 'none', mrWhiteEnabled, mode: 'note', civilNote: 14, undercoverNote: 10 },
      })
    );
    const snaps = await started;
    const roleById: Record<string, string> = {};
    for (const [playerId, snap] of Object.entries({ a: snaps[0], b: snaps[1], c: snaps[2] })) {
      roleById[playerId] = snap.players.find((p: any) => p.id === playerId).role;
    }

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
    return { stub, sockets, roleById, voteSnaps };
  }

  it('lets Mr. White win by guessing the exact civil note', async () => {
    const { sockets, roleById, voteSnaps } = await startNoteRolesAndReachVote('FLOW-NOTE-MRWHITE-WIN', true);
    expect(voteSnaps[0].phase).toBe('VOTE');
    const mrWhiteId = Object.keys(roleById).find((id) => roleById[id] === 'mrwhite')!;

    const otherIds = Object.keys(sockets).filter((id) => id !== mrWhiteId);
    const afterVotes = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    for (const voterId of otherIds) {
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: mrWhiteId }));
    }
    sockets[mrWhiteId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: otherIds[0] }));
    const eliminationSnaps = await afterVotes;
    expect(eliminationSnaps[0].phase).toBe('ELIMINATION');

    const afterGuess = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[mrWhiteId].send(JSON.stringify({ type: 'MR_WHITE_GUESS', guess: '14' }));
    const endSnaps = await afterGuess;
    expect(endSnaps[0].phase).toBe('END');
    expect(endSnaps[0].winner).toBe('mrwhite');
  });

  it('does not let Mr. White win by guessing the wrong note', async () => {
    const { sockets, roleById, voteSnaps } = await startNoteRolesAndReachVote('FLOW-NOTE-MRWHITE-LOSE', true);
    expect(voteSnaps[0].phase).toBe('VOTE');
    const mrWhiteId = Object.keys(roleById).find((id) => roleById[id] === 'mrwhite')!;

    const otherIds = Object.keys(sockets).filter((id) => id !== mrWhiteId);
    const afterVotes = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    for (const voterId of otherIds) {
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: mrWhiteId }));
    }
    sockets[mrWhiteId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: otherIds[0] }));
    await afterVotes;

    const afterGuess = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    sockets[mrWhiteId].send(JSON.stringify({ type: 'MR_WHITE_GUESS', guess: '2' }));
    const afterGuessSnaps = await afterGuess;
    expect(afterGuessSnaps[0].winner).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run test/GameRoom.flow.test.ts -t "Mr. White"`
Expected: FAIL — `handleMrWhiteGuess` still compares against `civilCharacter` (empty string) regardless of mode, so a correct numeric guess doesn't win.

- [ ] **Step 3: Implement in `server/src/GameRoom.ts`**

Add the import:

```ts
import { tallyVotes, checkWinCondition, checkMrWhiteGuess, checkMrWhiteNoteGuess } from './game/voting';
```

Replace the guess-check lines in `handleMrWhiteGuess`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS, all suites.

Run: `cd server && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/GameRoom.ts server/test/GameRoom.flow.test.ts
git commit -m "feat(server): numeric Mr. White guess flow for Note mode"
```

---

## Task 8: RESTART_GAME resets note-mode fields

**Files:**
- Modify: `server/src/GameRoom.ts:324-353` (`handleRestartGame`)
- Modify: `server/test/GameRoom.flow.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `server/test/GameRoom.flow.test.ts`, reusing the `startNoteRolesAndReachVote` helper defined in Task 7 (same file):

```ts
  it('resets note-mode fields when the host restarts a finished note-mode game', async () => {
    const { stub, sockets, roleById, voteSnaps } = await startNoteRolesAndReachVote('FLOW-NOTE-RESTART', false);
    expect(voteSnaps[0].phase).toBe('VOTE');
    const civilId = Object.keys(roleById).find((id) => roleById[id] === 'civil')!;
    const undercoverId = Object.keys(roleById).find((id) => roleById[id] === 'undercover')!;

    const afterVotes = Promise.all(Object.values(sockets).map((s) => waitForMessage(s)));
    Object.keys(sockets).forEach((voterId) => {
      const target = voterId === undercoverId ? civilId : undercoverId;
      sockets[voterId].send(JSON.stringify({ type: 'SUBMIT_VOTE', targetId: target }));
    });
    const afterVoteSnaps = await afterVotes;
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
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `cd server && npx vitest run test/GameRoom.flow.test.ts -t "resets note-mode fields"`
Expected: FAIL — `handleRestartGame` doesn't reset `note`/`themeSetterId`/`currentTheme`/`themes` yet.

- [ ] **Step 3: Implement in `server/src/GameRoom.ts`**

In `handleRestartGame`, update the player-reset loop and the room-reset block:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS, all suites.

Run: `cd server && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/GameRoom.ts server/test/GameRoom.flow.test.ts
git commit -m "feat(server): reset note-mode fields on RESTART_GAME"
```

---

## Task 9: Frontend settings model (`hostSettings.ts`)

**Files:**
- Modify: `web/src/lib/hostSettings.ts`
- Modify: `web/test/lib/hostSettings.test.ts`

**Interfaces:**
- Produces: `GameMode = 'classic' | 'note'` type; `RoomSettings` gains `mode: GameMode`, `civilNote: number`, `undercoverNote: number` (all required, defaulted). Task 10 consumes these.

- [ ] **Step 1: Write the failing tests**

Replace `web/test/lib/hostSettings.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredHostSettings, storeHostSettings } from '@/lib/hostSettings';

describe('host settings storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns sensible defaults when nothing is stored', () => {
    const settings = getStoredHostSettings();
    expect(settings).toEqual({
      themes: [],
      similarityLevel: 'close',
      mrWhiteEnabled: false,
      animeSeries: [],
      clueTimerEnabled: true,
      clueTimerSeconds: 60,
      mode: 'classic',
      civilNote: 14,
      undercoverNote: 10,
    });
  });

  it('stores and retrieves the last used settings', () => {
    storeHostSettings({
      themes: ['anime', 'films'],
      similarityLevel: 'very_close',
      mrWhiteEnabled: true,
      animeSeries: ['one-piece', 'naruto'],
      clueTimerEnabled: false,
      clueTimerSeconds: 45,
      mode: 'note',
      civilNote: 16,
      undercoverNote: 9,
    });
    expect(getStoredHostSettings()).toEqual({
      themes: ['anime', 'films'],
      similarityLevel: 'very_close',
      mrWhiteEnabled: true,
      animeSeries: ['one-piece', 'naruto'],
      clueTimerEnabled: false,
      clueTimerSeconds: 45,
      mode: 'note',
      civilNote: 16,
      undercoverNote: 9,
    });
  });

  it('defaults mode and note fields for settings stored before those fields existed', () => {
    window.localStorage.setItem(
      'undercover:hostSettings',
      JSON.stringify({ themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false })
    );
    const settings = getStoredHostSettings();
    expect(settings.mode).toBe('classic');
    expect(settings.civilNote).toBe(14);
    expect(settings.undercoverNote).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run test/lib/hostSettings.test.ts`
Expected: FAIL — `mode`/`civilNote`/`undercoverNote` are missing from the returned settings.

- [ ] **Step 3: Implement in `web/src/lib/hostSettings.ts`**

```ts
export type SimilarityLevel = 'none' | 'close' | 'very_close';

export type GameMode = 'classic' | 'note';

export const CLUE_TIMER_MIN_SECONDS = 30;
export const CLUE_TIMER_MAX_SECONDS = 90;

export interface RoomSettings {
  themes: string[];
  similarityLevel: SimilarityLevel;
  mrWhiteEnabled: boolean;
  /** Which anime series to draw characters from when 'anime' is in themes. Empty = all. */
  animeSeries: string[];
  /** Whether players get a countdown to submit their clue before being eliminated. */
  clueTimerEnabled: boolean;
  /** Clue submission window in seconds, between CLUE_TIMER_MIN_SECONDS and CLUE_TIMER_MAX_SECONDS. */
  clueTimerSeconds: number;
  /** 'classic' (character-based) or 'note' (numeric-note-based). */
  mode: GameMode;
  /** Note given to Civils in 'note' mode, 0-20. */
  civilNote: number;
  /** Note given to Undercover in 'note' mode, 0-20. */
  undercoverNote: number;
}

const STORAGE_KEY = 'undercover:hostSettings';

const DEFAULT_SETTINGS: RoomSettings = {
  themes: [],
  similarityLevel: 'close',
  mrWhiteEnabled: false,
  animeSeries: [],
  clueTimerEnabled: true,
  clueTimerSeconds: 60,
  mode: 'classic',
  civilNote: 14,
  undercoverNote: 10,
};

export function getStoredHostSettings(): RoomSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function storeHostSettings(settings: RoomSettings): void {
  // Guard against SSR/build-time calls, where `window` doesn't exist yet.
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run test/lib/hostSettings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/hostSettings.ts web/test/lib/hostSettings.test.ts
git commit -m "feat(web): add Note mode fields to host settings storage"
```

---

## Task 10: LobbyScreen — mode selector & note settings panel

**Files:**
- Modify: `web/src/components/LobbyScreen.tsx`
- Modify: `web/test/components/LobbyScreen.test.tsx`

**Interfaces:**
- Consumes: `GameMode` type from `web/src/lib/hostSettings.ts` (Task 9).

- [ ] **Step 1: Write the failing tests**

In `web/test/components/LobbyScreen.test.tsx`, update `baseSettings` to include the new fields:

```ts
const baseSettings = {
  themes: [],
  similarityLevel: 'close' as const,
  mrWhiteEnabled: false,
  animeSeries: [],
  clueTimerEnabled: true,
  clueTimerSeconds: 60,
  mode: 'classic' as const,
  civilNote: 14,
  undercoverNote: 10,
};
```

Add two new tests:

```ts
  it('shows the mode selector, defaulting to the classic settings panel', async () => {
    render(<LobbyScreen isHost={true} code="ABCDE" players={players} settings={baseSettings} onStart={() => {}} onSettingsChange={() => {}} />);
    expect(screen.getByLabelText(/mode de jeu/i)).toHaveValue('classic');
    expect(await screen.findByText(/thèmes/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/note des civils/i)).not.toBeInTheDocument();
  });

  it('switches to the note settings panel and lets the host set both notes', () => {
    const onSettingsChange = vi.fn();
    const { rerender } = render(
      <LobbyScreen isHost={true} code="ABCDE" players={players} settings={baseSettings} onStart={() => {}} onSettingsChange={onSettingsChange} />
    );
    fireEvent.change(screen.getByLabelText(/mode de jeu/i), { target: { value: 'note' } });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'note' }));

    rerender(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        players={players}
        settings={{ ...baseSettings, mode: 'note' }}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />
    );
    expect(screen.queryByText(/thèmes/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/note des civils/i), { target: { value: '16' } });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ civilNote: 16 }));

    fireEvent.change(screen.getByLabelText(/note des undercover/i), { target: { value: '9' } });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ undercoverNote: 9 }));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run test/components/LobbyScreen.test.tsx -t "mode"`
Expected: FAIL — there is no "Mode de jeu" selector yet.

- [ ] **Step 3: Implement in `web/src/components/LobbyScreen.tsx`**

Update the import line:

```tsx
import {
  CLUE_TIMER_MIN_SECONDS,
  CLUE_TIMER_MAX_SECONDS,
  type RoomSettings,
  type SimilarityLevel,
  type GameMode,
} from "@/lib/hostSettings";
```

Insert a mode selector right after `<h3>Réglages</h3>`, and wrap the existing `<fieldset className={styles.themesFieldset}>...</fieldset>` block and the existing similarity `<div className="field">` block each in a `settings.mode !== 'note' &&` guard, and add the note-fields panel in the `else` case. The relevant section becomes:

```tsx
          <h3>Réglages</h3>

          <div className="field">
            <label htmlFor="mode-select">Mode de jeu</label>
            <select
              id="mode-select"
              className="input"
              value={settings.mode}
              onChange={(e) => onSettingsChange({ ...settings, mode: e.target.value as GameMode })}
            >
              <option value="classic">Classique</option>
              <option value="note">Note</option>
            </select>
          </div>

          {settings.mode === "note" ? (
            <div className="field">
              <label htmlFor="civil-note-input">Note des Civils (0-20)</label>
              <input
                id="civil-note-input"
                type="number"
                min={0}
                max={20}
                className="input"
                value={settings.civilNote}
                onChange={(e) => onSettingsChange({ ...settings, civilNote: Number(e.target.value) })}
              />
              <label htmlFor="undercover-note-input">Note des Undercover (0-20)</label>
              <input
                id="undercover-note-input"
                type="number"
                min={0}
                max={20}
                className="input"
                value={settings.undercoverNote}
                onChange={(e) => onSettingsChange({ ...settings, undercoverNote: Number(e.target.value) })}
              />
            </div>
          ) : (
            <>
              <fieldset className={styles.themesFieldset}>
                {/* ... unchanged contents: legend, catalog loading/error, theme cards with series pickers ... */}
              </fieldset>

              <div className="field">
                <label htmlFor="similarity-select">Similarité</label>
                <select
                  id="similarity-select"
                  className="input"
                  value={settings.similarityLevel}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      similarityLevel: e.target.value as SimilarityLevel,
                    })
                  }
                >
                  <option value="none">Aucun lien</option>
                  <option value="close">Proche</option>
                  <option value="very_close">Très proche</option>
                </select>
              </div>
            </>
          )}

          <label htmlFor="mrwhite-checkbox" className="checkboxRow">
            {/* ... unchanged ... */}
          </label>

          <div className="field">
            {/* ... unchanged timer checkbox + slider ... */}
          </div>
```

Everything marked "unchanged" keeps its exact existing JSX from the current file — only the wrapping (fieldset + similarity select now inside the `<>...</>` else-branch, mode selector and note panel newly inserted above them) changes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run test/components/LobbyScreen.test.tsx`
Expected: PASS, all tests in the file (the pre-existing classic-mode tests keep passing because `baseSettings.mode` defaults to `'classic'`).

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/LobbyScreen.tsx web/test/components/LobbyScreen.test.tsx
git commit -m "feat(web): add mode selector and note settings panel to the lobby"
```

---

## Task 11: RoleRevealScreen & RoleBanner — note variant

**Files:**
- Modify: `web/src/components/RoleRevealScreen.tsx`
- Modify: `web/test/components/RoleRevealScreen.test.tsx`
- Modify: `web/src/components/RoleBanner.tsx`
- Create: `web/test/components/RoleBanner.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `web/test/components/RoleRevealScreen.test.tsx`:

```ts
  it('shows the note instead of the character when a note is provided', () => {
    render(<RoleRevealScreen role="civil" character={null} note={14} />);
    expect(screen.getByText(/ta note : 14\/20/i)).toBeInTheDocument();
  });

  it('colors the role red for an undercover even in note mode', () => {
    render(<RoleRevealScreen role="undercover" character={null} note={10} />);
    expect(screen.getByText(/ta note : 10\/20/i)).toBeInTheDocument();
    expect(screen.getByText(/undercover/i)).toBeInTheDocument();
  });
```

Create `web/test/components/RoleBanner.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleBanner } from '@/components/RoleBanner';

describe('RoleBanner', () => {
  it('renders nothing when there is no role yet', () => {
    const { container } = render(<RoleBanner role={null} character={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the character for classic mode', () => {
    render(<RoleBanner role="civil" character="Goku" />);
    expect(screen.getByText(/goku/i)).toBeInTheDocument();
  });

  it('shows the note instead of the character in note mode', () => {
    render(<RoleBanner role="civil" character={null} note={14} />);
    expect(screen.getByText(/14\/20/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run test/components/RoleRevealScreen.test.tsx test/components/RoleBanner.test.tsx`
Expected: FAIL — neither component accepts a `note` prop yet.

- [ ] **Step 3: Implement in `web/src/components/RoleRevealScreen.tsx`**

```tsx
'use client';
import styles from './RoleRevealScreen.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface RoleRevealScreenProps {
  role: Role | null;
  character: string | null;
  characterImage?: string | null;
  note?: number | null;
}

const ROLE_LABEL: Record<Role, string> = {
  civil: 'Civil',
  undercover: 'Undercover',
  mrwhite: 'Mr. White',
};

export function RoleRevealScreen({ role, character, characterImage, note }: RoleRevealScreenProps) {
  if (!role) return <p className="muted">Chargement de ton rôle...</p>;

  if (role === 'mrwhite') {
    return (
      <div>
        <span className="eyebrow">Dossier confidentiel</span>
        <h2>Tu es Mr. White</h2>
        <div className={styles.dossier}>
          <div className={styles.censorBar} />
          <div className={`${styles.censorBar} ${styles.censorBarShort}`} />
          <p className={styles.blank}>Identité classifiée</p>
        </div>
        <p className={styles.helper}>Tu n'as aucun personnage. Bluffe pour ne pas te faire repérer !</p>
      </div>
    );
  }

  return (
    <div>
      <span className="eyebrow">Dossier confidentiel</span>
      <h2>
        Tu es{' '}
        <span className={role === 'undercover' ? styles.roleUndercover : undefined}>
          {ROLE_LABEL[role]}
        </span>
      </h2>
      {note != null ? (
        <div className={styles.dossier}>
          <p className={styles.identity}>Ta note : {note}/20</p>
        </div>
      ) : (
        <div className={`${styles.dossier} ${styles.dossierRow}`}>
          {characterImage && (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked from arbitrary external sources
            <img
              src={characterImage}
              alt={character ?? 'Personnage'}
              className={styles.photo}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <div className={styles.dossierText}>
            <div className={styles.censorBar} />
            <p className={styles.identity}>{character}</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement in `web/src/components/RoleBanner.tsx`**

```tsx
'use client';
import styles from './RoleBanner.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface RoleBannerProps {
  role: Role | null;
  character: string | null;
  characterImage?: string | null;
  note?: number | null;
}

const ROLE_LABEL: Record<Role, string> = {
  civil: 'Civil',
  undercover: 'Undercover',
  mrwhite: 'Mr. White',
};

export function RoleBanner({ role, character, characterImage, note }: RoleBannerProps) {
  if (!role) return null;

  return (
    <div className={styles.banner}>
      {characterImage && note == null && (
        // eslint-disable-next-line @next/next/no-img-element -- hotlinked from arbitrary external sources
        <img
          src={characterImage}
          alt={character ?? 'Personnage'}
          className={styles.photo}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
      <span className="muted">Ton rôle : </span>
      <span className={role === 'undercover' ? styles.undercover : styles.role}>{ROLE_LABEL[role]}</span>
      {character && <span className={styles.word}> — {character}</span>}
      {note != null && <span className={styles.word}> — {note}/20</span>}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && npx vitest run test/components/RoleRevealScreen.test.tsx test/components/RoleBanner.test.tsx`
Expected: PASS.

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/RoleRevealScreen.tsx web/test/components/RoleRevealScreen.test.tsx web/src/components/RoleBanner.tsx web/test/components/RoleBanner.test.tsx
git commit -m "feat(web): show the note instead of the character in Note mode"
```

---

## Task 12: RoundRecapTable — theme subtitle per round

**Files:**
- Modify: `web/src/components/RoundRecapTable.tsx`
- Modify: `web/src/components/RoundRecapTable.module.css`
- Modify: `web/test/components/RoundRecapTable.test.tsx`

**Interfaces:**
- Produces: `RoundRecapTableProps` gains optional `themes?: { round: number; text: string }[]`. Task 13 (`ThemeSelectScreen`) and Task 16 (`GameApp` wiring through `ClueRoundScreen`/`VoteScreen`) pass this through.

- [ ] **Step 1: Write the failing test**

Add to `web/test/components/RoundRecapTable.test.tsx`:

```ts
  it('shows the theme as a subtitle under the round header when provided', () => {
    render(
      <RoundRecapTable
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        totalRounds={2}
        themes={[{ round: 1, text: 'La force brute' }]}
      />
    );
    expect(screen.getByText('La force brute')).toBeInTheDocument();
  });

  it('renders no theme subtitle for a round with no theme entry', () => {
    render(
      <RoundRecapTable players={players} turnOrder={turnOrder} clues={clues} totalRounds={1} themes={[]} />
    );
    expect(screen.getByText('Manche 1')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run test/components/RoundRecapTable.test.tsx -t "theme"`
Expected: FAIL — `themes` isn't an accepted prop, and no subtitle renders.

- [ ] **Step 3: Implement in `web/src/components/RoundRecapTable.tsx`**

```tsx
'use client';
import styles from './RoundRecapTable.module.css';

interface Player {
  id: string;
  name: string;
}

interface Clue {
  playerId: string;
  round: number;
  text: string;
}

interface ThemeEntry {
  round: number;
  text: string;
}

interface RoundRecapTableProps {
  players: Player[];
  turnOrder: string[];
  clues: Clue[];
  totalRounds: number;
  currentTurnPlayerId?: string | null;
  votableIds?: Set<string>;
  selectedId?: string | null;
  onVote?: (playerId: string) => void;
  themes?: ThemeEntry[];
}

export function RoundRecapTable({
  players,
  turnOrder,
  clues,
  totalRounds,
  currentTurnPlayerId = null,
  votableIds,
  selectedId = null,
  onVote,
  themes,
}: RoundRecapTableProps) {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.flagCell} />
            <th className={styles.nameCell}>Joueur</th>
            {rounds.map((r) => {
              const theme = themes?.find((t) => t.round === r);
              return (
                <th key={r} className={styles.clueCell}>
                  Manche {r}
                  {theme && <div className={styles.themeSubtitle}>{theme.text}</div>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {turnOrder.map((playerId) => {
            const player = players.find((p) => p.id === playerId);
            if (!player) return null;
            const isTurn = playerId === currentTurnPlayerId;
            const isVotable = votableIds?.has(playerId) ?? false;
            const isSelected = playerId === selectedId;

            return (
              <tr key={playerId} className={isTurn ? styles.rowActive : undefined}>
                <td className={styles.flagCell}>{isTurn && <span aria-label="C'est son tour">🚩</span>}</td>
                <td className={styles.nameCell}>
                  {isVotable ? (
                    <button
                      onClick={() => onVote?.(playerId)}
                      className={`btn btnBlock ${isSelected ? styles.selected : 'btnGhost'}`}
                    >
                      {player.name}
                      {isSelected && <span className={styles.check}> ✓</span>}
                    </button>
                  ) : (
                    player.name
                  )}
                </td>
                {rounds.map((r) => {
                  const clue = clues.find((c) => c.playerId === playerId && c.round === r);
                  return (
                    <td key={r} className={styles.clueCell}>
                      {clue ? clue.text || '(pas de réponse)' : '…'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Add the subtitle style to `web/src/components/RoundRecapTable.module.css`**

Append:

```css
.themeSubtitle {
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
  color: var(--text-muted);
  font-size: 0.7rem;
  margin-top: 0.15rem;
  white-space: normal;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && npx vitest run test/components/RoundRecapTable.test.tsx`
Expected: PASS, all tests in the file.

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/RoundRecapTable.tsx web/src/components/RoundRecapTable.module.css web/test/components/RoundRecapTable.test.tsx
git commit -m "feat(web): show the round's theme as a subtitle in the recap table"
```

---

## Task 13: New `ThemeSelectScreen` component

**Files:**
- Create: `web/src/components/ThemeSelectScreen.tsx`
- Create: `web/src/components/ThemeSelectScreen.module.css`
- Create: `web/test/components/ThemeSelectScreen.test.tsx`

**Interfaces:**
- Consumes: `RoundRecapTable` (with `themes` prop from Task 12).
- Produces: `ThemeSelectScreen` component, used by Task 16 in `GameApp.tsx` for the `THEME_SELECT` phase.

- [ ] **Step 1: Write the failing tests**

Create `web/test/components/ThemeSelectScreen.test.tsx`:

```tsx
import { describe, it, expect, vi, act } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeSelectScreen } from '@/components/ThemeSelectScreen';

const players = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
];

describe('ThemeSelectScreen', () => {
  it("shows who is choosing the theme when it isn't the viewer's turn", () => {
    render(
      <ThemeSelectScreen
        players={players}
        turnOrder={['p1', 'p2']}
        clues={[]}
        themes={[]}
        round={1}
        themeSetterId="p2"
        selfId="p1"
        onSubmitTheme={() => {}}
      />
    );
    expect(screen.getByText(/en attente du thème de bob/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /envoyer/i })).not.toBeInTheDocument();
  });

  it('shows an input and submits a theme when it is the viewer\'s turn', () => {
    const onSubmitTheme = vi.fn();
    render(
      <ThemeSelectScreen
        players={players}
        turnOrder={['p1', 'p2']}
        clues={[]}
        themes={[]}
        round={1}
        themeSetterId="p1"
        selfId="p1"
        onSubmitTheme={onSubmitTheme}
      />
    );
    fireEvent.change(screen.getByLabelText(/propose un thème/i), { target: { value: 'La force brute' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));
    expect(onSubmitTheme).toHaveBeenCalledWith('La force brute');
  });

  it('shows the recap table with past rounds only, not the round in progress', () => {
    render(
      <ThemeSelectScreen
        players={players}
        turnOrder={['p1', 'p2']}
        clues={[{ playerId: 'p1', round: 1, text: 'fort' }]}
        themes={[{ round: 1, playerId: 'p2', text: 'theme-1' }]}
        round={2}
        themeSetterId="p2"
        selfId="p1"
        onSubmitTheme={() => {}}
      />
    );
    expect(screen.getByText('Manche 1')).toBeInTheDocument();
    expect(screen.queryByText('Manche 2')).not.toBeInTheDocument();
  });

  it('shows a countdown derived from the turn deadline', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      render(
        <ThemeSelectScreen
          players={players}
          turnOrder={['p1', 'p2']}
          clues={[]}
          themes={[]}
          round={1}
          themeSetterId="p2"
          turnDeadline={Date.now() + 42_000}
          selfId="p1"
          onSubmitTheme={() => {}}
        />
      );
      expect(screen.getByText(/42s/)).toBeInTheDocument();

      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 5));
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(screen.getByText(/37s/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run test/components/ThemeSelectScreen.test.tsx`
Expected: FAIL with "Cannot find module '@/components/ThemeSelectScreen'".

- [ ] **Step 3: Implement `web/src/components/ThemeSelectScreen.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { RoundRecapTable } from './RoundRecapTable';
import styles from './ThemeSelectScreen.module.css';

interface Player { id: string; name: string; }
interface Clue { playerId: string; round: number; text: string; }
interface ThemeEntry { round: number; playerId: string; text: string; }

interface ThemeSelectScreenProps {
  players: Player[];
  turnOrder: string[];
  clues: Clue[];
  themes: ThemeEntry[];
  round: number;
  themeSetterId: string | null;
  turnDeadline?: number | null;
  selfId: string;
  onSubmitTheme: (text: string) => void;
}

const URGENT_THRESHOLD_SECONDS = 10;

export function ThemeSelectScreen({ players, turnOrder, clues, themes, round, themeSetterId, turnDeadline, selfId, onSubmitTheme }: ThemeSelectScreenProps) {
  const [draft, setDraft] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const setter = players.find((p) => p.id === themeSetterId);
  const isMyTurn = themeSetterId === selfId;

  useEffect(() => {
    if (!turnDeadline) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000)));
    tick();
    const intervalId = setInterval(tick, 250);
    return () => clearInterval(intervalId);
  }, [turnDeadline]);

  return (
    <div>
      <div className={styles.header}>
        <span className="eyebrow">Manche {round}</span>
        {secondsLeft !== null && (
          <span className={`${styles.timer}${secondsLeft <= URGENT_THRESHOLD_SECONDS ? ` ${styles.timerUrgent}` : ''}`}>
            ⏱ {secondsLeft}s
          </span>
        )}
      </div>
      <h2>Thème</h2>
      {round > 1 && (
        <RoundRecapTable players={players} turnOrder={turnOrder} clues={clues} themes={themes} totalRounds={round - 1} />
      )}
      {isMyTurn ? (
        <form className="field" onSubmit={(e) => { e.preventDefault(); onSubmitTheme(draft); setDraft(''); }}>
          <label htmlFor="theme-input">Propose un thème</label>
          <input
            id="theme-input"
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ex. La puissance d'un épéiste de One Piece"
          />
          <button type="submit" className="btn btnBlock">Envoyer</button>
        </form>
      ) : (
        <p className="muted">En attente du thème de {setter?.name}...</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `web/src/components/ThemeSelectScreen.module.css`**

```css
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.timer {
  font-family: var(--font-display);
  font-size: 1rem;
  color: var(--accent-strong);
  border: 1.5px solid var(--accent);
  border-radius: 999px;
  padding: 0.15rem 0.7rem;
  white-space: nowrap;
}

.timerUrgent {
  color: var(--danger-strong);
  border-color: var(--danger-strong);
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && npx vitest run test/components/ThemeSelectScreen.test.tsx`
Expected: PASS.

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/ThemeSelectScreen.tsx web/src/components/ThemeSelectScreen.module.css web/test/components/ThemeSelectScreen.test.tsx
git commit -m "feat(web): add ThemeSelectScreen for the Note-mode theme-announcement phase"
```

---

## Task 14: EliminationScreen — numeric Mr. White guess

**Files:**
- Modify: `web/src/components/EliminationScreen.tsx`
- Modify: `web/test/components/EliminationScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `web/test/components/EliminationScreen.test.tsx`:

```ts
  it('reveals the eliminated player note when present, instead of a character', () => {
    const notePlayers = [
      { id: 'p1', name: 'Alice', alive: true, role: null, character: null, note: null },
      { id: 'p2', name: 'Bob', alive: false, role: 'undercover' as const, character: null, note: 10 },
    ];
    render(<EliminationScreen players={notePlayers} lastEliminatedId="p2" selfId="p1" onMrWhiteGuess={() => {}} />);
    expect(screen.getByText(/10\/20/)).toBeInTheDocument();
  });

  it('shows a numeric guess field to the eliminated Mr. White in note mode', () => {
    const mrWhitePlayers = [
      { id: 'p1', name: 'Alice', alive: true, role: null, character: null, note: null },
      { id: 'p2', name: 'Bob', alive: false, role: 'mrwhite' as const, character: null, note: null },
    ];
    const onMrWhiteGuess = vi.fn();
    render(<EliminationScreen players={mrWhitePlayers} lastEliminatedId="p2" selfId="p2" mode="note" onMrWhiteGuess={onMrWhiteGuess} />);
    const input = screen.getByLabelText(/devine la note/i);
    expect(input).toHaveAttribute('type', 'number');
    fireEvent.change(input, { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: /deviner/i }));
    expect(onMrWhiteGuess).toHaveBeenCalledWith('14');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run test/components/EliminationScreen.test.tsx -t "note"`
Expected: FAIL — no `note` field is read, no `mode` prop exists, and the guess field is always a text input labeled "Devine le personnage".

- [ ] **Step 3: Implement in `web/src/components/EliminationScreen.tsx`**

```tsx
'use client';
import { useState } from 'react';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface Player {
  id: string;
  name: string;
  alive: boolean;
  role: Role | null;
  character: string | null;
  note?: number | null;
}

interface EliminationScreenProps {
  players: Player[];
  lastEliminatedId: string | null;
  selfId: string;
  mode?: 'classic' | 'note';
  onMrWhiteGuess: (guess: string) => void;
}

const ROLE_LABEL: Record<Role, string> = {
  civil: 'un Civil',
  undercover: 'un Undercover',
  mrwhite: 'Mr. White',
};

export function EliminationScreen({ players, lastEliminatedId, selfId, mode = 'classic', onMrWhiteGuess }: EliminationScreenProps) {
  const [guess, setGuess] = useState('');
  const eliminated = players.find((p) => p.id === lastEliminatedId);

  if (!eliminated) return <p className="muted">Personne n'a été éliminé ce tour-ci.</p>;

  const isSelfMrWhiteAwaitingGuess = eliminated.id === selfId && eliminated.role === 'mrwhite';
  const revealedDetail = eliminated.character
    ? ` (${eliminated.character})`
    : eliminated.note != null
      ? ` (${eliminated.note}/20)`
      : '';

  return (
    <div>
      <span className="eyebrow">Verdict</span>
      <h2>
        {eliminated.name} <span className="stamp">Éliminé</span>
      </h2>
      <p className="muted">
        C'était {eliminated.role ? ROLE_LABEL[eliminated.role] : ''}
        {revealedDetail}
      </p>

      {isSelfMrWhiteAwaitingGuess && (
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            onMrWhiteGuess(guess);
          }}
        >
          {mode === 'note' ? (
            <>
              <label htmlFor="guess-input">Devine la note des Civils (0-20)</label>
              <input
                id="guess-input"
                type="number"
                min={0}
                max={20}
                className="input"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
              />
            </>
          ) : (
            <>
              <label htmlFor="guess-input">Devine le personnage des Civils</label>
              <input id="guess-input" className="input" value={guess} onChange={(e) => setGuess(e.target.value)} />
            </>
          )}
          <button type="submit" className="btn btnBlock">
            Deviner
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run test/components/EliminationScreen.test.tsx`
Expected: PASS, all tests in the file (existing classic-mode tests keep passing since `mode` defaults to `'classic'`).

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/EliminationScreen.tsx web/test/components/EliminationScreen.test.tsx
git commit -m "feat(web): numeric Mr. White guess field and note reveal in EliminationScreen"
```

---

## Task 15: EndScreen — reveal notes

**Files:**
- Modify: `web/src/components/EndScreen.tsx`
- Modify: `web/test/components/EndScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `web/test/components/EndScreen.test.tsx`:

```ts
  it('reveals notes instead of characters when players carry a note', () => {
    const notePlayers = [
      { id: 'p1', name: 'Alice', role: 'civil' as const, character: null, note: 14 },
      { id: 'p2', name: 'Bob', role: 'undercover' as const, character: null, note: 10 },
    ];
    render(<EndScreen winner="civil" players={notePlayers} isHost={false} onRestart={() => {}} onLeave={() => {}} />);
    expect(screen.getByText(/14\/20/)).toBeInTheDocument();
    expect(screen.getByText(/10\/20/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `cd web && npx vitest run test/components/EndScreen.test.tsx -t "note"`
Expected: FAIL — `note` isn't read anywhere.

- [ ] **Step 3: Implement in `web/src/components/EndScreen.tsx`**

```tsx
'use client';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface Player {
  id: string;
  name: string;
  role: Role | null;
  character: string | null;
  note?: number | null;
}

interface EndScreenProps {
  winner: Role | null;
  players: Player[];
  isHost: boolean;
  onRestart: () => void;
  onLeave: () => void;
}

const WINNER_LABEL: Record<Role, string> = {
  civil: 'Les Civils gagnent !',
  undercover: 'Les Undercover gagnent !',
  mrwhite: 'Mr. White gagne !',
};

export function EndScreen({ winner, players, isHost, onRestart, onLeave }: EndScreenProps) {
  return (
    <div>
      <span className="eyebrow">Affaire classée</span>
      <h2>{winner ? WINNER_LABEL[winner] : 'Partie terminée'}</h2>
      <ul className="roster">
        {players.map((p) => (
          <li key={p.id} className="rosterItem">
            <span>{p.name}</span>
            <span className="muted">
              {p.role} {p.character ? `(${p.character})` : p.note != null ? `(${p.note}/20)` : ''}
            </span>
          </li>
        ))}
      </ul>

      {isHost ? (
        <button onClick={onRestart} className="btn btnBlock">
          Rejouer
        </button>
      ) : (
        <p className="muted">En attente que l'hôte relance une partie...</p>
      )}
      <button onClick={onLeave} className="btn btnGhost btnBlock">
        Quitter
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run test/components/EndScreen.test.tsx`
Expected: PASS, all tests in the file.

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/EndScreen.tsx web/test/components/EndScreen.test.tsx
git commit -m "feat(web): reveal notes instead of characters on the end screen"
```

---

## Task 16: Wire everything together in `GameApp`

**Files:**
- Modify: `web/src/components/GameApp.tsx`
- Modify: `web/src/components/ClueRoundScreen.tsx` (forward a `themes` prop to `RoundRecapTable`)
- Modify: `web/src/components/VoteScreen.tsx` (forward a `themes` prop to `RoundRecapTable`)
- Modify: `web/test/components/GameApp.test.tsx`

**Interfaces:**
- Consumes: `ThemeSelectScreen` (Task 13), `RoundRecapTable`'s `themes` prop (Task 12), `note`/`mode` props on `RoleRevealScreen`/`RoleBanner`/`EliminationScreen`/`EndScreen` (Tasks 11, 14, 15).

- [ ] **Step 1: Write the failing test**

Add to `web/test/components/GameApp.test.tsx`:

```ts
  it('renders ThemeSelectScreen during THEME_SELECT and sends SUBMIT_THEME on submit', () => {
    window.localStorage.setItem('undercover:clientId', 'p1');
    const send = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        send,
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'THEME_SELECT',
          hostId: 'p1',
          settings: { mode: 'note' },
          turnOrder: ['p1', 'p2'],
          themeSetterId: 'p1',
          currentTheme: null,
          themes: [],
          clues: [],
          round: 1,
          players: [
            { id: 'p1', name: 'Alice', alive: true, connected: true },
            { id: 'p2', name: 'Bob', alive: true, connected: true },
          ],
        },
      })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Alice" isHost={false} onLeaveRoom={() => {}} />);
    fireEvent.change(screen.getByLabelText(/propose un thème/i), { target: { value: 'La force' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));
    expect(send).toHaveBeenCalledWith({ type: 'SUBMIT_THEME', text: 'La force' });
  });

  it('shows the note instead of the character during ROLE_REVEAL in note mode', () => {
    window.localStorage.setItem('undercover:clientId', 'c1');
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'ROLE_REVEAL',
          hostId: 'c1',
          settings: { mode: 'note' },
          players: [{ id: 'c1', name: 'Seb', alive: true, connected: true, role: 'civil', character: null, note: 14 }],
        },
      })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={() => {}} />);
    expect(screen.getByText(/ta note : 14\/20/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run test/components/GameApp.test.tsx -t "THEME_SELECT"`
Run: `cd web && npx vitest run test/components/GameApp.test.tsx -t "note instead"`
Expected: FAIL — `THEME_SELECT` currently falls through to the generic "Connecté (...)" fallback, and `RoleRevealScreen` isn't passed a `note` prop.

- [ ] **Step 3: Implement in `web/src/components/GameApp.tsx`**

Add the import:

```tsx
import { ThemeSelectScreen } from '@/components/ThemeSelectScreen';
```

Update the role-banner phase list:

```tsx
const PHASES_WITH_ROLE_BANNER = ['THEME_SELECT', 'CLUE_ROUND', 'VOTE', 'ELIMINATION'];
```

Pass `note` through to `RoleRevealScreen` and the persistent `RoleBanner`:

```tsx
    if (roomState.phase === 'ROLE_REVEAL') {
      return (
        <RoleRevealScreen
          role={me?.role ?? null}
          character={me?.character ?? null}
          characterImage={me?.characterImage ?? null}
          note={me?.note ?? null}
        />
      );
    }
```

```tsx
        {roomState && PHASES_WITH_ROLE_BANNER.includes(roomState.phase) && (
          <RoleBanner
            role={me?.role ?? null}
            character={me?.character ?? null}
            characterImage={me?.characterImage ?? null}
            note={me?.note ?? null}
          />
        )}
```

Add a new branch for `THEME_SELECT`, right before the `CLUE_ROUND` branch:

```tsx
    if (roomState.phase === 'THEME_SELECT') {
      return (
        <ThemeSelectScreen
          players={roomState.players}
          turnOrder={roomState.turnOrder}
          clues={roomState.clues}
          themes={roomState.themes}
          round={roomState.round}
          themeSetterId={roomState.themeSetterId}
          turnDeadline={roomState.turnDeadline}
          selfId={getOrCreateClientId()}
          onSubmitTheme={(text) => send({ type: 'SUBMIT_THEME', text })}
        />
      );
    }
```

Forward `themes` into `ClueRoundScreen` and `VoteScreen`:

```tsx
    if (roomState.phase === 'CLUE_ROUND') {
      return (
        <ClueRoundScreen
          players={roomState.players}
          turnOrder={roomState.turnOrder}
          currentTurnIndex={roomState.currentTurnIndex}
          clues={roomState.clues}
          round={roomState.round}
          turnDeadline={roomState.turnDeadline}
          themes={roomState.themes}
          selfId={getOrCreateClientId()}
          onSubmitClue={(text) => send({ type: 'SUBMIT_CLUE', text })}
        />
      );
    }
    if (roomState.phase === 'VOTE') {
      return (
        <VoteScreen
          players={roomState.players}
          turnOrder={roomState.turnOrder}
          clues={roomState.clues}
          round={roomState.round}
          themes={roomState.themes}
          selfId={getOrCreateClientId()}
          onVote={(targetId) => send({ type: 'SUBMIT_VOTE', targetId })}
        />
      );
    }
```

Pass `mode` into `EliminationScreen`:

```tsx
    if (roomState.phase === 'ELIMINATION') {
      return (
        <EliminationScreen
          players={roomState.players}
          lastEliminatedId={roomState.lastEliminatedId}
          selfId={getOrCreateClientId()}
          mode={roomState.settings?.mode}
          onMrWhiteGuess={(guess) => send({ type: 'MR_WHITE_GUESS', guess })}
        />
      );
    }
```

- [ ] **Step 4: Add a `themes` prop to `ClueRoundScreen`**

In `web/src/components/ClueRoundScreen.tsx`, add `themes?: { round: number; text: string }[]` to `ClueRoundScreenProps`, thread it through the function signature, and pass it to `RoundRecapTable`:

```tsx
interface ThemeEntry { round: number; text: string; }

interface ClueRoundScreenProps {
  players: Player[];
  turnOrder: string[];
  currentTurnIndex: number;
  clues: Clue[];
  round: number;
  turnDeadline?: number | null;
  themes?: ThemeEntry[];
  selfId: string;
  onSubmitClue: (text: string) => void;
}
```

```tsx
export function ClueRoundScreen({ players, turnOrder, currentTurnIndex, clues, round, turnDeadline, themes, selfId, onSubmitClue }: ClueRoundScreenProps) {
```

```tsx
      <RoundRecapTable
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        totalRounds={round}
        currentTurnPlayerId={currentPlayerId}
        themes={themes}
      />
```

- [ ] **Step 5: Add a `themes` prop to `VoteScreen`**

In `web/src/components/VoteScreen.tsx`, add `themes?: { round: number; text: string }[]` to `VoteScreenProps`, thread it through, and pass it to `RoundRecapTable`:

```tsx
interface ThemeEntry { round: number; text: string; }

interface VoteScreenProps {
  players: Player[];
  turnOrder: string[];
  clues: Clue[];
  round: number;
  themes?: ThemeEntry[];
  selfId: string;
  onVote: (targetId: string) => void;
}

export function VoteScreen({ players, turnOrder, clues, round, themes, selfId, onVote }: VoteScreenProps) {
```

```tsx
      <RoundRecapTable
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        totalRounds={round}
        votableIds={votableIds}
        selectedId={votedForId}
        onVote={handleVote}
        themes={themes}
      />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd web && npx vitest run`
Expected: PASS, all suites.

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/GameApp.tsx web/src/components/ClueRoundScreen.tsx web/src/components/VoteScreen.tsx web/test/components/GameApp.test.tsx
git commit -m "feat(web): wire ThemeSelectScreen and note/theme props into GameApp"
```

---

## Final Verification

- [ ] Run the full backend suite: `cd server && npx vitest run && npx tsc --noEmit` — expect all tests passing, no type errors.
- [ ] Run the full frontend suite: `cd web && npx vitest run && npx tsc --noEmit` — expect all tests passing, no type errors.
- [ ] Manually smoke-test in the browser (both dev servers running): create a Note-mode room with 3+ tabs, verify the mode selector, notes assignment, theme submission (including a timeout hand-off), a full clue round, a vote, an elimination reveal (including a Mr. White numeric guess if enabled), and the end screen's note reveal.
