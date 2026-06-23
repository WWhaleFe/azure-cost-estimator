// ================================================================
// services/sql-database.js — Azure SQL Database (vCore 구매 모델)
//
//   전용 resolver(_resolve_Azure_SQL_Database)로 vCore 컴퓨팅 요금을 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='SQL Database'.
//   계층(tier)×컴퓨팅(compute)×하드웨어(hardware) → productName 매핑 + vCore 수(N) 선택:
//     GP  Provisioned Gen5 → 'SQL Database Single/Elastic Pool General Purpose - Compute Gen5'
//     GP  Provisioned Fsv2 → 'SQL Database Single/Elastic Pool General Purpose - Compute FSv2 Series'
//     GP  Serverless  Gen5 → 'SQL Database General Purpose - Serverless - Compute Gen5'
//     BC  Provisioned Gen5 → 'SQL Database Single/Elastic Pool Business Critical - Compute Gen5'
//     BC  Provisioned MSer → 'SQL Database Single/Elastic Pool Business Critical - Compute M Series'
//     HS  Provisioned Gen5 → 'SQL Database SingleDB/Elastic Pool Hyperscale - Compute Gen5'
//     HS  Serverless  Gen5 → 'SQL Database SingleDB Hyperscale - Serverless - Compute Gen5'
//
//   [v80] 중복성(재해 복구) 옵션 추가: '로컬 중복' / '영역 중복(ZR)'.
//     - 로컬 중복: 컴퓨팅 미터(meterName='vCore')만 과금.
//     - 영역 중복(ZR): 로컬 컴퓨팅 + 'Zone Redundancy vCore' 추가 미터를 합산.
//       Azure는 ZR을 별도 추가 미터로 과금하므로 용량제·절약·예약 전부에 add-on을 더함.
//       라이브 검증상 ZR 추가 미터는 GP·Provisioned·Gen5 조합에만 존재 → 그 외 조합에서
//       ZR을 골라도 추가 미터가 없으면 로컬 기준으로 폴백하고 상태창에 안내(빈 가격 방지).
//
//   가격은 vCore에 선형 비례:
//     - Provisioned: skuName='<N> vCore'(meter 'vCore') 정확 일치 단가 우선, 없으면 per-vCore('vCore'/'1 vCore')×N
//     - Serverless : per-vCore('1 vCore', '- Free' 제외) × N (최대 vCore 기준 상한; 실제는 사용 vCore-초 과금)
//     - ZR add-on : skuName='<N> vCore Zone Redundancy' 우선, 없으면 per-vCore('vCore ZR Zone Redundancy'
//                   /'1 vCore Zone Redundancy') × N
//   tier에 따라 compute/hardware 옵션 전환(instanceParentKey='tier' + _sql_applyStepVisibility):
//     BC는 Provisioned만 / 하드웨어 GP=Gen5·Fsv2-series, BC=Gen5·M-series, HS=Gen5.
//   월=단가(설정 1개의 시간당가)×Qty(DB 수)×usage(시간, 예 730).
//   절약 플랜(1년)·예약(1·3년): per-vCore Consumption 항목의 savingsPlan과 같은 productName의
//     Reservation(skuName='vCore', ZR이면 'vCore ZR Zone Redundancy')을 시간당 단가로 환산해 × N.
//     예약 제공 조합 = Provisioned 이면서 하드웨어 ≠ Fsv2-series. (Serverless·Fsv2는 예약 미제공 → 빈칸 정상)
//     절약은 현재 1년만 노출(API에 SQL 3년 절약 미터 없음).
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
var _SQL_RED_ZR = '영역 중복(ZR)';
var _SQL_RED_LOCAL = '로컬 중복';

