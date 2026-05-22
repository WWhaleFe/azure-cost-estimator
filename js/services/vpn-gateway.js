// ================================================================
// services/vpn-gateway.js — VPN Gateway
//
// 이 파일은 다음을 등록합니다.
//   1) window._svcDefs['VPN Gateway']     — 카테고리 정의(옵션 목록)
//   2) window['_buildDetail_VPN_Gateway'] — 옵션 → skuName/detail 변환
//   3) window['_resolve_VPN_Gateway']     — 시간당 가격 5종 조회
//
// === VPN Gateway 가격 산정 개요 ===
//
// VPN Gateway 청구는 다음 4 가지 라인 아이템의 합입니다.
//
//   (a) 게이트웨이 시간:   gateway_hourly × gatewayHours (월)
//   (b) S2S 추가 터널:     s2s_per_tunnel_hourly × extraS2sTunnels × gatewayHours
//   (c) P2S 추가 연결:     p2s_per_connection_hourly × extraP2sConnections × gatewayHours
//   (d) 데이터 전송:       vnet_gb_unit × vnetGB (월)
//
// 합계를 사용자에게 시간당 환산 단가(monthly / 730)로 표시합니다.
//
// === VNET 간 데이터 전송 매칭의 비즈니스 규칙 ===
//
// Azure 공식 문서(learn.microsoft.com/ko-kr/azure/vpn-gateway/vpn-gateway-vpn-faq):
//   "VPN 게이트웨이 연결을 사용하는 경우 동일한 지역 내의 VNet 간 트래픽은
//    양방향 모두에 대해 무료입니다. 지역 전체 VNet 간 송신 트래픽은
//    원본 지역을 기반으로 아웃바운드 VNet 간 데이터 전송 요금으로 청구됩니다."
//
// 따라서 본 도구의 매칭 우선순위는 다음과 같습니다.
//   1) VNET 간 outbound 데이터 전송 (Inter-Region / Inter-VNet 등) 매칭 시도
//   2) 매칭 실패 시 VNET 간이면 "동일 지역 무료(₩0)" 폴백
//      VPN 이면 "동일 지역 무료(₩0)" 폴백
//
// 매칭 대상 데이터 소스 (우선순위):
//   1차) serviceName='VPN Gateway' 의 GB 단위 항목
//   2차) serviceName='Virtual Network' 의 GB 단위 항목 (VNet Peering 등)
//   3차) serviceName='Bandwidth' 의 GB 단위 항목 (Inter-Region 등)
// ================================================================

// ----------------------------------------------------------------
// 1) 카테고리 정의
// ----------------------------------------------------------------
window._svcDefs['VPN Gateway'] = {
  apiServiceName: 'VPN Gateway',
  steps: [
    {
      key:     'sku',
      label:   'SKU',
      options: ['Basic', 'VpnGw1', 'VpnGw2', 'VpnGw3', 'VpnGw4', 'VpnGw5',
                'VpnGw1AZ', 'VpnGw2AZ', 'VpnGw3AZ', 'VpnGw4AZ', 'VpnGw5AZ'],
    },
    { key: 'gatewayHours',        label: '게이트웨이 시간 (월, Hours)',     type: 'number', min: 0, step: 1, default: 730 },
    { key: 'extraS2sTunnels',     label: 'S2S 추가 터널 수',                type: 'number', min: 0, step: 1, default: 0 },
    { key: 'extraP2sConnections', label: 'P2S 추가 연결 수',                type: 'number', min: 0, step: 1, default: 0 },
    { key: 'vnetTransferType',    label: 'VNET 데이터 전송 유형',           options: ['VNET 간', 'VPN'] },
    { key: 'vnetGB',              label: 'VNET 간 데이터 전송 (월, GB)',    type: 'number', min: 0, step: 1, default: 0 },
  ],
  instanceField: false,
};

// ----------------------------------------------------------------
// 2) detail 빌더
// ----------------------------------------------------------------
window['_buildDetail_VPN_Gateway'] = function (r) {
  const o   = r.options || {};
  r.skuName = o.sku || '';

  const parts = [];
  if (o.sku) parts.push(o.sku);

  const gatewayHours = Number(o.gatewayHours !== undefined && o.gatewayHours !== '' ? o.gatewayHours : 730);
  parts.push(`GW ${gatewayHours}h`);

  const extraS2s = Number(o.extraS2sTunnels     || 0);
  const extraP2s = Number(o.extraP2sConnections || 0);
  const vnetGB   = Number(o.vnetGB              || 0);

  if (extraS2s > 0) parts.push(`S2S +${extraS2s}`);
  if (extraP2s > 0) parts.push(`P2S +${extraP2s}`);
  if (vnetGB   > 0) parts.push(`${o.vnetTransferType || 'VNET 간'} ${vnetGB}GB`);

  r.detail = parts.join(', ');
};

