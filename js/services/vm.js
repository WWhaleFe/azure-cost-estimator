// ================================================================
// services/vm.js — Virtual Machine
//
// 이 파일은 다음 세 가지를 등록합니다.
//   1) window._svcDefs['Virtual Machine']     — 카테고리 정의(옵션 목록 등)
//   2) VM_INSTANCE_CATALOG                    — 시리즈별 인스턴스 카탈로그(스펙)
//   3) window['_buildDetail_Virtual_Machine'] — 옵션 → skuName/detail 변환
//   4) window['_resolve_Virtual_Machine']     — 시간당 가격 5종(PAYG/SP1/SP3/RI1/RI3) 조회
//
// VM 가격은 OS 유형(Linux/Windows/RHEL/SUSE)과 라이선스 옵션에 따라
// 산정 방식이 달라지는 복잡한 비즈니스 로직을 포함합니다.
// 자세한 규칙은 _resolve_Virtual_Machine 함수의 주석에 정리했습니다.
// ================================================================

// ----------------------------------------------------------------
// 1) 카테고리 정의
// ----------------------------------------------------------------
window._svcDefs['Virtual Machine'] = {
  apiServiceName: 'Virtual Machines',
  steps: [
    { key: 'os',      label: '운영체제', options: ['Linux', 'Windows', 'Red Hat Enterprise Linux', 'SUSE'] },
    { key: 'tier',    label: 'Tier',     options: ['Standard', 'Spot'] },
    { key: 'license', label: '라이선스', options: ['라이선스 포함', 'Azure Hybrid Benefit'] },
    { key: 'series',  label: '시리즈',   options: [
      'B-series',
      'D-series v6', 'D-series v5', 'D-series v3',
      'Dl-series v6', 'Ds-series v6',
      'E-series v6', 'E-series v5',
      'F-series v2',
      'M-series',
      'N-series',
    ]},
  ],
  instanceField: true,
  instanceParentKey: 'series',
};

