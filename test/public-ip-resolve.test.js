// resolve 통합 테스트 — tryResolveItem(REG 디스패치) → Public IP 조회.
// (Public IP 는 커스텀 _resolve_Public_IP 사용, 'Static' 구분은 meterName 에 있음). 픽스처 + apiFetch 목.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/public-ip-koreacentral.json', import.meta.url)));

vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async (filters) => (filters.priceType === 'Consumption' ? fx.consumption : [])),
  clearCacheForCurrency: vi.fn(),
  fetchWithCorsFallback: vi.fn(),
  apiCache: new Map(),
  activeProxyIndex: 0,
}));

// 통화 조회용 document 스텁 (jsdom 불필요)
globalThis.document = { getElementById: () => ({ value: 'KRW' }) };

import '../src/services/public-ip.js';
import { buildSkuAndDetail, tryResolveItem } from '../src/core/resolver-engine.js';

describe('Public IP resolve (custom _resolve_Public_IP)', () => {
  let row;
  beforeAll(async () => {
    row = {
      region: 'koreacentral', serviceCategory: 'Public IP',
      skuName: '', detail: '',
      options: { sku: 'Standard', ipType: 'Static' },
      paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null,
    };
    buildSkuAndDetail(row);          // 제네릭 빌더가 skuName 채움
    await tryResolveItem(row);       // → _genericResolve
  });

  it('제네릭 빌더가 skuName 을 채움', () => {
    expect(row.skuName).toBeTruthy();
  });

  it('Standard/Static 항목 매칭(PAYG) — sku=Standard, meter 에 Static', () => {
    expect(row.paygItem).toBeTruthy();
    expect(row.paygItem.unitPrice).toBeGreaterThan(0);
    expect(row.paygItem.skuName || '').toContain('Standard');
    expect(row.paygItem.meterName || '').toContain('Static');
    // 픽스처 상 Standard IPv4 Static = 7.673 (Basic 5.52·Global 15.35 아님)
    expect(row.paygItem.unitPrice).toBeCloseTo(7.673, 3);
  });
});
