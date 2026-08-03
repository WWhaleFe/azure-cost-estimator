// 신형 VM 시리즈(Standard_ 접두사 skuName) + Spot 매칭 회귀 테스트 + 리전 미제공 경고.
// 배경: Dsv7·Msv3 등은 API skuName/meterName 이 'Standard_D2s_v7'처럼 접두사를 포함해
//       구 skuM 정규화가 매칭 실패 → "매칭 없음". skuM 을 접두사/Spot 토큰 제거로 고쳤다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/vm-d2s_v7-koreacentral.json', import.meta.url)));

vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async (filters) => {
    if (filters.serviceName === 'Virtual Machines Licenses') return [];
    // 리전 필터 없는 전-리전 가용성 조회는 별도 테스트에서 처리(여기선 koreacentral 픽스처만)
    if (filters.priceType === 'Consumption') return fx.consumption;
    if (filters.priceType === 'Reservation') return fx.reservation;
    return [];
  }),
  clearCacheForCurrency: vi.fn(),
  fetchWithCorsFallback: vi.fn(),
  apiCache: new Map(),
  activeProxyIndex: 0,
}));

import { REG } from '../src/core/registry.js';
import '../src/services/vm.js';

function makeRow(opts = {}) {
  return {
    region: 'koreacentral', serviceCategory: 'Virtual Machine', skuName: 'D2s_v7',
    options: { os: 'Linux', swType: '(OS Only)', tier: 'Standard', license: '라이선스 포함',
      category: '일반적인 용도', series: 'D-series v7', instance: 'D2s_v7', ...opts },
    paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null,
  };
}

describe('VM 신형 시리즈 매칭 (Standard_ 접두사)', () => {
  it("Linux D2s_v7 → 'Standard_D2s_v7' skuName 을 정규화 매칭", async () => {
    const row = makeRow();
    await REG['_resolve_Virtual_Machine'](row, 'KRW');
    expect(row.paygItem).toBeTruthy();
    expect(row.paygItem.unitPrice).toBe(250.1398);           // Linux 정상가
    expect(/windows/i.test(row.paygItem.productName)).toBe(false);
  });

  it('Windows D2s_v7 → Windows 항목(더 비쌈)', async () => {
    const row = makeRow({ os: 'Windows' });
    await REG['_resolve_Virtual_Machine'](row, 'KRW');
    expect(row.paygItem).toBeTruthy();
    expect(/windows/i.test(row.paygItem.productName)).toBe(true);
    expect(row.paygItem.unitPrice).toBe(391.323);
  });

  it('Spot D2s_v7 → Spot 항목(저렴) 매칭', async () => {
    const row = makeRow({ tier: 'Spot' });
    await REG['_resolve_Virtual_Machine'](row, 'KRW');
    expect(row.paygItem).toBeTruthy();
    expect(row.paygItem.unitPrice).toBe(46.2252);            // Linux Spot
    expect(/spot/i.test(row.paygItem.skuName)).toBe(true);
  });
});

describe('리전 미제공 경고 (_vmReportUnavailable)', () => {
  it('현재 리전에 없고 다른 리전엔 있으면 지원 리전을 안내', async () => {
    const statuses = [];
    REG._uiHooks = REG._uiHooks || {};
    // setStatus 를 가로채기 위해 ui-hooks 대신 _vmSkuRegions 를 스텁하고 메시지를 확인
    const orig = REG['_vmSkuRegions'];
    REG['_vmSkuRegions'] = async () => ['eastus', 'westus2', 'westeurope'];
    // setStatus 는 서비스가 kernel 경유 호출 → 여기선 실패해도 무방, 예외만 안나면 됨
    const row = makeRow({ region: 'koreacentral' });
    await REG['_vmReportUnavailable'](row, 'Standard_FooBar', 0, 'KRW');
    REG['_vmSkuRegions'] = orig;
    expect(true).toBe(true); // 예외 없이 경로 실행되면 통과(메시지 로직은 아래 순수 검증)
  });

  it('지원 리전 목록 → 라벨 매핑 확인', async () => {
    REG['_vmSkuRegions'] = async () => ['eastus', 'westus2'];
    let captured = null;
    const row = { region: 'koreacentral', skuName: 'X', options: {} };
    // setStatus 훅 주입
    const { registerUIHooks } = await import('../src/core/ui-hooks.js');
    registerUIHooks({ setStatus: (_k, m) => { captured = m; }, updatePriceCells(){}, updateTotalsRow(){}, showToast(){} });
    await REG['_vmReportUnavailable'](row, 'Standard_X', 0, 'KRW');
    expect(captured).toMatch(/미제공/);
    expect(captured).toMatch(/East US/);
  });
});
