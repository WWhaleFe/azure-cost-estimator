import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, spItemsFromBase, riItemsFromResv, pickTieredMeter, tierNote } from '../core/kernel.js';
import type { Row, ApiItem, RiPair } from '../core/kernel.js';
// ================================================================
// services/postgresql.ts — Azure Database for PostgreSQL (Flexible Server)
//
//   전용 resolver(_resolve_Azure_Database_for_PostgreSQL). 가격 하드코딩 없음(Retail Prices API 실시간).
//   serviceName='Azure Database for PostgreSQL'. MySQL(mysql.ts)과 컴퓨팅 구조는 같지만
//   저장소·백업도 청구 항목으로 고를 수 있게 했다(한 행 = 한 청구 항목, Backup 서비스와 같은 방식).
//   instanceParentKey='metric'(청구 항목) + rebuildKeys=['tier'] → _pg_applyStepVisibility 가 필드를 전환한다.
//
//   ① 컴퓨팅 (시간) — 계층별 productName
//     - Burstable         '...Flexible Server Burstable BS Series Compute'
//                         인스턴스 = skuName 대소문자 무시 일치(B1MS·B2S·B2ms…; meterName 은 'B2ms vCore' 처럼 들쭉날쭉)
//     - General Purpose   '...Flexible Server General Purpose <세대> Series Compute'
//     - Memory Optimized  '...Flexible Server Memory Optimized <세대> Series Compute'
//                         per-vCore(skuName 'vCore' 또는 '1 vCore') 단가 × vCore 수
//     예약(1·3년)은 MySQL 과 달리 **세대별 제품 자체**에 skuName='vCore' 로 있다(Dadsv6·Eadsv6 등 신세대는 없음 → 빈칸 정상).
//     절약 플랜은 per-vCore 항목의 savingsPlan(1년) × vCore 수.
//   ② 저장소·IOPS — productName='Azure Database for PostgreSQL Flex Server Storage', meterName 정확 일치
//     Premium SSD(GB/월) · Premium SSD v2(GiB/월·IOPS·MBps) · Premium SSD 추가 IOPS
//   ③ 백업 저장소 — productName='...Flexible Server Backup Storage', 'Backup Storage LRS Data Stored'
//     프로비저닝 저장소 크기만큼은 무료 → usage 칸에 **무료분을 넘는 GB** 만 적는다.
//
//   고가용성(HA): 대기 서버가 같은 사양으로 하나 더 뜨므로 컴퓨팅·저장소·IOPS 단가 ×2(백업은 그대로).
//     Burstable 은 HA 를 지원하지 않아 컴퓨팅에선 숨긴다.
//   월=단가×Qty×usage(엔진 기본). 컴퓨팅 usage=월 사용시간(730), 저장소·백업 usage=GB, IOPS/처리량 usage=프로비저닝 값.
//   범위 외(매칭 실패 정상): Single Server(레거시), Confidential Compute, Mdsv2, Extended Support, Ultra Disk, 지역 중복 백업.
// ================================================================

var _PG_SVC = 'Azure Database for PostgreSQL';
var _PG_COMPUTE = '컴퓨팅 (시간)';
var _PG_BACKUP = '백업 저장소 (GB/월, 무료분 초과)';
// 청구 항목(노출명) → 저장소 계열 productName + meterName(소문자). 컴퓨팅은 별도 경로
var _PG_STORAGE_PRODUCT = 'Azure Database for PostgreSQL Flex Server Storage';
var _PG_BACKUP_PRODUCT = 'Azure Database for PostgreSQL Flexible Server Backup Storage';
var _PG_METERS: Record<string, { prod: string; meter: string }> = {
  '저장소 - Premium SSD (GB/월)':       { prod:_PG_STORAGE_PRODUCT, meter:'storage data stored' },
  '추가 IOPS - Premium SSD (IOPS/월)':  { prod:_PG_STORAGE_PRODUCT, meter:'iops scaling provisioned iops' },
  '저장소 - Premium SSD v2 (GiB/월)':   { prod:_PG_STORAGE_PRODUCT, meter:'premium ssd v2 storage data stored' },
  'Premium SSD v2 IOPS (IOPS/월)':      { prod:_PG_STORAGE_PRODUCT, meter:'premium ssd v2 iops provisioned iops' },
  'Premium SSD v2 처리량 (MBps/월)':    { prod:_PG_STORAGE_PRODUCT, meter:'premium ssdv2 throughput prov throughput (mbps)' },
  '백업 저장소 (GB/월, 무료분 초과)':   { prod:_PG_BACKUP_PRODUCT,  meter:'backup storage lrs data stored' },
};
var _PG_METRICS = [_PG_COMPUTE].concat(Object.keys(_PG_METERS));

