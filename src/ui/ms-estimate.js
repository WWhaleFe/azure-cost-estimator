// ================================================================
// ui/ms-estimate.js — MS 가격 계산기(azure.microsoft.com/pricing/calculator)의
//                     "Export" 산출물(ExportedEstimate.xlsx)과 같은 파일을 만든다.
//
// 왜 SheetJS 를 안 쓰나:
//   MS 산출물은 서식(Segoe UI Light·DDEBF7 헤더·[$$]#,##0.00·A1:Z1000 패딩)까지
//   고정된 파일이다. SheetJS 로는 "비슷한" 파일만 나오고 셀 스타일 인덱스·패딩·
//   병합 구성이 달라진다. 그래서 OOXML 을 직접 쓰고, 무압축(stored) ZIP 으로 묶는다.
//   samples/ExportedEstimate.xlsx 와 바이트 단위로 대조하는 테스트가 이 결정을 지킨다
//   (test/ms-estimate-export.test.js).
//
// DOM 비의존 — Node 테스트에서 그대로 import 한다. 버튼 연결은 ui/export-ms.js.
// ================================================================

// ── MS 계산기 분류 체계 (Service category / Service type) ────────────────
// 앱의 serviceCategory → MS 내보내기의 A열/B열. MS 계산기가 쓰는 영문 표기 그대로.
export const MS_TAXONOMY = {
  'Virtual Machine':                  ['Compute', 'Virtual Machines'],
  'App Service':                      ['Compute', 'App Service'],
  'Azure Kubernetes Service':         ['Containers', 'Azure Kubernetes Service (AKS)'],
  'Container Apps':                   ['Containers', 'Azure Container Apps'],
  'Azure Container Registry':         ['Containers', 'Container Registry'],
  'Disk':                             ['Storage', 'Managed Disks'],
  'Azure Files':                      ['Storage', 'Azure Files'],
  'Azure Files Provisioned v2':       ['Storage', 'Azure Files'],
  'Blob Storage':                     ['Storage', 'Storage Accounts'],
  'Page Blob':                        ['Storage', 'Storage Accounts'],
  'Storage Account':                  ['Storage', 'Storage Accounts'],
  'Data Lake Storage Gen2':           ['Storage', 'Storage Accounts'],
  'Backup':                           ['Storage', 'Azure Backup'],
  'Virtual Network':                  ['Networking', 'Virtual Network'],
  'VPN Gateway':                      ['Networking', 'VPN Gateway'],
  'Load Balancer':                    ['Networking', 'Load Balancer'],
  'Application Gateway':              ['Networking', 'Application Gateway'],
  'Azure Front Door':                 ['Networking', 'Azure Front Door'],
  'Public IP':                        ['Networking', 'IP Addresses'],
  'Azure Firewall':                   ['Networking', 'Azure Firewall'],
  'Bandwidth':                        ['Networking', 'Bandwidth'],
  'NAT Gateway':                      ['Networking', 'NAT Gateway'],
  'Azure Private Link':               ['Networking', 'Azure Private Link'],
  'Azure DNS':                        ['Networking', 'Azure DNS'],
  'Azure Bastion':                    ['Networking', 'Azure Bastion'],
  'Azure SQL Database':               ['Databases', 'Azure SQL Database'],
  'Azure SQL Database Elastic Pool':  ['Databases', 'Azure SQL Database'],
  'Azure SQL Managed Instance':       ['Databases', 'Azure SQL Managed Instance'],
  'Azure Database for MySQL':         ['Databases', 'Azure Database for MySQL'],
  'Azure Cosmos DB':                  ['Databases', 'Azure Cosmos DB'],
  'Azure Cache for Redis':            ['Databases', 'Azure Cache for Redis'],
  'API Management':                   ['Integration', 'API Management'],
  'Service Bus':                      ['Integration', 'Service Bus'],
  'Event Hubs':                       ['Analytics', 'Event Hubs'],
  'Azure Synapse Analytics':          ['Analytics', 'Azure Synapse Analytics'],
  'Microsoft Fabric':                 ['Analytics', 'Microsoft Fabric'],
  'Azure Monitor':                    ['Management and Governance', 'Azure Monitor'],
  'Log Analytics':                    ['Management and Governance', 'Azure Monitor'],
  'Microsoft Sentinel':               ['Security', 'Microsoft Sentinel'],
  'Azure Key Vault':                  ['Security', 'Key Vault'],
  'Azure OpenAI':                     ['AI + machine learning', 'Azure OpenAI'],
  'Azure Machine Learning':           ['AI + machine learning', 'Azure Machine Learning'],
  'Azure DevOps':                     ['Developer tools', 'Azure DevOps'],
  'GitHub':                           ['Developer tools', 'GitHub'],
};

