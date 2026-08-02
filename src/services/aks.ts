import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/aks.js — Azure Kubernetes Service (AKS) 클러스터 관리 요금
//   이 행은 "클러스터 관리(컨트롤 플레인) 요금"만 계산합니다.
//   노드(워커 VM)와 디스크는 기존 Virtual Machine / Disk 행으로 따로 추가하세요.
//
//   계층(aksTier):
//     - Standard(표준): SLA 옵션을 추가로 선택
//         · No SLA (free, non-production) : 무료 (0)
//         · SLA                            : 클러스터당 시간당 요금(표준 SLA) API 조회
//         · SLA and Long Term Support      : 클러스터당 시간당 요금(LTS) API 조회
//     - Automatic: Azure가 인프라를 자동 운영하는 모드. 클러스터 관리 요금은
//         Automatic 전용 미터(Automatic Hosted Control Plane)를 API로 조회합니다.
//         노드는 컴퓨팅 사용량 기준으로 별도 청구되므로 VM 행으로 따로 추가하세요.
//
//   모든 요금은 Azure Retail Prices API에서 실시간 조회합니다(가격 하드코딩 없음).
//   절약 플랜 / 예약은 클러스터 관리 요금에 적용되지 않으므로 비웁니다.
// ================================================================

// 카테고리 정의 등록
REG._svcDefs['Azure Kubernetes Service'] = {
  apiServiceName: 'Azure Kubernetes Service',
  steps: [
    { key:'aksTier',    label:'계층',    options:['Standard (표준)','Automatic'] },
    { key:'slaOption',  label:'Options', options:['No SLA (free, non-production)','SLA','SLA and Long Term Support'] },
  ],
  instanceField: false,
  // 계층(aksTier) 변경 시 옵션 패널을 다시 그려 SLA 옵션 노출 여부를 갱신
  instanceParentKey: 'aksTier',
  // 패널을 그리기 직전 현재 행 기준으로 SLA 옵션 표시/숨김을 재평가(여러 AKS 행 전환 대비)
  _applyStepVisibility: function(r: Row){ if (REG['_aks_applyStepVisibility']) REG['_aks_applyStepVisibility'](r); },
};

// 계층에 따라 SLA 옵션 표시/숨김 토글 (Standard일 때만 노출)
REG['_aks_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Azure Kubernetes Service'];
  if (!def || !def.steps) return;
  var tier = (r.options && r.options.aksTier) || 'Standard (표준)';
  var isStandard = tier.indexOf('Standard') === 0 || tier.indexOf('표준') >= 0;
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key === 'slaOption') def.steps[i]._hidden = !isStandard;
  }
};

// detail 빌더
REG['_buildDetail_Azure_Kubernetes_Service'] = function(r: Row) {
  var o = r.options || {};
  var tier = o.aksTier || 'Standard (표준)';
  REG['_aks_applyStepVisibility'](r);
  var isStandard = tier.indexOf('Standard') === 0 || tier.indexOf('표준') >= 0;
  var parts = ['클러스터 관리'];
  if (isStandard) {
    var sla = o.slaOption || 'No SLA (free, non-production)';
    r.skuName = 'Standard';
    parts.push('표준 / ' + sla);
  } else {
    r.skuName = 'Automatic';
    parts.push('Automatic (자동 운영)');
  }
  parts.push('노드 VM/디스크는 별도 행으로 추가');
  r.detail = parts.join(', ');
};

// 응답에서 등급에 맞는 시간당 클러스터 관리 요금 1건 선택
//   grade: 'standard'(표준 SLA) / 'premium'(LTS) / 'automatic'(Automatic 관리요금)
//   standard : 'Standard Uptime SLA' 계열, LTS/Long Term 제외
//   premium  : 'Standard Long Term Support'(LTS) 계열
//   automatic: productName "...- Automatic" + meterName "...Control Plane"
//              (Automatic의 General Purpose/GPU 등 컴퓨팅 미터는 제외)
REG['_aks_pickGradeHourly'] = function(items: ApiItem[], grade: string) {
  var cands = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (String(it.type || '').toLowerCase() !== 'consumption') continue;
    var uom = String(it.unitOfMeasure || '').toLowerCase();
    if (uom.indexOf('hour') < 0) continue;
    var price = Number(it.unitPrice);
    if (!isFinite(price) || price <= 0) continue;
    var meter = String(it.meterName || '').toLowerCase();
    var prod  = String(it.productName || '').toLowerCase();
    var blob  = (meter + ' ' + String(it.skuName || '') + ' ' + prod);

    // Automatic 관리요금(컨트롤 플레인) 경로: 컴퓨팅 미터와 분리해서 선택
    if (grade === 'automatic') {
      var isAutoProd = prod.indexOf('automatic') >= 0;
      var isControlPlane = meter.indexOf('control plane') >= 0;
      if (!isAutoProd || !isControlPlane) continue;
      cands.push({ price: price, item: it });
      continue;
    }

    // Standard / LTS 경로: 클러스터 관리(컨트롤 플레인) 시간당 요금만
    //   LTS 미터명("Standard Long Term Support")에는 cluster/management/uptime/sla가
    //   없으므로 long term 키워드도 게이트에 포함해야 누락되지 않는다.
    var looksCluster = blob.indexOf('cluster') >= 0 || blob.indexOf('management') >= 0
                    || blob.indexOf('uptime') >= 0 || blob.indexOf('sla') >= 0
                    || blob.indexOf('long term') >= 0 || blob.indexOf('long-term') >= 0;
    if (!looksCluster) continue;
    var isPremium = blob.indexOf('premium') >= 0 || blob.indexOf('lts') >= 0
                 || blob.indexOf('long term') >= 0 || blob.indexOf('long-term') >= 0;
    var isStandard = blob.indexOf('standard') >= 0;
    if (grade === 'premium') {
      if (!isPremium) continue;
    } else {
      if (isPremium) continue;
      if (!isStandard && blob.indexOf('uptime') < 0 && blob.indexOf('sla') < 0) continue;
    }
    cands.push({ price: price, item: it });
  }
  if (cands.length === 0) return null;
  // 같은 등급 내에서는 가장 낮은 단가 채택(중복/지역 변형 대비)
  cands.sort(function(a, b){ return a.price - b.price; });
  return cands[0].item;
};

