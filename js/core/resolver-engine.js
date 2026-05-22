// ================================================================
// core/resolver-engine.js — 공통 가격 조회 엔진
//
// 이 파일은 services/*.js 가 별도 _resolve_* 함수를 제공하지 않는 경우
// 사용되는 "기본 가격 매칭 로직(_genericResolve)" 과,
// 모든 서비스가 공통으로 사용하는 헬퍼 함수들을 정의합니다.
//
// 전역에 노출되는 함수:
//   - normalizeReservationPrice : 예약 가격을 시간당 단가로 정규화
//   - makeSpItem                : 절약 플랜 데이터로 가짜 "가격 항목" 생성
//   - buildSkuAndDetail         : 행의 옵션값으로부터 skuName/detail 채움
//   - tryResolveItem            : 행 1개의 가격을 조회하여 5개 컬럼(PAYG/SP1/SP3/RI1/RI3) 채움
//   - _genericResolve           : 전용 _resolve_* 가 없는 서비스의 기본 매칭 로직
// ================================================================

// 가격 컬럼 5개를 한 번에 null 로 비우는 헬퍼.
// 카테고리 미선택, 매칭 실패, API 오류 등에서 동일하게 사용됨.
function _clearPriceItems(row) {
  row.paygItem = null;
  row.sp1Item  = null;
  row.sp3Item  = null;
  row.ri1Item  = null;
  row.ri3Item  = null;
}

// 예약(Reservation) 가격은 "선결제 총액" 또는 "월정액"으로 응답되는 경우가 있어
// 그대로 PAYG/절약과 같은 표에 표시하면 단위가 어긋남.
// 따라서 모든 예약 가격을 "시간당 단가"로 환산해 다른 그룹과 동일 단위로 맞춤.
//
// 환산 규칙:
//   - 1년 = 8760h, 3년 = 26280h
//   - unitPrice 가 retailPrice 보다 1000배 이상 크면 unitPrice 가 총액이라고 판단하고
//     retailPrice 를 그대로 시간당 단가로 사용 (이미 시간당으로 들어온 경우 대비)
//   - 그 외에는 unitPrice 를 총 시간으로 나눠서 시간당 단가 계산
function normalizeReservationPrice(item, years) {
  const totalHours      = years * 8760;
  const originalUnit    = Number(item.unitPrice);
  const retailPrice     = Number(item.retailPrice || item.unitPrice);
  const looksLikeTotal  = retailPrice > 0 && originalUnit / retailPrice > 1000;
  const hourlyPrice     = looksLikeTotal ? retailPrice : originalUnit / totalHours;

  return {
    ...item,
    unitPrice:               hourlyPrice,
    retailPrice:             hourlyPrice,
    unitOfMeasure:           '1 Hour (normalized)',
    _originalUnitPrice:      originalUnit,
    _originalUnitOfMeasure:  item.unitOfMeasure,
    _termYears:              years,
  };
}

// Azure Retail API 응답의 한 항목(item) 안에는 savingsPlan 배열이 함께 들어 있음.
// 이 함수는 그중 한 절약 플랜 항목을 "가격 항목" 형태로 변환해서
// PAYG/RI 와 같은 표 셀에 동일한 방식으로 렌더링할 수 있게 함.
function makeSpItem(base, sp) {
  return {
    unitPrice:     Number(sp.unitPrice),
    retailPrice:   Number(sp.retailPrice || sp.unitPrice),
    currencyCode:  base.currencyCode,
    type:          'SavingsPlan',
    armRegionName: base.armRegionName,
    productName:   base.productName,
    skuName:       base.skuName,
    armSkuName:    base.armSkuName,
    meterName:     base.meterName,
    unitOfMeasure: base.unitOfMeasure,
    term:          sp.term,
  };
}

// 행의 options 객체에서 skuName 과 detail 문자열을 채움.
// 서비스별로 표시 형식이 다르므로, _buildDetail_<카테고리명> 전용 함수가 있으면 그것을 사용.
// 없으면 모든 옵션값을 ", " 로 이어 붙이는 기본 동작.
function buildSkuAndDetail(r) {
  const categoryDef = SERVICE_CATEGORIES[r.serviceCategory];
  if (!categoryDef) return;

  const specificFnName = `_buildDetail_${r.serviceCategory.replace(/[^a-zA-Z0-9]/g, '_')}`;
  if (typeof window[specificFnName] === 'function') {
    window[specificFnName](r);
    return;
  }

  const visibleOptionValues = (categoryDef.steps || [])
    .filter(step => !step._hidden)
    .map(step => r.options[step.key])
    .filter(Boolean);

  r.skuName = visibleOptionValues[0] || '';
  r.detail  = visibleOptionValues.join(', ');
}