export function msTaxonomy(serviceCategory) {
  return MS_TAXONOMY[serviceCategory] || ['Other', serviceCategory || ''];
}

// ── 가격 그룹 → MS 계산기의 결제 옵션 표기 ────────────────────────────────
export const MS_PLAN_LABEL = {
  payg: 'Pay as you go',
  sp1:  '1 year savings plan',
  sp3:  '3 year savings plan',
  ri1:  '1 year reserved',
  ri3:  '3 year reserved',
};
export const MS_PLAN_ITEM_KEY = {
  payg: 'paygItem', sp1: 'sp1Item', sp3: 'sp3Item', ri1: 'ri1Item', ri3: 'ri3Item',
};

// ── 통화 ────────────────────────────────────────────────────────────────
// MS 내보내기는 통화 이름을 면책 문구에, 기호를 숫자 서식([$…])에 넣는다.
export const MS_CURRENCY = {
  USD: { name: 'United States – Dollar ($) USD', fmt: '[$$]#,##0.00' },
  KRW: { name: 'Korea – Won (₩) KRW',            fmt: '[$₩]#,##0.00' },
  EUR: { name: 'Euro Zone – Euro (€) EUR',       fmt: '[$€]#,##0.00' },
  JPY: { name: 'Japan – Yen (¥) JPY',            fmt: '[$¥]#,##0.00' },
};
export function msCurrency(code) {
  return MS_CURRENCY[code] || { name: `${code}`, fmt: '#,##0.00' };
}

// ── 리전 표기 ────────────────────────────────────────────────────────────
// 앱 라벨은 'Korea Central (한국 중부)' 형태 — MS 는 영문 이름만 쓴다.
export function msRegionLabel(region, regionLabelMap) {
  const label = (regionLabelMap && regionLabelMap[region]) || region || '';
  return String(label).replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// ── 옵션 값 한→영 사전 ───────────────────────────────────────────────────
// 앱 옵션은 한국어 라벨이 섞여 있다. MS 산출물은 영문이므로 표기를 옮긴다.
// 사전에 없으면 normalizeOptionValue 의 규칙(괄호 안 한글 제거)을 적용한다.
export const MS_VALUE_LEXICON = {
  '라이선스 포함': 'License included',
  '(OS Only)': 'OS Only',
  '전체': 'All',
  '일반적인 용도': 'General purpose',
  '컴퓨팅 최적화': 'Compute optimized',
  '메모리에 최적화': 'Memory optimized',
  'Storage에 최적화': 'Storage optimized',
  'GPU': 'GPU',
  '고성능 컴퓨팅': 'High performance compute',
  '표준 HDD': 'Standard HDD',
  '표준 SSD': 'Standard SSD',
  '프리미엄 SSD': 'Premium SSD',
  '프리미엄 SSD v2': 'Premium SSD v2',
  'Ultra Disk': 'Ultra Disk',
  '로컬 중복': 'Locally redundant storage (LRS)',
  '영역 중복(ZR)': 'Zone redundant storage (ZRS)',
  '계층 구조 네임스페이스': 'Hierarchical namespace',
  '단일 구조 네임스페이스': 'Flat namespace',
  'VNET 간': 'VNET Peering',
  '보호 인스턴스': 'Protected instances',
  '백업 저장소': 'Backup storage',
  '차감 (조직 무료 한도 적용)': 'Free tier applied',
  '미차감 (전량 과금)': 'Free tier not applied',
  '메트릭': 'Metrics',
  '로그': 'Logs',
};

const HANGUL = /[ㄱ-ㆎ가-힣]/;

/** 옵션 값을 MS 표기(영문)로 옮긴다. 사전 우선, 없으면 괄호 안 한글 주석을 떼어낸다. */
export function normalizeOptionValue(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (MS_VALUE_LEXICON[s]) return MS_VALUE_LEXICON[s];
  // 'Deployment (배포, 시간당)' → 'Deployment' / 'Standard (표준)' → 'Standard'
  const stripped = s.replace(/\s*\(([^)]*)\)/g, (m, inner) => (HANGUL.test(inner) ? '' : m)).trim();
  if (stripped && !HANGUL.test(stripped)) return stripped;
  return stripped || s;
}

