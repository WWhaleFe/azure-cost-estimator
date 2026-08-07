// ================================================================
// row-serialization.test.js — 행 단위 직렬화(v119)
//
// 배경: 옵션을 빠르게 바꾸면 ui-and-bootstrap 이 tryResolveItem 을 await 없이
//       여러 번 쏜다. 예전에는 "가장 늦게 도착한" 응답이 이겨서, 과거 옵션으로
//       조회한 가격이 최신 값을 덮어쓸 수 있었다(상세는 새 옵션, 가격은 옛 옵션).
//       이제 행마다 하나씩만 돌리고, 진행 중에 다시 요청이 오면 끝난 뒤
//       최신 옵션으로 한 번 더 돌린다.
// ================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 옵션 tier 에 따라 다른 가격을 주는 가짜 서비스. 응답 순서를 시험에서 제어한다.
const gates = [];
const releaseAll = () => { while (gates.length) gates.shift()(); };
// 다음 회차의 조회가 실제로 시작될 때까지(게이트가 등록될 때까지) 기다린다
const waitForGate = async (n = 1) => {
  for (let i = 0; i < 200 && gates.length < n; i++) await new Promise((r) => setTimeout(r, 0));
};

vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(), clearCacheForCurrency: vi.fn(), fetchWithCorsFallback: vi.fn(),
  apiCache: new Map(), activeProxyIndex: 0,
}));

globalThis.document = { getElementById: () => ({ value: 'KRW' }) };

const { REG } = await import('../src/core/registry.js');
const { tryResolveItem } = await import('../src/core/resolver-engine.js');

const resolveOrder = [];
REG._svcDefs['FakeSvc'] = { apiServiceName: 'Fake', steps: [{ key: 'tier', label: 't', options: ['A', 'B'] }] };
REG['_buildDetail_FakeSvc'] = function (r) { r.skuName = r.options.tier || ''; r.detail = r.skuName; };
REG['_resolve_FakeSvc'] = async function (row) {
  const tierAtStart = row.options.tier;                 // 이 회차가 본 옵션
  await new Promise((res) => gates.push(res));          // 응답을 시험이 풀어줄 때까지 대기
  resolveOrder.push(tierAtStart);
  row.paygItem = { skuName: tierAtStart, unitPrice: tierAtStart === 'A' ? 10 : 20 };
};

const mkRow = () => ({ id: 1, region: 'koreacentral', serviceCategory: 'FakeSvc', options: { tier: 'A' },
  skuName: 'A', detail: 'A', qty: 1, usage: 730, paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null });

beforeEach(() => { gates.length = 0; resolveOrder.length = 0; });

describe('행 단위 직렬화', () => {
  it('진행 중에 옵션이 바뀌면, 끝난 뒤 최신 옵션으로 한 번 더 돌아 최신 값이 남는다', async () => {
    const row = mkRow();
    const p1 = tryResolveItem(row);                     // tier=A 로 시작

    row.options.tier = 'B';                             // 사용자가 옵션 변경
    row.skuName = 'B';
    const p2 = tryResolveItem(row);                     // 재실행 예약(별도 조회 아님)

    await waitForGate();
    releaseAll();                                       // 1회차 응답
    await waitForGate();                                // 재실행 회차가 시작될 때까지
    releaseAll();                                       // 재실행 회차 응답
    await Promise.all([p1, p2]);

    expect(resolveOrder).toEqual(['A', 'B']);           // 순서대로 정확히 2회
    expect(row.paygItem.skuName).toBe('B');             // 최신 옵션이 남는다
    expect(row.paygItem.unitPrice).toBe(20);
  });

  it('같은 행에 대해 동시에 여러 번 불러도 조회는 겹치지 않는다', async () => {
    const row = mkRow();
    const ps = [tryResolveItem(row), tryResolveItem(row), tryResolveItem(row)];
    expect(gates.length).toBe(1);                       // 동시에 뜬 조회는 1건뿐

    releaseAll();
    await waitForGate();
    releaseAll();
    await Promise.all(ps);
    expect(resolveOrder.length).toBe(2);                // 최초 1회 + 재실행 1회
  });

  it('다른 행끼리는 서로 막지 않는다(일괄 조회 동시성 유지)', async () => {
    const a = mkRow(), b = { ...mkRow(), id: 2 };
    const ps = [tryResolveItem(a), tryResolveItem(b)];
    expect(gates.length).toBe(2);                       // 두 행이 동시에 조회
    releaseAll();
    await Promise.all(ps);
    expect(a.paygItem).toBeTruthy();
    expect(b.paygItem).toBeTruthy();
  });

  it('조회가 끝나면 잠금이 풀려 다음 조회가 정상 실행된다', async () => {
    const row = mkRow();
    const p = tryResolveItem(row);
    releaseAll();
    await p;
    const p2 = tryResolveItem(row);
    expect(gates.length).toBe(1);                       // 새 조회가 시작됨
    releaseAll();
    await p2;
    expect(resolveOrder.length).toBe(2);
  });
});
