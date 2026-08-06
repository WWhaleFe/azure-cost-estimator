import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, pickTieredMeter, tierNote } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/front-door.ts — Azure Front Door (글로벌 CDN/L7 로드밸런서)
//
//   전용 resolver(_resolve_Azure_Front_Door). 가격 하드코딩 없음(Azure Retail Prices API 실시간).
//   Front Door 는 글로벌 서비스 → row.region 무시. 가격은 **요금 존(Zone 1~8)** 으로 구분된다.
//   API 구조: serviceName='Azure Front Door Service', skuName=계층(Standard/Premium),
//     meterName=청구 항목, armRegionName='Zone N'(존별) 또는 ''(존 무관: 도메인·규칙·WAF 등).
//     ex) Zone 1 = 북미·유럽, Zone 2 = 아시아·태평양(한국·일본 포함), Zone 5 = 인도 …
//   매칭: skuName=계층 & meterName=항목 & (armRegionName=선택존 or 빈값), 구간은 pickTieredMeter.
//   구간요금 미터는 **0원이 아닌 최저 구간**을 사용(엔진 기본: 월=단가×Qty×usage).
//   (Standard Included Routing Rules 는 5개 포함=0원 구간이라, 첫 구간을 쓰면 0원이 된다 — v115 수정)
//   계층 변경 시 청구 항목 옵션 재구성(instanceParentKey='tier'). 절약/예약 미적용.
// ================================================================

// 계층(skuName) → 청구 항목(meterName) 목록
var _FD_ITEMS: Record<string,string[]> = {
  'Standard': ['Standard Base Fees','Standard Data Transfer Out','Standard Data Transfer In','Standard Requests',
               'Standard Custom Domain','Standard Rule','Standard Policy','Standard Default Ruleset','Standard Default Request',
               'Standard Bot Protection Ruleset','Standard Bot Protection Request',
               'Standard Included Routing Rules','Standard Overage Routing Rules',
               'Standard Edge Actions Base Fee','Standard Invocations','Standard Overage Execution Time'],
  'Premium':  ['Premium Base Fees','Premium Data Transfer Out','Premium Data Transfer In','Premium Requests',
               'Premium Captcha Sessions',
               'Premium Edge Actions Base Fee','Premium Invocations','Premium Overage Execution Time'],
};
var _FD_ZONES = ['Zone 1','Zone 2','Zone 3','Zone 4','Zone 5','Zone 6','Zone 7','Zone 8'];

REG._svcDefs['Azure Front Door'] = {
  apiServiceName: 'Azure Front Door Service',
  steps: [
    { key:'tier', label:'계층',      options:Object.keys(_FD_ITEMS) },
    { key:'zone', label:'요금 존',   options:_FD_ZONES.slice(), tooltip:'Zone 1=북미·유럽, Zone 2=아시아·태평양(한국 포함), Zone 5=인도 등. 도메인·규칙 등 존 무관 항목은 존 선택과 무관.' },
    { key:'item', label:'청구 항목', options:_FD_ITEMS['Standard'].slice() },
  ],
  instanceField: false,
  instanceParentKey: 'tier',
  _applyStepVisibility: function(r: Row){ if (REG['_fd_applyStepVisibility']) REG['_fd_applyStepVisibility'](r); },
};

REG['_fd_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Azure Front Door'];
  if (!def || !def.steps) return;
  var tier = (r.options && r.options.tier) || 'Standard';
  var items = _FD_ITEMS[tier] || [];
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'item') continue;
    def.steps[i].options = items.slice();
    if (r.options && items.indexOf(r.options.item) < 0) r.options.item = items[0] || '';
  }
};

REG['_buildDetail_Azure_Front_Door'] = function(r: Row) {
  var o = r.options || {};
  REG['_fd_applyStepVisibility'](r);
  r.skuName = o.tier || '';
  r.detail = [o.tier, o.zone, o.item].filter(Boolean).join(' - ');
};

REG['_resolve_Azure_Front_Door'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var tier = o.tier || 'Standard';
  var zone = o.zone || 'Zone 1';
  var item = o.item || (_FD_ITEMS[tier] || [])[0] || '';
  var label = 'Front Door ' + tier + ' / ' + zone + ' / ' + item;

  var items: ApiItem[] = [];
  try {
    // 글로벌 서비스: armRegionName 필터 없이 전체 조회 후 존별로 매칭(row.region 무시).
    items = await apiFetch({ serviceName:'Azure Front Door Service', priceType:'Consumption' }, cur, 1000, 3, {pageSize:1000, expectedSizeKB:120});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Front Door 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    if (String(it.skuName||'') !== tier) return false;
    if (String(it.meterName||'') !== item) return false;
    // 존별 미터는 선택 존, 존 무관 미터(도메인·규칙·WAF 등)는 빈 armRegionName 으로 매칭
    var rg = String(it.armRegionName||'');
    if (rg !== zone && rg !== '') return false;
    return true;
  });
  var chosen = pickTieredMeter(cands);

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + tierNote(chosen));
  updatePriceCells(row); updateTotalsRow();
};