const nf = (n) => Number(n || 0).toLocaleString('en-US');

// ── 설명(Description) 만들기 ─────────────────────────────────────────────
// MS 계산기 문장 규칙: "<수량> <SKU>(<사양>) x <사용량> Hours (<결제 옵션>), <옵션들>".
// 서비스별 세부 문구는 MS 내보내기 원본이 있는 것만 확정이고(현재 Virtual Machine),
// 나머지는 같은 규칙으로 조립한다 — MS_DESCRIPTION_VERIFIED 참고.
export const MS_DESCRIPTION_VERIFIED = new Set(['Virtual Machine']);

/** VM: "1 D2s v3 (2 vCPUs, 8 GB RAM) x 730 Hours (Pay as you go), Windows (License included), OS Only" */
function describeVirtualMachine(row, ctx) {
  const o = row.options || {};
  const spec = ctx.vmSpec ? ctx.vmSpec(o.series, o.instance) : null;
  const sku = String(row.skuName || o.instance || '').replace(/_/g, ' ');
  const specTxt = spec
    ? ` (${spec.vCPU} vCPU${spec.vCPU === 1 ? '' : 's'}${spec.ram != null ? `, ${spec.ram} GB RAM` : ''})`
    : '';
  const head = `${nf(row.qty)} ${sku}${specTxt} x ${nf(row.usage)} Hours (${ctx.planLabel})`;
  const tail = [];
  if (o.tier && o.tier !== 'Standard') tail.push(normalizeOptionValue(o.tier));
  if (o.os) {
    const lic = o.os !== 'Linux' && o.license ? ` (${normalizeOptionValue(o.license)})` : '';
    tail.push(`${o.os}${lic}`);
  }
  tail.push(normalizeOptionValue(o.swType || '(OS Only)'));
  return [head, ...tail].join(', ');
}

/** Disk: "10 x P10 Disks (128 GiB), LRS Redundancy" 계열. 프로비저닝 계층은 용량/IOPS 표기. */
function describeDisk(row, ctx) {
  const o = row.options || {};
  const sub = normalizeOptionValue(o.diskSubType || '표준 HDD');
  if (o.diskSubType === '프리미엄 SSD v2' || o.diskSubType === 'Ultra Disk') {
    const parts = [`${nf(row.qty)} ${sub} disk${row.qty === 1 ? '' : 's'} (${ctx.planLabel})`];
    if (o.diskSizeGiB) parts.push(`${nf(o.diskSizeGiB)} GiB provisioned capacity`);
    if (o.iops) parts.push(`${nf(o.iops)} provisioned IOPS`);
    if (o.throughput) parts.push(`${nf(o.throughput)} MB/s provisioned throughput`);
    return parts.join(', ');
  }
  const sku = row.skuName || o.diskInstance || '';
  return `${nf(row.qty)} ${sku} ${sub} disk${row.qty === 1 ? '' : 's'} (${ctx.planLabel})`;
}

/** App Service: "1 P1V3 x 730 Hours (Pay as you go), Linux OS, Premium v3 tier" */
function describeAppService(row, ctx) {
  const o = row.options || {};
  const sku = row.skuName || o.size || '';
  const parts = [`${nf(row.qty)} ${sku} x ${nf(row.usage)} Hours (${ctx.planLabel})`];
  if (o.os) parts.push(`${o.os} OS`);
  if (o.tier) parts.push(`${normalizeOptionValue(o.tier)} tier`);
  return parts.join(', ');
}

/** SQL Database: "1 x 730 Hours, Single Database, vCore, General Purpose, Provisioned, Gen5, 2 vCore(s), …" */
function describeSqlDatabase(row, ctx) {
  const o = row.options || {};
  const parts = [`${nf(row.qty)} instance(s) x ${nf(row.usage)} Hours (${ctx.planLabel})`, 'Single Database'];
  if (o.model) parts.push(o.model);
  if (o.tier) parts.push(normalizeOptionValue(o.tier));
  if (o.compute) parts.push(normalizeOptionValue(o.compute));
  if (o.hardware) parts.push(o.hardware);
  if (o.vCores) parts.push(`${o.vCores} vCore(s)`);
  if (o.dtuSize) parts.push(`${o.dtuSize} DTU`);
  if (o.redundancy) parts.push(normalizeOptionValue(o.redundancy));
  if (o.license) parts.push(normalizeOptionValue(o.license));
  if (o.storageGB) parts.push(`${nf(o.storageGB)} GB storage`);
  return parts.join(', ');
}

