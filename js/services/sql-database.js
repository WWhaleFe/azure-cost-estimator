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
//     HS  Serverless  Gen5 → 'SQL Database SingleDB Hyperscale - Serverless - Compute Gen5'
//
//   [v79] 중복성(재해 복구) 옵션 추가 — '로컬 중복' / '영역 중복(ZR)'.
//     · 로컬 중복: 기존과 동일(meter 'vCore' 기준 가격).
//     · 영역 중복(ZR): Azure가 영역 중복을 별도 가산 미터(meter 'Zone Redundancy vCore',
//       skuName '... Zone Redundancy')로 과금하므로, 로컬 가격에 ZR 가산분을 합산합니다.
//       (용량제·절약·예약 모두 합산). 해당 조합에 ZR 미터가 없으면(예: BC/HS 일부) 로컬 기준으로
//       계산하고 상태창에 'ZR 미터 없음 → 로컬 기준'을 표시합니다(가격 추측·하드코딩 없음).
//
//   가격은 vCore에 선형 비례:
//     - Provisioned: skuName='<N> vCore'(meter 'vCore') 정확 일치 단가를 우선,
//                    없으면 per-vCore 단가(skuName 'vCore'/'1 vCore') × N
//     - Serverless : per-vCore 단가(skuName '1 vCore', '- Free' 제외) × N
//
//   [v79] 예약 조회 견고화: 예약은 별도 호출이라 일시 실패 시 조용히 빈칸이 되던 것을,
//     예약이 제공되는 조합(Provisioned·非Fsv2)인데 비면 상태창에 '예약 비어있음(재시도 권장)'을
//     명시하고, 서버리스/Fsv2처럼 원래 예약이 없는 조합은 '예약 미제공(정상)'으로 표기합니다.
//
//   tier에 따라 compute/hardware 옵션 전환(instanceParentKey='tier' + _sql_applyStepVisibility).
//   월=단가(설정 1개의 시간당가)×Qty(DB 수)×usage(시간, 예 730).
//   범위 외(매칭 실패 정상): 스토리지/백업(PITR·LTR), DTU 모델(Basic/Standard/Premium),
//     Elastic Pool 전용 미터, 표에 없는 tier/compute/hardware 조합.
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
    { key:'tier',       label:'계층',           options:['General Purpose','Business Critical','Hyperscale'] },
    { key:'compute',    label:'컴퓨팅',         options:['Provisioned','Serverless'] },
    { key:'hardware',   label:'하드웨어',       options:['Gen5','Fsv2-series'] },
    { key:'vCores',     label:'vCore 수',       options:['1','2','4','6','8','10','12','16','24','32','40','80'] },
    { key:'redundancy', label:'중복성(재해 복구)', options:['로컬 중복','영역 중복(ZR)'],
      tooltip:'영역 중복(ZR)은 Azure 별도 가산 요금이 붙습니다. ZR 미터가 없는 조합은 로컬 기준으로 계산됩니다.' },
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
  var zr = (o.redundancy === '영역 중복(ZR)');
  r.skuName = [o.tier, o.compute, (o.vCores ? o.vCores + 'vCore' : '')].filter(Boolean).join(' ').trim();
  r.detail  = [o.tier, o.compute, o.hardware, (o.vCores ? o.vCores + ' vCore' : ''), (zr ? 'ZR' : '로컬')].filter(Boolean).join(', ');
};

