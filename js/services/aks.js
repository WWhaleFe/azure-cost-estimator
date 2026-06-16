// ================================================================
// services/aks.js — Azure Kubernetes Service (AKS) 클러스터 관리 요금
//   이 행은 "클러스터 관리(컨트롤 플레인) 요금"만 계산합니다.
//   노드(워커 VM)와 디스크는 기존 Virtual Machine / Disk 행으로 따로 추가하세요.
//   - Free 계층: 무료 (0)
//   - Standard / Premium 계층: Azure Retail Prices API의 'Azure Kubernetes Service'
//     항목에서 클러스터당 시간당 요금을 실시간 조회 (가격 하드코딩 없음)
//   - 절약 플랜 / 예약은 클러스터 관리 요금에 적용되지 않으므로 비웁니다.
// ================================================================

// 카테고리 정의 등록
window._svcDefs['Azure Kubernetes Service'] = {
  apiServiceName: 'Azure Kubernetes Service',
  steps: [
    { key:'aksTier', label:'계층', options:['Free (무료, SLA 없음)','Standard (SLA)','Premium (LTS)'] },
  ],
  instanceField: false,
};

// detail 빌더
window['_buildDetail_Azure_Kubernetes_Service'] = function(r) {
  var o = r.options || {};
  var tier = o.aksTier || 'Free (무료, SLA 없음)';
  r.skuName = tier.split(' ')[0]; // Free / Standard / Premium
  var parts = ['클러스터 관리'];
  parts.push(tier);
  parts.push('노드 VM/디스크는 별도 행으로 추가');
  r.detail = parts.join(', ');
};

// 응답에서 계층에 맞는 시간당 클러스터 관리 요금 1건 선택
//   Standard: 'Standard' 포함, 'Premium'/'LTS'/'Long Term' 제외
//   Premium : 'Premium' 또는 'LTS'/'Long Term' 포함
window['_aks_pickTierHourly'] = function(items, tier) {
  var wantPremium = (tier === 'Premium');
  var cands = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (String(it.type || '').toLowerCase() !== 'consumption') continue;
    var uom = String(it.unitOfMeasure || '').toLowerCase();
    if (uom.indexOf('hour') < 0) continue;
    var price = Number(it.unitPrice);
    if (!isFinite(price) || price <= 0) continue;
    var blob = (String(it.meterName || '') + ' ' + String(it.skuName || '') + ' ' + String(it.productName || '')).toLowerCase();
    // 클러스터 관리 요금만: 'cluster' 또는 'management' 또는 'uptime sla' 키워드
    var looksCluster = blob.indexOf('cluster') >= 0 || blob.indexOf('management') >= 0 || blob.indexOf('uptime') >= 0 || blob.indexOf('sla') >= 0;
    if (!looksCluster) continue;
    var isPremium = blob.indexOf('premium') >= 0 || blob.indexOf('lts') >= 0 || blob.indexOf('long term') >= 0 || blob.indexOf('long-term') >= 0;
    var isStandard = blob.indexOf('standard') >= 0;
    if (wantPremium) { if (!isPremium) continue; }
    else { if (isPremium) continue; if (!isStandard && blob.indexOf('uptime') < 0 && blob.indexOf('sla') < 0) continue; }
    cands.push({ price: price, item: it });
  }
  if (cands.length === 0) return null;
  // 같은 계층 내에서는 가장 낮은 단가 채택(중복/지역 변형 대비)
  cands.sort(function(a, b){ return a.price - b.price; });
  return cands[0].item;
};

// 가격 조회
window['_resolve_Azure_Kubernetes_Service'] = async function(row, cur) {
  var o = row.options || {};
  var tierLabel = o.aksTier || 'Free (무료, SLA 없음)';
  var tier = tierLabel.split(' ')[0]; // Free / Standard / Premium
  var qty = Number(row.qty) || 0;
  var usage = Number(row.usage) || 0;

  // Free 계층: 관리 요금 무료. 가짜 가격을 만들지 않고 0원 항목으로 표시.
  if (tier === 'Free') {
    row.paygItem = {
      unitPrice: 0, retailPrice: 0, unitOfMeasure: '1 Hour',
      meterName: 'AKS Free cluster management', skuName: 'Free',
      productName: 'Azure Kubernetes Service', serviceName: 'Azure Kubernetes Service',
      currencyCode: cur,
    };
    row.sp1Item = null; row.sp3Item = null; row.ri1Item = null; row.ri3Item = null;
    setStatus('ok', 'AKS Free: 클러스터 관리 무료 (노드 VM/디스크는 별도 행)');
    updatePriceCells(row); updateTotalsRow();
    return;
  }

  var items = [];
  try {
    items = await apiFetch({ serviceName:'Azure Kubernetes Service', armRegionName:row.region, priceType:'Consumption' }, cur, 500, 3);
  } catch (err) {
    row.paygItem = null; row.sp1Item = null; row.sp3Item = null; row.ri1Item = null; row.ri3Item = null;
    setStatus('error', 'AKS 조회 실패: ' + String(err.message).slice(0, 80));
    updatePriceCells(row); updateTotalsRow();
    return;
  }

  var chosen = window['_aks_pickTierHourly'](items, tier);
  // 1차 실패 시 리전 비종속으로 한 번 더 시도 (관리 요금은 보통 지역 공통)
  if (!chosen) {
    try {
      var all = await apiFetch({ serviceName:'Azure Kubernetes Service', priceType:'Consumption' }, cur, 1000, 5);
      chosen = window['_aks_pickTierHourly'](all, tier);
    } catch (e2) { /* 무시: 아래에서 미매칭 처리 */ }
  }

  if (!chosen) {
    row.paygItem = null; row.sp1Item = null; row.sp3Item = null; row.ri1Item = null; row.ri3Item = null;
    setStatus('error', 'AKS ' + tier + ': 클러스터 관리 요금 매칭 실패 (' + items.length + '건). 다른 리전/계층을 확인하세요.');
    updatePriceCells(row); updateTotalsRow();
    return;
  }

  // 클러스터당 시간당 요금 → 월(=시간당 × usage × qty)로 환산, 시간환산 단가로 표시
  var hourly = Number(chosen.unitPrice);
  var monthly = hourly * usage * qty;
  var hEq = (qty > 0 && usage > 0) ? (monthly / 730) : hourly;
  row.paygItem = Object.assign({}, chosen, {
    unitPrice: hEq, retailPrice: hEq, unitOfMeasure: '1 Hour (equivalent)',
    _billingMode: 'monthly', _monthlyTotal: monthly, _clusterHourly: hourly,
  });
  // 절약/예약은 클러스터 관리 요금에 적용되지 않음
  row.sp1Item = null; row.sp3Item = null; row.ri1Item = null; row.ri3Item = null;

  setStatus('ok', 'AKS ' + tier + ' 완료 · 클러스터 관리 ' + hourly.toFixed(4) + '/h (노드 VM/디스크는 별도 행)');
  updatePriceCells(row); updateTotalsRow();
};