/** 일반 규칙: 헤드(수량 x 사용량) + 서비스 옵션 나열. */
function describeGeneric(row, ctx) {
  const o = row.options || {};
  const sku = String(row.skuName || '').replace(/_/g, ' ');
  const head = sku
    ? `${nf(row.qty)} ${sku} x ${nf(row.usage)} Hours (${ctx.planLabel})`
    : `${nf(row.qty)} x ${nf(row.usage)} Hours (${ctx.planLabel})`;
  const seen = new Set([sku]);
  const tail = [];
  for (const key of Object.keys(o)) {
    if (key === 'instance' || key === 'series' || key === 'category') continue;
    const v = normalizeOptionValue(o[key]);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    tail.push(typeof o[key] === 'number' || /^\d+(\.\d+)?$/.test(String(o[key])) ? `${nf(o[key])} ${key}` : v);
  }
  return [head, ...tail].join(', ');
}

const DESCRIBERS = {
  'Virtual Machine': describeVirtualMachine,
  'Disk': describeDisk,
  'App Service': describeAppService,
  'Azure SQL Database': describeSqlDatabase,
};

/**
 * 견적 행 하나를 MS 계산기 Description 문장으로 옮긴다.
 * @param row      앱의 견적 행
 * @param planKey  'payg' | 'sp1' | 'sp3' | 'ri1' | 'ri3'
 * @param ctx      { vmSpec?(series, instance) → {vCPU, ram} }
 */
export function buildMsDescription(row, planKey = 'payg', ctx = {}) {
  const c = { ...ctx, planLabel: MS_PLAN_LABEL[planKey] || MS_PLAN_LABEL.payg };
  const fn = DESCRIBERS[row.serviceCategory] || describeGeneric;
  return fn(row, c);
}

// ── 견적 모델 ────────────────────────────────────────────────────────────
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** "9/9/2026 2:54:58 AM UTC" — MS 내보내기의 생성 시각 표기. */
export function msCreatedAtText(date) {
  const d = date instanceof Date ? date : new Date(date);
  const h24 = d.getUTCHours();
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const p2 = (n) => String(n).padStart(2, '0');
  return `This estimate was created at ${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`
    + ` ${h}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} ${ampm} UTC.`;
}

/**
 * 견적 행 배열 → MS 내보내기 모델.
 * @param rows  앱의 견적 행
 * @param opts  {
 *   planKey, currency, regionLabelMap, vmSpec,
 *   calc(item, qty, usage) → {monthly}   // ui-and-bootstrap 의 calcGroup 과 같은 계약
 *   createdAt, licensingProgram, billingAccount, billingProfile, supportMonthly, supportUpfront
 * }
 */
export function buildMsEstimateModel(rows, opts = {}) {
  const planKey = opts.planKey || 'payg';
  const itemKey = MS_PLAN_ITEM_KEY[planKey] || 'paygItem';
  const calc = opts.calc || (() => null);
  const currency = opts.currency || 'USD';

  const items = (rows || []).filter((r) => r && r.serviceCategory).map((r) => {
    const [category, type] = msTaxonomy(r.serviceCategory);
    const d = calc(r[itemKey], Number(r.qty) || 0, Number(r.usage) || 0);
    return {
      category,
      type,
      customName: r.category || '',
      region: msRegionLabel(r.region, opts.regionLabelMap),
      description: buildMsDescription(r, planKey, { vmSpec: opts.vmSpec }),
      monthly: round2(d ? d.monthly : 0),
      upfront: 0,   // 앱은 예약/절약 단가를 시간당으로 환산해 월 비용에 녹인다(선불 0).
    };
  });

  const supportMonthly = round2(opts.supportMonthly || 0);
  const supportUpfront = round2(opts.supportUpfront || 0);
  return {
    currency,
    planKey,
    items,
    support: { monthly: supportMonthly, upfront: supportUpfront },
    licensingProgram: opts.licensingProgram || 'Microsoft Customer Agreement (MCA)',
    billingAccount: opts.billingAccount || '',
    billingProfile: opts.billingProfile || '',
    totalMonthly: round2(items.reduce((s, i) => s + i.monthly, 0) + supportMonthly),
    totalUpfront: round2(items.reduce((s, i) => s + i.upfront, 0) + supportUpfront),
    createdAtText: opts.createdAtText || msCreatedAtText(opts.createdAt || new Date()),
  };
}

