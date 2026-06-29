// ================================================================
// services/sql-database.js — Azure SQL Database (vCore + DTU 구매 모델)
//
//   전용 resolver(_resolve_Azure_SQL_Database)로 컴퓨팅 요금을 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='SQL Database'.
//
//   [vCore 모델] 계층(tier)×컴퓨팅(compute)×하드웨어(hardware) → productName + vCore 수(N):
//     GP  Provisioned Gen5 → 'SQL Database Single/Elastic Pool General Purpose - Compute Gen5'
//     GP  Provisioned Fsv2 → 'SQL Database Single/Elastic Pool General Purpose - Compute FSv2 Series'
//     GP  Serverless  Gen5 → 'SQL Database General Purpose - Serverless - Compute Gen5'
//     BC  Provisioned Gen5 → 'SQL Database Single/Elastic Pool Business Critical - Compute Gen5'
//     BC  Provisioned MSer → 'SQL Database Single/Elastic Pool Business Critical - Compute M Series'
//     HS  Provisioned Gen5/Premium-series/Premium-series MO/DC-series, HS Serverless Gen5
//       (Premium계열·DC는 per-vCore 단가 × N으로 산출, Provisioned 전용)
//
//   [v80] 중복성(재해 복구) 옵션: '로컬 중복' / '영역 중복(ZR)'.
//     - 로컬 중복: 컴퓨팅 미터(meterName='vCore')만 과금.
//     - 영역 중복(ZR): 로컬 컴퓨팅 + 'Zone Redundancy vCore' 추가 미터를 합산(용량제·절약·예약 전부).
//       라이브상 ZR 추가 미터는 GP·Provisioned·Gen5 조합에만 존재 → 그 외는 로컬 폴백+안내.
//
//   [v82] DTU 구매 모델(단일 DB): productName=계층, skuName=DTU 크기, 단위 '1/Day'.
//     Basic(B)·Standard(S0~S12)·Premium(P1~P15). 시간당가=일일단가/24로 환산해 엔진 합류.
//     DTU는 절약/예약·ZR add-on 미제공(엔진 기본 계산만).
//
//   가격은 vCore에 선형 비례:
//     - Provisioned: skuName='<N> vCore'(meter 'vCore') 정확 일치 단가 우선, 없으면 per-vCore('vCore'/'1 vCore')×N
//     - Serverless : per-vCore('1 vCore', '- Free' 제외) × N (최대 vCore 기준 상한; 실제는 사용 vCore-초 과금)
//     - ZR add-on : skuName='<N> vCore Zone Redundancy' 우선, 없으면 per-vCore('vCore ZR Zone Redundancy'
//                   /'1 vCore Zone Redundancy') × N
//   구매 모델·계층에 따라 하위 스텝(compute/hardware/vCore/redundancy ↔ DTU 크기)을 _hidden으로 전환
//     (instanceParentKey='tier' + rebuildKeys=['model'] + _sql_applyStepVisibility).
//   월=단가(설정 1개의 시간당가)×Qty(DB 수)×usage(시간, 예 730).
//   절약 플랜(1년)·예약(1·3년): per-vCore Consumption 항목의 savingsPlan과 같은 productName의
//     Reservation(skuName='vCore', ZR이면 'vCore ZR Zone Redundancy')을 시간당 단가로 환산해 × N.
//     예약 제공 조합 = Provisioned 이면서 하드웨어 ≠ Fsv2-series. (Serverless·Fsv2는 예약 미제공 → 빈칸 정상)
//     절약은 현재 1년만 노출(API에 SQL 3년 절약 미터 없음).
//   범위 외(매칭 실패 정상): 스토리지/백업(PITR·LTR), Elastic Pool 전용 미터, 표에 없는 조합.
// ================================================================

