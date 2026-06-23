// ================================================================
// services/storage-account.js — Storage Account (Table / Queue 스토리지)
//
//   전용 resolver(_resolve_Storage_Account)로 스토리지 종류×중복성×청구 항목별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Storage'.
//   Blob/파일은 별도 카테고리(Blob Storage, Azure Files)에서 다루며, 여기서는 범용 v2 계정의
//   Table·Queue 스토리지를 다룹니다. API 구조(koreacentral):
//     - Table : productName='Tables',    skuName='Standard <중복성>'
//     - Queue : productName='Queues v2',  skuName='Standard <중복성>'
//   청구 항목(meterName, 종류별로 표기가 달라 키워드+대안으로 매칭):
//     - Data Stored      → '... Data Stored' (1 GB/Month). usage 칸에 GB 입력
//     - Write Operations → Table 'Write Operations' / Queue 'Class 1 Operations' (10K=1만 건)
//     - Read Operations  → Table 'Read Operations'  / Queue 'Class 2 Operations' (10K=1만 건)
//   월=단가×Qty×usage(엔진 기본). 절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외: Account Encrypted(고급 암호화) SKU, Batch/Additional IO/List/Scan/Delete 등 세부 작업 미터.
// ================================================================

var _STG_PRODUCT = { 'Table': 'Tables', 'Queue': 'Queues v2' };
// 청구 항목 → 종류별 meterName 끝말(소문자). [Table, Queue] 순
var _STG_METER = {
  'Data Stored':      { kw:'data stored',      exclude:[] },
  'Write Operations': { table:'write operations', queue:'class 1 operations', exclude:['batch','additional io'] },
  'Read Operations':  { table:'read operations',  queue:'class 2 operations', exclude:['batch','additional io'] },
};

window._svcDefs['Storage Account'] = {
  apiServiceName: 'Storage',
  steps: [
    { key:'storageType', label:'스토리지 종류', options:['Table','Queue'] },
    { key:'redundancy',  label:'중복성',        options:['LRS','ZRS','GRS','RA-GRS','GZRS','RA-GZRS'] },
    { key:'metric',      label:'청구 항목',     options:['Data Stored','Write Operations','Read Operations'] },
  ],
  instanceField: false,
};
window['_buildDetail_Storage_Account'] = function(r) {
  var o = r.options || {};
  r.skuName = [o.storageType, o.redundancy].filter(Boolean).join(' ');
  r.detail = [o.storageType, o.redundancy, o.metric].filter(Boolean).join(', ');
};

// 가격 조회 — productName(종류) + skuName='Standard <중복성>' + 청구 항목(meterName) 매칭
window['_resolve_Storage_Account'] = async function(row, cur) {
  var o = row.options || {};
  var stype  = o.storageType || 'Table';
  var red    = o.redundancy  || 'LRS';
  var metric = o.metric      || 'Data Stored';
  var product = _STG_PRODUCT[stype];
  var skuTarget = ('Standard ' + red).toLowerCase();
  var label = stype + ' ' + red + ' / ' + metric;

  if (!product) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 스토리지 종류를 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Storage', armRegionName:row.region, productName:product, priceType:'Consumption' }, cur, 500, 5, {pageSize:200, expectedSizeKB:120});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Storage Account 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var spec = _STG_METER[metric] || _STG_METER['Data Stored'];
  var kw = spec.kw || (stype === 'Queue' ? spec.queue : spec.table);
  var excl = spec.exclude || [];

  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== skuTarget) return false;
    var m = String(it.meterName||'').toLowerCase();
    for (var i = 0; i < excl.length; i++) { if (m.indexOf(excl[i]) >= 0) return false; }
    return m.indexOf(kw) >= 0;
  }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회). 이 종류/중복성 조합에 해당 미터가 없을 수 있습니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 단위(GB/Month, 10K)에 맞게 적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure);
  updatePriceCells(row); updateTotalsRow();
};