// ----------------------------------------------------------------
// 리전 -> 이그레스 Zone 매핑 (Inter-Region 데이터 전송 가격 매칭에 사용)
// Zone 1: 북미, 유럽
// Zone 2: 아시아, 오세아니아, 인도, 중동
// Zone 3: 남미, 아프리카
// ----------------------------------------------------------------
const VPN_GW_REGION_TO_ZONE = {
  eastus:1, eastus2:1, westus:1, westus2:1, westus3:1,
  northcentralus:1, southcentralus:1, centralus:1, westcentralus:1,
  westeurope:1, northeurope:1, francecentral:1, francesouth:1,
  uksouth:1, ukwest:1, canadacentral:1, canadaeast:1,
  koreacentral:2, koreasouth:2, japaneast:2, japanwest:2,
  eastasia:2, southeastasia:2,
  australiaeast:2, australiasoutheast:2,
  centralindia:2, southindia:2, westindia:2, qatarcentral:2,
  brazilsouth:3, brazilsoutheast:3,
  southafricanorth:3, southafricawest:3,
  uaenorth:3, uaecentral:3, israelcentral:3,
};

// ================================================================
// 3) 가격 조회 — VPN Gateway 전용 매칭 로직
// ================================================================
window['_resolve_VPN_Gateway'] = async function (row, cur) {
  const o = row.options || {};

  // ----- 옵션 정리 -----
  const sku                 = o.sku || row.skuName || '';
  const gatewayHours        = Number(o.gatewayHours !== undefined && o.gatewayHours !== '' ? o.gatewayHours : 730);
  const extraS2sTunnels     = Number(o.extraS2sTunnels     || 0);
  const extraP2sConnections = Number(o.extraP2sConnections || 0);
  const vnetGB              = Number(o.vnetGB              || 0);
  const transferType        = o.vnetTransferType || 'VNET 간';
  const regionZone          = VPN_GW_REGION_TO_ZONE[row.region] || 1;

  // 매칭 결과 저장
  let gatewayItem = null;
  let s2sItem     = null;
  let p2sItem     = null;
  let vnetItem    = null;

  // 진단용 로그(콘솔)와 부분 실패 기록
  const matchSteps = [];
  const matchErrors = [];

  // ============================================================
  // STEP 1: VPN Gateway 서비스 전체 항목을 한 번 조회
  // ============================================================
  let allVpnItems = [];
  try {
    allVpnItems = await apiFetch(
      { serviceName: 'VPN Gateway', armRegionName: row.region, priceType: 'Consumption' },
      cur, 200, 3
    );
  } catch (err) {
    row.paygItem = null;
    row.sp1Item  = null;
    row.sp3Item  = null;
    row.ri1Item  = null;
    row.ri3Item  = null;
    setStatus('error', `VPN 조회 실패: ${err.message.slice(0, 80)}`);
    updatePriceCells(row);
    updateTotalsRow();
    return;
  }

  // ============================================================
  // 헬퍼 함수들
  // ============================================================

  // 텍스트를 소문자 + 공백 제거 한 비교용 표준형으로 변환
  const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

  // 시간당 단가 항목인지 (Gateway / S2S / P2S 후보)
  const isHourlyItem = (item) => {
    if ((item.type || '').toLowerCase() !== 'consumption') return false;
    const uom = (item.unitOfMeasure || '').toLowerCase();
    return uom.includes('hour');
  };

  // GB 단위 항목인지 (데이터 전송 후보)
  const isGigabyteItem = (item) => {
    if ((item.type || '').toLowerCase() !== 'consumption') return false;
    const uom = (item.unitOfMeasure || '').toLowerCase();
    return uom.includes('gb') && !uom.includes('hour');
  };

  // 미터/제품/SKU 이름 어디든 들어 있는 모든 텍스트
  const itemText = (item) =>
    `${item.meterName || ''} ${item.productName || ''} ${item.skuName || ''}`.toLowerCase();

  // S2S 터널 키워드 매칭
  const looksLikeS2sExtra = (item) => {
    const text = itemText(item);
    if (text.includes('p2s') || text.includes('point-to-site')) return false;
    return text.includes('s2s') || text.includes('site-to-site') || text.includes('tunnel');
  };

  // P2S 연결 키워드 매칭
  const looksLikeP2sExtra = (item) => {
    const text = itemText(item);
    if (text.includes('s2s') || text.includes('site-to-site') || text.includes('tunnel')) return false;
    return text.includes('p2s') || text.includes('point-to-site') || text.includes('connection');
  };

  // 데이터 전송 외의 부가 항목(S2S/P2S/tunnel/connection 등)인지
  // — 게이트웨이 본체 매칭에서 제외하기 위함
  const isExtraDataItem = (item) => {
    const m = (item.meterName || '').toLowerCase();
    return m.includes('tunnel') || m.includes('s2s') || m.includes('p2s') ||
           m.includes('connection') || m.includes('data transfer') || m.includes('inter-');
  };

  // ============================================================
  // STEP 2: 게이트웨이 SKU 매칭
  // ============================================================
  try {
    const skuNormalized = normalize(sku);
    const gatewayCandidates = allVpnItems.filter(item => {
      if (!isHourlyItem(item))   return false;
      if (isExtraDataItem(item)) return false;
      const meter = normalize(item.meterName);
      const sName = normalize(item.skuName);
      return meter === skuNormalized || sName === skuNormalized ||
             meter.startsWith(skuNormalized) || sName.startsWith(skuNormalized) ||
             meter.endsWith(skuNormalized)   || sName.endsWith(skuNormalized);
    });

    // 정확히 일치하는 것 우선, 그다음 비싼 것 우선(예: VpnGw1 vs VpnGw1Z 같은 변형 회피)
    gatewayCandidates.sort((a, b) => {
      const aExact = (normalize(a.meterName) === skuNormalized || normalize(a.skuName) === skuNormalized) ? 0 : 1;
      const bExact = (normalize(b.meterName) === skuNormalized || normalize(b.skuName) === skuNormalized) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return Number(b.unitPrice || 0) - Number(a.unitPrice || 0);
    });

    gatewayItem = gatewayCandidates[0] || null;
  } catch (err) {
    matchErrors.push(`GW:${err.message}`);
  }

  // ============================================================
  // STEP 3: S2S 추가 터널 매칭
  // ============================================================
  if (extraS2sTunnels > 0) {
    try {
      const s2sCandidates = allVpnItems
        .filter(item => isHourlyItem(item) && looksLikeS2sExtra(item))
        .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
      s2sItem = s2sCandidates[0] || null;
    } catch (err) {
      matchErrors.push(`S2S:${err.message}`);
    }
  }

  // ============================================================
  // STEP 4: P2S 추가 연결 매칭
  // ============================================================
  if (extraP2sConnections > 0) {
    try {
      const p2sCandidates = allVpnItems
        .filter(item => isHourlyItem(item) && looksLikeP2sExtra(item))
        .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
      p2sItem = p2sCandidates[0] || null;
    } catch (err) {
      matchErrors.push(`P2S:${err.message}`);
    }
  }

  // ============================================================
  // STEP 5: VNET 간 데이터 전송 매칭 (이미지에서 지적된 부분 핵심)
  //
  // 매칭 키워드는 Azure API 응답에서 실제 관찰되는 표현을 폭넓게 커버합니다.
  // 키워드는 모두 소문자 + 공백 무시 비교가 아닌 부분 문자열 포함 비교를 사용합니다.
  // ============================================================
  if (vnetGB > 0) {
    vnetItem = await _vpnGw_findVnetTransferItem({
      transferType,
      row,
      cur,
      regionZone,
      allVpnItems,
      isGigabyteItem,
      matchSteps,
      matchErrors,
    });
  }

  // ============================================================
  // STEP 6: 월정액 합산 및 시간당 환산 단가 계산
  // ============================================================
  let gatewayHourly      = 0;
  let s2sPerTunnelHourly = 0;
  let p2sPerConnHourly   = 0;
  let vnetGbUnit         = 0;
  let monthlyTotal       = 0;

  if (gatewayItem) {
    gatewayHourly = Number(gatewayItem.unitPrice);
    monthlyTotal += gatewayHourly * gatewayHours;
  }
  if (s2sItem && extraS2sTunnels > 0) {
    s2sPerTunnelHourly = Number(s2sItem.unitPrice);
    monthlyTotal      += s2sPerTunnelHourly * extraS2sTunnels * gatewayHours;
  }
  if (p2sItem && extraP2sConnections > 0) {
    p2sPerConnHourly = Number(p2sItem.unitPrice);
    monthlyTotal    += p2sPerConnHourly * extraP2sConnections * gatewayHours;
  }
  if (vnetItem && vnetGB > 0) {
    vnetGbUnit    = Number(vnetItem.unitPrice);
    monthlyTotal += vnetGbUnit * vnetGB;
  }

  const hourlyEquivalent = monthlyTotal / 730;

  // ============================================================
  // STEP 7: 행에 가격 항목 반영
  //   VPN Gateway 는 월정액 구조라 _billingMode='monthly' 와
  //   _monthlyTotal 을 함께 저장하여 ui-and-bootstrap.js 의
  //   calcGroup() 가 "monthly_total × Qty / 730" 형태로 표시.
  // ============================================================
  let paygItem = null;
  if (gatewayItem) {
    paygItem = {
      ...gatewayItem,
      unitPrice:        hourlyEquivalent,
      retailPrice:      hourlyEquivalent,
      unitOfMeasure:    '1 Hour (equivalent)',
      _billingMode:     'monthly',
      _monthlyTotal:    monthlyTotal,
      _gwHourly:        gatewayHourly,
      _gatewayHours:    gatewayHours,
      _s2sPerTunnelHourly:   s2sPerTunnelHourly,
      _p2sPerConnHourly:     p2sPerConnHourly,
      _vnetGbUnit:           vnetGbUnit,
      _vnetGB:               vnetGB,
      _vnetTransferType:     transferType,
      _vnetMatchSteps:       matchSteps,
      _partialErrors:        matchErrors.length > 0 ? matchErrors : undefined,
    };
  }

  row.paygItem = paygItem;
  row.sp1Item  = null;
  row.sp3Item  = null;
  row.ri1Item  = null;
  row.ri3Item  = null;

  // ============================================================
  // STEP 8: 상태 메시지 + 콘솔 진단 로그
  // ============================================================
  if (paygItem) {
    const tags = [gatewayItem ? 'GW✓' : 'GW✗'];
    if (extraS2sTunnels     > 0) tags.push(s2sItem  ? 'S2S✓'  : 'S2S✗');
    if (extraP2sConnections > 0) tags.push(p2sItem  ? 'P2S✓'  : 'P2S✗');
    if (vnetGB              > 0) tags.push(vnetItem ? 'VNET✓' : 'VNET✗');
    setStatus('ok', `${sku} 완료 [${tags.join(', ')}] · ${monthlyTotal.toFixed(2)}/월`);
    // 진단을 위해 매칭 단계 로그
    if (vnetGB > 0) {
      console.log(`[VPN Gateway] VNET 전송 매칭 단계: ${matchSteps.join(' → ') || '없음'}`);
      if (vnetItem) {
        console.log(`[VPN Gateway] VNET 매칭 항목: meterName="${vnetItem.meterName || ''}" productName="${vnetItem.productName || ''}" unitPrice=${vnetItem.unitPrice}`);
      }
    }
  } else {
    setStatus('error', `${sku}: GW 매칭 실패`);
  }

  updatePriceCells(row);
  updateTotalsRow();
};

