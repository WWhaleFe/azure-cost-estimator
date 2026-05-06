function buildSkuAndDetail(r) {
  const def = SERVICE_CATEGORIES[r.serviceCategory];
  if (!def) return;
  const o = r.options;
  if (r.serviceCategory === 'Virtual Machine') {
    r.skuName = o.instance || '';
    const inst = (VM_INSTANCE_CATALOG[o.series] || []).find(i => i.name === o.instance);
    const parts = [];
    if (o.os) parts.push(o.os);
    if (inst) parts.push(`CPU: ${inst.vCPU} core, RAM: ${inst.ram}GB`);
    if (o.tier && o.tier !== 'Standard') parts.push(o.tier);
    // 라이선스: Windows / RHEL / SUSE 등 유료 OS일 때만 의미가 있음. Linux는 표기 생략.
    const isPaidOs = o.os && o.os !== 'Linux';
    if (isPaidOs && o.license) parts.push(o.license);
    r.detail = parts.join(', ');
  } else if (r.serviceCategory === 'Storage') {
    r.skuName = o.instance || '';
    const disk = (DISK_CATALOG[o.storageType] || []).find(d => d.name === o.instance);
    const parts = [];
    if (o.storageType) parts.push(o.storageType);
    if (disk) parts.push(`${disk.size}GB`);
    if (o.redundancy) parts.push(o.redundancy);
    // 트랜잭션 단위 (10,000 단위) 0이면 표기 생략
    const tx = Number(o.transactionUnits || 0);
    if (tx > 0) parts.push(`트랜잭션 ${tx.toLocaleString()}×10K`);
    r.detail = parts.join(', ');
  } else if (r.serviceCategory === 'Azure Files') {
    r.skuName = `${o.fileTier || ''} ${o.redundancy || ''}`.trim();
    r.detail = [o.fileTier, o.redundancy, o.metric].filter(Boolean).join(', ');
  } else if (r.serviceCategory === 'Blob Storage') {
    r.skuName = `${o.blobTier || ''} ${o.redundancy || ''}`.trim();
    r.detail = [o.blobTier, o.redundancy, o.metric].filter(Boolean).join(', ');
  } else if (r.serviceCategory === 'VPN Gateway') {
    r.skuName = o.sku || '';
    const parts = [];
    if (o.sku) parts.push(o.sku);
    const gh = (o.gatewayHours !== undefined && o.gatewayHours !== '') ? Number(o.gatewayHours) : 730;
    parts.push(`GW ${gh}h`);
    const eS2s = Number(o.extraS2sTunnels || 0);
    const eP2s = Number(o.extraP2sConnections || 0);
    const vnet = Number(o.vnetGB || 0);
    if (eS2s > 0) parts.push(`S2S +${eS2s}`);
    if (eP2s > 0) parts.push(`P2S +${eP2s}`);
    if (vnet > 0) {
      const tt = o.vnetTransferType || 'VNET 간';
      parts.push(`${tt} ${vnet}GB`);
    }
    r.detail = parts.join(', ');
  } else if (r.serviceCategory === 'Load Balancer') {
    r.skuName = o.tier || '';
    r.detail = `${o.tier || ''} - ${o.metric || ''}`.trim();
  } else if (r.serviceCategory === 'Application Gateway') {
    r.skuName = o.sku || '';
    r.detail = o.sku || '';
  } else if (r.serviceCategory === 'Public IP') {
    r.skuName = `${o.sku || ''} ${o.ipType || ''}`.trim();
    r.detail = `${o.sku || ''} ${o.ipType || ''} IP`.trim();
  } else if (r.serviceCategory === 'Azure Firewall') {
    r.skuName = o.tier || '';
    r.detail = `${o.tier || ''} - ${o.metric || ''}`.trim();
  } else if (r.serviceCategory === 'Bandwidth') {
    r.skuName = o.direction || '';
    r.detail = o.direction || '';
  } else if (r.serviceCategory === 'Azure SQL Database') {
    r.skuName = `${o.tier || ''} ${o.compute || ''}`.trim();
    r.detail = [o.tier, o.compute, o.hardware].filter(Boolean).join(', ');
  } else if (r.serviceCategory === 'Azure Database for MySQL') {
    r.skuName = o.compute || '';
    r.detail = `${o.tier || ''} - ${o.compute || ''}`.trim();
  } else if (r.serviceCategory === 'App Service') {
    r.skuName = o.size || '';
    r.detail = `${o.tier || ''} - ${o.os || ''} - ${o.size || ''}`.trim();
  } else if (r.serviceCategory === 'Azure Bastion') {
    r.skuName = o.tier || '';
    r.detail = `Azure Bastion ${o.tier || ''}`.trim();
  } else if (r.serviceCategory === 'NAT Gateway') {
    r.skuName = 'NAT Gateway';
    r.detail = `NAT Gateway - ${o.metric || ''}`.trim();
  } else {
    const vals = def.steps.map(s => o[s.key]).filter(Boolean);
    r.skuName = vals[0] || '';
    r.detail = vals.join(', ');
  }
}

/**
 * 가격 조회 (5종)
 *
 * 핵심 사실:
 * - Consumption: type='Consumption', productName에 OS 표기 (예: "...Series Windows", "...Series")
 *   - savingsPlan 배열이 함께 들어옴 (있는 경우)
 * - Reservation: type='Reservation', productName에 OS 표기 없음 (대부분)
 *   - armSkuName은 PAYG와 동일 (Standard_D8s_v3 등)
 *   - **OS와 무관**하므로 OS 필터 적용 금지
 *   - reservationTerm: '1 Year' 또는 '3 Years'
 *
 * 일부 SKU는 Windows 전용 또는 Linux 전용 PAYG로 분리되어 있어, savingsPlan이 한쪽에만 있을 수 있음
 * → Linux 항목과 Windows 항목 둘 다 검사하여 둘 중 하나에 SP가 있으면 사용
 */
/**
 * Virtual Machine 가격 조회 전용 함수
 *
 * 정확한 매칭을 위한 단계:
 * 1) armSkuName 정확 매칭 (예: Standard_D8s_v3)
 * 2) Consumption type만 사용 (Reservation 별도 호출)
 * 3) Spot/Low Priority/DevTest 제외
 * 4) OS는 productName으로 판별: Linux는 'windows/red hat/suse' 미포함, Windows는 'windows' 포함
 * 5) PAYG는 같은 SKU/OS 후보 중 unitPrice 가장 낮은 항목 (표준 가격)
 * 6) Reservation: armSkuName 매칭, term별 unitPrice 가장 낮은 항목
 * 7) RI 단가는 unitPrice가 약정 총액인지 판단해서 시간당으로 환산
 *    - unitPrice > 100 (USD 기준) 이거나 retailPrice가 unitPrice의 1/8000 미만 → 약정 총액
 *    - 그 외 → 시간당 단가
 * 8) Savings Plan: PAYG 항목의 savingsPlan 배열에서 추출 (1 Year / 3 Years)
 */
/**
 * Virtual Machine 가격 조회 (Azure Pricing Calculator 매칭 로직 + 라이선스 옵션)
 *
 * Azure Retail Prices API 핵심 사실:
 * ─────────────────────────────────────────────────────────────
 * 1) PAYG (priceType='Consumption')
 *    - unitPrice: 시간당 단가
 *    - unitOfMeasure: "1 Hour"
 *    - productName: OS 표기
 *      · Linux  → OS 표기 없음 (예: "Virtual Machines Esv6 Series")
 *      · Windows → "...Windows" 포함
 *      · RHEL   → "Red Hat" 포함
 *      · SUSE   → "SUSE" 포함
 *    - savingsPlan[]: 시간당 SP 단가 배열
 *
 * 2) Reservation (priceType='Reservation')
 *    - unitPrice: 약정 기간 전체 일시불 총액
 *    - 시간당 환산: unitPrice ÷ (years × 8760)
 *    - **인프라 비용만 커버** (Windows/RHEL/SUSE 라이선스 별도)
 *
 * 3) Savings Plan
 *    - unitPrice: 이미 시간당 단가
 *    - PAYG 항목의 savingsPlan 배열에서 추출
 *    - **인프라 비용만 커버**
 *
 * 4) 라이선스 옵션 동작 (Azure Pricing Calculator 매칭)
 *    a) Linux: 라이선스 옵션 무관, 모든 가격이 인프라만
 *    b) Windows + "라이선스 포함":
 *       - PAYG: Windows 포함 단가 (productName이 "...Windows" 항목)
 *       - SP/RI: Linux 인프라 단가 + Windows 라이선스 시간당 단가 가산
 *       - Windows 라이선스 시간당 = (Windows PAYG 시간당) − (Linux PAYG 시간당)
 *    c) Windows + "Azure Hybrid Benefit":
 *       - PAYG: Linux 인프라 단가와 동일 (라이선스 비용 없음)
 *       - SP/RI: Linux 인프라 단가 그대로 (라이선스 가산 없음)
 *    d) RHEL / SUSE도 Windows와 유사한 모델 (단, AHB는 Microsoft Q&A 답변에서
 *       confirmed by RH/SUSE 라이선스 모델은 별도 운영 → 본 시뮬레이터에서는
 *       Windows 룰을 동일하게 적용. 정확도가 더 필요할 경우 별도 미터 조회 필요)
 */
