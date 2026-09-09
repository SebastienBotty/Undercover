# Undercover — Mode Classique (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully working online multiplayer Undercover game (classic mode: Civils / Undercover / optional Mr. White, with character+tag based word pairs) with a Next.js frontend and a Cloudflare Workers + Durable Objects realtime backend.

**Architecture:** Two independent npm projects in one repo — `server/` (Cloudflare Worker + one `GameRoom` Durable Object per room, holding authoritative game state, talking to clients over native WebSockets) and `web/` (Next.js app, single-page client that connects to the room's WebSocket and renders a screen per game phase). All game logic (role assignment, character-pair selection, turn order, voting, win conditions) lives in small pure TypeScript functions on the server, unit-tested in isolation; the Durable Object is a thin wiring layer over them.

**Tech Stack:** TypeScript everywhere. Backend: Cloudflare Workers, Durable Objects (WebSocket Hibernation API + Alarms), Wrangler, Vitest + `@cloudflare/vitest-pool-workers`. Frontend: Next.js (App Router), React, Vitest + React Testing Library + jsdom. No database, no auth — `localStorage` for pseudo/settings/client identity. Package manager: npm.

**Spec:** `docs/superpowers/specs/2026-09-09-classic-mode-design.md`

## Global Constraints

- 3 to 10 players per room (spec: "Salle & joueurs").
- Similarity levels are exactly three buckets: `none` (0 shared tags), `close` (1-2 shared tags), `very_close` (3+ shared tags) — spec: "Sélection des personnages".
- If no character pair matches the requested similarity level, automatically relax one level toward `none` and notify the host — spec: "Sélection des personnages" (confirmed in chat: "On assouplit mais on prévient l'hôte").
- Clue turn timeout is 60 seconds; on timeout the turn auto-advances with an empty clue — spec: "Machine à états" (confirmed in chat: "Maximum 1m pour donner l'indice").
- Pseudo and host room settings are persisted in `localStorage`, pre-filled on return, editable — spec: "Onboarding & mémorisation locale" (confirmed in chat).
- Room codes are 4-6 characters — spec: "Salle & joueurs". This plan uses 5 characters from an ambiguity-free alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no `0/O/1/I`).
- Undercover count is 1 for 3-6 players and 2 for 7-10 players. The spec leaves this open ("1 ou plusieurs selon le nombre de joueurs"); this is the concrete rule this plan implements — call it out to the user as a decision they can tune later.
- No accounts, no persistence beyond a room's lifetime, no configurable timer, no automated end-to-end tests — all explicitly out of scope in the spec.

---

## File Structure

```
Undercover/
  server/                        # Cloudflare Worker + Durable Objects
    package.json
    tsconfig.json
    wrangler.toml
    vitest.config.ts
    src/
      types.ts                   # shared domain types (Task 1)
      messages.ts                # WebSocket protocol types (Task 1)
      worker.ts                  # fetch handler / routing (Task 1, extended Task 9)
      GameRoom.ts                # Durable Object (Task 7, extended Task 8)
      characters/
        types.ts                 # Character type (Task 2)
        data.ts                  # starter character dataset (Task 2)
        selectPair.ts             # tag-similarity pair selection (Task 2)
      game/
        roles.ts                 # role assignment + turn order (Task 3)
        clueRound.ts              # turn advance + round-complete check (Task 4)
        voting.ts                 # vote tally + win condition + MrWhite guess (Task 5)
        snapshot.ts                # per-player state masking (Task 6)
    test/
      worker.test.ts
      characters/selectPair.test.ts
      game/roles.test.ts
      game/clueRound.test.ts
      game/voting.test.ts
      game/snapshot.test.ts
      GameRoom.join.test.ts
      GameRoom.flow.test.ts

  web/                            # Next.js app
    package.json
    tsconfig.json
    next.config.js
    vitest.config.ts
    vitest.setup.ts
    src/
      lib/
        pseudo.ts                 # Task 10
        usePseudo.ts               # Task 10
        clientId.ts                 # Task 11
        hostSettings.ts             # Task 11
        useGameSocket.ts             # Task 11
      components/
        HomeScreen.tsx               # Task 12
        GameApp.tsx                   # Task 12, extended Tasks 13-17
        LobbyScreen.tsx                 # Task 13
        RoleRevealScreen.tsx             # Task 14
        ClueRoundScreen.tsx               # Task 15
        VoteScreen.tsx                      # Task 16
        EliminationScreen.tsx                 # Task 16
        EndScreen.tsx                           # Task 17
      app/
        page.tsx                                 # Task 12 (renders HomeScreen/GameApp)
    test/
      lib/pseudo.test.ts
      lib/usePseudo.test.ts
      lib/hostSettings.test.ts
      lib/useGameSocket.test.ts
      components/HomeScreen.test.tsx
      components/GameApp.test.tsx
      components/LobbyScreen.test.tsx
      components/RoleRevealScreen.test.tsx
      components/ClueRoundScreen.test.tsx
      components/VoteScreen.test.tsx
      components/EliminationScreen.test.tsx
      components/EndScreen.test.tsx

  .gitignore
```

---

# Backend (`server/`)

### Task 1: Server scaffold (Wrangler + TypeScript + Vitest)

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/wrangler.toml`
- Create: `server/vitest.config.ts`
- Create: `server/src/types.ts`
- Create: `server/src/messages.ts`
- Create: `server/src/worker.ts`
- Create: `.gitignore` (repo root)
- Test: `server/test/worker.test.ts`

**Interfaces:**
- Produces: `RoomState`, `Player`, `Role`, `Phase`, `RoomSettings`, `SimilarityLevel`, `Clue` (in `types.ts`); `ClientMessage`, `ServerMessage` (in `messages.ts`) — every later backend task imports these.

- [ ] **Step 1: Create the repo root `.gitignore`**

```
node_modules/
.next/
.wrangler/
*.log
.env*.local
```

- [ ] **Step 2: Scaffold the server npm project**

Run:
```bash
mkdir server && cd server
npm init -y
npm install -D typescript vitest wrangler @cloudflare/vitest-pool-workers @cloudflare/workers-types
```

- [ ] **Step 3: Write `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 4: Write `server/wrangler.toml`**

```toml
name = "undercover-server"
main = "src/worker.ts"
compatibility_date = "2025-06-01"
```

- [ ] **Step 5: Write `server/vitest.config.ts`**

```ts
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
});
```

- [ ] **Step 6: Write `server/src/types.ts`**

```ts
export type Role = 'civil' | 'undercover' | 'mrwhite';

export type Phase = 'LOBBY' | 'ROLE_REVEAL' | 'CLUE_ROUND' | 'VOTE' | 'ELIMINATION' | 'END';

export type SimilarityLevel = 'none' | 'close' | 'very_close';

export interface RoomSettings {
  themes: string[];
  similarityLevel: SimilarityLevel;
  mrWhiteEnabled: boolean;
}

export interface Player {
  id: string; // equals the client's persisted clientId
  name: string;
  role: Role | null;
  character: string | null;
  alive: boolean;
  connected: boolean;
}

export interface Clue {
  playerId: string;
  round: number;
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
}
```

- [ ] **Step 7: Write `server/src/messages.ts`**

```ts
import type { RoomSettings } from './types';

export type ClientMessage =
  | { type: 'JOIN_ROOM'; code: string; name: string; clientId: string; isHost: boolean }
  | { type: 'START_GAME'; settings: RoomSettings }
  | { type: 'SUBMIT_CLUE'; text: string }
  | { type: 'SUBMIT_VOTE'; targetId: string }
  | { type: 'MR_WHITE_GUESS'; guess: string };

export interface ErrorMessage {
  type: 'ERROR';
  code: string;
  message: string;
}
```

- [ ] **Step 8: Write `server/src/worker.ts` (minimal health check only)**

```ts
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response('OK');
    }
    return new Response('Not found', { status: 404 });
  },
};
```

- [ ] **Step 9: Write the failing test**

```ts
// server/test/worker.test.ts
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('worker', () => {
  it('responds OK on /health', async () => {
    const res = await SELF.fetch('https://example.com/health');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
  });

  it('responds 404 for unknown routes', async () => {
    const res = await SELF.fetch('https://example.com/unknown');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 10: Run the tests**

Run: `cd server && npx vitest run`
Expected: since `worker.ts` already implements both routes, this should PASS immediately — this task validates the scaffold works end-to-end, not TDD-driven logic.

- [ ] **Step 11: Commit**

```bash
git add .gitignore server/package.json server/package-lock.json server/tsconfig.json server/wrangler.toml server/vitest.config.ts server/src/types.ts server/src/messages.ts server/src/worker.ts server/test/worker.test.ts
git commit -m "chore(server): scaffold Cloudflare Worker project with Vitest"
```

---

### Task 2: Character dataset + tag-similarity pair selection

**Files:**
- Create: `server/src/characters/types.ts`
- Create: `server/src/characters/data.ts`
- Create: `server/src/characters/selectPair.ts`
- Test: `server/test/characters/selectPair.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `Character` type, `CHARACTERS` array, `selectCharacterPair(characters, themes, requestedLevel, random?)` returning `{ civilCharacter, undercoverCharacter, levelUsed, wasRelaxed }` — used by Task 8 (`GameRoom` game flow).

- [ ] **Step 1: Write `server/src/characters/types.ts`**

```ts
export interface Character {
  id: string;
  name: string;
  theme: string;
  tags: string[];
}
```

- [ ] **Step 2: Write the starter dataset `server/src/characters/data.ts`**