// ================================================================
// VNET 간 데이터 전송 항목을 여러 데이터 소스에서 찾는 보조 함수
//
// 매칭 데이터 소스 우선순위:
//   1) serviceName='VPN Gateway' 안의 GB 항목 (이미 가져온 allVpnItems)
//   2) serviceName='Virtual Network' 안의 GB 항목 (VNet Peering 가격)
//   3) serviceName='Bandwidth' 안의 GB 항목 (Inter-Region 데이터 전송)
//
// 매칭 키워드: Azure API 응답에서 실제 관찰되는 표현을 폭넓게 커버합니다.
// 폴백: 모든 매칭 실패 시 "동일 지역 무료(₩0)" 가짜 항목 반환.
// ================================================================
async function _vpnGw_findVnetTransferItem(ctx) {
  const { transferType, row, cur, regionZone, allVpnItems, isGigabyteItem, matchSteps, matchErrors } = ctx;

  // 매칭 항목 풀 — 세 데이터 소스에서 모두 수집한 뒤 최종 정렬에서 1개를 고름.
  // (이전에는 우선순위가 높은 소스에서 결과가 나오면 다음 소스를 보지 않았는데,
  //  Azure 데이터는 같은 항목이 여러 serviceName 에 흩어져 있어
  //  실제 사용자가 원하는 outbound 단가가 우선순위 낮은 소스에 있을 수 있습니다.
  //  따라서 모든 소스를 합쳐서 zone + outbound 기준으로 정렬합니다.)
  let pool = [];

  // ----- 1차: VPN Gateway 서비스 내부 -----
  try {
    const candidates = _vpnGw_filterTransferCandidates(allVpnItems.filter(isGigabyteItem), transferType);
    if (candidates.length > 0) {
      pool = pool.concat(candidates);
      matchSteps.push(`VPN ${candidates.length}건`);
    }
  } catch (err) {
    matchErrors.push(`VNETA:${err.message}`);
  }

  // ----- 2차: Virtual Network 서비스 (VNet Peering 가격) -----
  try {
    const vnItems = await apiFetch(
      { serviceName: 'Virtual Network', armRegionName: row.region, priceType: 'Consumption' },
      cur, 500, 3, { pageSize: 200, expectedSizeKB: 300 }
    );
    const candidates = _vpnGw_filterTransferCandidates(vnItems.filter(isGigabyteItem), transferType);
    if (candidates.length > 0) {
      pool = pool.concat(candidates);
      matchSteps.push(`VN ${candidates.length}건`);
    } else {
      matchSteps.push(`VN 0/${vnItems.length}`);
    }
  } catch (err) {
    matchSteps.push('VN실패');
    matchErrors.push(`VN:${err.message}`);
  }

  // ----- 3차: Bandwidth 서비스 (Inter-Region 데이터 전송) -----
  try {
    const bwItems = await apiFetch(
      { serviceName: 'Bandwidth', armRegionName: row.region, priceType: 'Consumption' },
      cur, 2000, 5, { pageSize: 500, expectedSizeKB: 800 }
    );
    const candidates = _vpnGw_filterTransferCandidates(bwItems.filter(isGigabyteItem), transferType);
    if (candidates.length > 0) {
      pool = pool.concat(candidates);
      matchSteps.push(`BW ${candidates.length}건`);
    } else {
      matchSteps.push(`BW 0/${bwItems.length}`);
    }
  } catch (err) {
    matchSteps.push('BW실패');
    matchErrors.push(`BW:${err.message}`);
  }

  // 1차에서 충분한 후보가 나왔으면 2/3차 폴백 후보(GB 양수 가격 전체)는 굳이 추가하지 않음.
  // 단, 1차/2차/3차 모두에서 정확 키워드 매칭이 없을 때만 1차의 GB 양수 항목 전체를 폴백 풀에 추가.
  if (pool.length === 0) {
    const fallback = allVpnItems.filter(item => isGigabyteItem(item) && Number(item.unitPrice || 0) > 0);
    if (fallback.length > 0) {
      pool = pool.concat(fallback);
      matchSteps.push(`VPN GB폴백 ${fallback.length}건`);
    }
  }

  // ----- 중복 제거 -----
  const uniqueById = new Map();
  for (const item of pool) {
    const id = item.meterId || `${item.serviceName}|${item.armRegionName}|${item.meterName}|${item.unitPrice}`;
    if (!uniqueById.has(id)) uniqueById.set(id, item);
  }
  const uniqueCandidates = Array.from(uniqueById.values());

  // ----- Zone / Out 키워드 우선 정렬 -----
  const sorted = _vpnGw_sortTransferCandidates(uniqueCandidates, regionZone);
  if (sorted.length > 0) {
    matchSteps.push(`최종 ${sorted.length}건 → ${sorted[0].meterName || sorted[0].skuName || '?'}`);
    return sorted[0];
  }

  // ----- 폴백: 동일 지역 무료 -----
  // Azure 공식: VPN Gateway 의 동일 지역 VNet 간 트래픽은 무료.
  // VPN 유형 + VNET 간 유형 모두 적용.
  matchSteps.push('폴백: 동일 지역 무료');
  return {
    meterName:     `[zone${regionZone} 동일 지역 무료]`,
    skuName:       'Free',
    unitPrice:     0,
    retailPrice:   0,
    unitOfMeasure: '1 GB',
    currencyCode:  cur,
    productName:   `VPN Gateway 동일 지역 VNet 간 트래픽 (${transferType})`,
    serviceName:   'VPN Gateway',
    _isFallback:   true,
  };
}

