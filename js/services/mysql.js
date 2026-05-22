// ================================================================
// services/mysql.js — Azure Database for MySQL (Flexible Server)
//
// 이 파일은 다음을 등록합니다.
//   1) window._svcDefs['Azure Database for MySQL']     — 카테고리 정의(옵션 목록)
//   2) MYSQL_INSTANCE_CATALOG                          — 하드웨어별 인스턴스 카탈로그
//   3) window['_buildDetail_Azure_Database_for_MySQL'] — 옵션 → skuName/detail 변환
//   4) window['_resolve_Azure_Database_for_MySQL']     — 시간당 가격 5종 조회
//
// === Azure Database for MySQL Flexible Server 가격 산정 개요 ===
//
// MySQL Flexible Server 청구는 다음 두 라인 아이템의 합입니다.
//
//   (a) 컴퓨팅: vCore 시간당 단가 × 730시간 × HA 배수
//   (b) 스토리지: GB-월 단가 × storageGB × HA 배수
//
// HA 배수 (공식 청구 방식):
//   - HA 없음:         1.0 (기본 + 0)
//   - Same Zone HA:    2.0 (기본 + 보조 복제본, 같은 영역)
//   - Zone Redundant:  2.0 (기본 + 보조 복제본, 다른 영역)
//
// === 예약 가격의 중요한 비즈니스 규칙 ===
//
// Microsoft 공식(Microsoft Q&A 답변, 2024-09-16):
//   "The Retail Price API will only return the 1 vcore cost and if customer
//    has 2 vcore instance then they will purchase 2 quantity of reservation
//    to cover the whole instance."
//
// 따라서 예약 단가는 다음과 같이 보정해야 합니다.
//   adjusted_reservation_hourly = api_reservation_hourly × vCore_count × ha_multiplier
//
// === Azure Retail Prices API 응답 형태(확인된 사례) ===
//
//   serviceName  : "Azure Database for MySQL"
//   productName  : "Azure Database for MySQL Flexible Server Burstable BS Series Compute"
//                  "Azure Database for MySQL Flexible Server General Purpose Ddsv4 Series Compute"
//                  "Azure Database for MySQL Flexible Server Memory Optimized Edsv4 Series Compute"
//                  "Azure Database for MySQL Flexible Server Backup Storage" (백업, 본 도구 제외)
//   skuName      : "B1ms", "D2ds v4", "E4ds v4" 등 (공백 형태 주의)
//                  또는 "1 vCore" (예약 응답)
//   meterName    : "vCore", "B1ms" 등
//   unitOfMeasure: "1 Hour" (컴퓨팅) / "1 GB/Month" (스토리지)
// ================================================================

// ----------------------------------------------------------------
// 1) 카테고리 정의
// ----------------------------------------------------------------
window._svcDefs['Azure Database for MySQL'] = {
  apiServiceName: 'Azure Database for MySQL',
  steps: [
    {
      key:     'deploymentType',
      label:   '배포 유형',
      options: ['Flexible Server'],
    },
    {
      key:     'tier',
      label:   '서비스 계층',
      options: ['Burstable', 'General Purpose', 'Memory Optimized'],
    },
    {
      key:     'hardware',
      label:   '하드웨어',
      options: ['Bsv2-series', 'Ddsv4-series', 'Ddsv5-series',
                'Edsv4-series', 'Edsv5-series'],
    },
    {
      key:      'storageGB',
      label:    '스토리지 (GB / 월)',
      type:     'number',
      min:      20,
      max:      16384,
      step:     1,
      default:  32,
      tooltip:  '월별 청구되는 데이터 스토리지 용량 (GB). MySQL Flexible Server 최소 20GB, 최대 16384GB (16TB).',
    },
    {
      key:     'haEnabled',
      label:   '고가용성 (HA)',
      options: ['비활성', 'Same Zone HA', 'Zone Redundant HA'],
    },
  ],
  instanceField:     true,        // UI 측에서 동적 인스턴스 드롭다운 사용
  instanceParentKey: 'hardware',  // hardware 가 바뀌면 instance 옵션 재구성
};

