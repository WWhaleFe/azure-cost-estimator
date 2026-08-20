import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, riItemsFromResv } from '../core/kernel.js';
import type { Row, ApiItem, RiPair } from '../core/kernel.js';
// ================================================================
// services/fabric.ts — Microsoft Fabric (F 용량 + OneLake 저장소)
//
//   전용 resolver(_resolve_Microsoft_Fabric). 가격 하드코딩 없음(Azure Retail Prices API 실시간).
//   serviceName='Microsoft Fabric'. 두 가지 청구 항목을 한 행에 하나씩 계산한다.
//
//   1) 용량 (CU 시간) — F2~F2048
//      Retail Prices API 에는 "F64 한 줄" 미터가 없다. Fabric 용량은 **CU 시간 단가**로만 공시되고,
//      그 단가가 워크로드(Power BI·Spark·Data Warehouse·Eventhouse…)별 미터로 쪼개져 나온다.
//      쪼개진 미터들의 CU 단가는 서로 같으므로(koreacentral 92건이 전부 동일가), productName=
//      'Fabric Capacity' & meterName 이 '… Capacity Usage CU' 로 끝나는 유료 미터들의
//      **최빈 단가**를 기준 CU 단가로 잡고 F SKU 의 CU 수를 곱한다(예 F64 → ×64).
//      'Capacity Overage'(초과분)와 '… Serverless Usage CU'(서버리스)는 기준에서 제외한다.
//      usage 칸에 월 사용시간(예 730). 24×7 이면 730.
//      예약(RI): productName='Fabric Capacity Reservation', skuName='Fabric Capacity' 의
//      1년/3년 미터를 시간당으로 환산해 ×CU. 절약 플랜(SavingsPlan)은 Fabric 에 없다.
//
//   2) OneLake 저장소 (GB/월) — productName='OneLake' 의 'Data Stored' 미터
//      Hot/Cool/Cold·캐시·BCDR·SQL(백업)·미러링. usage 칸에 GB.
//      ※ API 표기가 'OneLake …' / 'Onelake …' 로 섞여 있어 meterName 은 대소문자 무시로 맞춘다.
//
//   범위 외: Copilot·AI(Capacity Usage 로 같은 용량에서 소진), OneLake 트랜잭션(읽기/쓰기 작업)
//           미터, 예약 용량의 자동 스케일(Autoscale), Power BI Premium 별도 SKU(P/EM).
// ================================================================

// F SKU → CU 수. Fabric 용량은 SKU 숫자가 곧 CU 수다(F64 = 64 CU).
var _FAB_CAPACITIES = ['F2','F4','F8','F16','F32','F64','F128','F256','F512','F1024','F2048'];

// 저장소 항목(노출명) → meterName(대소문자 무시 정확 일치)
var _FAB_STORAGE: Record<string, string> = {
  'OneLake 저장소 Hot (GB/월)':   'OneLake Storage Hot Data Stored',
  'OneLake 저장소 Cool (GB/월)':  'OneLake Storage Cool Data Stored',
  'OneLake 저장소 Cold (GB/월)':  'OneLake Storage Cold Data Stored',
  'OneLake 캐시 (GB/월)':         'OneLake Cache Data Stored',
  'OneLake BCDR Hot (GB/월)':     'OneLake BCDR Storage Hot Data Stored',
  'OneLake BCDR Cool (GB/월)':    'Onelake BCDR Storage Cool Data Stored',
  'OneLake BCDR Cold (GB/월)':    'Onelake BCDR Storage Cold Data Stored',
  'SQL 저장소 (GB/월)':           'SQL Storage Data Stored',
  'SQL 백업 저장소 (GB/월)':      'SQL Backup Storage Data Stored',
  '미러링 저장소 (GB/월)':        'Storage Mirroring Data Stored',
};

var _FAB_METRICS = ['용량 (CU 시간)', 'OneLake 저장소 (GB/월)'];

REG._svcDefs['Microsoft Fabric'] = {
  apiServiceName: 'Microsoft Fabric',
  steps: [
    { key:'metric',      label:'청구 항목', options:_FAB_METRICS.slice() },
    { key:'capacity',    label:'용량 SKU',  options:_FAB_CAPACITIES.slice(), tooltip:'F SKU 의 숫자가 CU 수입니다(F64 = 64 CU). usage 칸에는 월 사용시간(24×7 이면 730)을 넣으세요.' },
    { key:'storageItem', label:'저장소 항목', options:Object.keys(_FAB_STORAGE) },
  ],
  instanceField: false,
  instanceParentKey: 'metric',
  _applyStepVisibility: function(r: Row){ if (REG['_fab_applyStepVisibility']) REG['_fab_applyStepVisibility'](r); },
};

// 청구 항목에 따라 용량 SKU / 저장소 항목 중 하나만 노출
REG['_fab_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Microsoft Fabric'];
  if (!def || !def.steps) return;
  var metric = (r.options && r.options.metric) || _FAB_METRICS[0];
  var isCapacity = metric.indexOf('용량') >= 0;
  for (var i = 0; i < def.steps.length; i++) {
    var k = def.steps[i].key;
    if (k === 'capacity')    def.steps[i]._hidden = !isCapacity;
    if (k === 'storageItem') def.steps[i]._hidden = isCapacity;
  }
};

