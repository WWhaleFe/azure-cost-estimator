// ================================================================
// services/azure-dns.js — Azure DNS (호스팅 영역·쿼리)
//
//   전용 resolver(_resolve_Azure_DNS)로 영역 종류×청구 항목 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Azure DNS'.
//   API 구조(리전 비종속 — armRegionName은 ''/'Zone 1'~'Zone 4'/Gov 존):
//     productName='Azure DNS', skuName=Public/Private.
//     - 호스팅 영역(월)   : meter '<종류> Zone' (단위 1, 0.5/월) — 첫 25개 영역 단가.
//                           26개 이상 할인(0.1) 미반영. usage 칸에 1, Qty=영역 수
//     - DNS 쿼리(백만)    : meter '<종류> Queries' (1M, 0.4) — 첫 10억 쿼리 단가.
//                           초과 할인 미반영. usage 칸에 백만 쿼리 수
//   Gov 존('US Gov'/'DE Gov')은 제외하고 armRegionName=''(공통) → 'Zone 1' 순으로 선택.
//   월=단가×Qty×usage(엔진 기본). 절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외: Record Set(구형 과금), DNS Security Policy, Private Resolver(엔드포인트/룰셋).
// ================================================================

window._svcDefs['Azure DNS'] = {
  apiServiceName: 'Azure DNS',
  steps: [
    { key:'zoneType', label:'영역 종류', options:['Public','Private'] },
    { key:'metric',   label:'청구 항목', options:['호스팅 영역 (월)','DNS 쿼리 (백만)'] },
  ],
  instanceField: false,
};
window['_buildDetail_Azure_DNS'] = function(r) {
  var o = r.options || {};
  r.skuName = o.zoneType || '';
  r.detail = ['Azure DNS', o.zoneType, o.metric].filter(Boolean).join(' / ');
};

// 가격 조회 — skuName=영역 종류 + meterName 정확 일치, 공통('')→Zone 1 순 선택
window['_resolve_Azure_DNS'] = async function(row, cur) {
  var o = row.options || {};
  var zoneType = o.zoneType || 'Public';
  var metric = o.metric || '호스팅 영역 (월)';
  var isQueries = metric.indexOf('쿼리') >= 0;
  var label = 'Azure DNS / ' + zoneType + ' / ' + metric;

  var items = [];
  try {
    // DNS 미터는 리전 비종속(존 단위) — armRegionName 필터 없이 조회 후 Gov 존 제외
    items = await apiFetch({ serviceName:'Azure DNS', productName:'Azure DNS', priceType:'Consumption' }, cur, 300, 3, {pageSize:200, expectedSizeKB:40});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure DNS 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var target = zoneType.toLowerCase() + (isQueries ? ' queries' : ' zone');
  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.armRegionName||'').indexOf('Gov') >= 0) return false;
    if (String(it.skuName||'').toLowerCase() !== zoneType.toLowerCase()) return false;
    if (String(it.meterName||'').toLowerCase() !== target) return false;
    return Number(it.unitPrice||0) > 0; // 초과분 할인 구간(예 26개 이상 0.1)이 아닌 첫 구간만
  });
  // armRegionName=''(공통) 우선, 다음 Zone 번호 순 → 첫 구간(tierMinimumUnits 최소) 단가
  cands.sort(function(a,b){
    var ar = String(a.armRegionName||'') === '' ? 0 : 1;
    var br = String(b.armRegionName||'') === '' ? 0 : 1;
    if (ar !== br) return ar - br;
    return (Number(a.tierMinimumUnits||0) - Number(b.tierMinimumUnits||0)) || (Number(a.unitPrice||0) - Number(b.unitPrice||0));
  });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var note = isQueries ? ' (usage=백만 쿼리)' : ' (usage=1, Qty=영역 수 · 26개+ 할인 미반영)';
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + note);
  updatePriceCells(row); updateTotalsRow();
};
