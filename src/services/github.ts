import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, pickTieredMeter, tierNote } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/github.ts — GitHub (Enterprise·Copilot·Advanced Security·Actions·Storage)
//
//   전용 resolver(_resolve_GitHub). 가격 하드코딩 없음(Azure Retail Prices API 실시간 조회).
//   serviceName='GitHub'. 미터는 **리전 비종속(armRegionName='Global')** 이라 리전 필터 없이 조회하고
//   row.region 은 무시한다(Azure DevOps 와 같은 방식).
//   productName 이 제품군, meterName 이 세부 항목이다.
//
//   요금제(노출명) → productName / meterName
//     GitHub Enterprise 사용자 (월)      GitHub Enterprise (GHE)      Enterprise User          1/Month
//     Copilot Business 사용자 (월)       GitHub Copilot               Business User            1/Month
//     Copilot Enterprise 사용자 (월)     GitHub Copilot               Enterprise User          1/Month
//     Copilot Premium 요청 (건)          GitHub Copilot               Premium Request          1
//     Advanced Security 커미터 (월)      GitHub Advanced Security GHE Advanced Security GHE Committer
//     Code Scanning 커미터 (월)          GitHub Advanced Security GHE Code Scanning for GHE Committer
//     Secret Scanning 커미터 (월)        GitHub Advanced Security GHE Secret Scanning for GHE Committer
//     Code Quality 커미터 (월)           GitHub Code Quality          Code Quality for GHE Committer
//     Actions Linux 실행 (분)            GitHub Actions               Linux Overage            1 Minute
//     Actions Windows 실행 (분)          GitHub Actions               Windows Overage          1 Minute
//     Actions macOS 실행 (분)            GitHub Actions               macOS Overage            1 Minute
//     Actions 저장소 (GiB/월)            GitHub Storage               Actions Storage
//     Packages 저장소 (GB/월)            GitHub Storage               Packages Storage Overage
//     LFS 저장소 (GiB/월)                GitHub Storage               LFS Storage
//     Codespaces 저장소 (GiB/월)         GitHub Storage               Codespaces Storage
//     Codespaces D2/D4/D8/D16 (시간)     GitHub Codespaces - Linux    Development Optimized D<N>
//     데이터 전송 - Actions (GiB)        GitHub Bandwidth             Action Data Transfer Out
//     데이터 전송 - LFS (GiB)            GitHub Bandwidth             LFS Data Transfer Out
//
//   월=단가×Qty×usage(엔진 기본).
//     · 사용자/커미터 월정액 → usage=1, Qty=인원 수
//     · Actions 실행 분     → usage=월 실행 분(무료 포함 분은 반영하지 않음)
//     · 저장소/전송         → usage=GB(GiB)
//     · Codespaces          → usage=월 사용시간
//   절약/예약 미적용(사전 구매 플랜 GCU/GHAICCU 는 범위 외).
//   범위 외: GitHub Actions 의 대형 러너 SKU(B/HP/GPU 등 개별 Job 미터), Azure DevOps 향
//           Advanced Security(별도 카테고리 Azure DevOps 참고), AI Credit·Sandbox 컴퓨트.
// ================================================================

var _GH_PLANS: Record<string, { prod: string; meter: string }> = {
  'GitHub Enterprise 사용자 (월)':   { prod:'GitHub Enterprise (GHE)',      meter:'enterprise user' },
  'Copilot Business 사용자 (월)':    { prod:'GitHub Copilot',               meter:'business user' },
  'Copilot Enterprise 사용자 (월)':  { prod:'GitHub Copilot',               meter:'enterprise user' },
  'Copilot Premium 요청 (건)':       { prod:'GitHub Copilot',               meter:'premium request' },
  'Advanced Security 커미터 (월)':   { prod:'GitHub Advanced Security GHE', meter:'advanced security ghe committer' },
  'Code Scanning 커미터 (월)':       { prod:'GitHub Advanced Security GHE', meter:'code scanning for ghe committer' },
  'Secret Scanning 커미터 (월)':     { prod:'GitHub Advanced Security GHE', meter:'secret scanning for ghe committer' },
  'Code Quality 커미터 (월)':        { prod:'GitHub Code Quality',          meter:'code quality for ghe committer' },
  'Actions Linux 실행 (분)':         { prod:'GitHub Actions',               meter:'linux overage' },
  'Actions Windows 실행 (분)':       { prod:'GitHub Actions',               meter:'windows overage' },
  'Actions macOS 실행 (분)':         { prod:'GitHub Actions',               meter:'macos overage' },
  'Actions 저장소 (GiB/월)':         { prod:'GitHub Storage',               meter:'actions storage' },
  'Packages 저장소 (GB/월)':         { prod:'GitHub Storage',               meter:'packages storage overage' },
  'LFS 저장소 (GiB/월)':             { prod:'GitHub Storage',               meter:'lfs storage' },
  'Codespaces 저장소 (GiB/월)':      { prod:'GitHub Storage',               meter:'codespaces storage' },
  'Codespaces D2 (시간)':            { prod:'GitHub Codespaces - Linux',    meter:'development optimized d2' },
  'Codespaces D4 (시간)':            { prod:'GitHub Codespaces - Linux',    meter:'development optimized d4' },
  'Codespaces D8 (시간)':            { prod:'GitHub Codespaces - Linux',    meter:'development optimized d8' },
  'Codespaces D16 (시간)':           { prod:'GitHub Codespaces - Linux',    meter:'development optimized d16' },
  '데이터 전송 - Actions (GiB)':     { prod:'GitHub Bandwidth',             meter:'action data transfer out' },
  '데이터 전송 - LFS (GiB)':         { prod:'GitHub Bandwidth',             meter:'lfs data transfer out' },
};

REG._svcDefs['GitHub'] = {
  apiServiceName: 'GitHub',
  steps: [
    { key:'plan', label:'요금제', options:Object.keys(_GH_PLANS), tooltip:'GitHub 미터는 리전 비종속(Global)이라 Region 선택은 가격에 영향을 주지 않습니다.' },
  ],
  instanceField: false,
};

REG['_buildDetail_GitHub'] = function(r: Row) {
  var o = r.options || {};
  r.skuName = o.plan ? o.plan.replace(/\s*\(.*\)$/, '') : '';
  r.detail = ['GitHub', o.plan].filter(Boolean).join(' / ');
};

// 가격 조회 — productName + meterName 정확 일치 (리전 비종속: armRegionName 필터 없음)
REG['_resolve_GitHub'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var plan = o.plan || Object.keys(_GH_PLANS)[0];
  var conf = _GH_PLANS[plan];
  var label = 'GitHub / ' + plan;

  if (!conf) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 요금제를 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'GitHub', productName:conf.prod, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:20});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'GitHub 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    return String(it.meterName||'').toLowerCase() === conf.meter;
  });
  var chosen = pickTieredMeter(cands);

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var perMonth = String(chosen.unitOfMeasure||'').indexOf('/Month') >= 0;
  var note = perMonth ? ' (usage=1, Qty=인원·건수 · 무료 한도 미반영)' : ' (usage=사용량 · 무료 한도 미반영)';
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + tierNote(chosen) + note);
  updatePriceCells(row); updateTotalsRow();
};
