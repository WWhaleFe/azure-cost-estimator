import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, pickTieredMeter, tierNote } from '../core/kernel.js';
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
//     Hybrid Connections : Listener Unit(1 Hour), Data Transfer(1 GB — 첫 5GB 무료)
//     WCF Relay          : WCF Relay(100 Hours), WCF Relay Message(10K)
//     Geo Replication Zone 1~3 : Geo Replication Zone N Data Transfer(1 GB)
//   Standard 일부 미터는 사용량 구간별 복수 단가 → pickTieredMeter 로 **0원이 아닌 최저 구간**을 선택.
//   (Standard Messaging Operations 첫 13M·Brokered Connection 첫 1,000개는 무료 구간이라
//    첫 구간을 그대로 쓰면 견적이 0원이 된다 — v115 수정)
//   계층 변경 시 청구 항목 옵션을 재구성(instanceParentKey='tier').
//   월=단가×Qty×usage(엔진 기본) — unitOfMeasure에 맞춰 usage 입력. 절약/예약 미적용.
// ================================================================

var _SB_ITEMS: Record<string,string[]> = {
  'Basic':    ['Basic Messaging Operations'],
  'Standard': ['Standard Base Unit','Standard Messaging Operations','Standard Brokered Connection'],
  'Premium':  ['Premium Messaging Unit'],
  // 릴레이/하이브리드 연결·지역 복제 — 별도 skuName 으로 과금된다(계층처럼 취급).
  'Hybrid Connections': ['Hybrid Connections Listener Unit','Hybrid Connections Data Transfer'],
  'WCF Relay':          ['WCF Relay','WCF Relay Message'],
  'Geo Replication Zone 1': ['Geo Replication Zone 1 Data Transfer'],
  'Geo Replication Zone 2': ['Geo Replication Zone 2 Data Transfer'],
  'Geo Replication Zone 3': ['Geo Replication Zone 3 Data Transfer'],
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
    return true;
  });
  var chosen = pickTieredMeter(cands);

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + tierNote(chosen));
  updatePriceCells(row); updateTotalsRow();
};