// ================================================================
// OOXML — MS 산출물과 같은 구조로 직접 쓴다
// ================================================================
const COL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// 빈 셀의 기본 스타일: A~E=3, F~G=5, H=7, I~Z=1 (MS 산출물과 동일)
function padStyle(i) { return i <= 4 ? 3 : i <= 6 ? 5 : i === 7 ? 7 : 1; }

const xmlEscape = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** 문자열 테이블(중복 제거). 셀은 인덱스만 들고 있는다. */
function createStringTable() {
  const list = [];
  const index = new Map();
  return {
    list,
    id(s) {
      const v = String(s == null ? '' : s);
      if (index.has(v)) return index.get(v);
      const i = list.length;
      list.push(v); index.set(v, i);
      return i;
    },
  };
}

function rowXml(r, cells) {
  let out = `<row r="${r}">`;
  for (let i = 0; i < 26; i++) {
    const ref = `${COL_LETTERS[i]}${r}`;
    const c = cells[i];
    if (!c) { out += `<c r="${ref}" s="${padStyle(i)}"/>`; continue; }
    if (c.t === 's') out += `<c r="${ref}" s="${c.s}" t="s"><v>${c.v}</v></c>`;
    else if (c.v === undefined || c.v === null) out += `<c r="${ref}" s="${c.s}"/>`;
    else out += `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>`;
  }
  return out + '</row>';
}

const numCell = (s, v) => ({ s, v: String(round2(v)) });

