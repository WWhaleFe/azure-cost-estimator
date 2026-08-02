import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/azure-devops.js — Azure DevOps (사용자 라이선스·파이프라인)
//
//   전용 resolver(_resolve_Azure_DevOps)로 요금제별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Azure DevOps'.
//   API 구조(리전 비종속 — armRegionName 필터 없이 조회): productName별 분리:
//     - Basic Plan 사용자     → 'Azure Repos and Boards (Basic)', meter 'Basic User' (1/Month, 6.0)
//                               첫 5명 무료 한도는 미반영
//     - Advanced 사용자       → 'Azure Repos and Boards', meter 'Advanced User' (1/Month, 60.0)
//     - Test Plans 사용자     → 'Azure Test Plans', meter 'Standard User' (1/Month, 52.0)
//     - Artifacts 저장소 (GB) → 'Azure Artifacts', meter 'Standard Data Stored' (1 GB/Month, 2.0)
//                               첫 2GB 무료 한도는 미반영
//     - MS-hosted 병렬 작업   → 'Azure Pipelines', meter 'Microsoft-hosted CI/CD Concurrent Job'
//                               (1/Month, 40.0) — 무료 1개(공개 프로젝트 기준 상이) 미반영
//     - Self-hosted 병렬 작업 → 'Azure Pipelines', meter 'Self-hosted CI/CD Concurrent Job'
//                               (1/Month, 15.0)
//   월=단가×Qty×usage(엔진 기본). 월 단위 과금 → usage 칸에 1, Qty=사용자/작업/GB 수
//   (Artifacts는 usage 칸에 GB도 가능 — Qty×usage 곱이므로 동일).
//   절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외: GitHub Advanced Security, Linux/Windows/macOS 분당 과금 Job, 부하 테스트.
// ================================================================

// 요금제 → productName / meterName 정확 일치 타깃
var _DEVOPS_PLANS: Record<string, { prod: string; meter: string }> = {
  'Basic Plan 사용자 (월)':        { prod:'Azure Repos and Boards (Basic)', meter:'basic user' },
  'Advanced 사용자 (월)':          { prod:'Azure Repos and Boards',         meter:'advanced user' },
  'Test Plans 사용자 (월)':        { prod:'Azure Test Plans',               meter:'standard user' },
  'Artifacts 저장소 (GB/월)':      { prod:'Azure Artifacts',                meter:'standard data stored' },
  'MS-hosted 병렬 작업 (월)':      { prod:'Azure Pipelines',                meter:'microsoft-hosted ci/cd concurrent job' },
  'Self-hosted 병렬 작업 (월)':    { prod:'Azure Pipelines',                meter:'self-hosted ci/cd concurrent job' },
};

REG._svcDefs['Azure DevOps'] = {
  apiServiceName: 'Azure DevOps',
  steps: [
    { key:'plan', label:'요금제', options: Object.keys(_DEVOPS_PLANS) },
  ],
  instanceField: false,
};
REG['_buildDetail_Azure_DevOps'] = function(r: Row) {
  var o = r.options || {};
  r.skuName = o.plan ? o.plan.replace(/\s*\(.*\)$/, '') : '';
  r.detail = ['Azure DevOps', o.plan].filter(Boolean).join(' / ');
};

// 가격 조회 — productName + meterName 정확 일치 (리전 비종속)
REG['_resolve_Azure_DevOps'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var plan = o.plan || 'Basic Plan 사용자 (월)';
  var conf = _DEVOPS_PLANS[plan];
  var label = 'Azure DevOps / ' + plan;

  if (!conf) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 요금제를 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items: ApiItem[] = [];
  try {
    // Azure DevOps 미터는 리전 비종속 — armRegionName 필터 없이 조회
    items = await apiFetch({ serviceName:'Azure DevOps', productName:conf.prod, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:20});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure DevOps 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    return String(it.meterName||'').toLowerCase() === conf.meter;
  }).sort(function(a: ApiItem, b: ApiItem){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + ' (usage=1, Qty=수량 · 무료 한도 미반영)');
  updatePriceCells(row); updateTotalsRow();
};
