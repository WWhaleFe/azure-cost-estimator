// api/prices.js 서버리스 핸들러 테스트 (mock req/res, fetch 목)
import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from '../api/prices.js';

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: '', ended: false };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = JSON.stringify(o); return res; };
  res.send = (t) => { res.body = t; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}
const call = async (query, method = 'GET') => {
  const res = mockRes();
  await handler({ method, query }, res);
  return res;
};

afterEach(() => { vi.restoreAllMocks(); });

describe('api/prices 보안/유효성', () => {
  it('url 누락 → 400', async () => {
    expect((await call({})).statusCode).toBe(400);
  });
  it('허용 안 된 host → 403', async () => {
    expect((await call({ url: 'https://evil.example.com/x' })).statusCode).toBe(403);
  });
  it('http(비 https) prices → 403', async () => {
    expect((await call({ url: 'http://prices.azure.com/api/retail/prices' })).statusCode).toBe(403);
  });
  it('POST → 405', async () => {
    expect((await call({ url: 'x' }, 'POST')).statusCode).toBe(405);
  });
  it('OPTIONS → 204 + CORS', async () => {
    const r = await call({}, 'OPTIONS');
    expect(r.statusCode).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('api/prices 프록시(fetch 목)', () => {
  it('prices.azure.com 을 그대로 호출하고 상태/본문 릴레이 + 캐시헤더', async () => {
    const fake = { Items: [{ armSkuName: 'X', unitPrice: 1 }] };
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify(fake),
    });
    const url = 'https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview&$top=1';
    const r = await call({ url });
    expect(spy).toHaveBeenCalledWith(url, expect.any(Object));
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).Items).toHaveLength(1);
    expect(String(r.headers['cache-control'])).toContain('max-age');
    expect(r.headers['access-control-allow-origin']).toBe('*');
  });

  it('업스트림 예외 → 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    const r = await call({ url: 'https://prices.azure.com/api/retail/prices' });
    expect(r.statusCode).toBe(502);
  });
});
