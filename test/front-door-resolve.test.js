// Front Door resolve 통합 테스트 — 글로벌 서비스(존 기반 가격). 커스텀 _resolve_Azure_Front_Door.
// 계층 × 요금 존 × 청구항목, 존별/존무관 미터 매칭. 녹화 픽스처 + apiFetch 목.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/front-door.json', import.meta.url)));

vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async (filters) =>
    (filters.serviceName === 'Azure Front Door Service' && filters.priceType === 'Consumption') ? fx.consumption : []),
  clearCacheForCurrency: vi.fn(),
  fetchWithCorsFallback: vi.fn(),
  apiCache: new Map(),
  activeProxyIndex: 0,
}));

globalThis.document = { getElementById: () => ({ value: 'KRW' }) };

import '../src/services/front-door.js';
import { buildSkuAndDetail, tryResolveItem } from '../src/core/resolver-engine.js';

async function resolve(options) {
  const row = {
    region: 'koreacentral', serviceCategory: 'Azure Front Door',
    skuName: '', detail: '', options,
    paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null,
  };
  buildSkuAndDetail(row);
  await tryResolveItem(row);
  return row;
}

describe('Azure Front Door resolve (_resolve_Azure_Front_Door)', () => {
  it('Standard / Zone 1 / Base Fees → 존별 미터 매칭', async () => {
    const r = await resolve({ tier: 'Standard', zone: 'Zone 1', item: 'Standard Base Fees' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.skuName).toBe('Standard');
    expect(r.paygItem.armRegionName).toBe('Zone 1');
    expect(r.paygItem.unitPrice).toBeGreaterThan(0);
  });

  it('존별 미터는 존에 따라 단가가 달라짐 (Zone 1 ≠ Zone 2 가능)', async () => {
    const z1 = await resolve({ tier: 'Standard', zone: 'Zone 1', item: 'Standard Data Transfer Out' });
    const z2 = await resolve({ tier: 'Standard', zone: 'Zone 2', item: 'Standard Data Transfer Out' });
    expect(z1.paygItem).toBeTruthy();
    expect(z2.paygItem).toBeTruthy();
    expect(z1.paygItem.armRegionName).toBe('Zone 1');
    expect(z2.paygItem.armRegionName).toBe('Zone 2');
  });

  it('존 무관 미터(Custom Domain, armRegionName="")는 존 선택과 무관하게 매칭', async () => {
    const r = await resolve({ tier: 'Standard', zone: 'Zone 5', item: 'Standard Custom Domain' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.armRegionName).toBe('');
  });

  it('Premium / Zone 2 / Requests → 매칭', async () => {
    const r = await resolve({ tier: 'Premium', zone: 'Zone 2', item: 'Premium Requests' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.skuName).toBe('Premium');
    expect(r.sp1Item).toBeNull(); // 절약/예약 미적용
  });

  it('계층에 없는 항목 → 첫 유효항목으로 자동 보정', async () => {
    const r = await resolve({ tier: 'Premium', zone: 'Zone 1', item: 'Standard Policy' });
    expect(r.options.item).toBe('Premium Base Fees');
    expect(r.paygItem).toBeTruthy();
  });
});
