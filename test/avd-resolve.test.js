// ================================================================
// avd-resolve.test.js — v134 Azure Virtual Desktop
//
//   (1) Azure Virtual Desktop 카테고리 — 사용자당 접속 요금 3종 + Azure Local vCPU 요금
//       serviceName='Windows Virtual Desktop', skuName 정확 일치. 같은 sku 에 meterName 이 2개
//       ('… User' / '… Users', 단가 동일)라 하나만 결정론적으로 고르는지 확인
//   (2) Virtual Machine os='Windows 10/11 (AVD)' — 세션 호스트는 Linux 요율(라이선스 가산 없음)
// 녹화 픽스처 + apiFetch 목이라 네트워크 없이 결정론적으로 돈다.
// ================================================================
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const avdFx = load('avd-koreacentral.json');
const vmFx = load('vm-d4s_v5-koreacentral.json');

vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async (filters) => {
    if (filters.serviceName === 'Windows Virtual Desktop') {
      return filters.priceType === 'Consumption' ? avdFx.consumption : [];
    }
    if (filters.serviceName === 'Virtual Machines Licenses') return [];
    if (filters.serviceName === 'Virtual Machines') {
      return filters.priceType === 'Reservation' ? vmFx.reservation : vmFx.consumption;
    }
    return [];
  }),
  clearCacheForCurrency: vi.fn(),
  fetchWithCorsFallback: vi.fn(),
  apiCache: new Map(),
  activeProxyIndex: 0,
}));

globalThis.document = { getElementById: () => ({ value: 'USD' }) };

import '../src/services/vm.js';
import '../src/services/avd.js';
import { REG } from '../src/core/registry.js';
import { buildSkuAndDetail, tryResolveItem } from '../src/core/resolver-engine.js';
import { VM_OS_AVD } from '../src/services/vm.js';

async function resolveAvd(options) {
  const row = {
    region: 'koreacentral', serviceCategory: 'Azure Virtual Desktop',
    skuName: '', detail: '', options: { ...options },
    paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null,
  };
  buildSkuAndDetail(row);
  await tryResolveItem(row);
  return row;
}

describe('Azure Virtual Desktop — 사용자당 접속 요금', () => {
  it('데스크톱+앱 → Desktop & App Hosting 10 USD/월', async () => {
    const r = await resolveAvd({ metric: '사용자 접속 - 데스크톱+앱 (사용자/월)' });
    expect(r.paygItem).toBeTruthy();
    expect(r.paygItem.skuName).toBe('Desktop & App Hosting');
    expect(r.paygItem.unitPrice).toBe(10);
    expect(r.paygItem.unitOfMeasure).toBe('1/Month');
    expect(r.sp1Item).toBeNull();
    expect(r.ri1Item).toBeNull();
  });

  it('앱 전용 → App Hosting 5.5 USD/월', async () => {
    const r = await resolveAvd({ metric: '사용자 접속 - 앱 전용 (사용자/월)' });
    expect(r.paygItem.skuName).toBe('App Hosting');
    expect(r.paygItem.unitPrice).toBe(5.5);
  });

  it('앱→데스크톱 업그레이드 → 4.5 USD/월', async () => {
    const r = await resolveAvd({ metric: '사용자 접속 - 앱→데스크톱 업그레이드 (사용자/월)' });
    expect(r.paygItem.skuName).toBe('App to Desktop Upgrade');
    expect(r.paygItem.unitPrice).toBe(4.5);
  });

  it('같은 sku 의 중복 미터 2개 중 하나를 결정론적으로 고른다', async () => {
    const dup = avdFx.consumption.filter((it) => it.skuName === 'Desktop & App Hosting');
    expect(dup.length).toBe(2);
    const a = await resolveAvd({ metric: '사용자 접속 - 데스크톱+앱 (사용자/월)' });
    const b = await resolveAvd({ metric: '사용자 접속 - 데스크톱+앱 (사용자/월)' });
    expect(a.paygItem.meterName).toBe(b.paygItem.meterName);
  });

  it('Azure Local 서비스 요금 → vCPU 시간당 0.01 USD', async () => {
    const r = await resolveAvd({ metric: 'Azure Local 서비스 요금 (vCPU/시간)' });
    expect(r.paygItem.skuName).toBe('AVD for Azure Stack HCI');
    expect(r.paygItem.unitOfMeasure).toBe('1/Hour');
    expect(r.paygItem.unitPrice).toBe(0.01);
  });

  it('패널 안내에 사용 형태 3가지와 세션 호스트 VM 작성법이 있다(v136)', () => {
    const note = REG._svcDefs['Azure Virtual Desktop'].panelNote;
    expect(note).toContain('사내 직원 사용');
    expect(note).toContain('외부 고객 상용 제공');
    expect(note).toContain('Azure Local(온프레미스)');
    expect(note).toContain(VM_OS_AVD);
  });

  it('알 수 없는 metric 은 첫 항목(데스크톱+앱)으로 정규화하고 상세를 채운다', async () => {
    const r = await resolveAvd({ metric: '없는 항목' });
    expect(r.options.metric).toBe('사용자 접속 - 데스크톱+앱 (사용자/월)');
    expect(r.skuName).toBe('Desktop & App Hosting');
    expect(r.detail).toContain('Azure Virtual Desktop');
  });
});

describe('Virtual Machine — os=Windows 10/11 (AVD) 세션 호스트', () => {
  const makeRow = (os) => ({
    region: 'koreacentral', serviceCategory: 'Virtual Machine', skuName: 'D4s_v5',
    options: { os, swType: '(OS Only)', tier: 'Standard', license: '라이선스 포함',
      category: '전체', series: 'D-series v5', instance: 'D4s_v5' },
    paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null,
  });

  it('OS 목록에 AVD 옵션이 있다', () => {
    const os = REG._svcDefs['Virtual Machine'].steps.find((s) => s.key === 'os');
    expect(os.options).toContain(VM_OS_AVD);
  });

  it('AVD 는 Linux 와 같은 단가(절약·예약 포함), Windows 보다 싸다', async () => {
    const linux = makeRow('Linux'), avd = makeRow(VM_OS_AVD), win = makeRow('Windows');
    await REG['_resolve_Virtual_Machine'](linux, 'KRW');
    await REG['_resolve_Virtual_Machine'](avd, 'KRW');
    await REG['_resolve_Virtual_Machine'](win, 'KRW');
    expect(avd.paygItem.unitPrice).toBe(linux.paygItem.unitPrice);
    expect(/windows/i.test(avd.paygItem.productName || '')).toBe(false);
    expect(avd.paygItem._licenseMode).toBeUndefined();
    expect(avd.sp1Item.unitPrice).toBe(linux.sp1Item.unitPrice);
    expect(avd.ri3Item.unitPrice).toBe(linux.ri3Item.unitPrice);
    expect(win.paygItem.unitPrice).toBeGreaterThan(avd.paygItem.unitPrice);
  });

  it('상세 사양에 OS 는 남기고 라이선스 표기는 붙이지 않는다', () => {
    const r = makeRow(VM_OS_AVD);
    REG['_buildDetail_Virtual_Machine'](r);
    expect(r.detail).toContain(VM_OS_AVD);
    expect(r.detail).not.toContain('라이선스 포함');
  });
});