// 행 1개의 가격 5종(PAYG/SP1/SP3/RI1/RI3)을 조회하여 행 객체에 채움.
// 카테고리에 _resolve_<카테고리명> 전용 함수가 있으면 그것을 사용,
// 없으면 _genericResolve 로 폴백.
async function tryResolveItem(row) {
  // 1) 프로비저닝 계층 디스크(Premium SSD v2, Ultra Disk)는 SKU 이름 없이도
  //    diskSubType + 크기/IOPS/MB/s 만으로 가격 조회가 가능하므로 별도 처리.
  const isProvisionedDisk =
    row.serviceCategory === 'Disk' &&
    (row.options.diskSubType === '프리미엄 SSD v2' ||
     row.options.diskSubType === 'Ultra Disk');

  // 2) 카테고리 미선택 시 가격 컬럼 비우고 종료
  if (!row.serviceCategory) {
    _clearPriceItems(row);
    return;
  }

  // 3) SKU 이름이 없는 경우의 종료 조건
  if (!isProvisionedDisk && !row.skuName) {
    // Disk 카테고리는 diskInstance(P30 등 SKU 이름) 가 있어야 조회 가능
    if (row.serviceCategory === 'Disk' && !row.options.diskInstance) {
      _clearPriceItems(row);
      return;
    }
    // 그 외 카테고리는 SKU 이름 없으면 그대로 종료
    if (row.serviceCategory !== 'Disk') {
      _clearPriceItems(row);
      return;
    }
  }

  // 4) 카테고리 정의가 없으면 그대로 종료(빈 상태 유지)
  const categoryDef = SERVICE_CATEGORIES[row.serviceCategory];
  if (!categoryDef) return;

  // 5) 통화 코드 결정 및 사용자에게 로딩 상태 표시
  const currencyCode = document.getElementById('currencySelect').value;
  const loadingLabel = row.skuName || row.options.diskSubType || row.serviceCategory;
  setStatus('loading', `${loadingLabel} 가격 조회 중...`);

  // 6) 카테고리 전용 _resolve_* 함수가 있으면 그것에 위임
  const specificFnName = `_resolve_${row.serviceCategory.replace(/[^a-zA-Z0-9]/g, '_')}`;
  if (typeof window[specificFnName] === 'function') {
    return await window[specificFnName](row, currencyCode);
  }

  // 7) 없으면 공통 매칭 로직 사용
  return await _genericResolve(row, currencyCode);
}

// ================================================================
// _genericResolve 보조 함수들
// ================================================================

// 카테고리별로 Azure Retail API 에 보낼 추가 필터(productName, skuName 등)를 결정.
// API 가 반환하는 항목 수를 줄이기 위해 가능한 한 server-side 에서 좁힘.
function _buildCategoryFilter(row) {
  const filter = {};
  const o     = row.options;
  const cat   = row.serviceCategory;

  if (cat === 'Azure Files') {
    const productNameByTier = {
      'Premium':               'Premium Files',
      'Hot':                   'General Purpose v2 Files',
      'Cool':                  'Cool Files',
      'Transaction Optimized': 'General Purpose v2 Files',
    };
    const productName = productNameByTier[o.fileTier || 'Premium'];
    if (productName) filter.productName = productName;
    return filter;
  }

  if (cat === 'Blob Storage') {
    const productNameByTier = {
      'Hot':     'Hot Block Blob',
      'Cool':    'Cool Block Blob',
      'Cold':    'Cold Block Blob',
      'Archive': 'Archive Block Blob',
    };
    const productName = productNameByTier[o.blobTier || 'Hot'];
    if (productName) filter.productName = productName;
    return filter;
  }

  if (cat === 'Load Balancer')       filter.productName = `${o.tier || 'Standard'} Load Balancer`;
  else if (cat === 'Application Gateway') filter.skuName = row.skuName;
  else if (cat === 'Public IP')           filter.productName = 'IP Addresses';
  else if (cat === 'Azure Firewall')      filter.productName = `Azure Firewall ${o.tier || 'Standard'}`;
  else if (cat === 'Azure SQL Database')  filter.productName = `SQL Database Single/Elastic Pool ${o.tier || 'General Purpose'} - Compute Gen5`;
  else if (cat === 'App Service')         filter.skuName     = row.skuName || o.size || '';
  else if (cat === 'Azure Bastion')       filter.productName = `Azure Bastion ${o.tier || 'Basic'}`;
  else if (cat === 'NAT Gateway')         filter.productName = 'NAT Gateway';

  return filter;
}

