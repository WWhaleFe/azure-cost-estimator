// ================================================================
// free-allowance.test.js — 무료 허용량 차감 (v128)
//
// Retail Prices API 는 Azure DevOps 처럼 조직 무료 한도를 단가에 반영하지 않는
// 미터가 있다(Basic 사용자 단일 단가). 그대로 곱하면 실제 청구액보다 많이 나온다.
// resolver 가 paygItem._freeUnits 를 실어 보내고 화면 계산이 그만큼 빼는지 확인한다.
// ================================================================
import { describe, it, expect, vi } from 'vitest';

// 실 API 응답 모양의 최소 픽스처(리전 비종속 — armRegionName='Global')
const DEVOPS = [
  { skuName:'Basic Plan', meterName:'Basic User', productName:'Azure Repos and Boards (Basic)',
    unitOfMeasure:'1/Month', unitPrice:8684.1, retailPrice:8684.1, armRegionName:'Global', type:'Consumption' },
  { skuName:'MS-hosted CI/CD', meterName:'Microsoft-hosted CI/CD Concurrent Job', productName:'Azure Pipelines',
    unitOfMeasure:'1/Month', unitPrice:57894, retailPrice:57894, armRegionName:'Global', type:'Consumption' },
  { skuName:'Advanced', meterName:'Advanced User', productName:'Azure Repos and Boards',
    unitOfMeasure:'1/Month', unitPrice:86841, retailPrice:86841, armRegionName:'Global', type:'Consumption' },
  { skuName:'Standard', meterName:'Standard Data Stored', productName:'Azure Artifacts',
    unitOfMeasure:'1 GB/Month', unitPrice:2894.7, retailPrice:2894.7, armRegionName:'Global', type:'Consumption' },
];

vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async (filters) => DEVOPS.filter((it) => !filters.productName || it.productName === filters.productName)),
  clearCacheForCurrency: vi.fn(), fetchWithCorsFallback: vi.fn(), apiCache: new Map(),
}));
vi.mock('../src/core/ui-hooks.js', () => ({
  setStatus: vi.fn(), updatePriceCells: vi.fn(), updateTotalsRow: vi.fn(), showToast: vi.fn(),
}));

globalThis.document = { getElementById: () => ({ value: 'KRW' }) };

import '../src/services/azure-devops.js';
const { buildSkuAndDetail, tryResolveItem } = await import('../src/core/resolver-engine.js');

// ui-and-bootstrap.js 의 calcGroup 과 같은 식(그쪽은 DOM 이 있어야 import 된다)
function monthly(item, qty, usage) {
  let units = qty * usage;
  if (typeof item._freeUnits === 'number') units = Math.max(0, units - item._freeUnits);
  return Number(item.unitPrice) * units;
}

async function resolve(options, qty = 1, usage = 1) {
  const row = { region:'koreacentral', serviceCategory:'Azure DevOps', qty, usage, options,
                skuName:'', detail:'', paygItem:null, sp1Item:null, sp3Item:null, ri1Item:null, ri3Item:null };
  buildSkuAndDetail(row);
  await tryResolveItem(row);
  return row;
}

describe('Azure DevOps 무료 허용량', () => {
  it('Basic 사용자 10명 → 첫 5명이 빠져 5명분만 과금된다', async () => {
    const r = await resolve({ plan: 'Basic Plan 사용자 (월)' }, 10, 1);
    expect(r.paygItem.unitPrice).toBe(8684.1);       // 단가 자체는 API 값 그대로 둔다
    expect(r.paygItem._freeUnits).toBe(5);
    expect(monthly(r.paygItem, 10, 1)).toBeCloseTo(8684.1 * 5, 6);
  });

  it('무료 한도 이하면 0원이 된다', async () => {
    const r = await resolve({ plan: 'Basic Plan 사용자 (월)' }, 3, 1);
    expect(monthly(r.paygItem, 3, 1)).toBe(0);
  });

  it('미차감을 고르면 전량 과금한다(무료 한도를 다른 프로젝트가 이미 쓴 경우)', async () => {
    const r = await resolve({ plan: 'Basic Plan 사용자 (월)', freeTier: '미차감 (전량 과금)' }, 10, 1);
    expect(r.paygItem._freeUnits).toBe(0);
    expect(monthly(r.paygItem, 10, 1)).toBeCloseTo(8684.1 * 10, 6);
  });

  it('MS-hosted 병렬 작업은 첫 1개가 무료다', async () => {
    const r = await resolve({ plan: 'MS-hosted 병렬 작업 (월)' }, 3, 1);
    expect(r.paygItem._freeUnits).toBe(1);
    expect(monthly(r.paygItem, 3, 1)).toBeCloseTo(57894 * 2, 6);
  });

  it('무료 한도가 없는 요금제는 그대로 전량 과금한다', async () => {
    const r = await resolve({ plan: 'Advanced 사용자 (월)' }, 4, 1);
    expect(r.paygItem._freeUnits).toBe(0);
    expect(monthly(r.paygItem, 4, 1)).toBeCloseTo(86841 * 4, 6);
  });

  it('무료 차감 여부가 상세 사양에 드러난다', async () => {
    const on = await resolve({ plan: 'Basic Plan 사용자 (월)' }, 10, 1);
    const off = await resolve({ plan: 'Basic Plan 사용자 (월)', freeTier: '미차감 (전량 과금)' }, 10, 1);
    expect(on.detail).toContain('첫 5명 무료');
    expect(off.detail).not.toContain('첫 5명 무료');
  });

  it('Qty 가 아니라 Hours 칸에 수량을 넣어도 같게 차감된다(Qty×Hours 곱에서 뺀다)', async () => {
    const r = await resolve({ plan: 'Artifacts 저장소 (GB/월)' }, 1, 10);
    expect(r.paygItem._freeUnits).toBe(2);
    expect(monthly(r.paygItem, 1, 10)).toBe(monthly(r.paygItem, 10, 1));
  });
});
