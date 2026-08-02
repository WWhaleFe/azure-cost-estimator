import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
// ================================================================
// services/firewall.js — Azure Firewall
//
//   v67부터 전용 resolver(_resolve_Azure_Firewall)로 계층×청구 항목별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회).
//   API 구조: serviceName='Azure Firewall', productName='Azure Firewall', skuName=계층.
//     독립형(VNet) 방화벽 기준 — skuName 'Standard'/'Premium'/'Basic' 정확 일치
//     (Virtual WAN용 'Secured Virtual Hub' SKU는 범위 외 → skuName 정확 일치로 자동 제외).
//   청구 항목(meterName, koreacentral USD):
//     Deployment(배포, 1 Hour):        Standard 1.25 / Premium 1.75 / Basic 0.395
//     Data Processed(데이터 처리, 1 GB): Standard 0.016 / Premium 0.016 / Basic 0.065
//     Capacity Unit(용량 단위, 1 Hour): Standard 0.07 / Premium 0.11 (Basic은 미터 없음)
//   Standard/Premium은 3개 항목, Basic은 Capacity Unit이 없어 2개 → 계층에 따라 청구 항목을
//     동적 전환한다(instanceParentKey='tier' + _fw_applyStepVisibility, LB/App Gateway 패턴).
//   월=단가×Qty×usage(엔진 기본). 시간제(Deployment/Capacity Unit)는 usage 칸에 시간(예 730),
//     데이터 처리는 usage 칸에 GB. 절약/예약 미적용. 못 찾으면 "매칭 실패".
// ================================================================

// 청구 항목 라벨 → meterName 접미사(소문자)
var _FW_METER_SUFFIX = {
  'Deployment (배포, 시간당)':       'deployment',
  'Data Processed (데이터 처리, GB)': 'data processed',
  'Capacity Unit (용량 단위, 시간당)': 'capacity unit',
};
// 계층별 청구 항목 옵션(Basic은 Capacity Unit 없음)
var _FW_METRICS = {
  'Standard': ['Deployment (배포, 시간당)','Data Processed (데이터 처리, GB)','Capacity Unit (용량 단위, 시간당)'],
  'Premium':  ['Deployment (배포, 시간당)','Data Processed (데이터 처리, GB)','Capacity Unit (용량 단위, 시간당)'],
  'Basic':    ['Deployment (배포, 시간당)','Data Processed (데이터 처리, GB)'],
};

REG._svcDefs['Azure Firewall'] = {
  apiServiceName: 'Azure Firewall',
  steps: [
    { key:'tier',   label:'계층',     options:['Standard','Premium','Basic'] },
    { key:'metric', label:'청구 항목', options:['Deployment (배포, 시간당)','Data Processed (데이터 처리, GB)','Capacity Unit (용량 단위, 시간당)'] },
  ],
  instanceField: false,
  // 계층 변경 시 청구 항목 옵션을 다시 구성하기 위해 패널 재렌더 트리거
  instanceParentKey: 'tier',
  _applyStepVisibility: function(r){ if (REG['_fw_applyStepVisibility']) REG['_fw_applyStepVisibility'](r); },
};

REG['_fw_applyStepVisibility'] = function(r) {
  var def = REG._svcDefs['Azure Firewall'];
  if (!def || !def.steps) return;
  var tier = (r.options && r.options.tier) || 'Standard';
  var opts = _FW_METRICS[tier] || _FW_METRICS['Standard'];
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'metric') continue;
    def.steps[i].options = opts;
    if (r.options && opts.indexOf(r.options.metric) < 0) r.options.metric = opts[0] || '';
  }
};

REG['_buildDetail_Azure_Firewall'] = function(r) {
  var o = r.options || {};
  REG['_fw_applyStepVisibility'](r);
  r.skuName = o.tier || '';
  r.detail = ['Azure Firewall', o.tier, o.metric].filter(Boolean).join(' / ');
};

// 가격 조회 — skuName=계층 + meterName='<계층> <청구 항목>' 정확 일치
REG['_resolve_Azure_Firewall'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'Standard';
  var metric = o.metric || (_FW_METRICS[tier] || [])[0] || '';
  var suffix = _FW_METER_SUFFIX[metric];
  var label = tier + ' / ' + (metric || '(청구 항목 미선택)');

  if (!suffix) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure Firewall ' + label + ': 청구 항목을 선택하세요(이 계층에 없는 항목일 수 있음).');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var target = (tier + ' ' + suffix).toLowerCase();   // 예: 'standard deployment'

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Azure Firewall', armRegionName:row.region, productName:'Azure Firewall', priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:50});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure Firewall 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== tier.toLowerCase()) return false;   // 'Secured Virtual Hub' SKU 제외
    return String(it.meterName||'').toLowerCase() === target;
  }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure Firewall ' + label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', 'Azure Firewall ' + label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure);
  updatePriceCells(row); updateTotalsRow();
};
