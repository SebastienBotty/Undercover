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
