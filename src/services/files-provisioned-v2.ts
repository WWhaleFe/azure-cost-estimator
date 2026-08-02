import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/files-provisioned-v2.js — Azure Files (프로비저닝됨 v2)
//
//   계산기 'Storage Accounts > 유형 = Azure 파일'의 프로비저닝 v2 모델에 대응(가격 하드코딩 없음, 라이브 API).
//   serviceName='Storage', productName='Azure Files Provisioned v2'.
//   미디어(HDD/SSD) × 중복성 → skuName='<미디어> <중복성>'(예 'SSD LRS', 'HDD GRS').
//   프로비저닝 3요소를 입력해 합산: 스토리지(GiB) + IOPS + 처리량(MiB/s).
//     meter '<sku> Provisioned Storage'(1 GiB/Hour), '... Provisioned IOPS'(1/Hour),
//           '... Provisioned Throughput MiBPS'(1/Hour). 월=(GiB×단가 + IOPS×단가 + MiBPS×단가)×usage(시간).
//   SSD는 일부 IOPS/처리량이 무료 포함(Free 미터)이나 본 추정은 프로비저닝 전량 과금(약간 상향, 보수적).
//   범위 외: 스냅샷·소프트 삭제 사용량. 절약/예약 미적용. 못 찾으면 "매칭 실패".
// ================================================================
var _FPV2_HDD_RED = ['LRS','ZRS','GRS','GZRS'];
var _FPV2_SSD_RED = ['LRS','ZRS'];

REG._svcDefs['Azure Files Provisioned v2'] = {
  apiServiceName: 'Storage',
  steps: [
    { key:'media',       label:'미디어',          options:['SSD','HDD'] },
    { key:'redundancy',  label:'중복성',          options:['LRS','ZRS'] },
    { key:'storageGiB',  label:'프로비저닝 스토리지 (GiB)', type:'number', min:32, step:1, default:1024 },
    { key:'iops',        label:'프로비저닝 IOPS',  type:'number', min:0, step:100, default:3000 },
    { key:'throughput',  label:'프로비저닝 처리량 (MiB/s)', type:'number', min:0, step:1, default:125 },
  ],
  instanceField: false,
  instanceParentKey: 'media',
  rebuildKeys: ['media'],
  _applyStepVisibility: function(r: Row){ if (REG['_fpv2_applyStepVisibility']) REG['_fpv2_applyStepVisibility'](r); },
};

REG['_fpv2_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Azure Files Provisioned v2'];
  if (!def || !def.steps) return;
  var o = r.options || {};
  var redOpts = (o.media === 'HDD') ? _FPV2_HDD_RED : _FPV2_SSD_RED;
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'redundancy') continue;
    def.steps[i].options = redOpts;
    if (redOpts.indexOf(o.redundancy) < 0) r.options.redundancy = redOpts[0];
  }
};

REG['_buildDetail_Azure_Files_Provisioned_v2'] = function(r: Row) {
  var o = r.options || {};
  REG['_fpv2_applyStepVisibility'](r);
  r.skuName = ((o.media||'') + ' ' + (o.redundancy||'')).trim();
  var parts = ['Files v2', o.media, o.redundancy];
  if (o.storageGiB) parts.push(o.storageGiB + 'GiB');
  if (o.iops) parts.push('IOPS:' + o.iops);
  if (o.throughput) parts.push(o.throughput + 'MiB/s');
  r.detail = parts.filter(Boolean).join(', ');
};

REG['_resolve_Azure_Files_Provisioned_v2'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var media = o.media || 'SSD';
  var red = o.redundancy || 'LRS';
  var skuT = (media + ' ' + red).toLowerCase();
  var storageGiB = Number(o.storageGiB || 0);
  var iops = Number(o.iops || 0);
  var mbps = Number(o.throughput || 0);
  var label = media + ' ' + red + ' / ' + storageGiB + 'GiB';

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Storage', armRegionName:row.region, productName:'Azure Files Provisioned v2', priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:60});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Files v2 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var isCons = function(it: ApiItem){ return String(it.type||'').toLowerCase() === 'consumption'; };
  var pick = function(kw: string){
    return items.filter(function(it: ApiItem){
      if (!isCons(it) || String(it.skuName||'').toLowerCase() !== skuT) return false;
      var m = String(it.meterName||'').toLowerCase();
      if (m.indexOf('free') >= 0 || m.indexOf('snapshot') >= 0 || m.indexOf('soft') >= 0) return false;
      return m.indexOf(kw) >= 0;
    }).sort(function(a: ApiItem, b: ApiItem){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); })[0] || null;
  };
  var stoIt = pick('provisioned storage');
  var iopsIt = pick('provisioned iops');
  var mbpsIt = pick('provisioned throughput');

  if (!stoIt) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Files v2 ' + label + ': 매칭 실패 (' + items.length + '건 조회). 이 미디어/중복성 조합이 없을 수 있습니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var usH = Number(row.usage) || 730;
  var stoRate = Number(stoIt.unitPrice);                       // GiB/Hour
  var iopsRate = iopsIt ? Number(iopsIt.unitPrice) : 0;        // 1/Hour
  var mbpsRate = mbpsIt ? Number(mbpsIt.unitPrice) : 0;        // 1/Hour
  var monthly = (storageGiB * stoRate + iops * iopsRate + mbps * mbpsRate) * usH;

  row.paygItem = Object.assign({}, stoIt, {
    currencyCode:cur, unitPrice:monthly/usH, retailPrice:monthly/usH,
    unitOfMeasure:'1 Hour (equivalent)', _billingMode:'monthly', _monthlyTotal:monthly,
    skuName: media + ' ' + red,
  });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', 'Files v2 ' + label + ' 완료 · ' + monthly.toFixed(2) + '/월 (스토리지' + (storageGiB*stoRate*usH).toFixed(0) + ' + IOPS' + (iops*iopsRate*usH).toFixed(0) + ' + 처리량' + (mbps*mbpsRate*usH).toFixed(0) + ')');
  updatePriceCells(row); updateTotalsRow();
};
