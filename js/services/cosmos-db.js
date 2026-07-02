// ================================================================
// services/cosmos-db.js — Azure Cosmos DB (NoSQL, 처리량 RU/s 기반)
//
//   전용 resolver(_resolve_Azure_Cosmos_DB)로 과금 모델별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Azure Cosmos DB'.
//   API 구조(koreacentral): 과금 모델별 productName이 다르다:
//     - Provisioned (수동)  → productName='Azure Cosmos DB', skuName='RUs',
//                             meter '100 RU/s' (1/Hour, 0.008) — 100 RU/s 단위 시간당.
//                             단가×(RU/100)를 시간당 단가로 환산, usage 칸에 시간(예 730)
//     - Autoscale           → productName='Azure Cosmos DB autoscale', skuName='AP1~AP4',
//                             meter '<AP> 100 RUs' (1/Hour, 0.012 — 수동의 1.5배).
//                             최대 RU/s 기준 과금. 단가×(RU/100), usage 칸에 시간
//                             (Entry Price 미터·최소 10% 과금 규칙은 범위 외)
//     - Serverless          → productName='Azure Cosmos DB serverless', meter '1M RUs'
//                             (1M, 0.271) — usage 칸에 백만 RU 수 입력
//     - 저장소 (Data Stored) → productName='Azure Cosmos DB', skuName='RUs',
//                             meter 'Data Stored' (1 GB/Month, 0.25) — usage 칸에 GB 입력
//   월=단가×Qty×usage(엔진 기본). 절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외: 다중 리전 쓰기(mRUs), RU/m, Dedicated Gateway, Analytics Storage,
//           백업(PITR/Snapshot), DocumentDB(vCore), Free Tier.
// ================================================================

var _COSMOS_MODELS = [
  'Provisioned (수동, RU/s)', 'Autoscale (RU/s)', 'Serverless (백만 RU)', '저장소 (Data Stored, GB)',
];

window._svcDefs['Azure Cosmos DB'] = {
  apiServiceName: 'Azure Cosmos DB',
  steps: [
    { key:'model', label:'과금 모델', options: _COSMOS_MODELS.slice() },
    { key:'rus',   label:'처리량 (RU/s, 100 단위)', type:'number', min:100, step:100, default:400 },
  ],
  instanceField: false,
  // 과금 모델 변경 시 RU/s 입력 표시/숨김을 다시 계산
  instanceParentKey: 'model',
  _applyStepVisibility: function(r){ if (window['_cosmos_applyStepVisibility']) window['_cosmos_applyStepVisibility'](r); },
};

// RU/s 입력은 Provisioned/Autoscale에서만 사용
window['_cosmos_applyStepVisibility'] = function(r) {
  var def = window._svcDefs['Azure Cosmos DB'];
  if (!def || !def.steps) return;
  var model = (r.options && r.options.model) || '';
  var needsRu = model.indexOf('Provisioned') === 0 || model.indexOf('Autoscale') === 0;
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key === 'rus') def.steps[i]._hidden = !needsRu;
  }
};

window['_buildDetail_Azure_Cosmos_DB'] = function(r) {
  var o = r.options || {};
  window['_cosmos_applyStepVisibility'](r);
  var model = o.model || '';
  var needsRu = model.indexOf('Provisioned') === 0 || model.indexOf('Autoscale') === 0;
  var ru = Number(o.rus || 0);
  r.skuName = model ? (needsRu ? (model.split(' ')[0] + ' ' + ru + ' RU/s') : model.split(' ')[0]) : '';
  r.detail = ['Cosmos DB', model, needsRu && ru > 0 ? ru + ' RU/s' : ''].filter(Boolean).join(' / ');
};

// 가격 조회 — 과금 모델 → productName/미터 매칭. RU 모델은 단가×(RU/100) 환산
window['_resolve_Azure_Cosmos_DB'] = async function(row, cur) {
  var o = row.options || {};
  var model = o.model || 'Provisioned (수동, RU/s)';
  var ru = Number(o.rus || 0) || 400;
  var isProv = model.indexOf('Provisioned') === 0;
  var isAuto = model.indexOf('Autoscale') === 0;
  var isSrvless = model.indexOf('Serverless') === 0;
  var label = 'Cosmos DB / ' + model + ((isProv || isAuto) ? (' ' + ru + ' RU/s') : '');

  var prodName = isProv ? 'Azure Cosmos DB'
               : isAuto ? 'Azure Cosmos DB autoscale'
               : isSrvless ? 'Azure Cosmos DB serverless'
               :          'Azure Cosmos DB'; // 저장소

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Azure Cosmos DB', armRegionName:row.region, productName:prodName, priceType:'Consumption' }, cur, 300, 3, {pageSize:200, expectedSizeKB:60});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Cosmos DB 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    var sku = String(it.skuName||''), m = String(it.meterName||'').toLowerCase();
    if (isProv)    return sku === 'RUs' && m === '100 ru/s';
    if (isAuto)    return /^ap\d+ 100 rus$/.test(m) && Number(it.unitPrice||0) > 0; // AP1~AP4 동일 단가
    if (isSrvless) return m === '1m rus';
    return sku === 'RUs' && m === 'data stored'; // 저장소
  }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var payg;
  if (isProv || isAuto) {
    // 100 RU/s 단위 미터 → RU 수량을 곱해 시간당 단가로 환산 (usage 칸=시간)
    var mult = ru / 100;
    var p = Number(chosen.unitPrice) * mult;
    payg = Object.assign({}, chosen, { currencyCode:cur, unitPrice:p, retailPrice:p, unitOfMeasure:'1 Hour' });
  } else {
    payg = Object.assign({}, chosen, { currencyCode:cur });
  }
  row.paygItem = payg;
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var note = (isProv || isAuto) ? ' (usage=시간, 예 730)' : isSrvless ? ' (usage=백만 RU)' : ' (usage=GB)';
  setStatus('ok', label + ' 완료 · ' + Number(payg.unitPrice).toFixed(6) + ' / ' + payg.unitOfMeasure + note);
  updatePriceCells(row); updateTotalsRow();
};
