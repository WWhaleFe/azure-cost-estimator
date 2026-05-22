// ================================================================
// services/sql-database.js — Azure SQL Database
//
// 이 파일은 다음을 등록합니다.
//   1) window._svcDefs['Azure SQL Database']     — 카테고리 정의(옵션 목록)
//   2) window['_buildDetail_Azure_SQL_Database'] — 옵션 → skuName/detail 변환
//   3) window['_resolve_Azure_SQL_Database']     — 시간당 가격 5종 조회
//
// === Azure SQL Database 가격 산정 개요 ===
//
// 본 도구는 vCore 기반 구매 모델만 지원합니다(DTU 는 본 단계에서 제외).
// 청구는 다음 두 가지 라인 아이템의 합입니다.
//
//   (a) 컴퓨팅: vCore 수 × 시간당 단가 (계층 + 하드웨어 + Provisioned/Serverless 조합)
//   (b) 스토리지: 월별 GB 단가 × 사용자가 입력한 storageGB
//
// Azure Retail Prices API 응답 형태(확인된 사례):
//   - serviceName  : "SQL Database"
//   - productName  : "SQL Database Single/Elastic Pool General Purpose - Compute Gen5"
//                    "SQL Database SingleDB/Elastic Pool Hyperscale - Compute Gen5"
//                    "SQL Database Business Critical - Storage" (스토리지 별도)
//   - skuName      : "2 vCore", "4 vCore", "8 vCore" ...
//   - meterName    : "vCore" 또는 "Storage" 또는 "Backup Storage"
//   - armSkuName   : "SQLDB_GP_Compute_Gen5_2", "SQLDB_HS_Compute_Gen5_2" ...
//                    (끝의 숫자가 vCore 수)
//   - unitOfMeasure: "1 Hour" (컴퓨팅) / "1 GB/Month" (스토리지)
// ================================================================

// ----------------------------------------------------------------
// 1) 카테고리 정의
// ----------------------------------------------------------------
window._svcDefs['Azure SQL Database'] = {
  apiServiceName: 'SQL Database',
  steps: [
    { key: 'deploymentType', label: '배포 유형',  options: ['Single Database', 'Elastic Pool'] },
    { key: 'tier',           label: '서비스 계층', options: ['General Purpose', 'Business Critical', 'Hyperscale'] },
    { key: 'compute',        label: '컴퓨팅',     options: ['Provisioned', 'Serverless'] },
    { key: 'hardware',       label: '하드웨어',   options: ['Gen5', 'M-series', 'Fsv2-series'] },
    {
      key:     'vCore',
      label:   'vCore 수',
      options: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '24', '32', '40', '64', '80', '128'],
    },
    {
      key:      'storageGB',
      label:    '데이터 스토리지 (GB / 월)',
      type:     'number',
      min:      5,
      max:      100000,
      step:     1,
      default:  32,
      tooltip:  '월별 청구되는 데이터 스토리지 용량 (GB).',
    },
  ],
  instanceField: false,
};

// ----------------------------------------------------------------
// 2) detail 빌더 — UI 표에 표시할 SKU 라벨과 상세 사양 생성
// ----------------------------------------------------------------
window['_buildDetail_Azure_SQL_Database'] = function (r) {
  const o = r.options;

  // 표의 "Service name (SKU)" 열에 보여줄 짧은 라벨
  // 예: "GP Gen5 4 vCore" (General Purpose, Gen5, 4 vCore)
  const tierShort = _sqlDatabase_abbreviateTier(o.tier);
  const vCorePart = o.vCore ? `${o.vCore} vCore` : '';
  r.skuName = [tierShort, o.hardware, vCorePart].filter(Boolean).join(' ');

  // 표의 "상세 사양" 열에 보여줄 풀 표현
  const parts = [];
  if (o.deploymentType) parts.push(o.deploymentType);
  if (o.tier)           parts.push(o.tier);
  if (o.compute && o.compute !== 'Provisioned') parts.push(o.compute);
  if (o.hardware)       parts.push(o.hardware);
  if (o.vCore)          parts.push(`${o.vCore} vCore`);
  if (o.storageGB)      parts.push(`Storage ${o.storageGB}GB`);

  r.detail = parts.join(', ');
};

