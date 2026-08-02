import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/container-apps.ts — Azure Container Apps (서버리스 컨테이너)
//
//   전용 resolver(_resolve_Container_Apps). 가격 하드코딩 없음(Azure Retail Prices API 실시간).
//   API 구조: serviceName='Azure Container Apps', skuName=플랜, meterName=청구 항목.
//     Standard         : vCPU Active/Idle Usage(1 Second), Memory Active/Idle Usage(1 GiB Second),
//                        Requests(1M), NC T4 v3 / NC A100 v4 GPU Usage(1 Second)
//     Dedicated        : Plan Management(1 Hour), vCPU Usage(1 Hour), Memory Usage(1 Hour), GPU Usage(1 Hour)
//     Dynamic Sessions : Dynamic Sessions(1 Hour)
//     Hybrid           : Hybrid vCPU Usage(1 Hour)
//   플랜 변경 시 청구 항목 옵션을 재구성(instanceParentKey='plan').
//   월=단가×Qty×usage(엔진 기본) — unitOfMeasure(1 Second/1 GiB Second/1M/1 Hour)에 맞춰 usage 입력.
//   절약/예약 미적용. 못 찾으면 "매칭 실패".
// ================================================================

// 플랜(skuName) → 청구 항목(meterName) 목록
var _ACA_ITEMS: Record<string,string[]> = {
  'Standard':         ['Standard vCPU Active Usage','Standard vCPU Idle Usage','Standard Memory Active Usage','Standard Memory Idle Usage','Standard Requests','Standard NC T4 v3 GPU Usage','Standard NC A100 v4 GPU Usage'],
  'Dedicated':        ['Dedicated Plan Management','Dedicated vCPU Usage','Dedicated Memory Usage','Dedicated GPU Usage'],
  'Dynamic Sessions': ['Dynamic Sessions'],
  'Hybrid':           ['Hybrid vCPU Usage'],
};

REG._svcDefs['Container Apps'] = {
  apiServiceName: 'Azure Container Apps',
  steps: [
    { key:'plan', label:'플랜',      options:Object.keys(_ACA_ITEMS) },
    { key:'item', label:'청구 항목', options:_ACA_ITEMS['Standard'].slice() },
  ],
  instanceField: false,
  instanceParentKey: 'plan',
  _applyStepVisibility: function(r: Row){ if (REG['_aca_applyStepVisibility']) REG['_aca_applyStepVisibility'](r); },
};

REG['_aca_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Container Apps'];
  if (!def || !def.steps) return;
  var plan = (r.options && r.options.plan) || 'Standard';
  var items = _ACA_ITEMS[plan] || [];
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'item') continue;
    def.steps[i].options = items.slice();
    if (r.options && items.indexOf(r.options.item) < 0) r.options.item = items[0] || '';
  }
};

REG['_buildDetail_Container_Apps'] = function(r: Row) {
  var o = r.options || {};
  REG['_aca_applyStepVisibility'](r);
  r.skuName = o.plan || '';
  r.detail = [o.plan, o.item].filter(Boolean).join(' - ');
};

REG['_resolve_Container_Apps'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var plan = o.plan || 'Standard';
  var item = o.item || (_ACA_ITEMS[plan] || [])[0] || '';
  var label = 'Container Apps ' + plan + ' / ' + item;

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Azure Container Apps', armRegionName:row.region, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:30});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Container Apps 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'') !== plan) return false;
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
