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
//   월=단가×Qty(서버 수)×usage(시간, 예 730). 절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외(매칭 실패 정상): Single Server(레거시), 스토리지/백업, 다른 D/E 시리즈(Dadsv6·Edsv6 등),
//     Confidential Compute, Extended Support.
// ================================================================

var _MYSQL_BURST_INSTANCES = ['B1MS','B2S','B2MS','B4MS','B8MS','B12MS','B16MS','B20MS'];
var _MYSQL_GP_VCORES = ['1','2','4','8','16','32','48','64'];
var _MYSQL_BC_VCORES = ['2','4','8','16','20','32','48','64','96','104'];
var _MYSQL_PRODUCT = {
  'Burstable':         'Azure Database for MySQL Flexible Server Burstable BS Series Compute',
  'General Purpose':   'Azure Database for MySQL Flexible Server General Purpose Ddsv5 Series Compute',
  'Business Critical': 'Azure Database for MySQL Flexible Server Memory Optimized Edsv5 Series Compute',
};

window._svcDefs['Azure Database for MySQL'] = {
  apiServiceName: 'Azure Database for MySQL',
  steps: [
    { key:'tier',     label:'계층',      options:['Burstable','General Purpose','Business Critical'] },
    { key:'instance', label:'인스턴스',  options:['B1MS','B2S','B2MS','B4MS','B8MS','B12MS','B16MS','B20MS'] },
    { key:'vCores',   label:'vCore 수',  options:['1','2','4','8','16','32','48','64'] },
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
  var tier = o.tier || 'Burstable';
  var isBurst = (tier === 'Burstable');
  var vcoreOpts = (tier === 'Business Critical') ? _MYSQL_BC_VCORES : _MYSQL_GP_VCORES;
  for (var i = 0; i < def.steps.length; i++) {
    var k = def.steps[i].key;
    if (k === 'instance') {
      def.steps[i]._hidden = !isBurst;
      def.steps[i].options = _MYSQL_BURST_INSTANCES;
      if (isBurst && _MYSQL_BURST_INSTANCES.indexOf(o.instance) < 0) r.options.instance = _MYSQL_BURST_INSTANCES[0];
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
  if (o.tier === 'Burstable') {
    r.skuName = o.instance || '';
    r.detail = ['Burstable', o.instance].filter(Boolean).join(' - ');
  } else {
    r.skuName = (o.vCores ? o.vCores + 'vCore' : '');
    r.detail = [o.tier, (o.vCores ? o.vCores + ' vCore' : '')].filter(Boolean).join(' - ');
  }
};

// 가격 조회 — 계층별 productName 안에서 인스턴스(Burstable)/vCore(GP·BC) 미터를 매칭
window['_resolve_Azure_Database_for_MySQL'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'Burstable';
  var product = _MYSQL_PRODUCT[tier];
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
    label = tier + ' / ' + N + ' vCore';
    if (tier === 'General Purpose') {
      // per-vCore 단가 × N
      var base = items.filter(function(it){ return isCons(it) && String(it.meterName||'').toLowerCase() === 'vcore' && String(it.skuName||'').toLowerCase() === 'vcore'; })[0]
              || items.filter(function(it){ return isCons(it) && String(it.meterName||'').toLowerCase() === 'vcore'; })[0];
      if (base) { perVcore = Number(base.unitPrice); price = perVcore * N; chosen = base; }
    } else {
      // Business Critical: meterName='<N> vCore' 정확 일치(전체 인스턴스 시간당가)
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
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var basis = (tier === 'General Purpose') ? (' [per-vCore ' + perVcore + ' × ' + N + ']') : '';
  setStatus('ok', 'Azure Database for MySQL ' + label + ' 완료 · ' + price.toFixed(4) + ' /1 Hour' + basis);
  updatePriceCells(row); updateTotalsRow();
};