/** sheet1.xml + sharedStrings.xml 을 함께 만든다(문자열 인덱스를 공유해야 하므로). */
export function buildMsSheetParts(model) {
  const st = createStringTable();
  const S = (v) => st.id(v);
  const rows = new Map();          // rowNumber → cells[]
  const put = (r, cells) => rows.set(r, cells);

  // 1~3행: 제목 / 부제 / 헤더
  put(1, [{ s: 8, t: 's', v: S('Microsoft Azure Estimate') }]);
  put(2, [{ s: 9, t: 's', v: S('Your Estimate') }]);
  put(3, [
    { s: 10, t: 's', v: S('Service category') },
    { s: 10, t: 's', v: S('Service type') },
    { s: 10, t: 's', v: S('Custom name') },
    { s: 10, t: 's', v: S('Region') },
    { s: 10, t: 's', v: S('Description') },
    { s: 11, t: 's', v: S('Estimated monthly cost') },
    { s: 11, t: 's', v: S('Estimated upfront cost') },
  ]);

  // 4행부터 견적 항목
  model.items.forEach((it, i) => {
    put(4 + i, [
      { s: 3, t: 's', v: S(it.category) },
      { s: 3, t: 's', v: S(it.type) },
      { s: 3, t: 's', v: S(it.customName) },
      { s: 3, t: 's', v: S(it.region) },
      { s: 3, t: 's', v: S(it.description) },
      numCell(5, it.monthly),
      numCell(5, it.upfront),
    ]);
  });

  // 항목 아래: Support 행과 요약 블록(D·E열) — MS 산출물과 같은 배치
  const rSupport = 4 + model.items.length;
  put(rSupport, [
    { s: 3, t: 's', v: S('Support') }, null, null,
    { s: 13, t: 's', v: S('Support') },
    { s: 12 },
    numCell(5, model.support.monthly),
    numCell(5, model.support.upfront),
  ]);
  put(rSupport + 1, [null, null, null,
    { s: 13, t: 's', v: S('Licensing Program') }, { s: 13, t: 's', v: S(model.licensingProgram) }]);
  put(rSupport + 2, [null, null, null,
    { s: 13, t: 's', v: S('Billing Account') }, { s: 13, t: 's', v: S(model.billingAccount) }]);
  put(rSupport + 3, [null, null, null,
    { s: 13, t: 's', v: S('Billing Profile') }, { s: 13, t: 's', v: S(model.billingProfile) }]);
  const rTotal = rSupport + 4;
  put(rTotal, [null, null, null,
    { s: 14, t: 's', v: S('Total') }, { s: 12 },
    numCell(15, model.totalMonthly), numCell(15, model.totalUpfront)]);

  // 면책 블록(한 줄 띄고 라벨 → 본문 → 생성 시각 → 회색 여백 한 줄)
  const rDisclaimer = rTotal + 2;
  put(rDisclaimer, [{ s: 13, t: 's', v: S('Disclaimer') }]);
  const cur = msCurrency(model.currency);
  const band = (text) => [
    text == null ? { s: 16 } : { s: 16, t: 's', v: S(text) },
    { s: 16 }, { s: 16 }, { s: 16 }, { s: 16 }, { s: 17 }, { s: 17 },
  ];
  const rText = rDisclaimer + 1;
  put(rText, band(`All prices shown are in ${cur.name}. This is a summary estimate, not a quote.`
    + ' For up to date pricing information please visit https://azure.microsoft.com/pricing/calculator/'));
  put(rText + 1, band(model.createdAtText));
  put(rText + 2, band(null));

  const lastRow = Math.max(1000, rText + 2);
  let body = '';
  for (let r = 1; r <= lastRow; r++) body += rowXml(r, rows.get(r) || []);

  const merges = ['A1:C1', 'A2:C2', `A${rText}:G${rText}`, `A${rText + 1}:G${rText + 1}`];

  const sheet = '﻿<?xml version="1.0" encoding="utf-8"?>'
    + '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<dimension ref="A1:Z${lastRow}" />`
    + '<sheetViews><sheetView workbookViewId="0" /></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15" />'
    + '<cols>'
    + [1, 2, 3, 4].map((n) => `<col min="${n}" max="${n}" width="24" customWidth="1" style="2"/>`).join('')
    + '<col min="5" max="5" width="50" customWidth="1" style="2"/>'
    + '<col min="6" max="6" width="30" customWidth="1" style="4"/>'
    + '<col min="7" max="7" width="30" customWidth="1" style="4"/>'
    + '<col min="8" max="8" width="30" customWidth="1" style="6"/>'
    + '</cols>'
    + `<sheetData>${body}</sheetData>`
    + `<mergeCells>${merges.map((m) => `<mergeCell ref="${m}" />`).join('')}</mergeCells>`
    + '<headerFooter /></worksheet>';

  const sharedStrings = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
    + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${st.list.length}"`
    + ` uniqueCount="${st.list.length}">`
    + st.list.map((s) => `<si><t>${xmlEscape(s)}</t></si>`).join('')
    + '</sst>';

  return { sheet, sharedStrings, lastRow };
}

