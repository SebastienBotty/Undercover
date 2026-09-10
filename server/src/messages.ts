import type { RoomSettings } from './types';

export type ClientMessage =
  | { type: 'JOIN_ROOM'; code: string; name: string; clientId: string; isHost: boolean }
  | { type: 'START_GAME'; settings: RoomSettings }
  | { type: 'UPDATE_SETTINGS'; settings: RoomSettings }
  | { type: 'SUBMIT_CLUE'; text: string }
  | { type: 'SUBMIT_THEME'; text: string }
  | { type: 'SUBMIT_VOTE'; targetId: string | null }
  | { type: 'RETRACT_VOTE' }
  | { type: 'MR_WHITE_GUESS'; guess: string }
  | { type: 'RESTART_GAME' }
  | { type: 'KICK_PLAYER'; playerId: string }
  | { type: 'LEAVE_ROOM' };

export interface ErrorMessage {
  type: 'ERROR';
  code: string;
  message: string;
}
