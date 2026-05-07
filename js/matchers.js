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
    const isPaidOs = o.os && o.os !== 'Linux';
    if (isPaidOs && o.license) parts.push(o.license);
    r.detail = parts.join(', ');
  } else if (r.serviceCategory === 'Disk') {
    r.skuName = o.instance || '';
    const disk = (DISK_CATALOG[o.storageType] || []).find(d => d.name === o.instance);
    const parts = [];
    if (o.storageType) parts.push(o.storageType);
    if (disk) parts.push(`${disk.size}GB`);
    if (o.redundancy) parts.push(o.redundancy);
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
 * Virtual Machine 가격 조회 (v31: Consumption + Reservation 병렬 호출)
 */
async function resolveVmPrices(row, currencyCode) {
  const armSku = `Standard_${row.skuName}`;
  const baseFilter = {
    serviceName: 'Virtual Machines',
    armRegionName: row.region,
    armSkuName: armSku,
  };

  try {
    // [v31] Consumption + Reservation 병렬 호출
    const [consumptionItems, reservationItems] = await Promise.all([
      apiFetch(
        { ...baseFilter, priceType: 'Consumption' },
        currencyCode, 200, 3
      ),
      apiFetch(
        { ...baseFilter, priceType: 'Reservation' },
        currencyCode, 200, 3
      ).catch(() => []),
    ]);

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

    const osChoice = row.options.os || 'Linux';
    const tierChoice = row.options.tier || 'Standard';
    const licenseChoice = row.options.license || '라이선스 포함';
    const isAHB = (licenseChoice === 'Azure Hybrid Benefit');
    const isPaidOs = (osChoice !== 'Linux');

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

    const pickLowest = (arr) => {
      arr.sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
      return arr[0] || null;
    };
    const linuxPayg   = pickLowest(consumptionItems.filter(it => baseConsumptionFilter(it) && isLinux(it)));
    const windowsPayg = pickLowest(consumptionItems.filter(it => baseConsumptionFilter(it) && isWindows(it)));
    const rhelPayg    = pickLowest(consumptionItems.filter(it => baseConsumptionFilter(it) && isRHEL(it)));
    const susePayg    = pickLowest(consumptionItems.filter(it => baseConsumptionFilter(it) && isSUSE(it)));

    let paygOsIncluded = null;
    if (osChoice === 'Linux') paygOsIncluded = linuxPayg;
    else if (osChoice === 'Windows') paygOsIncluded = windowsPayg;
    else if (osChoice.includes('Red Hat')) paygOsIncluded = rhelPayg;
    else if (osChoice === 'SUSE') paygOsIncluded = susePayg;

    let licenseHourly = 0;
    if (isPaidOs && paygOsIncluded && linuxPayg) {
      const diff = Number(paygOsIncluded.unitPrice) - Number(linuxPayg.unitPrice);
      licenseHourly = diff > 0 ? diff : 0;
    }

    let payg;
    if (!isPaidOs) {
      payg = linuxPayg;
    } else if (isAHB) {
      payg = linuxPayg ? {
        ...linuxPayg,
        _ahbAppliedFrom: paygOsIncluded ? paygOsIncluded.productName : null,
        _licenseMode: 'AHB',
      } : null;
    } else {
      payg = paygOsIncluded ? {
        ...paygOsIncluded,
        _licenseMode: 'License-included',
      } : null;
    }

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
    extractSp(linuxPayg);
    if (!sp1Base || !sp3Base) extractSp(paygOsIncluded);
    if (!sp1Base || !sp3Base) {
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

    const ri1Item = (isPaidOs && !isAHB) ? addLicenseToHourly(ri1Base, licenseHourly) : ri1Base;
    const ri3Item = (isPaidOs && !isAHB) ? addLicenseToHourly(ri3Base, licenseHourly) : ri3Base;

    row.paygItem = payg;
    row.sp1Item = sp1;
    row.sp3Item = sp3;
    row.ri1Item = ri1Item;
    row.ri3Item = ri3Item;

    console.group(`[VM] ${row.skuName} / OS=${osChoice} / License=${licenseChoice} / ${row.region} / ${currencyCode}`);
    console.log(`Cons:${consumptionItems.length} / Res:${reservationItems.length}`);
    console.log(`Linux PAYG:   ${linuxPayg   ? linuxPayg.unitPrice   + '/h' : '없음'}`);
    console.log(`Windows PAYG: ${windowsPayg ? windowsPayg.unitPrice + '/h' : '없음'}`);
    if (payg) console.log(`✓ PAYG 최종: ${payg.unitPrice}/h`);
    if (sp1)  console.log(`✓ SP 1Y: ${sp1.unitPrice}/h`);
    if (sp3)  console.log(`✓ SP 3Y: ${sp3.unitPrice}/h`);
    if (ri1Item) console.log(`✓ RI 1Y: ${ri1Item.unitPrice}/h`);
    if (ri3Item) console.log(`✓ RI 3Y: ${ri3Item.unitPrice}/h`);
    console.groupEnd();

    if (payg) {
      const tags = ['PAYG'];
      if (sp1) tags.push('SP1Y');
      if (sp3) tags.push('SP3Y');
      if (ri1Item) tags.push('RI1Y');
      if (ri3Item) tags.push('RI3Y');
      const licTag = isPaidOs ? (isAHB ? ' · AHB' : ' · 라이선스포함') : '';
      setStatus('ok', `${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${Number(payg.unitPrice).toFixed(4)}/h${licTag} · Cons:${consumptionItems.length}/Res:${reservationItems.length}`);
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
 * Disk(Storage Managed Disks) 가격 조회 (v31)
 * 카테고리명이 'Disk'로 변경됨
 */
async function resolveStoragePrices(row, currencyCode) {
  const o = row.options || {};
  const storageType = o.storageType || 'Premium SSD Managed Disks';
  const redundancy = o.redundancy || 'LRS';
  const txUnits = Number(o.transactionUnits || 0);
  const skuFull = `${row.skuName} ${redundancy}`;

  try {
    // [v31] 디스크 단가 + 트랜잭션 + RI 병렬 호출
    const diskPromise = apiFetch(
      {
        serviceName: 'Storage',
        armRegionName: row.region,
        productName: storageType,
        skuName: skuFull,
        priceType: 'Consumption',
      },
      currencyCode, 100, 2
    );

    const txPromise = (storageType !== 'Premium SSD Managed Disks' && txUnits > 0)
      ? apiFetch(
          {
            serviceName: 'Storage',
            armRegionName: row.region,
            productName: storageType,
            priceType: 'Consumption',
          },
          currencyCode, 200, 3
        )
      : Promise.resolve([]);

    const riPromise = apiFetch(
      {
        serviceName: 'Storage',
        armRegionName: row.region,
        productName: storageType,
        priceType: 'Reservation',
      },
      currencyCode, 200, 2
    ).catch(() => []);

    const [diskItems, txItemsRaw, reservationItems] = await Promise.all([diskPromise, txPromise, riPromise]);

    const expectedDiskMeter = `${row.skuName} ${redundancy} Disk`.toLowerCase();
    const isPlainDisk = (it) => {
      const meter = (it.meterName || '').toLowerCase();
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
      if (!uom.includes('month')) return false;
      if (!isPlainDisk(it)) return false;
      const meter = (it.meterName || '').toLowerCase();
      return meter === expectedDiskMeter ||
             meter.startsWith(`${row.skuName.toLowerCase()} ${redundancy.toLowerCase()}`);
    });
    diskCands.sort((a, b) => {
      const aExact = (a.meterName || '').toLowerCase() === expectedDiskMeter ? 0 : 1;
      const bExact = (b.meterName || '').toLowerCase() === expectedDiskMeter ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return Number(a.unitPrice || 0) - Number(b.unitPrice || 0);
    });
    const disk = diskCands[0] || null;

    let txItem = null;
    let allTxCands = [];
    if (storageType !== 'Premium SSD Managed Disks' && txUnits > 0) {
      allTxCands = txItemsRaw.filter(it => {
        if ((it.type || '').toLowerCase() !== 'consumption') return false;
        const uom = (it.unitOfMeasure || '').toLowerCase();
        return uom.includes('10k') || uom.includes('10,000') || uom.includes('10000');
      });
      let txCands = allTxCands.filter(it => {
        const meter = (it.meterName || '').toLowerCase();
        const sku = (it.skuName || '').toLowerCase();
        const redLow = redundancy.toLowerCase();
        const inMeter = meter.includes('operation') || meter.includes('transaction');
        const hasRed = meter.includes(redLow) || sku.includes(redLow);
        return inMeter && hasRed;
      });
      if (txCands.length === 0) {
        txCands = allTxCands.filter(it => {
          const meter = (it.meterName || '').toLowerCase();
          const sku = (it.skuName || '').toLowerCase();
          return meter.includes(redundancy.toLowerCase()) || sku.includes(redundancy.toLowerCase());
        });
      }
      if (txCands.length === 0) txCands = allTxCands;
      txCands.sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
      txItem = txCands[0] || null;
    }

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
        _diskMonthly: Number(disk.unitPrice),
        _txMonthly: txItem ? Number(txItem.unitPrice) * txUnits : 0,
        _txUnitPrice: txItem ? Number(txItem.unitPrice) : 0,
        _txUnits: txUnits,
        _totalMonthly: monthly,
      };
    }

    let ri1Item = null;
    const ri1Cands = reservationItems.filter(it => {
      if ((it.type || '').toLowerCase() !== 'reservation') return false;
      if (!/1\s*year/i.test(String(it.reservationTerm || ''))) return false;
      const sku = (it.skuName || '').toLowerCase();
      return sku.includes(row.skuName.toLowerCase()) && sku.includes(redundancy.toLowerCase());
    }).sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

    if (ri1Cands[0]) {
      const total = Number(ri1Cands[0].unitPrice);
      const ri1Monthly = total / 12;
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

    row.paygItem = payg;
    row.sp1Item = null;
    row.sp3Item = null;
    row.ri1Item = ri1Item;
    row.ri3Item = null;

    console.group(`[Disk] ${row.skuName} ${redundancy} / ${storageType} / tx=${txUnits} / ${row.region}`);
    console.log(`디스크 응답: ${diskItems.length}건, 매칭: ${diskCands.length}건 (기대: "${expectedDiskMeter}")`);
    if (disk) console.log(`✓ 디스크: meter="${disk.meterName}" / ${disk.unitPrice}/월`);
    else console.warn(`✗ 디스크 매칭 실패`);
    console.log(`월 비용 = ${breakdownParts.join(' + ')} = ${monthly.toFixed(4)}/월`);
    if (ri1Item) console.log(`✓ RI 1Y: 약정총액 ${ri1Item._originalUnitPrice} → 월 ${ri1Item._totalMonthly.toFixed(4)}`);
    console.groupEnd();

    if (payg) {
      const tags = ['PAYG'];
      if (ri1Item) tags.push('RI1Y');
      setStatus('ok', `${row.skuName} ${redundancy} 완료 [${tags.join(', ')}] · ${monthly.toFixed(2)}/월`);
    } else {
      setStatus('error', `${row.skuName} ${redundancy}: 디스크 매칭 실패 - F12 콘솔 확인`);
    }
  } catch (err) {
    row.paygItem = null; row.sp1Item = null; row.sp3Item = null;
    row.ri1Item = null; row.ri3Item = null;
    setStatus('error', `Disk 조회 실패: ${err.message.slice(0, 100)}`);
    console.error('Disk 가격 조회 실패:', err);
  }
  updatePriceCells(row);
  updateTotalsRow();
}


/**
 * VPN Gateway 가격 조회 (v31: 구조 유지, Disk 명칭 변경 외 동일)
 */
async function resolveVpnGatewayPrices(row, currencyCode) {
  const o = row.options || {};
  const sku = o.sku || row.skuName || '';
  const gatewayHours = Number(o.gatewayHours !== undefined && o.gatewayHours !== '' ? o.gatewayHours : 730);
  const extraS2s = Number(o.extraS2sTunnels || 0);
  const extraP2s = Number(o.extraP2sConnections || 0);
  const vnetGB = Number(o.vnetGB || 0);

  let allItems = [];
  let gateway = null;
  let s2sItem = null;
  let p2sItem = null;
  let vnetItem = null;
  let gwCandsAll = [];
  let s2sCandsAll = [];
  let p2sCandsAll = [];
  let vnetCandsAll = [];
  let vnetSearchSteps = [];
  let errors = [];

  try {
    allItems = await apiFetch(
      { serviceName: 'VPN Gateway', armRegionName: row.region, priceType: 'Consumption' },
      currencyCode, 200, 3
    );
  } catch (err) {
    errors.push(`VPN Gateway 조회 실패: ${err.message}`);
    row.paygItem = null; row.sp1Item = null; row.sp3Item = null;
    row.ri1Item = null; row.ri3Item = null;
    setStatus('error', `VPN Gateway 조회 실패: ${err.message.slice(0, 100)}`);
    updatePriceCells(row);
    updateTotalsRow();
    return;
  }

  const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  const skuNorm = normalize(sku);

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
  } catch (err) { errors.push(`게이트웨이 매칭 실패: ${err.message}`); }

  if (extraS2s > 0) {
    try {
      s2sCandsAll = allItems.filter(it => {
        if ((it.type || '').toLowerCase() !== 'consumption') return false;
        const uom = (it.unitOfMeasure || '').toLowerCase();
        if (!uom.includes('hour')) return false;
        const meter = (it.meterName || '').toLowerCase();
        if (meter.includes('p2s') || meter.includes('point-to-site')) return false;
        return meter.includes('s2s') || meter.includes('site-to-site') || meter.includes('tunnel');
      }).sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
      s2sItem = s2sCandsAll[0] || null;
    } catch (err) { errors.push(`S2S 매칭 실패: ${err.message}`); }
  }

  if (extraP2s > 0) {
    try {
      p2sCandsAll = allItems.filter(it => {
        if ((it.type || '').toLowerCase() !== 'consumption') return false;
        const uom = (it.unitOfMeasure || '').toLowerCase();
        if (!uom.includes('hour')) return false;
        const meter = (it.meterName || '').toLowerCase();
        if (meter.includes('s2s') || meter.includes('site-to-site') || meter.includes('tunnel')) return false;
        return meter.includes('p2s') || meter.includes('point-to-site') || meter.includes('connection');
      }).sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
      p2sItem = p2sCandsAll[0] || null;
    } catch (err) { errors.push(`P2S 매칭 실패: ${err.message}`); }
  }

  const ZONE_MAP = {
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
    const all = `${it.meterName || ''} ${it.productName || ''} ${it.skuName || ''}`.toLowerCase();
    return all.includes('inter-virtual network') || all.includes('inter virtual network') ||
           all.includes('inter-vnet') || all.includes('inter vnet') ||
           all.includes('vnet to vnet') || all.includes('vnet-to-vnet') ||
           all.includes('intervnet') ||
           (all.includes('peering') && all.includes('out')) ||
           (all.includes('outbound') && (all.includes('vnet') || all.includes('virtual network')));
  };

  const isVpnEgress = (it) => {
    const all = `${it.meterName || ''} ${it.productName || ''} ${it.skuName || ''}`.toLowerCase();
    if (all.includes('inter-virtual network') || all.includes('inter virtual network') ||
        all.includes('inter-vnet') || all.includes('inter vnet') ||
        all.includes('vnet to vnet') || all.includes('vnet-to-vnet') ||
        all.includes('peering') || all.includes('inter-region') ||
        all.includes('cross region') || all.includes('inter-continent')) return false;
    return all.includes('vpn') || all.includes('data transfer');
  };

  const filterByType = (gbCands, type) => {
    if (type === 'VNET 간') return gbCands.filter(it => Number(it.unitPrice || 0) > 0 && isVnetOutbound(it));
    return gbCands.filter(it => isVpnEgress(it));
  };

  const sortCands = (cands) => {
    const zoneRe = new RegExp(`zone\\s*${userZone}\\b`, 'i');
    const checkZone = (it) => zoneRe.test(it.meterName||'') || zoneRe.test(it.skuName||'') || zoneRe.test(it.productName||'');
    return cands.slice().sort((a, b) => {
      const aZone = checkZone(a) ? 0 : 1;
      const bZone = checkZone(b) ? 0 : 1;
      if (aZone !== bZone) return aZone - bZone;
      const aOut = /\bout\b|outbound/i.test(a.meterName||'') ? 0 : 1;
      const bOut = /\bout\b|outbound/i.test(b.meterName||'') ? 0 : 1;
      if (aOut !== bOut) return aOut - bOut;
      return Number(a.unitPrice||0) - Number(b.unitPrice||0);
    });
  };

  const makeCandidateId = (it) => it.meterId || `${it.serviceName}|${it.armRegionName}|${it.meterName}|${it.unitPrice}`;

  if (vnetGB > 0) {
    let allTypeMatched = [];
    try {
      const cands1 = filterByType(extractGbCands(allItems), transferType);
      if (cands1.length > 0) { allTypeMatched = allTypeMatched.concat(cands1); vnetSearchSteps.push(`VPN응답 ${cands1.length}건`); }
      else {
        const gbAll = extractGbCands(allItems);
        const gbPos = gbAll.filter(it => Number(it.unitPrice||0) > 0);
        if (gbPos.length > 0) { allTypeMatched = allTypeMatched.concat(gbPos); vnetSearchSteps.push(`VPN응답 GB폴백 ${gbPos.length}건`); }
      }
    } catch (err) { errors.push(`VNET 1차: ${err.message}`); }

    if (allTypeMatched.length === 0) {
      try {
        const narrowItems = await apiFetch(
          { serviceName: 'Bandwidth', __raw: "contains(meterName, 'Inter-Virtual Network')", priceType: 'Consumption' },
          currencyCode, 200, 2, { pageSize: 200, expectedSizeKB: 100 }
        );
        const cands = filterByType(extractGbCands(narrowItems), transferType);
        if (cands.length > 0) { allTypeMatched = allTypeMatched.concat(cands); vnetSearchSteps.push(`Bandwidth좁은필터 ${cands.length}건`); }
      } catch (err) { vnetSearchSteps.push(`Bandwidth좁은필터 실패: ${err.message.slice(0,40)}`); }
    }

    if (allTypeMatched.length === 0) {
      try {
        const vnetSvcItems = await apiFetch(
          { serviceName: 'Virtual Network', priceType: 'Consumption' },
          currencyCode, 2000, 5, { pageSize: 1000, expectedSizeKB: 800 }
        );
        const cands = filterByType(extractGbCands(vnetSvcItems), transferType);
        if (cands.length > 0) { allTypeMatched = allTypeMatched.concat(cands); vnetSearchSteps.push(`VirtualNetwork ${cands.length}건`); }
      } catch (err) { vnetSearchSteps.push(`VirtualNetwork 실패: ${err.message.slice(0,40)}`); }
    }

    if (allTypeMatched.length === 0) {
      try {
        const bandwidthItems = await apiFetch(
          { serviceName: 'Bandwidth', priceType: 'Consumption' },
          currencyCode, 5000, 10, { pageSize: 500, expectedSizeKB: 2000 }
        );
        const cands = filterByType(extractGbCands(bandwidthItems), transferType);
        if (cands.length > 0) { allTypeMatched = allTypeMatched.concat(cands); vnetSearchSteps.push(`Bandwidth광범위 ${cands.length}건`); }
      } catch (err) { vnetSearchSteps.push(`Bandwidth광범위 실패: ${err.message.slice(0,40)}`); }
    }

    const uniqMap = new Map();
    allTypeMatched.forEach(it => { const id = makeCandidateId(it); if (!uniqMap.has(id)) uniqMap.set(id, it); });
    vnetCandsAll = sortCands(Array.from(uniqMap.values()));

    if (vnetCandsAll.length > 0) {
      vnetItem = vnetCandsAll[0];
    } else if (transferType === 'VPN') {
      vnetItem = { meterName: `[VPN zone ${userZone} 내 무료]`, skuName: 'Free', unitPrice: 0, retailPrice: 0, unitOfMeasure: '1 GB', currencyCode, productName: 'VPN intra-zone', serviceName: 'VPN Gateway' };
    }
  }

  let monthly = 0, breakdown = [];
  let gwMonthly=0, s2sMonthly=0, p2sMonthly=0, vnetMonthly=0;
  let gwHourly=0, s2sHourly=0, p2sHourly=0, vnetGbPrice=0;

  if (gateway) { gwHourly=Number(gateway.unitPrice); gwMonthly=gwHourly*gatewayHours; monthly+=gwMonthly; breakdown.push(`GW ${gwHourly.toFixed(4)}/h×${gatewayHours}h`); }
  if (s2sItem && extraS2s>0) { s2sHourly=Number(s2sItem.unitPrice); s2sMonthly=s2sHourly*extraS2s*gatewayHours; monthly+=s2sMonthly; breakdown.push(`S2S×${extraS2s}`); }
  if (p2sItem && extraP2s>0) { p2sHourly=Number(p2sItem.unitPrice); p2sMonthly=p2sHourly*extraP2s*gatewayHours; monthly+=p2sMonthly; breakdown.push(`P2S×${extraP2s}`); }
  if (vnetItem && vnetGB>0) { vnetGbPrice=Number(vnetItem.unitPrice); vnetMonthly=vnetGbPrice*vnetGB; monthly+=vnetMonthly; breakdown.push(`VNET ${vnetGB}GB`); }

  const hourlyEquivalent = monthly / 730;

  let payg = null;
  if (gateway) {
    payg = { ...gateway, unitPrice: hourlyEquivalent, retailPrice: hourlyEquivalent, unitOfMeasure: '1 Hour (equivalent)', _billingMode: 'monthly', _monthlyTotal: monthly, _gwMonthly: gwMonthly, _s2sMonthly: s2sMonthly, _p2sMonthly: p2sMonthly, _vnetMonthly: vnetMonthly, _gwHourly: gwHourly, _s2sHourly: s2sHourly, _p2sHourly: p2sHourly, _vnetGbPrice: vnetGbPrice, _gatewayHours: gatewayHours, _extraS2s: extraS2s, _extraP2s: extraP2s, _vnetGB: vnetGB, _partialErrors: errors.length > 0 ? errors : undefined };
  }

  row.paygItem = payg; row.sp1Item = null; row.sp3Item = null; row.ri1Item = null; row.ri3Item = null;

  console.group(`[VPN Gateway] sku=${sku} / zone=${userZone} / ${row.region}`);
  console.log(`전체응답: ${allItems.length}건`);
  if (gateway) console.log(`✓ GW: ${gateway.meterName} = ${gateway.unitPrice}/h`);
  else console.warn(`✗ GW 매칭실패 (sku=${sku})`);
  if (vnetGB>0) { console.log(`VNET 검색: ${vnetSearchSteps.join(' → ')}`); if (vnetItem) console.log(`✓ VNET: ${vnetItem.meterName} = ${vnetItem.unitPrice}/GB`); }
  console.log(`총 월비용 = ${monthly.toFixed(2)}/월`);
  if (errors.length>0) console.warn(`부분실패: ${errors.join(' | ')}`);
  console.groupEnd();

  if (payg) {
    const tags = [gateway?'GW✓':'GW✗'];
    if (extraS2s>0) tags.push(s2sItem?'S2S✓':'S2S✗');
    if (extraP2s>0) tags.push(p2sItem?'P2S✓':'P2S✗');
    if (vnetGB>0) tags.push(vnetItem?'VNET✓':'VNET✗');
    setStatus('ok', `${sku} 완료 [${tags.join(', ')}] · ${monthly.toFixed(2)}/월${errors.length>0?' (부분실패)':''}`);
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

  if (row.serviceCategory === 'Virtual Machine') return await resolveVmPrices(row, cur);
  // 'Storage' → 'Disk' 로 명칭 변경
  if (row.serviceCategory === 'Disk') return await resolveStoragePrices(row, cur);
  if (row.serviceCategory === 'VPN Gateway') return await resolveVpnGatewayPrices(row, cur);

  try {
    const baseFilter = { serviceName: def.apiServiceName, armRegionName: row.region };

    if (row.serviceCategory === 'Azure Files') {
      const tier = row.options.fileTier || 'Premium';
      const fileProductMap = { 'Premium':'Premium Files', 'Hot':'General Purpose v2 Files', 'Cool':'Cool Files', 'Transaction Optimized':'General Purpose v2 Files' };
      const pn = fileProductMap[tier];
      if (pn) baseFilter.productName = pn;
    } else if (row.serviceCategory === 'Blob Storage') {
      const tier = row.options.blobTier || 'Hot';
      const blobProductMap = { 'Hot':'Hot Block Blob', 'Cool':'Cool Block Blob', 'Cold':'Cold Block Blob', 'Archive':'Archive Block Blob' };
      const pn = blobProductMap[tier];
      if (pn) baseFilter.productName = pn;
    } else if (row.serviceCategory === 'Load Balancer') {
      const tier = row.options.tier || 'Standard';
      baseFilter.productName = `${tier} Load Balancer`;
    } else if (row.serviceCategory === 'Application Gateway') {
      baseFilter.skuName = row.skuName;
    } else if (row.serviceCategory === 'Public IP') {
      baseFilter.productName = 'IP Addresses';
    } else if (row.serviceCategory === 'Azure Firewall') {
      const tier = row.options.tier || 'Standard';
      baseFilter.productName = `Azure Firewall ${tier}`;
    } else if (row.serviceCategory === 'Azure SQL Database') {
      const tier = row.options.tier || 'General Purpose';
      baseFilter.productName = `SQL Database Single/Elastic Pool ${tier} - Compute Gen5`;
    } else if (row.serviceCategory === 'App Service') {
      baseFilter.skuName = row.skuName || row.options.size || '';
    } else if (row.serviceCategory === 'Azure Bastion') {
      const tier = row.options.tier || 'Basic';
      baseFilter.productName = `Azure Bastion ${tier}`;
    } else if (row.serviceCategory === 'NAT Gateway') {
      baseFilter.productName = 'NAT Gateway';
    }

    // [v31] Consumption + Reservation 병렬 호출
    const supportsReservation = ['Azure SQL Database'].includes(row.serviceCategory);
    const [consumptionItems, reservationItems] = await Promise.all([
      apiFetch({ ...baseFilter, priceType: 'Consumption' }, cur, 200, 3),
      supportsReservation
        ? apiFetch({ ...baseFilter, priceType: 'Reservation' }, cur, 200, 3).catch(() => [])
        : Promise.resolve([]),
    ]);

    const matchesConsumption = (it) => {
      if (row.serviceCategory === 'Azure Files') {
        const red = row.options.redundancy || 'LRS';
        const sku = it.skuName || '';
        const meter = (it.meterName || '').toLowerCase();
        const metric = (row.options.metric || 'Data Stored').toLowerCase();
        return sku.includes(red) && meter.includes(metric.replace('data stored','stored'));
      }
      if (row.serviceCategory === 'Blob Storage') {
        return (it.skuName || '').includes(row.options.redundancy || 'LRS');
      }
      if (row.serviceCategory === 'Load Balancer') {
        return (it.meterName || '').toLowerCase().includes((row.options.metric || 'Rules').toLowerCase());
      }
      if (row.serviceCategory === 'Public IP') {
        const sku = it.skuName || '';
        const ipType = row.options.ipType || 'Static';
        const skuTarget = row.options.sku || 'Standard';
        return sku.includes(skuTarget) && sku.includes(ipType);
      }
      if (row.serviceCategory === 'Azure Firewall') {
        return (it.meterName || '').toLowerCase().includes((row.options.metric || 'Deployment').toLowerCase());
      }
      if (row.serviceCategory === 'Application Gateway') {
        return (it.skuName || '').includes(row.skuName);
      }
      if (row.serviceCategory === 'Azure Bastion') return true;
      if (row.serviceCategory === 'NAT Gateway') {
        return (it.meterName || '').toLowerCase().includes((row.options.metric || 'Resource Hour').toLowerCase());
      }
      const sku = it.skuName || it.armSkuName || '';
      return sku === row.skuName;
    };

    const notSpot = (it) => {
      const sku = (it.skuName || '').toLowerCase();
      const meter = (it.meterName || '').toLowerCase();
      const type = (it.type || '').toLowerCase();
      return !sku.includes('spot') && !meter.includes('spot') &&
             !sku.includes('low priority') && !meter.includes('low priority') &&
             type !== 'devtestconsumption';
    };

    const paygCandidates = consumptionItems.filter(it => {
      if ((it.type || '').toLowerCase() !== 'consumption') return false;
      if (!matchesConsumption(it)) return false;
      if (!notSpot(it)) return false;
      return true;
    });
    paygCandidates.sort((a, b) => {
      const ta = Number(a.tierMinimumUnits || 0);
      const tb = Number(b.tierMinimumUnits || 0);
      if (ta !== tb) return ta - tb;
      return Number(a.unitPrice || 0) - Number(b.unitPrice || 0);
    });
    const payg = paygCandidates[0] || null;

    console.group(`[가격조회] ${row.serviceCategory} / ${row.skuName}`);
    console.log('Consumption 응답:', consumptionItems.length, '건 / PAYG 후보:', paygCandidates.length, '건');
    if (payg) console.log('선택된 PAYG:', payg.meterName, payg.unitPrice);
    console.groupEnd();

    let sp1 = null, sp3 = null;
    const checkSp = (item) => {
      if (!item || !Array.isArray(item.savingsPlan)) return;
      for (const sp of item.savingsPlan) {
        const term = String(sp.term || '').toLowerCase();
        if ((term.includes('1 year') || term === '1' || term.startsWith('1 ')) && !sp1) sp1 = makeSpItem(item, sp);
        else if ((term.includes('3 year') || term === '3' || term.startsWith('3 ')) && !sp3) sp3 = makeSpItem(item, sp);
      }
    };
    checkSp(payg);
    if (!sp1 || !sp3) {
      for (const item of consumptionItems) {
        if (item === payg) continue;
        if ((item.type || '').toLowerCase() !== 'consumption') continue;
        if (!matchesConsumption(item)) continue;
        if (!notSpot(item)) continue;
        checkSp(item);
        if (sp1 && sp3) break;
      }
    }

    const matchesReservation = (it) => {
      const sku = it.skuName || it.armSkuName || '';
      return sku === row.skuName;
    };
    const ri1Candidates = reservationItems.filter(it =>
      (it.type || '').toLowerCase() === 'reservation' &&
      /1\s*year/i.test(String(it.reservationTerm || '')) &&
      matchesReservation(it)
    ).sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
    const ri3Candidates = reservationItems.filter(it =>
      (it.type || '').toLowerCase() === 'reservation' &&
      /3\s*year/i.test(String(it.reservationTerm || '')) &&
      matchesReservation(it)
    ).sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));

    const ri1Item = ri1Candidates[0] ? normalizeReservationPrice(ri1Candidates[0], 1) : null;
    const ri3Item = ri3Candidates[0] ? normalizeReservationPrice(ri3Candidates[0], 3) : null;

    row.paygItem = payg || null;
    row.sp1Item = sp1;
    row.sp3Item = sp3;
    row.ri1Item = ri1Item;
    row.ri3Item = ri3Item;

    if (payg) {
      const tags = ['PAYG'];
      if (sp1) tags.push('SP1Y');
      if (sp3) tags.push('SP3Y');
      if (ri1Item) tags.push('RI1Y');
      if (ri3Item) tags.push('RI3Y');
      setStatus('ok', `${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${Number(payg.unitPrice).toFixed(2)}/h · Cons:${consumptionItems.length}`);
    } else {
      setStatus('error', `${row.skuName}: 매칭 항목 없음 (응답 ${consumptionItems.length}건) - F12 콘솔 확인`);
    }
  } catch (err) {
    row.paygItem = null; row.sp1Item = null; row.sp3Item = null;
    row.ri1Item = null; row.ri3Item = null;
    setStatus('error', `API 호출 실패: ${err.message.slice(0, 100)}`);
    console.error('가격 조회 실패:', err);
  }
  updatePriceCells(row);
  updateTotalsRow();
}

function normalizeReservationPrice(item, years) {
  const unitPrice = Number(item.unitPrice);
  const retailPrice = Number(item.retailPrice || item.unitPrice);
  const hoursInTerm = years * 8760;
  let hourlyPrice;
  if (retailPrice > 0 && unitPrice / retailPrice > 1000) {
    hourlyPrice = retailPrice;
  } else {
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
