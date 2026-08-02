// 신규 서비스(Event Hubs·Service Bus·Container Apps) resolve 통합 테스트.
// 각 서비스는 커스텀 _resolve_* (계층+청구항목 → meterName 정확 매칭). 녹화 픽스처 + apiFetch 목.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const ehFx = load('event-hubs-koreacentral.json');
const sbFx = load('service-bus-koreacentral.json');
const acaFx = load('container-apps-koreacentral.json');

// serviceName 별로 해당 픽스처를 돌려주는 apiFetch 목
vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async (filters) => {
    if (filters.priceType !== 'Consumption') return [];
    if (filters.serviceName === 'Event Hubs') return ehFx.consumption;
    if (filters.serviceName === 'Service Bus') return sbFx.consumption;
    if (filters.serviceName === 'Azure Container Apps') return acaFx.consumption;
    return [];
  }),
  clearCacheForCurrency: vi.fn(),
  fetchWithCorsFallback: vi.fn(),
  apiCache: new Map(),
  activeProxyIndex: 0,
}));

globalThis.document = { getElementById: () => ({ value: 'KRW' }) };

import '../src/services/event-hubs.js';
import '../src/services/service-bus.js';
import '../src/services/container-apps.js';
import { buildSkuAndDetail, tryResolveItem } from '../src/core/resolver-engine.js';

async function resolve(serviceCategory, options) {
  const row = {
    region: 'koreacentral', serviceCategory,
    skuName: '', detail: '', options,
    paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null,
  };
  buildSkuAndDetail(row);
  await tryResolveItem(row);
  return row;
}

describe('Event Hubs resolve (_resolve_Event_Hubs)', () => {
  it('Standard / Throughput Unit → PAYG 매칭', async () => {
    const r = await resolve('Event Hubs', { tier: 'Standard', item: 'Standard Throughput Unit' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.skuName).toBe('Standard');
    expect(r.paygItem.meterName).toBe('Standard Throughput Unit');
    expect(r.paygItem.unitPrice).toBeGreaterThan(0);
    expect(r.sp1Item).toBeNull(); // 절약/예약 미적용
  });
  it('Basic / Ingress Events → 1M 단위 매칭', async () => {
    const r = await resolve('Event Hubs', { tier: 'Basic', item: 'Basic Ingress Events' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.unitOfMeasure).toContain('1M');
  });
  it('계층에 없는 청구항목 → 첫 유효항목으로 자동 보정 후 매칭', async () => {
    // Basic 계층엔 'Premium Processing Unit' 없음 → _applyStepVisibility 가 Basic 첫 항목으로 교정
    const r = await resolve('Event Hubs', { tier: 'Basic', item: 'Premium Processing Unit' });
    expect(r.options.item).toBe('Basic Throughput Unit');
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.skuName).toBe('Basic');
  });
});

describe('Service Bus resolve (_resolve_Service_Bus)', () => {
  it('Premium / Messaging Unit → PAYG 매칭', async () => {
    const r = await resolve('Service Bus', { tier: 'Premium', item: 'Premium Messaging Unit' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.skuName).toBe('Premium');
    expect(r.paygItem.unitPrice).toBeGreaterThan(0);
  });
  it('Standard / Base Unit → 구간별 복수 단가 중 tierMinimumUnits=0 최저가', async () => {
    const r = await resolve('Service Bus', { tier: 'Standard', item: 'Standard Base Unit' });
    expect(r.paygItem).toBeTruthy();
    expect(Number(r.paygItem.tierMinimumUnits || 0)).toBe(0);
  });
});

describe('Container Apps resolve (_resolve_Container_Apps)', () => {
  it('Standard / vCPU Active Usage → PAYG 매칭(초 단위)', async () => {
    const r = await resolve('Container Apps', { plan: 'Standard', item: 'Standard vCPU Active Usage' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.skuName).toBe('Standard');
    expect(r.paygItem.meterName).toBe('Standard vCPU Active Usage');
  });
  it('Dedicated / Plan Management → 시간 단위 매칭', async () => {
    const r = await resolve('Container Apps', { plan: 'Dedicated', item: 'Dedicated Plan Management' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.unitOfMeasure).toContain('Hour');
  });
});
