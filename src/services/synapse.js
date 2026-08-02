import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
// ================================================================
// services/synapse.js — Azure Synapse Analytics
//
//   전용 resolver(_resolve_Azure_Synapse_Analytics)로 구성요소별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Azure Synapse Analytics'.
//   구성요소(component)에 따라 입력 필드를 전환한다(instanceParentKey='component'):
//     - Dedicated SQL Pool (DWU) → productName='Azure Synapse Analytics Dedicated SQL Pool',
//          skuName=DWU 레벨(DW100c~DW30000c), meter '100 DWUs' (1/Hour).
//          예약(reserved) 미터가 섞여 있어 최저 시간단가(=용량제)를 선택. usage=시간(예 730)
//     - Serverless SQL Pool (Data Processed) → productName='Azure Synapse Analytics Serverless SQL Pool',
//          meter 'Standard Data Processed' (1 TB, 6.0). usage 칸에 처리 TB 입력
//     - Data Flow (vCore-Hour) → productName='Azure Synapse Analytics Data Flow - <유형>',
//          meter 'vCore' (1 Hour). usage 칸에 vCore-시간 입력
//   월=단가×Qty×usage(엔진 기본). 못 찾으면 "매칭 실패".
//   예약(1·3년)도 표시: Dedicated SQL Pool은 같은 productName의 Reservation(skuName=DWU 레벨)을 시간당
//     단가로 환산해 노출(현재 API엔 DW100c만 예약 존재 → 다른 레벨/Serverless/Data Flow는 빈칸 정상).
//     Synapse는 절약 플랜(Savings Plan) 미제공.
//   범위 외: 파이프라인/IR(데이터 이동·오케스트레이션), SSIS, Spark 풀, 스토리지(별도 미터).
// ================================================================

var _SYN_DWU = [
  'DW100c','DW200c','DW300c','DW400c','DW500c','DW1000c','DW1500c','DW2000c',
  'DW2500c','DW3000c','DW5000c','DW6000c','DW7500c','DW10000c','DW15000c','DW30000c',
];
var _SYN_FLOW = ['Basic','Standard','Compute Optimized'];

REG._svcDefs['Azure Synapse Analytics'] = {
  apiServiceName: 'Azure Synapse Analytics',
  steps: [
    { key:'component', label:'구성요소', options:['Dedicated SQL Pool (DWU)','Serverless SQL Pool (Data Processed)','Data Flow (vCore-Hour)'] },
    { key:'dwuLevel',  label:'DWU 레벨',  options: _SYN_DWU.slice() },
    { key:'flowType',  label:'Data Flow 유형', options: _SYN_FLOW.slice() },
  ],
  instanceField: false,
  instanceParentKey: 'component',
  _applyStepVisibility: function(r){ if (REG['_synapse_applyStepVisibility']) REG['_synapse_applyStepVisibility'](r); },
};

REG['_synapse_applyStepVisibility'] = function(r) {
  var def = REG._svcDefs['Azure Synapse Analytics'];
  if (!def || !def.steps) return;
  var o = r.options || {};
  var comp = o.component || 'Dedicated SQL Pool (DWU)';
  var isDed  = (comp.indexOf('Dedicated') >= 0);
  var isFlow = (comp.indexOf('Data Flow') >= 0);
  for (var i = 0; i < def.steps.length; i++) {
    var k = def.steps[i].key;
    if (k === 'dwuLevel') {
      def.steps[i]._hidden = !isDed;
      if (isDed && _SYN_DWU.indexOf(o.dwuLevel) < 0) r.options.dwuLevel = _SYN_DWU[0];
    }
    if (k === 'flowType') {
      def.steps[i]._hidden = !isFlow;
      if (isFlow && _SYN_FLOW.indexOf(o.flowType) < 0) r.options.flowType = _SYN_FLOW[0];
    }
  }
};

REG['_buildDetail_Azure_Synapse_Analytics'] = function(r) {
  var o = r.options || {};
  REG['_synapse_applyStepVisibility'](r);
  var comp = o.component || 'Dedicated SQL Pool (DWU)';
  if (comp.indexOf('Dedicated') >= 0) {
    r.skuName = o.dwuLevel || '';
    r.detail = ['Dedicated SQL Pool', o.dwuLevel].filter(Boolean).join(' - ');
  } else if (comp.indexOf('Data Flow') >= 0) {
    r.skuName = o.flowType ? ('Data Flow ' + o.flowType) : 'Data Flow';
    r.detail = ['Data Flow', o.flowType].filter(Boolean).join(' - ');
  } else {
    r.skuName = 'Serverless SQL';
    r.detail = 'Serverless SQL Pool - Data Processed';
  }
};

// 가격 조회 — 구성요소별 productName/meterName 매칭
REG['_resolve_Azure_Synapse_Analytics'] = async function(row, cur) {
  var o = row.options || {};
  var comp = o.component || 'Dedicated SQL Pool (DWU)';
  var product, label, matcher;

  if (comp.indexOf('Dedicated') >= 0) {
    var dwu = o.dwuLevel || _SYN_DWU[0];
    product = 'Azure Synapse Analytics Dedicated SQL Pool';
    label = 'Synapse / Dedicated SQL Pool ' + dwu;
    matcher = function(it){
      return String(it.skuName||'').toLowerCase() === dwu.toLowerCase()
          && String(it.meterName||'').toLowerCase().indexOf('dwu') >= 0;
    };
  } else if (comp.indexOf('Data Flow') >= 0) {
    var ft = o.flowType || _SYN_FLOW[0];
    product = 'Azure Synapse Analytics Data Flow - ' + ft;
    label = 'Synapse / Data Flow ' + ft;
    matcher = function(it){ return String(it.meterName||'').toLowerCase() === 'vcore'; };
  } else {
    product = 'Azure Synapse Analytics Serverless SQL Pool';
    label = 'Synapse / Serverless SQL Pool';
    matcher = function(it){ return String(it.meterName||'').toLowerCase().indexOf('data processed') >= 0; };
  }

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Azure Synapse Analytics', armRegionName:row.region, productName:product, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:40});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Synapse 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 용량제(Consumption)만, 예약 미터가 섞이면 최저 시간단가 = 용량제
  var cands = items.filter(function(it){
    return String(it.type||'').toLowerCase() === 'consumption' && matcher(it);
  }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage).
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;

  // ── 예약(RI) ── Dedicated SQL Pool만 제공. 같은 productName의 Reservation에서 skuName=DWU 레벨,
  //    1·3년을 시간당 단가로 환산(절약 플랜은 Synapse에 없음)
  var tags = ['PAYG'];
  if (comp.indexOf('Dedicated') >= 0) {
    var resv = [];
    try { resv = await apiFetch({ serviceName:'Azure Synapse Analytics', armRegionName:row.region, productName:product, priceType:'Reservation' }, cur, 200, 3, {pageSize:200, expectedSizeKB:40}); } catch(e) { resv = []; }
    var ri = riItemsFromResv(resv, String(chosen.skuName||'').toLowerCase(), 1, cur);
    row.ri1Item = ri.ri1; row.ri3Item = ri.ri3;
    if (ri.ri1) tags.push('RI1Y'); if (ri.ri3) tags.push('RI3Y');
  }
  setStatus('ok', label + ' 완료 [' + tags.join(', ') + '] · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure);
  updatePriceCells(row); updateTotalsRow();
};