// 카테고리별 "이 항목이 사용자가 선택한 옵션과 일치하는가" 판정 함수를 생성.
// API 가 server-side 필터만으로 줄일 수 없는 부분(예: 중복성, 미터명)을 client-side 에서 한 번 더 거름.
function _makeItemMatcher(row) {
  const o   = row.options;
  const cat = row.serviceCategory;

  if (cat === 'Azure Files') {
    return (item) => {
      const redundancy   = o.redundancy || 'LRS';
      const targetMetric = (o.metric || 'Data Stored').toLowerCase().replace('data stored', 'stored');
      const skuName      = item.skuName || '';
      const meterName    = (item.meterName || '').toLowerCase();
      return skuName.includes(redundancy) && meterName.includes(targetMetric);
    };
  }

  if (cat === 'Blob Storage') {
    return (item) => (item.skuName || '').includes(o.redundancy || 'LRS');
  }

  if (cat === 'Load Balancer') {
    const targetMetric = (o.metric || 'Rules').toLowerCase();
    return (item) => (item.meterName || '').toLowerCase().includes(targetMetric);
  }

  if (cat === 'Public IP') {
    const requiredSku    = o.sku    || 'Standard';
    const requiredIpType = o.ipType || 'Static';
    return (item) => {
      const skuName = item.skuName || '';
      return skuName.includes(requiredSku) && skuName.includes(requiredIpType);
    };
  }

  if (cat === 'Azure Firewall') {
    const targetMetric = (o.metric || 'Deployment').toLowerCase();
    return (item) => (item.meterName || '').toLowerCase().includes(targetMetric);
  }

  if (cat === 'Application Gateway') {
    return (item) => (item.skuName || '').includes(row.skuName);
  }

  if (cat === 'Azure Bastion') {
    return () => true;
  }

  if (cat === 'NAT Gateway') {
    const targetMetric = (o.metric || 'Resource Hour').toLowerCase();
    return (item) => (item.meterName || '').toLowerCase().includes(targetMetric);
  }

  // 기본 매칭: skuName 또는 armSkuName 이 정확히 일치
  return (item) => (item.skuName || item.armSkuName || '') === row.skuName;
}

// Spot 인스턴스, Low Priority, DevTest 항목 등 정규 가격이 아닌 응답을 걸러냄.
// (정규 PAYG 가격을 찾는 흐름에서 잘못된 항목을 잡지 않도록.)
function _isStandardPriceItem(item) {
  const skuName   = (item.skuName  || '').toLowerCase();
  const meterName = (item.meterName || '').toLowerCase();
  const type      = (item.type     || '').toLowerCase();

  const hasSpotKeyword         = skuName.includes('spot')         || meterName.includes('spot');
  const hasLowPriorityKeyword  = skuName.includes('low priority') || meterName.includes('low priority');
  const isDevTest              = type === 'devtestconsumption';

  return !hasSpotKeyword && !hasLowPriorityKeyword && !isDevTest;
}

// 한 항목(item) 의 savingsPlan 배열을 훑어서 1년/3년 절약 플랜을 추출.
// 이미 sp1/sp3 가 채워져 있으면 그 자리는 건너뜀.
function _extractSavingsPlans(item, found) {
  if (!item || !Array.isArray(item.savingsPlan)) return;

  for (const sp of item.savingsPlan) {
    const term = String(sp.term || '').toLowerCase();

    const isOneYear   = term.includes('1 year') || term === '1' || term.startsWith('1 ');
    const isThreeYear = term.includes('3 year') || term === '3' || term.startsWith('3 ');

    if (isOneYear  && !found.sp1) found.sp1 = makeSpItem(item, sp);
    if (isThreeYear && !found.sp3) found.sp3 = makeSpItem(item, sp);
  }
}

// 예약 항목(rItems) 중에서 특정 기간(years 년) 에 해당하는 가장 저렴한 항목 1건을 찾음.
function _findCheapestReservation(rItems, row, years) {
  const termPattern = new RegExp(`${years}\\s*year`, 'i');

  const candidates = rItems
    .filter(item => (item.type || '').toLowerCase() === 'reservation')
    .filter(item => termPattern.test(String(item.reservationTerm || '')))
    .filter(item => (item.skuName || item.armSkuName || '') === row.skuName)
    .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

  return candidates[0] || null;
}

