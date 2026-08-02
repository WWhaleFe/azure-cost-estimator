import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
// ================================================================
// services/sql-managed-instance.js — Azure SQL Managed Instance (vCore)
//
//   전용 resolver로 MI 컴퓨팅 요금을 매칭합니다(가격 하드코딩 없음, 라이브 API).
//   serviceName='SQL Managed Instance'. 구조는 SQL Database vCore와 동일:
//     계층(tier)×하드웨어(hardware) → productName + vCore 수(N) 선택.
//       GP|Gen5            → 'SQL Managed Instance General Purpose - Compute Gen5'
//       GP|Premium-series  → 'SQL Managed Instance General Purpose - Premium Series Compute'
//       GP|Premium-series MO → '... General Purpose - Premium Series Memory Optimized Compute'
//       BC|Gen5/Premium-series/Premium-series MO → 동일 패턴(Business Critical)
//   가격: meter 'vCore' 에서 skuName='<N> vCore' 정확가 우선, 없으면 per-vCore('vCore'/'1 vCore')×N.
//   중복성(재해 복구): 로컬 / 영역 중복(ZR). ZR이면 meter 'Zone Redundancy vCore'('<N> vCore Zone
//     Redundancy' 우선/없으면 'vCore ZR Zone Redundancy'·'1 vCore Zone Redundancy'×N)를 add-on 합산.
//   절약 플랜(1년)·예약(1·3년)도 표시(per-vCore savingsPlan ×N, 같은 productName Reservation ×N).
//   월=시간당가×Qty(인스턴스 수)×usage(시간, 예 730). MI는 항상 Provisioned(Serverless 없음).
//   범위 외(매칭 실패 정상): 추가 메모리(Addl Memory)·백업·인스턴스 풀, 표에 없는 조합.
// ================================================================

var _SQLMI_PRODUCT = {
  'General Purpose|Gen5':              'SQL Managed Instance General Purpose - Compute Gen5',
  'General Purpose|Premium-series':    'SQL Managed Instance General Purpose - Premium Series Compute',
  'General Purpose|Premium-series MO': 'SQL Managed Instance General Purpose - Premium Series Memory Optimized Compute',
  'Business Critical|Gen5':              'SQL Managed Instance Business Critical - Compute Gen5',
  'Business Critical|Premium-series':    'SQL Managed Instance Business Critical - Premium Series Compute',
  'Business Critical|Premium-series MO': 'SQL Managed Instance Business Critical - Premium Series Memory Optimized Compute',
};
var _SQLMI_RED_ZR = '영역 중복(ZR)';
var _SQLMI_RED_LOCAL = '로컬 중복';

// ── SQL 라이선스(AHB) ── SQL Database와 동일: 'vCore' 단가는 컴퓨팅 전용(=AHB)이고,
//   '라이선스 포함'은 SQL Server 코어 라이선스를 더한다(GP=Standard $0.10, BC=Enterprise $0.375 /vCore/h).
//   라이선스는 Retail API 미제공 → USD 상수, 통화는 컴퓨팅 미터의 USD↔선택통화 FX를 API에서 도출해 환산.
var _SQLMI_LICENSE_USD = { 'General Purpose': 0.10, 'Business Critical': 0.375 };
var _SQLMI_LIC_INCLUDED = '라이선스 포함';
var _SQLMI_LIC_AHB = 'Azure Hybrid Benefit';

REG._svcDefs['Azure SQL Managed Instance'] = {
  apiServiceName: 'SQL Managed Instance',
  steps: [
    { key:'tier',       label:'서비스 계층', options:['General Purpose','Business Critical'] },
    { key:'hardware',   label:'하드웨어 종류', options:['Gen5','Premium-series','Premium-series MO'] },
    { key:'vCores',     label:'인스턴스(vCore)', options:['4','8','16','24','32','40','64','80'] },
    { key:'redundancy', label:'중복성(재해 복구)', options:[_SQLMI_RED_LOCAL, _SQLMI_RED_ZR],
      tooltip:'영역 중복(ZR)은 Zone Redundancy vCore 추가 미터로 과금됩니다(용량제·절약·예약에 add-on). 추가 미터가 없는 조합은 로컬 기준으로 폴백합니다.' },
    { key:'license',    label:'SQL 라이선스', options:[_SQLMI_LIC_INCLUDED, _SQLMI_LIC_AHB],
      tooltip:'라이선스 포함=컴퓨팅+SQL Server 코어 라이선스(계산기 기본값). Azure Hybrid Benefit=보유 라이선스 적용으로 라이선스 비용 제외(컴퓨팅만). Retail API는 컴퓨팅(=AHB) 단가만 제공하여, 라이선스는 Azure 공시 코어 단가를 더함.' },
  ],
  instanceField: false,
};