async function resolveVmPrices(row, currencyCode) {
  const armSku = `Standard_${row.skuName}`;
  const baseFilter = {
    serviceName: 'Virtual Machines',
    armRegionName: row.region,
    armSkuName: armSku,
  };

  try {
    // (1) Consumption 호출 - PAYG + Savings Plan (모든 OS variant 포함)
    const consumptionItems = await apiFetch(
      { ...baseFilter, priceType: 'Consumption' },
      currencyCode, 200, 3
    );

    // (2) Reservation 호출 - RI 1Y / 3Y (OS 무관, 인프라만)
    let reservationItems = [];
    try {
      reservationItems = await apiFetch(
        { ...baseFilter, priceType: 'Reservation' },
        currencyCode, 200, 3
      );
    } catch (e) { /* RI 미지원 SKU */ }

    // ============================================================
    // 헬퍼: OS 판별 (productName 기반)
    // ============================================================
    const isWindows = (it) => /windows/i.test(it.productName || '');
    const isRHEL    = (it) => /red\s*hat/i.test(it.productName || '');
    const isSUSE    = (it) => /suse/i.test(it.productName || '');
    const isLinux   = (it) => !isWindows(it) && !isRHEL(it) && !isSUSE(it);

    const isSpotOrLowPri = (it) => {
      const sku   = (it.skuName    || '').toLowerCase();
      const meter = (it.meterName  || '').toLowerCase();
      const pn    = (it.productName|| '').toLowerCase();
      return sku.includes('spot') || meter.includes('spot') ||
             sku.includes('low priority') || meter.includes('low priority') ||
             pn.includes('low priority');
    };

    const isDevTest = (it) => (it.type || '').toLowerCase() === 'devtestconsumption';

    const skuExactMatch = (it) => {
      const target1 = row.skuName.toLowerCase();
      const target2 = row.skuName.toLowerCase().replace(/_/g, ' ');
      const sku   = (it.skuName   || '').toLowerCase();
      const meter = (it.meterName || '').toLowerCase();
      return sku === target1 || sku === target2 ||
             meter === target1 || meter === target2;
    };

    // ============================================================
    // 사용자 옵션
    // ============================================================
    const osChoice = row.options.os || 'Linux';
    const tierChoice = row.options.tier || 'Standard';
    const licenseChoice = row.options.license || '라이선스 포함';
    const isAHB = (licenseChoice === 'Azure Hybrid Benefit');
    const isPaidOs = (osChoice !== 'Linux'); // Windows/RHEL/SUSE → 라이선스 분리 의미 있음

    // ============================================================
    // 공통 PAYG 후보 필터 (OS 미지정)
    // ============================================================
    const baseConsumptionFilter = (it) => {
      if ((it.type || '').toLowerCase() !== 'consumption') return false;
      if (it.armSkuName !== armSku) return false;
      if (!skuExactMatch(it)) return false;
      if (isDevTest(it)) return false;
      if (tierChoice === 'Spot') {
        if (!isSpotOrLowPri(it)) return false;
      } else {
        if (isSpotOrLowPri(it)) return false;
      }
      const uom = (it.unitOfMeasure || '').toLowerCase();
      if (!uom.includes('hour')) return false;
      if (Number(it.tierMinimumUnits || 0) !== 0) return false;
      return true;
    };

    // OS별 PAYG 단가 후보 (가장 낮은 단가 1건씩)
    const pickLowest = (arr) => {
      arr.sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
      return arr[0] || null;
    };
    const linuxPayg   = pickLowest(consumptionItems.filter(it => baseConsumptionFilter(it) && isLinux(it)));
    const windowsPayg = pickLowest(consumptionItems.filter(it => baseConsumptionFilter(it) && isWindows(it)));
    const rhelPayg    = pickLowest(consumptionItems.filter(it => baseConsumptionFilter(it) && isRHEL(it)));
    const susePayg    = pickLowest(consumptionItems.filter(it => baseConsumptionFilter(it) && isSUSE(it)));

    // ============================================================
    // 사용자가 선택한 OS의 PAYG 항목 (Windows 포함 가격)
    // ============================================================
    let paygOsIncluded = null;
    if (osChoice === 'Linux') paygOsIncluded = linuxPayg;
    else if (osChoice === 'Windows') paygOsIncluded = windowsPayg;
    else if (osChoice.includes('Red Hat')) paygOsIncluded = rhelPayg;
    else if (osChoice === 'SUSE') paygOsIncluded = susePayg;

    // ============================================================
    // 라이선스 시간당 단가 계산
    // = (사용자 OS PAYG) - (Linux PAYG)
    // Linux PAYG가 없으면 0으로 처리 (가산 없음)
    // ============================================================
    let licenseHourly = 0;
    if (isPaidOs && paygOsIncluded && linuxPayg) {
      const diff = Number(paygOsIncluded.unitPrice) - Number(linuxPayg.unitPrice);
      licenseHourly = diff > 0 ? diff : 0;
    }

    // ============================================================
    // 최종 PAYG 결정
    // - Linux: linuxPayg 그대로
    // - Windows/RHEL/SUSE + 라이선스 포함: 해당 OS PAYG (Windows 포함 가격)
    // - Windows/RHEL/SUSE + AHB: linuxPayg와 동일 (인프라만)
    // ============================================================
    let payg;
    if (!isPaidOs) {
      payg = linuxPayg;
    } else if (isAHB) {
      // AHB: 인프라만 → Linux 단가 사용 (단 productName/SKU 표기는 사용자 OS로 유지)
      payg = linuxPayg ? {
        ...linuxPayg,
        _ahbAppliedFrom: paygOsIncluded ? paygOsIncluded.productName : null,
        _licenseMode: 'AHB',
      } : null;
    } else {
      // 라이선스 포함
      payg = paygOsIncluded ? {
        ...paygOsIncluded,
        _licenseMode: 'License-included',
      } : null;
    }

    // ============================================================
    // Savings Plan 추출
    // - SP는 OS 무관 (인프라만), 사용 가능한 항목 어디서든 추출 가능
    // - 라이선스 포함 시: SP 단가 + 라이선스 시간당 단가
    // - AHB 시: SP 단가만 (라이선스 가산 없음)
    // ============================================================
    let sp1Base = null, sp3Base = null;
    const extractSp = (item) => {
      if (!item || !Array.isArray(item.savingsPlan)) return;
      for (const sp of item.savingsPlan) {
        const term = String(sp.term || '').toLowerCase();
        if (!sp1Base && (term === '1 year' || term.startsWith('1 year') || term === '1' || term.startsWith('1 '))) {
          sp1Base = makeSpItem(item, sp);
        } else if (!sp3Base && (term === '3 year' || term === '3 years' || term.startsWith('3 year') || term === '3' || term.startsWith('3 '))) {
          sp3Base = makeSpItem(item, sp);
        }
      }
    };
    // SP는 인프라만 → Linux 항목에서 우선 추출 (Linux 항목에 모든 SP 단가 포함되어 있음)
    extractSp(linuxPayg);
    if (!sp1Base || !sp3Base) extractSp(paygOsIncluded);
    if (!sp1Base || !sp3Base) {
      // 폴백: 같은 SKU의 모든 Consumption 항목에서 추출
      for (const it of consumptionItems) {
        if (!baseConsumptionFilter(it)) continue;
        if (it === linuxPayg || it === paygOsIncluded) continue;
        extractSp(it);
        if (sp1Base && sp3Base) break;
      }
    }

    const addLicenseToHourly = (baseItem, licPerHour) => {
      if (!baseItem) return null;
      const baseHourly = Number(baseItem.unitPrice);
      const total = baseHourly + (licPerHour > 0 ? licPerHour : 0);
      return {
        ...baseItem,
        unitPrice: total,
        retailPrice: total,
        _baseHourly: baseHourly,
        _licenseHourly: licPerHour,
        _licenseMode: isAHB ? 'AHB' : 'License-included',
      };
    };

    const sp1 = (isPaidOs && !isAHB) ? addLicenseToHourly(sp1Base, licenseHourly) : sp1Base;
    const sp3 = (isPaidOs && !isAHB) ? addLicenseToHourly(sp3Base, licenseHourly) : sp3Base;

    // ============================================================
    // Reservation 후보 (1Y / 3Y) - OS 무관, 인프라만
    // ============================================================
    const riAll = reservationItems.filter(it => {
      if ((it.type || '').toLowerCase() !== 'reservation') return false;
      if (it.armSkuName !== armSku) return false;
      if (Number(it.tierMinimumUnits || 0) !== 0) return false;
      if (isSpotOrLowPri(it)) return false;
      if (!skuExactMatch(it)) return false;
      return true;
    });

    const ri1Cands = riAll
      .filter(it => /1\s*year/i.test(String(it.reservationTerm || '')))
      .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
    const ri3Cands = riAll
      .filter(it => /3\s*year/i.test(String(it.reservationTerm || '')))
      .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

    // RI 단가 정규화: 약정 총액 → 시간당 (1Y ÷ 8760, 3Y ÷ 26280)
    const normalizeRi = (item, years) => {
      if (!item) return null;
      const total = Number(item.unitPrice);
      if (!isFinite(total) || total <= 0) return null;
      const hourly = total / (years * 8760);
      return {
        ...item,
        unitPrice: hourly,
        retailPrice: hourly,
        unitOfMeasure: '1 Hour (normalized)',
        _originalUnitPrice: total,
        _termYears: years,
      };
    };

    const ri1Base = normalizeRi(ri1Cands[0] || null, 1);
    const ri3Base = normalizeRi(ri3Cands[0] || null, 3);

    // 라이선스 포함이면 시간당 라이선스 단가 가산
    const ri1Item = (isPaidOs && !isAHB) ? addLicenseToHourly(ri1Base, licenseHourly) : ri1Base;
    const ri3Item = (isPaidOs && !isAHB) ? addLicenseToHourly(ri3Base, licenseHourly) : ri3Base;

    // ============================================================
    // 결과 저장
    // ============================================================
    row.paygItem = payg;
    row.sp1Item = sp1;
    row.sp3Item = sp3;
    row.ri1Item = ri1Item;
    row.ri3Item = ri3Item;

    // ============================================================
    // 디버그 콘솔 출력
    // ============================================================
    console.group(`[VM] ${row.skuName} / OS=${osChoice} / License=${licenseChoice} / ${row.region} / ${currencyCode}`);
    console.log(`Cons:${consumptionItems.length} / Res:${reservationItems.length}`);
    console.log(`Linux PAYG:   ${linuxPayg   ? linuxPayg.unitPrice   + '/h' : '없음'}`);
    console.log(`Windows PAYG: ${windowsPayg ? windowsPayg.unitPrice + '/h' : '없음'}`);
    console.log(`RHEL PAYG:    ${rhelPayg    ? rhelPayg.unitPrice    + '/h' : '없음'}`);
    console.log(`SUSE PAYG:    ${susePayg    ? susePayg.unitPrice    + '/h' : '없음'}`);
    if (isPaidOs) {
      console.log(`라이선스 시간당 단가 (${osChoice} - Linux) = ${licenseHourly}`);
      console.log(`라이선스 모드: ${isAHB ? 'Azure Hybrid Benefit (라이선스 면제)' : '라이선스 포함 (RI/SP에 가산)'}`);
    }
    if (payg) console.log(`✓ PAYG 최종: ${payg.unitPrice}/h`);
    if (sp1)  console.log(`✓ SP 1Y 최종: ${sp1.unitPrice}/h${sp1._licenseHourly ? ` (인프라 ${sp1._baseHourly} + 라이선스 ${sp1._licenseHourly})` : ''}`);
    if (sp3)  console.log(`✓ SP 3Y 최종: ${sp3.unitPrice}/h${sp3._licenseHourly ? ` (인프라 ${sp3._baseHourly} + 라이선스 ${sp3._licenseHourly})` : ''}`);
    if (ri1Item) console.log(`✓ RI 1Y 최종: ${ri1Item.unitPrice}/h${ri1Item._licenseHourly ? ` (인프라 ${ri1Item._baseHourly} + 라이선스 ${ri1Item._licenseHourly})` : ''}`);
    if (ri3Item) console.log(`✓ RI 3Y 최종: ${ri3Item.unitPrice}/h${ri3Item._licenseHourly ? ` (인프라 ${ri3Item._baseHourly} + 라이선스 ${ri3Item._licenseHourly})` : ''}`);
    console.groupEnd();

    if (payg) {
      const tags = ['PAYG'];
      if (sp1) tags.push('SP1Y');
      if (sp3) tags.push('SP3Y');
      if (ri1Item) tags.push('RI1Y');
      if (ri3Item) tags.push('RI3Y');
      const licTag = isPaidOs ? (isAHB ? ' · AHB' : ' · 라이선스포함') : '';
      const priceInfo = `PAYG ${Number(payg.unitPrice).toFixed(4)}/h${licTag}`;
      const debugInfo = `Cons:${consumptionItems.length}/Res:${reservationItems.length}`;
      setStatus('ok', `${row.skuName} 완료 [${tags.join(', ')}] · ${priceInfo} · ${debugInfo}`);
    } else {
      setStatus('error', `${row.skuName}: 매칭 항목 없음 (응답 ${consumptionItems.length}건) - F12 콘솔 확인`);
    }
  } catch (err) {
    row.paygItem = null; row.sp1Item = null; row.sp3Item = null;
    row.ri1Item = null; row.ri3Item = null;
    setStatus('error', `API 호출 실패: ${err.message.slice(0, 100)}`);
    console.error('VM 가격 조회 실패:', err);
  }
  updatePriceCells(row);
  updateTotalsRow();
}