// ----------------------------------------------------------------
// 2) VM 인스턴스 카탈로그
//    시리즈별로 사용 가능한 인스턴스 타입과 스펙(vCPU 수, RAM GB)을 정의합니다.
//    UI 의 인스턴스 드롭다운에서 이 카탈로그를 그대로 사용합니다.
//
//    var 키워드 사용: 다른 파일(ui-and-bootstrap.js)이 전역으로 접근하기 위해서.
// ----------------------------------------------------------------
var VM_INSTANCE_CATALOG = window.VM_INSTANCE_CATALOG = {
  'B-series': [
    { name: 'B1s',   vCPU: 1,  ram: 1  },
    { name: 'B1ms',  vCPU: 1,  ram: 2  },
    { name: 'B2s',   vCPU: 2,  ram: 4  },
    { name: 'B2ms',  vCPU: 2,  ram: 8  },
    { name: 'B4ms',  vCPU: 4,  ram: 16 },
    { name: 'B8ms',  vCPU: 8,  ram: 32 },
    { name: 'B12ms', vCPU: 12, ram: 48 },
    { name: 'B16ms', vCPU: 16, ram: 64 },
    { name: 'B20ms', vCPU: 20, ram: 80 },
  ],
  'D-series v6': [
    { name: 'D2s_v6',  vCPU: 2,  ram: 8   },
    { name: 'D4s_v6',  vCPU: 4,  ram: 16  },
    { name: 'D8s_v6',  vCPU: 8,  ram: 32  },
    { name: 'D16s_v6', vCPU: 16, ram: 64  },
    { name: 'D32s_v6', vCPU: 32, ram: 128 },
    { name: 'D48s_v6', vCPU: 48, ram: 192 },
    { name: 'D64s_v6', vCPU: 64, ram: 256 },
    { name: 'D96s_v6', vCPU: 96, ram: 384 },
  ],
  'D-series v5': [
    { name: 'D2s_v5',  vCPU: 2,  ram: 8   },
    { name: 'D4s_v5',  vCPU: 4,  ram: 16  },
    { name: 'D8s_v5',  vCPU: 8,  ram: 32  },
    { name: 'D16s_v5', vCPU: 16, ram: 64  },
    { name: 'D32s_v5', vCPU: 32, ram: 128 },
    { name: 'D64s_v5', vCPU: 64, ram: 256 },
  ],
  'D-series v3': [
    { name: 'D2s_v3',  vCPU: 2,  ram: 8   },
    { name: 'D4s_v3',  vCPU: 4,  ram: 16  },
    { name: 'D8s_v3',  vCPU: 8,  ram: 32  },
    { name: 'D16s_v3', vCPU: 16, ram: 64  },
    { name: 'D32s_v3', vCPU: 32, ram: 128 },
    { name: 'D64s_v3', vCPU: 64, ram: 256 },
  ],
  'Dl-series v6': [
    { name: 'D2ls_v6',  vCPU: 2,  ram: 4   },
    { name: 'D4ls_v6',  vCPU: 4,  ram: 8   },
    { name: 'D8ls_v6',  vCPU: 8,  ram: 16  },
    { name: 'D16ls_v6', vCPU: 16, ram: 32  },
    { name: 'D32ls_v6', vCPU: 32, ram: 64  },
    { name: 'D64ls_v6', vCPU: 64, ram: 128 },
  ],
  'Ds-series v6': [
    { name: 'D2ds_v6',  vCPU: 2,  ram: 8   },
    { name: 'D4ds_v6',  vCPU: 4,  ram: 16  },
    { name: 'D8ds_v6',  vCPU: 8,  ram: 32  },
    { name: 'D16ds_v6', vCPU: 16, ram: 64  },
    { name: 'D32ds_v6', vCPU: 32, ram: 128 },
    { name: 'D64ds_v6', vCPU: 64, ram: 256 },
  ],
  'E-series v6': [
    { name: 'E2s_v6',  vCPU: 2,  ram: 16  },
    { name: 'E4s_v6',  vCPU: 4,  ram: 32  },
    { name: 'E8s_v6',  vCPU: 8,  ram: 64  },
    { name: 'E16s_v6', vCPU: 16, ram: 128 },
    { name: 'E32s_v6', vCPU: 32, ram: 256 },
    { name: 'E64s_v6', vCPU: 64, ram: 512 },
  ],
  'E-series v5': [
    { name: 'E2s_v5',  vCPU: 2,  ram: 16  },
    { name: 'E4s_v5',  vCPU: 4,  ram: 32  },
    { name: 'E8s_v5',  vCPU: 8,  ram: 64  },
    { name: 'E16s_v5', vCPU: 16, ram: 128 },
    { name: 'E32s_v5', vCPU: 32, ram: 256 },
    { name: 'E64s_v5', vCPU: 64, ram: 432 },
  ],
  'F-series v2': [
    { name: 'F2s_v2',  vCPU: 2,  ram: 4   },
    { name: 'F4s_v2',  vCPU: 4,  ram: 8   },
    { name: 'F8s_v2',  vCPU: 8,  ram: 16  },
    { name: 'F16s_v2', vCPU: 16, ram: 32  },
    { name: 'F32s_v2', vCPU: 32, ram: 64  },
    { name: 'F64s_v2', vCPU: 64, ram: 128 },
  ],
  'M-series': [
    { name: 'M8ms',  vCPU: 8,  ram: 218.75 },
    { name: 'M16ms', vCPU: 16, ram: 437.5  },
    { name: 'M32ms', vCPU: 32, ram: 875    },
    { name: 'M64ms', vCPU: 64, ram: 1750   },
  ],
  'N-series': [
    { name: 'NC4as_T4_v3',  vCPU: 4,  ram: 28  },
    { name: 'NC8as_T4_v3',  vCPU: 8,  ram: 56  },
    { name: 'NC16as_T4_v3', vCPU: 16, ram: 110 },
    { name: 'NC64as_T4_v3', vCPU: 64, ram: 440 },
  ],
};

// ----------------------------------------------------------------
// 3) detail 빌더 — 옵션 값을 사람이 읽기 좋은 문자열로 변환
// ----------------------------------------------------------------
window['_buildDetail_Virtual_Machine'] = function (r) {
  const o        = r.options;
  const instance = (VM_INSTANCE_CATALOG[o.series] || []).find(i => i.name === o.instance);

  r.skuName = o.instance || '';

  const parts = [];
  if (o.os)                                      parts.push(o.os);
  if (instance)                                  parts.push(`CPU:${instance.vCPU}core RAM:${instance.ram}GB`);
  if (o.tier && o.tier !== 'Standard')           parts.push(o.tier);
  // Linux 외(유료 OS) 인 경우에만 라이선스 옵션을 detail 에 표시
  if (o.os && o.os !== 'Linux' && o.license)     parts.push(o.license);

  r.detail = parts.join(', ');
};

