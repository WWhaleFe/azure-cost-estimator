// ================================================================
// services/mysql.js — Azure Database for MySQL (Flexible Server)
//
//   v71부터 전용 resolver(_resolve_Azure_Database_for_MySQL)로 계층별 컴퓨팅 요금을 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Azure Database for MySQL'.
//   Flexible Server 기준. 계층마다 과금 구조가 달라 입력 필드를 전환한다
//     (instanceParentKey='tier' + _mysql_applyStepVisibility):
//     - Burstable        → productName '...Flexible Server Burstable BS Series Compute'
//                          인스턴스(instance) 선택, meterName=인스턴스 정확 일치(B1MS 0.026 ~ B20MS 2.08, 1 Hour)
//     - General Purpose  → productName '...Flexible Server General Purpose Ddsv5 Series Compute'
//                          vCore 수 선택, per-vCore 단가(skuName='vCore', meter 'vCore', 0.118) × N
//     - Business Critical→ productName '...Flexible Server Memory Optimized Edsv5 Series Compute'
//                          vCore 수 선택, meterName='<N> vCore' 정확 일치(전체 인스턴스 시간당가)
//   월=단가×Qty(서버 수)×usage(시간, 예 730). 못 찾으면 "매칭 실패".
//   절약 플랜(1년)·예약(1·3년)도 표시: 용량제로 쓴 항목의 savingsPlan을 같은 배수로 환산하고,
//     예약은 세대 무관 generic "<GP/MO> Series Compute" 제품(skuName='vCore')을 시간당 단가로 환산 × N.
//     Burstable은 예약 미제공(빈칸 정상), 절약은 현재 1년만 노출(API에 3년 없음).
//   범위 외(매칭 실패 정상): Single Server(레거시), 스토리지/백업, 다른 D/E 시리즈(Dadsv6·Edsv6 등),
//     Confidential Compute, Extended Support.
// ================================================================

var _MYSQL_BURST_INSTANCES = ['B1MS','B2S','B2MS','B4MS','B8MS','B12MS','B16MS','B20MS'];
var _MYSQL_GP_VCORES = ['1','2','4','8','16','32','48','64','96'];
var _MYSQL_BC_VCORES = ['2','4','8','16','20','32','48','64','96','104'];
var _MYSQL_PRODUCT = {
  'Burstable':         'Azure Database for MySQL Flexible Server Burstable BS Series Compute',
  'General Purpose':   'Azure Database for MySQL Flexible Server General Purpose Ddsv5 Series Compute',
  'Business Critical': 'Azure Database for MySQL Flexible Server Memory Optimized Edsv5 Series Compute',
};
// 예약(Reservation)은 하드웨어 세대별 제품이 아니라 세대 무관 generic "Series Compute" 제품에 존재
// (Ddsv5/Edsv5 자체엔 예약 미터 없음). Burstable은 예약 미제공.
var _MYSQL_RESV_PRODUCT = {
  'General Purpose':   'Azure Database for MySQL Flexible Server General Purpose Series Compute',
  'Business Critical': 'Azure Database for MySQL Flexible Server Memory Optimized Series Compute',
};
// 하드웨어 세대(계산기 '인스턴스 시리즈') — 세대별 per-vCore 단가가 다름(예 GP Ddsv5 $0.118 vs Ddsv6 $0.151).
//   표시 라벨 → productName 시리즈 토큰. Burstable은 세대 선택 없음(BS 단일).
var _MYSQL_GP_GEN = { 'Ddsv5':'Ddsv5', 'Ddsv6':'Ddsv6', 'Dadsv5 (AMD)':'Dadsv5', 'Dadsv6 (AMD)':'Dadsv6' };
var _MYSQL_BC_GEN = { 'Edsv5':'Edsv5', 'Edsv6':'Edsv6', 'Eadsv5 (AMD)':'Eadsv5', 'Eadsv6 (AMD)':'Eadsv6' };
function _mysqlProduct(tier, gen){
  if (tier === 'Burstable') return _MYSQL_PRODUCT['Burstable'];
  if (tier === 'General Purpose') return 'Azure Database for MySQL Flexible Server General Purpose ' + (_MYSQL_GP_GEN[gen] || 'Ddsv5') + ' Series Compute';
  return 'Azure Database for MySQL Flexible Server Memory Optimized ' + (_MYSQL_BC_GEN[gen] || 'Edsv5') + ' Series Compute';
}

