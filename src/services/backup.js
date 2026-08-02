import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
// ================================================================
// services/backup.js — Azure Backup (Recovery Services)
//   Azure Backup 요금은 두 가지로 구성됩니다(가격 하드코딩 없음, 모두 API 실시간 조회):
//     1) 보호 인스턴스(Protected Instance): 보호 대상 1개당 월정액(단위 1/Month)
//        - 워크로드별 단가가 다름(Azure VM, SQL Server in Azure VM, Azure Files 등)
//        - 월 비용 = 단가 × Qty × usage. Qty=보호 인스턴스 수, usage=1 권장
//     2) 백업 저장소(Backup Storage / Data Stored): 백업 데이터 저장 용량(단위 1 GB/Month)
//        - 계층(Standard/Archive) × 중복성(LRS/ZRS/GRS/RA-GRS). usage 칸에 GB 입력
//        - Archive는 LRS/GRS만 제공(그 외 조합은 미터가 없어 매칭 실패가 정상)
//   하나의 Backup 행은 한 가지 청구 항목만 계산합니다. 인스턴스 요금과 저장소 요금은
//   각각 별도의 Backup 행으로 추가하세요. 절약/예약은 적용하지 않습니다.
//   ※ 카테고리 등록(SERVICE_CATEGORY_ORDER에 'Backup')은 js/ui-and-bootstrap.js에서 직접 함.
// ================================================================
REG._svcDefs['Backup'] = {
  apiServiceName: 'Backup',
  steps: [
    { key:'metric',      label:'청구 항목',  options:['보호 인스턴스','백업 저장소'] },
    { key:'workload',    label:'워크로드',   options:['Azure VM','SQL Server in Azure VM','SAP HANA on Azure VM','SAP ASE on Azure VM','Azure Files','Azure Files Vaulted','Azure Blob','ADLS Gen2 Vaulted','Cross region for ADLS and Blobs','PostgreSQL','Cosmos DB','Azure Kubernetes','On Premises Server'] },
    { key:'storageTier', label:'저장소 계층', options:['Standard','Archive'] },
    { key:'redundancy',  label:'중복성',     options:['LRS','ZRS','GRS','RA-GRS'] },
  ],
  instanceField: false,
  // 청구 항목(metric) 변경 시 옵션 패널을 다시 그려 워크로드/저장소 옵션 노출을 갱신
  instanceParentKey: 'metric',
  _applyStepVisibility: function(r){ if (REG['_backup_applyStepVisibility']) REG['_backup_applyStepVisibility'](r); },
};

// 청구 항목에 따라 옵션 표시/숨김: 보호 인스턴스→워크로드만, 백업 저장소→저장소 계층+중복성만
REG['_backup_applyStepVisibility'] = function(r) {
  var def = REG._svcDefs['Backup'];
  if (!def || !def.steps) return;
  var metric = (r.options && r.options.metric) || '보호 인스턴스';
  var isInstance = metric.indexOf('보호') >= 0;
  for (var i = 0; i < def.steps.length; i++) {
    var k = def.steps[i].key;
    if (k === 'workload') def.steps[i]._hidden = !isInstance;
    if (k === 'storageTier' || k === 'redundancy') def.steps[i]._hidden = isInstance;
  }
};

REG['_buildDetail_Backup'] = function(r) {
  var o = r.options || {};
  var metric = o.metric || '보호 인스턴스';
  REG['_backup_applyStepVisibility'](r);
  var isInstance = metric.indexOf('보호') >= 0;
  if (isInstance) {
    r.skuName = o.workload || '';
    r.detail = ['보호 인스턴스', o.workload || ''].filter(Boolean).join(' / ');
  } else {
    r.skuName = (`${o.storageTier||''} ${o.redundancy||''}`).trim();
    r.detail = ['백업 저장소', o.storageTier, o.redundancy].filter(Boolean).join(' / ');
  }
};

// 가격 조회 — 보호 인스턴스(skuName=워크로드, meter '...Protected Instance')
//             또는 백업 저장소(skuName=계층, meter '<계층> <중복성> Data Stored' 정확 일치)
REG['_resolve_Backup'] = async function(row, cur) {
  var o = row.options || {};
  var metric = o.metric || '보호 인스턴스';
  var isInstance = metric.indexOf('보호') >= 0;

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Backup', armRegionName:row.region, productName:'Backup', priceType:'Consumption' }, cur, 500, 5, {pageSize:200, expectedSizeKB:200});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Backup 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var chosen = null, label = '';
  if (isInstance) {
    var wl = String(o.workload || '').toLowerCase();
    label = '보호 인스턴스 / ' + (o.workload || '');
    var c = items.filter(function(it){
      if (String(it.type||'').toLowerCase() !== 'consumption') return false;
      if (String(it.skuName||'').toLowerCase() !== wl) return false;
      return String(it.meterName||'').toLowerCase().indexOf('protected instance') >= 0;
    }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
    chosen = c[0] || null;
  } else {
    var tier = String(o.storageTier || 'Standard').toLowerCase();
    var red  = String(o.redundancy || 'LRS').toLowerCase();
    label = '백업 저장소 / ' + (o.storageTier || 'Standard') + ' ' + (o.redundancy || 'LRS');
    var target = tier + ' ' + red + ' data stored'; // 정확 일치로 GRS↔RA-GRS 부분 충돌 방지
    var c2 = items.filter(function(it){
      if (String(it.type||'').toLowerCase() !== 'consumption') return false;
      if (String(it.skuName||'').toLowerCase() !== tier) return false;
      return String(it.meterName||'').toLowerCase() === target;
    }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
    chosen = c2[0] || null;
  }

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Backup ' + label + ': 매칭 실패 (' + items.length + '건 조회). 이 조합에 해당 미터가 없을 수 있습니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage)
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', 'Backup ' + label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + ' (월=단가×Qty×usage)');
  updatePriceCells(row); updateTotalsRow();
};
