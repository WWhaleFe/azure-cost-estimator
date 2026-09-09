// ================================================================
// ms-estimate-export.test.js — MS 가격 계산기 내보내기 형식 재현 (v129)
//
// 근거 자료: samples/ExportedEstimate.xlsx — MS 계산기에서 실제로 내려받은 파일.
// 여기서 하는 일: 같은 견적 내용을 우리 모듈에 넣었을 때 xlsx 의 모든 파트가
//                 원본과 **글자 하나까지 같은지**를 본다. "비슷하게 생긴 엑셀"이
//                 아니라 같은 파일이어야 MS 산출물과 나란히 놓고 쓸 수 있다.
// ================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  buildMsEstimateParts, buildMsEstimateModel, buildMsEstimateXlsx,
  buildMsDescription, msRegionLabel, msTaxonomy, msCreatedAtText, normalizeOptionValue,
} from '../src/ui/ms-estimate.js';

const SAMPLE = fileURLToPath(new URL('../samples/ExportedEstimate.xlsx', import.meta.url));

// ── 최소 zip 리더 (stored/deflate 둘 다) ──────────────────────────────────
function unzip(buf) {
  const out = {};
  // 중앙 디렉터리 끝(EOCD)을 뒤에서 찾는다
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    out[name] = (method === 8 ? inflateRawSync(data) : Buffer.from(data)).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const sampleParts = unzip(readFileSync(SAMPLE));

// 원본 견적의 내용(= MS 계산기에서 VM 한 대를 담아 내보낸 것)
const SAMPLE_DESCRIPTION =
  '1 D2 v3 (2 vCPUs, 8 GB RAM) x 730 Hours (Pay as you go), Windows (License included), OS Only;'
  + ' 0 managed disks – S4; Inter Region transfer type, 5 GB outbound data transfer'
  + ' from East US to East Asia';

const sampleModel = {
  currency: 'USD',
  planKey: 'payg',
  items: [{
    category: 'Compute',
    type: 'Virtual Machines',
    customName: '',
    region: 'East US',
    description: SAMPLE_DESCRIPTION,
    monthly: 137.24,
    upfront: 0,
  }],
  support: { monthly: 0, upfront: 0 },
  licensingProgram: 'Microsoft Customer Agreement (MCA)',
  billingAccount: '',
  billingProfile: '',
  totalMonthly: 137.24,
  totalUpfront: 0,
  createdAtText: 'This estimate was created at 9/9/2026 2:54:58 AM UTC.',
};

describe('MS 내보내기 형식 — 원본 파일과 대조', () => {
  const parts = buildMsEstimateParts(sampleModel);

  for (const name of Object.keys(sampleParts)) {
    it(`${name} 가 원본과 같다`, () => {
      expect(parts[name]).toBeDefined();
      expect(parts[name]).toEqual(sampleParts[name]);
    });
  }

  it('파트 구성(파일 목록)이 원본과 같다', () => {
    expect(Object.keys(parts).sort()).toEqual(Object.keys(sampleParts).sort());
  });

  it('zip 의 중앙 디렉터리 크기가 정확하다(엑셀이 "손상됨"으로 열지 않게)', () => {
    const buf = Buffer.from(buildMsEstimateXlsx(sampleModel));
    let eocd = buf.length - 22;
    while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
    const cdSize = buf.readUInt32LE(eocd + 12);
    const cdOffset = buf.readUInt32LE(eocd + 16);
    expect(cdOffset + cdSize).toBe(eocd);            // 중앙 디렉터리가 EOCD 직전에서 끝난다
    expect(buf.readUInt16LE(eocd + 8)).toBe(7);      // 파트 7개
  });

  it('xlsx 바이트를 만들고 다시 열면 같은 파트가 나온다', () => {
    const bytes = buildMsEstimateXlsx(sampleModel);
    const round = unzip(Buffer.from(bytes));
    expect(round['xl/worksheets/sheet1.xml']).toEqual(sampleParts['xl/worksheets/sheet1.xml']);
    expect(round['xl/sharedStrings.xml']).toEqual(sampleParts['xl/sharedStrings.xml']);
  });
});

describe('견적 행 → MS 모델', () => {
  const REGION_LABEL = { eastus: 'East US', koreacentral: 'Korea Central (한국 중부)' };
  const calc = (item, qty, usage) => (item ? { monthly: Number(item.unitPrice) * qty * usage } : null);
  const vmSpec = () => ({ vCPU: 2, ram: 8 });

  const vmRow = {
    region: 'eastus', category: 'Web Server', serviceCategory: 'Virtual Machine',
    skuName: 'D2s_v3', qty: 1, usage: 730,
    options: { os: 'Windows', license: '라이선스 포함', swType: '(OS Only)', tier: 'Standard', series: 'D-series v3', instance: 'D2s_v3' },
    paygItem: { unitPrice: 0.188 }, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null,
  };

  it('리전 라벨에서 한국어 주석을 뗀다', () => {
    expect(msRegionLabel('koreacentral', REGION_LABEL)).toBe('Korea Central');
    expect(msRegionLabel('eastus', REGION_LABEL)).toBe('East US');
  });

  it('서비스 분류를 MS 체계로 옮긴다', () => {
    expect(msTaxonomy('Virtual Machine')).toEqual(['Compute', 'Virtual Machines']);
    expect(msTaxonomy('Azure Kubernetes Service')).toEqual(['Containers', 'Azure Kubernetes Service (AKS)']);
  });

  it('VM 설명은 MS 문장 규칙(첫 절)을 따른다', () => {
    expect(buildMsDescription(vmRow, 'payg', { vmSpec }))
      .toBe('1 D2s v3 (2 vCPUs, 8 GB RAM) x 730 Hours (Pay as you go), Windows (License included), OS Only');
  });

  it('결제 옵션이 설명 문구에 반영된다', () => {
    expect(buildMsDescription(vmRow, 'ri3', { vmSpec })).toContain('(3 year reserved)');
  });

  it('모델은 항목·합계·Custom name 을 채운다', () => {
    const m = buildMsEstimateModel([vmRow], { planKey: 'payg', currency: 'USD', regionLabelMap: REGION_LABEL, calc, vmSpec });
    expect(m.items).toHaveLength(1);
    expect(m.items[0].category).toBe('Compute');
    expect(m.items[0].customName).toBe('Web Server');
    expect(m.items[0].region).toBe('East US');
    expect(m.items[0].monthly).toBe(137.24);      // 0.188 × 730 = 137.24
    expect(m.totalMonthly).toBe(137.24);
    expect(m.totalUpfront).toBe(0);
  });

  it('서비스가 안 정해진 행은 빠진다', () => {
    const m = buildMsEstimateModel([{ serviceCategory: '', options: {} }, vmRow], { calc, vmSpec, regionLabelMap: REGION_LABEL });
    expect(m.items).toHaveLength(1);
  });

  it('항목이 늘어나도 요약 블록이 그만큼 아래로 내려간다', () => {
    const m3 = { ...sampleModel, items: [sampleModel.items[0], sampleModel.items[0], sampleModel.items[0]] };
    const sheet = buildMsEstimateParts(m3)['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<c r="D7" s="13" t="s">');      // Support 라벨 = 4+3
    expect(sheet).toContain('<c r="D11" s="14" t="s">');     // Total   = 4+3+4
    expect(sheet).toContain('<mergeCell ref="A14:G14" />');  // 면책 본문
  });

  it('생성 시각을 MS 표기로 쓴다', () => {
    expect(msCreatedAtText(new Date(Date.UTC(2026, 8, 9, 2, 54, 58))))
      .toBe('This estimate was created at 9/9/2026 2:54:58 AM UTC.');
    expect(msCreatedAtText(new Date(Date.UTC(2026, 8, 9, 13, 5, 9))))
      .toBe('This estimate was created at 9/9/2026 1:05:09 PM UTC.');
  });

  it('옵션 값의 한국어 주석을 영문 표기로 정리한다', () => {
    expect(normalizeOptionValue('Standard (표준)')).toBe('Standard');
    expect(normalizeOptionValue('Data Processed (데이터 처리, GB)')).toBe('Data Processed');
    expect(normalizeOptionValue('라이선스 포함')).toBe('License included');
    expect(normalizeOptionValue('Premium')).toBe('Premium');
  });

  it('통화를 바꾸면 숫자 서식과 면책 문구가 함께 바뀐다', () => {
    const krw = buildMsEstimateParts({ ...sampleModel, currency: 'KRW' });
    expect(krw['xl/styles.xml']).toContain('formatCode="[$₩]#,##0.00"');
    expect(krw['xl/sharedStrings.xml']).toContain('Korea – Won (₩) KRW');
  });
});