REG['_buildDetail_Microsoft_Fabric'] = function(r: Row) {
  var o = r.options || {};
  REG['_fab_applyStepVisibility'](r);
  var metric = o.metric || _FAB_METRICS[0];
  if (metric.indexOf('용량') >= 0) {
    r.skuName = o.capacity || '';
    r.detail = ['Fabric 용량', o.capacity].filter(Boolean).join(' - ');
  } else {
    r.skuName = 'OneLake';
    r.detail = ['OneLake', o.storageItem].filter(Boolean).join(' - ');
  }
};

// F SKU → CU 수(숫자 부분). 못 읽으면 0.
function _fabCu(sku: string): number {
  var n = parseInt(String(sku || '').replace(/^F/i, ''), 10);
  return n > 0 ? n : 0;
}

// 워크로드별로 쪼개진 '… Capacity Usage CU' 미터에서 기준 CU 단가(최빈값) 항목을 고른다.
function _fabPerCuItem(items: ApiItem[]): ApiItem | null {
  var base = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.productName||'') !== 'Fabric Capacity') return false;
    var m = String(it.meterName||'');
    if (!/capacity usage cu$/i.test(m)) return false;   // 서버리스('… Serverless Usage CU')는 자동 제외
    if (/overage/i.test(m)) return false;               // 초과분(Capacity Overage)은 기준 단가가 아니다
    return Number(it.unitPrice||0) > 0;
  });
  if (!base.length) return null;
  var count: Record<string, number> = {};
  base.forEach(function(it: ApiItem){ var k = String(it.unitPrice); count[k] = (count[k] || 0) + 1; });
  var best = base[0], bestN = -1;
  base.forEach(function(it: ApiItem){
    var n = count[String(it.unitPrice)];
    // 동률이면 더 싼 쪽 — 최빈값이 흔들려도 기준이 위로 튀지 않게 한다
    if (n > bestN || (n === bestN && Number(it.unitPrice) < Number(best.unitPrice))) { bestN = n; best = it; }
  });
  return best;
}

REG['_resolve_Microsoft_Fabric'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var metric = o.metric || _FAB_METRICS[0];
  var isCapacity = metric.indexOf('용량') >= 0;
  var label = 'Fabric / ' + (isCapacity ? (o.capacity || '') : (o.storageItem || ''));

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Microsoft Fabric', armRegionName:row.region, priceType:'Consumption' }, cur, 1000, 3, {pageSize:1000, expectedSizeKB:120});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Microsoft Fabric 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // ── OneLake 저장소 — meterName 정확 일치(대소문자 무시). 엔진 기본 계산(월=단가×Qty×usage) ──
  if (!isCapacity) {
    var target = _FAB_STORAGE[o.storageItem || ''] || '';
    var sc = items.filter(function(it: ApiItem){
      if (String(it.type||'').toLowerCase() !== 'consumption') return false;
      return String(it.meterName||'').toLowerCase() === target.toLowerCase();
    }).sort(function(a: ApiItem, b: ApiItem){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
    var st = sc[0] || null;
    if (!target || !st) {
      row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
      setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
      updatePriceCells(row); updateTotalsRow(); return;
    }
    row.paygItem = Object.assign({}, st, { currencyCode: cur });
    row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('ok', label + ' 완료 · ' + Number(st.unitPrice) + ' / ' + st.unitOfMeasure + ' (usage=GB)');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // ── 용량 — 기준 CU 단가 × CU 수 ──
  var cu = _fabCu(o.capacity || '');
  var perCuItem = _fabPerCuItem(items);
  if (!cu || !perCuItem) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var perCu = Number(perCuItem.unitPrice);
  var price = perCu * cu;

  row.paygItem = {
    currencyCode: cur, unitPrice: price, retailPrice: price,
    armRegionName: row.region, productName: 'Fabric Capacity',
    skuName: o.capacity, meterName: perCuItem.meterName,
    unitOfMeasure: '1 Hour', type: 'Consumption',
    _fabricPerCu: perCu, _fabricCu: cu,
  };
  row.sp1Item = null; row.sp3Item = null;

  // 예약(RI) — 'Fabric Capacity Reservation' 의 1·3년을 시간당으로 환산 후 ×CU
  var resv: ApiItem[] = [];
  try {
    resv = await apiFetch({ serviceName:'Microsoft Fabric', armRegionName:row.region, productName:'Fabric Capacity Reservation', priceType:'Reservation' }, cur, 200, 3, {pageSize:200, expectedSizeKB:20});
  } catch (e) { resv = []; }
  var ri: RiPair = riItemsFromResv(resv, 'fabric capacity', cu, cur);
  row.ri1Item = ri.ri1; row.ri3Item = ri.ri3;

  var tags = ['PAYG']; if (ri.ri1) tags.push('RI1Y'); if (ri.ri3) tags.push('RI3Y');
  setStatus('ok', label + ' 완료 [' + tags.join(', ') + '] · ' + price.toFixed(4) + ' /1 Hour [CU ' + perCu + ' × ' + cu + '] (usage=월 사용시간, 24×7 이면 730)');
  updatePriceCells(row); updateTotalsRow();
};