// ================================================================
// 4) 가격 조회 — VM 전용 매칭 로직
//
// VM 가격은 다른 서비스와 달리 OS 와 라이선스 조합에 따라 분기가 많아
// 별도 _resolve_Virtual_Machine 함수를 사용합니다.
//
// === 가격 산정 규칙 ===
//
// (a) OS 별 가격
//     Azure API 는 동일 SKU(예: Standard_D2s_v3)에 대해
//     OS 종류만큼 별개의 가격 항목을 반환합니다.
//     productName 의 정규식 매칭으로 4개 그룹(Linux/Windows/RHEL/SUSE)으로 분류합니다.
//
// (b) 라이선스 가격 산출
//     "Windows 가격" = "Linux 가격" + "Windows 라이선스 비용"
//     이라는 가정에 따라, 라이선스 비용은 (OS 가격 − Linux 가격) 으로 계산합니다.
//     음수면 0 으로 보정합니다(드물지만 데이터 이상 시 보호).
//
// (c) 라이선스 옵션별 PAYG 단가
//     - Linux 선택:                        Linux 가격 그대로
//     - 유료 OS + "라이선스 포함" 선택:    해당 OS 가격 그대로
//     - 유료 OS + "Azure Hybrid Benefit":  Linux 가격으로 표시 (라이선스를 보유 중이라 가정)
//
// (d) 절약 플랜 / 예약은 항상 "Linux 기준" 으로 추출한 뒤,
//     유료 OS + 라이선스 포함인 경우에만 라이선스 비용을 시간당 더해서 표시합니다.
//
// (e) 매칭 시 다음을 제외합니다.
//     - DevTest 가격(type === 'devtestconsumption')
//     - Spot/Low Priority (Tier 가 Standard 인 경우)
//     - tierMinimumUnits 가 0 이 아닌 항목 (분량 할인 계층)
//     - unitOfMeasure 에 'hour' 가 들어가지 않는 항목
// ================================================================
window['_resolve_Virtual_Machine'] = async function (row, cur) {
  // --- VM 조회용 ARM SKU 이름. UI 에 표시되는 SKU 는 "D2s_v3", API 는 "Standard_D2s_v3" ---
  const armSkuName    = `Standard_${row.skuName}`;
  const baseFilter    = { serviceName: 'Virtual Machines', armRegionName: row.region, armSkuName: armSkuName };

  // --- 사용자 옵션 정리 ---
  const selectedOS      = row.options.os      || 'Linux';
  const selectedTier    = row.options.tier    || 'Standard';
  const selectedLicense = row.options.license || '라이선스 포함';
  const isAzureHybrid   = selectedLicense === 'Azure Hybrid Benefit';
  const isPaidOS        = selectedOS !== 'Linux';

  try {
    // --- API: Consumption(용량제) + Reservation(예약) 병렬 조회 ---
    const [cItems, rItems] = await Promise.all([
      apiFetch({ ...baseFilter, priceType: 'Consumption' }, cur, 200, 3),
      apiFetch({ ...baseFilter, priceType: 'Reservation' }, cur, 200, 3).catch(() => []),
    ]);

    // ============================================================
    // 헬퍼들: OS 판정 / Spot 판정 / 기본 매칭 / 최저가 선택
    // ============================================================
    const isWindows = (it) => /windows/i.test(it.productName || '');
    const isRHEL    = (it) => /red\s*hat/i.test(it.productName || '');
    const isSUSE    = (it) => /suse/i.test(it.productName || '');
    const isLinux   = (it) => !isWindows(it) && !isRHEL(it) && !isSUSE(it);

    const isSpotItem = (it) => {
      const sku   = (it.skuName     || '').toLowerCase();
      const meter = (it.meterName   || '').toLowerCase();
      const prod  = (it.productName || '').toLowerCase();
      return sku.includes('spot') || meter.includes('spot') ||
             sku.includes('low priority') || meter.includes('low priority') ||
             prod.includes('low priority');
    };

    const isDevTestItem = (it) => (it.type || '').toLowerCase() === 'devtestconsumption';

    // 표시 SKU 가 "D2s_v3" 형태인데 API 에 따라 "d2s v3" 같이 공백으로 들어오는 경우가 있어
    // 두 형태 모두 비교합니다.
    const matchesSku = (it) => {
      const lowerSku           = row.skuName.toLowerCase();
      const lowerSkuWithSpace  = lowerSku.replace(/_/g, ' ');
      const itemSku            = (it.skuName   || '').toLowerCase();
      const itemMeter          = (it.meterName || '').toLowerCase();
      return itemSku   === lowerSku || itemSku   === lowerSkuWithSpace ||
             itemMeter === lowerSku || itemMeter === lowerSkuWithSpace;
    };

    // 한 항목이 "정상적인 PAYG 후보" 인지 판정.
    // VM 의 5개 조건(Consumption, SKU 일치, DevTest 아님, Tier 일치, 시간당, tier 0) 모두 통과해야 함.
    const isValidPaygCandidate = (it) => {
      if ((it.type || '').toLowerCase() !== 'consumption') return false;
      if (it.armSkuName !== armSkuName)                    return false;
      if (!matchesSku(it))                                 return false;
      if (isDevTestItem(it))                               return false;

      // Tier 가 Spot 인지 Standard 인지에 따라 Spot 여부가 일치해야 함
      const itemIsSpot = isSpotItem(it);
      if (selectedTier === 'Spot' && !itemIsSpot) return false;
      if (selectedTier !== 'Spot' &&  itemIsSpot) return false;

      // 시간당 단가만 사용
      if (!(it.unitOfMeasure || '').toLowerCase().includes('hour')) return false;

      // tierMinimumUnits 가 0 (가장 기본 계층) 만 사용
      if (Number(it.tierMinimumUnits || 0) !== 0) return false;

      return true;
    };

    const pickCheapest = (arr) => {
      arr.sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
      return arr[0] || null;
    };

    // ============================================================
    // 4 OS 별 가장 싼 항목 한 개씩 추출
    // ============================================================
    const linuxItem   = pickCheapest(cItems.filter(it => isValidPaygCandidate(it) && isLinux(it)));
    const windowsItem = pickCheapest(cItems.filter(it => isValidPaygCandidate(it) && isWindows(it)));
    const rhelItem    = pickCheapest(cItems.filter(it => isValidPaygCandidate(it) && isRHEL(it)));
    const suseItem    = pickCheapest(cItems.filter(it => isValidPaygCandidate(it) && isSUSE(it)));

    // 사용자가 선택한 OS 에 해당하는 항목
    let selectedOSItem;
    if      (selectedOS === 'Linux')              selectedOSItem = linuxItem;
    else if (selectedOS === 'Windows')            selectedOSItem = windowsItem;
    else if (selectedOS.includes('Red Hat'))      selectedOSItem = rhelItem;
    else                                          selectedOSItem = suseItem;

    // ============================================================
    // 라이선스 비용 산출 (시간당)
    //   = OS 가격 − Linux 가격 (둘 다 존재할 때만, 양수일 때만)
    // ============================================================
    let hourlyLicenseFee = 0;
    if (isPaidOS && selectedOSItem && linuxItem) {
      const diff = Number(selectedOSItem.unitPrice) - Number(linuxItem.unitPrice);
      hourlyLicenseFee = diff > 0 ? diff : 0;
    }

    // ============================================================
    // PAYG 가격 결정
    //   - Linux:                 Linux 가격 그대로
    //   - 유료 OS + AHB:         Linux 가격 그대로 (마커만 _licenseMode='AHB')
    //   - 유료 OS + 라이선스 포함: OS 가격 그대로 (_licenseMode='License-included')
    // ============================================================
    let paygItem;
    if (!isPaidOS) {
      paygItem = linuxItem;
    } else if (isAzureHybrid) {
      paygItem = linuxItem ? { ...linuxItem, _licenseMode: 'AHB' } : null;
    } else {
      paygItem = selectedOSItem ? { ...selectedOSItem, _licenseMode: 'License-included' } : null;
    }

    // ============================================================
    // 절약 플랜 추출 (1년 / 3년)
    //   - 항상 Linux 항목의 savingsPlan 에서 먼저 시도
    //   - 못 찾으면 선택 OS 항목의 savingsPlan
    //   - 그래도 못 찾으면 base 매칭을 통과하는 다른 모든 항목에서 시도
    // ============================================================
    const found = { sp1: null, sp3: null };

    const extractSpFromItem = (item) => {
      if (!item || !Array.isArray(item.savingsPlan)) return;

      for (const sp of item.savingsPlan) {
        const term = String(sp.term || '').toLowerCase();
        const isOneYear   = term === '1 year' || term.startsWith('1 year') || term === '1' || term.startsWith('1 ');
        const isThreeYear = term === '3 year' || term === '3 years' || term.startsWith('3 year') || term === '3' || term.startsWith('3 ');

        if (!found.sp1 && isOneYear)   found.sp1 = makeSpItem(item, sp);
        if (!found.sp3 && isThreeYear) found.sp3 = makeSpItem(item, sp);
      }
    };

    extractSpFromItem(linuxItem);
    if (!found.sp1 || !found.sp3) extractSpFromItem(selectedOSItem);

    if (!found.sp1 || !found.sp3) {
      for (const it of cItems) {
        if (!isValidPaygCandidate(it)) continue;
        if (it === linuxItem || it === selectedOSItem) continue;
        extractSpFromItem(it);
        if (found.sp1 && found.sp3) break;
      }
    }

    // ============================================================
    // 라이선스 비용 가산 헬퍼
    //   - 유료 OS + 라이선스 포함인 경우, Linux 기반의 SP/RI 단가에
    //     시간당 라이선스 비용을 더해서 "최종 시간당 단가" 로 표시.
    //   - AHB / Linux 의 경우 그대로.
    // ============================================================
    const addLicenseFee = (item, licensePerHour) => {
      if (!item) return null;
      const baseHourly  = Number(item.unitPrice);
      const finalHourly = baseHourly + (licensePerHour > 0 ? licensePerHour : 0);
      return {
        ...item,
        unitPrice:       finalHourly,
        retailPrice:     finalHourly,
        _baseHourly:     baseHourly,
        _licenseHourly:  licensePerHour,
        _licenseMode:    isAzureHybrid ? 'AHB' : 'License-included',
      };
    };

    const shouldAddLicense = isPaidOS && !isAzureHybrid;
    const sp1Item = shouldAddLicense ? addLicenseFee(found.sp1, hourlyLicenseFee) : found.sp1;
    const sp3Item = shouldAddLicense ? addLicenseFee(found.sp3, hourlyLicenseFee) : found.sp3;

    // ============================================================
    // 예약(RI) 추출 + 시간당 단가로 정규화 + (필요 시) 라이선스 비용 가산
    // ============================================================
    const isReservationCandidate = (it) => {
      if ((it.type || '').toLowerCase() !== 'reservation') return false;
      if (it.armSkuName !== armSkuName)                    return false;
      if (Number(it.tierMinimumUnits || 0) !== 0)          return false;
      if (isSpotItem(it))                                  return false;
      if (!matchesSku(it))                                 return false;
      return true;
    };

    const validReservations = rItems.filter(isReservationCandidate);

    const ri1Candidates = validReservations
      .filter(it => /1\s*year/i.test(String(it.reservationTerm || '')))
      .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

    const ri3Candidates = validReservations
      .filter(it => /3\s*year/i.test(String(it.reservationTerm || '')))
      .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

    // 예약은 "총 N년치" 가격이므로, 시간당 단가로 환산.
    // years=1: 8760h, years=3: 26280h
    const toHourlyReservation = (item, years) => {
      if (!item) return null;
      const totalPrice = Number(item.unitPrice);
      if (!isFinite(totalPrice) || totalPrice <= 0) return null;
      const hourlyPrice = totalPrice / (years * 8760);
      return {
        ...item,
        unitPrice:          hourlyPrice,
        retailPrice:        hourlyPrice,
        unitOfMeasure:      '1 Hour (normalized)',
        _originalUnitPrice: totalPrice,
        _termYears:         years,
      };
    };

    const ri1Normalized = toHourlyReservation(ri1Candidates[0] || null, 1);
    const ri3Normalized = toHourlyReservation(ri3Candidates[0] || null, 3);

    const ri1Item = shouldAddLicense ? addLicenseFee(ri1Normalized, hourlyLicenseFee) : ri1Normalized;
    const ri3Item = shouldAddLicense ? addLicenseFee(ri3Normalized, hourlyLicenseFee) : ri3Normalized;

    // ============================================================
    // 행에 모든 가격 항목 반영
    // ============================================================
    row.paygItem = paygItem;
    row.sp1Item  = sp1Item;
    row.sp3Item  = sp3Item;
    row.ri1Item  = ri1Item;
    row.ri3Item  = ri3Item;

    // 상태 메시지에 어떤 그룹까지 매칭됐는지 태그로 표시
    if (paygItem) {
      const tags = ['PAYG'];
      if (sp1Item) tags.push('SP1Y');
      if (sp3Item) tags.push('SP3Y');
      if (ri1Item) tags.push('RI1Y');
      if (ri3Item) tags.push('RI3Y');
      const paygUnitText = Number(paygItem.unitPrice).toFixed(4);
      setStatus('ok', `${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${paygUnitText}/h`);
    } else {
      setStatus('error', `${row.skuName}: 매칭 없음 (${cItems.length}건)`);
    }
  } catch (err) {
    row.paygItem = null;
    row.sp1Item  = null;
    row.sp3Item  = null;
    row.ri1Item  = null;
    row.ri3Item  = null;
    setStatus('error', `API 실패: ${err.message.slice(0, 100)}`);
    console.error('VM:', err);
  }

  updatePriceCells(row);
  updateTotalsRow();
};
