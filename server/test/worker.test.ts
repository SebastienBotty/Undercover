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