/** styles.xml — MS 산출물과 같은 서식표(통화 기호만 통화별로 바뀐다). */
export function buildMsStylesXml(currency) {
  const fmt = msCurrency(currency).fmt;
  const L = [
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '  <numFmts count="1">',
    `    <numFmt numFmtId="164" formatCode="${xmlEscape(fmt)}" />`,
    '  </numFmts>',
    '  <fonts count="6">',
    '    <font>', '      <sz val="11" />', '      <name val="Calibri" />', '    </font>',
    '    <font>', '      <sz val="11" />', '      <name val="Segoe UI Light" />', '    </font>',
    '    <font>', '      <b />', '      <sz val="14" />', '      <name val="Segoe UI Light" />', '    </font>',
    '    <font>', '      <b />', '      <sz val="12" />', '      <name val="Segoe UI Light" />', '    </font>',
    '    <font>', '      <b />', '      <sz val="11" />', '      <name val="Segoe UI Light" />', '    </font>',
    '    <font>', '      <i />', '      <sz val="11" />', '      <name val="Segoe UI Light" />', '    </font>',
    '  </fonts>',
    '  <fills count="4">',
    '    <fill>', '      <patternFill patternType="none" />', '    </fill>',
    '    <fill>', '      <patternFill patternType="gray125" />', '    </fill>',
    '    <fill>', '      <patternFill patternType="solid">', '        <fgColor rgb="FFDDEBF7" tint="0" />', '      </patternFill>', '    </fill>',
    '    <fill>', '      <patternFill patternType="solid">', '        <fgColor rgb="FFD3D3D3" tint="0" />', '      </patternFill>', '    </fill>',
    '  </fills>',
    '  <borders count="2">',
    '    <border>', '      <left />', '      <right />', '      <top />', '      <bottom />', '      <diagonal />', '    </border>',
    '    <border>', '      <left />', '      <right />', '      <top style="thin" />', '      <bottom style="thin" />', '      <diagonal />', '    </border>',
    '  </borders>',
    '  <cellStyleXfs count="1">',
    '    <xf numFmtId="0" fontId="0" />',
    '  </cellStyleXfs>',
    '  <cellXfs count="18">',
    '    <xf numFmtId="0" applyNumberFormat="1" fontId="0" applyFont="1" xfId="0" />',
    '    <xf numFmtId="0" applyNumberFormat="1" fontId="1" applyFont="1" xfId="0" />',
    '    <xf numFmtId="0" applyNumberFormat="1" fontId="0" applyFont="1" xfId="0">',
    '      <alignment vertical="top" wrapText="1" />', '    </xf>',
    '    <xf numFmtId="0" applyNumberFormat="1" fontId="1" applyFont="1" xfId="0">',
    '      <alignment vertical="top" wrapText="1" />', '    </xf>',
    '    <xf numFmtId="164" applyNumberFormat="1" fontId="0" applyFont="1" xfId="0">',
    '      <alignment horizontal="left" vertical="top" />', '    </xf>',
    '    <xf numFmtId="164" applyNumberFormat="1" fontId="1" applyFont="1" xfId="0">',
    '      <alignment horizontal="left" vertical="top" />', '    </xf>',
    '    <xf numFmtId="164" applyNumberFormat="1" fontId="0" applyFont="1" xfId="0">',
    '      <alignment horizontal="left" />', '    </xf>',
    '    <xf numFmtId="164" applyNumberFormat="1" fontId="1" applyFont="1" xfId="0">',
    '      <alignment horizontal="left" />', '    </xf>',
    '    <xf numFmtId="0" applyNumberFormat="1" fontId="2" applyFont="1" xfId="0">',
    '      <alignment vertical="top" />', '    </xf>',
    '    <xf numFmtId="0" applyNumberFormat="1" fontId="3" applyFont="1" xfId="0">',
    '      <alignment vertical="top" />', '    </xf>',
    '    <xf numFmtId="0" applyNumberFormat="1" fontId="4" applyFont="1" fillId="2" applyFill="1" xfId="0">',
    '      <alignment vertical="top" wrapText="1" />', '    </xf>',
    '    <xf numFmtId="164" applyNumberFormat="1" fontId="4" applyFont="1" fillId="2" applyFill="1" xfId="0">',
    '      <alignment horizontal="left" vertical="top" />', '    </xf>',
    '    <xf numFmtId="0" applyNumberFormat="1" fontId="1" applyFont="1" borderId="1" applyBorder="1" xfId="0">',
    '      <alignment vertical="top" wrapText="1" />', '    </xf>',
    '    <xf numFmtId="0" applyNumberFormat="1" fontId="4" applyFont="1" xfId="0">',
    '      <alignment vertical="top" wrapText="1" />', '    </xf>',
    '    <xf numFmtId="0" applyNumberFormat="1" fontId="4" applyFont="1" borderId="1" applyBorder="1" xfId="0">',
    '      <alignment vertical="top" wrapText="1" />', '    </xf>',
    '    <xf numFmtId="164" applyNumberFormat="1" fontId="4" applyFont="1" borderId="1" applyBorder="1" xfId="0">',
    '      <alignment horizontal="left" vertical="top" />', '    </xf>',
    '    <xf numFmtId="0" applyNumberFormat="1" fontId="5" applyFont="1" fillId="3" applyFill="1" xfId="0">',
    '      <alignment vertical="top" wrapText="1" />', '    </xf>',
    '    <xf numFmtId="164" applyNumberFormat="1" fontId="5" applyFont="1" fillId="3" applyFill="1" xfId="0">',
    '      <alignment horizontal="left" vertical="top" />', '    </xf>',
    '  </cellXfs>',
    '  <cellStyles count="1">',
    '    <cellStyle name="Normal" xfId="0" builtinId="0" />',
    '  </cellStyles>',
    '  <dxfs count="0" />',
    '</styleSheet>',
  ];
  return L.join('\r\n');
}

