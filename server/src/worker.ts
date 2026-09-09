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
