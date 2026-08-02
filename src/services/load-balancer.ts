import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/load-balancer.js — Load Balancer
//
//   v64부터 전용 resolver(_resolve_Load_Balancer)로 계층×청구 항목별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회).
//   API 구조: serviceName='Load Balancer', productName='Load Balancer',
//     armRegionName='Global'(리전 비종속 — koreacentral엔 LB 미터가 없음), skuName=계층.
//   계층마다 미터 체계가 다르므로 청구 항목(metric) 옵션을 계층에 따라 바꾼다:
//     - Standard / Global:
//         규칙(시간당, 5개 포함) : '<계층> Included LB Rules and Outbound Rules' (1 Hour, 0.025)
//         초과 규칙(시간당)      : '<계층> Overage LB Rules and Outbound Rules' (1/Hour, 0.01)
//         데이터 처리(GB)        : '<계층> Data Processed' (1 GB, Standard 0.005 / Global 0.0)
//     - Gateway:
//         게이트웨이(시간당)      : 'Gateway' (1 Hour, 0.0125)
//         게이트웨이 체인(시간당) : 'Gateway Chain' (1 Hour, 0.01)
//         데이터 처리(GB)        : 'Gateway Data Processed' (1 GB, 0.004)
//     - Basic: 과금 미터 없음(무료). 선택 시 "무료" 안내만 표시
//   월 비용 = 단가 × Qty × usage(엔진 기본). 시간제 항목은 usage 칸에 시간(예 730, 초과 규칙은
//     Qty=추가 규칙 수), 데이터 처리는 usage 칸에 GB 입력. 절약/예약 미적용. 못 찾으면 "매칭 실패".
//   ('- Free' 무료 변형 미터는 정확 일치로 자동 제외)
// ================================================================
REG._svcDefs['Load Balancer'] = {
  apiServiceName: 'Load Balancer',
  steps: [
    { key:'tier',   label:'계층',     options:['Standard','Gateway','Global','Basic'] },
    { key:'metric', label:'청구 항목', options:['규칙 (시간당, 5개 포함)','초과 규칙 (시간당)','데이터 처리 (GB)'] },
  ],
  instanceField: false,
  // 계층 변경 시 청구 항목 옵션을 다시 구성하기 위해 패널 재렌더 트리거
  instanceParentKey: 'tier',
  _applyStepVisibility: function(r: Row){ if (REG['_lb_applyStepVisibility']) REG['_lb_applyStepVisibility'](r); },
};

// 계층별 청구 항목(metric) 옵션 매핑
var _LB_METRICS: Record<string, string[]> = {
  'Standard': ['규칙 (시간당, 5개 포함)','초과 규칙 (시간당)','데이터 처리 (GB)'],
  'Global':   ['규칙 (시간당, 5개 포함)','초과 규칙 (시간당)','데이터 처리 (GB)'],
  'Gateway':  ['게이트웨이 (시간당)','게이트웨이 체인 (시간당)','데이터 처리 (GB)'],
  'Basic':    [],
};

// 구버전 CSV(v96 이전 양식)의 영문 metric 값 → 현재 한글 라벨.
//   과거 양식은 'metric=Rules' 식의 영문 값을 썼는데, 정규화 없이 목록 불일치로
//   조용히 지워져 '청구 항목을 선택하세요' 오류(가격 미조회)가 났음(v101에서 수정).
var _LB_METRIC_ALIAS: Record<string, string> = {
  'rules':            '규칙 (시간당, 5개 포함)',
  'included rules':   '규칙 (시간당, 5개 포함)',
  'overage rules':    '초과 규칙 (시간당)',
  'data processed':   '데이터 처리 (GB)',
  'gateway':          '게이트웨이 (시간당)',
  'gateway chain':    '게이트웨이 체인 (시간당)',
};

// 계층에 따라 청구 항목 옵션을 교체하고, 현재 값이 새 목록에 없으면 비운다(Basic은 항목 숨김)
REG['_lb_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Load Balancer'];
  if (!def || !def.steps) return;
  var tier = (r.options && r.options.tier) || 'Standard';
  var opts = _LB_METRICS[tier] || [];
  // 구버전 영문 값이면 현재 라벨로 정규화한 뒤 목록 검사
  if (r.options && r.options.metric && opts.indexOf(r.options.metric) < 0) {
    var alias = _LB_METRIC_ALIAS[String(r.options.metric).trim().toLowerCase()];
    if (alias && opts.indexOf(alias) >= 0) r.options.metric = alias;
  }
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'metric') continue;
    def.steps[i].options = opts;
    def.steps[i]._hidden = (tier === 'Basic');
    if (r.options && opts.indexOf(r.options.metric) < 0) r.options.metric = '';
  }
};

REG['_buildDetail_Load_Balancer'] = function(r: Row) {
  var o = r.options || {};
  REG['_lb_applyStepVisibility'](r);
  r.skuName = o.tier || '';
  r.detail = ['Load Balancer', o.tier, (o.tier === 'Basic' ? '무료' : o.metric)].filter(Boolean).join(' / ');
};

// 가격 조회 — skuName=계층 + meterName 정확 일치(계층×청구 항목 → 미터)
REG['_resolve_Load_Balancer'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var tier = o.tier || 'Standard';
  var metric = o.metric || '';

  if (tier === 'Basic') {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('ok', 'Basic Load Balancer는 무료입니다(과금 미터 없음). Standard/Gateway/Global을 선택하면 가격이 조회됩니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // (계층, 청구 항목) → 정확 일치할 meterName(소문자)
  var MAP: Record<string, Record<string, string>> = {
    'Standard': {
      '규칙 (시간당, 5개 포함)': 'standard included lb rules and outbound rules',
      '초과 규칙 (시간당)':      'standard overage lb rules and outbound rules',
      '데이터 처리 (GB)':        'standard data processed',
    },
    'Global': {
      '규칙 (시간당, 5개 포함)': 'global included lb rules and outbound rules',
      '초과 규칙 (시간당)':      'global overage lb rules and outbound rules',
      '데이터 처리 (GB)':        'global data processed',
    },
    'Gateway': {
      '게이트웨이 (시간당)':      'gateway',
      '게이트웨이 체인 (시간당)': 'gateway chain',
      '데이터 처리 (GB)':        'gateway data processed',
    },
  };
  var target = (MAP[tier] || {})[metric];

  var label = tier + ' / ' + (metric || '(청구 항목 미선택)');
  if (!target) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Load Balancer ' + label + ': 청구 항목을 선택하세요(이 계층에 없는 항목일 수 있음).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items: ApiItem[] = [];
  try {
    // LB 미터는 리전 비종속(armRegionName='Global') — row.region이 아닌 Global로 조회
    items = await apiFetch({ serviceName:'Load Balancer', armRegionName:'Global', productName:'Load Balancer', priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:50});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Load Balancer 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== tier.toLowerCase()) return false;
    return String(it.meterName||'').toLowerCase() === target;  // 정확 일치 → '- Free' 변형 제외
  }).sort(function(a: ApiItem, b: ApiItem){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Load Balancer ' + label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', 'Load Balancer ' + label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure);
  updatePriceCells(row); updateTotalsRow();
};
