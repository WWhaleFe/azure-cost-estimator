import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/app-gateway.js — Application Gateway
//
//   v65부터 전용 resolver(_resolve_Application_Gateway)로 SKU(제품군)×청구 항목별 미터를
//   매칭합니다(가격 하드코딩 없음, Azure Retail Prices API 실시간 조회).
//   serviceName='Application Gateway'. 제품군마다 과금 체계가 다르므로 SKU에 따라 청구 항목
//   (metric) 옵션을 바꾼다(instanceParentKey='sku' + _agw_applyStepVisibility, Backup/LB 패턴):
//     - v2 제품군(고정 비용 + 용량 단위):
//         Standard_v2 → productName 'Application Gateway Standard v2'(sku Standard): Fixed 0.27 / CU 0.008
//         WAF_v2      → 'Application Gateway WAF v2'(sku Standard):                  Fixed 0.486 / CU 0.0144
//         Basic_v2    → 'Application Gateway Basic v2'(sku Basic):                   Fixed 0.0225 / CU 0.008
//         청구 항목: 고정 비용 (시간당)='<sku> Fixed Cost'(1/Hour) / 용량 단위 (CU, 시간당)='<sku> Capacity Units'(1/Hour)
//     - v1 제품군(게이트웨이 + 데이터 처리):
//         Standard_Small/Medium/Large → 'Basic Application Gateway'(sku Small/Medium/Large)
//         WAF_Medium/Large            → 'WAF Application Gateway'(sku Medium/Large, 데이터 처리 미터 없음)
//         청구 항목: 게이트웨이 (시간당)='<크기> Gateway'(1 Hour) / 데이터 처리 (GB)='<크기> Data Processed'(1 GB)
//   매칭은 productName+skuName+meterName 정확 일치('- Discounted' 예약형 제품 자동 제외). 데이터 처리는
//   무료(0.0) 구간을 빼고 첫 유료 구간 사용. 'Application Gateway for Containers'(AGC)는 범위 외.
//   월=단가×Qty×usage(엔진 기본). 시간제는 usage 칸에 시간(예 730), 데이터 처리는 GB. 절약/예약 미적용.
// ================================================================

// SKU(노출명) → 제품 정의(productName/skuName) 및 청구 항목 미터 매핑(소문자 meterName)
var _AGW_CFG: Record<string, { product: string; sku: string; meters: Record<string,string> }> = {
  'Standard_v2':    { product:'Application Gateway Standard v2', sku:'Standard',
                      meters:{ '고정 비용 (시간당)':'standard fixed cost', '용량 단위 (CU, 시간당)':'standard capacity units' } },
  'WAF_v2':         { product:'Application Gateway WAF v2',      sku:'Standard',
                      meters:{ '고정 비용 (시간당)':'standard fixed cost', '용량 단위 (CU, 시간당)':'standard capacity units' } },
  'Basic_v2':       { product:'Application Gateway Basic v2',    sku:'Basic',
                      meters:{ '고정 비용 (시간당)':'basic fixed cost', '용량 단위 (CU, 시간당)':'basic capacity units' } },
  'Standard_Small': { product:'Basic Application Gateway',       sku:'Small',
                      meters:{ '게이트웨이 (시간당)':'small gateway', '데이터 처리 (GB)':'small data processed' } },
  'Standard_Medium':{ product:'Basic Application Gateway',       sku:'Medium',
                      meters:{ '게이트웨이 (시간당)':'medium gateway', '데이터 처리 (GB)':'medium data processed' } },
  'Standard_Large': { product:'Basic Application Gateway',       sku:'Large',
                      meters:{ '게이트웨이 (시간당)':'large gateway', '데이터 처리 (GB)':'large data processed' } },
  'WAF_Medium':     { product:'WAF Application Gateway',         sku:'Medium',
                      meters:{ '게이트웨이 (시간당)':'medium gateway' } },
  'WAF_Large':      { product:'WAF Application Gateway',         sku:'Large',
                      meters:{ '게이트웨이 (시간당)':'large gateway' } },
};

REG._svcDefs['Application Gateway'] = {
  apiServiceName: 'Application Gateway',
  steps: [
    { key:'sku',    label:'SKU',      options:['Standard_v2','WAF_v2','Basic_v2','Standard_Small','Standard_Medium','Standard_Large','WAF_Medium','WAF_Large'] },
    { key:'metric', label:'청구 항목', options:['고정 비용 (시간당)','용량 단위 (CU, 시간당)'] },
  ],
  instanceField: false,
  // SKU 변경 시 청구 항목 옵션을 다시 구성하기 위해 패널 재렌더 트리거
  instanceParentKey: 'sku',
  _applyStepVisibility: function(r: Row){ if (REG['_agw_applyStepVisibility']) REG['_agw_applyStepVisibility'](r); },
};

// SKU(제품군)에 따라 청구 항목 옵션을 교체하고, 현재 값이 새 목록에 없으면 첫 항목으로 기본 설정
REG['_agw_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Application Gateway'];
  if (!def || !def.steps) return;
  var sku = (r.options && r.options.sku) || '';
  var cfg = _AGW_CFG[sku];
  var opts = cfg ? Object.keys(cfg.meters) : [];
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'metric') continue;
    def.steps[i].options = opts;
    if (r.options && opts.indexOf(r.options.metric) < 0) r.options.metric = opts[0] || '';
  }
};

REG['_buildDetail_Application_Gateway'] = function(r: Row) {
  var o = r.options || {};
  REG['_agw_applyStepVisibility'](r);
  r.skuName = o.sku || '';
  r.detail = ['Application Gateway', o.sku, o.metric].filter(Boolean).join(' / ');
};

// 가격 조회 — productName+skuName+meterName 정확 일치(SKU×청구 항목 → 미터)
REG['_resolve_Application_Gateway'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var sku = o.sku || '';
  var cfg = _AGW_CFG[sku];
  if (!cfg) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Application Gateway: SKU를 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var metric = o.metric || Object.keys(cfg.meters)[0];
  var target = cfg.meters[metric];
  var label = sku + ' / ' + (metric || '(청구 항목 미선택)');
  if (!target) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Application Gateway ' + label + ': 이 SKU에 없는 청구 항목입니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Application Gateway', armRegionName:row.region, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:60});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Application Gateway 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var prod = cfg.product.toLowerCase();
  var skuL = cfg.sku.toLowerCase();
  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.productName||'').toLowerCase() !== prod) return false;   // 정확 일치 → '- Discounted' 예약형 제외
    if (String(it.skuName||'').toLowerCase() !== skuL) return false;
    return String(it.meterName||'').toLowerCase() === target;
  });
  // 데이터 처리는 무료(0.0) 구간을 빼고 첫 유료 구간 사용
  if (metric.indexOf('데이터 처리') >= 0) {
    var paid = cands.filter(function(it: ApiItem){ return Number(it.unitPrice||0) > 0; });
    if (paid.length) cands = paid;
  }
  cands.sort(function(a: ApiItem, b: ApiItem){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Application Gateway ' + label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', 'Application Gateway ' + label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure);
  updatePriceCells(row); updateTotalsRow();
};
