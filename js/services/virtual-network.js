// ================================================================
// services/virtual-network.js — Virtual Network (VNet 피어링 데이터 전송)
//
//   VNet 리소스 자체는 무료입니다. 과금되는 항목은 **VNet 피어링 데이터 전송**으로,
//   전용 resolver(_resolve_Virtual_Network)가 방향별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Virtual Network'.
//   API 구조(koreacentral): productName='Global Virtual Network Peering', skuName='Inter-Region'.
//     - Global Peering - Outbound (Egress) → meter 'Inter-Region Egress' (1 GB, 0.09) — 송신 데이터
//     - Global Peering - Inbound (Ingress) → meter 'Inter-Region Ingress' (1 GB, 0.09) — 수신 데이터
//   월=단가×Qty×usage(엔진 기본). usage 칸에 전송 GB 입력. 절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외: 동일 리전 내 피어링(Intra-Region, 리전에 따라 별도 제품), 공인 IP(Public IP 카테고리 사용),
//     Public IP Prefix.
// ================================================================

// 전송 방향 → meterName(소문자). 모두 productName='Global Virtual Network Peering'
var _VNET_METER = {
  'Global Peering - Outbound (Egress)': 'inter-region egress',
  'Global Peering - Inbound (Ingress)': 'inter-region ingress',
};

window._svcDefs['Virtual Network'] = {
  apiServiceName: 'Virtual Network',
  steps: [
    { key:'direction', label:'피어링 전송', options:['Global Peering - Outbound (Egress)','Global Peering - Inbound (Ingress)'] },
  ],
  instanceField: false,
};
window['_buildDetail_Virtual_Network'] = function(r) {
  var o = r.options || {};
  r.skuName = o.direction || '';
  r.detail = o.direction || '';
};

// 가격 조회 — productName='Global Virtual Network Peering' 안에서 방향별 meterName 정확 일치
window['_resolve_Virtual_Network'] = async function(row, cur) {
  var o = row.options || {};
  var direction = o.direction || 'Global Peering - Outbound (Egress)';
  var target = _VNET_METER[direction];
  var label = 'Virtual Network / ' + direction;

  if (!target) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 전송 방향을 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Virtual Network', armRegionName:row.region, productName:'Global Virtual Network Peering', priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:30});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Virtual Network 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    return String(it.meterName||'').toLowerCase() === target;
  }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회). 이 리전에 글로벌 피어링 미터가 없을 수 있습니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + ' (usage=GB)');
  updatePriceCells(row); updateTotalsRow();
};
