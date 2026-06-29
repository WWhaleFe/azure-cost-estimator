// ================================================================
// services/bastion.js — Azure Bastion
// 수정 대상: 계층/청구항목 옵션, 가격 필터(_resolve_Azure_Bastion)
//
//   v62부터 전용 resolver(_resolve_Azure_Bastion)로 청구 항목별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회).
//   API 구조: serviceName='Azure Bastion', productName='Azure Bastion'(계층 접미사 없음),
//     skuName=계층(Basic/Standard/Premium). 미터 종류는 3가지:
//     - 게이트웨이(시간당)     : '<계층> Gateway' (단위 1 Hour) — 핵심 배포 요금
//         Basic 0.19 / Standard 0.29 / Premium 0.45 (koreacentral, USD)
//     - 추가 게이트웨이(시간당): '<계층> Additional Gateway' (단위 1 Hour) — 스케일 유닛 추가분
//         Standard 0.14 / Premium 0.22. Basic은 미터가 없어 매칭 실패가 정상
//     - 데이터 전송 아웃(GB)   : '<계층> Data Transfer Out' (단위 1 GB) — 계단형 요금
//         첫 5GB 무료 후 0.12부터(대용량 구간 0.085→0.082→0.08 할인). 엔진은 단일 단가만
//         쓰므로 '첫 유료 구간(>5GB) 단가'를 대표값으로 사용 → 무료 한도·대용량 할인은 미반영
//   월 비용 = 단가 × Qty × usage(엔진 기본 계산). 게이트웨이/추가 게이트웨이 usage 칸엔 시간(예 730),
//     데이터 전송 usage 칸엔 GB 입력. 절약/예약(SP/RI) 미적용. 못 찾으면 "매칭 실패" 표시.
// ================================================================
window._svcDefs['Azure Bastion'] = {
  apiServiceName: 'Azure Bastion',
  steps: [
    { key:'tier',   label:'계층',      options:['Basic','Standard','Premium'] },
    { key:'metric', label:'청구 항목', options:['게이트웨이(시간당)','추가 게이트웨이(시간당)','데이터 전송 아웃(GB)'] },
  ],
  instanceField: false,
};
window['_buildDetail_Azure_Bastion'] = function(r) {
  const o = r.options || {};
  r.skuName = o.tier || '';
  r.detail = ['Azure Bastion', o.tier, o.metric].filter(Boolean).join(' / ');
};

// 가격 조회 — skuName(=계층)으로 묶고 청구 항목(metric)을 meterName 정확 일치로 가른다
window['_resolve_Azure_Bastion'] = async function(row, cur) {
  const o = row.options || {};
  const tier = o.tier || 'Basic';
  const metric = o.metric || '게이트웨이(시간당)';

  let items = [];
  try {
    items = await apiFetch({ serviceName:'Azure Bastion', armRegionName:row.region, productName:'Azure Bastion', priceType:'Consumption' }, cur, 500, 5, {pageSize:200, expectedSizeKB:100});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure Bastion 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 청구 항목 → meterName 정확 일치 타깃('Standard Gateway'가 'Standard Additional Gateway'와
  // 부분 충돌하지 않도록 정확 일치 사용)
  const isAdditional = metric.indexOf('추가') >= 0;
  const isTransfer   = metric.indexOf('전송') >= 0;
  // meterName은 아래에서 toLowerCase()로 비교하므로 target도 소문자로 맞춘다
  // (tier가 'Basic/Standard/Premium' 대문자라 소문자화하지 않으면 'basic gateway' !== 'Basic gateway'로 항상 불일치)
  const tierLower = tier.toLowerCase();
  const target = isAdditional ? `${tierLower} additional gateway`
              : isTransfer    ? `${tierLower} data transfer out`
              :                 `${tierLower} gateway`;

  let cands = items.filter(it => {
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== tier.toLowerCase()) return false;
    return String(it.meterName||'').toLowerCase() === target;
  });
  // 데이터 전송은 계단형 — 첫 유료 구간(unitPrice>0, tierMinimumUnits 최소)을 대표 단가로
  if (isTransfer) {
    const paid = cands.filter(it => Number(it.unitPrice||0) > 0);
    if (paid.length) cands = paid;
  }
  cands.sort((a,b)=> (Number(a.tierMinimumUnits||0) - Number(b.tierMinimumUnits||0)) || (Number(a.unitPrice||0) - Number(b.unitPrice||0)));
  const chosen = cands[0] || null;

  const label = `${tier} / ${metric}`;
  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', `Azure Bastion ${label}: 매칭 실패 (${items.length}건 조회). 이 조합에 미터가 없을 수 있습니다(Basic은 추가 게이트웨이 미터 없음).`);
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  const note = isTransfer ? ' (첫 5GB 무료·대용량 할인 미반영)' : '';
  setStatus('ok', `Azure Bastion ${label} 완료 · ${Number(chosen.unitPrice)} / ${chosen.unitOfMeasure}${note}`);
  updatePriceCells(row); updateTotalsRow();
};
