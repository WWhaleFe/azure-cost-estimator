import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
// ================================================================
// services/redis-cache.js — Azure Cache for Redis (+ Azure Managed Redis)
//
//   전용 resolver(_resolve_Azure_Cache_for_Redis)로 계층×캐시 크기 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Redis Cache'.
//   API 구조(koreacentral): 계층별 productName이 다르다:
//     - Basic/Standard/Premium → 'Azure Redis Cache <계층>', skuName=C0~C6/P1~P5
//         meter '<SKU> Cache'(전체 요금, Standard는 복제본 포함)와
//         '<SKU> Cache Instance'(노드당 요금)가 함께 있어 '<SKU> Cache'를 우선 사용
//         예) Standard C1: 'C1 Cache' 0.178 = 'C1 Cache Instance' 0.089 × 2노드
//     - Enterprise / Enterprise Flash → 'Azure Redis Cache Enterprise(- Flash)', E/F SKU
//     - Azure Managed Redis(AMR) → 'Azure Managed Redis - <제품군>',
//         meter '<SKU> Cache Instance'만 존재(인스턴스 전체 요금)
//   월=단가×Qty×usage(엔진 기본). usage 칸에 시간(예 730). 절약/예약 미적용.
//   못 찾으면 "매칭 실패" — 리전에 없는 SKU 조합은 매칭 실패가 정상.
//   범위 외: 'E1 Internal'(내부용), Isolated(구 계층) 캐시.
// ================================================================

// 계층 → productName + SKU 목록(문서 기준 전체 — 리전에 없는 SKU는 매칭 실패가 정상)
var _REDIS_TIERS = {
  'Basic':                 { prod:'Azure Redis Cache Basic',              skus:['C0','C1','C2','C3','C4','C5','C6'] },
  'Standard':              { prod:'Azure Redis Cache Standard',           skus:['C0','C1','C2','C3','C4','C5','C6'] },
  'Premium':               { prod:'Azure Redis Cache Premium',            skus:['P1','P2','P3','P4','P5'] },
  'Enterprise':            { prod:'Azure Redis Cache Enterprise',         skus:['E1','E5','E10','E20','E50','E100','E200','E400'] },
  'Enterprise Flash':      { prod:'Azure Redis Cache Enterprise Flash',   skus:['F300','F700','F1500'] },
  'AMR Balanced':          { prod:'Azure Managed Redis - Balanced',        skus:['B0','B1','B3','B5','B10','B20','B50','B100','B150','B250','B350','B500','B700','B1000'] },
  'AMR Memory Optimized':  { prod:'Azure Managed Redis - Memory Optimized', skus:['M10','M20','M50','M150','M250','M350','M500','M700','M1000','M1500','M2000'] },
  'AMR Compute Optimized': { prod:'Azure Managed Redis - Compute Optimized', skus:['X3','X5','X10','X20','X50','X100','X150','X250','X350','X500','X700'] },
  'AMR Flash Optimized':   { prod:'Azure Managed Redis - Flash Optimized',  skus:['A250','A500','A700','A1000','A1500','A2000','A4500'] },
};

REG._svcDefs['Azure Cache for Redis'] = {
  apiServiceName: 'Redis Cache',
  steps: [
    { key:'tier', label:'계층',      options: Object.keys(_REDIS_TIERS) },
    { key:'sku',  label:'캐시 크기', options: _REDIS_TIERS['Basic'].skus.slice() },
  ],
  instanceField: false,
  // 계층 변경 시 캐시 크기 옵션을 다시 구성
  instanceParentKey: 'tier',
  _applyStepVisibility: function(r){ if (REG['_redis_applyStepVisibility']) REG['_redis_applyStepVisibility'](r); },
};

// 계층에 따라 캐시 크기 옵션을 교체하고, 현재 값이 새 목록에 없으면 비운다
REG['_redis_applyStepVisibility'] = function(r) {
  var def = REG._svcDefs['Azure Cache for Redis'];
  if (!def || !def.steps) return;
  var tier = (r.options && r.options.tier) || 'Basic';
  var skus = (_REDIS_TIERS[tier] || {}).skus || [];
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'sku') continue;
    def.steps[i].options = skus.slice();
    if (r.options && skus.indexOf(r.options.sku) < 0) r.options.sku = '';
  }
};

REG['_buildDetail_Azure_Cache_for_Redis'] = function(r) {
  var o = r.options || {};
  REG['_redis_applyStepVisibility'](r);
  r.skuName = o.sku || '';
  r.detail = ['Redis', o.tier, o.sku].filter(Boolean).join(' / ');
};

// 가격 조회 — productName=계층 제품 + skuName 정확 일치, meter '<SKU> Cache' 우선
REG['_resolve_Azure_Cache_for_Redis'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'Basic';
  var sku = o.sku || '';
  var conf = _REDIS_TIERS[tier];
  var label = 'Redis / ' + tier + ' ' + (sku || '(크기 미선택)');

  if (!conf || !sku) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 계층과 캐시 크기를 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Redis Cache', armRegionName:row.region, productName:conf.prod, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:40});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Redis 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var skuLower = sku.toLowerCase();
  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== skuLower) return false; // 'E1 Internal' 등 변형 제외
    var m = String(it.meterName||'').toLowerCase();
    return m === skuLower + ' cache' || m === skuLower + ' cache instance';
  });
  // '<SKU> Cache'(전체 요금)를 '<SKU> Cache Instance'(노드당)보다 우선
  cands.sort(function(a,b){
    var am = String(a.meterName||'').toLowerCase() === skuLower + ' cache' ? 0 : 1;
    var bm = String(b.meterName||'').toLowerCase() === skuLower + ' cache' ? 0 : 1;
    if (am !== bm) return am - bm;
    return Number(b.unitPrice||0) - Number(a.unitPrice||0);
  });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회). 이 리전에 없는 SKU일 수 있습니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + ' (usage=시간)');
  updatePriceCells(row); updateTotalsRow();
};
