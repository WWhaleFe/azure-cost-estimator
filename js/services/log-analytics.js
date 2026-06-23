// ================================================================
// services/log-analytics.js — Log Analytics (Azure Monitor 로그)
//
//   전용 resolver(_resolve_Log_Analytics)로 청구 항목별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Log Analytics'.
//   API 구조(koreacentral): skuName='Analytics Logs'. 청구 항목(meterName):
//     - Data Ingestion → 'Analytics Logs Data Ingestion' (1 GB, 3.11) — 수집 데이터 GB당.
//                        무료(0.0) 미터가 함께 있어 유료(>0)만 사용. usage 칸에 GB 입력
//     - Data Retention → 'Analytics Logs Data Retention' (1 GB/Month, 0.14) — 보존 데이터 GB당
//     - Data Analyzed  → 'Analytics Logs Data Analyzed' (1 GB, 2.3) — 분석(쿼리) 데이터 GB당
//   월=단가×Qty×usage(엔진 기본). 절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외(매칭 실패 정상): Free 계층(무료), Basic Logs/Auxiliary Logs, 커밋 계층(Commitment Tier).
// ================================================================

// 청구 항목 → meterName 키워드(소문자)
var _LA_METER = {
  'Data Ingestion': 'data ingestion',
  'Data Retention': 'data retention',
  'Data Analyzed':  'data analyzed',
};

window._svcDefs['Log Analytics'] = {
  apiServiceName: 'Log Analytics',
  steps: [
    { key:'metric', label:'청구 항목', options:['Data Ingestion','Data Retention','Data Analyzed'] },
  ],
  instanceField: false,
};
window['_buildDetail_Log_Analytics'] = function(r) {
  var o = r.options || {};
  r.skuName = 'Analytics Logs';
  r.detail = ['Analytics Logs', o.metric].filter(Boolean).join(' - ');
};

// 가격 조회 — skuName='Analytics Logs' 안에서 청구 항목(meterName)을 키워드로 가른다
window['_resolve_Log_Analytics'] = async function(row, cur) {
  var o = row.options || {};
  var metric = o.metric || 'Data Ingestion';
  var target = _LA_METER[metric];
  var label = 'Log Analytics / ' + metric;

  if (!target) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 청구 항목을 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Log Analytics', armRegionName:row.region, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:30});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Log Analytics 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase().indexOf('analytics logs') < 0) return false;
    return String(it.meterName||'').toLowerCase().indexOf(target) >= 0;
  });
  // 수집(Ingestion)은 무료(0.0) 미터가 함께 존재 → 유료(>0)만 남긴다
  var paid = cands.filter(function(it){ return Number(it.unitPrice||0) > 0; });
  if (paid.length) cands = paid;
  cands.sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + ' (usage=GB)');
  updatePriceCells(row); updateTotalsRow();
};
