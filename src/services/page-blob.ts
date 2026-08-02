import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/page-blob.js — Page Blob (비관리 디스크/VHD 저장)
//
//   계산기 'Storage Accounts > 유형 = 페이지 Blob(비관리 디스크 포함)'에 대응(가격 하드코딩 없음, 라이브 API).
//   serviceName='Storage'. 성능(performance)에 따라 구조가 다름:
//     Standard → productName 'Standard Page Blob', skuName='Standard <중복성>'(LRS/GRS/RA-GRS).
//                청구 항목(metric): Data Stored(1 GB/Month) / Read·Write Operations(10K). 월=단가×Qty×usage
//     Premium  → productName 'Premium Page Blob', skuName='<디스크크기> <중복성>'(예 'P10 LRS', LRS/ZRS).
//                meter '<크기> <중복성> Disk'(1/Month) = 디스크당 월정액. 월=월정액×Qty(디스크 수)
//   못 찾으면 "매칭 실패". 절약/예약 미적용.
// ================================================================
var _PB_STD_RED  = ['LRS','GRS','RA-GRS'];
var _PB_PREM_RED = ['LRS','ZRS'];
var _PB_PREM_SIZES = ['P10','P15','P20','P30','P40','P50','P60','P70','P80'];

REG._svcDefs['Page Blob'] = {
  apiServiceName: 'Storage',
  steps: [
    { key:'performance', label:'성능',      options:['Standard','Premium'] },
    { key:'redundancy',  label:'중복성',    options:['LRS','GRS','RA-GRS'] },
    { key:'diskSize',    label:'디스크 크기', options:_PB_PREM_SIZES.slice() },   // Premium 전용
    { key:'metric',      label:'청구 항목', options:['Data Stored','Read Operations','Write Operations'] },  // Standard 전용
  ],
  instanceField: false,
  instanceParentKey: 'performance',
  rebuildKeys: ['performance'],
  _applyStepVisibility: function(r: Row){ if (REG['_pageblob_applyStepVisibility']) REG['_pageblob_applyStepVisibility'](r); },
};

REG['_pageblob_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Page Blob'];
  if (!def || !def.steps) return;
  var o = r.options || {};
  var isPrem = (o.performance === 'Premium');
  var redOpts = isPrem ? _PB_PREM_RED : _PB_STD_RED;
  for (var i = 0; i < def.steps.length; i++) {
    var step = def.steps[i], k = step.key;
    if (k === 'redundancy') { step.options = redOpts; if (redOpts.indexOf(o.redundancy) < 0) r.options.redundancy = redOpts[0]; }
    if (k === 'diskSize')   { step._hidden = !isPrem; if (isPrem && _PB_PREM_SIZES.indexOf(o.diskSize) < 0) r.options.diskSize = _PB_PREM_SIZES[0]; }
    if (k === 'metric')     { step._hidden = isPrem; }
  }
};

REG['_buildDetail_Page_Blob'] = function(r: Row) {
  var o = r.options || {};
  REG['_pageblob_applyStepVisibility'](r);
  if (o.performance === 'Premium') {
    r.skuName = ((o.diskSize||'') + ' ' + (o.redundancy||'')).trim();
    r.detail = ['Page Blob', 'Premium', o.diskSize, o.redundancy].filter(Boolean).join(', ');
  } else {
    r.skuName = ('Standard ' + (o.redundancy||'')).trim();
    r.detail = ['Page Blob', 'Standard', o.redundancy, o.metric].filter(Boolean).join(', ');
  }
};

REG['_resolve_Page_Blob'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var isPrem = (o.performance === 'Premium');
  var product = isPrem ? 'Premium Page Blob' : 'Standard Page Blob';
  var label = (isPrem?'Premium':'Standard') + ' / ' + (o.redundancy||'LRS') + (isPrem?(' / '+(o.diskSize||'')):(' / '+(o.metric||'Data Stored')));

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Storage', armRegionName:row.region, productName:product, priceType:'Consumption' }, cur, 300, 4, {pageSize:200, expectedSizeKB:80});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Page Blob 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var isCons = function(it: ApiItem){ return String(it.type||'').toLowerCase() === 'consumption'; };
  var chosen: ApiItem|null = null;

  if (isPrem) {
    // skuName='<크기> <중복성>'(예 'P10 LRS'), meter '<크기> <중복성> Disk'(1/Month) = 디스크당 월정액
    var red = o.redundancy || 'LRS';
    var size = o.diskSize || _PB_PREM_SIZES[0];
    var skuT = (size + ' ' + red).toLowerCase();
    chosen = items.filter(function(it: ApiItem){ return isCons(it) && String(it.skuName||'').toLowerCase() === skuT && String(it.meterName||'').toLowerCase().indexOf('disk') >= 0; })
                  .sort(function(a: ApiItem, b: ApiItem){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); })[0] || null;
    if (chosen) {
      var monthly = Number(chosen.unitPrice);   // 1/Month
      var usH = Number(row.usage) || 730;
      row.paygItem = Object.assign({}, chosen, { currencyCode:cur, unitPrice:monthly/usH, retailPrice:monthly/usH, unitOfMeasure:'1 Hour (equivalent)', _billingMode:'monthly', _monthlyTotal:monthly });
    }
  } else {
    // Standard: skuName='Standard <중복성>', metric 키워드
    var red2 = o.redundancy || 'LRS';
    var metric = o.metric || 'Data Stored';
    var skuT2 = ('standard ' + red2).toLowerCase();
    var mk = metric.toLowerCase();
    var wantStored = mk.indexOf('stored') >= 0, wantRead = mk.indexOf('read') >= 0, wantWrite = mk.indexOf('write') >= 0;
    chosen = items.filter(function(it: ApiItem){
      if (!isCons(it) || String(it.skuName||'').toLowerCase() !== skuT2) return false;
      var m = String(it.meterName||'').toLowerCase();
      if (wantStored) return m.indexOf('data stored') >= 0;
      if (wantRead)   return m.indexOf('read operations') >= 0 && m.indexOf('additional') < 0;
      if (wantWrite)  return m.indexOf('write operations') >= 0 && m.indexOf('additional') < 0;
      return false;
    }).sort(function(a: ApiItem, b: ApiItem){ var ta=Number(a.tierMinimumUnits||0),tb=Number(b.tierMinimumUnits||0); if(ta!==tb) return ta-tb; return Number(a.unitPrice||0)-Number(b.unitPrice||0); })[0] || null;
    if (chosen) row.paygItem = Object.assign({}, chosen, { currencyCode:cur });
  }

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Page Blob ' + label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', 'Page Blob ' + label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure);
  updatePriceCells(row); updateTotalsRow();
};
