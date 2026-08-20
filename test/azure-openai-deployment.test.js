// ================================================================
// azure-openai-deployment.test.js — Azure OpenAI 배포 유형 매칭 (v128)
//
// 지키려는 것 두 가지.
//   1) skuName 문법 해석기(parseAoaiSku)가 리전·모델마다 제각각인 표기를
//      (토큰 종류 × 배포 유형 × 일괄) 로 정확히 풀어내고, 남의 미터를 삼키지 않는다.
//   2) GPT-5 계열이 우선 처리(pp, 표준의 2배) 미터가 아니라 표준 미터로 매칭된다.
// 녹화 픽스처 + apiFetch 목이라 네트워크 없이 결정론적으로 돈다.
// ================================================================
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/azure-openai.json', import.meta.url)));

vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async (filters) => {
    const all = fx[filters.armRegionName] || [];
    return all.filter((it) => !filters.productName || it.productName === filters.productName);
  }),
  clearCacheForCurrency: vi.fn(),
  fetchWithCorsFallback: vi.fn(),
  apiCache: new Map(),
}));
vi.mock('../src/core/ui-hooks.js', () => ({
  setStatus: vi.fn(), updatePriceCells: vi.fn(), updateTotalsRow: vi.fn(), showToast: vi.fn(),
}));

const { parseAoaiSku } = await import('../src/services/azure-openai.js');
const { REG } = await import('../src/core/registry.js');

const mkRow = (options, region = 'koreacentral') => ({
  region, qty: 1, usage: 10, options, skuName: '', detail: '',
  paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null,
});
const resolve = async (options, region) => {
  const row = mkRow(options, region);
  REG._buildDetail_Azure_OpenAI(row);
  await REG._resolve_Azure_OpenAI(row, 'KRW');
  return row;
};

describe('parseAoaiSku — skuName 문법 해석', () => {
  it('표기가 달라도 (토큰 종류 × 배포 유형 × 일괄) 을 같게 풀어낸다', () => {
    const g41m = ['gpt 4.1 mini'];
    expect(parseAoaiSku('gpt 4.1 mini Inp glbl', g41m)).toEqual({ metric: 'inp', deploy: 'global', batch: false });
    expect(parseAoaiSku('gpt 4.1 mini Outp regnl', g41m)).toEqual({ metric: 'out', deploy: 'regional', batch: false });
    expect(parseAoaiSku('gpt 4.1 mini cached Inp glbl', g41m)).toEqual({ metric: 'cache', deploy: 'global', batch: false });
    expect(parseAoaiSku('gpt 4.1 mini Batch Outp glbl', g41m)).toEqual({ metric: 'out', deploy: 'global', batch: true });
    // 'Data Zone' 은 꼬리가 두 토큰, 'DataZone'·'DZ'·'Dz' 는 한 토큰
    const o4 = ['o4 mini 0416'];
    expect(parseAoaiSku('o4-mini 0416 Inp Data Zone', o4)).toEqual({ metric: 'inp', deploy: 'datazone', batch: false });
    expect(parseAoaiSku('o4-mini 0416 cached Inp DataZone', o4)).toEqual({ metric: 'cache', deploy: 'datazone', batch: false });
    // GPT-5 계열은 Inpt/outpt/cchd/cd/opt 표기를 쓴다
    expect(parseAoaiSku('GPT 5 cchd Inpt Glbl', ['gpt 5'])).toEqual({ metric: 'cache', deploy: 'global', batch: false });
    expect(parseAoaiSku('GPT 5.1 opt Dz', ['gpt 5.1'])).toEqual({ metric: 'out', deploy: 'datazone', batch: false });
    // 토큰 종류 토큰이 없는 임베딩은 inputOnly 일 때만 입력으로 본다
    const emb = ['text embedding 3 small'];
    expect(parseAoaiSku('text embedding 3 small DZ', emb, true)).toEqual({ metric: 'inp', deploy: 'datazone', batch: false });
    expect(parseAoaiSku('text-embedding-3-small-regional', emb, true)).toEqual({ metric: 'inp', deploy: 'regional', batch: false });
    expect(parseAoaiSku('text embedding 3 small DZ', emb)).toBeNull();
  });

  it('접두사만 같은 남의 미터는 삼키지 않는다', () => {
    // 상위 모델이 하위 모델 미터를 먹으면 안 된다
    expect(parseAoaiSku('gpt 4.1 mini Inp glbl', ['gpt 4.1'])).toBeNull();
    expect(parseAoaiSku('GPT 5 Nano Inpt Glbl', ['gpt 5'])).toBeNull();
    expect(parseAoaiSku('GPT 5 Chat Inpt Glbl', ['gpt 5'])).toBeNull();
    // 미세 조정·호스팅·학습 미터
    expect(parseAoaiSku('gpt 4.1 dev ft training glbl', ['gpt 4.1'])).toBeNull();
    expect(parseAoaiSku('gpt-4.1-ft hosting global', ['gpt 4.1'])).toBeNull();
    expect(parseAoaiSku('gpt-4.1-ft input global', ['gpt 4.1'])).toBeNull();
    // 우선 처리(pp) — 표준의 2배라 반드시 걸러야 한다
    expect(parseAoaiSku('5 pp inp Gl', ['gpt 5'])).toBeNull();
    // 배포 유형 꼬리가 없는 미터
    expect(parseAoaiSku('gpt 4.1 Inp', ['gpt 4.1'])).toBeNull();
  });
});

