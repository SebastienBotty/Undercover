import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('worker', () => {
  it('responds OK on /health', async () => {
    const res = await SELF.fetch('https://example.com/health');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
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

  it('POST /api/create-room sets Access-Control-Allow-Origin so cross-origin fetch() can read it', async () => {
    // The Next.js frontend and this Worker are deployed on different origins in production
    // (Vercel + workers.dev/custom domain), so the browser blocks reading the response body of
    // this cross-origin fetch() without a CORS header.
    const res = await SELF.fetch('https://example.com/api/create-room', { method: 'POST' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('OPTIONS /api/create-room answers a CORS preflight', async () => {
    const res = await SELF.fetch('https://example.com/api/create-room', { method: 'OPTIONS' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('GET /api/themes returns the theme catalog with anime broken down by series', async () => {
    const res = await SELF.fetch('https://example.com/api/themes');
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = await res.json<{ themes: { id: string; label: string; count: number; series?: unknown[] }[] }>();

    const anime = body.themes.find((t) => t.id === 'anime')!;
    expect(anime).toBeDefined();
    expect(anime.count).toBeGreaterThan(0);
    expect(Array.isArray(anime.series)).toBe(true);
    expect(anime.series!.length).toBeGreaterThan(0);

    const films = body.themes.find((t) => t.id === 'films')!;
    expect(films).toBeDefined();
    expect(films.series).toBeUndefined();
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