```ts
import type { Character } from './types';

export const CHARACTERS: Character[] = [
  // Histoire
  { id: 'alexandre-le-grand', name: 'Alexandre le Grand', theme: 'histoire', tags: ['conquerant', 'antiquite', 'militaire', 'empire', 'stratege'] },
  { id: 'genghis-khan', name: 'Genghis Khan', theme: 'histoire', tags: ['conquerant', 'moyen-age', 'militaire', 'empire', 'stratege'] },
  { id: 'napoleon', name: 'Napoléon Bonaparte', theme: 'histoire', tags: ['conquerant', 'epoque-moderne', 'militaire', 'empire', 'stratege'] },
  { id: 'jules-cesar', name: 'Jules César', theme: 'histoire', tags: ['conquerant', 'antiquite', 'militaire', 'empire', 'politique'] },
  { id: 'cleopatre', name: 'Cléopâtre', theme: 'histoire', tags: ['antiquite', 'politique', 'egypte', 'diplomate', 'controverse'] },
  { id: 'leonard-de-vinci', name: 'Léonard de Vinci', theme: 'histoire', tags: ['renaissance', 'art', 'science', 'inventeur', 'visionnaire'] },
  { id: 'einstein', name: 'Albert Einstein', theme: 'histoire', tags: ['science', 'xxe-siecle', 'physique', 'visionnaire', 'pacifiste'] },
  { id: 'marie-curie', name: 'Marie Curie', theme: 'histoire', tags: ['science', 'xxe-siecle', 'physique', 'chimie', 'pionniere'] },
  { id: 'gandhi', name: 'Gandhi', theme: 'histoire', tags: ['xxe-siecle', 'politique', 'pacifiste', 'activiste', 'philosophe'] },
  { id: 'mlk', name: 'Martin Luther King', theme: 'histoire', tags: ['xxe-siecle', 'politique', 'pacifiste', 'activiste', 'orateur'] },
  { id: 'colomb', name: 'Christophe Colomb', theme: 'histoire', tags: ['explorateur', 'renaissance', 'navigateur', 'controverse', 'decouverte'] },
  { id: 'marco-polo', name: 'Marco Polo', theme: 'histoire', tags: ['explorateur', 'moyen-age', 'navigateur', 'commercant', 'decouverte'] },

  // Anime
  { id: 'zoro', name: 'Roronoa Zoro', theme: 'anime', tags: ['epeiste', 'pirate', 'shonen', 'determine', 'force-brute'] },
  { id: 'sasuke', name: 'Sasuke Uchiha', theme: 'anime', tags: ['ninja', 'shonen', 'vengeance', 'determine', 'rival'] },
  { id: 'naruto', name: 'Naruto Uzumaki', theme: 'anime', tags: ['ninja', 'shonen', 'determine', 'hot-blooded', 'protagoniste'] },
  { id: 'levi', name: 'Levi Ackerman', theme: 'anime', tags: ['epeiste', 'seinen', 'force-brute', 'calme', 'capitaine'] },
  { id: 'light', name: 'Light Yagami', theme: 'anime', tags: ['stratege', 'seinen', 'antagoniste', 'manipulateur', 'genie'] },
  { id: 'l', name: 'L', theme: 'anime', tags: ['stratege', 'seinen', 'genie', 'detective', 'calme'] },
  { id: 'edward-elric', name: 'Edward Elric', theme: 'anime', tags: ['alchimiste', 'shonen', 'determine', 'hot-blooded', 'protagoniste'] },
  { id: 'luffy', name: 'Monkey D. Luffy', theme: 'anime', tags: ['pirate', 'shonen', 'hot-blooded', 'determine', 'protagoniste'] },
  { id: 'goku', name: 'Goku', theme: 'anime', tags: ['combattant-corps-a-corps', 'shonen', 'hot-blooded', 'force-brute', 'protagoniste'] },
  { id: 'vegeta', name: 'Vegeta', theme: 'anime', tags: ['combattant-corps-a-corps', 'shonen', 'rival', 'force-brute', 'orgueilleux'] },
  { id: 'itachi', name: 'Itachi Uchiha', theme: 'anime', tags: ['ninja', 'shonen', 'stratege', 'sacrifice', 'calme'] },
  { id: 'erwin', name: 'Erwin Smith', theme: 'anime', tags: ['seinen', 'stratege', 'capitaine', 'sacrifice', 'visionnaire'] },

  // Films
  { id: 'luke-skywalker', name: 'Luke Skywalker', theme: 'films', tags: ['chevalier', 'science-fiction', 'heros', 'mentor-guide', 'epeiste'] },
  { id: 'dark-vador', name: 'Dark Vador', theme: 'films', tags: ['science-fiction', 'antagoniste', 'guerrier', 'masque', 'redemption'] },
  { id: 'iron-man', name: 'Tony Stark', theme: 'films', tags: ['super-heros', 'science-fiction', 'genie', 'riche', 'sarcastique'] },
  { id: 'batman', name: 'Bruce Wayne', theme: 'films', tags: ['super-heros', 'riche', 'vigilante', 'sombre', 'genie'] },
  { id: 'indiana-jones', name: 'Indiana Jones', theme: 'films', tags: ['aventurier', 'archeologue', 'action', 'charismatique', 'annees-30'] },
  { id: 'james-bond', name: 'James Bond', theme: 'films', tags: ['espion', 'action', 'charismatique', 'epoque-moderne', 'seducteur'] },
  { id: 'forrest-gump', name: 'Forrest Gump', theme: 'films', tags: ['drame', 'naif', 'heros-ordinaire', 'americana', 'attachant'] },
  { id: 'rocky', name: 'Rocky Balboa', theme: 'films', tags: ['drame', 'boxeur', 'heros-ordinaire', 'determine', 'americana'] },
  { id: 'gandalf', name: 'Gandalf', theme: 'films', tags: ['mage', 'fantasy', 'mentor', 'sage', 'epique'] },
  { id: 'dumbledore', name: 'Dumbledore', theme: 'films', tags: ['mage', 'fantasy', 'mentor', 'sage', 'mysterieux'] },
  { id: 'jack-sparrow', name: 'Jack Sparrow', theme: 'films', tags: ['pirate', 'aventurier', 'action', 'excentrique', 'charismatique'] },
  { id: 'katniss', name: 'Katniss Everdeen', theme: 'films', tags: ['heros-ordinaire', 'action', 'determine', 'dystopie', 'archere'] },
];
```

This is a starter set (12 characters × 3 thèmes). Extend it later by appending more entries with the same shape — nothing else in the codebase needs to change.

- [ ] **Step 3: Write the failing tests**

```ts
// server/test/characters/selectPair.test.ts
import { describe, it, expect } from 'vitest';
import { selectCharacterPair } from '../../src/characters/selectPair';
import type { Character } from '../../src/characters/types';

const pool: Character[] = [
  { id: 'a', name: 'A', theme: 't1', tags: ['x', 'y', 'z'] },
  { id: 'b', name: 'B', theme: 't1', tags: ['x', 'y', 'w'] }, // 2 shared with A -> close
  { id: 'c', name: 'C', theme: 't1', tags: ['p', 'q', 'r'] }, // 0 shared with A -> none
  { id: 'd', name: 'D', theme: 't2', tags: ['x', 'y', 'z'] }, // different theme
];

describe('selectCharacterPair', () => {
  it('only considers characters from the requested themes', () => {
    const result = selectCharacterPair(pool, ['t1'], 'none', () => 0);
    expect([result.civilCharacter.theme, result.undercoverCharacter.theme]).toEqual(['t1', 't1']);
  });

  it('picks a pair matching the exact requested level when available', () => {
    const result = selectCharacterPair(pool, ['t1'], 'close', () => 0);
    const ids = [result.civilCharacter.id, result.undercoverCharacter.id].sort();
    expect(ids).toEqual(['a', 'b']);
    expect(result.levelUsed).toBe('close');
    expect(result.wasRelaxed).toBe(false);
  });

  it('relaxes toward "none" when no pair matches the requested level', () => {
    const result = selectCharacterPair(pool, ['t1'], 'very_close', () => 0);
    expect(result.wasRelaxed).toBe(true);
    expect(['close', 'none']).toContain(result.levelUsed);
  });

  it('throws when fewer than 2 characters are available in the selected themes', () => {
    expect(() => selectCharacterPair(pool, ['t2'], 'none')).toThrow();
  });

  it('randomly assigns which character goes to civils vs undercover', () => {
    const low = selectCharacterPair(pool, ['t1'], 'none', () => 0);
    const high = selectCharacterPair(pool, ['t1'], 'none', () => 0.99);
    expect(low.civilCharacter.id).not.toBe(high.civilCharacter.id);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && npx vitest run test/characters/selectPair.test.ts`
Expected: FAIL — `selectPair.ts` does not exist yet.

- [ ] **Step 5: Write `server/src/characters/selectPair.ts`**

```ts
import type { Character } from './types';
import type { SimilarityLevel } from '../types';

export interface SelectPairResult {
  civilCharacter: Character;
  undercoverCharacter: Character;
  levelUsed: SimilarityLevel;
  wasRelaxed: boolean;
}

const LEVELS: SimilarityLevel[] = ['very_close', 'close', 'none'];

function sharedTagCount(a: Character, b: Character): number {
  const tagsB = new Set(b.tags);
  return a.tags.filter((tag) => tagsB.has(tag)).length;
}

function matchesLevel(count: number, level: SimilarityLevel): boolean {
  if (level === 'none') return count === 0;
  if (level === 'close') return count >= 1 && count <= 2;
  return count >= 3;
}

export function selectCharacterPair(
  characters: Character[],
  themes: string[],
  requestedLevel: SimilarityLevel,
  random: () => number = Math.random
): SelectPairResult {
  const pool = characters.filter((c) => themes.includes(c.theme));
  if (pool.length < 2) {
    throw new Error('Not enough characters in the selected themes to form a pair');
  }

  const startIndex = LEVELS.indexOf(requestedLevel);
  for (let i = startIndex; i < LEVELS.length; i++) {
    const level = LEVELS[i];
    const pairs: [Character, Character][] = [];
    for (let a = 0; a < pool.length; a++) {
      for (let b = a + 1; b < pool.length; b++) {
        if (matchesLevel(sharedTagCount(pool[a], pool[b]), level)) {
          pairs.push([pool[a], pool[b]]);
        }
      }
    }
    if (pairs.length > 0) {
      const [charA, charB] = pairs[Math.floor(random() * pairs.length)];
      const civilFirst = random() < 0.5;
      return {
        civilCharacter: civilFirst ? charA : charB,
        undercoverCharacter: civilFirst ? charB : charA,
        levelUsed: level,
        wasRelaxed: level !== requestedLevel,
      };
    }
  }

  throw new Error('No valid character pair found even after relaxing the similarity level');
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npx vitest run test/characters/selectPair.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add server/src/characters server/test/characters
git commit -m "feat(server): add character dataset and tag-similarity pair selection"
```

---

### Task 3: Role assignment + turn order

**Files:**
- Create: `server/src/game/roles.ts`
- Test: `server/test/game/roles.test.ts`

**Interfaces:**
- Consumes: `Role`, `RoomSettings` from `types.ts`.
- Produces: `assignRoles(playerIds, settings, random?)` returning `Record<string, Role>`, `buildTurnOrder(playerIds, random?)` returning `string[]` — used by Task 8.

- [ ] **Step 1: Write the failing tests**