var _PG_BURST_INSTANCES = ['B1MS','B2S','B2ms','B4ms','B8ms','B12ms','B16ms','B20ms'];
var _PG_GP_VCORES = ['2','4','8','16','32','48','64','96'];
var _PG_MO_VCORES = ['2','4','8','16','20','32','48','64','96'];
// 하드웨어 세대(계산기 '인스턴스 시리즈') 표시 라벨 → productName 시리즈 토큰
var _PG_GP_GEN: Record<string,string> = { 'Ddsv5':'Ddsv5', 'Ddsv6':'Ddsv6', 'Dadsv5 (AMD)':'Dadsv5', 'Dadsv6 (AMD)':'Dadsv6', 'Ddsv4':'Ddsv4', 'Dsv3':'Dsv3' };
var _PG_MO_GEN: Record<string,string> = { 'Edsv5':'Edsv5', 'Edsv6':'Edsv6', 'Eadsv5 (AMD)':'Eadsv5', 'Eadsv6 (AMD)':'Eadsv6', 'Edsv4':'Edsv4', 'Esv3':'Esv3' };
var _PG_HA = ['미적용', '영역 중복 HA', '동일 영역 HA'];

function _pgProduct(tier: string, gen: string){
  var p = 'Azure Database for PostgreSQL Flexible Server ';
  if (tier === 'Burstable') return p + 'Burstable BS Series Compute';
  if (tier === 'General Purpose') return p + 'General Purpose ' + (_PG_GP_GEN[gen] || 'Ddsv5') + ' Series Compute';
  return p + 'Memory Optimized ' + (_PG_MO_GEN[gen] || 'Edsv5') + ' Series Compute';
}
function _pgHaMult(o: Record<string, any>){ return (o.ha && o.ha !== '미적용') ? 2 : 1; }

REG._svcDefs['Azure Database for PostgreSQL'] = {
  apiServiceName: _PG_SVC,
  steps: [
    { key:'metric',   label:'청구 항목',  options:_PG_METRICS.slice() },
    { key:'tier',     label:'계층',       options:['Burstable','General Purpose','Memory Optimized'] },
    { key:'instance', label:'인스턴스',   options:_PG_BURST_INSTANCES.slice() },
    { key:'series',   label:'인스턴스 시리즈', options:Object.keys(_PG_GP_GEN) },
    { key:'vCores',   label:'인스턴스(vCore)', options:_PG_GP_VCORES.slice() },
    { key:'ha',       label:'고가용성(HA)', options:_PG_HA.slice(),
      tooltip:'HA 를 켜면 대기 서버가 같은 사양으로 하나 더 떠 컴퓨팅·저장소 요금이 2배가 됩니다(백업 저장소 제외).' },
  ],
  instanceField: false,
  // 청구 항목·계층이 바뀌면 옵션 패널을 다시 그려 필드 노출을 갱신
  instanceParentKey: 'metric',
  rebuildKeys: ['tier'],
  _applyStepVisibility: function(r: Row){ if (REG['_pg_applyStepVisibility']) REG['_pg_applyStepVisibility'](r); },
};

