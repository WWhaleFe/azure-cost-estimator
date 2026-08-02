import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
// ================================================================
// services/container-registry.js — Azure Container Registry (ACR)
//
//   전용 resolver(_resolve_Azure_Container_Registry)로 계층×청구 항목 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Container Registry'.
//   API 구조(koreacentral): productName='Container Registry', skuName=계층(Basic/Standard/Premium).
//     - 레지스트리(일 단위): meter '<계층> Registry Unit' (1/Day)
//         Basic 0.1666 / Standard 0.6666 / Premium 1.6666 — usage 칸에 일수(예 30)
//     - 추가 저장소(GB/월) : meter 'Data Stored' (1 GB/Month, 0.1)
//         포함 용량(Basic 10GB/Standard 100GB/Premium 500GB) 초과분만 입력 — usage 칸에 GB
//   월=단가×Qty×usage(엔진 기본). 절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외: Task vCPU(빌드, 0.0으로 조회됨), Premium Connected Registry,
//           Geo-replication(Replication Unit — 필요 시 Qty=복제 리전 수로 별도 행 권장).
// ================================================================

REG._svcDefs['Azure Container Registry'] = {
  apiServiceName: 'Container Registry',
  steps: [
    { key:'tier',   label:'계층',      options:['Basic','Standard','Premium'] },
    { key:'metric', label:'청구 항목', options:['레지스트리 (일 단위)','추가 저장소 (GB/월)'] },
  ],
  instanceField: false,
};
REG['_buildDetail_Azure_Container_Registry'] = function(r) {
  var o = r.options || {};
  r.skuName = o.tier || '';
  r.detail = ['ACR', o.tier, o.metric].filter(Boolean).join(' / ');
};

// 가격 조회 — skuName=계층 + meterName 정확 일치(레지스트리/저장소)
REG['_resolve_Azure_Container_Registry'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'Basic';
  var metric = o.metric || '레지스트리 (일 단위)';
  var isStorage = metric.indexOf('저장소') >= 0;
  var label = 'ACR / ' + tier + ' / ' + metric;

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Container Registry', armRegionName:row.region, productName:'Container Registry', priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:20});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'ACR 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var target = isStorage ? 'data stored' : tier.toLowerCase() + ' registry unit';
  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== tier.toLowerCase()) return false;
    return String(it.meterName||'').toLowerCase() === target;
  }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var note = isStorage ? ' (usage=포함 용량 초과 GB)' : ' (usage=일수, 예 30)';
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + note);
  updatePriceCells(row); updateTotalsRow();
};