```ts
// server/test/game/roles.test.ts
import { describe, it, expect } from 'vitest';
import { assignRoles, buildTurnOrder } from '../../src/game/roles';
import type { RoomSettings } from '../../src/types';

const settings: RoomSettings = { themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false };

describe('assignRoles', () => {
  it('throws with fewer than 3 players', () => {
    expect(() => assignRoles(['a', 'b'], settings)).toThrow();
  });

  it('throws with more than 10 players', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `p${i}`);
    expect(() => assignRoles(ids, settings)).toThrow();
  });

  it('assigns exactly 1 undercover for 3-6 players', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const roles = assignRoles(ids, settings, () => 0);
    const count = Object.values(roles).filter((r) => r === 'undercover').length;
    expect(count).toBe(1);
  });

  it('assigns exactly 2 undercover for 7-10 players', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const roles = assignRoles(ids, settings, () => 0);
    const count = Object.values(roles).filter((r) => r === 'undercover').length;
    expect(count).toBe(2);
  });

  it('assigns exactly 1 Mr. White when enabled', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const roles = assignRoles(ids, { ...settings, mrWhiteEnabled: true }, () => 0);
    const count = Object.values(roles).filter((r) => r === 'mrwhite').length;
    expect(count).toBe(1);
  });

  it('assigns no Mr. White when disabled', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const roles = assignRoles(ids, settings, () => 0);
    expect(Object.values(roles)).not.toContain('mrwhite');
  });

  it('gives every remaining player the civil role', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const roles = assignRoles(ids, settings, () => 0);
    const civilCount = Object.values(roles).filter((r) => r === 'civil').length;
    expect(civilCount).toBe(4);
  });

  it('throws if there would not be a civilian majority', () => {
    // 3 players + Mr. White enabled -> 1 undercover + 1 mrwhite = 2 specials, only 1 civil left, which is fine (1 > 2 is false, so this should throw)
    expect(() => assignRoles(['a', 'b', 'c'], { ...settings, mrWhiteEnabled: true })).toThrow();
  });
});

describe('buildTurnOrder', () => {
  it('returns all player ids exactly once', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const order = buildTurnOrder(ids, () => 0.5);
    expect([...order].sort()).toEqual([...ids].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run test/game/roles.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `server/src/game/roles.ts`**

```ts
import type { Role, RoomSettings } from '../types';

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function assignRoles(
  playerIds: string[],
  settings: RoomSettings,
  random: () => number = Math.random
): Record<string, Role> {
  if (playerIds.length < 3) {
    throw new Error('At least 3 players are required');
  }
  if (playerIds.length > 10) {
    throw new Error('At most 10 players are allowed');
  }

  const undercoverCount = playerIds.length >= 7 ? 2 : 1;
  const mrWhiteCount = settings.mrWhiteEnabled ? 1 : 0;
  const specialCount = undercoverCount + mrWhiteCount;
  const civilCount = playerIds.length - specialCount;

  if (civilCount <= specialCount) {
    throw new Error('Not enough players to guarantee a civilian majority');
  }

  const shuffled = shuffle(playerIds, random);
  const roles: Record<string, Role> = {};
  let index = 0;
  for (let i = 0; i < undercoverCount; i++, index++) {
    roles[shuffled[index]] = 'undercover';
  }
  for (let i = 0; i < mrWhiteCount; i++, index++) {
    roles[shuffled[index]] = 'mrwhite';
  }
  for (; index < shuffled.length; index++) {
    roles[shuffled[index]] = 'civil';
  }
  return roles;
}

export function buildTurnOrder(playerIds: string[], random: () => number = Math.random): string[] {
  return shuffle(playerIds, random);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run test/game/roles.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/game/roles.ts server/test/game/roles.test.ts
git commit -m "feat(server): add role assignment and turn order logic"
```

---

### Task 4: Clue round progression

**Files:**
- Create: `server/src/game/clueRound.ts`
- Test: `server/test/game/clueRound.test.ts`

**Interfaces:**
- Consumes: `Clue` from `types.ts`.
- Produces: `nextAliveIndex(turnOrder, aliveIds, fromIndex)` returning `number`, `isClueRoundComplete(clues, round, aliveIds)` returning `boolean` — used by Task 8.

- [ ] **Step 1: Write the failing tests**

```ts
// server/test/game/clueRound.test.ts
import { describe, it, expect } from 'vitest';
import { nextAliveIndex, isClueRoundComplete } from '../../src/game/clueRound';

describe('nextAliveIndex', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('returns the next index when everyone is alive', () => {
    expect(nextAliveIndex(order, new Set(order), 0)).toBe(1);
  });

  it('skips eliminated players', () => {
    expect(nextAliveIndex(order, new Set(['a', 'c']), 0)).toBe(2);
  });

  it('wraps around to the start of the order', () => {
    expect(nextAliveIndex(order, new Set(order), 3)).toBe(0);
  });

  it('starting from -1 returns the first alive player', () => {
    expect(nextAliveIndex(order, new Set(['b', 'd']), -1)).toBe(1);
  });

  it('throws if no alive players remain in the order', () => {
    expect(() => nextAliveIndex(order, new Set(), 0)).toThrow();
  });
});