window._svcDefs['Azure SQL Database'] = {
  apiServiceName: 'SQL Database',
  steps: [
    { key:'tier',       label:'계층',     options:['General Purpose','Business Critical','Hyperscale'] },
    { key:'compute',    label:'컴퓨팅',   options:['Provisioned','Serverless'] },
    { key:'hardware',   label:'하드웨어', options:['Gen5','Fsv2-series'] },
    { key:'vCores',     label:'vCore 수', options:['1','2','4','6','8','10','12','16','24','32','40','80'] },
    { key:'redundancy', label:'중복성(재해 복구)', options:[_SQL_RED_LOCAL, _SQL_RED_ZR],
      tooltip:'영역 중복(ZR)은 Zone Redundancy 추가 미터로 과금됩니다. 라이브 가격상 일반적 용도·프로비저닝됨·Gen5 조합에만 추가요금이 있으며, 그 외 조합은 로컬 기준으로 계산됩니다.' },
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
  var red = (o.redundancy === _SQL_RED_ZR) ? 'ZR' : '로컬';
  r.skuName = [o.tier, o.compute, (o.vCores ? o.vCores + 'vCore' : '')].filter(Boolean).join(' ').trim();
  r.detail  = [o.tier, o.compute, o.hardware, (o.vCores ? o.vCores + ' vCore' : ''), red].filter(Boolean).join(', ');
};

// 가격 조회 — productName(tier|compute|hardware) 내에서 vCore 단가를 찾아 N vCore로 환산(+ZR add-on)
window['_resolve_Azure_SQL_Database'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'General Purpose';
  var comp = o.compute || 'Provisioned';
  var hw   = o.hardware || 'Gen5';
  var N    = parseInt(o.vCores, 10); if (!(N > 0)) N = 2;
  var isZR = (o.redundancy === _SQL_RED_ZR);
  var label = tier + ' / ' + comp + ' / ' + hw + ' / ' + N + ' vCore / ' + (isZR ? 'ZR' : '로컬');

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

  var isCons    = function(it){ return String(it.type||'').toLowerCase() === 'consumption'; };
  var meterIs   = function(it,m){ return String(it.meterName||'').toLowerCase() === m; };
  var skuIs     = function(it,s){ return String(it.skuName||'').toLowerCase() === s; };

  // 항목 합산: 로컬 base 항목 a에 ZR add-on 항목 b의 단가를 더한 새 항목(시간당) 생성
  function addItems(a, b, lab){
    if (!a) return null;
    if (!b) return a;
    var up = Number(a.unitPrice) + Number(b.unitPrice);
    var rp = Number(a.retailPrice||a.unitPrice) + Number(b.retailPrice||b.unitPrice);
    return { currencyCode:cur, unitPrice:up, retailPrice:rp, armRegionName:a.armRegionName,
      productName:a.productName, skuName:(lab||a.skuName), meterName:a.meterName,
      unitOfMeasure:'1 Hour', type:a.type, term:a.term };
  }

  // 용량제 단가 계산: meter 안에서 'N <suffix>' 정확 일치 우선(Provisioned), 없으면 per-vCore × N
  function computePrice(meterLower, exactSku, perVcoreSkus){
    var exact = items.filter(function(it){ return isCons(it) && meterIs(it, meterLower) && skuIs(it, exactSku); })
                     .sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); })[0];
    if (exact && comp === 'Provisioned') return { price:Number(exact.unitPrice), basis:'exact ' + exactSku };
    var base = null;
    for (var i = 0; i < perVcoreSkus.length && !base; i++) {
      base = items.filter(function(it){ return isCons(it) && meterIs(it, meterLower) && skuIs(it, perVcoreSkus[i]); })[0];
    }
    if (base) return { price:Number(base.unitPrice) * N, basis:'per-vCore × ' + N };
    if (exact) return { price:Number(exact.unitPrice), basis:'exact ' + exactSku };
    return null;
  }

  // 1) 로컬 컴퓨팅 단가
  var local = computePrice('vcore', N + ' vcore', ['vcore', '1 vcore']);
  if (!local) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure SQL Database ' + label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 2) ZR add-on 단가 (영역 중복 선택 시)
  var zr = null, zrMissing = false;
  if (isZR) {
    zr = computePrice('zone redundancy vcore', N + ' vcore zone redundancy', ['vcore zr zone redundancy', '1 vcore zone redundancy']);
    if (!zr) zrMissing = true;
  }

  var price = local.price + (zr ? zr.price : 0);
  var basis = local.basis + (zr ? ' + ZR(' + zr.basis + ')' : '');

  // 용량제 항목(시간당). 엔진: 월=단가×Qty×usage. Qty=DB 수, usage=시간.
  row.paygItem = {
    currencyCode: cur, unitPrice: price, retailPrice: price,
    armRegionName: row.region, productName: product,
    skuName: N + ' vCore' + (isZR ? ' (ZR)' : ''), meterName: 'vCore', unitOfMeasure: '1 Hour', type: 'Consumption',
    _sqlVcores: N, _sqlBasis: basis, _sqlZR: isZR,
  };

  // ── 절약 플랜(1년) ── per-vCore Consumption 항목의 savingsPlan을 × N (로컬 + ZR add-on)
  function spBaseFor(meterLower, exactSku, perVcoreSkus){
    var b = null;
    for (var i = 0; i < perVcoreSkus.length && !b; i++) {
      b = items.filter(function(it){ return isCons(it) && meterIs(it, meterLower) && skuIs(it, perVcoreSkus[i]); })[0];
    }
    if (b) return { base:b, mult:N };
    var ex = items.filter(function(it){ return isCons(it) && meterIs(it, meterLower) && skuIs(it, exactSku); })[0];
    if (ex) return { base:ex, mult:1 };
    return { base:null, mult:N };
  }
  var spL = spBaseFor('vcore', N + ' vcore', ['vcore', '1 vcore']);
  var spLocal = spItemsFromBase(spL.base, spL.mult, cur);
  var spZR = { sp1:null, sp3:null };
  if (isZR && !zrMissing) {
    var spZ = spBaseFor('zone redundancy vcore', N + ' vcore zone redundancy', ['vcore zr zone redundancy', '1 vcore zone redundancy']);
    spZR = spItemsFromBase(spZ.base, spZ.mult, cur);
  }
  var sp1 = addItems(spLocal.sp1, (isZR ? spZR.sp1 : null), N + ' vCore SP1Y' + (isZR ? ' (ZR)' : ''));
  var sp3 = addItems(spLocal.sp3, (isZR ? spZR.sp3 : null), N + ' vCore SP3Y' + (isZR ? ' (ZR)' : ''));

  // ── 예약(RI 1·3년) ── 같은 productName의 Reservation에서 skuName 일치분을 시간당 환산 × N (로컬 + ZR add-on)
  var riExpected = (comp === 'Provisioned' && hw !== 'Fsv2-series');
  var resv = [];
  try { resv = await apiFetch({ serviceName:'SQL Database', armRegionName:row.region, productName:product, priceType:'Reservation' }, cur, 200, 3, {pageSize:200, expectedSizeKB:60}); } catch(e) { resv = []; }
  // 견고화: 예약 제공 조합인데 비어있으면 1회 재시도(일시적 프록시 실패 대비)
  if (riExpected && (!resv || resv.length === 0)) {
    try { resv = await apiFetch({ serviceName:'SQL Database', armRegionName:row.region, productName:product, priceType:'Reservation' }, cur, 200, 3, {pageSize:200, expectedSizeKB:60}); } catch(e) { resv = []; }
  }
  var riLocal = riItemsFromResv(resv, 'vcore', N, cur);
  var riZR = (isZR && !zrMissing) ? riItemsFromResv(resv, 'vcore zr zone redundancy', N, cur) : { ri1:null, ri3:null };
  var ri1 = addItems(riLocal.ri1, (isZR ? riZR.ri1 : null), N + ' vCore RI1Y' + (isZR ? ' (ZR)' : ''));
  var ri3 = addItems(riLocal.ri3, (isZR ? riZR.ri3 : null), N + ' vCore RI3Y' + (isZR ? ' (ZR)' : ''));

  row.sp1Item = sp1; row.sp3Item = sp3; row.ri1Item = ri1; row.ri3Item = ri3;

  // 상태 메시지 + 안내
  var tags = ['PAYG']; if(sp1)tags.push('SP1Y'); if(sp3)tags.push('SP3Y'); if(ri1)tags.push('RI1Y'); if(ri3)tags.push('RI3Y');
  var notes = [];
  if (comp === 'Serverless') notes.push('서버리스는 최대 vCore 기준 상한(실제는 사용 vCore-초 과금)');
  if (zrMissing) notes.push('이 조합은 영역 중복 추가요금 미터 없음 → 로컬 기준');
  if (riExpected && (!resv || resv.length === 0)) notes.push('예약 조회 실패(새로고침 후 재시도 권장)');
  if (!riExpected) notes.push('예약 미제공(서버리스/Fsv2 조합)');
  var note = notes.length ? ' · ' + notes.join(' · ') : '';
  setStatus('ok', 'Azure SQL Database ' + label + ' 완료 [' + tags.join(', ') + '] · ' + price.toFixed(4) + ' /1 Hour [' + basis + ']' + note);
  updatePriceCells(row); updateTotalsRow();
};