// 가격 조회
REG['_resolve_Azure_Kubernetes_Service'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var tier = o.aksTier || 'Standard (표준)';
  var isStandard = tier.indexOf('Standard') === 0 || tier.indexOf('표준') >= 0;
  var qty = Number(row.qty) || 0;
  var usage = Number(row.usage) || 0;

  // 표준 + No SLA: 관리 요금 무료. 가짜 가격을 만들지 않고 0원 항목으로 표시.
  var sla = o.slaOption || 'No SLA (free, non-production)';
  if (isStandard && sla.indexOf('No SLA') === 0) {
    row.paygItem = {
      unitPrice: 0, retailPrice: 0, unitOfMeasure: '1 Hour',
      meterName: 'AKS Standard (No SLA) cluster management', skuName: 'Standard',
      productName: 'Azure Kubernetes Service', serviceName: 'Azure Kubernetes Service',
      currencyCode: cur,
    };
    row.sp1Item = null; row.sp3Item = null; row.ri1Item = null; row.ri3Item = null;
    setStatus('ok', 'AKS 표준(No SLA): 클러스터 관리 무료 (노드 VM/디스크는 별도 행)');
    updatePriceCells(row); updateTotalsRow();
    return;
  }

  // 조회할 등급 결정
  //   Automatic                        → automatic 미터(Automatic Hosted Control Plane)
  //   표준 + SLA and Long Term Support → premium 미터(LTS)
  //   표준 + SLA                       → standard 미터
  var grade;
  if (!isStandard) grade = 'automatic';
  else if (sla.indexOf('Long Term') >= 0) grade = 'premium';
  else grade = 'standard';

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Azure Kubernetes Service', armRegionName:row.region, priceType:'Consumption' }, cur, 500, 3);
  } catch (err: any) {
    row.paygItem = null; row.sp1Item = null; row.sp3Item = null; row.ri1Item = null; row.ri3Item = null;
    setStatus('error', 'AKS 조회 실패: ' + String(err.message).slice(0, 80));
    updatePriceCells(row); updateTotalsRow();
    return;
  }

  var chosen = REG['_aks_pickGradeHourly'](items, grade);
  // 1차 실패 시 리전 비종속으로 한 번 더 시도 (관리 요금은 보통 지역 공통)
  if (!chosen) {
    try {
      var all = await apiFetch({ serviceName:'Azure Kubernetes Service', priceType:'Consumption' }, cur, 1000, 5);
      chosen = REG['_aks_pickGradeHourly'](all, grade);
    } catch (e2) { /* 무시: 아래에서 미매칭 처리 */ }
  }

  var label = isStandard ? ('표준 / ' + sla) : 'Automatic';
  if (!chosen) {
    row.paygItem = null; row.sp1Item = null; row.sp3Item = null; row.ri1Item = null; row.ri3Item = null;
    setStatus('error', 'AKS ' + label + ': 클러스터 관리 요금 매칭 실패 (' + items.length + '건). 다른 리전/옵션을 확인하세요.');
    updatePriceCells(row); updateTotalsRow();
    return;
  }

  // 클러스터당 시간당 요금 → 월(=시간당 × usage × qty)로 환산, 시간환산 단가로 표시
  var hourly = Number(chosen.unitPrice);
  var monthly = hourly * usage * qty;
  var hEq = (qty > 0 && usage > 0) ? (monthly / 730) : hourly;
  row.paygItem = Object.assign({}, chosen, {
    unitPrice: hEq, retailPrice: hEq, unitOfMeasure: '1 Hour (equivalent)',
    _billingMode: 'monthly', _monthlyTotal: monthly, _clusterHourly: hourly,
  });
  // 절약/예약은 클러스터 관리 요금에 적용되지 않음
  row.sp1Item = null; row.sp3Item = null; row.ri1Item = null; row.ri3Item = null;

  var autoNote = isStandard ? '' : ' · Automatic 노드는 컴퓨팅 사용량 기준 별도 청구';
  setStatus('ok', 'AKS ' + label + ' 완료 · 클러스터 관리 ' + hourly.toFixed(4) + '/h (노드 VM/디스크는 별도 행)' + autoNote);
  updatePriceCells(row); updateTotalsRow();
};
