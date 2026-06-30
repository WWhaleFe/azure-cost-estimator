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
//   매칭: productName(계층+OS) + skuName=인스턴스(공백 무시 비교). 월=단가×Qty(인스턴스 수)×usage(시간, 예 730).
//   v76: 절약 플랜(1·3년)은 매칭된 Consumption 항목의 savingsPlan 배열에서 makeSpItem으로,
//        예약(1·3년)은 priceType='Reservation' 조회 결과를 normalizeReservationPrice로 시간당 환산해 함께 표시.
//   v77: 절약 플랜·예약이 빈칸으로 보이던 사례 보강 — skuName 공백차이 흡수(norm), 예약이 리전 비종속(Global)으로
//        들어오는 경우 리전 없이 1회 재조회, 그리고 무엇이 조회됐는지 콘솔(console)·상태창에 진단 노출.
//        절약 플랜·예약을 제공하는 계층(주로 Premium v3·Isolated v2)에서만 값이 나오고, 없으면 빈칸이다.
//   못 찾으면 "매칭 실패". 범위 외: Shared(koreacentral 미제공), Isolated 스탬프(ASIP)·Windows Container·
//     도메인/SSL 등 부가 미터. 예약은 컴퓨팅 기준이며 Windows OS 라이선스 추가분은 미반영(별도 PAYG 미터).
// ================================================================

// 계층 → productName 접두(공통 'Azure App Service ' + tier + ' Plan')
// 계층별 인스턴스(skuName 정확 표기) 옵션
// 계층별 인스턴스(skuName 정확 표기) 옵션 — 표기 공백차이는 _appsvc_norm이 흡수.
// koreacentral 라이브 API(serviceName='Azure App Service', Consumption) 기준 전체 계층 망라.
// 범위 외: Premium Windows Container(PC*), ASE 스탬프(ASIP/Stamp/Front End/IDH).
// 참고: Premium(v1)·Shared는 Windows만, Linux 미제공 → Linux 선택 시 매칭 실패가 정상.
//   Shared(D1)는 koreacentral 미제공(다른 리전엔 존재, 예 eastus skuName 'Shared') → 해당 리전선 매칭 실패가 정상.
var _APPSVC_SIZES = {
  'Free':        ['F1'],
  'Shared':      ['Shared'],
  'Basic':       ['B1','B2','B3'],
  'Standard':    ['S1','S2','S3'],
  'Premium':     ['P1','P2','P3','P4'],
  'Premium v2':  ['P1 v2','P2 v2','P3 v2'],
  'Premium v3':  ['P0v3','P1 v3','P2 v3','P3 v3','P1mv3','P2mv3','P3mv3','P4mv3','P5mv3'],
  'Premium v4':  ['P0v4','P1v4','P2v4','P3v4','P1mv4','P2mv4','P3mv4','P4mv4','P5mv4'],
  'Isolated':    ['I1','I2','I3'],
  'Isolated v2': ['I1 v2','I2 v2','I3 v2','I4 v2','I5 v2','I6 v2','I1mv2','I2mv2','I3mv2','I4mv2','I5mv2'],
  'Isolated v4': ['I1v4','I2v4','I3v4','I4v4','I5v4','I6v4','I1mv4','I2mv4','I3mv4','I4mv4','I5mv4'],
};

