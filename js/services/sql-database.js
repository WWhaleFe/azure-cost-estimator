// ================================================================
// services/sql-database.js — Azure SQL Database (vCore 구매 모델)
//
//   v68부터 전용 resolver(_resolve_Azure_SQL_Database)로 vCore 컴퓨팅 요금을 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='SQL Database'.
//   계층(tier)×컴퓨팅(compute)×하드웨어(hardware) → productName 매핑 + vCore 수 선택:
//     GP  Provisioned Gen5 → 'SQL Database Single/Elastic Pool General Purpose - Compute Gen5'
//     GP  Provisioned Fsv2 → 'SQL Database Single/Elastic Pool General Purpose - Compute FSv2 Series'
//     GP  Serverless  Gen5 → 'SQL Database General Purpose - Serverless - Compute Gen5'
//     BC  Provisioned Gen5 → 'SQL Database Single/Elastic Pool Business Critical - Compute Gen5'
//     BC  Provisioned MSer → 'SQL Database Single/Elastic Pool Business Critical - Compute M Series'
//     HS  Provisioned Gen5 → 'SQL Database SingleDB/Elastic Pool Hyperscale - Compute Gen5'
//     HS  Serverless  Gen5 → 'SQL Database Hyperscale - Serverless - Compute Gen5'
//   가격은 vCore에 선형 비례:
//     - Provisioned: skuName='<N> vCore'(meter 'vCore') 정확 일치 단가(N vCore 전체 시간당)를 우선 사용,
//                    없으면 per-vCore 기준 단가(skuName='vCore') × N
//     - Serverless : per-vCore 단가(skuName='1 vCore', meter 'vCore', '- Free' 제외) × N
//                    (최대 vCore 기준 상한 추정 — 실제 서버리스는 사용한 vCore-초로 과금)
//   tier에 따라 compute/hardware 옵션을 전환(instanceParentKey='tier' + _sql_applyStepVisibility):
//     BC는 Provisioned만 / 하드웨어 GP=Gen5·Fsv2-series, BC=Gen5·M-series, HS=Gen5.
//   월=단가(설정 1개의 시간당가)×Qty(DB 수)×usage(시간, 예 730). 절약/예약(RI) 미적용.
//   범위 외(매칭 실패 정상): Zone Redundancy(비ZR 기준), 예약 용량, 스토리지/백업(PITR·LTR),
//     DTU 모델(Basic/Standard/Premium), Elastic Pool 전용 미터, 표에 없는 tier/compute/hardware 조합.
// ================================================================

// (tier|compute|hardware) → productName
var _SQL_PRODUCT = {
  'General Purpose|Provisioned|Gen5':         'SQL Database Single/Elastic Pool General Purpose - Compute Gen5',
  'General Purpose|Provisioned|Fsv2-series':  'SQL Database Single/Elastic Pool General Purpose - Compute FSv2 Series',
  'General Purpose|Serverless|Gen5':          'SQL Database General Purpose - Serverless - Compute Gen5',
  'Business Critical|Provisioned|Gen5':       'SQL Database Single/Elastic Pool Business Critical - Compute Gen5',
  'Business Critical|Provisioned|M-series':   'SQL Database Single/Elastic Pool Business Critical - Compute M Series',
  'Hyperscale|Provisioned|Gen5':              'SQL Database SingleDB/Elastic Pool Hyperscale - Compute Gen5',
  'Hyperscale|Serverless|Gen5':               'SQL Database SingleDB Hyperscale - Serverless - Compute Gen5',
};
// tier별 compute/hardware 옵션
var _SQL_COMPUTE  = { 'General Purpose':['Provisioned','Serverless'], 'Business Critical':['Provisioned'], 'Hyperscale':['Provisioned','Serverless'] };
var _SQL_HARDWARE = { 'General Purpose':['Gen5','Fsv2-series'], 'Business Critical':['Gen5','M-series'], 'Hyperscale':['Gen5'] };

window._svcDefs['Azure SQL Database'] = {
  apiServiceName: 'SQL Database',
  steps: [
    { key:'tier',     label:'계층',     options:['General Purpose','Business Critical','Hyperscale'] },
    { key:'compute',  label:'컴퓨팅',   options:['Provisioned','Serverless'] },
    { key:'hardware', label:'하드웨어', options:['Gen5','Fsv2-series'] },
    { key:'vCores',   label:'vCore 수', options:['1','2','4','6','8','10','12','16','24','32','40','80'] },
  ],
  instanceField: false,
  // 계층 변경 시 compute/hardware 옵션을 다시 구성
  instanceParentKey: 'tier',
  _applyStepVisibility: function(r){ if (window['_sql_applyStepVisibility']) window['_sql_applyStepVisibility'](r); },
};

