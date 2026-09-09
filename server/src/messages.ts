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
