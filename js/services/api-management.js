// ================================================================
// services/api-management.js — API Management
//
//   전용 resolver(_resolve_API_Management)로 계층별 유닛 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='API Management'.
//   API 구조(koreacentral): productName='API Management', skuName=계층.
//     - 유닛 계층(시간당): meter '<계층> Unit' (1 Hour)
//         Developer 0.0658 / Basic 0.2016 / Standard 0.9407 / Premium 3.829
//         Basic v2 0.20548 / Standard v2 0.9589 / Premium v2 3.83562
//     - Self-hosted Gateway: skuName='Gateway', meter 'Gateway Unit' (1 Hour, 0.342466)
//     - Consumption: skuName='Consumption', meter 'Consumption Calls' (10K 콜 단위,
//         첫 구간 0.0 무료 — 유료(>0) 구간 단가 사용, 무료 100만 콜 한도는 미반영)
//   월=단가×Qty×usage(엔진 기본). 유닛 계층은 usage 칸에 시간(예 730), Qty=유닛 수.
//   Consumption은 usage 칸에 만(10K) 콜 수. 절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외: Workspace Pack, Workspace Gateway, Secondary Unit, Isolated.
// ================================================================

var _APIM_TIERS = [
  'Developer', 'Basic', 'Standard', 'Premium',
  'Basic v2', 'Standard v2', 'Premium v2',
  'Consumption', 'Self-hosted Gateway',
];

window._svcDefs['API Management'] = {
  apiServiceName: 'API Management',
  steps: [
    { key:'tier', label:'계층', options: _APIM_TIERS.slice() },
  ],
  instanceField: false,
};
window['_buildDetail_API_Management'] = function(r) {
  var o = r.options || {};
  r.skuName = o.tier || '';
  r.detail = ['API Management', o.tier].filter(Boolean).join(' / ');
};

// 가격 조회 — skuName=계층 + meterName '<계층> Unit' 정확 일치
window['_resolve_API_Management'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'Basic';
  var label = 'API Management / ' + tier;
  var isConsumption = tier === 'Consumption';
  var isGateway = tier === 'Self-hosted Gateway';

  var items = [];
  try {
    items = await apiFetch({ serviceName:'API Management', armRegionName:row.region, productName:'API Management', priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:30});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'API Management 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // (계층) → skuName / meterName 정확 일치 타깃(소문자)
  var skuTarget   = isGateway ? 'gateway' : tier.toLowerCase();
  var meterTarget = isConsumption ? 'consumption calls'
                  : isGateway     ? 'gateway unit'
                  :                 tier.toLowerCase() + ' unit';

  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== skuTarget) return false;
    return String(it.meterName||'').toLowerCase() === meterTarget;
  });
  // Consumption 콜은 계단형(첫 100만 콜 0.0 무료) — 유료(>0) 첫 구간 단가 사용
  if (isConsumption) {
    var paid = cands.filter(function(it){ return Number(it.unitPrice||0) > 0; });
    if (paid.length) cands = paid;
  }
  cands.sort(function(a,b){ return (Number(a.tierMinimumUnits||0) - Number(b.tierMinimumUnits||0)) || (Number(a.unitPrice||0) - Number(b.unitPrice||0)); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회). 이 리전에 해당 계층이 없을 수 있습니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var note = isConsumption ? ' (usage=만 콜, 무료 100만 콜 미반영)' : ' (usage=시간, Qty=유닛 수)';
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + note);
  updatePriceCells(row); updateTotalsRow();
};
