// ================================================================
// platform-services-resolve.test.js — v127 신설 5종 resolve 통합 테스트
//   Microsoft Fabric · Azure Monitor · Azure Key Vault · GitHub · Azure Machine Learning
//
// 각 서비스는 전용 _resolve_* 를 갖고, 매칭 축이 서로 다르다.
//   Fabric      productName + '… Capacity Usage CU' 최빈 단가 × CU 수 (+ 예약 1·3년)
//   Monitor     skuName(청구 항목 묶음) + meterName   ※ productName 은 전부 'Azure Monitor'
//   Key Vault   productName + skuName(계층) + meterName
//   GitHub      productName + meterName (리전 비종속 — armRegionName 필터를 쓰지 않는다)
//   Azure ML    productName='Machine Learning service' + meterName
// 녹화 픽스처 + apiFetch 목이라 네트워크 없이 결정론적으로 돈다.
// ================================================================
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const fabFx = load('fabric-koreacentral.json');
const monFx = load('azure-monitor-koreacentral.json');
const kvFx  = load('key-vault-koreacentral.json');
const ghFx  = load('github-global.json');
const amlFx = load('azure-ml-koreacentral.json');

// 목이 받은 필터를 검사할 수 있도록 호출 기록을 남긴다
const calls = [];
vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async (filters) => {
    calls.push(filters);
    const svc = filters.serviceName;
    if (svc === 'Microsoft Fabric') {
      return filters.priceType === 'Reservation' ? fabFx.reservation : fabFx.consumption;
    }
    if (filters.priceType !== 'Consumption') return [];
    if (svc === 'Azure Monitor') {
      // 실제 API 와 같게, skuName 필터가 걸리면 그 값으로 좁혀 돌려준다
      return monFx.consumption.filter((it) => !filters.skuName || it.skuName === filters.skuName);
    }
    if (svc === 'Key Vault') {
      return kvFx.consumption.filter((it) => !filters.productName || it.productName === filters.productName);
    }
    if (svc === 'GitHub') {
      return ghFx.consumption.filter((it) => !filters.productName || it.productName === filters.productName);
    }
    if (svc === 'Azure Machine Learning') {
      return amlFx.consumption.filter((it) => !filters.productName || it.productName === filters.productName);
    }
    return [];
  }),
  clearCacheForCurrency: vi.fn(),
  fetchWithCorsFallback: vi.fn(),
  apiCache: new Map(),
  activeProxyIndex: 0,
}));

globalThis.document = { getElementById: () => ({ value: 'USD' }) };

import '../src/services/fabric.js';
import '../src/services/azure-monitor.js';
import '../src/services/key-vault.js';
import '../src/services/github.js';
import '../src/services/azure-ml.js';
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