// 조회 결과를 보고 어떤 가격 그룹이 성공적으로 채워졌는지 태그 목록을 만듦.
// 사용자에게 "PAYG, SP1Y, SP3Y, RI1Y, RI3Y 중 어디까지 매칭됐는지" 한눈에 보여줌.
function _buildSuccessTags(row) {
  const tags = ['PAYG'];
  if (row.sp1Item) tags.push('SP1Y');
  if (row.sp3Item) tags.push('SP3Y');
  if (row.ri1Item) tags.push('RI1Y');
  if (row.ri3Item) tags.push('RI3Y');
  return tags;
}

// ================================================================
// _genericResolve — 전용 _resolve_* 가 없는 서비스의 기본 가격 조회 로직
// ================================================================
async function _genericResolve(row, cur) {
  const categoryDef = SERVICE_CATEGORIES[row.serviceCategory];

  try {
    // 1) API 호출용 기본 필터 구성
    const baseFilter = {
      serviceName:   categoryDef.apiServiceName,
      armRegionName: row.region,
      ..._buildCategoryFilter(row),
    };

    // 2) Consumption(용량제) 항목과 Reservation(예약) 항목을 병렬 조회.
    //    예약을 지원하는 카테고리(현재는 Azure SQL Database 만)만 두 번째 호출.
    const reservationSupportedCategories = ['Azure SQL Database'];
    const supportsReservation = reservationSupportedCategories.includes(row.serviceCategory);

    const [cItems, rItems] = await Promise.all([
      apiFetch({ ...baseFilter, priceType: 'Consumption' }, cur, 200, 3),
      supportsReservation
        ? apiFetch({ ...baseFilter, priceType: 'Reservation' }, cur, 200, 3).catch(() => [])
        : Promise.resolve([]),
    ]);

    // 3) PAYG 후보 추리기:
    //    - type=Consumption 인 항목만
    //    - 카테고리별 매칭 함수 통과
    //    - Spot/LowPriority/DevTest 제외
    const isMatchingItem = _makeItemMatcher(row);

    const paygCandidates = cItems
      .filter(item => (item.type || '').toLowerCase() === 'consumption')
      .filter(item => isMatchingItem(item))
      .filter(item => _isStandardPriceItem(item));

    // 4) 가격 계층(tier)이 가장 낮은 것 우선 → 같은 tier 라면 단가가 더 싼 것 우선
    paygCandidates.sort((a, b) => {
      const tierA = Number(a.tierMinimumUnits || 0);
      const tierB = Number(b.tierMinimumUnits || 0);
      if (tierA !== tierB) return tierA - tierB;
      return Number(a.unitPrice || 0) - Number(b.unitPrice || 0);
    });

    const paygItem = paygCandidates[0] || null;

    // 5) 절약 플랜(SP1Y/SP3Y) 추출:
    //    1차로 PAYG 항목의 savingsPlan 에서 시도,
    //    못 찾으면 같은 매칭을 통과한 다른 항목들도 차례로 시도.
    const found = { sp1: null, sp3: null };
    _extractSavingsPlans(paygItem, found);

    if (!found.sp1 || !found.sp3) {
      for (const item of cItems) {
        if (item === paygItem) continue;
        if ((item.type || '').toLowerCase() !== 'consumption') continue;
        if (!isMatchingItem(item)) continue;
        if (!_isStandardPriceItem(item)) continue;

        _extractSavingsPlans(item, found);
        if (found.sp1 && found.sp3) break;
      }
    }

    // 6) 예약(RI1Y/RI3Y) 추출 후 시간당 단가로 정규화
    const ri1Raw = _findCheapestReservation(rItems, row, 1);
    const ri3Raw = _findCheapestReservation(rItems, row, 3);

    // 7) 행에 모든 가격 항목 반영
    row.paygItem = paygItem;
    row.sp1Item  = found.sp1;
    row.sp3Item  = found.sp3;
    row.ri1Item  = ri1Raw ? normalizeReservationPrice(ri1Raw, 1) : null;
    row.ri3Item  = ri3Raw ? normalizeReservationPrice(ri3Raw, 3) : null;

    // 8) 상태 메시지 갱신
    if (paygItem) {
      const tags         = _buildSuccessTags(row);
      const paygUnitText = Number(paygItem.unitPrice).toFixed(2);
      setStatus('ok', `${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${paygUnitText}/h`);
    } else {
      setStatus('error', `${row.skuName}: 매칭 없음 (${cItems.length}건)`);
    }
  } catch (err) {
    _clearPriceItems(row);
    setStatus('error', `API 실패: ${err.message.slice(0, 100)}`);
    console.error('조회실패:', err);
  }

  // 9) UI 동기화: 행 셀과 합계 행 갱신
  updatePriceCells(row);
  updateTotalsRow();
}