describe('_resolve_Azure_OpenAI — 배포 유형별 단가', () => {
  it('GPT-5 는 우선 처리(pp)가 아니라 표준 미터를 쓴다', async () => {
    const row = await resolve({ model: 'GPT-5', deploymentType: 'Global', metric: '입력 토큰' });
    expect(row.paygItem).toBeTruthy();
    expect(row.paygItem.skuName).toBe('GPT 5 Inpt Glbl');
    expect(row.paygItem.unitPrice).toBe(1809.1875);       // '5 pp inp Gl'(3618.375) 의 절반
  });

  it('같은 모델·토큰이라도 배포 유형에 따라 단가가 달라진다', async () => {
    const g = await resolve({ model: 'GPT-4.1 mini', deploymentType: 'Global', metric: '입력 토큰' }, 'japaneast');
    const r = await resolve({ model: 'GPT-4.1 mini', deploymentType: 'Regional', metric: '입력 토큰' }, 'japaneast');
    expect(g.paygItem.unitPrice).toBeCloseTo(578.9, 1);   // 1K 미터 → 1M 토큰 단가로 환산
    expect(r.paygItem.unitPrice).toBeCloseTo(700.5, 1);
    expect(r.paygItem.unitPrice).toBeGreaterThan(g.paygItem.unitPrice);
  });

  it('일괄(Batch) 배포는 별도 미터로 더 싸게 잡힌다', async () => {
    const n = await resolve({ model: 'GPT-4.1 mini', deploymentType: 'Global', metric: '출력 토큰' });
    const b = await resolve({ model: 'GPT-4.1 mini', deploymentType: 'Batch Global', metric: '출력 토큰' });
    expect(b.paygItem.unitPrice).toBeCloseTo(n.paygItem.unitPrice / 2, 1);
  });

  it('임베딩은 리전에 있는 배포 유형만 매칭된다', async () => {
    const dz = await resolve({ model: 'text-embedding-3-small', deploymentType: 'Data Zone', metric: '입력 토큰' });
    expect(dz.paygItem.unitPrice).toBeCloseTo(34.7, 1);
    // koreacentral 에는 Global 임베딩 미터가 없다 → 매칭 실패
    const gl = await resolve({ model: 'text-embedding-3-small', deploymentType: 'Global', metric: '입력 토큰' });
    expect(gl.paygItem).toBeNull();
  });

  it('배포 유형이 없으면 그 리전에서 고를 수 있는 유형을 안내한다', async () => {
    const { setStatus } = await import('../src/core/ui-hooks.js');
    setStatus.mockClear();
    await resolve({ model: 'GPT-4.1 mini', deploymentType: 'Regional', metric: '입력 토큰' });   // koreacentral 엔 Regional 없음
    const msg = setStatus.mock.calls.map((c) => c[1]).join('\n');
    expect(msg).toMatch(/매칭 실패/);
    expect(msg).toMatch(/Global/);
  });
});
