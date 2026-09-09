export { GameRoom } from './GameRoom';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response('OK');
    }
    return new Response('Not found', { status: 404 });
  },
};
