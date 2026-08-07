// ================================================================
// network-inflight.test.js — apiFetch 의 진행 중 요청 병합(v117)
//
// 배경: apiCache 는 요청이 "끝난 뒤에만" 채워진다. 행을 동시에 조회하면
//       캐시가 비어 있는 사이 같은 URL 이 여러 번 네트워크로 나간다.
//       한 서비스의 여러 행은 보통 (serviceName, region) 만으로 URL 이 같아서
//       (예: Front Door 4행 = 216KB × 4) 병렬화의 이득을 그대로 까먹는다.
// ================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// fetchWithCorsFallback 이 쓰는 fetch 를 직접 목킹한다(프록시 체인 그대로 통과).
let fetchCalls = 0;
let resolveGate;
const gate = () => new Promise((r) => { resolveGate = r; });
let pending = null;

globalThis.fetch = vi.fn(async () => {
  fetchCalls++;
  if (pending) await pending;                       // 응답을 잡아두어 "진행 중" 상태를 만든다
  return { ok: true, text: async () => JSON.stringify({ Items: [{ skuName: 'X', unitPrice: 1 }] }) };
});

const { apiFetch, apiCache } = await import('../src/core/network.js');

beforeEach(() => { fetchCalls = 0; apiCache.clear(); pending = null; });

describe('apiFetch 진행 중 요청 병합', () => {
  it('같은 URL 을 동시에 여러 번 요청해도 네트워크는 한 번만 나간다', async () => {
    pending = gate();
    const filters = { serviceName: 'Azure Front Door Service', priceType: 'Consumption' };
    const all = Promise.all([1, 2, 3, 4].map(() => apiFetch(filters, 'KRW')));
    await Promise.resolve();
    resolveGate();                                   // 응답 개방
    const results = await all;

    expect(fetchCalls).toBe(1);                      // 4행 → 요청 1건
    expect(results).toHaveLength(4);
    results.forEach((r) => expect(r).toHaveLength(1));
  });

  it('필터가 다르면 각각 나간다(과도한 병합이 아님)', async () => {
    await Promise.all([
      apiFetch({ serviceName: 'Event Hubs', armRegionName: 'koreacentral' }, 'KRW'),
      apiFetch({ serviceName: 'Service Bus', armRegionName: 'koreacentral' }, 'KRW'),
    ]);
    expect(fetchCalls).toBe(2);
  });

  it('완료 후에는 캐시가 받아 네트워크가 더 나가지 않는다', async () => {
    const filters = { serviceName: 'Event Hubs', armRegionName: 'koreacentral' };
    await apiFetch(filters, 'KRW');
    expect(fetchCalls).toBe(1);
    await apiFetch(filters, 'KRW');
    expect(fetchCalls).toBe(1);                      // 캐시 히트
  });

  it('실패는 병합에 남지 않아 다음 호출이 다시 시도한다', async () => {
    globalThis.fetch = vi.fn(async () => { fetchCalls++; throw new Error('boom'); });
    const filters = { serviceName: 'Broken', armRegionName: 'koreacentral' };
    await expect(apiFetch(filters, 'KRW')).rejects.toThrow();
    const first = fetchCalls;
    await expect(apiFetch(filters, 'KRW')).rejects.toThrow();
    expect(fetchCalls).toBeGreaterThan(first);       // 재시도됨(진행 중 맵에 눌러앉지 않음)
  });
});

// ================================================================
// 빈 결과 음성 캐시 (v119)
//   apiCache 는 items.length>0 일 때만 채운다. 그래서 "0건" 응답(그 리전에 없는
//   SKU 등)은 캐시되지 않아, 같은 실패 조회가 매번 네트워크로 나갔다.
// ================================================================
describe('빈 결과 음성 캐시', () => {
  const EMPTY = { ok: true, text: async () => JSON.stringify({ Items: [] }) };

  it('0건 응답을 기억해 같은 조회를 다시 내보내지 않는다', async () => {
    const { clearNegativeCache } = await import('../src/core/network.js');
    clearNegativeCache();
    globalThis.fetch = vi.fn(async () => { fetchCalls++; return EMPTY; });

    const filters = { serviceName: 'Nope', armRegionName: 'koreacentral' };
    expect(await apiFetch(filters, 'KRW')).toEqual([]);
    const after = fetchCalls;
    expect(await apiFetch(filters, 'KRW')).toEqual([]);
    expect(fetchCalls).toBe(after);                 // 두 번째는 네트워크 없이 [] 반환
  });

  it('필터가 다르면 음성 캐시에 걸리지 않는다', async () => {
    const { clearNegativeCache } = await import('../src/core/network.js');
    clearNegativeCache();
    globalThis.fetch = vi.fn(async () => { fetchCalls++; return EMPTY; });

    await apiFetch({ serviceName: 'NopeA', armRegionName: 'koreacentral' }, 'KRW');
    const after = fetchCalls;
    await apiFetch({ serviceName: 'NopeB', armRegionName: 'koreacentral' }, 'KRW');
    expect(fetchCalls).toBeGreaterThan(after);
  });

  it('네트워크 실패는 음성 캐시에 남지 않는다(다음 호출이 재시도)', async () => {
    const { clearNegativeCache } = await import('../src/core/network.js');
    clearNegativeCache();
    globalThis.fetch = vi.fn(async () => { fetchCalls++; throw new Error('boom'); });

    const filters = { serviceName: 'Flaky', armRegionName: 'koreacentral' };
    await expect(apiFetch(filters, 'KRW')).rejects.toThrow();
    const after = fetchCalls;
    await expect(apiFetch(filters, 'KRW')).rejects.toThrow();
    expect(fetchCalls).toBeGreaterThan(after);
  });

  it('통화를 바꾸면 음성 캐시도 함께 비워진다', async () => {
    const { clearNegativeCache, clearCacheForCurrency } = await import('../src/core/network.js');
    clearNegativeCache();
    globalThis.fetch = vi.fn(async () => { fetchCalls++; return EMPTY; });

    const filters = { serviceName: 'Nope2', armRegionName: 'koreacentral' };
    await apiFetch(filters, 'KRW');
    const after = fetchCalls;
    await apiFetch(filters, 'KRW');
    expect(fetchCalls).toBe(after);                 // 캐시됨
    clearCacheForCurrency('KRW');
    await apiFetch(filters, 'KRW');
    expect(fetchCalls).toBeGreaterThan(after);      // 다시 조회됨
  });
});
