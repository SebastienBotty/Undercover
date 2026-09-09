export type Role = 'civil' | 'undercover' | 'mrwhite';

export type Phase = 'LOBBY' | 'ROLE_REVEAL' | 'CLUE_ROUND' | 'VOTE' | 'ELIMINATION' | 'END';

export type SimilarityLevel = 'none' | 'close' | 'very_close';

export interface RoomSettings {
  themes: string[];
  similarityLevel: SimilarityLevel;
  mrWhiteEnabled: boolean;
  /** Which anime series to draw characters from when 'anime' is in themes. Empty/omitted = all. */
  animeSeries?: string[];
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
