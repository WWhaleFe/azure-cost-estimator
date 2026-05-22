// ================================================================
// services/app-service.js — Azure App Service
//
// 이 파일은 다음을 등록합니다.
//   1) window._svcDefs['App Service']     — 카테고리 정의(옵션 목록)
//   2) window['_buildDetail_App_Service'] — 옵션 → skuName/detail 변환
//   3) window['_resolve_App_Service']     — 시간당 가격 5종 조회
//
// === App Service 가격 산정 개요 ===
//
// App Service 는 App Service Plan 단위로 청구되며, Plan 안에 인스턴스가
// 1개 이상 포함됩니다. 청구 공식은 다음과 같습니다.
//
//   monthly_total = instance_hourly × 730 × instanceCount
//   hourly_equiv  = instance_hourly × instanceCount
//
// === Azure Retail Prices API 응답 형태(확인된 사례) ===
//
//   serviceName  : "Azure App Service"
//   productName  : "Azure App Service Basic Plan - Linux"
//                  "Azure App Service Standard Plan - Windows"
//                  "Azure App Service Premium v3 Plan - Linux"
//                  "Azure App Service Isolated v2 Plan - Windows"
//   skuName      : "B1", "B2", "B3", "S1", "S2", "S3",
//                  "P1V2", "P2V2", "P3V2",
//                  "P1V3", "P2V3", "P3V3",
//                  "P1MV3", "P2MV3", "P3MV3" (memory-optimized)
//   meterName    : 보통 skuName 과 동일
//   unitOfMeasure: "1 Hour"
//   armSkuName   : (보통 비어 있거나 skuName 과 유사)
//
// === 매칭 키 ===
//
//   server-side filter: skuName eq '<인스턴스>'
//   client-side 매칭  : productName.includes('<OS>') AND productName.includes('<tier_pattern>')
//
// Free / Shared 계층은 가격이 $0 이거나 별도 청구 방식이라 본 도구에서는
// 옵션으로만 노출하고, 가격은 $0 으로 표시될 가능성이 높습니다.
// ================================================================

// ----------------------------------------------------------------
// 1) 카테고리 정의
// ----------------------------------------------------------------
window._svcDefs['App Service'] = {
  apiServiceName: 'Azure App Service',
  steps: [
    {
      key:     'tier',
      label:   '계층',
      options: ['Free', 'Shared', 'Basic', 'Standard', 'Premium v2', 'Premium v3', 'Isolated v2'],
    },
    {
      key:     'os',
      label:   'OS',
      options: ['Linux', 'Windows'],
    },
    {
      key:     'instance',
      label:   '인스턴스',
      options: [
        'B1', 'B2', 'B3',                                  // Basic
        'S1', 'S2', 'S3',                                  // Standard
        'P1V2', 'P2V2', 'P3V2',                            // Premium v2
        'P1V3', 'P2V3', 'P3V3',                            // Premium v3
        'P1MV3', 'P2MV3', 'P3MV3', 'P4MV3', 'P5MV3',       // Premium v3 Memory-Optimized
        'I1V2', 'I2V2', 'I3V2', 'I4V2', 'I5V2', 'I6V2',    // Isolated v2
      ],
    },
    {
      key:     'instanceCount',
      label:   '인스턴스 수',
      type:    'number',
      min:     1,
      max:     30,
      step:    1,
      default: 1,
      tooltip: 'App Service Plan 안의 동일 인스턴스 개수.',
    },
  ],
  instanceField: false,
};

// ----------------------------------------------------------------
// 2) detail 빌더 — UI 표에 표시할 SKU 라벨과 상세 사양 생성
// ----------------------------------------------------------------
window['_buildDetail_App_Service'] = function (r) {
  const o = r.options || {};

  r.skuName = o.instance || '';

  const parts = [];
  if (o.tier)         parts.push(o.tier);
  if (o.os)           parts.push(o.os);
  if (o.instance)     parts.push(o.instance);
  const count = Number(o.instanceCount || 1);
  if (count > 1)      parts.push(`x${count}`);

  r.detail = parts.join(', ');
};