describe('isClueRoundComplete', () => {
  it('is false until every alive player has submitted a clue for the round', () => {
    const clues = [{ playerId: 'a', round: 1, text: 'x' }];
    expect(isClueRoundComplete(clues, 1, new Set(['a', 'b']))).toBe(false);
  });

  it('is true once every alive player has submitted', () => {
    const clues = [
      { playerId: 'a', round: 1, text: 'x' },
      { playerId: 'b', round: 1, text: 'y' },
    ];
    expect(isClueRoundComplete(clues, 1, new Set(['a', 'b']))).toBe(true);
  });

  it('ignores clues from other rounds', () => {
    const clues = [{ playerId: 'a', round: 1, text: 'x' }];
    expect(isClueRoundComplete(clues, 2, new Set(['a']))).toBe(false);
  });

  it('ignores eliminated players not in the alive set', () => {
    const clues = [{ playerId: 'a', round: 1, text: 'x' }];
    expect(isClueRoundComplete(clues, 1, new Set(['a']))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run test/game/clueRound.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `server/src/game/clueRound.ts`**

```ts
import type { Clue } from '../types';

export function nextAliveIndex(turnOrder: string[], alivePlayerIds: Set<string>, fromIndex: number): number {
  for (let step = 1; step <= turnOrder.length; step++) {
    const idx = (fromIndex + step) % turnOrder.length;
    if (alivePlayerIds.has(turnOrder[idx])) {
      return idx;
    }
  }
  throw new Error('No alive players left in the turn order');
}

export function isClueRoundComplete(clues: Pick<Clue, 'playerId' | 'round'>[], round: number, alivePlayerIds: Set<string>): boolean {
  const submitted = new Set(clues.filter((c) => c.round === round).map((c) => c.playerId));
  for (const id of alivePlayerIds) {
    if (!submitted.has(id)) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run test/game/clueRound.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/game/clueRound.ts server/test/game/clueRound.test.ts
git commit -m "feat(server): add clue round turn progression logic"
```

---

### Task 5: Voting, win conditions, Mr. White guess

**Files:**
- Create: `server/src/game/voting.ts`
- Test: `server/test/game/voting.test.ts`

**Interfaces:**
- Consumes: `Role` from `types.ts`.
- Produces: `tallyVotes(votes)` returning `{ eliminatedId: string | null; tie: boolean }`, `checkWinCondition(players)` returning `Role | null`, `checkMrWhiteGuess(guess, civilCharacterName)` returning `boolean` — used by Task 8.

- [ ] **Step 1: Write the failing tests**

```ts
// server/test/game/voting.test.ts
import { describe, it, expect } from 'vitest';
import { tallyVotes, checkWinCondition, checkMrWhiteGuess } from '../../src/game/voting';

describe('tallyVotes', () => {
  it('eliminates the player with the most votes', () => {
    const result = tallyVotes({ a: 'c', b: 'c', c: 'a' });
    expect(result).toEqual({ eliminatedId: 'c', tie: false });
  });

  it('returns a tie when two players are equally voted', () => {
    const result = tallyVotes({ a: 'b', b: 'a' });
    expect(result.tie).toBe(true);
    expect(result.eliminatedId).toBeNull();
  });
});

describe('checkWinCondition', () => {
  it('returns null while the game should continue', () => {
    const players = [
      { role: 'civil' as const, alive: true },
      { role: 'civil' as const, alive: true },
      { role: 'undercover' as const, alive: true },
    ];
    expect(checkWinCondition(players)).toBeNull();
  });

  it('returns civil when all undercover and mrwhite are eliminated', () => {
    const players = [
      { role: 'civil' as const, alive: true },
      { role: 'undercover' as const, alive: false },
    ];
    expect(checkWinCondition(players)).toBe('civil');
  });

  it('returns undercover when undercover count reaches civil count', () => {
    const players = [
      { role: 'civil' as const, alive: true },
      { role: 'undercover' as const, alive: true },
      { role: 'civil' as const, alive: false },
    ];
    expect(checkWinCondition(players)).toBe('undercover');
  });
});

describe('checkMrWhiteGuess', () => {
  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(checkMrWhiteGuess('  Goku ', 'Goku')).toBe(true);
    expect(checkMrWhiteGuess('goku', 'Goku')).toBe(true);
  });

  it('returns false for a wrong guess', () => {
    expect(checkMrWhiteGuess('Vegeta', 'Goku')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run test/game/voting.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `server/src/game/voting.ts`**

```ts
import type { Role } from '../types';

export function tallyVotes(votes: Record<string, string>): { eliminatedId: string | null; tie: boolean } {
  const counts = new Map<string, number>();
  for (const targetId of Object.values(votes)) {
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  let maxCount = -1;
  let leaders: string[] = [];
  for (const [id, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      leaders = [id];
    } else if (count === maxCount) {
      leaders.push(id);
    }
  }

  if (leaders.length !== 1) {
    return { eliminatedId: null, tie: true };
  }
  return { eliminatedId: leaders[0], tie: false };
}

export function checkWinCondition(players: { role: Role; alive: boolean }[]): Role | null {
  const aliveCivils = players.filter((p) => p.role === 'civil' && p.alive).length;
  const aliveUndercover = players.filter((p) => p.role === 'undercover' && p.alive).length;
  const aliveMrWhite = players.filter((p) => p.role === 'mrwhite' && p.alive).length;

  if (aliveUndercover === 0 && aliveMrWhite === 0) {
    return 'civil';
  }
  if (aliveUndercover >= aliveCivils) {
    return 'undercover';
  }
  return null;
}

export function checkMrWhiteGuess(guess: string, civilCharacterName: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase();
  return normalize(guess) === normalize(civilCharacterName);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run test/game/voting.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/game/voting.ts server/test/game/voting.test.ts
git commit -m "feat(server): add vote tally, win condition and Mr White guess logic"
```

---

### Task 6: Room state snapshot (per-player masking)

**Files:**
- Create: `server/src/game/snapshot.ts`
- Test: `server/test/game/snapshot.test.ts`

**Interfaces:**
- Consumes: `RoomState` from `types.ts`.
- Produces: `buildSnapshot(state, forPlayerId)` returning a `ROOM_STATE` message object — used by Task 7/8 (`GameRoom.broadcast`).

- [ ] **Step 1: Write the failing tests**

```ts
// server/test/game/snapshot.test.ts
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
      { id: 'p1', name: 'Alice', role: 'civil', character: 'Goku', alive: true, connected: true },
      { id: 'p2', name: 'Bob', role: 'undercover', character: 'Vegeta', alive: true, connected: true },
      { id: 'p3', name: 'Carl', role: 'civil', character: 'Goku', alive: false, connected: true },
    ],
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    clues: [],
    votes: {},
    round: 1,
    winner: null,
    lastEliminatedId: 'p3',
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
    expect(other.role).toBeNull();
    expect(other.character).toBeNull();
  });

  it('always reveals role and character for eliminated players', () => {
    const snapshot = buildSnapshot(makeRoom(), 'p1');
    const eliminated = snapshot.players.find((p) => p.id === 'p3')!;
    expect(eliminated.role).toBe('civil');
    expect(eliminated.character).toBe('Goku');
  });

  it('reveals everything for everyone once the game has ended', () => {
    const snapshot = buildSnapshot(makeRoom({ phase: 'END' }), 'p1');
    const other = snapshot.players.find((p) => p.id === 'p2')!;
    expect(other.role).toBe('undercover');
    expect(other.character).toBe('Vegeta');
  });

  it('passes through room-level fields unchanged', () => {
    const room = makeRoom();
    const snapshot = buildSnapshot(room, 'p1');
    expect(snapshot.code).toBe(room.code);
    expect(snapshot.phase).toBe(room.phase);
    expect(snapshot.turnOrder).toEqual(room.turnOrder);
    expect(snapshot.lastEliminatedId).toBe('p3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run test/game/snapshot.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `server/src/game/snapshot.ts`**

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
    players: state.players.map((p) => {
      const reveal = revealEverything || !p.alive || p.id === forPlayerId;
      return {
        id: p.id,
        name: p.name,
        alive: p.alive,
        connected: p.connected,
        role: reveal ? p.role : null,
        character: reveal ? p.character : null,
      };
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run test/game/snapshot.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/game/snapshot.ts server/test/game/snapshot.test.ts
git commit -m "feat(server): add per-player room state snapshot masking"
```

---

### Task 7: GameRoom Durable Object — connection lifecycle

**Files:**
- Create: `server/src/GameRoom.ts`
- Modify: `server/wrangler.toml` (add Durable Object binding + migration)
- Test: `server/test/GameRoom.join.test.ts`

**Interfaces:**
- Consumes: `RoomState`, `buildSnapshot` (Task 6).
- Produces: `GameRoom` class with `fetch`, `webSocketMessage`, `webSocketClose` — extended by Task 8 with game-flow message handling, and used by Task 9 (`worker.ts` routing).

- [ ] **Step 1: Modify `server/wrangler.toml`**

```toml
name = "undercover-server"
main = "src/worker.ts"
compatibility_date = "2025-06-01"

[[durable_objects.bindings]]
name = "GAME_ROOM"
class_name = "GameRoom"

[[migrations]]
tag = "v1"
new_classes = ["GameRoom"]
```

- [ ] **Step 2: Write the failing test**

```ts
// server/test/GameRoom.join.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npx vitest run test/GameRoom.join.test.ts`
Expected: FAIL — `GameRoom.ts` does not exist.

- [ ] **Step 4: Write `server/src/GameRoom.ts` (connection lifecycle only)**

```ts
import { DurableObject } from 'cloudflare:workers';
import type { RoomState } from './types';
import type { ClientMessage } from './messages';
import { buildSnapshot } from './game/snapshot';

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

    this.sendError(ws, 'UNKNOWN_MESSAGE', 'Unsupported message type at this stage');
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run test/GameRoom.join.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add server/wrangler.toml server/src/GameRoom.ts server/test/GameRoom.join.test.ts
git commit -m "feat(server): add GameRoom Durable Object connection lifecycle"
```

---

### Task 8: GameRoom Durable Object — game flow (start, clue, vote, Mr. White guess)

**Files:**
- Modify: `server/src/GameRoom.ts`
- Test: `server/test/GameRoom.flow.test.ts`

**Interfaces:**
- Consumes: `selectCharacterPair` (Task 2), `assignRoles`/`buildTurnOrder` (Task 3), `nextAliveIndex`/`isClueRoundComplete` (Task 4), `tallyVotes`/`checkWinCondition`/`checkMrWhiteGuess` (Task 5).
- Produces: full `GameRoom` message handling — used by Task 9.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/GameRoom.flow.test.ts
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

async function joinPlayer(stub: DurableObjectStub, code: string, name: string, clientId: string, isHost = false) {
  const res = await connect(stub);
  const ws = res.webSocket!;
  ws.accept();
  const snapshotPromise = waitForMessage(ws);
  ws.send(JSON.stringify({ type: 'JOIN_ROOM', code, name, clientId, isHost }));
  await snapshotPromise;
  return ws;
}

describe('GameRoom game flow', () => {
  it('runs a full 3-player round without Mr. White', async () => {
    const code = 'FLOW-1';
    const id = env.GAME_ROOM.idFromName(code);
    const stub = env.GAME_ROOM.get(id);

    const wsA = await joinPlayer(stub, code, 'Alice', 'a', true);
    const wsB = await joinPlayer(stub, code, 'Bob', 'b');
    const wsC = await joinPlayer(stub, code, 'Carl', 'c');

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
    await runDurableObjectAlarm(stub2);

    const afterAlarmA = waitForMessage(wsA);
    // Alarm broadcast already happened inside runDurableObjectAlarm; re-fetch state via a no-op is not
    // needed because the alarm handler itself calls broadcast(), which the listeners above will have
    // already received as their *next* message. Await it directly:
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
    const wsB = await joinPlayer(stub, code, 'Bob', 'b');
    await joinPlayer(stub, code, 'Carl', 'c');

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run test/GameRoom.flow.test.ts`
Expected: FAIL — `START_GAME`/`SUBMIT_CLUE`/`SUBMIT_VOTE` are not handled yet (falls into the `UNKNOWN_MESSAGE` branch from Task 7).

- [ ] **Step 3: Extend `server/src/GameRoom.ts` with game flow handling**

Replace the body of `webSocketMessage` and add the new private methods:

```ts
import { DurableObject } from 'cloudflare:workers';
import type { RoomSettings, RoomState } from './types';
import type { ClientMessage } from './messages';
import { buildSnapshot } from './game/snapshot';
import { assignRoles, buildTurnOrder } from './game/roles';
import { nextAliveIndex, isClueRoundComplete } from './game/clueRound';
import { tallyVotes, checkWinCondition, checkMrWhiteGuess } from './game/voting';
import { selectCharacterPair } from './characters/selectPair';
import { CHARACTERS } from './characters/data';

// ... STORAGE_KEY, ConnAttachment, loadRoom/saveRoom/fetch/webSocketClose/handleJoin/sendError/
// sendErrorTo/broadcast stay exactly as in Task 7 ...

export class GameRoom extends DurableObject {
  // ...(fields and methods from Task 7 unchanged)...

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    await this.loadRoom();
    const msg = JSON.parse(raw as string) as ClientMessage;

    if (msg.type === 'JOIN_ROOM') {
      await this.handleJoin(ws, msg);
      return;
    }

    const attachment = ws.deserializeAttachment() as { playerId: string } | null;
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

    const { civilCharacter, undercoverCharacter, levelUsed, wasRelaxed } = selectCharacterPair(
      CHARACTERS,
      settings.themes,
      settings.similarityLevel
    );

    const playerIds = room.players.map((p) => p.id);
    const roles = assignRoles(playerIds, settings);
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
    const winner = checkWinCondition(room.players);
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
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run test/GameRoom.flow.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full server test suite**

Run: `cd server && npx vitest run`
Expected: PASS (all tests across all files)

- [ ] **Step 6: Commit**

```bash
git add server/src/GameRoom.ts server/test/GameRoom.flow.test.ts
git commit -m "feat(server): wire GameRoom game flow (start, clue, vote, Mr White guess)"
```

---

### Task 9: Worker routing (room creation + WebSocket upgrade)

**Files:**
- Modify: `server/src/worker.ts`
- Test: `server/test/worker.test.ts` (extend)

**Interfaces:**
- Consumes: `GameRoom` (Task 7/8).
- Produces: `POST /api/create-room` → `{ code: string }`, `GET /ws?code=...` → routes to the matching `GameRoom` — used directly by the frontend (Task 11/12).

- [ ] **Step 1: Write the failing tests (appended to `server/test/worker.test.ts`)**

```ts
// append to server/test/worker.test.ts
describe('room creation and websocket routing', () => {
  it('POST /api/create-room returns a 5-character code', async () => {
    const res = await SELF.fetch('https://example.com/api/create-room', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json<{ code: string }>();
    expect(body.code).toMatch(/^[A-Z2-9]{5}$/);
  });

  it('GET /ws without a code returns 400', async () => {
    const res = await SELF.fetch('https://example.com/ws');
    expect(res.status).toBe(400);
  });

  it('GET /ws with a code upgrades to a websocket handled by GameRoom', async () => {
    const res = await SELF.fetch('https://example.com/ws?code=TESTCODE', {
      headers: { Upgrade: 'websocket' },
    });
    expect(res.status).toBe(101);
    expect(res.webSocket).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run test/worker.test.ts`
Expected: FAIL — `/api/create-room` and `/ws` are not implemented yet (both currently 404).

- [ ] **Step 3: Rewrite `server/src/worker.ts`**

```ts
import { GameRoom } from './GameRoom';

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('OK');
    }

    if (url.pathname === '/api/create-room' && request.method === 'POST') {
      return new Response(JSON.stringify({ code: generateRoomCode() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/ws') {
      const code = url.searchParams.get('code');
      if (!code) {
        return new Response('Missing room code', { status: 400 });
      }
      const id = env.GAME_ROOM.idFromName(code);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};

export { GameRoom };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run test/worker.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the entire server test suite one last time**

Run: `cd server && npx vitest run`
Expected: PASS — the whole backend is now functionally complete.

- [ ] **Step 6: Commit**

```bash
git add server/src/worker.ts server/test/worker.test.ts
git commit -m "feat(server): route room creation and websocket upgrades to GameRoom"
```

---

# Frontend (`web/`)

### Task 10: Web scaffold + pseudo persistence

**Files:**
- Create: `web/` (via `create-next-app`)
- Create: `web/vitest.config.ts`
- Create: `web/vitest.setup.ts`
- Create: `web/src/lib/pseudo.ts`
- Create: `web/src/lib/usePseudo.ts`
- Test: `web/test/lib/pseudo.test.ts`
- Test: `web/test/lib/usePseudo.test.ts`

**Interfaces:**
- Produces: `getStoredPseudo()`, `storePseudo(pseudo)`, `usePseudo()` returning `{ pseudo: string; setPseudo: (value: string) => void }` — used by Task 12 (`HomeScreen`).

- [ ] **Step 1: Scaffold the Next.js project**

Run (from the repo root):
```bash
npx create-next-app@latest web --typescript --eslint --app --src-dir --import-alias "@/*" --no-tailwind --use-npm
cd web
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Write `web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

- [ ] **Step 3: Write `web/vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Add the test script to `web/package.json`**

Add under `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 5: Write the failing tests**

```ts
// web/test/lib/pseudo.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredPseudo, storePseudo } from '@/lib/pseudo';

describe('pseudo storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns an empty string when nothing is stored', () => {
    expect(getStoredPseudo()).toBe('');
  });

  it('stores and retrieves a trimmed pseudo', () => {
    storePseudo('  Seb  ');
    expect(getStoredPseudo()).toBe('Seb');
  });
});
```

```ts
// web/test/lib/usePseudo.test.ts
import { describe, it, expect, beforeEach, act } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePseudo } from '@/lib/usePseudo';
import { getStoredPseudo } from '@/lib/pseudo';

describe('usePseudo', () => {
  beforeEach(() => window.localStorage.clear());

  it('reads the initially stored pseudo', () => {
    window.localStorage.setItem('undercover:pseudo', 'Seb');
    const { result } = renderHook(() => usePseudo());
    expect(result.current.pseudo).toBe('Seb');
  });

  it('updates state and persists on setPseudo', () => {
    const { result } = renderHook(() => usePseudo());
    act(() => result.current.setPseudo('Nouveau'));
    expect(result.current.pseudo).toBe('Nouveau');
    expect(getStoredPseudo()).toBe('Nouveau');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd web && npx vitest run test/lib/pseudo.test.ts test/lib/usePseudo.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 7: Write `web/src/lib/pseudo.ts`**

```ts
const STORAGE_KEY = 'undercover:pseudo';

export function getStoredPseudo(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(STORAGE_KEY) ?? '';
}

export function storePseudo(pseudo: string): void {
  window.localStorage.setItem(STORAGE_KEY, pseudo.trim());
}
```

- [ ] **Step 8: Write `web/src/lib/usePseudo.ts`**

```ts
'use client';
import { useState } from 'react';
import { getStoredPseudo, storePseudo } from './pseudo';

export function usePseudo() {
  const [pseudo, setPseudoState] = useState(() => getStoredPseudo());

  function setPseudo(value: string) {
    const trimmed = value.trim();
    storePseudo(trimmed);
    setPseudoState(trimmed);
  }

  return { pseudo, setPseudo };
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd web && npx vitest run test/lib/pseudo.test.ts test/lib/usePseudo.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 10: Commit**

```bash
git add web
git commit -m "chore(web): scaffold Next.js project and add pseudo persistence"
```

---

### Task 11: Client id, host settings persistence, WebSocket client hook

**Files:**
- Create: `web/src/lib/clientId.ts`
- Create: `web/src/lib/hostSettings.ts`
- Create: `web/src/lib/useGameSocket.ts`
- Test: `web/test/lib/hostSettings.test.ts`
- Test: `web/test/lib/useGameSocket.test.ts`

**Interfaces:**
- Consumes: nothing from other frontend tasks.
- Produces: `getOrCreateClientId()`, `getStoredHostSettings()`/`storeHostSettings(settings)`, `useGameSocket(url)` returning `{ status, lastMessage, send }` — used by Task 12 (`GameApp`) and Task 13 (`LobbyScreen`).

- [ ] **Step 1: Write `web/src/lib/clientId.ts`**

```ts
const STORAGE_KEY = 'undercover:clientId';

export function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
```

- [ ] **Step 2: Write the failing test for host settings**

```ts
// web/test/lib/hostSettings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredHostSettings, storeHostSettings } from '@/lib/hostSettings';

describe('host settings storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns sensible defaults when nothing is stored', () => {
    const settings = getStoredHostSettings();
    expect(settings).toEqual({ themes: [], similarityLevel: 'close', mrWhiteEnabled: false });
  });

  it('stores and retrieves the last used settings', () => {
    storeHostSettings({ themes: ['anime', 'films'], similarityLevel: 'very_close', mrWhiteEnabled: true });
    expect(getStoredHostSettings()).toEqual({
      themes: ['anime', 'films'],
      similarityLevel: 'very_close',
      mrWhiteEnabled: true,
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run test/lib/hostSettings.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Write `web/src/lib/hostSettings.ts`**

```ts
export type SimilarityLevel = 'none' | 'close' | 'very_close';

export interface RoomSettings {
  themes: string[];
  similarityLevel: SimilarityLevel;
  mrWhiteEnabled: boolean;
}

const STORAGE_KEY = 'undercover:hostSettings';

const DEFAULT_SETTINGS: RoomSettings = { themes: [], similarityLevel: 'close', mrWhiteEnabled: false };

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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run test/lib/hostSettings.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Write the failing test for the WebSocket hook**

```ts
// web/test/lib/useGameSocket.test.ts
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
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd web && npx vitest run test/lib/useGameSocket.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 8: Write `web/src/lib/useGameSocket.ts`**

```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface UseGameSocketResult {
  status: ConnectionStatus;
  lastMessage: any | null;
  send: (message: object) => void;
}

export function useGameSocket(url: string | null): UseGameSocketResult {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [lastMessage, setLastMessage] = useState<any | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      setStatus('connecting');
      const ws = new WebSocket(url as string);
      wsRef.current = ws;

      ws.onopen = () => setStatus('open');
      ws.onmessage = (event: any) => setLastMessage(JSON.parse(event.data));
      ws.onerror = () => setStatus('error');
      ws.onclose = () => {
        setStatus('closed');
        if (!cancelled) {
          retryTimeout = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url]);

  const send = useCallback((message: object) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  return { status, lastMessage, send };
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd web && npx vitest run test/lib/useGameSocket.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 10: Commit**

```bash
git add web/src/lib/clientId.ts web/src/lib/hostSettings.ts web/src/lib/useGameSocket.ts web/test/lib/hostSettings.test.ts web/test/lib/useGameSocket.test.ts
git commit -m "feat(web): add client id, host settings persistence and websocket hook"
```

---

### Task 12: Home screen + GameApp shell

**Files:**
- Create: `web/src/components/HomeScreen.tsx`
- Create: `web/src/components/GameApp.tsx`
- Modify: `web/src/app/page.tsx`
- Test: `web/test/components/HomeScreen.test.tsx`
- Test: `web/test/components/GameApp.test.tsx`

**Interfaces:**
- Consumes: `usePseudo` (Task 10), `useGameSocket` (Task 11), `getOrCreateClientId` (Task 11).
- Produces: `<HomeScreen onEnterRoom={(code, pseudo) => void} />`, `<GameApp roomCode pseudo />` — the LOBBY case rendered by `GameApp` is replaced in Task 13, other phases in Tasks 14-17.

- [ ] **Step 1: Write the failing test for `HomeScreen`**

```tsx
// web/test/components/HomeScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomeScreen } from '@/components/HomeScreen';

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => ({ code: 'NEWRM' }) }))
  );
});

describe('HomeScreen', () => {
  it('asks for a pseudo before showing create/join options', () => {
    render(<HomeScreen onEnterRoom={() => {}} />);
    expect(screen.getByLabelText(/pseudo/i)).toBeInTheDocument();
    expect(screen.queryByText(/créer une salle/i)).not.toBeInTheDocument();
  });

  it('shows create/join options once a pseudo is set', () => {
    render(<HomeScreen onEnterRoom={() => {}} />);
    fireEvent.change(screen.getByLabelText(/pseudo/i), { target: { value: 'Seb' } });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));
    expect(screen.getByText(/créer une salle/i)).toBeInTheDocument();
  });

  it('calls onEnterRoom with a fresh code and host=true after creating a room', async () => {
    const onEnterRoom = vi.fn();
    render(<HomeScreen onEnterRoom={onEnterRoom} />);
    fireEvent.change(screen.getByLabelText(/pseudo/i), { target: { value: 'Seb' } });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));

    fireEvent.click(screen.getByRole('button', { name: /créer une salle/i }));
    await vi.waitFor(() => expect(onEnterRoom).toHaveBeenCalledWith('NEWRM', 'Seb', true));
  });

  it('calls onEnterRoom with the typed code and host=false after joining a room', () => {
    const onEnterRoom = vi.fn();
    render(<HomeScreen onEnterRoom={onEnterRoom} />);
    fireEvent.change(screen.getByLabelText(/pseudo/i), { target: { value: 'Seb' } });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));

    fireEvent.change(screen.getByLabelText(/code de la salle/i), { target: { value: 'abcde' } });
    fireEvent.click(screen.getByRole('button', { name: /rejoindre/i }));
    expect(onEnterRoom).toHaveBeenCalledWith('ABCDE', 'Seb', false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run test/components/HomeScreen.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write `web/src/components/HomeScreen.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { usePseudo } from '@/lib/usePseudo';

interface HomeScreenProps {
  onEnterRoom: (code: string, pseudo: string, isHost: boolean) => void;
}

export function HomeScreen({ onEnterRoom }: HomeScreenProps) {
  const { pseudo, setPseudo } = usePseudo();
  const [draftPseudo, setDraftPseudo] = useState(pseudo);
  const [joinCode, setJoinCode] = useState('');

  if (!pseudo) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draftPseudo.trim()) setPseudo(draftPseudo);
        }}
      >
        <label htmlFor="pseudo-input">Choisis un pseudo</label>
        <input id="pseudo-input" value={draftPseudo} onChange={(e) => setDraftPseudo(e.target.value)} />
        <button type="submit">Continuer</button>
      </form>
    );
  }

  async function handleCreateRoom() {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? '';
    const res = await fetch(`${serverUrl}/api/create-room`, { method: 'POST' });
    const { code } = (await res.json()) as { code: string };
    onEnterRoom(code, pseudo, true);
  }

  function handleJoinRoom() {
    onEnterRoom(joinCode.trim().toUpperCase(), pseudo, false);
  }

  return (
    <div>
      <p>Pseudo : {pseudo} <button onClick={() => setPseudo('')}>changer</button></p>
      <button onClick={handleCreateRoom}>Créer une salle</button>
      <div>
        <label htmlFor="join-code-input">Code de la salle</label>
        <input id="join-code-input" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
        <button onClick={handleJoinRoom}>Rejoindre</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run test/components/HomeScreen.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing test for `GameApp`**

```tsx
// web/test/components/GameApp.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GameApp } from '@/components/GameApp';
import * as socketModule from '@/lib/useGameSocket';

function mockSocket(overrides: Partial<socketModule.UseGameSocketResult> = {}) {
  return {
    status: 'idle',
    lastMessage: null,
    send: vi.fn(),
    ...overrides,
  } as socketModule.UseGameSocketResult;
}

describe('GameApp', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows a connecting message before the socket opens', () => {
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(mockSocket({ status: 'connecting' }));
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />);
    expect(screen.getByText(/connexion/i)).toBeInTheDocument();
  });

  it('sends JOIN_ROOM once the socket opens', () => {
    const send = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(mockSocket({ status: 'open', send }));
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'JOIN_ROOM', code: 'ABCDE', name: 'Seb' }));
  });

  it('renders the lobby placeholder when the room state phase is LOBBY', () => {
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({ status: 'open', lastMessage: { type: 'ROOM_STATE', phase: 'LOBBY', players: [] } })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />);
    expect(screen.getByText(/lobby/i)).toBeInTheDocument();
  });

  it('shows the error message when an ERROR message is received', () => {
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({ status: 'open', lastMessage: { type: 'ERROR', code: 'NAME_TAKEN', message: 'Ce pseudo est déjà pris' } })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Ce pseudo est déjà pris');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd web && npx vitest run test/components/GameApp.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 7: Write `web/src/components/GameApp.tsx`**

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useGameSocket } from '@/lib/useGameSocket';
import { getOrCreateClientId } from '@/lib/clientId';

interface GameAppProps {
  roomCode: string;
  pseudo: string;
  isHost: boolean;
}

export function GameApp({ roomCode, pseudo, isHost }: GameAppProps) {
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? '';
  const wsUrl = `${serverUrl.replace(/^http/, 'ws')}/ws?code=${roomCode}`;
  const { status, lastMessage, send } = useGameSocket(wsUrl);
  const [roomState, setRoomState] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    if (status === 'open' && !joinedRef.current) {
      send({ type: 'JOIN_ROOM', code: roomCode, name: pseudo, clientId: getOrCreateClientId(), isHost });
      joinedRef.current = true;
    }
    if (status !== 'open') {
      joinedRef.current = false;
    }
  }, [status, roomCode, pseudo, send]);

  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'ROOM_STATE') {
      setRoomState(lastMessage);
      setErrorMessage(null);
    } else if (lastMessage.type === 'ERROR') {
      setErrorMessage(lastMessage.message);
    }
  }, [lastMessage]);

  if (status === 'connecting' || status === 'idle') {
    return <p>Connexion à la salle {roomCode}...</p>;
  }

  function renderPhase() {
    if (!roomState) return <p>En attente des données de la salle...</p>;
    if (roomState.phase === 'LOBBY') return <p>En attente dans le lobby...</p>; // replaced by LobbyScreen in Task 13
    return <p>Connecté ({roomState.phase})</p>; // fallback for phases not wired up yet
  }

  return (
    <div>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {renderPhase()}
    </div>
  );
}
```

`renderPhase` is an exclusive dispatch (an `if`/`return` chain, one phase renders at a time) rather than a list of independent `{condition && <X/>}` blocks — this matters because Tasks 13-17 each insert one more `if (roomState.phase === '...') return <...Screen .../>;` line into this same function, above the final fallback `return`. If phases were independent `&&` blocks instead, every phase added after the first would render its own screen AND still match the old catch-all "Connecté (phase)" fallback underneath it, since sibling `&&` blocks don't exclude each other.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd web && npx vitest run test/components/GameApp.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 9: Wire it into the page**

```tsx
// web/src/app/page.tsx
'use client';
import { useState } from 'react';
import { HomeScreen } from '@/components/HomeScreen';
import { GameApp } from '@/components/GameApp';

export default function Page() {
  const [room, setRoom] = useState<{ code: string; pseudo: string; isHost: boolean } | null>(null);

  if (!room) {
    return <HomeScreen onEnterRoom={(code, pseudo, isHost) => setRoom({ code, pseudo, isHost })} />;
  }

  return <GameApp roomCode={room.code} pseudo={room.pseudo} isHost={room.isHost} />;
}
```

- [ ] **Step 10: Commit**

```bash
git add web/src/components/HomeScreen.tsx web/src/components/GameApp.tsx web/src/app/page.tsx web/test/components/HomeScreen.test.tsx web/test/components/GameApp.test.tsx
git commit -m "feat(web): add home screen and game app websocket shell"
```

---

### Task 13: Lobby screen

**Files:**
- Create: `web/src/components/LobbyScreen.tsx`
- Modify: `web/src/components/GameApp.tsx`
- Test: `web/test/components/LobbyScreen.test.tsx`
- Test: `web/test/components/GameApp.test.tsx` (extend)

**Interfaces:**
- Consumes: `getStoredHostSettings`/`storeHostSettings` (Task 11).
- Produces: `<LobbyScreen isHost players settings onStart onSettingsChange />`, wired into `GameApp`'s `LOBBY` case.

- [ ] **Step 1: Write the failing test**

```tsx
// web/test/components/LobbyScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LobbyScreen } from '@/components/LobbyScreen';

const players = [
  { id: 'p1', name: 'Alice', alive: true, connected: true },
  { id: 'p2', name: 'Bob', alive: true, connected: true },
];

describe('LobbyScreen', () => {
  it('lists connected players', () => {
    render(
      <LobbyScreen
        isHost={false}
        players={players}
        settings={{ themes: [], similarityLevel: 'close', mrWhiteEnabled: false }}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('hides the settings form and start button for non-hosts', () => {
    render(
      <LobbyScreen
        isHost={false}
        players={players}
        settings={{ themes: [], similarityLevel: 'close', mrWhiteEnabled: false }}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /lancer la partie/i })).not.toBeInTheDocument();
  });

  it('lets the host toggle a theme and Mr White, and calls onSettingsChange', () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        players={players}
        settings={{ themes: [], similarityLevel: 'close', mrWhiteEnabled: false }}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />
    );
    fireEvent.click(screen.getByLabelText(/anime/i));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ themes: ['anime'] }));

    fireEvent.click(screen.getByLabelText(/mr\. white/i));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ mrWhiteEnabled: true }));
  });

  it('lets the host start the game', () => {
    const onStart = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        players={players}
        settings={{ themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false }}
        onStart={onStart}
        onSettingsChange={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /lancer la partie/i }));
    expect(onStart).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run test/components/LobbyScreen.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write `web/src/components/LobbyScreen.tsx`**