REG['_pg_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Azure Database for PostgreSQL'];
  if (!def || !def.steps) return;
  if (!r.options) r.options = {};
  var o = r.options;
  if (o.vCores !== undefined && o.vCores !== '' && typeof o.vCores !== 'string') o.vCores = String(o.vCores);
  if (_PG_METRICS.indexOf(o.metric) < 0) o.metric = _PG_COMPUTE;
  var isCompute = (o.metric === _PG_COMPUTE);
  var isBackup = (o.metric === _PG_BACKUP);
  var tier = o.tier || 'Burstable';
  var isBurst = (tier === 'Burstable');
  var vcoreOpts = (tier === 'Memory Optimized') ? _PG_MO_VCORES : _PG_GP_VCORES;
  var genOpts = (tier === 'Memory Optimized') ? Object.keys(_PG_MO_GEN) : Object.keys(_PG_GP_GEN);
  for (var i = 0; i < def.steps.length; i++) {
    var s = def.steps[i];
    if (s.key === 'tier') s._hidden = !isCompute;
    if (s.key === 'instance') {
      s._hidden = !(isCompute && isBurst);
      s.options = _PG_BURST_INSTANCES;
      if (!s._hidden && _PG_BURST_INSTANCES.indexOf(o.instance) < 0) {
        // 대소문자만 다른 값(B2MS ↔ B2ms)은 목록 표기로 맞춘다
        var hit = _PG_BURST_INSTANCES.filter(function(x){ return x.toLowerCase() === String(o.instance||'').toLowerCase(); })[0];
        o.instance = hit || _PG_BURST_INSTANCES[0];
      }
    }
    if (s.key === 'series') {
      s._hidden = !(isCompute && !isBurst);
      s.options = genOpts;
      if (!s._hidden && genOpts.indexOf(o.series) < 0) o.series = genOpts[0];
    }
    if (s.key === 'vCores') {
      s._hidden = !(isCompute && !isBurst);
      s.options = vcoreOpts;
      if (!s._hidden && vcoreOpts.indexOf(o.vCores) < 0) o.vCores = vcoreOpts[0];
    }
    if (s.key === 'ha') {
      s._hidden = isBackup || (isCompute && isBurst);
      if (!s._hidden && _PG_HA.indexOf(o.ha) < 0) o.ha = _PG_HA[0];
    }
  }
};

REG['_buildDetail_Azure_Database_for_PostgreSQL'] = function(r: Row) {
  REG['_pg_applyStepVisibility'](r);
  var o = r.options || {};
  var ha = (_pgHaMult(o) > 1) ? o.ha : '';
  if (o.metric !== _PG_COMPUTE) {
    r.skuName = o.metric;
    r.detail = ['PostgreSQL', o.metric, (o.metric === _PG_BACKUP ? '' : ha)].filter(Boolean).join(' / ');
  } else if ((o.tier || 'Burstable') === 'Burstable') {
    r.skuName = o.instance || '';
    r.detail = ['PostgreSQL', 'Burstable', o.instance].filter(Boolean).join(' - ');
  } else {
    r.skuName = (o.vCores ? o.vCores + 'vCore' : '');
    r.detail = ['PostgreSQL', o.tier, o.series, (o.vCores ? o.vCores + ' vCore' : ''), ha].filter(Boolean).join(' - ');
  }
};

function _pgFail(row: Row, msg: string) {
  row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('error', msg);
  updatePriceCells(row); updateTotalsRow();
}

// 저장소·IOPS·백업 — productName + meterName 정확 일치(구간 미터는 0원이 아닌 최저 구간)
async function _pgResolveMeter(row: Row, cur: string, o: Record<string, any>) {
  var conf = _PG_METERS[o.metric];
  var label = 'PostgreSQL / ' + o.metric;
  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:_PG_SVC, armRegionName:row.region, productName:conf.prod, priceType:'Consumption' }, cur, 100, 2, {pageSize:100, expectedSizeKB:10});
  } catch (err: any) { return _pgFail(row, 'PostgreSQL 조회 실패: ' + String(err.message).slice(0,80)); }

  var chosen = pickTieredMeter(items.filter(function(it: ApiItem){
    return String(it.type||'').toLowerCase() === 'consumption' && String(it.meterName||'').toLowerCase() === conf.meter;
  }));
  if (!chosen) return _pgFail(row, label + ': 매칭 실패 (' + items.length + '건 조회).');

  var mult = (o.metric === _PG_BACKUP) ? 1 : _pgHaMult(o);
  var price = Number(chosen.unitPrice) * mult;
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur, unitPrice: price, retailPrice: price, _pgHaMult: mult });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var note = (o.metric === _PG_BACKUP) ? ' (usage=무료분 초과 GB)' : (mult > 1 ? ' [HA ×2]' : '');
  setStatus('ok', label + ' 완료 · ' + price + ' / ' + chosen.unitOfMeasure + tierNote(chosen) + note);
  updatePriceCells(row); updateTotalsRow();
}

