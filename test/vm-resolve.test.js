// VM 조회 통합 테스트 — REG['_resolve_Virtual_Machine'] 을 녹화 픽스처로 구동.
// apiFetch(network.js)를 목으로 대체해 결정론적. UI 훅은 기본 no-op.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/vm-d4s_v5-koreacentral.json', import.meta.url)));

// network.js 를 목으로: priceType 에 따라 픽스처 분기
vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async (filters) => {
    if (filters.serviceName === 'Virtual Machines Licenses') return []; // OS-only → 라이선스 없음
    if (filters.priceType === 'Consumption') return fx.consumption;
    if (filters.priceType === 'Reservation') return fx.reservation;
    return [];
  }),
  clearCacheForCurrency: vi.fn(),
  fetchWithCorsFallback: vi.fn(),
  apiCache: new Map(),
  activeProxyIndex: 0,
}));

// 서비스 등록(부수효과) + 레지스트리
import { REG } from '../src/core/registry.js';
import '../src/services/vm.js';

function makeRow(opts = {}) {
  return {
    region: 'koreacentral', serviceCategory: 'Virtual Machine',
    skuName: 'D4s_v5',
    options: { os: 'Linux', swType: '(OS Only)', tier: 'Standard', license: '라이선스 포함',
      category: '전체', series: 'D-series v5', instance: 'D4s_v5', ...opts },
    paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null,
  };
}

describe('VM resolve (Linux D4s_v5)', () => {
  let row;
  beforeEach(async () => {
    row = makeRow();
    await REG['_resolve_Virtual_Machine'](row, 'KRW');
  });

  it('_resolve_Virtual_Machine 이 REG 에 등록됨', () => {
    expect(typeof REG['_resolve_Virtual_Machine']).toBe('function');
  });

  it('PAYG 매칭 — Linux 항목(Windows 아님) 선택', () => {
    expect(row.paygItem).toBeTruthy();
    expect(row.paygItem.unitPrice).toBeGreaterThan(0);
    expect(/windows/i.test(row.paygItem.productName || '')).toBe(false);
  });

  it('절약 플랜 1년/3년 추출됨', () => {
    expect(row.sp1Item).toBeTruthy();
    expect(row.sp3Item).toBeTruthy();
    expect(row.sp3Item.unitPrice).toBeLessThan(row.paygItem.unitPrice); // 3년이 더 저렴
  });

  it('예약 1년/3년 시간당 환산됨(용량제보다 저렴)', () => {
    expect(row.ri1Item).toBeTruthy();
    expect(row.ri3Item).toBeTruthy();
    expect(row.ri1Item.unitPrice).toBeLessThan(row.paygItem.unitPrice);
    expect(row.ri3Item.unitPrice).toBeLessThan(row.ri1Item.unitPrice);
    expect(row.ri1Item.unitOfMeasure).toContain('normalized');
  });

  it('Windows 선택 시 Linux 보다 비쌈(OS 분기 검증)', async () => {
    const win = makeRow({ os: 'Windows' });
    await REG['_resolve_Virtual_Machine'](win, 'KRW');
    expect(win.paygItem).toBeTruthy();
    expect(/windows/i.test(win.paygItem.productName || '')).toBe(true);
    expect(win.paygItem.unitPrice).toBeGreaterThan(row.paygItem.unitPrice);
  });
});
