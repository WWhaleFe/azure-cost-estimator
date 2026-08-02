import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/bandwidth.js — Bandwidth (데이터 전송)
//
//   v72부터 전용 resolver(_resolve_Bandwidth)로 전송 방향별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Bandwidth'.
//   API 구조(koreacentral): productName='Rtn Preference: MGN'(Microsoft Global Network), 단위 1 GB.
//     Outbound (Internet Egress) → meter 'Standard Data Transfer Out'(계단형: 0~100GB 무료, 이후
//        0.12 → 0.085 → 0.082 → 0.08). 엔진은 단일 단가만 쓰므로 '첫 유료 구간(>100GB) 0.12'를 대표값으로
//        사용 → 무료 100GB·대용량 할인은 미반영(상태창에 명시)
//     Inter-region → meter 'Standard Inter-Region Data Transfer' (0.08)
//     Intra-region → meter 'Standard Inter-Availability Zone Data Transfer Out' (0.01, 가용성 영역 간)
//   월=단가×Qty×usage(엔진 기본). usage 칸에 GB 입력. 절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외: 라우팅 기본 설정(Routing Preference: Internet) 별도 제품, In(수신, 무료), China 전용 미터.
// ================================================================

// 전송 방향 → meterName(소문자). 모두 productName='Rtn Preference: MGN'
var _BW_METER: Record<string, string> = {
  'Outbound (Internet Egress)': 'standard data transfer out',
  'Inter-region':               'standard inter-region data transfer',
  'Intra-region':               'standard inter-availability zone data transfer out',
};

REG._svcDefs['Bandwidth'] = {
  apiServiceName: 'Bandwidth',
  steps: [
    { key:'direction', label:'전송 방향', options:['Outbound (Internet Egress)','Inter-region','Intra-region'] },
  ],
  instanceField: false,
};
REG['_buildDetail_Bandwidth'] = function(r: Row) {
  var o = r.options || {};
  r.skuName = o.direction || '';
  r.detail = o.direction || '';
};

// 가격 조회 — productName='Rtn Preference: MGN' 안에서 방향별 meterName 정확 일치
REG['_resolve_Bandwidth'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var direction = o.direction || 'Outbound (Internet Egress)';
  var target = _BW_METER[direction];
  var label = 'Bandwidth / ' + direction;

  if (!target) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 전송 방향을 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Bandwidth', armRegionName:row.region, productName:'Rtn Preference: MGN', priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:30});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Bandwidth 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    return String(it.meterName||'').toLowerCase() === target;
  });
  // 계단형: 무료(0.0) 구간을 빼고 첫 유료 구간(tierMinimumUnits 최소)을 대표 단가로
  var paid = cands.filter(function(it: ApiItem){ return Number(it.unitPrice||0) > 0; });
  if (paid.length) cands = paid;
  cands.sort(function(a: ApiItem, b: ApiItem){ return (Number(a.tierMinimumUnits||0) - Number(b.tierMinimumUnits||0)) || (Number(a.unitPrice||0) - Number(b.unitPrice||0)); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var note = (direction.indexOf('Egress') >= 0) ? ' (무료 100GB·대용량 할인 미반영)' : '';
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + note);
  updatePriceCells(row); updateTotalsRow();
};