```tsx
'use client';
import type { RoomSettings, SimilarityLevel } from '@/lib/hostSettings';

const AVAILABLE_THEMES = ['anime', 'films', 'histoire'];

interface Player {
  id: string;
  name: string;
  alive: boolean;
  connected: boolean;
}

interface LobbyScreenProps {
  isHost: boolean;
  players: Player[];
  settings: RoomSettings;
  onStart: () => void;
  onSettingsChange: (settings: RoomSettings) => void;
}

export function LobbyScreen({ isHost, players, settings, onStart, onSettingsChange }: LobbyScreenProps) {
  function toggleTheme(theme: string) {
    const themes = settings.themes.includes(theme)
      ? settings.themes.filter((t) => t !== theme)
      : [...settings.themes, theme];
    onSettingsChange({ ...settings, themes });
  }

  return (
    <div>
      <h2>Lobby</h2>
      <ul>
        {players.map((p) => (
          <li key={p.id}>{p.name}{!p.connected ? ' (déconnecté)' : ''}</li>
        ))}
      </ul>

      {isHost && (
        <div>
          <fieldset>
            <legend>Thèmes</legend>
            {AVAILABLE_THEMES.map((theme) => (
              <label key={theme} htmlFor={`theme-${theme}`}>
                <input
                  id={`theme-${theme}`}
                  type="checkbox"
                  checked={settings.themes.includes(theme)}
                  onChange={() => toggleTheme(theme)}
                />
                {theme}
              </label>
            ))}
          </fieldset>

          <label htmlFor="similarity-select">Similarité</label>
          <select
            id="similarity-select"
            value={settings.similarityLevel}
            onChange={(e) => onSettingsChange({ ...settings, similarityLevel: e.target.value as SimilarityLevel })}
          >
            <option value="none">Aucun lien</option>
            <option value="close">Proche</option>
            <option value="very_close">Très proche</option>
          </select>

          <label htmlFor="mrwhite-checkbox">
            <input
              id="mrwhite-checkbox"
              type="checkbox"
              checked={settings.mrWhiteEnabled}
              onChange={(e) => onSettingsChange({ ...settings, mrWhiteEnabled: e.target.checked })}
            />
            Mr. White
          </label>

          <button onClick={onStart}>Lancer la partie</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run test/components/LobbyScreen.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire `LobbyScreen` into `GameApp` and persist host settings**

Modify `web/src/components/GameApp.tsx`: add settings state, and inside `renderPhase()` replace the line `if (roomState.phase === 'LOBBY') return <p>En attente dans le lobby...</p>;` with a call to `LobbyScreen`.

```tsx
// additions/changes in web/src/components/GameApp.tsx
import { LobbyScreen } from '@/components/LobbyScreen';
import { getStoredHostSettings, storeHostSettings, type RoomSettings } from '@/lib/hostSettings';

