import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/azure-ml.ts — Azure Machine Learning (워크스페이스 추가 요금)
//
//   전용 resolver(_resolve_Azure_Machine_Learning). 가격 하드코딩 없음(Retail Prices API 실시간).
//   serviceName='Azure Machine Learning', productName='Machine Learning service'.
//
//   ★ 중요 — Azure ML 의 컴퓨팅 요금은 이 카테고리가 아니라 **Virtual Machine 행**입니다.
//     워크스페이스 자체는 무료이고, 관리형 컴퓨팅(Compute Instance/Cluster·관리형 엔드포인트)은
//     같은 VM SKU 의 시간당 요금으로 청구됩니다. 그래서 견적은 이렇게 나눠 적습니다.
//       1) 컴퓨팅  → 'Virtual Machine' 행 (예 D16s_v5 × 2 × 730h)
//       2) 추가요금 → 이 'Azure Machine Learning' 행 (아래 vCPU/GPU 추가 요금 미터)
//     추가 요금(Surcharge)은 리전·SKU 에 따라 0원인 경우가 많습니다(0원 조회는 오류가 아닙니다).
//
//   청구 항목(meterName, 단위 1 Hour)
//     vCPU 추가 요금        Standard vCPU Surcharge            추론(관리형 엔드포인트) vCPU 시간당
//     GPU 추가 요금         Standard GPU Surcharge             추론 GPU 시간당
//     학습 vCPU 추가 요금   Standard Training vCPU Surcharge   학습(Training) vCPU 시간당
//     학습 GPU 추가 요금    Standard Training GPU Surcharge    학습 GPU 시간당
//     PB vCPU 추가 요금     PB vCPU Surcharge                  파이프라인 배치(PB) vCPU 시간당
//
//   월=단가×Qty×usage(엔진 기본). Qty=vCPU/GPU 수, usage=월 사용시간(예 730).
//   절약/예약 미적용. 못 찾으면 "매칭 실패"(그 리전에 해당 미터가 없는 경우).
//   범위 외: Managed Model Hosting(모델별 토큰 과금 — 'Azure OpenAI' 카테고리와 별개로 미지원),
//           Enterprise Inferencing 제품군(리전마다 productName 이 달라 제외, 대부분 0원).
//
// [v128] '워크스페이스' 청구 항목 신설 — 0원임을 견적서에 남기기 위한 항목
//   Azure ML Workspace 자체를 과금하는 미터는 Retail Prices API 에 존재하지 않는다.
//   워크스페이스는 논리적 컨테이너라 생성·보유만으로는 요금이 붙지 않고, 실제 비용은
//   전부 워크스페이스가 **딸려 만드는 다른 리소스**로 청구되기 때문이다.
//     · 컴퓨팅(Compute Instance/Cluster·관리형 엔드포인트) → Virtual Machine 행
//     · 기본 저장소 계정(스냅샷·데이터셋·모델 아티팩트)   → Blob Storage / Storage Account 행
//     · 컨테이너 레지스트리(환경 이미지)                  → Azure Container Registry 행
//     · Application Insights / Log Analytics(작업 로그)   → Azure Monitor / Log Analytics 행
//     · Key Vault(연결 문자열·비밀)                       → Azure Key Vault 행
//   그래서 예전에는 이 항목을 견적서에 아예 적을 수 없어 "반영 불가"로 빠졌다. 이제
//   0원 항목으로 넣어 원본 문서의 항목 수와 견적서 행 수를 맞출 수 있게 한다.
//   API 조회 결과가 아니라 **정의상 0원**이므로 아래처럼 표시를 붙여 구분한다.
// ================================================================

// 워크스페이스 항목(노출명) — API 미터가 아니라 '무료'임을 명시하는 자리
var _AML_WORKSPACE = '워크스페이스 (무료 · 과금 미터 없음)';

// 청구 항목(노출명) → meterName(소문자)
var _AML_METERS: Record<string, string> = {
  'vCPU 추가 요금 (시간)':       'standard vcpu surcharge',
  'GPU 추가 요금 (시간)':        'standard gpu surcharge',
  '학습 vCPU 추가 요금 (시간)':  'standard training vcpu surcharge',
  '학습 GPU 추가 요금 (시간)':   'standard training gpu surcharge',
  'PB vCPU 추가 요금 (시간)':    'pb vcpu surcharge',
};

REG._svcDefs['Azure Machine Learning'] = {
  apiServiceName: 'Azure Machine Learning',
  steps: [
    { key:'metric', label:'청구 항목', options:[_AML_WORKSPACE].concat(Object.keys(_AML_METERS)), tooltip:'컴퓨팅(Compute Instance/Cluster) 자체 요금은 Virtual Machine 행으로 따로 적으세요. 여기는 그 위에 붙는 추가 요금입니다. 워크스페이스 자체는 무료라 0원 항목으로만 남습니다.' },
  ],
  instanceField: false,
};

REG['_buildDetail_Azure_Machine_Learning'] = function(r: Row) {
  var o = r.options || {};
  r.skuName = (o.metric === _AML_WORKSPACE) ? 'Workspace' : 'Machine Learning';
  r.detail = ['Azure ML', o.metric].filter(Boolean).join(' / ');
};

// 가격 조회 — productName='Machine Learning service' 안에서 meterName 정확 일치
REG['_resolve_Azure_Machine_Learning'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var metric = o.metric || _AML_WORKSPACE;
  var target = _AML_METERS[metric];
  var label = 'Azure ML / ' + metric;

  // 워크스페이스 — API 미터가 없다(정의상 무료). 조회하지 않고 0원 항목으로 남긴다.
  if (metric === _AML_WORKSPACE) {
    row.paygItem = {
      currencyCode: cur, unitPrice: 0, retailPrice: 0,
      armRegionName: row.region, productName: 'Machine Learning service',
      skuName: 'Workspace', meterName: '(과금 미터 없음)',
      unitOfMeasure: '1/Month', type: 'Consumption',
      _freeByDefinition: true,
    };
    row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('ok', label + ' · 0원 — Retail Prices API 에 워크스페이스 과금 미터가 없습니다. '
      + '실제 비용은 컴퓨팅(Virtual Machine), 저장소(Blob Storage), 레지스트리(Azure Container Registry), '
      + '로그(Log Analytics·Azure Monitor), Key Vault 행으로 각각 잡으세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  if (!target) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 청구 항목을 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Azure Machine Learning', armRegionName:row.region, productName:'Machine Learning service', priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:20});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure ML 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
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
  var zero = Number(chosen.unitPrice||0) === 0 ? ' · 이 리전에서는 추가 요금 0원(컴퓨팅은 VM 행으로 계산)' : '';
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + ' (Qty=vCPU·GPU 수, usage=시간)' + zero);
  updatePriceCells(row); updateTotalsRow();
};
