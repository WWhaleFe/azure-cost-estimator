// ================================================================
// postgresql-resolve.test.js — v133 Azure Database for PostgreSQL (Flexible Server)
//
// 한 행 = 한 청구 항목(컴퓨팅 / 저장소·IOPS / 백업 저장소).
//   컴퓨팅   Burstable=skuName 대소문자 무시 일치, GP·MO=per-vCore × vCore 수 (+ 절약 1년 · 예약 1·3년)
//   저장소   productName='… Flex Server Storage' + meterName
//   백업     productName='… Flexible Server Backup Storage' — HA 배수 미적용
//   HA       컴퓨팅·저장소 단가 ×2 (Burstable 은 HA 미지원 → 숨김·×1)
// 녹화 픽스처(USD, koreacentral) + apiFetch 목이라 네트워크 없이 결정론적으로 돈다.
// ================================================================
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/postgresql-koreacentral.json', import.meta.url)));

const calls = [];
vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async (filters) => {
    calls.push(filters);
    if (filters.serviceName !== 'Azure Database for PostgreSQL') return [];
    const src = filters.priceType === 'Reservation' ? fx.reservation : fx.consumption;
    return src.filter((it) => !filters.productName || it.productName === filters.productName);
  }),
  clearCacheForCurrency: vi.fn(),
  fetchWithCorsFallback: vi.fn(),
  apiCache: new Map(),
  activeProxyIndex: 0,
}));

globalThis.document = { getElementById: () => ({ value: 'USD' }) };

import '../src/services/postgresql.js';
import { REG } from '../src/core/registry.js';
import { buildSkuAndDetail, tryResolveItem } from '../src/core/resolver-engine.js';

async function resolve(options) {
  const row = {
    region: 'koreacentral', serviceCategory: 'Azure Database for PostgreSQL',
    skuName: '', detail: '', options: { ...options },
    paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null,
  };
  buildSkuAndDetail(row);
  await tryResolveItem(row);
  return row;
}
const COMPUTE = '컴퓨팅 (시간)';