// (tier|compute|hardware) → productName
var _SQL_PRODUCT = {
  'General Purpose|Provisioned|Gen5':         'SQL Database Single/Elastic Pool General Purpose - Compute Gen5',
  'General Purpose|Provisioned|Fsv2-series':  'SQL Database Single/Elastic Pool General Purpose - Compute FSv2 Series',
  'General Purpose|Serverless|Gen5':          'SQL Database General Purpose - Serverless - Compute Gen5',
  'Business Critical|Provisioned|Gen5':       'SQL Database Single/Elastic Pool Business Critical - Compute Gen5',
  'Business Critical|Provisioned|M-series':   'SQL Database Single/Elastic Pool Business Critical - Compute M Series',
  'Hyperscale|Provisioned|Gen5':              'SQL Database SingleDB/Elastic Pool Hyperscale - Compute Gen5',
  'Hyperscale|Provisioned|Premium-series':    'SQL Database Single/Elastic Pool Hyperscale - Premium Series Compute',
  'Hyperscale|Provisioned|Premium-series MO': 'SQL Database Single/Elastic Pool Hyperscale - Premium Series Memory Optimized Compute',
  'Hyperscale|Provisioned|DC-series':         'SQL Database Single/Elastic Pool Hyperscale - Compute DC-Series',
  'Hyperscale|Serverless|Gen5':               'SQL Database SingleDB Hyperscale - Serverless - Compute Gen5',
};
// tier별 compute/hardware 옵션 (하드웨어는 계산기 노출 기준. Gen4는 레거시라 제외)
var _SQL_COMPUTE  = { 'General Purpose':['Provisioned','Serverless'], 'Business Critical':['Provisioned'], 'Hyperscale':['Provisioned','Serverless'] };
var _SQL_HARDWARE = { 'General Purpose':['Gen5','Fsv2-series'], 'Business Critical':['Gen5','M-series'], 'Hyperscale':['Gen5','Premium-series','Premium-series MO','DC-series'] };
var _SQL_RED_ZR = '영역 중복(ZR)';
var _SQL_RED_LOCAL = '로컬 중복';

// ── DTU 구매 모델(단일 DB) ── productName=계층, skuName=DTU 크기, 단위 '1/Day'(일일 단가).
var _SQL_DTU_PRODUCT = { 'Basic':'SQL Database Single Basic', 'Standard':'SQL Database Single Standard', 'Premium':'SQL Database Single Premium' };
var _SQL_DTU_SIZES   = { 'Basic':['B'], 'Standard':['S0','S1','S2','S3','S4','S6','S7','S9','S12'], 'Premium':['P1','P2','P4','P6','P11','P15'] };
var _SQL_VCORE_TIERS = ['General Purpose','Business Critical','Hyperscale'];
var _SQL_DTU_TIERS   = ['Basic','Standard','Premium'];

window._svcDefs['Azure SQL Database'] = {
  apiServiceName: 'SQL Database',
  steps: [
    { key:'model',      label:'구매 모델',   options:['vCore','DTU'] },
    { key:'tier',       label:'서비스 계층', options:['General Purpose','Business Critical','Hyperscale'] },
    { key:'compute',    label:'컴퓨팅 계층', options:['Provisioned','Serverless'] },
    { key:'hardware',   label:'하드웨어 종류', options:['Gen5','Fsv2-series'] },
    { key:'vCores',     label:'인스턴스(vCore)', options:['1','2','4','6','8','10','12','14','16','18','20','24','32','40','80'] },
    { key:'redundancy', label:'중복성(재해 복구)', options:[_SQL_RED_LOCAL, _SQL_RED_ZR],
      tooltip:'영역 중복(ZR)은 Zone Redundancy 추가 미터로 과금됩니다. 라이브 가격상 일반적 용도·프로비저닝됨·Gen5 조합에만 추가요금이 있으며, 그 외 조합은 로컬 기준으로 계산됩니다.' },
    { key:'dtuSize',    label:'DTU 크기', options:['S0','S1','S2','S3','S4','S6','S7','S9','S12'] },
  ],
  instanceField: false,
  // 구매 모델·계층 변경 시 하위 옵션(compute/hardware/vCore/redundancy ↔ DTU 크기)을 다시 구성
  instanceParentKey: 'tier',
  rebuildKeys: ['model'],
  _applyStepVisibility: function(r){ if (window['_sql_applyStepVisibility']) window['_sql_applyStepVisibility'](r); },
};

