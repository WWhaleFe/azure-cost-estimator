// 범용 D 계열 변형 시리즈(v131) — 저메모리(Dls·Dlds·Dals·Dalds) + Dds v5·Dads v5.
// 배경: D 계열은 4GB/vCPU 표준형만 있어 D4ls v5(4 vCPU, 8GB) 같은 저사양 VM 을 고를 수 없었다.
//       SKU 목록은 koreacentral Retail Prices API 에서 'Standard_<name>' 으로 가격이 확인된 것만 담았다.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async () => []),
  clearCacheForCurrency: vi.fn(),
  fetchWithCorsFallback: vi.fn(),
  apiCache: new Map(),
  activeProxyIndex: 0,
}));

import { REG } from '../src/core/registry.js';
import '../src/services/vm.js';

const CATALOG = () => REG.VM_INSTANCE_CATALOG;

// [시리즈, SKU 접미사, 사이즈, vCPU당 RAM(GB)]
const SERIES = [
  ['Dd-series v5', 'ds_v5', [2, 4, 8, 16, 32, 48, 64, 96], 4],
  ['Dad-series v5 (AMD)', 'ads_v5', [2, 4, 8, 16, 32, 48, 64, 96], 4],
  ['Dls-series v5', 'ls_v5', [2, 4, 8, 16, 32, 48, 64, 96], 2],
  ['Dlds-series v5', 'lds_v5', [2, 4, 8, 16, 32, 48, 64, 96], 2],
  ['Dls-series v6', 'ls_v6', [2, 4, 8, 16, 32, 48, 64, 96, 128], 2],
  ['Dlds-series v6', 'lds_v6', [2, 4, 8, 16, 32, 48, 64, 96, 128], 2],
  ['Dals-series v6 (AMD)', 'als_v6', [2, 4, 8, 16, 32, 48, 64, 96], 2],
  ['Dalds-series v6 (AMD)', 'alds_v6', [2, 4, 8, 16, 32, 48, 64, 96], 2],
  ['Dls-series v7', 'ls_v7', [2, 4, 8, 16, 32, 48, 64, 96, 128, 192], 2],
  ['Dlds-series v7', 'lds_v7', [2, 4, 8, 16, 32, 48, 64, 96, 128, 192], 2],
  ['Dals-series v7 (AMD)', 'als_v7', [2, 4, 8, 16, 32, 48, 64, 96, 128, 160], 2],
  ['Dalds-series v7 (AMD)', 'alds_v7', [2, 4, 8, 16, 32, 48, 64, 96, 128, 160], 2],
];

describe('D 계열 변형 시리즈', () => {
  it('일반적인 용도 범주에서 모두 고를 수 있다', () => {
    const r = { options: { category: '일반적인 용도', tier: 'Standard' } };
    REG['_vm_applyStepVisibility'](r);
    const opts = REG._svcDefs['Virtual Machine'].steps.find((s) => s.key === 'series').options;
    for (const [name] of SERIES) expect(opts).toContain(name);
  });

  it.each(SERIES)('%s: 사이즈 목록과 vCPU·RAM 이 시리즈 사양과 같다', (name, suf, sizes, gbPerCpu) => {
    const list = CATALOG()[name];
    expect(list.map((i) => i.name)).toEqual(sizes.map((n) => `D${n}${suf}`));
    for (const i of list) expect(i.ram).toBe(i.vCPU * gbPerCpu);
  });

  it('저사양 예: D4ls_v5 는 4 vCPU · 8GB 로 표기된다', () => {
    const r = { region: 'koreacentral', serviceCategory: 'Virtual Machine', skuName: '', detail: '',
      options: { os: 'Linux', category: '일반적인 용도', series: 'Dls-series v5', instance: 'D4ls_v5' } };
    REG['_buildDetail_Virtual_Machine'](r);
    expect(r.detail).toContain('CPU:4core RAM:8GB');
  });

  it('CSV 처럼 인스턴스만 주면 시리즈를 역추적한다', () => {
    expect(REG['_vm_seriesOfInstance']('D8alds_v7')).toBe('Dalds-series v7 (AMD)');
    expect(REG['_vm_seriesOfInstance']('D16ads_v5')).toBe('Dad-series v5 (AMD)');
  });
});
