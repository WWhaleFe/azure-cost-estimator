// ================================================================
// services/sentinel.js — Microsoft Sentinel (SIEM 데이터 분석)
//
//   전용 resolver(_resolve_Microsoft_Sentinel)로 과금 모델별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Sentinel'.
//   API 구조(koreacentral): productName='Sentinel'. 과금 모델(skuName/meterName):
//     - Pay-as-you-go → skuName='Pay-as-you-go', meter 'Pay-as-you-go Analysis' (1 GB, 5.81)
//                       usage 칸에 분석 데이터 GB 입력
//     - Basic Logs    → skuName='Basic Logs', meter 'Basic Logs Analysis' (1 GB, 1.18)
//     - <N> GB Commitment Tier → skuName='<N> GB Commitment Tier',
//                       meter '<N> GB Commitment Tier Capacity Reservation' (1/Day)
//                       usage 칸에 일수(예 30) 입력 → 월=일단가×Qty×일수
//   월=단가×Qty×usage(엔진 기본). 절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외(매칭 실패 정상): Free Trial, M365 Defender 무료 혜택, SAP 솔루션, Classic Auxiliary Logs.
// ================================================================

var _SENTINEL_MODELS = [
  'Pay-as-you-go', 'Basic Logs',
  '100 GB Commitment Tier', '200 GB Commitment Tier', '300 GB Commitment Tier',
  '400 GB Commitment Tier', '500 GB Commitment Tier', '1000 GB Commitment Tier',
  '2000 GB Commitment Tier', '5000 GB Commitment Tier', '10000 GB Commitment Tier',
];

window._svcDefs['Microsoft Sentinel'] = {
  apiServiceName: 'Sentinel',
  steps: [
    { key:'model', label:'과금 모델', options: _SENTINEL_MODELS.slice() },
  ],
  instanceField: false,
};
window['_buildDetail_Microsoft_Sentinel'] = function(r) {
  var o = r.options || {};
  r.skuName = o.model || '';
  r.detail = o.model || '';
};

// 가격 조회 — productName='Sentinel' 안에서 skuName(과금 모델) 정확 일치
window['_resolve_Microsoft_Sentinel'] = async function(row, cur) {
  var o = row.options || {};
  var model = o.model || 'Pay-as-you-go';
  var label = 'Sentinel / ' + model;

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Sentinel', armRegionName:row.region, productName:'Sentinel', priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:30});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Sentinel 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var target = model.toLowerCase();
  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    return String(it.skuName||'').toLowerCase() === target;
  }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var note = (model.indexOf('Commitment') >= 0) ? ' (usage=일수, 예 30)' : ' (usage=GB)';
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + note);
  updatePriceCells(row); updateTotalsRow();
};