// ----------------------------------------------------------------
// tier → productName 키워드 매핑
//
// Azure 응답의 productName 은 보통 "Azure App Service <tier> Plan - <OS>" 형태.
// "Premium v3" 처럼 공백이 들어간 경우 productName 의 표현과 정확히 일치하는
// 짧은 키워드만 추출해 부분 문자열 비교에 사용.
// ----------------------------------------------------------------
const APP_SERVICE_TIER_PATTERNS = {
  'Free':        ['free plan'],
  'Shared':      ['shared plan'],
  'Basic':       ['basic plan'],
  'Standard':    ['standard plan'],
  'Premium v2':  ['premium v2 plan', 'premium plan v2', 'premium plan'],
  'Premium v3':  ['premium v3 plan', 'premium plan v3'],
  'Isolated v2': ['isolated v2 plan', 'isolated plan v2'],
};

// ================================================================
// 3) 가격 조회 — App Service 전용 매칭 로직
// ================================================================
window['_resolve_App_Service'] = async function (row, cur) {
  const o = row.options || {};

  // ----- 옵션 정리 / 기본값 -----
  const selectedTier     = o.tier     || 'Basic';
  const selectedOS       = o.os       || 'Linux';
  const selectedInstance = o.instance || row.skuName || '';
  const instanceCount    = Math.max(1, Number(o.instanceCount || 1));

  // 인스턴스가 선택되지 않으면 가격 조회 불가
  if (!selectedInstance) {
    row.paygItem = null;
    row.sp1Item  = null;
    row.sp3Item  = null;
    row.ri1Item  = null;
    row.ri3Item  = null;
    setStatus('error', `${row.skuName || 'App Service'}: 인스턴스가 선택되지 않았습니다`);
    updatePriceCells(row);
    updateTotalsRow();
    return;
  }

  try {
    // ----- API 조회: Consumption + Reservation 병렬 -----
    const [cItems, rItems] = await Promise.all([
      apiFetch(
        { serviceName: 'Azure App Service', armRegionName: row.region, skuName: selectedInstance, priceType: 'Consumption' },
        cur, 200, 3
      ),
      apiFetch(
        { serviceName: 'Azure App Service', armRegionName: row.region, skuName: selectedInstance, priceType: 'Reservation' },
        cur, 200, 3
      ).catch(() => []),
    ]);

    // ============================================================
    // 헬퍼: tier 와 OS 가 일치하는 항목인지
    // ============================================================
    const matchesTier = (item) => {
      const productName = (item.productName || '').toLowerCase();
      const patterns = APP_SERVICE_TIER_PATTERNS[selectedTier] || [selectedTier.toLowerCase()];
      return patterns.some(pattern => productName.includes(pattern));
    };

    const matchesOS = (item) => {
      const productName = (item.productName || '').toLowerCase();
      // Windows 응답에는 'windows' 키워드가 들어 있고, Linux 응답은 'linux'
      // (구버전 응답에서는 OS 표시 없이 Windows 인 경우가 있으나 현재 응답은 명시됨)
      if (selectedOS === 'Windows') {
        return productName.includes('windows');
      }
      if (selectedOS === 'Linux') {
        return productName.includes('linux');
      }
      return true;
    };

    // 시간당 단가 항목인지 + 정상 PAYG 인지 (Spot/DevTest 제외)
    const isValidConsumption = (item) => {
      if ((item.type || '').toLowerCase() !== 'consumption') return false;
      if (Number(item.tierMinimumUnits || 0) !== 0)          return false;

      const uom = (item.unitOfMeasure || '').toLowerCase();
      if (!uom.includes('hour')) return false;

      const sku   = (item.skuName   || '').toLowerCase();
      const meter = (item.meterName || '').toLowerCase();
      if (sku.includes('stamp') || meter.includes('stamp')) return false;  // Isolated 의 Stamp Fee 별도

      return true;
    };

    // ============================================================
    // PAYG 매칭: skuName 정확 일치 + tier + OS
    // ============================================================
    const paygCandidates = cItems
      .filter(isValidConsumption)
      .filter(item => (item.skuName || '') === selectedInstance)
      .filter(matchesTier)
      .filter(matchesOS)
      .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

    const instanceItem = paygCandidates[0] || null;

    // ============================================================
    // 절약 플랜 추출 (App Service 도 일부 SKU 가 savingsPlan 보유)
    // ============================================================
    let sp1 = null, sp3 = null;

    const extractSpFromItem = (item) => {
      if (!item || !Array.isArray(item.savingsPlan)) return;
      for (const sp of item.savingsPlan) {
        const term = String(sp.term || '').toLowerCase();
        const isOneYear   = term.includes('1 year') || term === '1' || term.startsWith('1 ');
        const isThreeYear = term.includes('3 year') || term === '3' || term.startsWith('3 ');
        if (!sp1 && isOneYear)   sp1 = makeSpItem(item, sp);
        if (!sp3 && isThreeYear) sp3 = makeSpItem(item, sp);
      }
    };
    extractSpFromItem(instanceItem);

    // 매칭된 PAYG 항목에서 못 찾으면 다른 후보들에서도 시도
    if (!sp1 || !sp3) {
      for (const item of cItems) {
        if (item === instanceItem) continue;
        if (!isValidConsumption(item)) continue;
        if ((item.skuName || '') !== selectedInstance) continue;
        if (!matchesTier(item)) continue;
        if (!matchesOS(item)) continue;
        extractSpFromItem(item);
        if (sp1 && sp3) break;
      }
    }

    // ============================================================
    // 예약 매칭 + 시간당 정규화
    //
    // App Service Reservation 응답의 unitPrice 는 "총 N년치 가격" 일 수 있어
    // normalizeReservationPrice 로 시간당 환산.
    // ============================================================
    const isValidReservation = (item) => {
      if ((item.type || '').toLowerCase() !== 'reservation') return false;
      if ((item.skuName || '') !== selectedInstance)         return false;
      if (!matchesTier(item)) return false;
      if (!matchesOS(item))   return false;
      return true;
    };

    const ri1Candidates = rItems
      .filter(isValidReservation)
      .filter(item => /1\s*year/i.test(String(item.reservationTerm || '')))
      .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

    const ri3Candidates = rItems
      .filter(isValidReservation)
      .filter(item => /3\s*year/i.test(String(item.reservationTerm || '')))
      .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

    const ri1Hourly = ri1Candidates[0] ? normalizeReservationPrice(ri1Candidates[0], 1) : null;
    const ri3Hourly = ri3Candidates[0] ? normalizeReservationPrice(ri3Candidates[0], 3) : null;

    // ============================================================
    // 인스턴스 개수를 곱하여 최종 시간당 환산 단가 계산
    //
    // 예) B1 단가 $0.018/h × 인스턴스 3개 = $0.054/h
    // ============================================================
    const multiplyByInstanceCount = (item) => {
      if (!item) return null;
      const perInstanceHourly = Number(item.unitPrice);
      const totalHourly       = perInstanceHourly * instanceCount;
      return {
        ...item,
        unitPrice:              totalHourly,
        retailPrice:            totalHourly,
        unitOfMeasure:          instanceCount > 1 ? `1 Hour (x${instanceCount} instances)` : '1 Hour',
        _perInstanceHourly:     perInstanceHourly,
        _instanceCount:         instanceCount,
      };
    };

    const paygItem = multiplyByInstanceCount(instanceItem);
    const sp1Item  = multiplyByInstanceCount(sp1);
    const sp3Item  = multiplyByInstanceCount(sp3);
    const ri1Item  = multiplyByInstanceCount(ri1Hourly);
    const ri3Item  = multiplyByInstanceCount(ri3Hourly);

    // ============================================================
    // 행에 가격 항목 반영
    // ============================================================
    row.paygItem = paygItem;
    row.sp1Item  = sp1Item;
    row.sp3Item  = sp3Item;
    row.ri1Item  = ri1Item;
    row.ri3Item  = ri3Item;

    // 상태 메시지
    if (paygItem) {
      const tags = ['PAYG'];
      if (sp1Item) tags.push('SP1Y');
      if (sp3Item) tags.push('SP3Y');
      if (ri1Item) tags.push('RI1Y');
      if (ri3Item) tags.push('RI3Y');
      const paygUnitText = Number(paygItem.unitPrice).toFixed(4);
      const countText    = instanceCount > 1 ? ` × ${instanceCount}` : '';
      setStatus('ok', `${row.skuName}${countText} 완료 [${tags.join(', ')}] · PAYG ${paygUnitText}/h`);
    } else {
      setStatus('error', `${row.skuName}: 매칭 없음 (${cItems.length}건 중, ${selectedTier} ${selectedOS})`);
    }
  } catch (err) {
    row.paygItem = null;
    row.sp1Item  = null;
    row.sp3Item  = null;
    row.ri1Item  = null;
    row.ri3Item  = null;
    setStatus('error', `API 실패: ${err.message.slice(0, 100)}`);
    console.error('App Service:', err);
  }

  updatePriceCells(row);
  updateTotalsRow();
};
