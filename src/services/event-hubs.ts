import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/event-hubs.ts — Event Hubs (이벤트 스트리밍)
//
//   전용 resolver(_resolve_Event_Hubs). 가격 하드코딩 없음(Azure Retail Prices API 실시간).
//   API 구조: serviceName='Event Hubs', skuName=계층, meterName=청구 항목.
//     Basic     : Basic Throughput Unit(1 Hour), Basic Ingress Events(1M)
//     Standard  : Standard Throughput Unit(1 Hour), Standard Ingress Events(1M),
//                 Standard Capture(1 Hour), Standard Kafka Endpoint(1 Hour)
//     Premium   : Premium Processing Unit(1 Hour), Premium Extended Retention(1 GB/Month)
//     Dedicated : Dedicated Capacity Unit(1 Hour), Dedicated Extended Retention(1 GB/Month)
//   계층 변경 시 청구 항목 옵션을 재구성(instanceParentKey='tier').
//   월=단가×Qty×usage(엔진 기본) — unitOfMeasure(1 Hour/1M/1 GB/Month)에 맞춰 usage 입력.
//   절약/예약 미적용. 못 찾으면 "매칭 실패".
// ================================================================

// 계층 → 청구 항목(meterName) 목록
var _EH_ITEMS: Record<string,string[]> = {
  'Basic':     ['Basic Throughput Unit','Basic Ingress Events'],
  'Standard':  ['Standard Throughput Unit','Standard Ingress Events','Standard Capture','Standard Kafka Endpoint'],
  'Premium':   ['Premium Processing Unit','Premium Extended Retention'],
  'Dedicated': ['Dedicated Capacity Unit','Dedicated Extended Retention'],
};

REG._svcDefs['Event Hubs'] = {
  apiServiceName: 'Event Hubs',
  steps: [
    { key:'tier', label:'계층',      options:Object.keys(_EH_ITEMS) },
    { key:'item', label:'청구 항목', options:_EH_ITEMS['Basic'].slice() },
  ],
  instanceField: false,
  instanceParentKey: 'tier',
  _applyStepVisibility: function(r: Row){ if (REG['_eh_applyStepVisibility']) REG['_eh_applyStepVisibility'](r); },
};

REG['_eh_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Event Hubs'];
  if (!def || !def.steps) return;
  var tier = (r.options && r.options.tier) || 'Basic';
  var items = _EH_ITEMS[tier] || [];
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'item') continue;
    def.steps[i].options = items.slice();
    if (r.options && items.indexOf(r.options.item) < 0) r.options.item = items[0] || '';
  }
};

REG['_buildDetail_Event_Hubs'] = function(r: Row) {
  var o = r.options || {};
  REG['_eh_applyStepVisibility'](r);
  r.skuName = o.tier || '';
  r.detail = [o.tier, o.item].filter(Boolean).join(' - ');
};

REG['_resolve_Event_Hubs'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var tier = o.tier || 'Basic';
  var item = o.item || (_EH_ITEMS[tier] || [])[0] || '';
  var label = 'Event Hubs ' + tier + ' / ' + item;

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Event Hubs', armRegionName:row.region, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:30});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Event Hubs 조회 실패: ' + String(err.message).slice(0,80));
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

  // 매칭 미터 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure);
  updatePriceCells(row); updateTotalsRow();
};