/**
 * Storage (Managed Disks) 가격 조회
 *
 * Azure Pricing Calculator의 Managed Disks 화면 구조:
 * - 디스크 단가: 월 단위 정액 (P10, P20, S30, E10 등 SKU별)
 *   · unitOfMeasure: "1/Month"
 *   · skuName: "P10 LRS", "E10 LRS", "S10 LRS" 등
 * - Storage 트랜잭션 단가: 10,000 IO 단위 (Standard SSD/HDD에만 적용)
 *   · unitOfMeasure: "10K"
 *   · meterName: "...Disk Operations" / "...Operations" 등
 *   · Premium SSD는 IOPS가 prov되어 있어서 별도 트랜잭션 비용 없음
 *
 * Managed Disk는 Reservation/Savings Plan 미지원 → PAYG만 채움
 */
async function resolveStoragePrices(row, currencyCode) {
  const o = row.options || {};
  const storageType = o.storageType || 'Premium SSD Managed Disks';
  const redundancy = o.redundancy || 'LRS';
  const txUnits = Number(o.transactionUnits || 0); // 10K 단위 수
  const skuFull = `${row.skuName} ${redundancy}`; // 예: "E6 LRS"

  try {
    // (1) 디스크 단가 조회 (productName + region + Consumption)
    // - skuName 필터까지 걸면 정확하게 1건만 잡힘
    // - 응답에는 디스크 외 mount fee, burst enablement 등 부속 미터가 함께 올 수 있음
    const diskItems = await apiFetch(
      {
        serviceName: 'Storage',
        armRegionName: row.region,
        productName: storageType,
        skuName: skuFull,
        priceType: 'Consumption',
      },
      currencyCode, 100, 2
    );

    // 디스크 단가 매칭 규칙 (정확도 ↑):
    // - meterName 끝에 정확히 "Disk" 포함 (예: "E6 LRS Disk", "P10 LRS Disk")
    // - meterName이 사용자 SKU + 중복성으로 시작
    // - unitOfMeasure: "1/Month"
    // - "Mount", "Burst", "Enablement", "Snapshot" 등 부속 미터 배제
    const expectedDiskMeter = `${row.skuName} ${redundancy} Disk`.toLowerCase();
    const isPlainDisk = (it) => {
      const meter = (it.meterName || '').toLowerCase();
      // mount fee, burst, enablement, snapshot 부속 미터 배제
      if (meter.includes('mount')) return false;
      if (meter.includes('burst')) return false;
      if (meter.includes('enablement')) return false;
      if (meter.includes('snapshot')) return false;
      if (meter.includes('one-time')) return false;
      return true;
    };

    const diskCands = diskItems.filter(it => {
      if ((it.type || '').toLowerCase() !== 'consumption') return false;
      const uom = (it.unitOfMeasure || '').toLowerCase();
      // 월 단가만 (1/month)
      if (!uom.includes('month')) return false;
      if (!isPlainDisk(it)) return false;
      const meter = (it.meterName || '').toLowerCase();
      // 메인 디스크 미터: "<skuName> <redundancy> Disk" 형태
      // 또는 fallback으로 skuName 일치 (meterName이 비표준일 경우)
      return meter === expectedDiskMeter ||
             meter.startsWith(`${row.skuName.toLowerCase()} ${redundancy.toLowerCase()}`);
    });
    // 정확 미터(`E6 LRS Disk`) > 시작 일치 순으로 정렬, 그 다음 unitPrice 낮은 순
    diskCands.sort((a, b) => {
      const aExact = (a.meterName || '').toLowerCase() === expectedDiskMeter ? 0 : 1;
      const bExact = (b.meterName || '').toLowerCase() === expectedDiskMeter ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return Number(a.unitPrice || 0) - Number(b.unitPrice || 0);
    });
    const disk = diskCands[0] || null;

    // (2) 트랜잭션 단가 조회 (Standard SSD/HDD에만 의미 있음. Premium SSD는 트랜잭션 무료)
    // - Azure API의 Standard SSD/HDD 트랜잭션 미터 형식이 다양함:
    //   · "E10 LRS Disk Operations" (디스크 SKU별로 별개)
    //   · "Standard SSD LRS Disk Operations" (전체 공통)
    //   · "Disk Operations" (간단형)
    // - unitOfMeasure에 "10K" 또는 "10,000" 포함되는 항목만 트랜잭션
    // - 대표적으로 가장 저렴한(=표준) 단가 1건 채택
    let txItem = null;
    let txItemsRaw = [];
    let allTxCands = [];
    if (storageType !== 'Premium SSD Managed Disks' && txUnits > 0) {
      txItemsRaw = await apiFetch(
        {
          serviceName: 'Storage',
          armRegionName: row.region,
          productName: storageType,
          priceType: 'Consumption',
        },
        currencyCode, 200, 3
      );
      // 1차: unitOfMeasure가 10K 단위인 항목 모두 수집 (트랜잭션 후보군)
      allTxCands = txItemsRaw.filter(it => {
        if ((it.type || '').toLowerCase() !== 'consumption') return false;
        const uom = (it.unitOfMeasure || '').toLowerCase();
        return uom.includes('10k') || uom.includes('10,000') || uom.includes('10000');
      });
      // 2차 매칭 (관대하게): redundancy 일치 + meter에 "operation" 포함
      let txCands = allTxCands.filter(it => {
        const meter = (it.meterName || '').toLowerCase();
        const sku = (it.skuName || '').toLowerCase();
        const redLow = redundancy.toLowerCase();
        const inMeter = meter.includes('operation') || meter.includes('transaction');
        const hasRed = meter.includes(redLow) || sku.includes(redLow);
        return inMeter && hasRed;
      });
      // 3차 폴백: redundancy 일치만이라도
      if (txCands.length === 0) {
        txCands = allTxCands.filter(it => {
          const meter = (it.meterName || '').toLowerCase();
          const sku = (it.skuName || '').toLowerCase();
          const redLow = redundancy.toLowerCase();
          return meter.includes(redLow) || sku.includes(redLow);
        });
      }
      // 4차 폴백: 그냥 첫 번째 10K 단위 항목
      if (txCands.length === 0) {
        txCands = allTxCands;
      }
      // 가장 저렴한 단가 = 표준 트랜잭션 가격
      txCands.sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
      txItem = txCands[0] || null;
    }

    // ============================================================
    // 월 비용 합산
    // - 표 모델은 "단가 × qty × 시간" → Storage는 월 정액이라 _billingMode='monthly' 별도 처리
    // - calcGroup이 _billingMode==='monthly' 이면 _monthlyTotal × qty 사용
    // ============================================================
    const usageHours = Number(row.usage) || 730;

    let monthly = 0;
    let breakdownParts = [];
    if (disk) {
      const diskMonthly = Number(disk.unitPrice);
      monthly += diskMonthly;
      breakdownParts.push(`Disk ${diskMonthly.toFixed(4)}/월`);
    }
    if (txItem && txUnits > 0) {
      const txMonthly = Number(txItem.unitPrice) * txUnits;
      monthly += txMonthly;
      breakdownParts.push(`Tx ${txItem.unitPrice}×${txUnits} = ${txMonthly.toFixed(4)}/월`);
    }

    // 시간당 등가 단가 계산 (qty/usage 곱셈에 맞추기 위해)
    const hourlyEquivalent = usageHours > 0 ? (monthly / usageHours) : 0;

    let payg = null;
    if (disk) {
      payg = {
        ...disk,
        unitPrice: hourlyEquivalent,
        retailPrice: hourlyEquivalent,
        unitOfMeasure: '1 Hour (equivalent from 1/Month)',
        _billingMode: 'monthly',
        _monthlyTotal: monthly,
        _diskMonthly: disk ? Number(disk.unitPrice) : 0,
        _txMonthly: txItem ? Number(txItem.unitPrice) * txUnits : 0,
        _txUnitPrice: txItem ? Number(txItem.unitPrice) : 0,
        _txUnits: txUnits,
        _totalMonthly: monthly,
      };
    }

    // ============================================================
    // RI 1Y 조회 (Premium SSD/Standard SSD/HDD는 1년 reserved capacity 지원)
    // - skuName: "P30 LRS Reserved Capacity" 같은 형태로 별도 항목으로 존재
    // - reservationTerm: "1 Year" (Storage는 3년 미지원이 일반적)
    // ============================================================
    let ri1Item = null;
    try {
      const reservationItems = await apiFetch(
        {
          serviceName: 'Storage',
          armRegionName: row.region,
          productName: storageType,
          priceType: 'Reservation',
        },
        currencyCode, 200, 2
      );
      const ri1Cands = reservationItems.filter(it => {
        if ((it.type || '').toLowerCase() !== 'reservation') return false;
        if (!/1\s*year/i.test(String(it.reservationTerm || ''))) return false;
        // skuName에 row.skuName(예: P30) 포함
        const sku = (it.skuName || '').toLowerCase();
        return sku.includes(row.skuName.toLowerCase()) && sku.includes(redundancy.toLowerCase());
      }).sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

      if (ri1Cands[0]) {
        // RI도 1년 약정 총액 → 월 단가 환산: total / 12
        // 그 후 시간당 등가 = 월 단가 / usage
        const total = Number(ri1Cands[0].unitPrice);
        const ri1Monthly = total / 12;
        // RI에는 트랜잭션 비용 가산 (RI는 디스크만 할인, 트랜잭션은 그대로)
        const ri1MonthlyTotal = ri1Monthly + (txItem && txUnits > 0 ? Number(txItem.unitPrice) * txUnits : 0);
        const ri1Hourly = usageHours > 0 ? ri1MonthlyTotal / usageHours : 0;
        ri1Item = {
          ...ri1Cands[0],
          unitPrice: ri1Hourly,
          retailPrice: ri1Hourly,
          unitOfMeasure: '1 Hour (equivalent)',
          _billingMode: 'monthly',
          _monthlyTotal: ri1MonthlyTotal,
          _originalUnitPrice: total,
          _termYears: 1,
          _diskMonthly: ri1Monthly,
          _txMonthly: txItem ? Number(txItem.unitPrice) * txUnits : 0,
          _totalMonthly: ri1MonthlyTotal,
        };
      }
    } catch (e) { /* RI 미지원 */ }

    // ============================================================
    // 결과 저장 (SP는 Storage 미지원, RI 3년도 일반적으로 미지원)
    // ============================================================
    row.paygItem = payg;
    row.sp1Item = null;
    row.sp3Item = null;
    row.ri1Item = ri1Item;
    row.ri3Item = null;

    // ============================================================
    // 디버그 콘솔 출력
    // ============================================================
    console.group(`[Storage] ${row.skuName} ${redundancy} / ${storageType} / tx=${txUnits} / ${row.region}`);
    console.log(`디스크 응답: ${diskItems.length}건 (필터: skuName=${skuFull}, productName=${storageType})`);
    if (diskItems.length > 0) {
      console.log(`└ 응답 항목:`);
      diskItems.forEach((it, i) => {
        console.log(`   [${i}] meter="${it.meterName}" / sku="${it.skuName}" / unitPrice=${it.unitPrice} ${it.currencyCode} / uom=${it.unitOfMeasure} / type=${it.type}`);
      });
    }
    console.log(`디스크 매칭: ${diskCands.length}건 (기대 미터: "${expectedDiskMeter}")`);
    if (disk) {
      console.log(`✓ 디스크 선택: meter="${disk.meterName}" / unitPrice=${disk.unitPrice} ${disk.currencyCode}/${disk.unitOfMeasure}`);
    } else {
      console.warn(`✗ 디스크 매칭 실패 — 응답에서 ${expectedDiskMeter} 미터가 없음. 응답을 위에서 확인하세요.`);
    }
    if (txUnits > 0 && storageType !== 'Premium SSD Managed Disks') {
      console.log(`트랜잭션 응답: ${txItemsRaw.length}건, 10K 단위 후보 ${allTxCands.length}건`);
      if (allTxCands.length > 0) {
        console.log(`└ 10K 단위 후보 항목 (모두):`);
        allTxCands.forEach((it, i) => {
          console.log(`   [${i}] meter="${it.meterName}" / sku="${it.skuName}" / unitPrice=${it.unitPrice} / uom=${it.unitOfMeasure}`);
        });
      }
      if (txItem) {
        console.log(`✓ 트랜잭션 선택: meter="${txItem.meterName}" / unitPrice=${txItem.unitPrice} ${txItem.currencyCode}/${txItem.unitOfMeasure} → × ${txUnits}단위 = ${(Number(txItem.unitPrice) * txUnits).toFixed(4)}/월`);
      } else {
        console.warn(`✗ 트랜잭션 매칭 실패 — 응답에 10K 단위 미터가 없음`);
      }
    }
    console.log(`월 비용 = ${breakdownParts.join(' + ')} = ${monthly.toFixed(4)}/월`);
    console.log(`표시용 시간당 등가 단가 = ${hourlyEquivalent.toFixed(8)}/h (= 월비용/${usageHours}h)`);
    if (ri1Item) console.log(`✓ RI 1Y: 약정총액 ${ri1Item._originalUnitPrice} → 디스크 월 ${ri1Item._diskMonthly.toFixed(4)} + Tx 월 ${ri1Item._txMonthly.toFixed(4)} = 총 ${ri1Item._totalMonthly.toFixed(4)}/월`);
    console.groupEnd();

    if (payg) {
      const tags = ['PAYG'];
      if (ri1Item) tags.push('RI1Y');
      const txInfo = txItem && txUnits > 0 ? ` + Tx${txUnits}×10K` : '';
      setStatus('ok', `${row.skuName} ${redundancy} 완료 [${tags.join(', ')}] · ${monthly.toFixed(2)}/월${txInfo}`);
    } else {
      setStatus('error', `${row.skuName} ${redundancy}: 디스크 매칭 실패 - F12 콘솔 확인`);
    }
  } catch (err) {
    row.paygItem = null; row.sp1Item = null; row.sp3Item = null;
    row.ri1Item = null; row.ri3Item = null;
    setStatus('error', `Storage 조회 실패: ${err.message.slice(0, 100)}`);
    console.error('Storage 가격 조회 실패:', err);
  }
  updatePriceCells(row);
  updateTotalsRow();
}