describe('Microsoft Fabric resolve (_resolve_Microsoft_Fabric)', () => {
  it('F64 용량 → CU 단가 × 64, 예약 1·3년까지 채운다', async () => {
    const r = await resolve('Microsoft Fabric', { metric: '용량 (CU 시간)', capacity: 'F64' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem._fabricCu).toBe(64);
    expect(r.paygItem.unitPrice).toBeCloseTo(r.paygItem._fabricPerCu * 64, 8);
    expect(r.paygItem.unitOfMeasure).toBe('1 Hour');
    expect(r.ri1Item).toBeTruthy();
    expect(r.ri3Item).toBeTruthy();
    // 예약은 시간당 환산 후 ×CU — 용량제보다 싸야 의미가 있다
    expect(r.ri1Item.unitPrice).toBeLessThan(r.paygItem.unitPrice);
    expect(r.sp1Item).toBeNull();   // Fabric 은 절약 플랜 없음
  });

  it('F SKU 배수가 정확히 반영된다 (F2 × 32 = F64)', async () => {
    const f2 = await resolve('Microsoft Fabric', { metric: '용량 (CU 시간)', capacity: 'F2' });
    const f64 = await resolve('Microsoft Fabric', { metric: '용량 (CU 시간)', capacity: 'F64' });
    expect(f64.paygItem.unitPrice).toBeCloseTo(f2.paygItem.unitPrice * 32, 8);
  });

  it('기준 CU 단가는 초과분(Capacity Overage) 미터를 쓰지 않는다', async () => {
    const r = await resolve('Microsoft Fabric', { metric: '용량 (CU 시간)', capacity: 'F2' });
    expect(String(r.paygItem.meterName)).not.toMatch(/overage/i);
    const overage = fabFx.consumption.find((it) => /overage/i.test(it.meterName));
    expect(overage).toBeTruthy();                                  // 픽스처에 초과분 미터가 실제로 있고
    expect(r.paygItem._fabricPerCu).toBeLessThan(overage.unitPrice); // 그보다 싼 기준 단가를 골랐다
  });

  it('OneLake 저장소 Hot → GB/월 미터를 그대로 쓴다', async () => {
    const r = await resolve('Microsoft Fabric', { metric: 'OneLake 저장소 (GB/월)', storageItem: 'OneLake 저장소 Hot (GB/월)' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.meterName).toBe('OneLake Storage Hot Data Stored');
    expect(r.paygItem.unitOfMeasure).toContain('GB');
    expect(r.ri1Item).toBeNull();
  });

  it('대소문자가 섞인 미터도 맞춘다 (Onelake BCDR Storage Cool)', async () => {
    const r = await resolve('Microsoft Fabric', { metric: 'OneLake 저장소 (GB/월)', storageItem: 'OneLake BCDR Cool (GB/월)' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.unitPrice).toBeGreaterThan(0);
  });
});

describe('Azure Monitor resolve (_resolve_Azure_Monitor)', () => {
  it('메트릭 수집 → 10M 샘플 미터', async () => {
    const r = await resolve('Azure Monitor', { group: '메트릭', item: '메트릭 수집 (10M 샘플)' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.meterName).toBe('Metrics ingestion Metric samples');
    expect(r.paygItem.unitOfMeasure).toBe('10M');
    expect(r.paygItem.unitPrice).toBeGreaterThan(0);
  });

  it('경고는 주기별로 서로 다른 단가를 고른다', async () => {
    const m1 = await resolve('Azure Monitor', { group: '경고 (월)', item: '리소스 모니터링 - 1분 주기' });
    const m15 = await resolve('Azure Monitor', { group: '경고 (월)', item: '리소스 모니터링 - 15분 주기' });
    expect(m1.paygItem.unitPrice).toBeGreaterThan(m15.paygItem.unitPrice);
    expect(m1.paygItem.unitOfMeasure).toBe('1/Month');
  });

  it('약정 계층 100GB/일 → 1/Day 미터', async () => {
    const r = await resolve('Azure Monitor', { group: '약정 계층 (일)', item: '100 GB/일 약정' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.skuName).toBe('100 GB Commitment Tier');
    expect(r.paygItem.unitOfMeasure).toBe('1/Day');
  });

  it('productName 이 아니라 skuName 으로 좁혀 조회한다', async () => {
    calls.length = 0;
    await resolve('Azure Monitor', { group: '로그', item: '기본 로그 수집 (GB)' });
    const f = calls.find((c) => c.serviceName === 'Azure Monitor');
    expect(f.skuName).toBe('Basic Logs');
    expect(f.productName).toBeUndefined();
  });

  it('그룹을 바꾸면 청구 항목이 그 그룹 목록으로 교체된다', async () => {
    const r = await resolve('Azure Monitor', { group: '웹 테스트', item: '기본 로그 수집 (GB)' });
    expect(r.options.item).toBe('표준 웹 테스트 (실행 1회)');
    expect(r.paygItem.meterName).toBe('Standard Web Test Execution');
  });
});

describe('Azure Key Vault resolve (_resolve_Azure_Key_Vault)', () => {
  it('Standard / 작업(10K) → skuName=Standard 미터', async () => {
    const r = await resolve('Azure Key Vault', { tier: 'Standard', metric: '작업 (10K)' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.skuName).toBe('Standard');
    expect(r.paygItem.meterName).toBe('Operations');
    expect(r.paygItem.unitOfMeasure).toBe('10K');
  });

  it('Premium 전용 HSM 보호 키 항목이 매칭된다', async () => {
    const r = await resolve('Azure Key Vault', { tier: 'Premium', metric: 'HSM 보호 RSA 2048비트 키 (키/월)' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.skuName).toBe('Premium');
    expect(r.paygItem.meterName).toBe('Premium HSM-protected RSA 2048-bit key');
  });

  it('Standard 로 계층을 바꾸면 Premium 전용 항목은 첫 항목으로 대체된다', async () => {
    const r = await resolve('Azure Key Vault', { tier: 'Standard', metric: 'HSM 보호 고급 키 (키/월)' });
    expect(r.options.metric).toBe('작업 (10K)');
    expect(r.paygItem.skuName).toBe('Standard');
  });

  it('Managed HSM → HSM Pool 제품의 시간당 인스턴스 미터', async () => {
    const r = await resolve('Azure Key Vault', { tier: 'Managed HSM', metric: 'Standard B1 인스턴스 (시간)' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.productName).toBe('Key Vault HSM Pool');
    expect(r.paygItem.unitOfMeasure).toBe('1 Hour');
  });
});

describe('GitHub resolve (_resolve_GitHub)', () => {
  it('GitHub Enterprise 사용자 → 1/Month 미터', async () => {
    const r = await resolve('GitHub', { plan: 'GitHub Enterprise 사용자 (월)' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.productName).toBe('GitHub Enterprise (GHE)');
    expect(r.paygItem.meterName).toBe('Enterprise User');
    expect(r.paygItem.unitOfMeasure).toBe('1/Month');
  });

  it('같은 meterName 이 제품군별로 있어도 요금제가 가리키는 제품에서 고른다', async () => {
    const ghe = await resolve('GitHub', { plan: 'GitHub Enterprise 사용자 (월)' });
    const cop = await resolve('GitHub', { plan: 'Copilot Enterprise 사용자 (월)' });
    expect(cop.paygItem.productName).toBe('GitHub Copilot');
    expect(cop.paygItem.unitPrice).not.toBe(ghe.paygItem.unitPrice);
  });

  it('Actions 실행은 분 단위 미터', async () => {
    const r = await resolve('GitHub', { plan: 'Actions Linux 실행 (분)' });
    expect(r.paygItem.unitOfMeasure).toBe('1 Minute');
  });

  it('리전 비종속 — armRegionName 필터를 쓰지 않는다', async () => {
    calls.length = 0;
    await resolve('GitHub', { plan: 'Copilot Business 사용자 (월)' });
    const f = calls.find((c) => c.serviceName === 'GitHub');
    expect(f.armRegionName).toBeUndefined();
  });
});

describe('Azure Machine Learning resolve (_resolve_Azure_Machine_Learning)', () => {
  it('GPU 추가 요금 → 시간당 미터', async () => {
    const r = await resolve('Azure Machine Learning', { metric: 'GPU 추가 요금 (시간)' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.meterName).toBe('Standard GPU Surcharge');
    expect(r.paygItem.unitOfMeasure).toBe('1 Hour');
    expect(r.paygItem.unitPrice).toBeGreaterThan(0);
  });

  it('추가 요금이 0원인 미터도 매칭 실패가 아니라 0원으로 채운다', async () => {
    const r = await resolve('Azure Machine Learning', { metric: '학습 GPU 추가 요금 (시간)' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.unitPrice).toBe(0);
  });

  // v128 — 워크스페이스는 API 미터가 없다(정의상 무료). API 조회 없이 0원 항목으로 남긴다.
  it('워크스페이스는 조회하지 않고 0원 항목이 된다', async () => {
    const before = calls.length;
    const r = await resolve('Azure Machine Learning', { metric: '워크스페이스 (무료 · 과금 미터 없음)' });
    expect(calls.length).toBe(before);            // API 를 부르지 않는다
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.unitPrice).toBe(0);
    expect(r.paygItem._freeByDefinition).toBe(true);
    expect(r.skuName).toBe('Workspace');
  });
});