// inside GameApp component, alongside existing state:
const [settings, setSettings] = useState<RoomSettings>(() => getStoredHostSettings());

function handleSettingsChange(next: RoomSettings) {
  setSettings(next);
  storeHostSettings(next);
}

function handleStart() {
  send({ type: 'START_GAME', settings });
}

// inside renderPhase(), replace the LOBBY line:
if (roomState.phase === 'LOBBY') {
  return (
    <LobbyScreen
      isHost={roomState.hostId === getOrCreateClientId()}
      players={roomState.players}
      settings={settings}
      onStart={handleStart}
      onSettingsChange={handleSettingsChange}
    />
  );
}
```

- [ ] **Step 6: Add a test for this wiring (append to `web/test/components/GameApp.test.tsx`)**

```tsx
it('renders LobbyScreen with the host flag set when hostId matches the client id', () => {
  window.localStorage.setItem('undercover:clientId', 'c1');
  vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
    mockSocket({
      status: 'open',
      lastMessage: { type: 'ROOM_STATE', phase: 'LOBBY', hostId: 'c1', players: [{ id: 'c1', name: 'Seb', alive: true, connected: true }] },
    })
  );
  render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />);
  expect(screen.getByRole('button', { name: /lancer la partie/i })).toBeInTheDocument();
});
```

- [ ] **Step 7: Run the full web test suite**

Run: `cd web && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add web/src/components/LobbyScreen.tsx web/src/components/GameApp.tsx web/test/components/LobbyScreen.test.tsx web/test/components/GameApp.test.tsx
git commit -m "feat(web): add lobby screen with host settings and player list"
```

---

### Task 14: Role reveal screen

**Files:**
- Create: `web/src/components/RoleRevealScreen.tsx`
- Modify: `web/src/components/GameApp.tsx`
- Test: `web/test/components/RoleRevealScreen.test.tsx`

**Interfaces:**
- Produces: `<RoleRevealScreen role character />`, wired into `GameApp`'s `ROLE_REVEAL` case.

- [ ] **Step 1: Write the failing test**

```tsx
// web/test/components/RoleRevealScreen.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleRevealScreen } from '@/components/RoleRevealScreen';

