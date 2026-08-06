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
  it('POST → 405 + Allow 헤더', async () => {
    const r = await call({ url: 'x' }, 'POST');
    expect(r.statusCode).toBe(405);
    expect(r.headers.allow).toBe('GET, HEAD, OPTIONS');
  });
  it('OPTIONS → 204 + CORS', async () => {
    const r = await call({}, 'OPTIONS');
    expect(r.statusCode).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe('*');
    expect(r.headers['access-control-allow-methods']).toBe('GET, HEAD, OPTIONS');
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
    // s-maxage 가 엣지(Vercel CDN) 캐시를 켜는 핵심 지시자다. max-age 만 검사하면
    // s-maxage 가 빠져도 통과해 매 조회가 원본까지 가는 회귀를 놓친다.
    // (배포된 응답의 client 헤더에는 Vercel 이 s-maxage/SWR 를 소비하고 지운 채
    //  'public, max-age=3600' 만 남으므로, 확인은 x-vercel-cache: HIT 로 한다)
    const cc = String(r.headers['cache-control']);
    expect(cc).toContain('public');
    expect(cc).toContain('max-age=3600');
    expect(cc).toContain('s-maxage=3600');
    expect(cc).toContain('stale-while-revalidate=86400');
    expect(r.headers['access-control-allow-origin']).toBe('*');
  });

  // HEAD 는 GET 과 같은 상태/헤더를 주고 본문만 비운다. 헬스체크가 405 를 받아
  // 캐시 헤더까지 기본값으로 보이던 혼선을 없앤다.
  it('HEAD → GET 과 동일한 상태/캐시헤더 + 본문 없음', async () => {
    const fake = { Items: [{ armSkuName: 'X', unitPrice: 1 }] };
    const body = JSON.stringify(fake);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ status: 200, text: async () => body });
    const url = 'https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview&$top=1';
    const r = await call({ url }, 'HEAD');
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe('');                                        // 본문 없음
    expect(r.ended).toBe(true);
    expect(r.headers['content-length']).toBe(String(Buffer.byteLength(body)));
    expect(String(r.headers['cache-control'])).toContain('s-maxage=3600');
    expect(r.headers['access-control-allow-origin']).toBe('*');
  });

  it('HEAD 도 host 잠금을 그대로 적용', async () => {
    expect((await call({ url: 'https://evil.example.com/x' }, 'HEAD')).statusCode).toBe(403);
    expect((await call({}, 'HEAD')).statusCode).toBe(400);
  });

  it('업스트림 예외 → 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    const r = await call({ url: 'https://prices.azure.com/api/retail/prices' });
    expect(r.statusCode).toBe(502);
  });
});
