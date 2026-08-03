// RHEL/SUSE 가격 = base(Linux 컴퓨팅) + vCPU 밴드 라이선스(Virtual Machines Licenses) 회귀 테스트.
// 배경: Retail 피드에 RHEL/SUSE 전용 컴퓨팅 미터가 없어 기존엔 "매칭 없음" 이었음.
//       → osP 를 Linux 요금으로 폴백하고 라이선스를 vCPU 밴드로 가산하도록 수정.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/vm-d2s_v7-koreacentral.json', import.meta.url)));

// D2s_v7 = 2 vCPU. 라이선스 밴드 픽스처(리전 비종속).
const RHEL_LIC = [
  { type:'Consumption', unitOfMeasure:'1 Hour', armRegionName:'', productName:'Red Hat Enterprise Linux', skuName:'2 vCPU VM', meterName:'2 vCPU VM License', unitPrice:44.1965 },
  { type:'Consumption', unitOfMeasure:'1 Hour', armRegionName:'', productName:'Red Hat Enterprise Linux', skuName:'8 vCPU VM', meterName:'8 vCPU VM License', unitPrice:176.78 },
];
const SUSE_LIC = [
  { type:'Consumption', unitOfMeasure:'1 Hour', armRegionName:'', productName:'SUSE Linux Enterprise Server Standard', skuName:'1-2 vCPU VM', meterName:'1-2 vCPU VM Support', unitPrice:99.749 },
  { type:'Consumption', unitOfMeasure:'1 Hour', armRegionName:'', productName:'SUSE Linux Enterprise Server Standard', skuName:'5+ vCPU VM', meterName:'5+ vCPU VM Support', unitPrice:491.072 },
];

vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async (filters) => {
    if (filters.serviceName === 'Virtual Machines Licenses') {
      if (filters.productName === 'Red Hat Enterprise Linux') return RHEL_LIC;
      if (filters.productName === 'SUSE Linux Enterprise Server Standard') return SUSE_LIC;
      return [...RHEL_LIC, ...SUSE_LIC]; // 2차 폴백(productName 없이 전체)
    }
    if (filters.priceType === 'Consumption') return fx.consumption;
    if (filters.priceType === 'Reservation') return fx.reservation;
    return [];
  }),
  clearCacheForCurrency: vi.fn(), fetchWithCorsFallback: vi.fn(), apiCache: new Map(), activeProxyIndex: 0,
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

const LINUX_BASE = 250.1398; // D2s_v7 Linux 컴퓨팅

describe('RHEL/SUSE = base Linux + vCPU 밴드 라이선스', () => {
  it('RHEL D2s_v7(2vCPU) = Linux base + RHEL 2vCPU 라이선스', async () => {
    const row = makeRow({ os: 'Red Hat Enterprise Linux' });
    await REG['_resolve_Virtual_Machine'](row, 'KRW');
    expect(row.paygItem).toBeTruthy();
    expect(row.paygItem._computeHourly).toBeCloseTo(LINUX_BASE, 3);
    expect(row.paygItem._osLicHourly).toBeCloseTo(44.1965, 3);
    expect(row.paygItem.unitPrice).toBeCloseTo(LINUX_BASE + 44.1965, 3);
  });

  it('SUSE D2s_v7(2vCPU) = Linux base + SUSE 1-2vCPU 라이선스', async () => {
    const row = makeRow({ os: 'SUSE' });
    await REG['_resolve_Virtual_Machine'](row, 'KRW');
    expect(row.paygItem).toBeTruthy();
    expect(row.paygItem._osLicHourly).toBeCloseTo(99.749, 3);
    expect(row.paygItem.unitPrice).toBeCloseTo(LINUX_BASE + 99.749, 3);
  });

  it('RHEL + AHB(BYOS) → 라이선스 미가산(=Linux base)', async () => {
    const row = makeRow({ os: 'Red Hat Enterprise Linux', license: 'Azure Hybrid Benefit' });
    await REG['_resolve_Virtual_Machine'](row, 'KRW');
    expect(row.paygItem).toBeTruthy();
    expect(row.paygItem.unitPrice).toBeCloseTo(LINUX_BASE, 3);
  });
});
