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
//
// [v128] 무료 허용량 차감
//   Azure DevOps 는 조직마다 무료 한도가 있는데 Retail Prices API 단가에는 그게 없다
//   (Basic 사용자 8,684.1원/명 단일 단가). 그대로 곱하면 실제 청구액보다 많이 나온다.
//   예) Basic 10명 → API 그대로면 86,841원이지만 첫 5명이 무료라 실제는 43,420.5원.
//   그래서 요금제별 무료 수량을 표로 두고 paygItem._freeUnits 로 실어 보낸다
//   (과금 수량 = max(0, Qty×Hours − 무료 수량) — 계산은 calcGroup 이 한다).
//   무료 한도는 조직 단위라 이미 다른 프로젝트에서 쓰고 있다면 차감하면 안 된다.
//   그래서 freeTier 옵션으로 끌 수 있게 했다(기본은 차감).
// ================================================================

// 요금제 → productName / meterName 정확 일치 타깃 + 무료 수량(free, 없으면 0)
//   free 출처: Azure DevOps 요금제 공시(조직당 Basic 5명, MS-hosted 병렬 1개,
//   Self-hosted 병렬 1개, Artifacts 2GB). 사용자 수·작업 수·GB 기준.
var _DEVOPS_PLANS: Record<string, { prod: string; meter: string; free: number; freeNote: string }> = {
  'Basic Plan 사용자 (월)':        { prod:'Azure Repos and Boards (Basic)', meter:'basic user',                             free:5, freeNote:'첫 5명 무료' },
  'Advanced 사용자 (월)':          { prod:'Azure Repos and Boards',         meter:'advanced user',                          free:0, freeNote:'' },
  'Test Plans 사용자 (월)':        { prod:'Azure Test Plans',               meter:'standard user',                          free:0, freeNote:'' },
  'Artifacts 저장소 (GB/월)':      { prod:'Azure Artifacts',                meter:'standard data stored',                   free:2, freeNote:'첫 2GB 무료' },
  'MS-hosted 병렬 작업 (월)':      { prod:'Azure Pipelines',                meter:'microsoft-hosted ci/cd concurrent job',  free:1, freeNote:'첫 1개 무료' },
  'Self-hosted 병렬 작업 (월)':    { prod:'Azure Pipelines',                meter:'self-hosted ci/cd concurrent job',       free:1, freeNote:'첫 1개 무료' },
};

var _DEVOPS_FREE_ON = '차감 (조직 무료 한도 적용)';
var _DEVOPS_FREE_OFF = '미차감 (전량 과금)';

REG._svcDefs['Azure DevOps'] = {
  apiServiceName: 'Azure DevOps',
  steps: [
    { key:'plan', label:'요금제', options: Object.keys(_DEVOPS_PLANS) },
    { key:'freeTier', label:'무료 한도', options:[_DEVOPS_FREE_ON, _DEVOPS_FREE_OFF],
      tooltip:'무료 한도는 Azure DevOps 조직 단위입니다. 같은 조직의 다른 프로젝트가 이미 쓰고 있다면 미차감을 고르세요.' },
  ],
  instanceField: false,
};
REG['_buildDetail_Azure_DevOps'] = function(r: Row) {
  var o = r.options || {};
  var conf = _DEVOPS_PLANS[o.plan || ''];
  var free = (conf && conf.free && (o.freeTier || _DEVOPS_FREE_ON) === _DEVOPS_FREE_ON) ? conf.freeNote : '';
  r.skuName = o.plan ? o.plan.replace(/\s*\(.*\)$/, '') : '';
  r.detail = ['Azure DevOps', o.plan, free].filter(Boolean).join(' / ');
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

  // 매칭 미터 + 무료 허용량 → 엔진 계산(월=단가×max(0, Qty×usage − 무료)). 절약/예약 미적용.
  var useFree = (o.freeTier || _DEVOPS_FREE_ON) === _DEVOPS_FREE_ON;
  var free = useFree ? conf.free : 0;
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur, _freeUnits: free });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var freeMsg = conf.free
    ? (free ? ' · ' + conf.freeNote + ' 차감' : ' · ' + conf.freeNote + ' 이지만 미차감 선택')
    : ' · 무료 한도 없음';
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + ' (usage=1, Qty=수량)' + freeMsg);
  updatePriceCells(row); updateTotalsRow();
};
