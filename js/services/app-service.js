// ================================================================
// services/app-service.js — App Service (App Service Plan)
//
//   v69부터 전용 resolver(_resolve_App_Service)로 계층×OS×인스턴스별 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Azure App Service'.
//   API 구조: productName='Azure App Service <계층> Plan'(Windows) 또는 '... Plan - Linux'(Linux),
//     skuName=인스턴스(예 'B1','S1','P1 v3','I1 v2' — 공백 포함 표기 주의), meterName='<인스턴스> App',
//     단위 1 Hour. 계층마다 제공 인스턴스가 달라 계층에 따라 인스턴스 옵션을 동적 전환한다
//     (instanceParentKey='tier' + _appsvc_applyStepVisibility):
//       Free=F1 / Basic=B1~B3 / Standard=S1~S3 / Premium v3=P0v3·P1 v3~P3 v3·P1mv3~P5mv3 /
//       Isolated v2=I1 v2~I6 v2·I1mv2~I5mv2
//   매칭: productName(계층+OS) + skuName=인스턴스 **정확 일치**. 월=단가×Qty(인스턴스 수)×usage(시간, 예 730).
//   절약/예약 미적용. 못 찾으면 "매칭 실패". 범위 외: Shared(koreacentral 미제공), Isolated 스탬프(ASIP)·
//     Windows Container·도메인/SSL 등 부가 미터, 예약 인스턴스.
// ================================================================

// 계층 → productName 접두(공통 'Azure App Service ' + tier + ' Plan')
// 계층별 인스턴스(skuName 정확 표기) 옵션
var _APPSVC_SIZES = {
  'Free':        ['F1'],
  'Basic':       ['B1','B2','B3'],
  'Standard':    ['S1','S2','S3'],
  'Premium v3':  ['P0v3','P1 v3','P2 v3','P3 v3','P1mv3','P2mv3','P3mv3','P4mv3','P5mv3'],
  'Isolated v2': ['I1 v2','I2 v2','I3 v2','I4 v2','I5 v2','I6 v2','I1mv2','I2mv2','I3mv2','I4mv2','I5mv2'],
};

window._svcDefs['App Service'] = {
  apiServiceName: 'Azure App Service',
  steps: [
    { key:'tier', label:'계층',     options:['Free','Basic','Standard','Premium v3','Isolated v2'] },
    { key:'os',   label:'OS',       options:['Windows','Linux'] },
    { key:'size', label:'인스턴스', options:['B1','B2','B3'] },
  ],
  instanceField: false,
  // 계층 변경 시 인스턴스 옵션을 다시 구성
  instanceParentKey: 'tier',
  _applyStepVisibility: function(r){ if (window['_appsvc_applyStepVisibility']) window['_appsvc_applyStepVisibility'](r); },
};

window['_appsvc_applyStepVisibility'] = function(r) {
  var def = window._svcDefs['App Service'];
  if (!def || !def.steps) return;
  var tier = (r.options && r.options.tier) || 'Basic';
  var opts = _APPSVC_SIZES[tier] || [];
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'size') continue;
    def.steps[i].options = opts;
    if (r.options && opts.indexOf(r.options.size) < 0) r.options.size = opts[0] || '';
  }
};

window['_buildDetail_App_Service'] = function(r) {
  var o = r.options || {};
  window['_appsvc_applyStepVisibility'](r);
  r.skuName = o.size || '';
  r.detail = [o.tier, o.os, o.size].filter(Boolean).join(' / ');
};

// 가격 조회 — productName(계층+OS) + skuName=인스턴스 정확 일치
window['_resolve_App_Service'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'Basic';
  var os   = o.os || 'Windows';
  var size = o.size || (_APPSVC_SIZES[tier] || [])[0] || '';
  var product = 'Azure App Service ' + tier + ' Plan' + (os === 'Linux' ? ' - Linux' : '');
  var label = tier + ' / ' + os + ' / ' + size;

  if (!size) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'App Service ' + label + ': 인스턴스를 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Azure App Service', armRegionName:row.region, productName:product, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:60});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'App Service 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    return String(it.skuName||'').toLowerCase() === size.toLowerCase();
  }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'App Service ' + label + ': 매칭 실패 (' + items.length + '건 조회). 이 OS/계층에 해당 인스턴스가 없을 수 있습니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', 'App Service ' + label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure);
  updatePriceCells(row); updateTotalsRow();
};