window._svcDefs['App Service'] = {
  apiServiceName: 'Azure App Service',
  steps: [
    { key:'tier', label:'계층',      options:['Free','Shared','Basic','Standard','Premium','Premium v2','Premium v3','Premium v4','Isolated','Isolated v2','Isolated v4'] },
    { key:'os',   label:'운영 체제', options:['Windows','Linux'] },
    { key:'size', label:'인스턴스',  options:['B1','B2','B3'] },
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

// 공백·대소문자 무시 정규화 ('P1 v3' → 'p1v3') — 인스턴스 표기 차이를 흡수
function _appsvc_norm(s){ return String(s||'').toLowerCase().replace(/\s+/g,''); }

// 가격 조회 — productName(계층+OS) + skuName=인스턴스, 절약 플랜/예약 포함
window['_resolve_App_Service'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'Basic';
  var os   = o.os || 'Windows';
  var size = o.size || (_APPSVC_SIZES[tier] || [])[0] || '';
  var product = 'Azure App Service ' + tier + ' Plan' + (os === 'Linux' ? ' - Linux' : '');
  var label = tier + ' / ' + os + ' / ' + size;
  var sizeNm = _appsvc_norm(size);

  if (!size) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'App Service ' + label + ': 인스턴스를 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cItems = [], rItems = [];
  try {
    var resp = await Promise.all([
      // 용량제(+절약 플랜은 각 항목의 savingsPlan 배열에 중첩되어 함께 옴) — productName으로 계층+OS 고정
      apiFetch({ serviceName:'Azure App Service', armRegionName:row.region, productName:product, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:60}),
      // 예약 — productName이 OS별로 갈리지 않을 수 있어 region+Reservation만으로 받고 아래에서 인스턴스/OS/기간으로 필터
      apiFetch({ serviceName:'Azure App Service', armRegionName:row.region, priceType:'Reservation' }, cur, 1000, 6, {pageSize:200, expectedSizeKB:150}).catch(function(){ return []; }),
    ]);
    cItems = resp[0] || []; rItems = resp[1] || [];
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'App Service 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cons = cItems.filter(function(it){ return String(it.type||'').toLowerCase()==='consumption'; });
  var cands = cons.filter(function(it){ return _appsvc_norm(it.skuName)===sizeNm; })
                  .sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'App Service ' + label + ': 매칭 실패 (' + cItems.length + '건 조회). 이 OS/계층에 해당 인스턴스가 없을 수 있습니다.');
    console.warn('[AppSvc] 용량제 매칭 실패', { product:product, size:size, region:row.region, consumptionCount:cons.length, sampleSku:cons.slice(0,10).map(function(x){return x.skuName;}) });
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 절약 플랜(1·3년): 같은 인스턴스(매칭/후보) 항목의 savingsPlan 배열에서만 추출(다른 인스턴스 가격 혼입 방지)
  var sp1=null, sp3=null;
  var exSp=function(item){
    if(!item||!Array.isArray(item.savingsPlan)) return;
    for(var i=0;i<item.savingsPlan.length;i++){
      var sp=item.savingsPlan[i], t=String(sp.term||'').toLowerCase();
      if(!sp1 && (t.indexOf('1 year')>=0||t==='1'||t.indexOf('1 ')===0)) sp1=makeSpItem(item,sp);
      else if(!sp3 && (t.indexOf('3 year')>=0||t==='3'||t.indexOf('3 ')===0)) sp3=makeSpItem(item,sp);
    }
  };
  exSp(chosen);
  if(!sp1||!sp3){ for(var ci=0; ci<cands.length; ci++){ if(cands[ci]===chosen) continue; exSp(cands[ci]); if(sp1&&sp3) break; } }
  var anySpInCands = cands.some(function(c){ return Array.isArray(c.savingsPlan) && c.savingsPlan.length>0; });

  // 예약(1·3년): skuName/armSkuName/meterName(공백무시)으로 인스턴스 매칭
  var wantLinux = (os === 'Linux');
  var riMatch = function(arr){
    return arr.filter(function(it){
      if (String(it.type||'').toLowerCase() !== 'reservation') return false;
      return _appsvc_norm(it.skuName)===sizeNm || _appsvc_norm(it.armSkuName)===sizeNm || _appsvc_norm(it.meterName).indexOf(sizeNm)>=0;
    });
  };
  var riBase = riMatch(rItems);
  // 예약이 리전 비종속(Global)으로 제공되어 리전 조회에 없을 때: 리전 없이 한 번 더 조회해 폴백
  if (riBase.length === 0) {
    try {
      var rGlobal = await apiFetch({ serviceName:'Azure App Service', priceType:'Reservation' }, cur, 1000, 6, {pageSize:200, expectedSizeKB:180}).catch(function(){ return []; });
      var riG = riMatch(rGlobal);
      if (riG.length) { rItems = rGlobal; riBase = riG; }
    } catch (e) { /* 폴백 실패는 무시 */ }
  }
  var osPref = function(arr){
    var m = arr.filter(function(it){ return /linux/i.test(String(it.productName||'')) === wantLinux; });
    return m.length ? m : arr; // OS 구분이 없으면 전체 사용
  };
  var pickTerm = function(rx){
    var arr = osPref(riBase.filter(function(it){ return rx.test(String(it.reservationTerm||'')); }));
    arr.sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
    return arr[0] || null;
  };
  var ri1Raw = pickTerm(/1\s*year/i);
  var ri3Raw = pickTerm(/3\s*year/i);

  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item = sp1;
  row.sp3Item = sp3;
  row.ri1Item = ri1Raw ? normalizeReservationPrice(ri1Raw, 1) : null;
  row.ri3Item = ri3Raw ? normalizeReservationPrice(ri3Raw, 3) : null;

  // 진단: 무엇이 조회/매칭됐는지 콘솔에 남김(절약 플랜·예약이 비는 원인 파악용)
  console.log('[AppSvc] 진단', {
    product: product, size: size, region: row.region,
    consumptionCount: cons.length, chosenSku: chosen.skuName,
    chosenHasSavingsPlan: Array.isArray(chosen.savingsPlan),
    savingsPlanTerms: Array.isArray(chosen.savingsPlan) ? chosen.savingsPlan.map(function(s){return s.term;}) : null,
    anySavingsPlanInCands: anySpInCands,
    reservationFetched: rItems.length, reservationMatched: riBase.length,
    reservationSample: rItems.slice(0,10).map(function(x){ return { sku:x.skuName, arm:x.armSkuName, term:x.reservationTerm, prod:x.productName }; }),
    result: { sp1:!!sp1, sp3:!!sp3, ri1:!!ri1Raw, ri3:!!ri3Raw }
  });

  var tags=['PAYG'];
  if(sp1)tags.push('SP1Y'); if(sp3)tags.push('SP3Y');
  if(row.ri1Item)tags.push('RI1Y'); if(row.ri3Item)tags.push('RI3Y');
  var miss=[];
  if(!sp1&&!sp3) miss.push('절약 플랜');
  if(!row.ri1Item&&!row.ri3Item) miss.push('예약');
  var hint = miss.length
    ? ' · ' + miss.join('·') + ' 미발견(SP후보 ' + (anySpInCands?'있음':'없음') + ' · 예약 조회 ' + rItems.length + '건/인스턴스 매칭 ' + riBase.length + '건)'
    : '';
  setStatus('ok', 'App Service ' + label + ' 완료 [' + tags.join(', ') + '] · PAYG ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + hint);
  updatePriceCells(row); updateTotalsRow();
};