// 데이터 전송 후보 필터 — 키워드 매칭으로 "VNET 간 outbound" 또는 "VPN egress" 식별
function _vpnGw_filterTransferCandidates(items, transferType) {
  return items.filter(item => {
    if (Number(item.unitPrice || 0) <= 0) return false;
    return transferType === 'VNET 간'
      ? _vpnGw_isInterVnetOutbound(item)
      : _vpnGw_isVpnEgress(item);
  });
}

// "VNET 간 outbound" 키워드 매칭 (이미지 시나리오의 핵심)
function _vpnGw_isInterVnetOutbound(item) {
  const text = `${item.meterName || ''} ${item.productName || ''} ${item.skuName || ''}`.toLowerCase();

  // 명시적 inter-VNet 키워드
  if (text.includes('inter-virtual network'))   return true;
  if (text.includes('inter virtual network'))   return true;
  if (text.includes('inter-vnet'))              return true;
  if (text.includes('inter vnet'))              return true;
  if (text.includes('vnet to vnet'))            return true;
  if (text.includes('vnet-to-vnet'))            return true;

  // VNet Peering (Outbound 한정)
  if (text.includes('peering') && (text.includes('out') || text.includes('egress'))) return true;

  // Inter-Region / Cross-Region 데이터 전송 (Zone 가격에 해당)
  if (text.includes('inter-region') && text.includes('out')) return true;
  if (text.includes('cross-region') && text.includes('out')) return true;

  // 일반적 outbound + VNet/virtual network 조합
  if ((text.includes('outbound') || text.includes('egress')) &&
      (text.includes('vnet') || text.includes('virtual network'))) {
    return true;
  }

  return false;
}

