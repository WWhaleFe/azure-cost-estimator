// GPU VM 사양 카탈로그(v130) — NVads A10 v5 신설 + 상세 사양 표기 통일.
// 배경: MS 가격 계산기에는 NV6/12/18/36/72ads A10 v5 가 있는데 이 도구엔 없어 고를 수 없었고,
//       CSV 로 넣은 NV72ads_A10_v5 행은 상세 사양이 'Linux' 한 마디로만 남았다
//       (시리즈를 모르니 카탈로그 조회가 빗나감).
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/core/network.js', () => ({
  apiFetch: vi.fn(async () => []),
  clearCacheForCurrency: vi.fn(),
  fetchWithCorsFallback: vi.fn(),
  apiCache: new Map(),
  activeProxyIndex: 0,
}));

import { REG } from '../src/core/registry.js';
import '../src/services/vm.js';

const CATALOG = () => REG.VM_INSTANCE_CATALOG;

function detailOf(options) {
  const r = { region: 'koreacentral', serviceCategory: 'Virtual Machine', skuName: '', detail: '', options };
  REG['_buildDetail_Virtual_Machine'](r);
  return r;
}

describe('NVads A10 v5 시리즈', () => {
  it('GPU 범주에서 고를 수 있다', () => {
    const def = REG._svcDefs['Virtual Machine'];
    const r = { options: { category: 'GPU', tier: 'Standard' } };
    REG['_vm_applyStepVisibility'](r);
    const seriesStep = def.steps.find((s) => s.key === 'series');
    expect(seriesStep.options).toContain('NVads A10 v5 (GPU)');
  });

  it('MS 계산기 드롭다운의 6개 사이즈를 모두 담고 있다', () => {
    const list = CATALOG()['NVads A10 v5 (GPU)'];
    expect(list.map((i) => i.name)).toEqual([
      'NV6ads_A10_v5', 'NV12ads_A10_v5', 'NV18ads_A10_v5',
      'NV36ads_A10_v5', 'NV36adms_A10_v5', 'NV72ads_A10_v5',
    ]);
  });

  // MS 가격 계산기 인스턴스 드롭다운 표기와 한 줄씩 대조한다
  // (예: 'NV12ads A10 v5: 12 vCPUs, 110 GB RAM, 320 GB Temporary storage').
  it('vCPU·RAM·임시 스토리지가 MS 가격 계산기 표기와 같다', () => {
    const by = Object.fromEntries(CATALOG()['NVads A10 v5 (GPU)'].map((i) => [i.name, i]));
    const spec = (n) => [by[n].vCPU, by[n].ram, by[n].temp];
    expect(spec('NV6ads_A10_v5')).toEqual([6, 55, 180]);
    expect(spec('NV12ads_A10_v5')).toEqual([12, 110, 320]);
    expect(spec('NV18ads_A10_v5')).toEqual([18, 220, 720]);
    expect(spec('NV36ads_A10_v5')).toEqual([36, 440, 720]);
    expect(spec('NV36adms_A10_v5')).toEqual([36, 880, 720]);
    expect(spec('NV72ads_A10_v5')).toEqual([72, 880, 1400]);
  });

  it('기존 GPU 시리즈의 임시 스토리지도 계산기 표기(문서 GiB 가 아니라)를 쓴다', () => {
    const t = (series, name) => CATALOG()[series].find((i) => i.name === name).temp;
    expect(t('N-series (GPU)', 'NC4as_T4_v3')).toBe(180);        // 문서 Temp Disk = 176 GiB
    expect(t('N-series (GPU)', 'NC64as_T4_v3')).toBe(2880);      // 문서 Temp Disk = 2,816 GiB
    expect(t('NC A100 v4 (GPU)', 'NC24ads_A100_v4')).toBe(1123); // 문서 Temp Disk = 64 GiB (+NVMe 960)
    expect(t('NC A100 v4 (GPU)', 'NC96ads_A100_v4')).toBe(4492);
  });

  it('부분 GPU(1/6~2개) 표기를 담는다', () => {
    const by = Object.fromEntries(CATALOG()['NVads A10 v5 (GPU)'].map((i) => [i.name, i]));
    expect(by.NV6ads_A10_v5.gpu).toBe('A10 1/6 (4GB)');
    expect(by.NV12ads_A10_v5.gpu).toBe('A10 1/3 (8GB)');
    expect(by.NV72ads_A10_v5.gpu).toBe('A10 x2 (48GB)');
  });
});

