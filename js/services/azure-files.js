// ================================================================
// services/azure-files.js — Azure Files
// 수정 대상: 계층/중복성/청구항목 옵션, 가격 필터
//
//   가격 조회(_resolve_Azure_Files): skuName(="<API계층> <중복성>")으로 묶고
//   청구 항목(metric)을 meterName 키워드로 가른다(가격 하드코딩 없음, API 실시간 조회).
//     계층 매핑: Premium→productName 'Premium Files'(skuName 'Premium ...'),
//       Hot/Cool/Transaction Optimized→'Files v2'(skuName 'Hot ...'/'Cool ...'/'Standard ...')
//     청구 항목: Data Stored→'data stored'(GB/Month), Snapshots→'snapshots', Metadata→'metadata'.
//       Premium은 'Data Stored' 미터가 없어 'Provisioned'(프로비저닝 용량)으로 매칭
//     월 비용 = 단가 × Qty × usage(엔진 기본). usage 칸에 GB 입력. 절약/예약 미적용.
//     일부 조합은 미터가 없어 매칭 실패가 정상(Premium은 GRS·Metadata 없음,
//       Snapshots는 Premium만, Transaction Optimized는 Metadata 없음)
// ================================================================
window._svcDefs['Azure Files'] = {
  apiServiceName: 'Storage',
  steps: [
    { key:'fileTier',  label:'계층',      options:['Premium','Hot','Cool','Transaction Optimized'] },
    { key:'redundancy',label:'중복성',    options:['LRS','ZRS','GRS'] },
    { key:'metric',    label:'청구 항목', options:['Data Stored','Snapshots','Metadata'] },
  ],
  instanceField: false,
};
window['_buildDetail_Azure_Files'] = function(r) {
  const o=r.options; r.skuName=`${o.fileTier||''} ${o.redundancy||''}`.trim(); r.detail=[o.fileTier,o.redundancy,o.metric].filter(Boolean).join(', ');
};

// 가격 조회 — skuName(="<API계층> <중복성>")으로 묶고 청구 항목(metric)을 meterName 키워드로 가른다
window['_resolve_Azure_Files'] = async function(row, cur) {
  const o = row.options || {};
  const tier = o.fileTier || 'Hot';
  const red  = o.redundancy || 'LRS';
  const metric = o.metric || 'Data Stored';

  // 앱 계층 → API skuName 접두사 / productName
  const TIER_PREFIX = { 'Premium':'Premium', 'Hot':'Hot', 'Cool':'Cool', 'Transaction Optimized':'Standard' };
  const prefix = TIER_PREFIX[tier] || tier;
  const skuTarget = `${prefix} ${red}`.toLowerCase();      // 예: 'hot lrs', 'standard grs', 'premium zrs'
  const isPremium = (tier === 'Premium');
  const productName = isPremium ? 'Premium Files' : 'Files v2';

  let items = [];
  try {
    items = await apiFetch({ serviceName:'Storage', armRegionName:row.region, productName, priceType:'Consumption' }, cur, 500, 5, {pageSize:200, expectedSizeKB:200});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure Files 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  const mk = metric.toLowerCase();
  const wantStored = mk.indexOf('stored') >= 0;
  const wantSnap   = mk.indexOf('snapshot') >= 0;
  const wantMeta   = mk.indexOf('metadata') >= 0;

  const cands = items.filter(it => {
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== skuTarget) return false;
    const m = String(it.meterName||'').toLowerCase();
    if (wantStored) {
      // Premium은 'Data Stored' 미터가 없고 'Provisioned'(프로비저닝 용량)이 저장 요금
      return isPremium ? (m.indexOf('provisioned') >= 0 && m.indexOf('burst') < 0) : (m.indexOf('data stored') >= 0);
    }
    if (wantSnap) return m.indexOf('snapshots') >= 0;
    if (wantMeta) return m.indexOf('metadata') >= 0;
    return false;
  });
  cands.sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
  const chosen = cands[0] || null;

  const label = `${tier} ${red} / ${metric}`;
  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', `Azure Files ${label}: 매칭 실패. 이 계층/중복성에 해당 미터가 없을 수 있습니다(Premium은 GRS·Metadata 없음, Snapshots는 Premium만, Transaction Optimized는 Metadata 없음).`);
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 단위는 1 GB/Month.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', `Azure Files ${label} 완료 · ${Number(chosen.unitPrice)} / ${chosen.unitOfMeasure} (월=단가×Qty×usage)`);
  updatePriceCells(row); updateTotalsRow();
};