describe('PostgreSQL 컴퓨팅', () => {
  it('GP Ddsv5 2 vCore → per-vCore × 2, 절약 1년 · 예약 1·3년', async () => {
    const r = await resolve({ metric: COMPUTE, tier: 'General Purpose', series: 'Ddsv5', vCores: '2', ha: '미적용' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem._pgPerVcore).toBeCloseTo(0.123, 6);
    expect(r.paygItem.unitPrice).toBeCloseTo(0.246, 6);
    expect(r.paygItem.unitOfMeasure).toBe('1 Hour');
    expect(r.sp1Item.unitPrice).toBeCloseTo(0.0984 * 2, 6);
    expect(r.ri1Item).toBeTruthy();
    expect(r.ri3Item).toBeTruthy();
    expect(r.ri3Item.unitPrice).toBeLessThan(r.ri1Item.unitPrice);
    expect(r.ri1Item.unitPrice).toBeLessThan(r.paygItem.unitPrice);
    expect(r.detail).toBe('PostgreSQL - General Purpose - Ddsv5 - 2 vCore');
  });

  it('HA 를 켜면 용량제·절약·예약이 모두 2배', async () => {
    const base = await resolve({ metric: COMPUTE, tier: 'Memory Optimized', series: 'Edsv5', vCores: '4', ha: '미적용' });
    const ha = await resolve({ metric: COMPUTE, tier: 'Memory Optimized', series: 'Edsv5', vCores: '4', ha: '영역 중복 HA' });
    expect(ha.paygItem.unitPrice).toBeCloseTo(base.paygItem.unitPrice * 2, 8);
    expect(ha.sp1Item.unitPrice).toBeCloseTo(base.sp1Item.unitPrice * 2, 8);
    expect(ha.ri1Item.unitPrice).toBeCloseTo(base.ri1Item.unitPrice * 2, 8);
    expect(ha.detail).toContain('영역 중복 HA');
  });

  it('Burstable 은 skuName 대소문자 무시 일치(B2MS → B2ms), HA 미적용·예약 없음', async () => {
    const r = await resolve({ metric: COMPUTE, tier: 'Burstable', instance: 'B2MS', ha: '영역 중복 HA' });
    expect(r.options.instance).toBe('B2ms');
    expect(r.paygItem.unitPrice).toBeCloseTo(0.208, 6);
    expect(r.paygItem._pgHaMult).toBe(1);
    expect(r.ri1Item).toBeNull();
    expect(r.sp1Item.unitPrice).toBeCloseTo(0.1664, 6);
  });

  it("per-vCore 행 skuName 이 '1 vCore' 뿐인 세대(Dadsv6)도 매칭, 예약은 빈칸", async () => {
    const r = await resolve({ metric: COMPUTE, tier: 'General Purpose', series: 'Dadsv6 (AMD)', vCores: '8', ha: '미적용' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.unitPrice).toBeCloseTo(r.paygItem._pgPerVcore * 8, 8);
    expect(r.ri1Item).toBeNull();
    expect(r.ri3Item).toBeNull();
  });

  it('없는 세대 조합이면 매칭 실패(가격 비움)', async () => {
    const r = await resolve({ metric: COMPUTE, tier: 'General Purpose', series: 'Dsv3', vCores: '2', ha: '미적용' });
    expect(r.paygItem).toBeNull();   // 픽스처에 Dsv3 제품이 없다
  });
});

describe('PostgreSQL 저장소 · 백업', () => {
  it('Premium SSD 저장소 → GB/월 단가, HA 면 2배', async () => {
    const r = await resolve({ metric: '저장소 - Premium SSD (GB/월)', ha: '미적용' });
    expect(r.paygItem.unitPrice).toBeCloseTo(0.131, 6);
    expect(r.paygItem.unitOfMeasure).toBe('1 GB/Month');
    expect(r.ri1Item).toBeNull();
    const ha = await resolve({ metric: '저장소 - Premium SSD (GB/월)', ha: '동일 영역 HA' });
    expect(ha.paygItem.unitPrice).toBeCloseTo(0.262, 6);
  });

  it('Premium SSD v2 IOPS·처리량 미터를 구분한다', async () => {
    const iops = await resolve({ metric: 'Premium SSD v2 IOPS (IOPS/월)', ha: '미적용' });
    const mbps = await resolve({ metric: 'Premium SSD v2 처리량 (MBps/월)', ha: '미적용' });
    expect(iops.paygItem.meterName).toBe('Premium SSD v2 IOPS Provisioned IOPS');
    expect(mbps.paygItem.meterName).toBe('Premium SSDv2 Throughput Prov Throughput (MBps)');
  });

  it('백업 저장소는 HA 값이 남아 있어도 배수를 적용하지 않는다', async () => {
    const r = await resolve({ metric: '백업 저장소 (GB/월, 무료분 초과)', ha: '영역 중복 HA' });
    expect(r.paygItem.unitPrice).toBeCloseTo(0.095, 6);
    expect(r.paygItem._pgHaMult).toBe(1);
  });
});

describe('PostgreSQL 옵션 전환', () => {
  const def = REG._svcDefs['Azure Database for PostgreSQL'];
  const visible = (options) => {
    const row = { options: { ...options } };
    def._applyStepVisibility(row);
    return { keys: def.steps.filter((s) => !s._hidden).map((s) => s.key), options: row.options };
  };

  it('청구 항목·계층에 따라 필드가 바뀐다', () => {
    expect(visible({ metric: COMPUTE, tier: 'Burstable' }).keys).toEqual(['metric', 'tier', 'instance']);
    expect(visible({ metric: COMPUTE, tier: 'General Purpose' }).keys).toEqual(['metric', 'tier', 'series', 'vCores', 'ha']);
    expect(visible({ metric: '저장소 - Premium SSD (GB/월)' }).keys).toEqual(['metric', 'ha']);
    expect(visible({ metric: '백업 저장소 (GB/월, 무료분 초과)' }).keys).toEqual(['metric']);
  });

  it('계층에 맞지 않는 세대·vCore 는 그 계층 첫 값으로 맞춘다', () => {
    const { options } = visible({ metric: COMPUTE, tier: 'Memory Optimized', series: 'Ddsv5', vCores: 1 });
    expect(options.series).toBe('Edsv5');
    expect(options.vCores).toBe('2');
  });

  it('알 수 없는 청구 항목은 컴퓨팅으로 간주', () => {
    expect(visible({ metric: '없는 항목' }).options.metric).toBe(COMPUTE);
  });
});
