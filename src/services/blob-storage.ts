import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/blob-storage.js — Blob Storage
// 수정 대상: 액세스 계층/중복성/청구항목 옵션
//
//   청구 항목(metric)별로 서로 다른 미터를 조회합니다(가격 하드코딩 없음):
//     - Data Stored      : 저장 용량 요금. 단위 1 GB/Month. usage 칸에 GB 입력
//     - Read Operations  : 읽기 작업 요금. 단위 10K(=1만 건). usage 칸에 "1만 건 수" 입력
//     - Write Operations : 쓰기 작업 요금. 단위 10K. usage 칸에 "1만 건 수" 입력
//     - Data Retrieval   : 데이터 검색 요금. 단위 1 GB. usage 칸에 GB 입력
//       (Hot 계층은 검색 요금 미터가 없어 매칭 실패가 정상입니다)
//     - List and Create Container Operations / All Other Operations : 작업 요금(10K)
//       (계정 단위 미터라 API상 Hot skuName에만 태깅 → Hot 계층에서 조회. Cool/Cold는 매칭 실패가 정상)
//   월 비용 = 단가 × Qty × usage (엔진 기본 계산). 절약/예약은 저장소 단가에 적용 안 됨.
//   액세스 계층: Hot/Cool/Cold/Archive(productName='General Block Blob v2') +
//     Premium(고성능 블록 Blob, productName='Premium Block Blob', LRS/ZRS만 / 액세스 계층 구분 없음).
// ================================================================
REG._svcDefs['Blob Storage'] = {
  apiServiceName: 'Storage',
  steps: [
    { key:'blobTier',  label:'액세스 계층', options:['Hot','Cool','Cold','Archive','Premium'] },
    { key:'redundancy',label:'중복성',      options:['LRS','ZRS','GRS','RA-GRS','GZRS','RA-GZRS'] },
    { key:'metric',    label:'청구 항목',   options:['Data Stored','Read Operations','Write Operations','Data Retrieval','List and Create Container Operations','All Other Operations'] },
  ],
  instanceField: false,
};
REG['_buildDetail_Blob_Storage'] = function(r: Row) {
  const o=r.options; r.skuName=`${o.blobTier||''} ${o.redundancy||''}`.trim(); r.detail=[o.blobTier,o.redundancy,o.metric].filter(Boolean).join(', ');
};

// 가격 조회 — skuName(="<계층> <중복성>")으로 묶고 청구 항목(metric)을 meterName 키워드로 가른다
REG['_resolve_Blob_Storage'] = async function(row: Row, cur: string) {
  const o = row.options || {};
  const tier = o.blobTier || 'Hot';
  const red  = o.redundancy || 'LRS';
  const metric = o.metric || 'Data Stored';
  const skuTarget = `${tier} ${red}`.toLowerCase();

  // Premium 블록 Blob은 별도 productName('Premium Block Blob', skuName 'Premium <중복성>', LRS/ZRS만)
  const isPremium = (tier === 'Premium');
  const productName = isPremium ? 'Premium Block Blob' : 'General Block Blob v2';

  let items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Storage', armRegionName:row.region, productName, priceType:'Consumption' }, cur, 500, 5, {pageSize:200, expectedSizeKB:300});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Blob 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  const mkey = metric.toLowerCase();
  const wantStored = mkey.indexOf('stored') >= 0;
  const wantList   = mkey.indexOf('list and create') >= 0;
  const wantOther  = mkey.indexOf('all other') >= 0;
  const wantRead   = !wantList && !wantOther && mkey.indexOf('read')   >= 0;
  const wantWrite  = mkey.indexOf('write')  >= 0;
  const wantRetr   = mkey.indexOf('retrieval') >= 0;

  const cands = items.filter((it: ApiItem) => {
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== skuTarget) return false;
    const m = String(it.meterName||'').toLowerCase();
    if (m.indexOf('priority') >= 0) return false; // Archive Priority Read/Retrieval 제외
    if (wantStored) return m.indexOf('data stored') >= 0;
    if (wantList)   return m.indexOf('list and create container') >= 0;
    if (wantOther)  return m.indexOf('all other operations') >= 0;
    if (wantRead)   return m.indexOf('read operations') >= 0;
    if (wantWrite)  return m.indexOf('write operations') >= 0;
    if (wantRetr)   return m.indexOf('data retrieval') >= 0;
    return false;
  });
  // Data Stored는 사용량 구간(tierMinimumUnits)이 여러 개 → 첫 구간(0) 우선, 동률이면 낮은 단가
  cands.sort((a: ApiItem, b: ApiItem)=>{ const ta=Number(a.tierMinimumUnits||0),tb=Number(b.tierMinimumUnits||0); if(ta!==tb) return ta-tb; return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
  const chosen = cands[0] || null;

  const label = `${tier} ${red} / ${metric}`;
  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', `Blob ${label}: 매칭 실패 (${items.length}건 조회). 이 계층/중복성 조합에 해당 미터가 없을 수 있습니다.`);
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage)이 단위(GB/Month, 10K, GB)에 맞게 적용
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', `Blob ${label} 완료 · ${Number(chosen.unitPrice)} / ${chosen.unitOfMeasure} (월=단가×Qty×usage)`);
  updatePriceCells(row); updateTotalsRow();
};