window._svcDefs['Azure Database for MySQL'] = {
  apiServiceName: 'Azure Database for MySQL',
  steps: [
    { key:'tier',     label:'계층',      options:['Burstable','General Purpose','Business Critical'] },
    { key:'instance', label:'인스턴스',  options:['B1MS','B2S','B2MS','B4MS','B8MS','B12MS','B16MS','B20MS'] },
    { key:'series',   label:'인스턴스 시리즈', options:['Ddsv5','Ddsv6','Dadsv5 (AMD)','Dadsv6 (AMD)'] },
    { key:'vCores',   label:'인스턴스(vCore)',  options:['1','2','4','8','16','32','48','64'] },
  ],
  instanceField: false,
  // 계층 변경 시 인스턴스/vCore 필드 노출과 옵션을 다시 구성
  instanceParentKey: 'tier',
  _applyStepVisibility: function(r){ if (window['_mysql_applyStepVisibility']) window['_mysql_applyStepVisibility'](r); },
};

window['_mysql_applyStepVisibility'] = function(r) {
  var def = window._svcDefs['Azure Database for MySQL'];
  if (!def || !def.steps) return;
  var o = r.options || {};
  // 구버전 CSV 호환(v101): vCores가 숫자로 오면 문자열 옵션 목록과 불일치해
  //   조용히 1 vCore로 리셋되던 것 방지. 옛 SKU 열 키(compute)는 인스턴스로 수용.
  if (o.vCores !== undefined && o.vCores !== '' && typeof o.vCores !== 'string') r.options.vCores = String(o.vCores);
  if (!o.instance && o.compute) r.options.instance = String(o.compute);
  o = r.options;
  var tier = o.tier || 'Burstable';
  var isBurst = (tier === 'Burstable');
  var vcoreOpts = (tier === 'Business Critical') ? _MYSQL_BC_VCORES : _MYSQL_GP_VCORES;
  var genOpts = (tier === 'Business Critical') ? Object.keys(_MYSQL_BC_GEN) : Object.keys(_MYSQL_GP_GEN);
  for (var i = 0; i < def.steps.length; i++) {
    var k = def.steps[i].key;
    if (k === 'instance') {
      def.steps[i]._hidden = !isBurst;
      def.steps[i].options = _MYSQL_BURST_INSTANCES;
      if (isBurst && _MYSQL_BURST_INSTANCES.indexOf(o.instance) < 0) r.options.instance = _MYSQL_BURST_INSTANCES[0];
    }
    if (k === 'series') {
      def.steps[i]._hidden = isBurst;       // Burstable은 세대 선택 없음
      def.steps[i].options = genOpts;
      if (!isBurst && genOpts.indexOf(o.series) < 0) r.options.series = genOpts[0];
    }
    if (k === 'vCores') {
      def.steps[i]._hidden = isBurst;
      def.steps[i].options = vcoreOpts;
      if (!isBurst && vcoreOpts.indexOf(o.vCores) < 0) r.options.vCores = vcoreOpts[0];
    }
  }
};

window['_buildDetail_Azure_Database_for_MySQL'] = function(r) {
  var o = r.options || {};
  window['_mysql_applyStepVisibility'](r);
  // tier 미선택 시 resolver와 동일하게 Burstable로 간주(v101) — 기존엔 인스턴스만 고르면
  // else 분기로 빠져 skuName이 비고, 엔진이 조회를 조용히 생략(가격 미표시)했음
  if ((o.tier || 'Burstable') === 'Burstable') {
    r.skuName = o.instance || '';
    r.detail = ['Burstable', o.instance].filter(Boolean).join(' - ');
  } else {
    r.skuName = (o.vCores ? o.vCores + 'vCore' : '');
    r.detail = [o.tier, o.series, (o.vCores ? o.vCores + ' vCore' : '')].filter(Boolean).join(' - ');
  }
};

