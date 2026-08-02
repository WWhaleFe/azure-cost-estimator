import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
// ================================================================
// services/private-link.js — Azure Private Link (프라이빗 엔드포인트)
//
//   전용 resolver(_resolve_Azure_Private_Link)로 청구 항목별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회).
//   API 구조: serviceName='Virtual Network', productName='Virtual Network Private Link',
//     armRegionName='Global'(리전 비종속 — koreacentral엔 미터가 없음), skuName='Standard'.
//     - 프라이빗 엔드포인트(시간당): 'Standard Private Endpoint' (1 Hour, 0.01)
//     - 데이터 처리 Inbound (GB)  : 'Standard Data Processed - Ingress' (1 GB, 계단형 0.01→0.006→0.004)
//     - 데이터 처리 Outbound (GB) : 'Standard Data Processed - Egress' (1 GB, 계단형 동일)
//   데이터 처리는 첫 구간(tierMinimumUnits 최소, 1PB 이하) 단가를 대표값으로 사용
//   → 대용량(1PB+) 할인 미반영. 월=단가×Qty×usage(엔진 기본).
//   엔드포인트는 usage 칸에 시간(예 730), Qty=엔드포인트 수. 데이터는 usage 칸에 GB.
//   절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외: Service Endpoint(서비스 엔드포인트) 미터, Private Link Service 자체 요금(무료).
// ================================================================

// 청구 항목 → meterName 정확 일치 타깃(소문자)
var _PLINK_METER = {
  '프라이빗 엔드포인트 (시간당)':  'standard private endpoint',
  '데이터 처리 - Inbound (GB)':   'standard data processed - ingress',
  '데이터 처리 - Outbound (GB)':  'standard data processed - egress',
};

REG._svcDefs['Azure Private Link'] = {
  apiServiceName: 'Virtual Network',
  steps: [
    { key:'metric', label:'청구 항목', options: Object.keys(_PLINK_METER) },
  ],
  instanceField: false,
};
REG['_buildDetail_Azure_Private_Link'] = function(r) {
  var o = r.options || {};
  r.skuName = 'Private Link';
  r.detail = ['Private Link', o.metric].filter(Boolean).join(' / ');
};

// 가격 조회 — productName='Virtual Network Private Link'(Global) + meterName 정확 일치
REG['_resolve_Azure_Private_Link'] = async function(row, cur) {
  var o = row.options || {};
  var metric = o.metric || '프라이빗 엔드포인트 (시간당)';
  var target = _PLINK_METER[metric];
  var label = 'Private Link / ' + metric;

  if (!target) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 청구 항목을 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items = [];
  try {
    // Private Link 미터는 리전 비종속(armRegionName='Global') — row.region이 아닌 Global로 조회
    items = await apiFetch({ serviceName:'Virtual Network', armRegionName:'Global', productName:'Virtual Network Private Link', priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:20});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Private Link 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    return String(it.meterName||'').toLowerCase() === target;
  });
  // 데이터 처리는 계단형 — 첫 구간(tierMinimumUnits 최소) 단가를 대표값으로
  cands.sort(function(a,b){ return (Number(a.tierMinimumUnits||0) - Number(b.tierMinimumUnits||0)) || (Number(a.unitPrice||0) - Number(b.unitPrice||0)); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var note = metric.indexOf('엔드포인트') >= 0 ? ' (usage=시간, Qty=엔드포인트 수)' : ' (usage=GB, 대용량 할인 미반영)';
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + note);
  updatePriceCells(row); updateTotalsRow();
};