export const MS_WORKBOOK_XML = [
  '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  '  <bookViews>',
  '    <workbookView />',
  '  </bookViews>',
  '  <sheets>',
  '    <sheet name="Your Estimate" sheetId="1" r:id="rId1" />',
  '  </sheets>',
  '  <calcPr fullCalcOnLoad="1" />',
  '</workbook>',
].join('\r\n');

const MS_CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default ContentType="application/xml" Extension="xml"/>'
  + '<Default ContentType="application/vnd.openxmlformats-package.relationships+xml" Extension="rels"/>'
  + '<Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" PartName="/xl/workbook.xml" />'
  + '<Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" PartName="/xl/worksheets/sheet1.xml" />'
  + '<Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml" PartName="/xl/styles.xml" />'
  + '<Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml" PartName="/xl/sharedStrings.xml" />'
  + '</Types>';

const MS_ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
  + '</Relationships>';

const MS_WORKBOOK_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
  + '</Relationships>';

/** 모델 → xlsx 파트 모음(경로 → 문자열). 테스트는 이 단계에서 원본과 대조한다. */
export function buildMsEstimateParts(model) {
  const { sheet, sharedStrings } = buildMsSheetParts(model);
  return {
    '[Content_Types].xml': MS_CONTENT_TYPES,
    '_rels/.rels': MS_ROOT_RELS,
    'xl/workbook.xml': MS_WORKBOOK_XML,
    'xl/_rels/workbook.xml.rels': MS_WORKBOOK_RELS,
    'xl/worksheets/sheet1.xml': sheet,
    'xl/styles.xml': buildMsStylesXml(model.currency),
    'xl/sharedStrings.xml': sharedStrings,
  };
}

// ── 최소 ZIP(무압축 stored) ──────────────────────────────────────────────
// xlsx 는 압축 방식이 stored 여도 Excel/LibreOffice/SheetJS 가 그대로 연다.
// 압축 라이브러리를 끌어오지 않으려고 저장 방식만 쓴다(견적 파일은 1MB 안팎).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param files {name: string} → 문자열. 출력은 결정적(타임스탬프 고정)이다. */
export function zipStore(files) {
  const enc = new TextEncoder();
  const entries = Object.keys(files).map((name) => {
    const data = enc.encode(files[name]);
    return { nameBytes: enc.encode(name), data, crc: crc32(data) };
  });

  const LOCAL = 30, CENTRAL = 46, EOCD = 22;
  let localSize = 0, centralSize = 0;
  for (const e of entries) {
    localSize += LOCAL + e.nameBytes.length + e.data.length;
    centralSize += CENTRAL + e.nameBytes.length;
  }
  const out = new Uint8Array(localSize + centralSize + EOCD);
  const dv = new DataView(out.buffer);
  let off = 0;
  const w16 = (v) => { dv.setUint16(off, v, true); off += 2; };
  const w32 = (v) => { dv.setUint32(off, v >>> 0, true); off += 4; };
  const wb = (b) => { out.set(b, off); off += b.length; };

  for (const e of entries) {
    e.offset = off;
    w32(0x04034b50); w16(20); w16(0); w16(0);   // 서명 · 버전 · 플래그 · 방식(0=stored)
    w16(0); w16(0x0021);                        // 시각 0, 날짜 1980-01-01 (결정적 출력)
    w32(e.crc); w32(e.data.length); w32(e.data.length);
    w16(e.nameBytes.length); w16(0);
    wb(e.nameBytes); wb(e.data);
  }
  const centralStart = off;
  for (const e of entries) {
    w32(0x02014b50); w16(20); w16(20); w16(0); w16(0);
    w16(0); w16(0x0021);
    w32(e.crc); w32(e.data.length); w32(e.data.length);
    w16(e.nameBytes.length); w16(0); w16(0); w16(0); w16(0); w32(0);
    w32(e.offset);
    wb(e.nameBytes);
  }
  const centralEnd = off;   // EOCD 를 쓰기 전에 고정 — 쓰는 도중의 off 를 쓰면 크기가 부풀어 깨진다
  w32(0x06054b50); w16(0); w16(0);
  w16(entries.length); w16(entries.length);
  w32(centralEnd - centralStart); w32(centralStart); w16(0);
  return out;
}

/** 모델 → xlsx 바이트. */
export function buildMsEstimateXlsx(model) {
  return zipStore(buildMsEstimateParts(model));
}