describe('상세 사양 표기', () => {
  it('CPU → RAM → GPU → 임시 스토리지 순서로 한 줄에 담는다', () => {
    const r = detailOf({ os: 'Linux', swType: '(OS Only)', tier: 'Standard', license: '라이선스 포함',
      category: 'GPU', series: 'NVads A10 v5 (GPU)', instance: 'NV72ads_A10_v5' });
    expect(r.detail).toBe('Linux, CPU:72core RAM:880GB, GPU:A10 x2 (48GB), Temp:1400GB');
    expect(r.skuName).toBe('NV72ads_A10_v5');
  });

  it('GPU 가 없는 시리즈는 CPU·RAM 만 — 형식은 같다', () => {
    const r = detailOf({ os: 'Linux', swType: '(OS Only)', tier: 'Standard', license: '라이선스 포함',
      category: '일반적인 용도', series: 'D-series v5', instance: 'D4s_v5' });
    expect(r.detail).toBe('Linux, CPU:4core RAM:16GB');
  });

  it('기존 GPU 시리즈도 같은 형식으로 GPU·Temp 를 쓴다', () => {
    const r = detailOf({ os: 'Linux', swType: '(OS Only)', tier: 'Standard', license: '라이선스 포함',
      category: 'GPU', series: 'NC A100 v4 (GPU)', instance: 'NC24ads_A100_v4' });
    expect(r.detail).toBe('Linux, CPU:24core RAM:220GB, GPU:A100 x1 (80GB), Temp:1123GB');
  });
});

describe('시리즈 역추적 (CSV 불러오기 경로)', () => {
  it('SKU 만 있는 행도 시리즈를 찾아 상세 사양을 채운다', () => {
    // CSV 불러오기는 options.instance 만 채우고 series·category 는 주지 않는다
    const r = detailOf({ os: 'Linux', instance: 'NV72ads_A10_v5' });
    expect(r.options.series).toBe('NVads A10 v5 (GPU)');
    expect(r.options.category).toBe('GPU');
    expect(r.detail).toBe('Linux, CPU:72core RAM:880GB, GPU:A10 x2 (48GB), Temp:1400GB');
  });

  it('엉뚱한 범주가 들어와 있어도 인스턴스에 맞는 범주로 고쳐 잡는다', () => {
    const r = detailOf({ os: 'Linux', category: '메모리에 최적화', series: 'E-series v5', instance: 'NV36ads_A10_v5' });
    expect(r.options.series).toBe('NVads A10 v5 (GPU)');
    expect(r.detail).toBe('Linux, CPU:36core RAM:440GB, GPU:A10 x1 (24GB), Temp:720GB');
  });

  it('Basic 계층 전용 A-series 는 계층까지 맞춰 준다', () => {
    const r = detailOf({ os: 'Linux', instance: 'A2' });
    expect(r.options.series).toBe('A-series (Basic)');
    expect(r.options.tier).toBe('Basic');
    expect(r.detail).toBe('Linux, CPU:2core RAM:3.5GB, Basic');
  });

  it('카탈로그에 없는 SKU 는 손대지 않는다(조용히 틀리게 고치지 않는다)', () => {
    const r = detailOf({ os: 'Linux', category: 'GPU', series: 'NVads A10 v5 (GPU)', instance: 'NV999ads_A10_v9' });
    expect(r.options.series).toBe('NVads A10 v5 (GPU)');
    expect(r.detail).toBe('Linux');
  });
});