// 가격 조회 — productName(tier|compute|hardware) 내에서 vCore 단가를 찾아 N vCore로 환산
window['_resolve_Azure_SQL_Database'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'General Purpose';
  var comp = o.compute || 'Provisioned';
  var hw   = o.hardware || 'Gen5';
  var N    = parseInt(o.vCores, 10); if (!(N > 0)) N = 2;
  var zr   = (o.redundancy === '영역 중복(ZR)');
  var redLabel = zr ? '영역 중복(ZR)' : '로컬 중복';
  var label = tier + ' / ' + comp + ' / ' + hw + ' / ' + N + ' vCore / ' + redLabel;

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

  var isCons  = function(it){ return String(it.type||'').toLowerCase() === 'consumption'; };
  var meterIs = function(it, m){ return String(it.meterName||'').toLowerCase() === m; };
  var skuIs   = function(it, s){ return String(it.skuName||'').toLowerCase() === s; };

  // 한 미터 그룹에서 N vCore 가격을 구함: exact '<N> vCore[ suffix]' 우선, 없으면 per-vCore × N
  function priceFor(meterLower, exactSuffix, perVcoreSkus) {
    var exact = items.filter(function(it){ return isCons(it) && meterIs(it, meterLower) && skuIs(it, N + ' vcore' + exactSuffix); })
                     .sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); })[0];
    if (exact) return { price: Number(exact.unitPrice), perVcore: null, basis: 'exact' };
    var base = null;
    for (var i = 0; i < perVcoreSkus.length; i++) {
      base = items.filter(function(it){ return isCons(it) && meterIs(it, meterLower) && skuIs(it, perVcoreSkus[i]); })[0];
      if (base) break;
    }
    if (base) { var pv = Number(base.unitPrice); return { price: pv * N, perVcore: pv, basis: 'perVcore' }; }
    return null;
  }

  // 1) 로컬 컴퓨팅 가격(meter 'vCore')
  var localP = priceFor('vcore', '', ['vcore', '1 vcore']);
  if (!localP) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure SQL Database ' + label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var price = localP.price;
  var basisParts = ['로컬 ' + (localP.basis === 'exact' ? (N + 'vCore미터') : ('per-vCore ' + localP.perVcore + '×' + N))];

  // 2) 영역 중복(ZR) 선택 시 가산 미터(meter 'Zone Redundancy vCore')를 합산
  var zrApplied = false, zrNote = '';
  if (zr) {
    var zrP = priceFor('zone redundancy vcore', ' zone redundancy', ['vcore zr zone redundancy', '1 vcore zone redundancy']);
    if (zrP) { price += zrP.price; zrApplied = true; basisParts.push('ZR가산 +' + (zrP.basis === 'exact' ? (N + 'vCore') : ('per-vCore ' + zrP.perVcore + '×' + N))); }
    else { zrNote = ' · ZR 미터 없음 → 로컬 기준'; basisParts.push('ZR미터없음'); }
  }
  var basis = basisParts.join(' / ');

  // 설정 1개의 시간당가를 paygItem으로 구성(엔진: 월=단가×Qty×usage). Qty=DB 수, usage=시간.
  row.paygItem = {
    currencyCode: cur, unitPrice: price, retailPrice: price,
    armRegionName: row.region, productName: product,
    skuName: N + ' vCore' + (zrApplied ? ' (ZR)' : ''), meterName: 'vCore', unitOfMeasure: '1 Hour', type: 'Consumption',
    _sqlVcores: N, _sqlBasis: basis, _sqlZR: zrApplied,
  };

  // 두 절약/예약 항목을 단가 합산(한쪽만 있으면 그대로)
  function addItems(a, b) {
    if (!a && !b) return null;
    var ref = a || b;
    var p = (a ? Number(a.unitPrice) : 0) + (b ? Number(b.unitPrice) : 0);
    if (!(p > 0)) return null;
    return Object.assign({}, ref, { unitPrice: p, retailPrice: p });
  }

  // ── 절약 플랜(1년) ── per-vCore Consumption 항목의 savingsPlan × N. ZR이면 ZR per-vCore 가산분도 합산.
  var spLocalBase = items.filter(function(it){ return isCons(it) && meterIs(it, 'vcore') && (skuIs(it, 'vcore') || skuIs(it, '1 vcore')); })[0];
  var spLocal = spItemsFromBase(spLocalBase, N, cur);
  var sp = { sp1: spLocal.sp1, sp3: spLocal.sp3 };
  if (zrApplied) {
    var spZrBase = items.filter(function(it){ return isCons(it) && meterIs(it, 'zone redundancy vcore') && (skuIs(it, 'vcore zr zone redundancy') || skuIs(it, '1 vcore zone redundancy')); })[0];
    var spZr = spItemsFromBase(spZrBase, N, cur);
    sp.sp1 = addItems(spLocal.sp1, spZr.sp1);
    sp.sp3 = addItems(spLocal.sp3, spZr.sp3);
  }

  // ── 예약(Reservation) ── 같은 productName의 Reservation 항목. 로컬은 skuName='vCore',
  //    ZR이면 'vCore ZR Zone Redundancy' 가산분도 합산. 견고화: 비면 1회 재조회.
  var riExpected = (comp === 'Provisioned' && hw !== 'Fsv2-series'); // 서버리스·Fsv2는 예약 미제공
  async function fetchResv() {
    try { return await apiFetch({ serviceName:'SQL Database', armRegionName:row.region, productName:product, priceType:'Reservation' }, cur, 200, 3, {pageSize:200, expectedSizeKB:60}); }
    catch (e) { return []; }
  }
  var resv = await fetchResv();
  if ((!resv || resv.length === 0) && riExpected) { resv = await fetchResv(); } // 일시 실패 1회 재시도

  var riLocal = riItemsFromResv(resv, 'vcore', N, cur);
  var ri = { ri1: riLocal.ri1, ri3: riLocal.ri3 };
  if (zrApplied) {
    var riZr = riItemsFromResv(resv, 'vcore zr zone redundancy', N, cur);
    ri.ri1 = addItems(riLocal.ri1, riZr.ri1);
    ri.ri3 = addItems(riLocal.ri3, riZr.ri3);
  }

  row.sp1Item = sp.sp1; row.sp3Item = sp.sp3; row.ri1Item = ri.ri1; row.ri3Item = ri.ri3;

  // 상태 메시지: 예약 유무를 명확히
  var tags = ['PAYG']; if (sp.sp1) tags.push('SP1Y'); if (sp.sp3) tags.push('SP3Y'); if (ri.ri1) tags.push('RI1Y'); if (ri.ri3) tags.push('RI3Y');
  var riNote = '';
  if (riExpected && !ri.ri1 && !ri.ri3) riNote = ' · 예약 비어있음(새로고침 재시도 권장)';
  else if (!riExpected)                 riNote = ' · 예약 미제공(서버리스/Fsv2)';
  var serverlessNote = (comp === 'Serverless') ? ' · 서버리스는 최대 vCore 기준 상한(실제는 사용 vCore-초 과금)' : '';
  setStatus('ok', 'Azure SQL Database ' + label + ' 완료 [' + tags.join(', ') + '] · ' + price.toFixed(4) + ' /1 Hour [' + basis + ']' + zrNote + riNote + serverlessNote);
  updatePriceCells(row); updateTotalsRow();
};
