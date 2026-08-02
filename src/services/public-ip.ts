import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/public-ip.js — Public IP
//
//   v66부터 전용 resolver(_resolve_Public_IP)로 SKU×IP 유형별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회).
//   API 구조: serviceName='Virtual Network', productName='IP Addresses', skuName=SKU.
//     미터명 패턴: '<SKU> IPv4 <Static|Dynamic> Public IP' (단위 1 Hour, IPv4)
//       Standard IPv4 Static Public IP  0.005 (koreacentral, USD)
//       Global   IPv4 Static Public IP  0.01
//       Basic    IPv4 Static Public IP  0.0036
//       Basic    IPv4 Dynamic Public IP 0.004
//   Standard/Global SKU는 Static만 제공(Dynamic 미지원) → SKU에 따라 IP 유형 옵션을 전환한다
//     (instanceParentKey='sku' + _pip_applyStepVisibility, LB/App Gateway 패턴). Basic만 Static/Dynamic 모두.
//   월=단가×Qty×usage(엔진 기본). usage 칸에 시간(예 730), Qty=IP 개수. 절약/예약 미적용.
//   못 찾으면 "매칭 실패"(예: Standard+Dynamic 조합은 미터가 없어 정상적으로 실패).
// ================================================================
REG._svcDefs['Public IP'] = {
  apiServiceName: 'Virtual Network',
  steps: [
    { key:'sku',    label:'SKU',    options:['Standard','Global','Basic'] },
    { key:'ipType', label:'IP 유형', options:['Static','Dynamic'] },
  ],
  instanceField: false,
  // SKU 변경 시 IP 유형 옵션을 다시 구성하기 위해 패널 재렌더 트리거
  instanceParentKey: 'sku',
  _applyStepVisibility: function(r: Row){ if (REG['_pip_applyStepVisibility']) REG['_pip_applyStepVisibility'](r); },
};

// SKU별 IP 유형 옵션(Standard/Global은 Static만, Basic은 Static/Dynamic)
var _PIP_IPTYPES: Record<string,string[]> = {
  'Standard': ['Static'],
  'Global':   ['Static'],
  'Basic':    ['Static','Dynamic'],
};

REG['_pip_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Public IP'];
  if (!def || !def.steps) return;
  var sku = (r.options && r.options.sku) || 'Standard';
  var opts = _PIP_IPTYPES[sku] || ['Static'];
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'ipType') continue;
    def.steps[i].options = opts;
    if (r.options && opts.indexOf(r.options.ipType) < 0) r.options.ipType = opts[0] || '';
  }
};

REG['_buildDetail_Public_IP'] = function(r: Row) {
  var o = r.options || {};
  REG['_pip_applyStepVisibility'](r);
  r.skuName = (`${o.sku||''} ${o.ipType||''}`).trim();
  r.detail = (`${o.sku||''} ${o.ipType||''} IP`).trim();
};

// 가격 조회 — skuName=SKU + meterName='<SKU> IPv4 <유형> Public IP' 정확 일치
REG['_resolve_Public_IP'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var sku = o.sku || 'Standard';
  var ipType = o.ipType || 'Static';
  var target = (`${sku} ipv4 ${ipType} public ip`).toLowerCase();

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Virtual Network', armRegionName:row.region, productName:'IP Addresses', priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:60});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Public IP 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== sku.toLowerCase()) return false;
    return String(it.meterName||'').toLowerCase() === target;
  }).sort(function(a: ApiItem, b: ApiItem){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  var label = sku + ' / ' + ipType;
  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Public IP ' + label + ': 매칭 실패 (' + items.length + '건 조회). Standard/Global은 Static만 제공됩니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', 'Public IP ' + label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure);
  updatePriceCells(row); updateTotalsRow();
};