REG['_buildDetail_Azure_SQL_Managed_Instance'] = function(r) {
  var o = r.options || {};
  var red = (o.redundancy === _SQLMI_RED_ZR) ? 'ZR' : '로컬';
  var lic = (o.license === _SQLMI_LIC_AHB) ? 'AHB' : '라이선스 포함';
  r.skuName = [o.tier, (o.vCores ? o.vCores + 'vCore' : '')].filter(Boolean).join(' ').trim();
  r.detail  = [o.tier, o.hardware, (o.vCores ? o.vCores + ' vCore' : ''), red, lic].filter(Boolean).join(', ');
};

// 가격 조회 — SQL Database vCore와 동일 패턴(로컬 + ZR add-on, 절약/예약 포함)
REG['_resolve_Azure_SQL_Managed_Instance'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'General Purpose';
  var hw   = o.hardware || 'Gen5';
  var N    = parseInt(o.vCores, 10); if (!(N > 0)) N = 4;
  var isZR = (o.redundancy === _SQLMI_RED_ZR);
  var label = tier + ' / ' + hw + ' / ' + N + ' vCore / ' + (isZR ? 'ZR' : '로컬');

  var product = _SQLMI_PRODUCT[tier + '|' + hw];
  if (!product) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'SQL Managed Instance ' + label + ': 지원하지 않는 조합입니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items = [];
  try {
    items = await apiFetch({ serviceName:'SQL Managed Instance', armRegionName:row.region, productName:product, priceType:'Consumption' }, cur, 300, 4, {pageSize:200, expectedSizeKB:120});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'SQL Managed Instance 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var isCons  = function(it){ return String(it.type||'').toLowerCase() === 'consumption'; };
  var meterIs = function(it,m){ return String(it.meterName||'').toLowerCase() === m; };
  var skuIs   = function(it,s){ return String(it.skuName||'').toLowerCase() === s; };

  function addItems(a, b, lab){
    if (!a) return null;
    if (!b) return a;
    var up = Number(a.unitPrice) + Number(b.unitPrice);
    var rp = Number(a.retailPrice||a.unitPrice) + Number(b.retailPrice||b.unitPrice);
    return { currencyCode:cur, unitPrice:up, retailPrice:rp, armRegionName:a.armRegionName,
      productName:a.productName, skuName:(lab||a.skuName), meterName:a.meterName,
      unitOfMeasure:'1 Hour', type:a.type, term:a.term };
  }
  function computePrice(meterLower, exactSku, perVcoreSkus){
    var exact = items.filter(function(it){ return isCons(it) && meterIs(it, meterLower) && skuIs(it, exactSku); })
                     .sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); })[0];
    if (exact) return { price:Number(exact.unitPrice), basis:'exact ' + exactSku };
    var base = null;
    for (var i = 0; i < perVcoreSkus.length && !base; i++) {
      base = items.filter(function(it){ return isCons(it) && meterIs(it, meterLower) && skuIs(it, perVcoreSkus[i]); })[0];
    }
    if (base) return { price:Number(base.unitPrice) * N, basis:'per-vCore × ' + N };
    return null;
  }

  var local = computePrice('vcore', N + ' vcore', ['vcore', '1 vcore']);
  if (!local) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'SQL Managed Instance ' + label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var zr = null, zrMissing = false;
  if (isZR) {
    zr = computePrice('zone redundancy vcore', N + ' vcore zone redundancy', ['vcore zr zone redundancy', '1 vcore zone redundancy']);
    if (!zr) zrMissing = true;
  }
  var computePriceCur = local.price + (zr ? zr.price : 0);

  // SQL 라이선스(AHB) — '라이선스 포함'이면 SQL Server 코어 라이선스를 컴퓨팅에 더함(USD 상수 → API FX 환산).
  var licMode = o.license || _SQLMI_LIC_INCLUDED;
  var licUSDrate = (licMode === _SQLMI_LIC_INCLUDED) ? (_SQLMI_LICENSE_USD[tier] || 0) : 0;
  var licAddon = 0;
  if (licUSDrate > 0 && N > 0) {
    var perVcoreCur = local.price / N;
    var perVcoreUSD = perVcoreCur;
    if (String(cur).toUpperCase() !== 'USD') {
      try {
        var usdItems = await apiFetch({ serviceName:'SQL Managed Instance', armRegionName:row.region, productName:product, priceType:'Consumption' }, 'USD', 300, 4, {pageSize:200, expectedSizeKB:120});
        var ub = usdItems.filter(function(it){ return isCons(it) && meterIs(it,'vcore') && (skuIs(it,'vcore')||skuIs(it,'1 vcore')); })[0];
        var ue = usdItems.filter(function(it){ return isCons(it) && meterIs(it,'vcore') && skuIs(it, N+' vcore'); })[0];
        if (ub) perVcoreUSD = Number(ub.unitPrice);
        else if (ue) perVcoreUSD = Number(ue.unitPrice) / N;
      } catch(e) { /* FX 실패 시 근사 */ }
    }
    var fx = (perVcoreUSD > 0) ? (perVcoreCur / perVcoreUSD) : 1;
    licAddon = licUSDrate * N * fx;
  }
  function addLic(it){ if(!it || licAddon<=0) return it; var p=Number(it.unitPrice)+licAddon; return Object.assign({}, it, {unitPrice:p, retailPrice:p, _sqlLicAddon:licAddon}); }

  var price = computePriceCur + licAddon;
  var basis = local.basis + (zr ? ' + ZR(' + zr.basis + ')' : '') + (licAddon>0 ? ' + 라이선스' : (licMode===_SQLMI_LIC_AHB?' (AHB)':''));

  row.paygItem = {
    currencyCode: cur, unitPrice: price, retailPrice: price,
    armRegionName: row.region, productName: product,
    skuName: N + ' vCore' + (isZR ? ' (ZR)' : '') + (licAddon>0?' +Lic':''), meterName: 'vCore', unitOfMeasure: '1 Hour', type: 'Consumption',
    _sqlVcores: N, _sqlBasis: basis, _sqlZR: isZR, _sqlLicMode: licMode, _sqlLicAddon: licAddon,
  };

  // 절약(1년) — per-vCore Consumption savingsPlan × N (로컬 + ZR add-on)
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

  // 예약(1·3년) — 같은 productName의 Reservation에서 skuName 일치분을 시간당 환산 × N (로컬 + ZR add-on)
  var resv = [];
  try { resv = await apiFetch({ serviceName:'SQL Managed Instance', armRegionName:row.region, productName:product, priceType:'Reservation' }, cur, 200, 3, {pageSize:200, expectedSizeKB:60}); } catch(e) { resv = []; }
  var riLocal = riItemsFromResv(resv, 'vcore', N, cur);
  var riZR = (isZR && !zrMissing) ? riItemsFromResv(resv, 'vcore zr zone redundancy', N, cur) : { ri1:null, ri3:null };
  var ri1 = addItems(riLocal.ri1, (isZR ? riZR.ri1 : null), N + ' vCore RI1Y' + (isZR ? ' (ZR)' : ''));
  var ri3 = addItems(riLocal.ri3, (isZR ? riZR.ri3 : null), N + ' vCore RI3Y' + (isZR ? ' (ZR)' : ''));

  row.sp1Item = addLic(sp1); row.sp3Item = addLic(sp3); row.ri1Item = addLic(ri1); row.ri3Item = addLic(ri3);

  var tags = ['PAYG']; if(sp1)tags.push('SP1Y'); if(sp3)tags.push('SP3Y'); if(ri1)tags.push('RI1Y'); if(ri3)tags.push('RI3Y');
  var note = (licAddon>0 ? ' · 라이선스 포함(+'+licAddon.toFixed(2)+'/h)' : (licMode===_SQLMI_LIC_AHB?' · AHB: SQL 라이선스 제외':'')) + (zrMissing ? ' · 이 조합은 영역 중복 추가요금 미터 없음 → 로컬 기준' : '');
  setStatus('ok', 'SQL Managed Instance ' + label + ' 완료 [' + tags.join(', ') + '] · ' + price.toFixed(4) + ' /1 Hour [' + basis + ']' + note);
  updatePriceCells(row); updateTotalsRow();
};