/**
 * VPN Gateway 가격 조회 (v30)
 *
 * v30 변경사항:
 * 1. 부분 실패 처리: 게이트웨이 / S2S / P2S / VNET 각각 독립 try-catch
 *    → VNET 매칭 실패해도 게이트웨이 가격은 정상 표시 (이전엔 전체 폐기)
 * 2. VNET 매칭 호출 비용 절감: 광범위 Bandwidth 호출 대신 좁은 필터 우선
 * 3. apiFetch 호출 시 expectedSizeKB 메타데이터 전달 (큰 호출은 큰 프록시 우선)
 *
 * Azure Pricing Calculator의 VPN Gateway 화면 구조:
 * 1) 게이트웨이 시간 (예: VpnGw3AZ ≈ ₩2,033.50/h)
 * 2) S2S 추가 터널 (기본 포함 분 초과, 시간/터널당)
 * 3) P2S 추가 연결 (기본 포함 분 초과, 시간/연결당)
 * 4) VNET 간 데이터 전송 (예: ₩132.62/GB, 시간 무관)
 *
 * VPN Gateway는 Reservation/Savings Plan 미지원 → PAYG만 채움
 */
async function resolveVpnGatewayPrices(row, currencyCode) {
  const o = row.options || {};
  const sku = o.sku || row.skuName || '';
  const gatewayHours = Number(o.gatewayHours !== undefined && o.gatewayHours !== '' ? o.gatewayHours : 730);
  const extraS2s = Number(o.extraS2sTunnels || 0);
  const extraP2s = Number(o.extraP2sConnections || 0);
  const vnetGB = Number(o.vnetGB || 0);

  // 결과 누적 (각 항목별 독립적으로)
  let allItems = [];          // VPN Gateway 응답
  let gateway = null;          // 게이트웨이 시간 단가 미터
  let s2sItem = null;          // S2S 추가 터널 미터
  let p2sItem = null;          // P2S 추가 연결 미터
  let vnetItem = null;         // VNET 데이터 전송 미터
  let gwCandsAll = [];         // 디버그용 후보 목록
  let s2sCandsAll = [];
  let p2sCandsAll = [];
  let vnetCandsAll = [];
  let vnetSearchSteps = [];    // 검색 단계 기록
  let errors = [];             // 부분 실패 누적

  // ============================================================
  // 1단계: VPN Gateway 응답 가져오기 (게이트웨이/S2S/P2S 매칭의 베이스)
  // ============================================================
  try {
    allItems = await apiFetch(
      {
        serviceName: 'VPN Gateway',
        armRegionName: row.region,
        priceType: 'Consumption',
      },
      currencyCode, 200, 3
    );
  } catch (err) {
    errors.push(`VPN Gateway 조회 실패: ${err.message}`);
    console.error('[VPN Gateway] 메인 API 호출 실패:', err);
    // 메인 API 실패 시 더 진행할 수 없으므로 종료
    row.paygItem = null;
    row.sp1Item = null;
    row.sp3Item = null;
    row.ri1Item = null;
    row.ri3Item = null;
    setStatus('error', `VPN Gateway 조회 실패: ${err.message.slice(0, 100)}`);
    updatePriceCells(row);
    updateTotalsRow();
    return;
  }

  const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  const skuNorm = normalize(sku);

  // ============================================================
  // 2단계: 게이트웨이 시간 단가 매칭 (VPN Gateway 응답 안에서)
  // ============================================================
  try {
    const isExtraMeter = (it) => {
      const meter = (it.meterName || '').toLowerCase();
      return meter.includes('tunnel') || meter.includes('s2s') ||
             meter.includes('p2s') || meter.includes('connection') ||
             meter.includes('data transfer') || meter.includes('inter-');
    };
    gwCandsAll = allItems.filter(it => {
      if ((it.type || '').toLowerCase() !== 'consumption') return false;
      const uom = (it.unitOfMeasure || '').toLowerCase();
      if (!uom.includes('hour')) return false;
      if (isExtraMeter(it)) return false;
      const mNorm = normalize(it.meterName);
      const sNorm = normalize(it.skuName);
      return mNorm === skuNorm || sNorm === skuNorm ||
             mNorm.startsWith(skuNorm) || sNorm.startsWith(skuNorm) ||
             mNorm.endsWith(skuNorm) || sNorm.endsWith(skuNorm);
    });
    gwCandsAll.sort((a, b) => {
      const aExact = (normalize(a.meterName) === skuNorm || normalize(a.skuName) === skuNorm) ? 0 : 1;
      const bExact = (normalize(b.meterName) === skuNorm || normalize(b.skuName) === skuNorm) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return Number(b.unitPrice || 0) - Number(a.unitPrice || 0);
    });
    gateway = gwCandsAll[0] || null;
  } catch (err) {
    errors.push(`게이트웨이 매칭 실패: ${err.message}`);
    console.error('[VPN Gateway] 게이트웨이 매칭 실패:', err);
  }

  // ============================================================
  // 3단계: S2S 추가 터널 단가 매칭 (extraS2s > 0인 경우만)
  // ============================================================
  if (extraS2s > 0) {
    try {
      s2sCandsAll = allItems.filter(it => {
        if ((it.type || '').toLowerCase() !== 'consumption') return false;
        const uom = (it.unitOfMeasure || '').toLowerCase();
        if (!uom.includes('hour')) return false;
        const meter = (it.meterName || '').toLowerCase();
        if (meter.includes('p2s') || meter.includes('point-to-site')) return false;
        return meter.includes('s2s') || meter.includes('site-to-site') ||
               meter.includes('tunnel');
      }).sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
      s2sItem = s2sCandsAll[0] || null;
    } catch (err) {
      errors.push(`S2S 매칭 실패: ${err.message}`);
      console.error('[VPN Gateway] S2S 매칭 실패:', err);
    }
  }

  // ============================================================
  // 4단계: P2S 추가 연결 단가 매칭 (extraP2s > 0인 경우만)
  // ============================================================
  if (extraP2s > 0) {
    try {
      p2sCandsAll = allItems.filter(it => {
        if ((it.type || '').toLowerCase() !== 'consumption') return false;
        const uom = (it.unitOfMeasure || '').toLowerCase();
        if (!uom.includes('hour')) return false;
        const meter = (it.meterName || '').toLowerCase();
        if (meter.includes('s2s') || meter.includes('site-to-site') || meter.includes('tunnel')) return false;
        return meter.includes('p2s') || meter.includes('point-to-site') ||
               meter.includes('connection');
      }).sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
      p2sItem = p2sCandsAll[0] || null;
    } catch (err) {
      errors.push(`P2S 매칭 실패: ${err.message}`);
      console.error('[VPN Gateway] P2S 매칭 실패:', err);
    }
  }

  // ============================================================
  // 5단계: VNET 데이터 전송 단가 매칭 (vnetGB > 0인 경우만)
  //   ★ 핵심 변경: 부분 실패 격리 + 좁은 필터 우선 + 광범위 폴백
  // ============================================================
  const ZONE_MAP = {
    eastus: 1, eastus2: 1, westus: 1, westus2: 1, westus3: 1,
    northcentralus: 1, southcentralus: 1, centralus: 1, westcentralus: 1,
    westeurope: 1, northeurope: 1, francecentral: 1, francesouth: 1,
    uksouth: 1, ukwest: 1, canadacentral: 1, canadaeast: 1,
    germanynorth: 1, germanywestcentral: 1, swedencentral: 1, swedensouth: 1,
    switzerlandnorth: 1, switzerlandwest: 1, norwayeast: 1, norwaywest: 1,
    polandcentral: 1, italynorth: 1, spaincentral: 1,
    koreacentral: 2, koreasouth: 2, japaneast: 2, japanwest: 2,
    eastasia: 2, southeastasia: 2,
    australiaeast: 2, australiasoutheast: 2, australiacentral: 2, australiacentral2: 2,
    centralindia: 2, southindia: 2, westindia: 2, qatarcentral: 2,
    brazilsouth: 3, brazilsoutheast: 3,
    southafricanorth: 3, southafricawest: 3,
    uaenorth: 3, uaecentral: 3, israelcentral: 3,
  };
  const userZone = ZONE_MAP[row.region] || 1;
  const transferType = o.vnetTransferType || 'VNET 간';

  const extractGbCands = (items) => items.filter(it => {
    if ((it.type || '').toLowerCase() !== 'consumption') return false;
    const uom = (it.unitOfMeasure || '').toLowerCase();
    if (!uom.includes('gb')) return false;
    if (uom.includes('hour')) return false;
    return true;
  });

  const isVnetOutbound = (it) => {
    const meter = (it.meterName || '').toLowerCase();
    const product = (it.productName || '').toLowerCase();
    const sku = (it.skuName || '').toLowerCase();
    const all = `${meter} ${product} ${sku}`;
    const hasInterVnet = all.includes('inter-virtual network') ||
                         all.includes('inter virtual network') ||
                         all.includes('inter-vnet') ||
                         all.includes('inter vnet') ||
                         all.includes('vnet to vnet') ||
                         all.includes('vnet-to-vnet') ||
                         all.includes('intervnet');
    const hasPeering = all.includes('peering') && all.includes('out');
    const hasVnetOutbound = all.includes('outbound') &&
                            (all.includes('vnet') || all.includes('virtual network'));
    return hasInterVnet || hasPeering || hasVnetOutbound;
  };

  const isVpnEgress = (it) => {
    const meter = (it.meterName || '').toLowerCase();
    const product = (it.productName || '').toLowerCase();
    const sku = (it.skuName || '').toLowerCase();
    const all = `${meter} ${product} ${sku}`;
    if (all.includes('inter-virtual network')) return false;
    if (all.includes('inter virtual network')) return false;
    if (all.includes('inter-vnet')) return false;
    if (all.includes('inter vnet')) return false;
    if (all.includes('vnet to vnet')) return false;
    if (all.includes('vnet-to-vnet')) return false;
    if (all.includes('intervnet')) return false;
    if (all.includes('peering')) return false;
    if (all.includes('inter-region')) return false;
    if (all.includes('inter region')) return false;
    if (all.includes('inter continent')) return false;
    if (all.includes('inter-continent')) return false;
    if (all.includes('intercontinent')) return false;
    if (all.includes('intra-continent')) return false;
    if (all.includes('intra continent')) return false;
    if (all.includes('cross region')) return false;
    if (all.includes('cross-region')) return false;
    return all.includes('vpn') || all.includes('data transfer');
  };

  const filterByType = (gbCands, type) => {
    if (type === 'VNET 간') {
      return gbCands.filter(it => Number(it.unitPrice || 0) > 0 && isVnetOutbound(it));
    } else {
      return gbCands.filter(it => isVpnEgress(it));
    }
  };

  const sortCands = (cands) => {
    const zoneRe = new RegExp(`zone\\s*${userZone}\\b`, 'i');
    const checkZone = (it) =>
      zoneRe.test(it.meterName || '') ||
      zoneRe.test(it.skuName || '') ||
      zoneRe.test(it.productName || '');
    return cands.slice().sort((a, b) => {
      const aZone = checkZone(a) ? 0 : 1;
      const bZone = checkZone(b) ? 0 : 1;
      if (aZone !== bZone) return aZone - bZone;
      const aOut = /\bout\b|outbound/i.test(a.meterName || '') ? 0 : 1;
      const bOut = /\bout\b|outbound/i.test(b.meterName || '') ? 0 : 1;
      if (aOut !== bOut) return aOut - bOut;
      return Number(a.unitPrice || 0) - Number(b.unitPrice || 0);
    });
  };

  const makeCandidateId = (it) =>
    it.meterId || `${it.serviceName}|${it.armRegionName}|${it.meterName}|${it.unitPrice}`;

  if (vnetGB > 0) {
    let allTypeMatched = [];

    // ----------------------------------------------------------
    // 5-A. VPN Gateway 응답 안에서 키워드 매칭
    // ----------------------------------------------------------
    try {
      const cands1Strict = filterByType(extractGbCands(allItems), transferType);
      if (cands1Strict.length > 0) {
        allTypeMatched = allTypeMatched.concat(cands1Strict);
        vnetSearchSteps.push(`VPN Gateway 응답 키워드매칭 ${cands1Strict.length}건`);
      } else {
        const gbAll = extractGbCands(allItems);
        if (transferType === 'VNET 간') {
          const gbPositive = gbAll.filter(it => Number(it.unitPrice || 0) > 0);
          if (gbPositive.length > 0) {
            allTypeMatched = allTypeMatched.concat(gbPositive);
            vnetSearchSteps.push(`VPN Gateway 응답 GB(단가>0) 폴백 ${gbPositive.length}건`);
          }
        } else {
          if (gbAll.length > 0) {
            const gbForVpn = gbAll.filter(it => {
              const all = `${it.meterName || ''} ${it.productName || ''} ${it.skuName || ''}`.toLowerCase();
              return !all.includes('inter-virtual network') &&
                     !all.includes('inter virtual network') &&
                     !all.includes('inter-vnet') &&
                     !all.includes('intervnet');
            });
            if (gbForVpn.length > 0) {
              allTypeMatched = allTypeMatched.concat(gbForVpn);
              vnetSearchSteps.push(`VPN Gateway 응답 GB 폴백 ${gbForVpn.length}건`);
            }
          }
        }
      }
    } catch (err) {
      errors.push(`VNET 1차 매칭 실패: ${err.message}`);
    }

    // ----------------------------------------------------------
    // 5-B. [v30 신규] 좁은 필터 — Bandwidth + Inter-Virtual Network 명시
    //   응답이 작아 codetabs(625KB)도 통과 가능
    // ----------------------------------------------------------
    if (allTypeMatched.length === 0) {
      try {
        const narrowItems = await apiFetch(
          {
            serviceName: 'Bandwidth',
            __raw: "contains(meterName, 'Inter-Virtual Network')",
            priceType: 'Consumption',
          },
          currencyCode, 200, 2,
          { pageSize: 200, expectedSizeKB: 100 }
        );
        const cands = filterByType(extractGbCands(narrowItems), transferType);
        if (cands.length > 0) {
          allTypeMatched = allTypeMatched.concat(cands);
          vnetSearchSteps.push(`Bandwidth(Inter-Virtual 좁은필터) ${cands.length}건/${narrowItems.length}응답`);
        } else {
          vnetSearchSteps.push(`Bandwidth(Inter-Virtual) 0건/${narrowItems.length}응답`);
        }
      } catch (err) {
        vnetSearchSteps.push(`Bandwidth(Inter-Virtual) 호출실패: ${err.message.slice(0, 60)}`);
      }
    }

    // ----------------------------------------------------------
    // 5-C. Virtual Network 서비스 (Peering Outbound)
    //   응답 사이즈 작은 편 (~수백 KB)
    // ----------------------------------------------------------
    if (allTypeMatched.length === 0) {
      try {
        const vnetSvcItems = await apiFetch(
          { serviceName: 'Virtual Network', priceType: 'Consumption' },
          currencyCode, 2000, 5,
          { pageSize: 1000, expectedSizeKB: 800 }
        );
        const cands = filterByType(extractGbCands(vnetSvcItems), transferType);
        if (cands.length > 0) {
          allTypeMatched = allTypeMatched.concat(cands);
          vnetSearchSteps.push(`Virtual Network ${cands.length}건/${vnetSvcItems.length}응답`);
        } else {
          vnetSearchSteps.push(`Virtual Network 0건/${vnetSvcItems.length}응답`);
        }
      } catch (err) {
        vnetSearchSteps.push(`Virtual Network 호출실패: ${err.message.slice(0, 60)}`);
      }
    }

    // ----------------------------------------------------------
    // 5-D. Bandwidth 광범위 (큰 응답 → 큰 프록시 우선)
    //   v30: pageSize 작게 + expectedSizeKB 명시 → 작은 페이지로 분할
    // ----------------------------------------------------------
    if (allTypeMatched.length === 0) {
      try {
        const bandwidthItems = await apiFetch(
          { serviceName: 'Bandwidth', priceType: 'Consumption' },
          currencyCode, 5000, 10,
          { pageSize: 500, expectedSizeKB: 2000 }
        );
        const cands = filterByType(extractGbCands(bandwidthItems), transferType);
        if (cands.length > 0) {
          allTypeMatched = allTypeMatched.concat(cands);
          vnetSearchSteps.push(`Bandwidth 광범위 ${cands.length}건/${bandwidthItems.length}응답`);
        } else {
          vnetSearchSteps.push(`Bandwidth 광범위 0건/${bandwidthItems.length}응답`);
        }
      } catch (err) {
        vnetSearchSteps.push(`Bandwidth 광범위 호출실패: ${err.message.slice(0, 60)}`);
      }
    }

    // ----------------------------------------------------------
    // 5-E. 중복 제거 + 정렬 + 최종 선택
    // ----------------------------------------------------------
    const uniqMap = new Map();
    allTypeMatched.forEach(it => {
      const id = makeCandidateId(it);
      if (!uniqMap.has(id)) uniqMap.set(id, it);
    });
    vnetCandsAll = sortCands(Array.from(uniqMap.values()));

    if (vnetCandsAll.length > 0) {
      vnetItem = vnetCandsAll[0];
    } else if (transferType === 'VPN') {
      // VPN 유형이고 매칭 0건 → ₩0 처리 (calculator 동작과 일치)
      vnetItem = {
        meterName: `[VPN zone ${userZone} 내 무료]`,
        skuName: 'Free',
        unitPrice: 0,
        retailPrice: 0,
        unitOfMeasure: '1 GB',
        currencyCode: currencyCode,
        productName: 'VPN intra-zone',
        serviceName: 'VPN Gateway',
      };
    }
  }

  // ============================================================
  // 6단계: 월 비용 합산 + 결과 저장
  // ============================================================
  let monthly = 0;
  let breakdown = [];
  let gwMonthly = 0, s2sMonthly = 0, p2sMonthly = 0, vnetMonthly = 0;
  let gwHourly = 0, s2sHourly = 0, p2sHourly = 0, vnetGbPrice = 0;

  if (gateway) {
    gwHourly = Number(gateway.unitPrice);
    gwMonthly = gwHourly * gatewayHours;
    monthly += gwMonthly;
    breakdown.push(`GW ${gwHourly.toFixed(4)}/h × ${gatewayHours}h = ${gwMonthly.toFixed(2)}/월`);
  }
  if (s2sItem && extraS2s > 0) {
    s2sHourly = Number(s2sItem.unitPrice);
    s2sMonthly = s2sHourly * extraS2s * gatewayHours;
    monthly += s2sMonthly;
    breakdown.push(`S2S ${s2sHourly}/터널/h × ${extraS2s}터널 × ${gatewayHours}h = ${s2sMonthly.toFixed(2)}/월`);
  }
  if (p2sItem && extraP2s > 0) {
    p2sHourly = Number(p2sItem.unitPrice);
    p2sMonthly = p2sHourly * extraP2s * gatewayHours;
    monthly += p2sMonthly;
    breakdown.push(`P2S ${p2sHourly}/연결/h × ${extraP2s}연결 × ${gatewayHours}h = ${p2sMonthly.toFixed(2)}/월`);
  }
  if (vnetItem && vnetGB > 0) {
    vnetGbPrice = Number(vnetItem.unitPrice);
    vnetMonthly = vnetGbPrice * vnetGB;
    monthly += vnetMonthly;
    breakdown.push(`VNET ${vnetGbPrice}/GB × ${vnetGB}GB = ${vnetMonthly.toFixed(2)}/월`);
  }

  const hourlyEquivalent = monthly / 730;

  let payg = null;
  if (gateway) {
    payg = {
      ...gateway,
      unitPrice: hourlyEquivalent,
      retailPrice: hourlyEquivalent,
      unitOfMeasure: '1 Hour (equivalent)',
      _billingMode: 'monthly',
      _monthlyTotal: monthly,
      _gwMonthly: gwMonthly,
      _s2sMonthly: s2sMonthly,
      _p2sMonthly: p2sMonthly,
      _vnetMonthly: vnetMonthly,
      _gwHourly: gwHourly,
      _s2sHourly: s2sHourly,
      _p2sHourly: p2sHourly,
      _vnetGbPrice: vnetGbPrice,
      _gatewayHours: gatewayHours,
      _extraS2s: extraS2s,
      _extraP2s: extraP2s,
      _vnetGB: vnetGB,
      _partialErrors: errors.length > 0 ? errors : undefined,
    };
  }

  row.paygItem = payg;
  row.sp1Item = null;
  row.sp3Item = null;
  row.ri1Item = null;
  row.ri3Item = null;

  // ============================================================
  // 디버그 콘솔 출력
  // ============================================================
  console.group(`[VPN Gateway v30] sku=${sku} / hours=${gatewayHours} / S2S+${extraS2s} / P2S+${extraP2s} / VNET=${vnetGB}GB / ${row.region}`);
  console.log(`전체 응답: ${allItems.length}건`);

  console.log(`▣ 게이트웨이 후보 ${gwCandsAll.length}건:`);
  gwCandsAll.forEach((it, i) => {
    console.log(`   [${i}] meter="${it.meterName}" / sku="${it.skuName}" / unitPrice=${it.unitPrice} ${it.currencyCode} / uom=${it.unitOfMeasure}`);
  });
  if (gateway) console.log(`✓ 게이트웨이 선택: meter="${gateway.meterName}" / unitPrice=${gateway.unitPrice}/h`);
  else console.warn(`✗ 게이트웨이 매칭 실패 — sku="${sku}" 와 일치하는 미터가 없음`);

  if (extraS2s > 0) {
    console.log(`▣ S2S 후보 ${s2sCandsAll.length}건`);
    if (s2sItem) console.log(`✓ S2S 선택: ${s2sItem.meterName} = ${s2sItem.unitPrice}/h`);
    else console.warn(`✗ S2S 매칭 실패`);
  }

  if (extraP2s > 0) {
    console.log(`▣ P2S 후보 ${p2sCandsAll.length}건`);
    if (p2sItem) console.log(`✓ P2S 선택: ${p2sItem.meterName} = ${p2sItem.unitPrice}/h`);
    else console.warn(`✗ P2S 매칭 실패`);
  }

  if (vnetGB > 0) {
    console.log(`▣ VNET 데이터 전송 - 유형: ${transferType} / region=${row.region} (zone ${userZone})`);
    console.log(`▣ 검색 단계: ${vnetSearchSteps.join(' / ') || '검색 미실행'}`);
    console.log(`▣ ${transferType} 유형 후보 ${vnetCandsAll.length}건 (정렬: zone ${userZone}, Out, 단가):`);
    vnetCandsAll.slice(0, 20).forEach((it, i) => {
      console.log(`   [${i}] meter="${it.meterName}" / unitPrice=${it.unitPrice} / region=${it.armRegionName} / sku="${it.skuName}" / service=${it.serviceName}`);
    });
    if (vnetCandsAll.length > 20) console.log(`   ... 총 ${vnetCandsAll.length}건 중 처음 20건만 표시`);
    if (vnetItem) {
      console.log(`✓ VNET 선택 (${transferType}): meter="${vnetItem.meterName}" / unitPrice=${vnetItem.unitPrice}/GB × ${vnetGB} GB = ${(Number(vnetItem.unitPrice) * vnetGB).toFixed(2)}/월`);
    } else {
      console.warn(`✗ VNET 매칭 실패 (${transferType})`);
    }
  }

  console.log(`▣ 항목별 월 비용:`);
  breakdown.forEach(b => console.log(`   · ${b}`));
  console.log(`▣ 총 월 비용 = ${monthly.toFixed(2)}/월 (표시용 시간당 = ${hourlyEquivalent.toFixed(6)}/h)`);
  if (errors.length > 0) {
    console.warn(`▣ 부분 실패 항목 ${errors.length}건:`);
    errors.forEach(e => console.warn(`   ! ${e}`));
  }
  console.groupEnd();

  // 상태 메시지: 부분 성공 표시
  if (payg) {
    const tags = [];
    tags.push(gateway ? `GW✓` : `GW✗`);
    if (extraS2s > 0) tags.push(s2sItem ? `S2S✓` : `S2S✗`);
    if (extraP2s > 0) tags.push(p2sItem ? `P2S✓` : `P2S✗`);
    if (vnetGB > 0) tags.push(vnetItem ? `VNET✓` : `VNET✗`);
    const errSuffix = errors.length > 0 ? ` (부분실패 ${errors.length}건)` : '';
    setStatus('ok', `${sku} 완료 [${tags.join(', ')}] · ${monthly.toFixed(2)}/월${errSuffix}`);
  } else {
    setStatus('error', `${sku}: 게이트웨이 매칭 실패 - F12 콘솔 확인`);
  }

  updatePriceCells(row);
  updateTotalsRow();
}


