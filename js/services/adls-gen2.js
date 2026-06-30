// ================================================================
// services/adls-gen2.js — Azure Data Lake Storage Gen2 (ADLS Gen2)
//
//   계산기 'Storage Accounts > 유형 = Data Lake Storage Gen2'에 대응(가격 하드코딩 없음, 라이브 API).
//   serviceName='Storage'. 파일 구조(네임스페이스)에 따라 productName 분기:
//     계층 구조(Hierarchical) → 'Azure Data Lake Storage Gen2 Hierarchical Namespace'
//     단일 구조(Flat)         → 'Azure Data Lake Storage Gen2 Flat Namespace'
//   skuName='<액세스계층> <중복성>'(예 'Hot LRS'), 청구 항목(metric)을 meterName 키워드로 가른다.
//     - Data Stored            : 저장 용량(1 GB/Month). usage 칸에 GB
//     - Iterative Read/Write Operations : ADLS 반복 작업(10K). usage 칸에 1만 건 수
//     - Read/Write/Delete Operations    : 일반 작업(10K)
//   월=단가×Qty×usage(엔진 기본). 절약/예약 미적용. 못 찾으면 "매칭 실패"(이 계층/중복성에 미터 없을 수 있음).
//   범위 외: Index, Query Acceleration(Data Scanned/Returned), Blob Inventory 등 부가 미터.
// ================================================================
window._svcDefs['Data Lake Storage Gen2'] = {
  apiServiceName: 'Storage',
  steps: [
    { key:'namespace',  label:'파일 구조',   options:['계층 구조 네임스페이스','단일 구조 네임스페이스'] },
    { key:'accessTier', label:'액세스 계층', options:['Hot','Cool','Cold','Archive'] },
    { key:'redundancy', label:'중복성',      options:['LRS','ZRS','GRS','RA-GRS','GZRS','RA-GZRS'] },
    { key:'metric',     label:'청구 항목',   options:['Data Stored','Iterative Read Operations','Iterative Write Operations','Read Operations','Write Operations','Delete Operations'] },
  ],
  instanceField: false,
};

window['_buildDetail_Data_Lake_Storage_Gen2'] = function(r) {
  var o = r.options || {};
  r.skuName = (o.accessTier || '') + ' ' + (o.redundancy || '');
  r.skuName = r.skuName.trim();
  r.detail = ['ADLS Gen2', (o.namespace==='단일 구조 네임스페이스'?'Flat':'Hierarchical'), o.accessTier, o.redundancy, o.metric].filter(Boolean).join(', ');
};

// 가격 조회 — productName(네임스페이스) + skuName='<계층> <중복성>' + 청구 항목(meterName 키워드)
window['_resolve_Data_Lake_Storage_Gen2'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.accessTier || 'Hot';
  var red  = o.redundancy || 'LRS';
  var metric = o.metric || 'Data Stored';
  var isFlat = (o.namespace === '단일 구조 네임스페이스');
  var product = isFlat ? 'Azure Data Lake Storage Gen2 Flat Namespace' : 'Azure Data Lake Storage Gen2 Hierarchical Namespace';
  var skuTarget = (tier + ' ' + red).toLowerCase();
  var label = (isFlat?'Flat':'Hierarchical') + ' / ' + tier + ' ' + red + ' / ' + metric;

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Storage', armRegionName:row.region, productName:product, priceType:'Consumption' }, cur, 500, 5, {pageSize:200, expectedSizeKB:200});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'ADLS Gen2 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var mk = metric.toLowerCase();
  var wantStored = mk.indexOf('stored') >= 0;
  var wantIterRead  = mk.indexOf('iterative read')  >= 0;
  var wantIterWrite = mk.indexOf('iterative write') >= 0;
  var wantRead   = !wantIterRead  && mk.indexOf('read')   >= 0;
  var wantWrite  = !wantIterWrite && mk.indexOf('write')  >= 0;
  var wantDelete = mk.indexOf('delete') >= 0;

  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== skuTarget) return false;
    var m = String(it.meterName||'').toLowerCase();
    if (m.indexOf('priority') >= 0 || m.indexOf('index') >= 0 || m.indexOf('query acceleration') >= 0 || m.indexOf('inventory') >= 0) return false;
    if (wantStored)    return m.indexOf('data stored') >= 0;
    if (wantIterRead)  return m.indexOf('iterative read operations') >= 0;
    if (wantIterWrite) return m.indexOf('iterative write operations') >= 0;
    if (wantRead)      return m.indexOf('read operations') >= 0 && m.indexOf('iterative') < 0;
    if (wantWrite)     return m.indexOf('write operations') >= 0 && m.indexOf('iterative') < 0;
    if (wantDelete)    return m.indexOf('delete operations') >= 0;
    return false;
  }).sort(function(a,b){ var ta=Number(a.tierMinimumUnits||0),tb=Number(b.tierMinimumUnits||0); if(ta!==tb) return ta-tb; return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'ADLS Gen2 ' + label + ': 매칭 실패 (' + items.length + '건 조회). 이 계층/중복성 조합에 해당 미터가 없을 수 있습니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', 'ADLS Gen2 ' + label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure);
  updatePriceCells(row); updateTotalsRow();
};