// ----------------------------------------------------------------
// 2) MySQL 인스턴스 카탈로그
//
// VM 의 VM_INSTANCE_CATALOG 와 동일한 구조. UI 측 renderConfigPanel 이
// 이 객체를 참조해 인스턴스 드롭다운 옵션을 구성합니다.
//
// 사양 출처: Azure Database for MySQL Flexible Server service tiers 공식 문서.
// ----------------------------------------------------------------
var MYSQL_INSTANCE_CATALOG = window.MYSQL_INSTANCE_CATALOG = {
  'Bsv2-series': [
    { name: 'B1ms',  vCPU: 1,  ram: 2   },
    { name: 'B2s',   vCPU: 2,  ram: 4   },
    { name: 'B2ms',  vCPU: 2,  ram: 4   },
    { name: 'B4ms',  vCPU: 4,  ram: 8   },
    { name: 'B8ms',  vCPU: 8,  ram: 16  },
    { name: 'B12ms', vCPU: 12, ram: 24  },
    { name: 'B16ms', vCPU: 16, ram: 32  },
    { name: 'B20ms', vCPU: 20, ram: 40  },
  ],
  'Ddsv4-series': [
    { name: 'D2ds_v4',  vCPU: 2,  ram: 8   },
    { name: 'D4ds_v4',  vCPU: 4,  ram: 16  },
    { name: 'D8ds_v4',  vCPU: 8,  ram: 32  },
    { name: 'D16ds_v4', vCPU: 16, ram: 64  },
    { name: 'D32ds_v4', vCPU: 32, ram: 128 },
    { name: 'D48ds_v4', vCPU: 48, ram: 192 },
    { name: 'D64ds_v4', vCPU: 64, ram: 256 },
  ],
  'Ddsv5-series': [
    { name: 'D2ds_v5',  vCPU: 2,  ram: 8   },
    { name: 'D4ds_v5',  vCPU: 4,  ram: 16  },
    { name: 'D8ds_v5',  vCPU: 8,  ram: 32  },
    { name: 'D16ds_v5', vCPU: 16, ram: 64  },
    { name: 'D32ds_v5', vCPU: 32, ram: 128 },
    { name: 'D48ds_v5', vCPU: 48, ram: 192 },
    { name: 'D64ds_v5', vCPU: 64, ram: 256 },
    { name: 'D96ds_v5', vCPU: 96, ram: 384 },
  ],
  'Edsv4-series': [
    { name: 'E2ds_v4',  vCPU: 2,  ram: 16  },
    { name: 'E4ds_v4',  vCPU: 4,  ram: 32  },
    { name: 'E8ds_v4',  vCPU: 8,  ram: 64  },
    { name: 'E16ds_v4', vCPU: 16, ram: 128 },
    { name: 'E20ds_v4', vCPU: 20, ram: 160 },
    { name: 'E32ds_v4', vCPU: 32, ram: 256 },
    { name: 'E48ds_v4', vCPU: 48, ram: 384 },
    { name: 'E64ds_v4', vCPU: 64, ram: 432 },
  ],
  'Edsv5-series': [
    { name: 'E2ds_v5',  vCPU: 2,  ram: 16  },
    { name: 'E4ds_v5',  vCPU: 4,  ram: 32  },
    { name: 'E8ds_v5',  vCPU: 8,  ram: 64  },
    { name: 'E16ds_v5', vCPU: 16, ram: 128 },
    { name: 'E20ds_v5', vCPU: 20, ram: 160 },
    { name: 'E32ds_v5', vCPU: 32, ram: 256 },
    { name: 'E48ds_v5', vCPU: 48, ram: 384 },
    { name: 'E64ds_v5', vCPU: 64, ram: 432 },
    { name: 'E96ds_v5', vCPU: 96, ram: 672 },
  ],
};