window['_sql_applyStepVisibility'] = function(r) {
  var def = window._svcDefs['Azure SQL Database'];
  if (!def || !def.steps) return;
  var o = r.options || {};
  var tier = o.tier || 'General Purpose';
  var comp = _SQL_COMPUTE[tier]  || ['Provisioned'];
  var hw   = _SQL_HARDWARE[tier] || ['Gen5'];
  for (var i = 0; i < def.steps.length; i++) {
    var k = def.steps[i].key;
    if (k === 'compute')  { def.steps[i].options = comp; if (comp.indexOf(o.compute) < 0)  r.options.compute  = comp[0]; }
    if (k === 'hardware') { def.steps[i].options = hw;   if (hw.indexOf(o.hardware) < 0)    r.options.hardware = hw[0]; }
  }
};

window['_buildDetail_Azure_SQL_Database'] = function(r) {
  var o = r.options || {};
  window['_sql_applyStepVisibility'](r);
  r.skuName = [o.tier, o.compute, (o.vCores ? o.vCores + 'vCore' : '')].filter(Boolean).join(' ').trim();
  r.detail  = [o.tier, o.compute, o.hardware, (o.vCores ? o.vCores + ' vCore' : '')].filter(Boolean).join(', ');
};

// 가격 조회 — productName(tier|compute|hardware) 내에서 vCore 단가를 찾아 N vCore로 환산
window['_resolve_Azure_SQL_Database'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'General Purpose';
  var comp = o.compute || 'Provisioned';
  var hw   = o.hardware || 'Gen5';
  var N    = parseInt(o.vCores, 10); if (!(N > 0)) N = 2;
  var label = tier + ' / ' + comp + ' / ' + hw + ' / ' + N + ' vCore';

  var product = _SQL_PRODUCT[tier + '|' + comp + '|' + hw];
  if (!product) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure SQL Database ' + label + ': 지원하지 않는 조합입니다(이 계층/컴퓨팅/하드웨어 매핑 없음).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items = [];
  try {
    items = await apiFetch({ serviceName:'SQL Database', armRegionName:row.region, productName:product, priceType:'Consumption' }, cur, 300, 4, {pageSize:200, expectedSizeKB:120});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure SQL Database 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var isCons = function(it){ return String(it.type||'').toLowerCase() === 'consumption'; };
  var meterVcore = function(it){ return String(it.meterName||'').toLowerCase() === 'vcore'; };  // '- Free'·'Zone Redundancy vCore' 제외

  var price = null, basis = '', perVcore = null;
  // 1) Provisioned: skuName='<N> vCore' 정확 일치(전체 N vCore 시간당가)
  if (comp === 'Provisioned') {
    var exact = items.filter(function(it){ return isCons(it) && meterVcore(it) && String(it.skuName||'').toLowerCase() === (N + ' vcore'); })
                     .sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); })[0];
    if (exact) { price = Number(exact.unitPrice); basis = N + ' vCore 미터'; }
  }
  // 2) per-vCore 단가 × N (Provisioned 기준 단가 'vCore' 또는 Serverless '1 vCore')
  if (price === null) {
    var base = items.filter(function(it){ return isCons(it) && meterVcore(it) && String(it.skuName||'').toLowerCase() === 'vcore'; })[0]
            || items.filter(function(it){ return isCons(it) && meterVcore(it) && String(it.skuName||'').toLowerCase() === '1 vcore'; })[0];
    if (base) { perVcore = Number(base.unitPrice); price = perVcore * N; basis = 'per-vCore ' + perVcore + ' × ' + N; }
  }

  if (price === null) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure SQL Database ' + label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 설정 1개의 시간당가를 paygItem으로 구성(엔진: 월=단가×Qty×usage). Qty=DB 수, usage=시간.
  row.paygItem = {
    currencyCode: cur, unitPrice: price, retailPrice: price,
    armRegionName: row.region, productName: product,
    skuName: N + ' vCore', meterName: 'vCore', unitOfMeasure: '1 Hour', type: 'Consumption',
    _sqlPerVcore: perVcore, _sqlVcores: N, _sqlBasis: basis,
  };
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var note = (comp === 'Serverless') ? ' · 서버리스는 최대 vCore 기준 상한(실제는 사용 vCore-초 과금)' : '';
  setStatus('ok', 'Azure SQL Database ' + label + ' 완료 · ' + price.toFixed(4) + ' /1 Hour [' + basis + ']' + note);
  updatePriceCells(row); updateTotalsRow();
};