// 가격 조회 — 계층별 productName 안에서 인스턴스(Burstable)/vCore(GP·BC) 미터를 매칭
window['_resolve_Azure_Database_for_MySQL'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'Burstable';
  var product = _mysqlProduct(tier, o.series);   // 세대(인스턴스 시리즈) 반영
  if (!product) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure Database for MySQL: 지원하지 않는 계층입니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Azure Database for MySQL', armRegionName:row.region, productName:product, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:50});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure Database for MySQL 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var isCons = function(it){ return String(it.type||'').toLowerCase() === 'consumption'; };
  var chosen = null, price = null, label = '', perVcore = null, N = 0;

  if (tier === 'Burstable') {
    var inst = o.instance || _MYSQL_BURST_INSTANCES[0];
    label = 'Burstable / ' + inst;
    chosen = items.filter(function(it){ return isCons(it) && String(it.meterName||'').toLowerCase() === inst.toLowerCase(); })
                  .sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); })[0] || null;
    if (chosen) price = Number(chosen.unitPrice);
  } else {
    N = parseInt(o.vCores, 10); if (!(N > 0)) N = 2;
    label = tier + ' / ' + (o.series || '') + ' / ' + N + ' vCore';
    // 세대별 가격 구조가 달라 통합 매칭: per-vCore(skuName 'vCore'/'1 vCore') × N 우선, 없으면 '<N> vCore' 정확 일치
    var base = items.filter(function(it){ return isCons(it) && String(it.meterName||'').toLowerCase() === 'vcore' && (String(it.skuName||'').toLowerCase() === 'vcore' || String(it.skuName||'').toLowerCase() === '1 vcore'); })[0];
    if (base) { perVcore = Number(base.unitPrice); price = perVcore * N; chosen = base; }
    else {
      // 정확 일치 fallback(예 Edsv5 세대는 '<N> vCore' 미터)
      chosen = items.filter(function(it){ return isCons(it) && String(it.meterName||'').toLowerCase() === (N + ' vcore'); })
                    .sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); })[0] || null;
      if (chosen) price = Number(chosen.unitPrice);
    }
  }

  if (price === null || chosen == null) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure Database for MySQL ' + label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 설정 1개의 시간당가를 paygItem으로 구성(엔진: 월=단가×Qty×usage)
  row.paygItem = {
    currencyCode: cur, unitPrice: price, retailPrice: price,
    armRegionName: row.region, productName: product,
    skuName: (tier === 'Burstable') ? (o.instance||'') : (N + ' vCore'),
    meterName: chosen.meterName, unitOfMeasure: '1 Hour', type: 'Consumption',
    _mysqlPerVcore: perVcore, _mysqlVcores: (tier === 'Burstable') ? null : N,
  };

  // ── 절약 플랜 / 예약(RI) ──
  // 절약: 용량제로 쓴 항목의 savingsPlan을 같은 배수로(per-vCore면 ×N, 인스턴스/전체 N vCore면 ×1)
  var spBase = chosen, spMult = 1;
  if (tier !== 'Burstable') {
    var pvBase = items.filter(function(it){ return isCons(it) && String(it.meterName||'').toLowerCase()==='vcore' && String(it.skuName||'').toLowerCase()==='vcore'; })[0];
    if (pvBase) { spBase = pvBase; spMult = N; }
  }
  var sp = spItemsFromBase(spBase, spMult, cur);
  // 예약: 세대 무관 generic "Series Compute" 제품에서 skuName='vCore' 1·3년 → 시간당 환산 × N (Burstable 미제공)
  var ri = { ri1:null, ri3:null };
  var resvProduct = _MYSQL_RESV_PRODUCT[tier];
  if (resvProduct) {
    var resv = [];
    try { resv = await apiFetch({ serviceName:'Azure Database for MySQL', armRegionName:row.region, productName:resvProduct, priceType:'Reservation' }, cur, 200, 3, {pageSize:200, expectedSizeKB:40}); } catch(e) { resv = []; }
    ri = riItemsFromResv(resv, 'vcore', N, cur);
  }

  row.sp1Item = sp.sp1; row.sp3Item = sp.sp3; row.ri1Item = ri.ri1; row.ri3Item = ri.ri3;
  var tags = ['PAYG']; if(sp.sp1)tags.push('SP1Y'); if(sp.sp3)tags.push('SP3Y'); if(ri.ri1)tags.push('RI1Y'); if(ri.ri3)tags.push('RI3Y');
  var basis = (tier === 'General Purpose') ? (' [per-vCore ' + perVcore + ' × ' + N + ']') : '';
  setStatus('ok', 'Azure Database for MySQL ' + label + ' 완료 [' + tags.join(', ') + '] · ' + price.toFixed(4) + ' /1 Hour' + basis);
  updatePriceCells(row); updateTotalsRow();
};