// ----------------------------------------------------------------
// 3) detail 빌더
// ----------------------------------------------------------------
window['_buildDetail_Azure_Database_for_MySQL'] = function (r) {
  const o        = r.options || {};
  const instance = _mysql_findInstance(o.hardware, o.instance);

  r.skuName = o.instance || '';

  const parts = [];
  if (o.tier)        parts.push(o.tier);
  if (instance)      parts.push(`${instance.vCPU}vCPU/${instance.ram}GB`);
  if (o.instance)    parts.push(o.instance);
  if (o.storageGB)   parts.push(`Storage ${o.storageGB}GB`);
  if (o.haEnabled && o.haEnabled !== '비활성') parts.push(`HA: ${o.haEnabled}`);

  r.detail = parts.join(', ');
};

// 인스턴스 카탈로그에서 (hardware, instance name) 으로 사양 찾기
function _mysql_findInstance(hardware, instanceName) {
  const catalog = MYSQL_INSTANCE_CATALOG[hardware];
  if (!catalog) return null;
  return catalog.find(i => i.name === instanceName) || null;
}

// HA 옵션 → 컴퓨팅/스토리지 곱셈 배수
function _mysql_getHaMultiplier(haEnabled) {
  if (haEnabled === 'Same Zone HA')      return 2;
  if (haEnabled === 'Zone Redundant HA') return 2;
  return 1;  // '비활성' 또는 미설정
}

// tier 이름 → productName 매칭 키워드
const MYSQL_TIER_PATTERNS = {
  'Burstable':        ['burstable'],
  'General Purpose':  ['general purpose'],
  'Memory Optimized': ['memory optimized', 'business critical'],  // 일부 응답에서 "Business Critical" 표기
};

// hardware 이름 → productName 매칭 키워드
// 예) "Ddsv4-series" → "Ddsv4 Series" 가 들어 있어야 매칭
const MYSQL_HARDWARE_PATTERNS = {
  'Bsv2-series':  ['burstable', 'b series', 'bs series'],  // Burstable 은 별도 시리즈명 없이 productName 에 burstable 만 표시되는 경우가 많음
  'Ddsv4-series': ['ddsv4'],
  'Ddsv5-series': ['ddsv5'],
  'Edsv4-series': ['edsv4'],
  'Edsv5-series': ['edsv5'],
};