describe('RoleRevealScreen', () => {
  it('shows the character name for a civil', () => {
    render(<RoleRevealScreen role="civil" character="Goku" />);
    expect(screen.getByText('Goku')).toBeInTheDocument();
    expect(screen.getByText(/civil/i)).toBeInTheDocument();
  });

  it('shows the character name for an undercover', () => {
    render(<RoleRevealScreen role="undercover" character="Vegeta" />);
    expect(screen.getByText('Vegeta')).toBeInTheDocument();
    expect(screen.getByText(/undercover/i)).toBeInTheDocument();
  });

  it('shows a bluff message with no character for Mr. White', () => {
    render(<RoleRevealScreen role="mrwhite" character={null} />);
    expect(screen.getByText(/mr\. white/i)).toBeInTheDocument();
    expect(screen.queryByText('Goku')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run test/components/RoleRevealScreen.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write `web/src/components/RoleRevealScreen.tsx`**

```tsx
'use client';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface RoleRevealScreenProps {
  role: Role | null;
  character: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  civil: 'Civil',
  undercover: 'Undercover',
  mrwhite: 'Mr. White',
};

export function RoleRevealScreen({ role, character }: RoleRevealScreenProps) {
  if (!role) return <p>Chargement de ton rôle...</p>;

  if (role === 'mrwhite') {
    return (
      <div>
        <h2>Tu es Mr. White</h2>
        <p>Tu n'as aucun personnage. Bluffe pour ne pas te faire repérer !</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Tu es {ROLE_LABEL[role]}</h2>
      <p>{character}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run test/components/RoleRevealScreen.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire it into `GameApp`**

```tsx
// additions in web/src/components/GameApp.tsx
import { RoleRevealScreen } from '@/components/RoleRevealScreen';

// inside renderPhase(), insert this branch before the final fallback return:
if (roomState.phase === 'ROLE_REVEAL') {
  const me = roomState.players.find((p: any) => p.id === getOrCreateClientId());
  return <RoleRevealScreen role={me?.role ?? null} character={me?.character ?? null} />;
}
```

- [ ] **Step 6: Add a wiring test (append to `web/test/components/GameApp.test.tsx`)**

```tsx
it('renders RoleRevealScreen with the current player private card during ROLE_REVEAL', () => {
  window.localStorage.setItem('undercover:clientId', 'c1');
  vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
    mockSocket({
      status: 'open',
      lastMessage: {
        type: 'ROOM_STATE',
        phase: 'ROLE_REVEAL',
        hostId: 'c1',
        players: [{ id: 'c1', name: 'Seb', alive: true, connected: true, role: 'civil', character: 'Goku' }],
      },
    })
  );
  render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />);
  expect(screen.getByText('Goku')).toBeInTheDocument();
});
```

- [ ] **Step 7: Run the full web test suite**

Run: `cd web && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add web/src/components/RoleRevealScreen.tsx web/src/components/GameApp.tsx web/test/components/RoleRevealScreen.test.tsx web/test/components/GameApp.test.tsx
git commit -m "feat(web): add role reveal screen"
```

---

### Task 15: Clue round screen

**Files:**
- Create: `web/src/components/ClueRoundScreen.tsx`
- Modify: `web/src/components/GameApp.tsx`
- Test: `web/test/components/ClueRoundScreen.test.tsx`

**Interfaces:**
- Produces: `<ClueRoundScreen players turnOrder currentTurnIndex clues round selfId onSubmitClue />`, wired into `GameApp`'s `CLUE_ROUND` case. No client-side countdown widget is built — the server enforces the 60s timeout via its own alarm (Task 8); the UI just shows whose turn it is.

- [ ] **Step 1: Write the failing test**

```tsx
// web/test/components/ClueRoundScreen.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClueRoundScreen } from '@/components/ClueRoundScreen';

const players = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
];

describe('ClueRoundScreen', () => {
  it("shows whose turn it is when it isn't the viewer's turn", () => {
    render(
      <ClueRoundScreen
        players={players}
        turnOrder={['p1', 'p2']}
        currentTurnIndex={1}
        clues={[]}
        round={1}
        selfId="p1"
        onSubmitClue={() => {}}
      />
    );
    expect(screen.getByText(/au tour de bob/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /envoyer/i })).not.toBeInTheDocument();
  });

  it('shows an input and submits a clue when it is the viewer\'s turn', () => {
    const onSubmitClue = vi.fn();
    render(
      <ClueRoundScreen
        players={players}
        turnOrder={['p1', 'p2']}
        currentTurnIndex={0}
        clues={[]}
        round={1}
        selfId="p1"
        onSubmitClue={onSubmitClue}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/ton indice/i), { target: { value: 'fort' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));
    expect(onSubmitClue).toHaveBeenCalledWith('fort');
  });

  it('lists clues already given in the current round', () => {
    render(
      <ClueRoundScreen
        players={players}
        turnOrder={['p1', 'p2']}
        currentTurnIndex={1}
        clues={[{ playerId: 'p1', round: 1, text: 'fort' }]}
        round={1}
        selfId="p2"
        onSubmitClue={() => {}}
      />
    );
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getByText(/fort/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run test/components/ClueRoundScreen.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write `web/src/components/ClueRoundScreen.tsx`**

```tsx
'use client';
import { useState } from 'react';

interface Player {
  id: string;
  name: string;
}

interface Clue {
  playerId: string;
  round: number;
  text: string;
}

interface ClueRoundScreenProps {
  players: Player[];
  turnOrder: string[];
  currentTurnIndex: number;
  clues: Clue[];
  round: number;
  selfId: string;
  onSubmitClue: (text: string) => void;
}

export function ClueRoundScreen({ players, turnOrder, currentTurnIndex, clues, round, selfId, onSubmitClue }: ClueRoundScreenProps) {
  const [draft, setDraft] = useState('');
  const currentPlayerId = turnOrder[currentTurnIndex];
  const currentPlayer = players.find((p) => p.id === currentPlayerId);
  const isMyTurn = currentPlayerId === selfId;
  const roundClues = clues.filter((c) => c.round === round);

  return (
    <div>
      <h2>Manche {round}</h2>
      <ul>
        {roundClues.map((c) => {
          const player = players.find((p) => p.id === c.playerId);
          return (
            <li key={c.playerId}>
              {player?.name}: {c.text || '(pas de réponse)'}
            </li>
          );
        })}
      </ul>

      {isMyTurn ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitClue(draft);
            setDraft('');
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ton indice" />
          <button type="submit">Envoyer</button>
        </form>
      ) : (
        <p>Au tour de {currentPlayer?.name}...</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run test/components/ClueRoundScreen.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire it into `GameApp`**

```tsx
// additions in web/src/components/GameApp.tsx
import { ClueRoundScreen } from '@/components/ClueRoundScreen';

// inside renderPhase(), insert this branch before the final fallback return:
if (roomState.phase === 'CLUE_ROUND') {
  return (
    <ClueRoundScreen
      players={roomState.players}
      turnOrder={roomState.turnOrder}
      currentTurnIndex={roomState.currentTurnIndex}
      clues={roomState.clues}
      round={roomState.round}
      selfId={getOrCreateClientId()}
      onSubmitClue={(text) => send({ type: 'SUBMIT_CLUE', text })}
    />
  );
}
```

- [ ] **Step 6: Add a wiring test (append to `web/test/components/GameApp.test.tsx`)**

```tsx
it('renders ClueRoundScreen and sends SUBMIT_CLUE on submit', () => {
  window.localStorage.setItem('undercover:clientId', 'p1');
  const send = vi.fn();
  vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
    mockSocket({
      status: 'open',
      send,
      lastMessage: {
        type: 'ROOM_STATE',
        phase: 'CLUE_ROUND',
        hostId: 'p1',
        turnOrder: ['p1', 'p2'],
        currentTurnIndex: 0,
        clues: [],
        round: 1,
        players: [
          { id: 'p1', name: 'Alice', alive: true, connected: true },
          { id: 'p2', name: 'Bob', alive: true, connected: true },
        ],
      },
    })
  );
  render(<GameApp roomCode="ABCDE" pseudo="Alice" isHost={false} />);
  fireEvent.change(screen.getByPlaceholderText(/ton indice/i), { target: { value: 'fort' } });
  fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));
  expect(send).toHaveBeenCalledWith({ type: 'SUBMIT_CLUE', text: 'fort' });
});
```

Add `fireEvent` to the existing import line at the top of `web/test/components/GameApp.test.tsx`: `import { render, screen, act, fireEvent } from '@testing-library/react';`

- [ ] **Step 7: Run the full web test suite**

Run: `cd web && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add web/src/components/ClueRoundScreen.tsx web/src/components/GameApp.tsx web/test/components/ClueRoundScreen.test.tsx web/test/components/GameApp.test.tsx
git commit -m "feat(web): add clue round screen"
```

---

### Task 16: Vote screen + elimination reveal

**Files:**
- Create: `web/src/components/VoteScreen.tsx`
- Create: `web/src/components/EliminationScreen.tsx`
- Modify: `web/src/components/GameApp.tsx`
- Test: `web/test/components/VoteScreen.test.tsx`
- Test: `web/test/components/EliminationScreen.test.tsx`

**Interfaces:**
- Produces: `<VoteScreen players selfId onVote />`, `<EliminationScreen players lastEliminatedId selfId onMrWhiteGuess />`, wired into `GameApp`'s `VOTE` and `ELIMINATION` cases.

- [ ] **Step 1: Write the failing test for `VoteScreen`**

```tsx
// web/test/components/VoteScreen.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoteScreen } from '@/components/VoteScreen';

const players = [
  { id: 'p1', name: 'Alice', alive: true },
  { id: 'p2', name: 'Bob', alive: true },
  { id: 'p3', name: 'Carl', alive: false },
];

describe('VoteScreen', () => {
  it('lists alive players excluding the viewer as vote targets', () => {
    render(<VoteScreen players={players} selfId="p1" onVote={() => {}} />);
    expect(screen.getByRole('button', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carl' })).not.toBeInTheDocument();
  });

  it('calls onVote with the target id when clicked', () => {
    const onVote = vi.fn();
    render(<VoteScreen players={players} selfId="p1" onVote={onVote} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
    expect(onVote).toHaveBeenCalledWith('p2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run test/components/VoteScreen.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write `web/src/components/VoteScreen.tsx`**

```tsx
'use client';

interface Player {
  id: string;
  name: string;
  alive: boolean;
}

interface VoteScreenProps {
  players: Player[];
  selfId: string;
  onVote: (targetId: string) => void;
}

export function VoteScreen({ players, selfId, onVote }: VoteScreenProps) {
  const targets = players.filter((p) => p.alive && p.id !== selfId);
  return (
    <div>
      <h2>Qui soupçonnes-tu ?</h2>
      <ul>
        {targets.map((p) => (
          <li key={p.id}>
            <button onClick={() => onVote(p.id)}>{p.name}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run test/components/VoteScreen.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for `EliminationScreen`**

```tsx
// web/test/components/EliminationScreen.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EliminationScreen } from '@/components/EliminationScreen';

const players = [
  { id: 'p1', name: 'Alice', alive: true, role: null, character: null },
  { id: 'p2', name: 'Bob', alive: false, role: 'undercover' as const, character: 'Vegeta' },
];

describe('EliminationScreen', () => {
  it('reveals the eliminated player role and character', () => {
    render(<EliminationScreen players={players} lastEliminatedId="p2" selfId="p1" onMrWhiteGuess={() => {}} />);
    expect(screen.getByText(/bob/i)).toBeInTheDocument();
    expect(screen.getByText(/undercover/i)).toBeInTheDocument();
    expect(screen.getByText(/vegeta/i)).toBeInTheDocument();
  });

  it('does not show a guess form when the eliminated player is not Mr. White', () => {
    render(<EliminationScreen players={players} lastEliminatedId="p2" selfId="p1" onMrWhiteGuess={() => {}} />);
    expect(screen.queryByRole('button', { name: /deviner/i })).not.toBeInTheDocument();
  });

  it('shows a guess form to the eliminated Mr. White and calls onMrWhiteGuess on submit', () => {
    const mrWhitePlayers = [
      { id: 'p1', name: 'Alice', alive: true, role: null, character: null },
      { id: 'p2', name: 'Bob', alive: false, role: 'mrwhite' as const, character: null },
    ];
    const onMrWhiteGuess = vi.fn();
    render(<EliminationScreen players={mrWhitePlayers} lastEliminatedId="p2" selfId="p2" onMrWhiteGuess={onMrWhiteGuess} />);
    fireEvent.change(screen.getByLabelText(/devine le personnage/i), { target: { value: 'Goku' } });
    fireEvent.click(screen.getByRole('button', { name: /deviner/i }));
    expect(onMrWhiteGuess).toHaveBeenCalledWith('Goku');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd web && npx vitest run test/components/EliminationScreen.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 7: Write `web/src/components/EliminationScreen.tsx`**

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
}

interface EliminationScreenProps {
  players: Player[];
  lastEliminatedId: string | null;
  selfId: string;
  onMrWhiteGuess: (guess: string) => void;
}

const ROLE_LABEL: Record<Role, string> = {
  civil: 'un Civil',
  undercover: 'un Undercover',
  mrwhite: 'Mr. White',
};

export function EliminationScreen({ players, lastEliminatedId, selfId, onMrWhiteGuess }: EliminationScreenProps) {
  const [guess, setGuess] = useState('');
  const eliminated = players.find((p) => p.id === lastEliminatedId);

  if (!eliminated) return <p>Personne n'a été éliminé ce tour-ci.</p>;

  const isSelfMrWhiteAwaitingGuess = eliminated.id === selfId && eliminated.role === 'mrwhite';

  return (
    <div>
      <h2>{eliminated.name} a été éliminé(e)</h2>
      <p>
        C'était {eliminated.role ? ROLE_LABEL[eliminated.role] : ''}
        {eliminated.character ? ` (${eliminated.character})` : ''}
      </p>

      {isSelfMrWhiteAwaitingGuess && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onMrWhiteGuess(guess);
          }}
        >
          <label htmlFor="guess-input">Devine le personnage des Civils</label>
          <input id="guess-input" value={guess} onChange={(e) => setGuess(e.target.value)} />
          <button type="submit">Deviner</button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd web && npx vitest run test/components/EliminationScreen.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 9: Wire both into `GameApp`**

```tsx
// additions in web/src/components/GameApp.tsx
import { VoteScreen } from '@/components/VoteScreen';
import { EliminationScreen } from '@/components/EliminationScreen';

// inside renderPhase(), insert these two branches before the final fallback return:
if (roomState.phase === 'VOTE') {
  return (
    <VoteScreen
      players={roomState.players}
      selfId={getOrCreateClientId()}
      onVote={(targetId) => send({ type: 'SUBMIT_VOTE', targetId })}
    />
  );
}

if (roomState.phase === 'ELIMINATION') {
  return (
    <EliminationScreen
      players={roomState.players}
      lastEliminatedId={roomState.lastEliminatedId}
      selfId={getOrCreateClientId()}
      onMrWhiteGuess={(guess) => send({ type: 'MR_WHITE_GUESS', guess })}
    />
  );
}
```

- [ ] **Step 10: Add wiring tests (append to `web/test/components/GameApp.test.tsx`)**

```tsx
it('renders VoteScreen and sends SUBMIT_VOTE on vote', () => {
  window.localStorage.setItem('undercover:clientId', 'p1');
  const send = vi.fn();
  vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
    mockSocket({
      status: 'open',
      send,
      lastMessage: {
        type: 'ROOM_STATE',
        phase: 'VOTE',
        hostId: 'p1',
        players: [
          { id: 'p1', name: 'Alice', alive: true, connected: true },
          { id: 'p2', name: 'Bob', alive: true, connected: true },
        ],
      },
    })
  );
  render(<GameApp roomCode="ABCDE" pseudo="Alice" isHost={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
  expect(send).toHaveBeenCalledWith({ type: 'SUBMIT_VOTE', targetId: 'p2' });
});

it('renders EliminationScreen and sends MR_WHITE_GUESS on guess', () => {
  window.localStorage.setItem('undercover:clientId', 'p2');
  const send = vi.fn();
  vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
    mockSocket({
      status: 'open',
      send,
      lastMessage: {
        type: 'ROOM_STATE',
        phase: 'ELIMINATION',
        hostId: 'p1',
        lastEliminatedId: 'p2',
        players: [
          { id: 'p1', name: 'Alice', alive: true, connected: true, role: null, character: null },
          { id: 'p2', name: 'Bob', alive: false, connected: true, role: 'mrwhite', character: null },
        ],
      },
    })
  );
  render(<GameApp roomCode="ABCDE" pseudo="Bob" isHost={false} />);
  fireEvent.change(screen.getByLabelText(/devine le personnage/i), { target: { value: 'Goku' } });
  fireEvent.click(screen.getByRole('button', { name: /deviner/i }));
  expect(send).toHaveBeenCalledWith({ type: 'MR_WHITE_GUESS', guess: 'Goku' });
});
```

- [ ] **Step 11: Run the full web test suite**

Run: `cd web && npx vitest run`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add web/src/components/VoteScreen.tsx web/src/components/EliminationScreen.tsx web/src/components/GameApp.tsx web/test/components/VoteScreen.test.tsx web/test/components/EliminationScreen.test.tsx web/test/components/GameApp.test.tsx
git commit -m "feat(web): add vote and elimination reveal screens"
```

---

### Task 17: End screen

**Files:**
- Create: `web/src/components/EndScreen.tsx`
- Modify: `web/src/components/GameApp.tsx`
- Modify: `web/src/app/page.tsx`
- Test: `web/test/components/EndScreen.test.tsx`

**Interfaces:**
- Produces: `<EndScreen winner players onReplay />`, wired into `GameApp`'s `END` case. "Rejouer" resets the client back to the Home screen (v1 simplification — restarting the same lobby for a new round is out of scope, see spec's "Hors périmètre").

- [ ] **Step 1: Write the failing test**

```tsx
// web/test/components/EndScreen.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EndScreen } from '@/components/EndScreen';

const players = [
  { id: 'p1', name: 'Alice', role: 'civil' as const, character: 'Goku' },
  { id: 'p2', name: 'Bob', role: 'undercover' as const, character: 'Vegeta' },
];

describe('EndScreen', () => {
  it('announces the winning side', () => {
    render(<EndScreen winner="civil" players={players} onReplay={() => {}} />);
    expect(screen.getByText(/civils/i)).toBeInTheDocument();
  });

  it('lists every player with their revealed role and character', () => {
    render(<EndScreen winner="civil" players={players} onReplay={() => {}} />);
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getByText(/goku/i)).toBeInTheDocument();
    expect(screen.getByText(/bob/i)).toBeInTheDocument();
    expect(screen.getByText(/vegeta/i)).toBeInTheDocument();
  });

  it('calls onReplay when the replay button is clicked', () => {
    const onReplay = vi.fn();
    render(<EndScreen winner="civil" players={players} onReplay={onReplay} />);
    fireEvent.click(screen.getByRole('button', { name: /rejouer/i }));
    expect(onReplay).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run test/components/EndScreen.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write `web/src/components/EndScreen.tsx`**

```tsx
'use client';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface Player {
  id: string;
  name: string;
  role: Role | null;
  character: string | null;
}

interface EndScreenProps {
  winner: Role | null;
  players: Player[];
  onReplay: () => void;
}

const WINNER_LABEL: Record<Role, string> = {
  civil: 'Les Civils gagnent !',
  undercover: 'Les Undercover gagnent !',
  mrwhite: 'Mr. White gagne !',
};

export function EndScreen({ winner, players, onReplay }: EndScreenProps) {
  return (
    <div>
      <h2>{winner ? WINNER_LABEL[winner] : 'Partie terminée'}</h2>
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            {p.name} — {p.role} {p.character ? `(${p.character})` : ''}
          </li>
        ))}
      </ul>
      <button onClick={onReplay}>Rejouer</button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run test/components/EndScreen.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire it into `GameApp`, with a callback prop for returning home**

Add `import { EndScreen } from '@/components/EndScreen';` next to the other component imports at the top of `web/src/components/GameApp.tsx`. Add an `onLeaveRoom` field to the existing `GameAppProps` interface and destructure it, without removing `isHost`:

```ts
interface GameAppProps {
  roomCode: string;
  pseudo: string;
  isHost: boolean;
  onLeaveRoom: () => void;
}

export function GameApp({ roomCode, pseudo, isHost, onLeaveRoom }: GameAppProps) {
```

Then, inside `renderPhase()`, insert the `END` branch before the final fallback return (which is now unreachable for any phase in the state machine, but stays as a defensive default):

```tsx
if (roomState.phase === 'END') {
  return <EndScreen winner={roomState.winner} players={roomState.players} onReplay={onLeaveRoom} />;
}
```

- [ ] **Step 6: Update `web/src/app/page.tsx` to pass `onLeaveRoom`**

```tsx
// web/src/app/page.tsx
'use client';
import { useState } from 'react';
import { HomeScreen } from '@/components/HomeScreen';
import { GameApp } from '@/components/GameApp';

export default function Page() {
  const [room, setRoom] = useState<{ code: string; pseudo: string; isHost: boolean } | null>(null);

  if (!room) {
    return <HomeScreen onEnterRoom={(code, pseudo, isHost) => setRoom({ code, pseudo, isHost })} />;
  }

  return <GameApp roomCode={room.code} pseudo={room.pseudo} isHost={room.isHost} onLeaveRoom={() => setRoom(null)} />;
}
```

- [ ] **Step 7: Add a wiring test (append to `web/test/components/GameApp.test.tsx`)**, updating every existing `render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />)` (and `pseudo="Alice"`) call in that file to also pass `onLeaveRoom={() => {}}`.

```tsx
it('renders EndScreen and calls onLeaveRoom when replay is clicked', () => {
  const onLeaveRoom = vi.fn();
  vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
    mockSocket({
      status: 'open',
      lastMessage: {
        type: 'ROOM_STATE',
        phase: 'END',
        winner: 'civil',
        players: [{ id: 'p1', name: 'Alice', role: 'civil', character: 'Goku' }],
      },
    })
  );
  render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={onLeaveRoom} />);
  fireEvent.click(screen.getByRole('button', { name: /rejouer/i }));
  expect(onLeaveRoom).toHaveBeenCalled();
});
```

- [ ] **Step 8: Run the full web test suite**

Run: `cd web && npx vitest run`
Expected: PASS — every test file across the frontend passes.

- [ ] **Step 9: Run the full backend test suite once more for good measure**

Run: `cd server && npx vitest run`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add web/src/components/EndScreen.tsx web/src/components/GameApp.tsx web/src/app/page.tsx web/test/components/EndScreen.test.tsx web/test/components/GameApp.test.tsx
git commit -m "feat(web): add end screen and wire replay back to the home screen"
```

---

## After this plan

At this point the classic mode is playable end-to-end: pseudo onboarding, room creation/joining, host-configured themes/similarity/Mr. White, lobby, role reveal, timed clue rounds, hidden voting, elimination reveal with Mr. White's guess, and an end screen. Deployment (Vercel for `web/`, `wrangler deploy` for `server/`, wiring `NEXT_PUBLIC_SERVER_URL`) and manual multi-tab playtesting are not covered as tasks here since they are one-off operational steps, not code — do them once this plan is fully executed, before moving on to the "Note" mode's own spec/plan cycle.