window['_sql_applyStepVisibility'] = function(r) {
  var def = window._svcDefs['Azure SQL Database'];
  if (!def || !def.steps) return;
  var o = r.options || {};
  var isDTU = (o.model === 'DTU');
  var tiers = isDTU ? _SQL_DTU_TIERS : _SQL_VCORE_TIERS;
  if (tiers.indexOf(o.tier) < 0) r.options.tier = tiers[0];
  var tier = r.options.tier;
  var comp = _SQL_COMPUTE[tier]  || ['Provisioned'];
  var hw   = _SQL_HARDWARE[tier] || ['Gen5'];
  var dtu  = _SQL_DTU_SIZES[tier] || ['B'];
  for (var i = 0; i < def.steps.length; i++) {
    var step = def.steps[i], k = step.key;
    if (k === 'tier')       { step.options = tiers; }
    if (k === 'compute')    { step._hidden = isDTU; step.options = comp; if (!isDTU && comp.indexOf(o.compute) < 0) r.options.compute = comp[0]; }
    if (k === 'hardware')   { step._hidden = isDTU; step.options = hw;   if (!isDTU && hw.indexOf(o.hardware) < 0)   r.options.hardware = hw[0]; }
    if (k === 'vCores')     { step._hidden = isDTU; }
    if (k === 'redundancy') { step._hidden = isDTU; }
    if (k === 'dtuSize')    { step._hidden = !isDTU; step.options = dtu; if (isDTU && dtu.indexOf(o.dtuSize) < 0)    r.options.dtuSize = dtu[0]; }
  }
};

window['_buildDetail_Azure_SQL_Database'] = function(r) {
  var o = r.options || {};
  window['_sql_applyStepVisibility'](r);
  if (o.model === 'DTU') {
    r.skuName = o.dtuSize || '';
    r.detail  = ['DTU', o.tier, o.dtuSize].filter(Boolean).join(', ');
  } else {
    var red = (o.redundancy === _SQL_RED_ZR) ? 'ZR' : '로컬';
    r.skuName = [o.tier, o.compute, (o.vCores ? o.vCores + 'vCore' : '')].filter(Boolean).join(' ').trim();
    r.detail  = [o.tier, o.compute, o.hardware, (o.vCores ? o.vCores + ' vCore' : ''), red].filter(Boolean).join(', ');
  }
};

// DTU 모델(단일 DB) 가격 조회 — productName=계층, skuName=DTU 크기, '1/Day' → 시간당가(÷24)
async function _resolve_sql_dtu(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'Basic';
  var size = o.dtuSize || (_SQL_DTU_SIZES[tier] || ['B'])[0];
  var product = _SQL_DTU_PRODUCT[tier];
  var label = 'DTU / ' + tier + ' / ' + size;
  if (!product) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure SQL Database ' + label + ': 지원하지 않는 계층입니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var items = [];
  try {
    items = await apiFetch({ serviceName:'SQL Database', armRegionName:row.region, productName:product, priceType:'Consumption' }, cur, 300, 4, {pageSize:200, expectedSizeKB:80});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure SQL Database 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }
  // skuName 정확 일치(=DTU 크기). Secondary(지오 복제 보조 DB) 행은 자연히 제외됨('S4 Secondary' != 'S4')
  var cands = items.filter(function(it){
    return String(it.type||'').toLowerCase()==='consumption' && String(it.skuName||'') === size;
  }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;
  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure SQL Database ' + label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var dayPrice = Number(chosen.unitPrice);
  var hourly = dayPrice / 24;   // '1/Day' → 시간당. 엔진: 월=시간당×Qty×usage(예 730)
  row.paygItem = {
    currencyCode: cur, unitPrice: hourly, retailPrice: hourly,
    armRegionName: row.region, productName: product, skuName: size,
    meterName: chosen.meterName, unitOfMeasure: '1 Hour (from 1/Day)', type: 'Consumption',
    _dtuDayPrice: dayPrice,
  };
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;  // DTU는 절약/예약 미제공
  setStatus('ok', 'Azure SQL Database ' + label + ' 완료 · ' + hourly.toFixed(4) + ' /1 Hour (일 ' + dayPrice + ')');
  updatePriceCells(row); updateTotalsRow();
}

// 가격 조회 — productName(tier|compute|hardware) 내에서 vCore 단가를 찾아 N vCore로 환산(+ZR add-on)
window['_resolve_Azure_SQL_Database'] = async function(row, cur) {
  var o = row.options || {};
  if (o.model === 'DTU') return _resolve_sql_dtu(row, cur);
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
