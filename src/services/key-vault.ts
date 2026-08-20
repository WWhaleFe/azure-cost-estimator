import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, pickTieredMeter, tierNote } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/key-vault.ts — Azure Key Vault (Standard / Premium / Managed HSM)
//
//   전용 resolver(_resolve_Azure_Key_Vault). 가격 하드코딩 없음(Azure Retail Prices API 실시간).
//   serviceName='Key Vault'. 계층에 따라 productName·청구 항목이 갈린다
//   (instanceParentKey='tier' + _kv_applyStepVisibility).
//     - Standard / Premium → productName='Key Vault', skuName=계층
//         작업 (10K)              meter 'Operations'                              단위 10K
//         고급 키 작업 (10K)      meter 'Advanced Key Operations'                 단위 10K
//         인증서 갱신 요청 (건)   meter 'Certificate Renewal Request'             단위 1
//         비밀 갱신 (건)          meter 'Secret Renewal'                          단위 1
//         자동 키 순환 (회)       meter 'Automated Key Rotation'                  단위 1 Rotation
//       Premium 전용(HSM 보호 키, 키당 월정액)
//         HSM 보호 RSA 2048비트 키  meter 'Premium HSM-protected RSA 2048-bit key'
//         HSM 보호 고급 키          meter 'Premium HSM-protected Advanced Key'
//     - Managed HSM → productName='Key Vault HSM Pool', skuName='Standard B1'
//         Standard B1 인스턴스 (시간)  meter 'Standard B1 Instance'  단위 1 Hour → usage=730
//
//   월=단가×Qty×usage(엔진 기본).
//     · 작업 계열은 usage 칸에 **만 건 수**(10K 단위. 예 100만 건 → 100)
//     · 키/갱신 계열은 usage=1, Qty=키·건수
//     · Managed HSM 은 usage=월 사용시간(730)
//   절약/예약 미적용. 못 찾으면 "매칭 실패".
//   범위 외: Managed HSM 의 B1 외 SKU, Key Vault 전용 HSM(Dedicated HSM 은 별도 serviceName).
// ================================================================

// 계층 → { productName, skuName(빈 값이면 무시), 청구 항목(노출명) → meterName(소문자) }
var _KV_TIERS: Record<string, { prod: string; sku: string; meters: Record<string, string> }> = {
  'Standard': {
    prod:'Key Vault', sku:'Standard',
    meters:{
      '작업 (10K)':            'operations',
      '고급 키 작업 (10K)':    'advanced key operations',
      '인증서 갱신 요청 (건)': 'certificate renewal request',
      '비밀 갱신 (건)':        'secret renewal',
      '자동 키 순환 (회)':     'automated key rotation',
    },
  },
  'Premium': {
    prod:'Key Vault', sku:'Premium',
    meters:{
      '작업 (10K)':                     'operations',
      '고급 키 작업 (10K)':             'advanced key operations',
      'HSM 보호 RSA 2048비트 키 (키/월)': 'premium hsm-protected rsa 2048-bit key',
      'HSM 보호 고급 키 (키/월)':        'premium hsm-protected advanced key',
      '인증서 갱신 요청 (건)':          'certificate renewal request',
      '비밀 갱신 (건)':                 'secret renewal',
      '자동 키 순환 (회)':              'automated key rotation',
    },
  },
  'Managed HSM': {
    prod:'Key Vault HSM Pool', sku:'Standard B1',
    meters:{ 'Standard B1 인스턴스 (시간)': 'standard b1 instance' },
  },
};

REG._svcDefs['Azure Key Vault'] = {
  apiServiceName: 'Key Vault',
  steps: [
    { key:'tier',   label:'계층',      options:Object.keys(_KV_TIERS) },
    { key:'metric', label:'청구 항목', options:Object.keys(_KV_TIERS['Standard'].meters) },
  ],
  instanceField: false,
  instanceParentKey: 'tier',
  _applyStepVisibility: function(r: Row){ if (REG['_kv_applyStepVisibility']) REG['_kv_applyStepVisibility'](r); },
};

// 계층 변경 시 청구 항목 옵션 교체(현재 값이 새 목록에 없으면 첫 항목으로)
REG['_kv_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Azure Key Vault'];
  if (!def || !def.steps) return;
  var tier = (r.options && r.options.tier) || 'Standard';
  var list = Object.keys((_KV_TIERS[tier] || _KV_TIERS['Standard']).meters);
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'metric') continue;
    def.steps[i].options = list.slice();
    if (r.options && list.indexOf(r.options.metric) < 0) r.options.metric = list[0] || '';
  }
};

REG['_buildDetail_Azure_Key_Vault'] = function(r: Row) {
  var o = r.options || {};
  REG['_kv_applyStepVisibility'](r);
  r.skuName = o.tier || '';
  r.detail = ['Key Vault', o.tier, o.metric].filter(Boolean).join(' / ');
};

// 가격 조회 — productName + skuName + meterName 정확 일치
REG['_resolve_Azure_Key_Vault'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var tier = o.tier || 'Standard';
  var conf = _KV_TIERS[tier];
  var label = 'Key Vault / ' + tier + ' / ' + (o.metric || '');

  if (!conf) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 계층을 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var target = conf.meters[o.metric || ''] || conf.meters[Object.keys(conf.meters)[0]];

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Key Vault', armRegionName:row.region, productName:conf.prod, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:20});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Key Vault 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'').toLowerCase() !== conf.sku.toLowerCase()) return false;
    return String(it.meterName||'').toLowerCase() === target;
  });
  var chosen = pickTieredMeter(cands);

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  var note = (tier === 'Managed HSM') ? ' (usage=월 사용시간, 예 730)'
           : (String(chosen.unitOfMeasure||'').indexOf('10K') >= 0 ? ' (usage=만 건 수)' : ' (usage=1, Qty=건수)');
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + tierNote(chosen) + note);
  updatePriceCells(row); updateTotalsRow();
};