// "VPN egress" 키워드 매칭
function _vpnGw_isVpnEgress(item) {
  const text = `${item.meterName || ''} ${item.productName || ''} ${item.skuName || ''}`.toLowerCase();

  // VNet/peering/cross-region 항목은 VPN 으로 분류하지 않음
  if (text.includes('inter-virtual network')) return false;
  if (text.includes('inter-vnet'))            return false;
  if (text.includes('peering'))               return false;
  if (text.includes('inter-region'))          return false;
  if (text.includes('cross region'))          return false;

  return text.includes('vpn') || text.includes('data transfer');
}

// 후보 정렬: 사용자 리전의 zone 매칭 우선 → 명시적 Inter-VNet 키워드 우선 → outbound 키워드 우선 → 단가 오름차순
function _vpnGw_sortTransferCandidates(candidates, regionZone) {
  const zonePattern = new RegExp(`zone\\s*${regionZone}\\b`, 'i');
  const matchesZone = (item) =>
    zonePattern.test(item.meterName || '') ||
    zonePattern.test(item.skuName   || '') ||
    zonePattern.test(item.productName || '');

  const isOutbound = (item) =>
    /\bout\b|outbound|egress/i.test(item.meterName || '') ||
    /\bout\b|outbound|egress/i.test(item.productName || '');

  // "Inter-Region", "Inter-Virtual Network" 같은 명시적 cross/inter 키워드가 있는 항목.
  // Azure Pricing Calculator 가 "VNET 간 outbound" 가격으로 표시하는 단가에 해당.
  const isExplicitInterVnet = (item) => {
    const text = `${item.meterName || ''} ${item.productName || ''} ${item.skuName || ''}`.toLowerCase();
    return text.includes('inter-virtual network') ||
           text.includes('inter virtual network') ||
           text.includes('inter-region') ||
           text.includes('cross-region') ||
           text.includes('cross region');
  };

  return candidates.slice().sort((a, b) => {
    // 1순위: zone 매칭
    const zoneA = matchesZone(a) ? 0 : 1;
    const zoneB = matchesZone(b) ? 0 : 1;
    if (zoneA !== zoneB) return zoneA - zoneB;

    // 2순위: 명시적 Inter-VNet/Inter-Region 키워드
    const interA = isExplicitInterVnet(a) ? 0 : 1;
    const interB = isExplicitInterVnet(b) ? 0 : 1;
    if (interA !== interB) return interA - interB;

    // 3순위: outbound 키워드
    const outA = isOutbound(a) ? 0 : 1;
    const outB = isOutbound(b) ? 0 : 1;
    if (outA !== outB) return outA - outB;

    // 4순위: 단가 오름차순 (저렴한 것 우선)
    return Number(a.unitPrice || 0) - Number(b.unitPrice || 0);
  });
}