// 가격 조회 — 청구 항목이 컴퓨팅이면 계층별 productName 안에서 인스턴스/vCore 를, 아니면 저장소 미터를 매칭
REG['_resolve_Azure_Database_for_PostgreSQL'] = async function(row: Row, cur: string) {
  REG['_pg_applyStepVisibility'](row);
  var o = row.options || {};
  if (o.metric !== _PG_COMPUTE) return _pgResolveMeter(row, cur, o);

  var tier = o.tier || 'Burstable';
  var isBurst = (tier === 'Burstable');
  var product = _pgProduct(tier, o.series);
  var haMult = isBurst ? 1 : _pgHaMult(o);

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:_PG_SVC, armRegionName:row.region, productName:product, priceType:'Consumption' }, cur, 100, 2, {pageSize:100, expectedSizeKB:20});
  } catch (err: any) { return _pgFail(row, 'PostgreSQL 조회 실패: ' + String(err.message).slice(0,80)); }

  var isCons = function(it: ApiItem){ return String(it.type||'').toLowerCase() === 'consumption'; };
  var sku = function(it: ApiItem){ return String(it.skuName||'').toLowerCase(); };
  var chosen: ApiItem | null = null, label = '', N = 0, perVcore: number | null = null, mult = 1;

  if (isBurst) {
    var inst = o.instance || _PG_BURST_INSTANCES[0];
    label = 'PostgreSQL Burstable / ' + inst;
    chosen = items.filter(function(it){ return isCons(it) && sku(it) === inst.toLowerCase(); })
                  .sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); })[0] || null;
  } else {
    N = parseInt(o.vCores, 10); if (!(N > 0)) N = 2;
    label = 'PostgreSQL ' + tier + ' / ' + (o.series || '') + ' / ' + N + ' vCore' + (haMult > 1 ? ' / ' + o.ha : '');
    // 세대마다 per-vCore 행의 skuName 이 'vCore' 또는 '1 vCore' 로 갈린다 — 'vCore' 우선(절약 플랜이 붙는 쪽)
    var per = items.filter(function(it){ return isCons(it) && (sku(it) === 'vcore' || sku(it) === '1 vcore'); })
                   .sort(function(a,b){ return (sku(a) === 'vcore' ? 0 : 1) - (sku(b) === 'vcore' ? 0 : 1); });
    chosen = per[0] || null;
    if (chosen) { perVcore = Number(chosen.unitPrice); mult = N; }
  }

  if (!chosen) return _pgFail(row, label + ': 매칭 실패 (' + items.length + '건 조회 · 이 리전에 없는 세대일 수 있음).');

  var price = Number(chosen.unitPrice) * mult * haMult;
  row.paygItem = {
    currencyCode: cur, unitPrice: price, retailPrice: price,
    armRegionName: row.region, productName: product,
    skuName: isBurst ? (o.instance || '') : (N + ' vCore'),
    meterName: chosen.meterName, unitOfMeasure: '1 Hour', type: 'Consumption',
    _pgPerVcore: perVcore, _pgVcores: isBurst ? null : N, _pgHaMult: haMult,
  };

  // 절약: 쓴 항목의 savingsPlan × 같은 배수 / 예약: 같은 제품의 skuName='vCore' 1·3년 → 시간당 × N (Burstable 미제공)
  var sp = spItemsFromBase(chosen, mult * haMult, cur);
  var ri: RiPair = { ri1:null, ri3:null };
  if (!isBurst) {
    var resv: ApiItem[] = [];
    try { resv = await apiFetch({ serviceName:_PG_SVC, armRegionName:row.region, productName:product, priceType:'Reservation' }, cur, 50, 1, {pageSize:50, expectedSizeKB:5}); } catch(e) { resv = []; }
    ri = riItemsFromResv(resv, 'vcore', N * haMult, cur);
  }
  row.sp1Item = sp.sp1; row.sp3Item = sp.sp3; row.ri1Item = ri.ri1; row.ri3Item = ri.ri3;

  var tags = ['PAYG']; if(sp.sp1)tags.push('SP1Y'); if(sp.sp3)tags.push('SP3Y'); if(ri.ri1)tags.push('RI1Y'); if(ri.ri3)tags.push('RI3Y');
  var basis = isBurst ? '' : (' [per-vCore ' + perVcore + ' × ' + N + (haMult > 1 ? ' × HA 2' : '') + ']');
  setStatus('ok', label + ' 완료 [' + tags.join(', ') + '] · ' + price.toFixed(4) + ' /1 Hour' + basis);
  updatePriceCells(row); updateTotalsRow();
};