async function tryResolveItem(row) {
  if (!row.serviceCategory || !row.skuName) {
    row.paygItem = null; row.sp1Item = null; row.sp3Item = null;
    row.ri1Item = null; row.ri3Item = null;
    return;
  }
  const def = SERVICE_CATEGORIES[row.serviceCategory];
  if (!def) return;
  const cur = document.getElementById('currencySelect').value;

  setStatus('loading', `${row.skuName} 가격 조회 중...`);

  // VM은 별도 함수로 명확하게 처리 (가장 정확한 매칭이 필요한 카테고리)
  if (row.serviceCategory === 'Virtual Machine') {
    return await resolveVmPrices(row, cur);
  }
  // Storage도 별도 함수: 디스크 가격 + 트랜잭션 가격 합산이 필요함
  if (row.serviceCategory === 'Storage') {
    return await resolveStoragePrices(row, cur);
  }
  // VPN Gateway: 게이트웨이 시간 + S2S 추가 터널 + P2S 추가 연결 + VNET 데이터 전송 합산
  if (row.serviceCategory === 'VPN Gateway') {
    return await resolveVpnGatewayPrices(row, cur);
  }

  try {
    // 카테고리별 정밀 필터 구성
    const baseFilter = {
      serviceName: def.apiServiceName,
      armRegionName: row.region,
    };
    if (row.serviceCategory === 'Virtual Machine') {
      baseFilter.armSkuName = `Standard_${row.skuName}`;
    } else if (row.serviceCategory === 'Storage') {
      const skuFull = `${row.skuName} ${row.options.redundancy || 'LRS'}`;
      baseFilter.skuName = skuFull;
      const productNameMap = {
        'Premium SSD Managed Disks': 'Premium SSD Managed Disks',
        'Standard SSD Managed Disks': 'Standard SSD Managed Disks',
        'Standard HDD Managed Disks': 'Standard HDD Managed Disks',
      };
      const pn = productNameMap[row.options.storageType];
      if (pn) baseFilter.productName = pn;
    } else if (row.serviceCategory === 'Azure Files') {
      // Azure Files: productName 기반 필터
      const tier = row.options.fileTier || 'Premium';
      const fileProductMap = {
        'Premium': 'Premium Files',
        'Hot': 'General Purpose v2 Files',
        'Cool': 'Cool Files',
        'Transaction Optimized': 'General Purpose v2 Files',
      };
      const pn = fileProductMap[tier];
      if (pn) baseFilter.productName = pn;
    } else if (row.serviceCategory === 'Blob Storage') {
      const tier = row.options.blobTier || 'Hot';
      const blobProductMap = {
        'Hot': 'Hot Block Blob',
        'Cool': 'Cool Block Blob',
        'Cold': 'Cold Block Blob',
        'Archive': 'Archive Block Blob',
      };
      const pn = blobProductMap[tier];
      if (pn) baseFilter.productName = pn;
    } else if (row.serviceCategory === 'VPN Gateway') {
      // VPN Gateway: skuName 매칭은 부정확. productName으로 필터
      baseFilter.skuName = row.skuName;
    } else if (row.serviceCategory === 'Load Balancer') {
      // Load Balancer는 productName이 "Standard Load Balancer", "Basic Load Balancer" 등
      const tier = row.options.tier || 'Standard';
      baseFilter.productName = `${tier} Load Balancer`;
    } else if (row.serviceCategory === 'Application Gateway') {
      baseFilter.skuName = row.skuName;
    } else if (row.serviceCategory === 'Public IP') {
      // Public IP: productName이 "IP Addresses"
      baseFilter.productName = 'IP Addresses';
    } else if (row.serviceCategory === 'Azure Firewall') {
      // Firewall: productName이 "Azure Firewall Standard", "Azure Firewall Premium" 등
      const tier = row.options.tier || 'Standard';
      baseFilter.productName = `Azure Firewall ${tier}`;
    } else if (row.serviceCategory === 'Bandwidth') {
      // Bandwidth는 region이 'global'인 항목도 있음
      // 별도 필터 없음
    } else if (row.serviceCategory === 'Azure SQL Database') {
      const tier = row.options.tier || 'General Purpose';
      // SQL Database productName: "SQL Database Single/Elastic Pool General Purpose - Compute Gen5"
      baseFilter.productName = `SQL Database Single/Elastic Pool ${tier} - Compute Gen5`;
    } else if (row.serviceCategory === 'App Service') {
      baseFilter.skuName = row.skuName || row.options.size || '';
    } else if (row.serviceCategory === 'Azure Bastion') {
      const tier = row.options.tier || 'Basic';
      baseFilter.productName = `Azure Bastion ${tier}`;
    } else if (row.serviceCategory === 'NAT Gateway') {
      baseFilter.productName = 'NAT Gateway';
    }

    // (1) Consumption 호출 → PAYG + Savings Plan
    // priceType 필터를 빼면 Reservation도 함께 받게 되지만,
    // 응답 크기가 작은 SKU 단위 호출이므로 분리 호출이 안전함
    const consumptionItems = await apiFetch(
      { ...baseFilter, priceType: 'Consumption' },
      cur, 200, 3
    );

    // (2) Reservation 호출 → RI 1Y/3Y
    let reservationItems = [];
    const supportsReservation = ['Virtual Machine', 'Storage', 'Azure SQL Database'].includes(row.serviceCategory);
    if (supportsReservation) {
      try {
        reservationItems = await apiFetch(
          { ...baseFilter, priceType: 'Reservation' },
          cur, 200, 3
        );
      } catch (e) {
        reservationItems = [];
      }
    }

    // === Consumption 매칭 함수 (OS 필터 적용) ===
    const matchesConsumption = (it) => {
      if (row.serviceCategory === 'Virtual Machine') {
        // armSkuName 1차 매칭 (Standard_D8s_v3)
        if (it.armSkuName !== `Standard_${row.skuName}`) return false;
        // meterName도 검증: "D8s v3"는 정확히 매칭되어야 하며,
        // "D8s v3 Spot", "D8s v3/Low Priority" 같은 변형은 제외
        // skuName은 보통 meterName과 동일 또는 유사
        const meter = String(it.meterName || '').toLowerCase();
        const sku = String(it.skuName || '').toLowerCase();
        // skuName이 row.skuName과 정확히 일치 (대소문자 무시, 공백/언더스코어 변형 허용)
        const target1 = row.skuName.toLowerCase();
        const target2 = row.skuName.toLowerCase().replace(/_/g, ' ');
        const skuMatch = (sku === target1) || (sku === target2);
        const meterMatch = (meter === target1) || (meter === target2);
        return skuMatch || meterMatch;
      }
      if (row.serviceCategory === 'Storage') {
        const skuFull = `${row.skuName} ${row.options.redundancy || 'LRS'}`;
        return it.skuName === skuFull;
      }
      if (row.serviceCategory === 'Azure Files') {
        const red = row.options.redundancy || 'LRS';
        const sku = it.skuName || '';
        const meter = (it.meterName || '').toLowerCase();
        const metric = (row.options.metric || 'Data Stored').toLowerCase();
        return sku.includes(red) && meter.includes(metric.replace('data stored', 'stored'));
      }
      if (row.serviceCategory === 'Blob Storage') {
        const red = row.options.redundancy || 'LRS';
        const sku = it.skuName || '';
        return sku.includes(red);
      }
      if (row.serviceCategory === 'VPN Gateway') {
        const sku = it.skuName || '';
        return sku === row.skuName || sku.startsWith(row.skuName + ' ');
      }
      if (row.serviceCategory === 'Load Balancer') {
        const metric = (row.options.metric || 'Rules').toLowerCase();
        const meter = (it.meterName || '').toLowerCase();
        return meter.includes(metric.toLowerCase());
      }
      if (row.serviceCategory === 'Public IP') {
        const sku = it.skuName || '';
        const ipType = row.options.ipType || 'Static';
        const skuTarget = row.options.sku || 'Standard';
        return sku.includes(skuTarget) && sku.includes(ipType);
      }
      if (row.serviceCategory === 'Azure Firewall') {
        const metric = (row.options.metric || 'Deployment').toLowerCase();
        const meter = (it.meterName || '').toLowerCase();
        return meter.includes(metric);
      }
      if (row.serviceCategory === 'Application Gateway') {
        return (it.skuName || '').includes(row.skuName);
      }
      if (row.serviceCategory === 'Azure Bastion') {
        return true;
      }
      if (row.serviceCategory === 'NAT Gateway') {
        const metric = (row.options.metric || 'Resource Hour').toLowerCase();
        return (it.meterName || '').toLowerCase().includes(metric);
      }
      const sku = it.skuName || it.armSkuName || '';
      return sku === row.skuName;
    };

    // VM의 경우 OS는 productName으로 판별
    const osFilter = (it) => {
      if (row.serviceCategory !== 'Virtual Machine') return true;
      const os = (row.options.os || '').toLowerCase();
      const pn = (it.productName || '').toLowerCase();
      if (!os) return true;
      if (os === 'linux') {
        return !pn.includes('windows') && !pn.includes('red hat') && !pn.includes('suse');
      }
      if (os === 'windows') return pn.includes('windows');
      if (os.includes('red hat')) return pn.includes('red hat');
      if (os === 'suse') return pn.includes('suse');
      return true;
    };

    // Spot / Low Priority / DevTest 명시적 제외
    const notSpot = (it) => {
      const sku = (it.skuName || '').toLowerCase();
      const meter = (it.meterName || '').toLowerCase();
      const pn = (it.productName || '').toLowerCase();
      const type = (it.type || '').toLowerCase();
      return !sku.includes('spot') && !meter.includes('spot') &&
             !sku.includes('low priority') && !meter.includes('low priority') &&
             !pn.includes('low priority') &&
             type !== 'devtestconsumption';
    };

    // PAYG 후보: type=Consumption + 매칭 + OS + Spot 제외
    // VM의 경우 unitOfMeasure가 정확히 "1 Hour"여야 함 (1 Hour 외 다른 단위는 별도 미터)
    const paygCandidates = consumptionItems.filter(it => {
      if ((it.type || '').toLowerCase() !== 'consumption') return false;
      if (!matchesConsumption(it)) return false;
      if (!osFilter(it)) return false;
      if (!notSpot(it)) return false;
      // VM은 시간당 단가만 인정
      if (row.serviceCategory === 'Virtual Machine') {
        const uom = String(it.unitOfMeasure || '').toLowerCase();
        if (!uom.includes('hour')) return false;
      }
      return true;
    });
    // tierMinimumUnits 0 우선, 다음 unitPrice 가장 낮은 것
    paygCandidates.sort((a, b) => {
      const ta = Number(a.tierMinimumUnits || 0);
      const tb = Number(b.tierMinimumUnits || 0);
      if (ta !== tb) return ta - tb;
      return Number(a.unitPrice || 0) - Number(b.unitPrice || 0);
    });
    const payg = paygCandidates[0] || null;

    // 디버그: 콘솔에 모든 후보 출력 (사용자가 개발자 도구에서 확인 가능)
    console.group(`[가격조회] ${row.serviceCategory} / ${row.skuName} (${row.options.os || 'N/A'})`);
    console.log('Consumption 응답:', consumptionItems.length, '건');
    console.log('PAYG 후보:', paygCandidates.length, '건');
    paygCandidates.forEach((it, i) => {
      console.log(`  [${i}] ${it.productName} / ${it.meterName} / ${it.skuName} / unitPrice=${it.unitPrice} / tier=${it.tierMinimumUnits} / type=${it.type}`);
    });
    if (payg) {
      console.log('선택된 PAYG:', payg);
    }
    console.log('Reservation 응답:', reservationItems.length, '건');
    reservationItems.forEach((it, i) => {
      console.log(`  [RI${i}] ${it.productName} / ${it.meterName} / term=${it.reservationTerm} / unitPrice=${it.unitPrice} / uom=${it.unitOfMeasure}`);
    });
    console.groupEnd();

    // === Savings Plan 추출 ===
    // SP는 PAYG item의 savingsPlan 배열에 들어있음
    // 일부 OS 항목엔 SP가 없을 수 있어, 모든 동일 SKU 항목을 검사하여 SP 추출
    let sp1 = null, sp3 = null;
    const sameSkuItems = consumptionItems.filter(it =>
      (it.type || '').toLowerCase() === 'consumption' &&
      matchesConsumption(it) && notSpot(it) &&
      Number(it.tierMinimumUnits || 0) === 0  // 표준 가격만
    );
    // 우선 사용자가 선택한 OS 항목의 SP를 사용
    const checkSp = (item) => {
      if (!item || !Array.isArray(item.savingsPlan)) return;
      for (const sp of item.savingsPlan) {
        const term = String(sp.term || '').toLowerCase();
        if ((term.includes('1 year') || term === '1' || term.startsWith('1 ')) && !sp1) {
          sp1 = makeSpItem(item, sp);
        } else if ((term.includes('3 year') || term === '3' || term.startsWith('3 ')) && !sp3) {
          sp3 = makeSpItem(item, sp);
        }
      }
    };
    checkSp(payg);
    // 폴백: 동일 SKU의 다른 OS 항목에서 SP 가져오기
    if (!sp1 || !sp3) {
      for (const item of sameSkuItems) {
        if (item === payg) continue;
        checkSp(item);
        if (sp1 && sp3) break;
      }
    }

    // === Reservation 매칭 (OS 필터 적용 안 함!) ===
    // Reservation은 armSkuName만 일치하면 OS와 무관하게 사용 가능
    // skuName도 체크: PAYG와 동일하거나 OS 미표기 형식
    const matchesReservation = (it) => {
      if (row.serviceCategory === 'Virtual Machine') {
        // armSkuName 일치 + meterName이 정확한 SKU 형태일 것
        if (it.armSkuName !== `Standard_${row.skuName}`) return false;
        const meter = String(it.meterName || '').toLowerCase();
        const sku = String(it.skuName || '').toLowerCase();
        const target1 = row.skuName.toLowerCase();
        const target2 = row.skuName.toLowerCase().replace(/_/g, ' ');
        return (sku === target1) || (sku === target2) ||
               (meter === target1) || (meter === target2);
      }
      if (row.serviceCategory === 'Storage') {
        const skuFull = `${row.skuName} ${row.options.redundancy || 'LRS'}`;
        return it.skuName === skuFull || it.skuName === row.skuName;
      }
      const sku = it.skuName || it.armSkuName || '';
      return sku === row.skuName;
    };

    // RI는 같은 armSkuName에 여러 항목이 있을 수 있어 unitPrice가 가장 낮은 항목 선택
    const ri1Candidates = reservationItems.filter(it =>
      (it.type || '').toLowerCase() === 'reservation' &&
      String(it.reservationTerm || '').toLowerCase().includes('1 year') &&
      matchesReservation(it)
    ).sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
    const ri3Candidates = reservationItems.filter(it =>
      (it.type || '').toLowerCase() === 'reservation' &&
      String(it.reservationTerm || '').toLowerCase().includes('3 year') &&
      matchesReservation(it)
    ).sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

    const ri1Raw = ri1Candidates[0] || null;
    const ri3Raw = ri3Candidates[0] || null;

    // RI 단가 정규화 (시간당으로 환산)
    const ri1Item = ri1Raw ? normalizeReservationPrice(ri1Raw, 1) : null;
    const ri3Item = ri3Raw ? normalizeReservationPrice(ri3Raw, 3) : null;

    row.paygItem = payg || null;
    row.sp1Item = sp1;
    row.sp3Item = sp3;
    row.ri1Item = ri1Item;
    row.ri3Item = ri3Item;

    // 디버그 정보
    if (payg) {
      const tags = ['PAYG'];
      if (sp1) tags.push('SP1Y');
      if (sp3) tags.push('SP3Y');
      if (ri1Item) tags.push('RI1Y');
      if (ri3Item) tags.push('RI3Y');
      const proxyName = CORS_PROXIES[activeProxyIndex].name;
      const debugInfo = `Cons:${consumptionItems.length}/Res:${reservationItems.length}`;
      const priceInfo = `PAYG ${Number(payg.unitPrice).toFixed(2)}/h`;
      setStatus('ok', `${row.skuName} 완료 [${tags.join(', ')}] · ${priceInfo} · ${debugInfo}`);
    } else {
      setStatus('error', `${row.skuName}: 매칭 항목 없음 (응답 ${consumptionItems.length}건) - F12 콘솔 확인`);
    }
  } catch (err) {
    row.paygItem = null; row.sp1Item = null; row.sp3Item = null;
    row.ri1Item = null; row.ri3Item = null;
    setStatus('error', `API 호출 실패: ${err.message.slice(0, 100)}`);
  }
  updatePriceCells(row);
  updateTotalsRow();
}

