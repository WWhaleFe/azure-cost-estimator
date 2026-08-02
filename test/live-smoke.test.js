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
});

// LIVE 아닐 때 vitest 가 "no tests" 로 실패하지 않도록 placeholder
describe.skipIf(LIVE)('라이브 스모크 비활성', () => {
  it('RUN_LIVE=1 로 활성화', () => { expect(LIVE).toBe(false); });
});