// ================================================================
// 4) 가격 조회 — MySQL 전용 매칭 로직
// ================================================================
window['_resolve_Azure_Database_for_MySQL'] = async function (row, cur) {
  const o = row.options || {};

  // ----- 옵션 정리 / 기본값 -----
  const selectedTier     = o.tier        || 'Burstable';
  const selectedHardware = o.hardware    || 'Bsv2-series';
  const selectedInstance = o.instance    || row.skuName || '';
  const storageGB        = Number(o.storageGB || 0);
  const haEnabled        = o.haEnabled    || '비활성';
  const haMultiplier     = _mysql_getHaMultiplier(haEnabled);

  // 인스턴스가 선택되지 않으면 가격 조회 불가
  if (!selectedInstance) {
    row.paygItem = null;
    row.sp1Item  = null;
    row.sp3Item  = null;
    row.ri1Item  = null;
    row.ri3Item  = null;
    setStatus('error', `${row.skuName || 'MySQL'}: 인스턴스가 선택되지 않았습니다`);
    updatePriceCells(row);
    updateTotalsRow();
    return;
  }

  const instanceSpec = _mysql_findInstance(selectedHardware, selectedInstance);
  const vCoreCount   = instanceSpec ? instanceSpec.vCPU : 0;

  if (vCoreCount === 0) {
    row.paygItem = null;
    row.sp1Item  = null;
    row.sp3Item  = null;
    row.ri1Item  = null;
    row.ri3Item  = null;
    setStatus('error', `${row.skuName}: 인스턴스 사양을 카탈로그에서 찾을 수 없습니다`);
    updatePriceCells(row);
    updateTotalsRow();
    return;
  }

  try {
    // ----- API 조회: Consumption + Reservation 병렬 -----
    const [cItems, rItems] = await Promise.all([
      apiFetch(
        { serviceName: 'Azure Database for MySQL', armRegionName: row.region, priceType: 'Consumption' },
        cur, 800, 5, { pageSize: 200, expectedSizeKB: 400 }
      ),
      apiFetch(
        { serviceName: 'Azure Database for MySQL', armRegionName: row.region, priceType: 'Reservation' },
        cur, 400, 3, { pageSize: 200, expectedSizeKB: 200 }
      ).catch(() => []),
    ]);

    // ============================================================
    // 헬퍼: 텍스트 매칭 함수들
    // ============================================================

    // skuName 이 인스턴스 이름과 일치 ("D2ds_v4" / "D2ds v4" 모두 허용)
    const matchesInstance = (item) => {
      const skuName    = (item.skuName   || '').toLowerCase();
      const meterName  = (item.meterName || '').toLowerCase();
      const target     = selectedInstance.toLowerCase();
      const targetAlt  = target.replace(/_/g, ' ');     // "d2ds v4" 형태
      return skuName === target || skuName === targetAlt ||
             meterName === target || meterName === targetAlt;
    };

    // tier 매칭
    const matchesTier = (item) => {
      const productName = (item.productName || '').toLowerCase();
      const patterns = MYSQL_TIER_PATTERNS[selectedTier] || [selectedTier.toLowerCase()];
      return patterns.some(p => productName.includes(p));
    };

    // hardware 매칭 (Burstable 은 별도 시리즈명 없이 productName 에 burstable 만 있는 경우 존재)
    const matchesHardware = (item) => {
      const productName = (item.productName || '').toLowerCase();
      const patterns = MYSQL_HARDWARE_PATTERNS[selectedHardware] || [selectedHardware.toLowerCase()];
      return patterns.some(p => productName.includes(p));
    };

    // 컴퓨팅 항목인지 (스토리지/백업/IOPS 등 제외)
    const isComputeMeter = (item) => {
      const productName = (item.productName || '').toLowerCase();
      const meterName   = (item.meterName   || '').toLowerCase();
      if (productName.includes('storage')) return false;
      if (productName.includes('backup'))  return false;
      if (meterName.includes('storage'))   return false;
      if (meterName.includes('backup'))    return false;
      if (meterName.includes('iops'))      return false;
      const uom = (item.unitOfMeasure || '').toLowerCase();
      return uom.includes('hour');
    };

    // 정상 PAYG 후보 판정
    const isValidComputeConsumption = (item) => {
      if ((item.type || '').toLowerCase() !== 'consumption') return false;
      if (Number(item.tierMinimumUnits || 0) !== 0)          return false;
      if (!matchesTier(item))     return false;
      if (!matchesHardware(item)) return false;
      if (!matchesInstance(item)) return false;
      if (!isComputeMeter(item))  return false;
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
    // 스토리지 매칭 (월 정액, GB/Month)
    // ============================================================
    const isStorageItem = (item) => {
      if ((item.type || '').toLowerCase() !== 'consumption') return false;
      const productName = (item.productName || '').toLowerCase();
      const meterName   = (item.meterName   || '').toLowerCase();
      const uom         = (item.unitOfMeasure || '').toLowerCase();
      // tier 매칭으로 같은 계층의 스토리지 단가 사용
      if (!matchesTier(item)) return false;
      // 스토리지 미터 식별 (백업 제외)
      const isStorage = productName.includes('storage') || meterName.includes('storage');
      const isBackup  = productName.includes('backup')  || meterName.includes('backup');
      if (!isStorage || isBackup) return false;
      if (!uom.includes('gb')) return false;
      return true;
    };

    const storageCandidates = cItems
      .filter(isStorageItem)
      .sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

    const storageItem        = storageCandidates[0] || null;
    const storageGbUnitPrice = storageItem ? Number(storageItem.unitPrice) : 0;

    // ============================================================
    // 예약 매칭
    //
    // Microsoft 공식: MySQL 예약 응답은 1 vCore 기준 단가만 반환.
    // 따라서 vCore 수만큼 곱해야 실제 인스턴스의 예약 비용.
    // ============================================================
    const isValidReservation = (item) => {
      if ((item.type || '').toLowerCase() !== 'reservation') return false;
      if (!matchesTier(item))     return false;
      if (!matchesHardware(item)) return false;
      // Reservation 응답의 skuName 은 "1 vCore" 또는 "Flexible Server" 형태가 많음
      // 인스턴스 이름 매칭 대신 hardware/tier 매칭만으로 충분
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

    // 예약 응답을 시간당 단가로 정규화 (총액 → 시간당)
    const ri1OneVCoreHourly = ri1Candidates[0] ? normalizeReservationPrice(ri1Candidates[0], 1) : null;
    const ri3OneVCoreHourly = ri3Candidates[0] ? normalizeReservationPrice(ri3Candidates[0], 3) : null;

    // ============================================================
    // 최종 PAYG 시간당 단가 계산
    //
    // monthly_total = (compute_hourly × 730 + storage_per_gb × storageGB) × ha_multiplier
    // hourly_equiv  = monthly_total / 730
    // ============================================================
    let paygItem = null;
    if (computeItem) {
      const computeHourly     = Number(computeItem.unitPrice);
      const storageMonthly    = storageGbUnitPrice * storageGB;
      const baseMonthly       = computeHourly * 730 + storageMonthly;
      const monthlyTotal      = baseMonthly * haMultiplier;
      const hourlyEquivalent  = monthlyTotal / 730;

      paygItem = {
        ...computeItem,
        unitPrice:        hourlyEquivalent,
        retailPrice:      hourlyEquivalent,
        unitOfMeasure:    haMultiplier > 1 ? `1 Hour (equivalent, HA×${haMultiplier})` : '1 Hour (equivalent)',
        _computeHourly:   computeHourly,
        _storageMonthly:  storageMonthly,
        _storageGB:       storageGB,
        _storageGbUnit:   storageGbUnitPrice,
        _haMultiplier:    haMultiplier,
        _vCoreCount:      vCoreCount,
      };
    }

    // 예약: 1 vCore 단가 × vCore 수 × HA 배수 + 스토리지 PAYG
    const buildReservationItem = (oneVCoreHourly) => {
      if (!oneVCoreHourly) return null;
      const apiHourly         = Number(oneVCoreHourly.unitPrice);
      const computeHourly     = apiHourly * vCoreCount;
      const storageMonthly    = storageGbUnitPrice * storageGB;
      const baseMonthly       = computeHourly * 730 + storageMonthly;
      const monthlyTotal      = baseMonthly * haMultiplier;
      const hourlyEquivalent  = monthlyTotal / 730;
      return {
        ...oneVCoreHourly,
        unitPrice:           hourlyEquivalent,
        retailPrice:         hourlyEquivalent,
        unitOfMeasure:       haMultiplier > 1 ? `1 Hour (equivalent, HA×${haMultiplier})` : '1 Hour (equivalent)',
        _apiOneVCoreHourly:  apiHourly,
        _computeHourly:      computeHourly,
        _storageMonthly:     storageMonthly,
        _storageGB:          storageGB,
        _haMultiplier:       haMultiplier,
        _vCoreCount:         vCoreCount,
      };
    };

    const ri1Item = buildReservationItem(ri1OneVCoreHourly);
    const ri3Item = buildReservationItem(ri3OneVCoreHourly);

    // ============================================================
    // 행에 가격 항목 반영
    // ============================================================
    row.paygItem = paygItem;
    row.sp1Item  = null;  // MySQL 은 Savings Plan 미지원
    row.sp3Item  = null;
    row.ri1Item  = ri1Item;
    row.ri3Item  = ri3Item;

    if (paygItem) {
      const tags = ['PAYG'];
      if (ri1Item) tags.push('RI1Y');
      if (ri3Item) tags.push('RI3Y');
      if (!storageItem)            tags.push('Storage✗');
      if (haMultiplier > 1)        tags.push(`HA×${haMultiplier}`);
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
    console.error('MySQL:', err);
  }

  updatePriceCells(row);
  updateTotalsRow();
};
