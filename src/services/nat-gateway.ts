import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/nat-gateway.js — NAT Gateway
//
//   v70부터 전용 resolver(_resolve_NAT_Gateway)로 청구 항목별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회).
//   API 구조: serviceName='NAT Gateway', productName='NAT Gateway', **armRegionName='Global'**
//     (리전 비종속 — koreacentral엔 NAT 미터가 없음. 기존 svcDef의 'Virtual Network'는 잘못된 매핑이었음),
//     skuName='Standard'. 청구 항목(meterName):
//       Resource Hour  → 'Standard Gateway'        (1 Hour, 0.045)  — 게이트웨이 리소스 시간당 요금
//       Data Processed → 'Standard Data Processed'  (1 GB, 0.045)    — 처리 데이터 GB당 요금
//   월=단가×Qty×usage(엔진 기본). Resource Hour는 usage 칸에 시간(예 730), Data Processed는 GB.
//   절약/예약 미적용. 못 찾으면 "매칭 실패". StandardV2 Log Enabled(1/Month)는 범위 외.
// ================================================================

// 청구 항목 → meterName(소문자)
var _NATGW_METER: Record<string, string> = {
  'Resource Hour':  'standard gateway',
  'Data Processed': 'standard data processed',
};

REG._svcDefs['NAT Gateway'] = {
  apiServiceName: 'NAT Gateway',
  steps: [
    { key:'metric', label:'청구 항목', options:['Resource Hour','Data Processed'] },
  ],
  instanceField: false,
};
REG['_buildDetail_NAT_Gateway'] = function(r: Row) {
  var o = r.options || {};
  r.skuName = 'NAT Gateway';
  r.detail = ['NAT Gateway', o.metric].filter(Boolean).join(' - ');
};

// 가격 조회 — armRegionName='Global'에서 skuName='Standard' + meterName 정확 일치
REG['_resolve_NAT_Gateway'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var metric = o.metric || 'Resource Hour';
  var target = _NATGW_METER[metric];
  var label = 'NAT Gateway / ' + metric;

  if (!target) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 청구 항목을 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items: ApiItem[] = [];
  try {
    // NAT Gateway 미터는 리전 비종속(armRegionName='Global') — row.region이 아닌 Global로 조회
    items = await apiFetch({ serviceName:'NAT Gateway', armRegionName:'Global', productName:'NAT Gateway', priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:30});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'NAT Gateway 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== 'standard') return false;   // StandardV2(Log Enabled) 제외
    return String(it.meterName||'').toLowerCase() === target;
  }).sort(function(a: ApiItem, b: ApiItem){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure);
  updatePriceCells(row); updateTotalsRow();
};
