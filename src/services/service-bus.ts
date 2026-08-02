import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/service-bus.ts — Service Bus (메시징)
//
//   전용 resolver(_resolve_Service_Bus). 가격 하드코딩 없음(Azure Retail Prices API 실시간).
//   API 구조: serviceName='Service Bus', skuName=계층, meterName=청구 항목.
//     Basic    : Basic Messaging Operations(1M)
//     Standard : Standard Base Unit(1/Hour), Standard Messaging Operations(1M),
//                Standard Brokered Connection(1)
//     Premium  : Premium Messaging Unit(1/Hour)
//   Standard 일부 미터는 사용량 구간별 복수 단가 → tierMinimumUnits=0(1구간)의 최저가를 선택.
//   계층 변경 시 청구 항목 옵션을 재구성(instanceParentKey='tier').
//   월=단가×Qty×usage(엔진 기본) — unitOfMeasure에 맞춰 usage 입력. 절약/예약 미적용.
// ================================================================

var _SB_ITEMS: Record<string,string[]> = {
  'Basic':    ['Basic Messaging Operations'],
  'Standard': ['Standard Base Unit','Standard Messaging Operations','Standard Brokered Connection'],
  'Premium':  ['Premium Messaging Unit'],
};

REG._svcDefs['Service Bus'] = {
  apiServiceName: 'Service Bus',
  steps: [
    { key:'tier', label:'계층',      options:Object.keys(_SB_ITEMS) },
    { key:'item', label:'청구 항목', options:_SB_ITEMS['Basic'].slice() },
  ],
  instanceField: false,
  instanceParentKey: 'tier',
  _applyStepVisibility: function(r: Row){ if (REG['_sb_applyStepVisibility']) REG['_sb_applyStepVisibility'](r); },
};

REG['_sb_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Service Bus'];
  if (!def || !def.steps) return;
  var tier = (r.options && r.options.tier) || 'Basic';
  var items = _SB_ITEMS[tier] || [];
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'item') continue;
    def.steps[i].options = items.slice();
    if (r.options && items.indexOf(r.options.item) < 0) r.options.item = items[0] || '';
  }
};

REG['_buildDetail_Service_Bus'] = function(r: Row) {
  var o = r.options || {};
  REG['_sb_applyStepVisibility'](r);
  r.skuName = o.tier || '';
  r.detail = [o.tier, o.item].filter(Boolean).join(' - ');
};

REG['_resolve_Service_Bus'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var tier = o.tier || 'Basic';
  var item = o.item || (_SB_ITEMS[tier] || [])[0] || '';
  var label = 'Service Bus ' + tier + ' / ' + item;

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Service Bus', armRegionName:row.region, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:40});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Service Bus 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'') !== tier) return false;
    if (String(it.meterName||'') !== item) return false;
    return Number(it.tierMinimumUnits||0) === 0;
  }).sort(function(a: ApiItem, b: ApiItem){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure);
  updatePriceCells(row); updateTotalsRow();
};