/**
 * Reservation 단가를 시간당 단가로 정규화
 *
 * 중요: Azure Retail Prices API의 Reservation 항목은 unitOfMeasure가 "1 Hour"라고 표시되더라도
 * 실제 unitPrice는 약정 기간 전체의 총액입니다 (출처: davecallan.com Azure Price API).
 * 예) 1년 RI: unitPrice = 1351 USD (실제 연 총액), 시간당 = 1351/8760 = $0.1542/h
 *     3년 RI: unitPrice = 4053 USD (3년 총액), 시간당 = 4053/(3*8760) = $0.1542/h
 *
 * 단, retailPrice가 시간당 가격이고 unitPrice가 약정 총액인 경우도 있어
 * 두 값의 비율로 판단:
 *   - retailPrice가 unitPrice보다 매우 작으면 (1/8760 수준) → retailPrice가 시간당
 *   - 비슷하면 → 둘 다 약정 총액
 */
function normalizeReservationPrice(item, years) {
  const unitPrice = Number(item.unitPrice);
  const retailPrice = Number(item.retailPrice || item.unitPrice);
  const hoursInTerm = years * 8760;

  // retailPrice가 unitPrice의 1/8760 수준이면 retailPrice가 이미 시간당 단가
  // 그 외에는 unitPrice를 시간당으로 환산
  let hourlyPrice;
  if (retailPrice > 0 && unitPrice / retailPrice > 1000) {
    // unitPrice가 약정 총액, retailPrice가 시간당 단가
    hourlyPrice = retailPrice;
  } else {
    // 둘 다 약정 총액 → 8760(또는 26280)으로 나눔
    hourlyPrice = unitPrice / hoursInTerm;
  }

  return {
    ...item,
    unitPrice: hourlyPrice,
    retailPrice: hourlyPrice,
    unitOfMeasure: '1 Hour (normalized)',
    _originalUnitPrice: unitPrice,
    _originalUnitOfMeasure: item.unitOfMeasure,
    _termYears: years,
  };
}

function makeSpItem(baseItem, spData) {
  return {
    unitPrice: Number(spData.unitPrice),
    retailPrice: Number(spData.retailPrice || spData.unitPrice),
    currencyCode: baseItem.currencyCode,
    type: 'SavingsPlan',
    armRegionName: baseItem.armRegionName,
    productName: baseItem.productName,
    skuName: baseItem.skuName,
    armSkuName: baseItem.armSkuName,
    meterName: baseItem.meterName,
    unitOfMeasure: baseItem.unitOfMeasure,
    term: spData.term,
  };
}
