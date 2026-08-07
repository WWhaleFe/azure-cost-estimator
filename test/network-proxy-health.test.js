// ================================================================
// network-proxy-health.test.js — 프록시 쿨다운 복귀 + 계단식 타임아웃 (v118)
//
// 배경: 예전에는 성공한 프록시를 activeProxyIndex 에 눌러 담고 되돌리는 장치가
//       없었다. direct 가 한 번 실패해 느린 공개 프록시로 넘어가면 그 뒤 모든
//       요청이 그 경로로 가서 전체가 느려졌다(실측: 같은 작업이 374초).
//       또 프록시마다 25초 고정이라 최악 7×25=175초를 기다렸다.
// ================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CORS_PROXIES } from '../src/core/config.js';

const { fetchWithCorsFallback, resetProxyHealth } = await import('../src/core/network.js');

const OK_BODY = JSON.stringify({ Items: [{ skuName: 'X', unitPrice: 1 }] });
const NAME_OF = (u) => {
  if (u.startsWith('/api/prices')) return 'vercel-fn';
  if (u.startsWith('https://prices.azure.com')) return 'direct';
  const hit = CORS_PROXIES.find((p) => p.name !== 'vercel-fn' && p.name !== 'direct' && u.includes(p.name.split('.')[0]));
  return hit ? hit.name : u.slice(0, 40);
};
const TARGET = 'https://prices.azure.com/api/retail/prices?x=1';

let calls = [];
// down: 실패시킬 프록시 이름 집합
function mockFetch(down = new Set(), { hangFor = new Set() } = {}) {
  globalThis.fetch = vi.fn(async (url, opts) => {
    const name = NAME_OF(String(url));
    calls.push(name);
    if (hangFor.has(name)) {
      // 응답하지 않는 프록시 — AbortController 가 끊어줘야 다음으로 넘어간다
      return await new Promise((_, rej) => {
        opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    if (down.has(name)) throw new Error('boom');
    return { ok: true, text: async () => OK_BODY };
  });
}

beforeEach(() => { calls = []; resetProxyHealth(); vi.useRealTimers(); });
afterEach(() => { vi.useRealTimers(); resetProxyHealth(); });

describe('프록시 쿨다운 · 복귀', () => {
  it('실패한 프록시는 다음 요청에서 건너뛴다(매번 재시도하지 않음)', async () => {
    mockFetch(new Set(['vercel-fn', 'direct']));
    await fetchWithCorsFallback(TARGET);
    const first = [...calls];
    expect(first.slice(0, 2)).toEqual(['vercel-fn', 'direct']);   // 1회차엔 시도

    calls = [];
    await fetchWithCorsFallback(TARGET);
    expect(calls).not.toContain('vercel-fn');                      // 2회차엔 쿨다운으로 건너뜀
    expect(calls).not.toContain('direct');
  });

  it('쿨다운이 끝나면 원래 1순위로 자동 복귀한다', async () => {
    mockFetch(new Set(['vercel-fn', 'direct']));
    await fetchWithCorsFallback(TARGET);                           // direct 실패 → 쿨다운

    mockFetch(new Set());                                          // 경로가 회복됨
    calls = [];
    await fetchWithCorsFallback(TARGET);
    expect(calls).not.toContain('direct');                         // 아직 쿨다운 중

    // 쿨다운(60초)이 지난 시점으로 이동
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    try {
      calls = [];
      await fetchWithCorsFallback(TARGET);
      expect(calls[0]).toBe('vercel-fn');                          // 우선순위 복귀
    } finally { Date.now = realNow; }
  });

  it('성공하면 그 프록시의 쿨다운·연속 실패가 초기화된다', async () => {
    mockFetch(new Set(['vercel-fn']));
    await fetchWithCorsFallback(TARGET);                           // direct 성공
    calls = [];
    await fetchWithCorsFallback(TARGET);
    expect(calls).toContain('direct');                             // direct 는 계속 정상 취급
  });

  it('크기 제한이 있어도 정상 프록시를 먼저 쓴다(sticky 무시 문제 해소)', async () => {
    mockFetch(new Set());
    await fetchWithCorsFallback(TARGET, 800);                      // 800KB → 625/500KB 프록시는 후순위
    expect(calls[0]).toBe('vercel-fn');
    const small = CORS_PROXIES.filter((p) => (p.sizeKB || Infinity) < 800).map((p) => p.name);
    expect(small.length).toBeGreaterThan(0);
  });
});

describe('계단식 타임아웃 · 실제 취소', () => {
  it('응답하지 않는 프록시는 끊고 다음으로 넘어간다', async () => {
    mockFetch(new Set(), { hangFor: new Set(['vercel-fn']) });
    vi.useFakeTimers();
    const p = fetchWithCorsFallback(TARGET);
    await vi.advanceTimersByTimeAsync(10_001);                     // 1차 시도 제한 10초
    const data = await p;
    expect(data.Items).toHaveLength(1);
    expect(calls[0]).toBe('vercel-fn');
    expect(calls).toContain('direct');                             // 끊고 다음 경로로 성공
  });

  it('AbortController 로 실제 요청에 abort 신호가 전달된다', async () => {
    let sawSignal = false;
    globalThis.fetch = vi.fn(async (url, opts) => {
      sawSignal = !!(opts && opts.signal);
      return { ok: true, text: async () => OK_BODY };
    });
    await fetchWithCorsFallback(TARGET);
    expect(sawSignal).toBe(true);
  });
});