// 표시용 약어: "General Purpose" → "GP", "Business Critical" → "BC", "Hyperscale" → "HS"
function _sqlDatabase_abbreviateTier(tier) {
  if (tier === 'General Purpose')   return 'GP';
  if (tier === 'Business Critical') return 'BC';
  if (tier === 'Hyperscale')        return 'HS';
  return tier || '';
}

// ================================================================
// 3) 가격 조회 — SQL Database 전용 매칭 로직
// ================================================================
window['_resolve_Azure_SQL_Database'] = async function (row, cur) {
  const o = row.options || {};

  // ----- 옵션 정리 / 기본값 -----
  const selectedTier     = o.tier      || 'General Purpose';
  const selectedHardware = o.hardware  || 'Gen5';
  const selectedCompute  = o.compute   || 'Provisioned';
  const vCoreCount       = Number(o.vCore || 0);
  const storageGB        = Number(o.storageGB || 0);

  // vCore 가 선택되지 않으면 가격 조회 불가
  if (!vCoreCount) {
    row.paygItem = null;
    row.sp1Item  = null;
    row.sp3Item  = null;
    row.ri1Item  = null;
    row.ri3Item  = null;
    setStatus('error', `${row.skuName}: vCore 수가 선택되지 않았습니다`);
    updatePriceCells(row);
    updateTotalsRow();
    return;
  }

  try {
    // ----- API 조회: Consumption + Reservation -----
    // SQL Database 는 컴퓨팅과 스토리지가 모두 같은 serviceName='SQL Database' 아래에 있어
    // 리전별 전체 가격을 받아 client-side 에서 분리 매칭합니다.
    const [cItems, rItems] = await Promise.all([
      apiFetch(
        { serviceName: 'SQL Database', armRegionName: row.region, priceType: 'Consumption' },
        cur, 800, 5,
        { pageSize: 200, expectedSizeKB: 400 }
      ),
      apiFetch(
        { serviceName: 'SQL Database', armRegionName: row.region, priceType: 'Reservation' },
        cur, 400, 3,
        { pageSize: 200, expectedSizeKB: 200 }
      ).catch(() => []),
    ]);

    // ============================================================
    // 헬퍼 함수들
    // ============================================================

    // 정확한 vCore 매칭. Azure 응답의 skuName 은 "2 vCore", armSkuName 은
    // "SQLDB_GP_Compute_Gen5_2" 형태. 두 가지 모두 확인하여 신뢰도를 높임.
    const matchesVCore = (item) => {
      const skuName = item.skuName || '';
      if (skuName === `${vCoreCount} vCore`) return true;

      const armSku = item.armSkuName || '';
      const lastSegment = armSku.split('_').pop();   // 예: "2"
      return Number(lastSegment) === vCoreCount;
    };

    // 계층(tier) 매칭. productName 에 계층 이름이 포함되어야 함.
    const matchesTier = (item) => {
      const productName = item.productName || '';
      return productName.includes(selectedTier);
    };

    // 하드웨어(hardware) 매칭. productName 에 하드웨어 키워드가 포함되어야 함.
    // 예) "Gen5" → "Compute Gen5", "M-series" → "M-series Compute", "Fsv2-series" → "Fsv2-series"
    const matchesHardware = (item) => {
      const productName = item.productName || '';
      return productName.includes(selectedHardware);
    };

    // Serverless vs Provisioned 매칭. productName 또는 meterName 에 'Serverless' 가
    // 포함되면 Serverless 항목.
    const matchesCompute = (item) => {
      const text = `${item.productName || ''} ${item.meterName || ''}`.toLowerCase();
      const isServerlessItem = text.includes('serverless');
      const wantsServerless  = selectedCompute === 'Serverless';
      return isServerlessItem === wantsServerless;
    };

    // 컴퓨팅 항목(vCore 시간당 단가)인지. Storage / Backup 등은 제외.
    const isComputeMeter = (item) => {
      const meterName    = (item.meterName    || '').toLowerCase();
      const productName  = (item.productName  || '').toLowerCase();
      // Storage / Backup / IO / License 미터 제외
      if (meterName.includes('storage') || meterName.includes('backup')) return false;
      if (meterName.includes('io')      || meterName.includes('license')) return false;
      if (productName.includes('storage')) return false;
      // 시간당 단가만 (Serverless 는 vCore-second 일 수 있어 'second' 도 허용)
      const uom = (item.unitOfMeasure || '').toLowerCase();
      if (!uom.includes('hour') && !uom.includes('second')) return false;
      return true;
    };

    // 정상 PAYG 후보 판정 (컴퓨팅용)
    const isValidComputeConsumption = (item) => {
      if ((item.type || '').toLowerCase() !== 'consumption') return false;
      if (Number(item.tierMinimumUnits || 0) !== 0)          return false;
      if (!matchesTier(item))                                return false;
      if (!matchesHardware(item))                            return false;
      if (!matchesCompute(item))                             return false;
      if (!matchesVCore(item))                               return false;
      if (!isComputeMeter(item))                             return false;
      return true;
    };

    // ============================================================
    // 컴퓨팅 PAYG 매칭
    // ============================================================
    const computeCandidates = cItems
      .filter(isValidComputeConsumption)
      .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

    const computeItem = computeCandidates[0] || null;

    // ============================================================
    // 절약 플랜은 SQL Database 에는 거의 적용되지 않음.
    // SQL Database 의 약정 할인은 "Reserved Capacity" 로 별도 지원됨.
    // 그래도 응답에 savingsPlan 배열이 들어 있을 가능성에 대비해 시도.
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
    extractSpFromItem(computeItem);

    // ============================================================
    // 예약(Reserved Capacity) 매칭
    //
    // 예약 항목의 productName 은 보통 "SQL Database <tier> - <hardware>" 형태.
    // skuName 은 "<N> vCore" 형태이므로 동일 vCore 매칭 사용 가능.
    // 단, 응답의 unitPrice 가 "총 N년치 가격" 일 수 있으므로
    // normalizeReservationPrice(item, years) 로 시간당 단가로 환산.
    // ============================================================
    const isValidReservation = (item) => {
      if ((item.type || '').toLowerCase() !== 'reservation') return false;
      if (!matchesTier(item))     return false;
      if (!matchesHardware(item)) return false;
      // SQL Database 의 예약은 Serverless 가 없음. Reservation 응답엔 Provisioned 만 존재.
      if (!matchesVCore(item))    return false;
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

    const ri1Item = ri1Candidates[0] ? normalizeReservationPrice(ri1Candidates[0], 1) : null;
    const ri3Item = ri3Candidates[0] ? normalizeReservationPrice(ri3Candidates[0], 3) : null;

    // ============================================================
    // 스토리지 매칭 (월 정액)
    //
    // 스토리지는 별도 productName 으로 응답됨.
    // 예: "SQL Database Single Database General Purpose - Storage"
    // meterName 에 'Storage' 또는 'Data Stored' 가 포함되며,
    // unitOfMeasure 는 "1 GB/Month".
    // ============================================================
    const isStorageItem = (item) => {
      if ((item.type || '').toLowerCase() !== 'consumption') return false;
      const productName = (item.productName || '').toLowerCase();
      const meterName   = (item.meterName   || '').toLowerCase();
      const uom         = (item.unitOfMeasure || '').toLowerCase();
      // tier 별 스토리지 단가가 다를 수 있으므로 tier 매칭
      if (!matchesTier(item)) return false;
      // 스토리지 미터 식별
      if (!(productName.includes('storage') || meterName.includes('storage') || meterName.includes('data stored'))) {
        return false;
      }
      // 백업 스토리지는 본 항목에서 제외 (별도 옵션으로 다룰 수 있음, 지금은 메인 스토리지만)
      if (productName.includes('backup') || meterName.includes('backup')) return false;
      // GB 단위
      if (!uom.includes('gb')) return false;
      return true;
    };

    const storageCandidates = cItems
      .filter(isStorageItem)
      .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

    const storageItem        = storageCandidates[0] || null;
    const storageGbUnitPrice = storageItem ? Number(storageItem.unitPrice) : 0;

    // ============================================================
    // 최종 PAYG 시간당 단가 계산
    //
    // 표의 단위가 "시간당" 이므로, 월정액인 스토리지도 시간당으로 환산해 더함.
    //   monthly_total = compute_hourly * 730 + storage_per_gb_month * storageGB
    //   hourly_equiv  = monthly_total / 730
    // 표의 "1 Monthly Cost" = hourly_equiv × Qty × usage (usage 가 730 일 때 monthly_total 과 일치)
    // ============================================================
    let paygItem = null;
    if (computeItem) {
      const computeHourly = Number(computeItem.unitPrice);
      const storageMonthly = storageGbUnitPrice * storageGB;
      const monthlyTotal   = computeHourly * 730 + storageMonthly;
      const hourlyEquiv    = monthlyTotal / 730;

      paygItem = {
        ...computeItem,
        unitPrice:      hourlyEquiv,
        retailPrice:    hourlyEquiv,
        unitOfMeasure:  '1 Hour (equivalent)',
        _computeHourly: computeHourly,
        _storageMonthly: storageMonthly,
        _storageGB:      storageGB,
        _storageGbUnit:  storageGbUnitPrice,
      };
    }

    // 예약은 컴퓨팅 비용만 약정. 스토리지는 PAYG 그대로 더해서 표시.
    const addStorageToReservation = (riHourly) => {
      if (!riHourly) return null;
      const riComputeHourly = Number(riHourly.unitPrice);
      const storageMonthly  = storageGbUnitPrice * storageGB;
      const monthlyTotal    = riComputeHourly * 730 + storageMonthly;
      const hourlyEquiv     = monthlyTotal / 730;
      return {
        ...riHourly,
        unitPrice:       hourlyEquiv,
        retailPrice:     hourlyEquiv,
        unitOfMeasure:   '1 Hour (equivalent)',
        _computeHourly:  riComputeHourly,
        _storageMonthly: storageMonthly,
        _storageGB:      storageGB,
      };
    };

    const ri1Final = ri1Item ? addStorageToReservation(ri1Item) : null;
    const ri3Final = ri3Item ? addStorageToReservation(ri3Item) : null;

    // ============================================================
    // 행에 가격 항목 반영
    // ============================================================
    row.paygItem = paygItem;
    row.sp1Item  = sp1;
    row.sp3Item  = sp3;
    row.ri1Item  = ri1Final;
    row.ri3Item  = ri3Final;

    // 상태 메시지
    if (paygItem) {
      const tags = ['PAYG'];
      if (sp1)      tags.push('SP1Y');
      if (sp3)      tags.push('SP3Y');
      if (ri1Final) tags.push('RI1Y');
      if (ri3Final) tags.push('RI3Y');
      if (!storageItem) tags.push('Storage✗');  // 스토리지 매칭 실패 표시
      const paygUnitText = Number(paygItem.unitPrice).toFixed(4);
      setStatus('ok', `${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${paygUnitText}/h`);
    } else {
      setStatus('error', `${row.skuName}: 컴퓨팅 매칭 없음 (${cItems.length}건 중)`);
    }
  } catch (err) {
    row.paygItem = null;
    row.sp1Item  = null;
    row.sp3Item  = null;
    row.ri1Item  = null;
    row.ri3Item  = null;
    setStatus('error', `API 실패: ${err.message.slice(0, 100)}`);
    console.error('SQL Database:', err);
  }

  updatePriceCells(row);
  updateTotalsRow();
};
