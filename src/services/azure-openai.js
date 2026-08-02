import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
// ================================================================
// services/azure-openai.js — Azure OpenAI Service (토큰 기반)
//
//   전용 resolver(_resolve_Azure_OpenAI)로 모델×토큰 종류 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Foundry Models'.
//   API 구조(koreacentral): 모델 세대별 productName이 다르다:
//     - GPT-5 계열   → 'Azure OpenAI GPT5', 단위 1M 토큰 (예 '5 pp inp Gl' 2.5/1M)
//     - GPT-4.x/o1/o3 → 'Azure OpenAI', 단위 1K 토큰 (예 'gpt 4.1 Inp glbl' 0.002/1K)
//     - o4-mini      → 'Azure OpenAI Reasoning', 단위 1K 토큰
//     - 임베딩       → 'Azure OpenAI Embedding', 단위 1K 토큰 (입력만 존재)
//   skuName을 카탈로그(_AOAI_CATALOG)로 정확 일치 매칭. Global 배포(glbl/Gl) 기준 —
//   Data Zone/Regional 배포, Batch, Fine-tuning, 오디오/이미지/실시간 모델은 범위 외.
//   1K 단위 미터는 ×1000으로 1M 토큰당 단가로 환산해 usage 단위를 통일:
//   월=단가×Qty×usage(엔진 기본), usage 칸에 백만(1M) 토큰 수 입력.
//   절약/예약(Provisioned Throughput 포함) 미적용. 못 찾으면 "매칭 실패".
// ================================================================

// 모델 → productName + 토큰 종류별 skuName 정확 일치 타깃(입력/출력/캐시 입력)
var _AOAI_CATALOG = {
  'GPT-5':                { prod:'Azure OpenAI GPT5', inp:'5 pp inp Gl',      out:'5 pp opt Gl',      cache:'5 pp cd inp Gl' },
  'GPT-5 mini':           { prod:'Azure OpenAI GPT5', inp:'5 mini pp Inp Gl', out:'5 mini pp Opt Gl', cache:'5 mini pp cd Inp Gl' },
  'GPT-5.1':              { prod:'Azure OpenAI GPT5', inp:'5.1 pp inp Gl',    out:'5.1 pp opt Gl',    cache:'5.1 pp cd inp Gl' },
  'GPT-5.2':              { prod:'Azure OpenAI GPT5', inp:'5.2 pp inp Gl',    out:'5.2 pp opt Gl',    cache:'5.2 pp cd inp Gl' },
  'GPT-4.1':              { prod:'Azure OpenAI', inp:'gpt 4.1 Inp glbl',      out:'gpt 4.1 Outp glbl',      cache:'gpt 4.1 cached Inp glbl' },
  'GPT-4.1 mini':         { prod:'Azure OpenAI', inp:'gpt 4.1 mini Inp glbl', out:'gpt 4.1 mini Outp glbl', cache:'gpt 4.1 mini cached Inp glbl' },
  'GPT-4.1 nano':         { prod:'Azure OpenAI', inp:'gpt 4.1 nano Inp glbl', out:'gpt 4.1 nano Outp glbl', cache:'gpt 4.1 nano cached Inp glbl' },
  'GPT-4o (1120)':        { prod:'Azure OpenAI', inp:'gpt 4o 1120 Inp glbl',  out:'gpt 4o 1120 Outp glbl',  cache:'gpt 4o 1120 cached Inp glbl' },
  'GPT-4o mini (0718)':   { prod:'Azure OpenAI', inp:'gpt-4o-mini-0718-Inp-glbl', out:'gpt-4o-mini-0718-Outp-glbl', cache:'gpt 4o mini 0718 cached Inp glbl' },
  'o1 (1217)':            { prod:'Azure OpenAI', inp:'o1 1217 Inp glbl',      out:'o1 1217 Outp glbl',      cache:'o1 1217 cached Inp glbl' },
  'o3 (0416)':            { prod:'Azure OpenAI', inp:'o3 0416 Inp glbl',      out:'o3 0416 Outp glbl',      cache:'o3 0416 cached Inp glbl' },
  'o3 mini (0131)':       { prod:'Azure OpenAI', inp:'o3 mini 0131 input glbl', out:'o3 mini 0131 output glbl', cache:'o3 mini 0131 cached input glbl' },
  'o4-mini (0416)':       { prod:'Azure OpenAI Reasoning', inp:'o4-mini 0416 Inp glbl', out:'o4-mini 0416 Outp glbl', cache:'o4-mini 0416 cached Inp glbl' },
  'text-embedding-3-small': { prod:'Azure OpenAI Embedding', inp:'text embedding 3 small DZ', out:null, cache:null },
  'text-embedding-3-large': { prod:'Azure OpenAI Embedding', inp:'text embedding 3 large DZ', out:null, cache:null },
};

var _AOAI_METRIC_KEY = { '입력 토큰':'inp', '출력 토큰':'out', '캐시 입력 토큰':'cache' };

REG._svcDefs['Azure OpenAI'] = {
  apiServiceName: 'Foundry Models',
  steps: [
    { key:'model',  label:'모델',      options: Object.keys(_AOAI_CATALOG) },
    { key:'metric', label:'토큰 종류', options: Object.keys(_AOAI_METRIC_KEY) },
  ],
  instanceField: false,
};
REG['_buildDetail_Azure_OpenAI'] = function(r) {
  var o = r.options || {};
  r.skuName = o.model || '';
  r.detail = ['Azure OpenAI', o.model, o.metric].filter(Boolean).join(' / ');
};

// 가격 조회 — 카탈로그의 skuName 정확 일치, 1K 미터는 1M 토큰당 단가로 환산
REG['_resolve_Azure_OpenAI'] = async function(row, cur) {
  var o = row.options || {};
  var model = o.model || '';
  var metric = o.metric || '입력 토큰';
  var conf = _AOAI_CATALOG[model];
  var label = 'Azure OpenAI / ' + (model || '(모델 미선택)') + ' / ' + metric;

  if (!conf) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 모델을 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var skuTarget = conf[_AOAI_METRIC_KEY[metric]];
  if (!skuTarget) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 이 모델에 없는 토큰 종류입니다(임베딩은 입력 토큰만).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Foundry Models', armRegionName:row.region, productName:conf.prod, priceType:'Consumption' }, cur, 1000, 5, {pageSize:500, expectedSizeKB:300});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure OpenAI 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var target = skuTarget.toLowerCase();
  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    return String(it.skuName||'').toLowerCase() === target;
  }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회). 이 리전에 없는 모델일 수 있습니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 1K 토큰 미터는 ×1000 → 1M 토큰당 단가로 통일 (usage 칸=백만 토큰)
  var uom = String(chosen.unitOfMeasure||'');
  var payg;
  if (/1\s*K/i.test(uom) && !/1M/i.test(uom)) {
    var p = Number(chosen.unitPrice) * 1000;
    payg = Object.assign({}, chosen, { currencyCode:cur, unitPrice:p, retailPrice:p, unitOfMeasure:'1M (normalized)' });
  } else {
    payg = Object.assign({}, chosen, { currencyCode:cur });
  }
  row.paygItem = payg;
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(payg.unitPrice).toFixed(4) + ' / 1M 토큰 (usage=백만 토큰, Global 배포 기준)');
  updatePriceCells(row); updateTotalsRow();
};
