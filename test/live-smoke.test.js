// 라이브 스모크 — 실제 prices.azure.com 호출. 기본 skip.
// 실행: RUN_LIVE=1 npm test   (네트워크 필요, API 계약 변화 감지용)
import { describe, it, expect } from 'vitest';

const LIVE = process.env.RUN_LIVE === '1';
const BASE = 'https://prices.azure.com/api/retail/prices';
const VER = '2023-01-01-preview';

async function q(filter, top = 5) {
  const p = new URLSearchParams({ 'api-version': VER, currencyCode: 'KRW', $filter: filter, $top: String(top) });
  const r = await fetch(`${BASE}?${p}`);
  expect(r.ok).toBe(true);
  return (await r.json());
}

describe.skipIf(!LIVE)('라이브 스모크 (RUN_LIVE=1)', () => {
  it('OData 응답 형태(Items 배열)', async () => {
    const j = await q("serviceName eq 'Virtual Machines' and armRegionName eq 'koreacentral'", 1);
    expect(Array.isArray(j.Items)).toBe(true);
  });

  it('VM D4s_v5 koreacentral Consumption 존재', async () => {
    const j = await q("armSkuName eq 'Standard_D4s_v5' and armRegionName eq 'koreacentral' and priceType eq 'Consumption'");
    expect(j.Items.length).toBeGreaterThan(0);
    expect(j.Items.every(i => typeof i.unitPrice === 'number')).toBe(true);
  });

  it('Public IP IP Addresses koreacentral 존재', async () => {
    const j = await q("serviceName eq 'Virtual Network' and armRegionName eq 'koreacentral' and productName eq 'IP Addresses' and priceType eq 'Consumption'");
    expect(j.Items.length).toBeGreaterThan(0);
  });

  // v127 신설 5종 — resolver 가 기대하는 매칭 축(skuName/productName)이 살아 있는지
  it('Microsoft Fabric 용량 CU 미터 + 예약 존재 (koreacentral)', async () => {
    const c = await q("serviceName eq 'Microsoft Fabric' and armRegionName eq 'koreacentral' and productName eq 'Fabric Capacity' and priceType eq 'Consumption'", 100);
    expect(c.Items.some(i => /capacity usage cu$/i.test(i.meterName || ''))).toBe(true);
    const r = await q("serviceName eq 'Microsoft Fabric' and armRegionName eq 'koreacentral' and productName eq 'Fabric Capacity Reservation'");
    expect(r.Items.length).toBeGreaterThan(0);
  });

  it('Azure Monitor 는 skuName 이 청구 항목 묶음이다 (productName 아님)', async () => {
    const j = await q("serviceName eq 'Azure Monitor' and armRegionName eq 'koreacentral' and skuName eq 'Alerts' and priceType eq 'Consumption'", 20);
    expect(j.Items.length).toBeGreaterThan(0);
    expect(j.Items.every(i => i.productName === 'Azure Monitor')).toBe(true);
  });

  it('Key Vault Premium 계층 미터 존재 (koreacentral)', async () => {
    const j = await q("serviceName eq 'Key Vault' and armRegionName eq 'koreacentral' and productName eq 'Key Vault' and skuName eq 'Premium' and priceType eq 'Consumption'", 20);
    expect(j.Items.some(i => (i.meterName || '') === 'Operations')).toBe(true);
  });

  it('GitHub Enterprise 사용자 미터 존재 (리전 비종속)', async () => {
    const j = await q("serviceName eq 'GitHub' and productName eq 'GitHub Enterprise (GHE)' and priceType eq 'Consumption'", 20);
    expect(j.Items.some(i => (i.meterName || '') === 'Enterprise User')).toBe(true);
  });

  it('Azure ML 추가 요금(Surcharge) 미터 존재 (koreacentral)', async () => {
    const j = await q("serviceName eq 'Azure Machine Learning' and armRegionName eq 'koreacentral' and productName eq 'Machine Learning service' and priceType eq 'Consumption'", 20);
    expect(j.Items.some(i => /surcharge$/i.test(i.meterName || ''))).toBe(true);
  });
});

// LIVE 아닐 때 vitest 가 "no tests" 로 실패하지 않도록 placeholder
describe.skipIf(LIVE)('라이브 스모크 비활성', () => {
  it('RUN_LIVE=1 로 활성화', () => { expect(LIVE).toBe(false); });
});
