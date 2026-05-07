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

async function resolveVmPrices(row, currencyCode) {
  const armSku = `Standard_${row.skuName}`;
  const baseFilter = { serviceName: 'Virtual Machines', armRegionName: row.region, armSkuName: armSku };

  try {
    const [consumptionItems, reservationItems] = await Promise.all([
      apiFetch({ ...baseFilter, priceType: 'Consumption' }, currencyCode, 200, 3),
      apiFetch({ ...baseFilter, priceType: 'Reservation' }, currencyCode, 200, 3).catch(() => []),
    ]);

    const isWindows = (it) => /windows/i.test(it.productName || '');
    const isRHEL    = (it) => /red\s*hat/i.test(it.productName || '');
    const isSUSE    = (it) => /suse/i.test(it.productName || '');
    const isLinux   = (it) => !isWindows(it) && !isRHEL(it) && !isSUSE(it);
    const isSpotOrLowPri = (it) => {
      const sku = (it.skuName||'').toLowerCase(), meter = (it.meterName||'').toLowerCase(), pn = (it.productName||'').toLowerCase();
      return sku.includes('spot') || meter.includes('spot') || sku.includes('low priority') || meter.includes('low priority') || pn.includes('low priority');
    };
    const isDevTest = (it) => (it.type||'').toLowerCase() === 'devtestconsumption';
    const skuExactMatch = (it) => {
      const t1 = row.skuName.toLowerCase(), t2 = row.skuName.toLowerCase().replace(/_/g,' ');
      const sku = (it.skuName||'').toLowerCase(), meter = (it.meterName||'').toLowerCase();
      return sku===t1||sku===t2||meter===t1||meter===t2;
    };

    const osChoice = row.options.os || 'Linux';
    const tierChoice = row.options.tier || 'Standard';
    const licenseChoice = row.options.license || '라이선스 포함';
    const isAHB = licenseChoice === 'Azure Hybrid Benefit';
    const isPaidOs = osChoice !== 'Linux';

    const baseConsumptionFilter = (it) => {
      if ((it.type||'').toLowerCase() !== 'consumption') return false;
      if (it.armSkuName !== armSku) return false;
      if (!skuExactMatch(it)) return false;
      if (isDevTest(it)) return false;
      if (tierChoice === 'Spot') { if (!isSpotOrLowPri(it)) return false; }
      else { if (isSpotOrLowPri(it)) return false; }
      if (!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false;
      if (Number(it.tierMinimumUnits||0) !== 0) return false;
      return true;
    };
    const pickLowest = (arr) => { arr.sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0)); return arr[0]||null; };
    const linuxPayg   = pickLowest(consumptionItems.filter(it => baseConsumptionFilter(it) && isLinux(it)));
    const windowsPayg = pickLowest(consumptionItems.filter(it => baseConsumptionFilter(it) && isWindows(it)));
    const rhelPayg    = pickLowest(consumptionItems.filter(it => baseConsumptionFilter(it) && isRHEL(it)));
    const susePayg    = pickLowest(consumptionItems.filter(it => baseConsumptionFilter(it) && isSUSE(it)));

    let paygOsIncluded = null;
    if (osChoice==='Linux') paygOsIncluded=linuxPayg;
    else if (osChoice==='Windows') paygOsIncluded=windowsPayg;
    else if (osChoice.includes('Red Hat')) paygOsIncluded=rhelPayg;
    else if (osChoice==='SUSE') paygOsIncluded=susePayg;

    let licenseHourly = 0;
    if (isPaidOs && paygOsIncluded && linuxPayg) {
      const diff = Number(paygOsIncluded.unitPrice) - Number(linuxPayg.unitPrice);
      licenseHourly = diff > 0 ? diff : 0;
    }

    let payg;
    if (!isPaidOs) payg = linuxPayg;
    else if (isAHB) payg = linuxPayg ? { ...linuxPayg, _licenseMode:'AHB' } : null;
    else payg = paygOsIncluded ? { ...paygOsIncluded, _licenseMode:'License-included' } : null;

    let sp1Base=null, sp3Base=null;
    const extractSp = (item) => {
      if (!item||!Array.isArray(item.savingsPlan)) return;
      for (const sp of item.savingsPlan) {
        const term = String(sp.term||'').toLowerCase();
        if (!sp1Base && (term==='1 year'||term.startsWith('1 year')||term==='1'||term.startsWith('1 '))) sp1Base=makeSpItem(item,sp);
        else if (!sp3Base && (term==='3 year'||term==='3 years'||term.startsWith('3 year')||term==='3'||term.startsWith('3 '))) sp3Base=makeSpItem(item,sp);
      }
    };
    extractSp(linuxPayg); if (!sp1Base||!sp3Base) extractSp(paygOsIncluded);
    if (!sp1Base||!sp3Base) { for (const it of consumptionItems) { if (!baseConsumptionFilter(it)||it===linuxPayg||it===paygOsIncluded) continue; extractSp(it); if (sp1Base&&sp3Base) break; } }

    const addLic = (baseItem, lic) => {
      if (!baseItem) return null;
      const bh=Number(baseItem.unitPrice), total=bh+(lic>0?lic:0);
      return { ...baseItem, unitPrice:total, retailPrice:total, _baseHourly:bh, _licenseHourly:lic, _licenseMode:isAHB?'AHB':'License-included' };
    };
    const sp1 = (isPaidOs&&!isAHB) ? addLic(sp1Base,licenseHourly) : sp1Base;
    const sp3 = (isPaidOs&&!isAHB) ? addLic(sp3Base,licenseHourly) : sp3Base;

    const riAll = reservationItems.filter(it => {
      if ((it.type||'').toLowerCase()!=='reservation') return false;
      if (it.armSkuName!==armSku) return false;
      if (Number(it.tierMinimumUnits||0)!==0) return false;
      if (isSpotOrLowPri(it)) return false;
      if (!skuExactMatch(it)) return false;
      return true;
    });
    const ri1Cands = riAll.filter(it=>/1\s*year/i.test(String(it.reservationTerm||''))).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const ri3Cands = riAll.filter(it=>/3\s*year/i.test(String(it.reservationTerm||''))).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const normRi=(item,years)=>{ if(!item) return null; const t=Number(item.unitPrice); if(!isFinite(t)||t<=0) return null; const h=t/(years*8760); return {...item,unitPrice:h,retailPrice:h,unitOfMeasure:'1 Hour (normalized)',_originalUnitPrice:t,_termYears:years}; };
    const ri1Base=normRi(ri1Cands[0]||null,1), ri3Base=normRi(ri3Cands[0]||null,3);
    const ri1Item=(isPaidOs&&!isAHB)?addLic(ri1Base,licenseHourly):ri1Base;
    const ri3Item=(isPaidOs&&!isAHB)?addLic(ri3Base,licenseHourly):ri3Base;

    row.paygItem=payg; row.sp1Item=sp1; row.sp3Item=sp3; row.ri1Item=ri1Item; row.ri3Item=ri3Item;

    console.group(`[VM] ${row.skuName}/${osChoice}/${licenseChoice}/${row.region}`);
    console.log(`Cons:${consumptionItems.length}/Res:${reservationItems.length}`);
    if (payg) console.log(`✓ PAYG: ${payg.unitPrice}/h`); if (sp1) console.log(`✓ SP1Y: ${sp1.unitPrice}/h`); if (ri1Item) console.log(`✓ RI1Y: ${ri1Item.unitPrice}/h`);
    console.groupEnd();

    if (payg) {
      const tags=['PAYG']; if(sp1)tags.push('SP1Y'); if(sp3)tags.push('SP3Y'); if(ri1Item)tags.push('RI1Y'); if(ri3Item)tags.push('RI3Y');
      setStatus('ok',`${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${Number(payg.unitPrice).toFixed(4)}/h`);
    } else { setStatus('error',`${row.skuName}: 매칭 없음 (${consumptionItems.length}건) - F12 콘솔 확인`); }
  } catch(err) {
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error',`API 호출 실패: ${err.message.slice(0,100)}`); console.error('VM 조회 실패:',err);
  }
  updatePriceCells(row); updateTotalsRow();
}

async function resolveStoragePrices(row, currencyCode) {
  const o = row.options||{};
  const storageType = o.storageType||'Premium SSD Managed Disks';
  const redundancy = o.redundancy||'LRS';
  const txUnits = Number(o.transactionUnits||0);
  const skuFull = `${row.skuName} ${redundancy}`;

  try {
    const [diskItems, txItemsRaw, reservationItems] = await Promise.all([
      apiFetch({ serviceName:'Storage', armRegionName:row.region, productName:storageType, skuName:skuFull, priceType:'Consumption' }, currencyCode, 100, 2),
      (storageType!=='Premium SSD Managed Disks'&&txUnits>0)
        ? apiFetch({ serviceName:'Storage', armRegionName:row.region, productName:storageType, priceType:'Consumption' }, currencyCode, 200, 3)
        : Promise.resolve([]),
      apiFetch({ serviceName:'Storage', armRegionName:row.region, productName:storageType, priceType:'Reservation' }, currencyCode, 200, 2).catch(()=>[]),
    ]);

    const expectedDiskMeter = `${row.skuName} ${redundancy} Disk`.toLowerCase();
    const isPlainDisk = (it) => { const m=(it.meterName||'').toLowerCase(); return !m.includes('mount')&&!m.includes('burst')&&!m.includes('enablement')&&!m.includes('snapshot')&&!m.includes('one-time'); };
    const diskCands = diskItems.filter(it => {
      if ((it.type||'').toLowerCase()!=='consumption') return false;
      if (!(it.unitOfMeasure||'').toLowerCase().includes('month')) return false;
      if (!isPlainDisk(it)) return false;
      const m=(it.meterName||'').toLowerCase();
      return m===expectedDiskMeter||m.startsWith(`${row.skuName.toLowerCase()} ${redundancy.toLowerCase()}`);
    });
    diskCands.sort((a,b)=>{ const ae=(a.meterName||'').toLowerCase()===expectedDiskMeter?0:1,be=(b.meterName||'').toLowerCase()===expectedDiskMeter?0:1; if(ae!==be) return ae-be; return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
    const disk = diskCands[0]||null;

    let txItem=null;
    if (storageType!=='Premium SSD Managed Disks'&&txUnits>0) {
      const allTx = txItemsRaw.filter(it=>{ const u=(it.unitOfMeasure||'').toLowerCase(); return u.includes('10k')||u.includes('10,000')||u.includes('10000'); });
      let txC = allTx.filter(it=>{ const m=(it.meterName||'').toLowerCase(),s=(it.skuName||'').toLowerCase(),r=redundancy.toLowerCase(); return (m.includes('operation')||m.includes('transaction'))&&(m.includes(r)||s.includes(r)); });
      if (!txC.length) txC = allTx.filter(it=>{ const m=(it.meterName||'').toLowerCase(),s=(it.skuName||'').toLowerCase(); return m.includes(redundancy.toLowerCase())||s.includes(redundancy.toLowerCase()); });
      if (!txC.length) txC = allTx;
      txC.sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
      txItem = txC[0]||null;
    }

    const usageHours = Number(row.usage)||730;
    let monthly=0;
    if (disk) monthly+=Number(disk.unitPrice);
    if (txItem&&txUnits>0) monthly+=Number(txItem.unitPrice)*txUnits;
    const hourlyEq = usageHours>0 ? monthly/usageHours : 0;

    let payg=null;
    if (disk) payg={ ...disk, unitPrice:hourlyEq, retailPrice:hourlyEq, unitOfMeasure:'1 Hour (equivalent)', _billingMode:'monthly', _monthlyTotal:monthly, _diskMonthly:Number(disk.unitPrice), _txMonthly:txItem?Number(txItem.unitPrice)*txUnits:0, _totalMonthly:monthly };

    let ri1Item=null;
    const ri1C=reservationItems.filter(it=>{ if((it.type||'').toLowerCase()!=='reservation') return false; if(!/1\s*year/i.test(String(it.reservationTerm||''))) return false; const s=(it.skuName||'').toLowerCase(); return s.includes(row.skuName.toLowerCase())&&s.includes(redundancy.toLowerCase()); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    if (ri1C[0]) {
      const total=Number(ri1C[0].unitPrice), ri1M=total/12;
      const ri1MT=ri1M+(txItem&&txUnits>0?Number(txItem.unitPrice)*txUnits:0);
      const ri1H=usageHours>0?ri1MT/usageHours:0;
      ri1Item={ ...ri1C[0], unitPrice:ri1H, retailPrice:ri1H, unitOfMeasure:'1 Hour (equivalent)', _billingMode:'monthly', _monthlyTotal:ri1MT, _originalUnitPrice:total, _termYears:1, _totalMonthly:ri1MT };
    }

    row.paygItem=payg; row.sp1Item=null; row.sp3Item=null; row.ri1Item=ri1Item; row.ri3Item=null;
    if (payg) setStatus('ok',`${row.skuName} ${redundancy} 완료 · ${monthly.toFixed(2)}/월`);
    else setStatus('error',`${row.skuName}: 디스크 매칭 실패 - F12 콘솔 확인`);
  } catch(err) {
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error',`Disk 조회 실패: ${err.message.slice(0,100)}`); console.error('Disk 조회 실패:',err);
  }
  updatePriceCells(row); updateTotalsRow();
}

/**
 * VPN Gateway 가격 조회 (v32)
 *
 * [핵심 수정] Azure Retail Prices API는 OData contains() 함수를 지원하지 않음.
 * → __raw: "contains(meterName,'...')" 필터를 사용하면 HTTP 400 응답.
 * → VNET 전송 단가 조회 시 contains() 대신 serviceName 필터만 사용하고
 *   클라이언트 측 키워드 필터링으로 대체.
 */
async function resolveVpnGatewayPrices(row, currencyCode) {
  const o = row.options||{};
  const sku = o.sku||row.skuName||'';
  const gatewayHours = Number(o.gatewayHours!==undefined&&o.gatewayHours!==''?o.gatewayHours:730);
  const extraS2s = Number(o.extraS2sTunnels||0);
  const extraP2s = Number(o.extraP2sConnections||0);
  const vnetGB = Number(o.vnetGB||0);

  let allItems=[],gateway=null,s2sItem=null,p2sItem=null,vnetItem=null;
  let gwCandsAll=[],vnetCandsAll=[],vnetSearchSteps=[],errors=[];

  // 1단계: VPN Gateway 전체 조회
  try {
    allItems = await apiFetch(
      { serviceName:'VPN Gateway', armRegionName:row.region, priceType:'Consumption' },
      currencyCode, 200, 3
    );
  } catch(err) {
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error',`VPN Gateway 조회 실패: ${err.message.slice(0,100)}`);
    updatePriceCells(row); updateTotalsRow(); return;
  }

  const normalize = (s) => String(s||'').toLowerCase().replace(/\s+/g,'');
  const skuNorm = normalize(sku);

  // 2단계: 게이트웨이 시간 단가 매칭
  try {
    const isExtra=(it)=>{ const m=(it.meterName||'').toLowerCase(); return m.includes('tunnel')||m.includes('s2s')||m.includes('p2s')||m.includes('connection')||m.includes('data transfer')||m.includes('inter-'); };
    gwCandsAll = allItems.filter(it=>{
      if ((it.type||'').toLowerCase()!=='consumption') return false;
      if (!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false;
      if (isExtra(it)) return false;
      const mN=normalize(it.meterName),sN=normalize(it.skuName);
      return mN===skuNorm||sN===skuNorm||mN.startsWith(skuNorm)||sN.startsWith(skuNorm)||mN.endsWith(skuNorm)||sN.endsWith(skuNorm);
    });
    gwCandsAll.sort((a,b)=>{ const ae=(normalize(a.meterName)===skuNorm||normalize(a.skuName)===skuNorm)?0:1,be=(normalize(b.meterName)===skuNorm||normalize(b.skuName)===skuNorm)?0:1; if(ae!==be) return ae-be; return Number(b.unitPrice||0)-Number(a.unitPrice||0); });
    gateway = gwCandsAll[0]||null;
  } catch(err) { errors.push(`GW 매칭 실패: ${err.message}`); }

  // 3단계: S2S 추가 터널
  if (extraS2s>0) {
    try {
      const s2sC = allItems.filter(it=>{
        if ((it.type||'').toLowerCase()!=='consumption') return false;
        if (!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false;
        const m=(it.meterName||'').toLowerCase();
        if (m.includes('p2s')||m.includes('point-to-site')) return false;
        return m.includes('s2s')||m.includes('site-to-site')||m.includes('tunnel');
      }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
      s2sItem=s2sC[0]||null;
    } catch(err) { errors.push(`S2S 실패: ${err.message}`); }
  }

  // 4단계: P2S 추가 연결
  if (extraP2s>0) {
    try {
      const p2sC = allItems.filter(it=>{
        if ((it.type||'').toLowerCase()!=='consumption') return false;
        if (!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false;
        const m=(it.meterName||'').toLowerCase();
        if (m.includes('s2s')||m.includes('site-to-site')||m.includes('tunnel')) return false;
        return m.includes('p2s')||m.includes('point-to-site')||m.includes('connection');
      }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
      p2sItem=p2sC[0]||null;
    } catch(err) { errors.push(`P2S 실패: ${err.message}`); }
  }

  // 5단계: VNET 데이터 전송 단가
  // [v32 핵심 수정] contains() OData 함수 사용 제거 → HTTP 400 방지
  // serviceName 필터만 사용하고, 클라이언트에서 meterName 키워드 필터링
  const ZONE_MAP={eastus:1,eastus2:1,westus:1,westus2:1,westus3:1,northcentralus:1,southcentralus:1,centralus:1,westcentralus:1,westeurope:1,northeurope:1,francecentral:1,francesouth:1,uksouth:1,ukwest:1,canadacentral:1,canadaeast:1,koreacentral:2,koreasouth:2,japaneast:2,japanwest:2,eastasia:2,southeastasia:2,australiaeast:2,australiasoutheast:2,centralindia:2,southindia:2,westindia:2,qatarcentral:2,brazilsouth:3,brazilsoutheast:3,southafricanorth:3,southafricawest:3,uaenorth:3,uaecentral:3,israelcentral:3};
  const userZone = ZONE_MAP[row.region]||1;
  const transferType = o.vnetTransferType||'VNET 간';

  const extractGbCands=(items)=>items.filter(it=>{
    if ((it.type||'').toLowerCase()!=='consumption') return false;
    const uom=(it.unitOfMeasure||'').toLowerCase();
    return uom.includes('gb')&&!uom.includes('hour');
  });
  const isVnetOutbound=(it)=>{ const all=`${it.meterName||''} ${it.productName||''} ${it.skuName||''}`.toLowerCase(); return all.includes('inter-virtual network')||all.includes('inter virtual network')||all.includes('inter-vnet')||all.includes('inter vnet')||all.includes('vnet to vnet')||all.includes('vnet-to-vnet')||(all.includes('peering')&&all.includes('out'))||(all.includes('outbound')&&(all.includes('vnet')||all.includes('virtual network'))); };
  const isVpnEgress=(it)=>{ const all=`${it.meterName||''} ${it.productName||''} ${it.skuName||''}`.toLowerCase(); if (all.includes('inter-virtual network')||all.includes('inter-vnet')||all.includes('peering')||all.includes('inter-region')||all.includes('cross region')) return false; return all.includes('vpn')||all.includes('data transfer'); };
  const filterByType=(gbCands,type)=>type==='VNET 간'?gbCands.filter(it=>Number(it.unitPrice||0)>0&&isVnetOutbound(it)):gbCands.filter(it=>isVpnEgress(it));
  const sortCands=(cands)=>{ const zr=new RegExp(`zone\\s*${userZone}\\b`,'i'),chk=(it)=>zr.test(it.meterName||'')||zr.test(it.skuName||'')||zr.test(it.productName||''); return cands.slice().sort((a,b)=>{ const az=chk(a)?0:1,bz=chk(b)?0:1; if(az!==bz) return az-bz; const ao=/\bout\b|outbound/i.test(a.meterName||'')?0:1,bo=/\bout\b|outbound/i.test(b.meterName||'')?0:1; if(ao!==bo) return ao-bo; return Number(a.unitPrice||0)-Number(b.unitPrice||0); }); };
  const mkId=(it)=>it.meterId||`${it.serviceName}|${it.armRegionName}|${it.meterName}|${it.unitPrice}`;

  if (vnetGB>0) {
    let allMatched=[];

    // 5-A: VPN Gateway 응답에서 GB 항목 추출
    try {
      const c1=filterByType(extractGbCands(allItems),transferType);
      if (c1.length>0) { allMatched=allMatched.concat(c1); vnetSearchSteps.push(`VPN응답 ${c1.length}건`); }
      else {
        const gbPos=extractGbCands(allItems).filter(it=>Number(it.unitPrice||0)>0);
        if (gbPos.length>0) { allMatched=allMatched.concat(gbPos); vnetSearchSteps.push(`VPN응답 GB폴백 ${gbPos.length}건`); }
      }
    } catch(err) { errors.push(`VNET A: ${err.message}`); }

    // 5-B: Virtual Network 서비스 조회 (contains() 없이 serviceName만 사용)
    // [v32] 이전 contains() 호출 → 제거, Virtual Network 서비스로 대체
    if (allMatched.length===0) {
      try {
        const vnItems = await apiFetch(
          { serviceName:'Virtual Network', armRegionName:row.region, priceType:'Consumption' },
          currencyCode, 500, 3, { pageSize:200, expectedSizeKB:300 }
        );
        const c2=filterByType(extractGbCands(vnItems),transferType);
        if (c2.length>0) { allMatched=allMatched.concat(c2); vnetSearchSteps.push(`VirtualNetwork ${c2.length}건`); }
        else vnetSearchSteps.push(`VirtualNetwork 0건/${vnItems.length}응답`);
      } catch(err) { vnetSearchSteps.push(`VirtualNetwork 실패: ${err.message.slice(0,40)}`); }
    }

    // 5-C: Bandwidth 서비스 조회 (contains() 없이 serviceName만, 클라이언트 필터)
    if (allMatched.length===0) {
      try {
        const bwItems = await apiFetch(
          { serviceName:'Bandwidth', armRegionName:row.region, priceType:'Consumption' },
          currencyCode, 2000, 5, { pageSize:500, expectedSizeKB:800 }
        );
        const c3=filterByType(extractGbCands(bwItems),transferType);
        if (c3.length>0) { allMatched=allMatched.concat(c3); vnetSearchSteps.push(`Bandwidth ${c3.length}건`); }
        else vnetSearchSteps.push(`Bandwidth 0건/${bwItems.length}응답`);
      } catch(err) { vnetSearchSteps.push(`Bandwidth 실패: ${err.message.slice(0,40)}`); }
    }

    const uniq=new Map();
    allMatched.forEach(it=>{ const id=mkId(it); if(!uniq.has(id)) uniq.set(id,it); });
    vnetCandsAll=sortCands(Array.from(uniq.values()));
    if (vnetCandsAll.length>0) vnetItem=vnetCandsAll[0];
    else if (transferType==='VPN') vnetItem={ meterName:`[VPN zone ${userZone} 내 무료]`,skuName:'Free',unitPrice:0,retailPrice:0,unitOfMeasure:'1 GB',currencyCode,productName:'VPN intra-zone',serviceName:'VPN Gateway' };
  }

  // 6단계: 월 비용 합산
  let monthly=0;
  let gwH=0,s2sH=0,p2sH=0,vnetGbP=0;
  if (gateway) { gwH=Number(gateway.unitPrice); monthly+=gwH*gatewayHours; }
  if (s2sItem&&extraS2s>0) { s2sH=Number(s2sItem.unitPrice); monthly+=s2sH*extraS2s*gatewayHours; }
  if (p2sItem&&extraP2s>0) { p2sH=Number(p2sItem.unitPrice); monthly+=p2sH*extraP2s*gatewayHours; }
  if (vnetItem&&vnetGB>0) { vnetGbP=Number(vnetItem.unitPrice); monthly+=vnetGbP*vnetGB; }

  const hourlyEq=monthly/730;
  let payg=null;
  if (gateway) payg={ ...gateway,unitPrice:hourlyEq,retailPrice:hourlyEq,unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',_monthlyTotal:monthly,_gwHourly:gwH,_s2sHourly:s2sH,_p2sHourly:p2sH,_vnetGbPrice:vnetGbP,_gatewayHours:gatewayHours,_extraS2s:extraS2s,_extraP2s:extraP2s,_vnetGB:vnetGB,_partialErrors:errors.length>0?errors:undefined };

  row.paygItem=payg;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;

  console.group(`[VPN] sku=${sku}/zone=${userZone}/${row.region}`);
  console.log(`전체:${allItems.length}건`);
  if (gateway) console.log(`✓ GW: ${gateway.meterName}=${gateway.unitPrice}/h`);
  else console.warn(`✗ GW 매칭 실패 (sku=${sku})`);
  if (vnetGB>0) { console.log(`VNET: ${vnetSearchSteps.join(' → ')}`); if(vnetItem) console.log(`✓ VNET: ${vnetItem.meterName}=${vnetItem.unitPrice}/GB`); }
  console.log(`월합계=${monthly.toFixed(2)}`); if(errors.length) console.warn(`부분실패: ${errors.join('|')}`);
  console.groupEnd();

  if (payg) {
    const tags=[gateway?'GW✓':'GW✗'];
    if(extraS2s>0) tags.push(s2sItem?'S2S✓':'S2S✗');
    if(extraP2s>0) tags.push(p2sItem?'P2S✓':'P2S✗');
    if(vnetGB>0) tags.push(vnetItem?'VNET✓':'VNET✗');
    setStatus('ok',`${sku} 완료 [${tags.join(', ')}] · ${monthly.toFixed(2)}/월`);
  } else { setStatus('error',`${sku}: GW 매칭 실패 - F12 콘솔 확인`); }

  updatePriceCells(row); updateTotalsRow();
}

async function tryResolveItem(row) {
  if (!row.serviceCategory||!row.skuName) { row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null; return; }
  const def=SERVICE_CATEGORIES[row.serviceCategory];
  if (!def) return;
  const cur=document.getElementById('currencySelect').value;
  setStatus('loading',`${row.skuName} 가격 조회 중...`);
  if (row.serviceCategory==='Virtual Machine') return await resolveVmPrices(row,cur);
  if (row.serviceCategory==='Disk') return await resolveStoragePrices(row,cur);
  if (row.serviceCategory==='VPN Gateway') return await resolveVpnGatewayPrices(row,cur);

  try {
    const baseFilter={ serviceName:def.apiServiceName, armRegionName:row.region };
    if (row.serviceCategory==='Azure Files') { const tier=row.options.fileTier||'Premium'; const m={'Premium':'Premium Files','Hot':'General Purpose v2 Files','Cool':'Cool Files','Transaction Optimized':'General Purpose v2 Files'}; if(m[tier]) baseFilter.productName=m[tier]; }
    else if (row.serviceCategory==='Blob Storage') { const tier=row.options.blobTier||'Hot'; const m={'Hot':'Hot Block Blob','Cool':'Cool Block Blob','Cold':'Cold Block Blob','Archive':'Archive Block Blob'}; if(m[tier]) baseFilter.productName=m[tier]; }
    else if (row.serviceCategory==='Load Balancer') baseFilter.productName=`${row.options.tier||'Standard'} Load Balancer`;
    else if (row.serviceCategory==='Application Gateway') baseFilter.skuName=row.skuName;
    else if (row.serviceCategory==='Public IP') baseFilter.productName='IP Addresses';
    else if (row.serviceCategory==='Azure Firewall') baseFilter.productName=`Azure Firewall ${row.options.tier||'Standard'}`;
    else if (row.serviceCategory==='Azure SQL Database') baseFilter.productName=`SQL Database Single/Elastic Pool ${row.options.tier||'General Purpose'} - Compute Gen5`;
    else if (row.serviceCategory==='App Service') baseFilter.skuName=row.skuName||row.options.size||'';
    else if (row.serviceCategory==='Azure Bastion') baseFilter.productName=`Azure Bastion ${row.options.tier||'Basic'}`;
    else if (row.serviceCategory==='NAT Gateway') baseFilter.productName='NAT Gateway';

    const supportsRes=['Azure SQL Database'].includes(row.serviceCategory);
    const [consumptionItems,reservationItems] = await Promise.all([
      apiFetch({...baseFilter,priceType:'Consumption'},cur,200,3),
      supportsRes ? apiFetch({...baseFilter,priceType:'Reservation'},cur,200,3).catch(()=>[]) : Promise.resolve([]),
    ]);

    const matchesCons=(it)=>{
      if (row.serviceCategory==='Azure Files') { const r=row.options.redundancy||'LRS',s=it.skuName||'',m=(it.meterName||'').toLowerCase(),metric=(row.options.metric||'Data Stored').toLowerCase(); return s.includes(r)&&m.includes(metric.replace('data stored','stored')); }
      if (row.serviceCategory==='Blob Storage') return (it.skuName||'').includes(row.options.redundancy||'LRS');
      if (row.serviceCategory==='Load Balancer') return (it.meterName||'').toLowerCase().includes((row.options.metric||'Rules').toLowerCase());
      if (row.serviceCategory==='Public IP') { const s=it.skuName||''; return s.includes(row.options.sku||'Standard')&&s.includes(row.options.ipType||'Static'); }
      if (row.serviceCategory==='Azure Firewall') return (it.meterName||'').toLowerCase().includes((row.options.metric||'Deployment').toLowerCase());
      if (row.serviceCategory==='Application Gateway') return (it.skuName||'').includes(row.skuName);
      if (row.serviceCategory==='Azure Bastion') return true;
      if (row.serviceCategory==='NAT Gateway') return (it.meterName||'').toLowerCase().includes((row.options.metric||'Resource Hour').toLowerCase());
      return (it.skuName||it.armSkuName||'')===row.skuName;
    };
    const notSpot=(it)=>{ const s=(it.skuName||'').toLowerCase(),m=(it.meterName||'').toLowerCase(); return !s.includes('spot')&&!m.includes('spot')&&!s.includes('low priority')&&!m.includes('low priority')&&(it.type||'').toLowerCase()!=='devtestconsumption'; };
    const paygC=consumptionItems.filter(it=>(it.type||'').toLowerCase()==='consumption'&&matchesCons(it)&&notSpot(it));
    paygC.sort((a,b)=>{ const ta=Number(a.tierMinimumUnits||0),tb=Number(b.tierMinimumUnits||0); if(ta!==tb) return ta-tb; return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
    const payg=paygC[0]||null;

    let sp1=null,sp3=null;
    const chkSp=(item)=>{ if(!item||!Array.isArray(item.savingsPlan)) return; for(const sp of item.savingsPlan){ const t=String(sp.term||'').toLowerCase(); if((t.includes('1 year')||t==='1'||t.startsWith('1 '))&&!sp1) sp1=makeSpItem(item,sp); else if((t.includes('3 year')||t==='3'||t.startsWith('3 '))&&!sp3) sp3=makeSpItem(item,sp); } };
    chkSp(payg);
    if (!sp1||!sp3) { for(const item of consumptionItems){ if(item===payg||(item.type||'').toLowerCase()!=='consumption'||!matchesCons(item)||!notSpot(item)) continue; chkSp(item); if(sp1&&sp3) break; } }

    const ri1C=reservationItems.filter(it=>(it.type||'').toLowerCase()==='reservation'&&/1\s*year/i.test(String(it.reservationTerm||''))&&((it.skuName||it.armSkuName||'')===row.skuName)).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const ri3C=reservationItems.filter(it=>(it.type||'').toLowerCase()==='reservation'&&/3\s*year/i.test(String(it.reservationTerm||''))&&((it.skuName||it.armSkuName||'')===row.skuName)).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const ri1Item=ri1C[0]?normalizeReservationPrice(ri1C[0],1):null;
    const ri3Item=ri3C[0]?normalizeReservationPrice(ri3C[0],3):null;

    row.paygItem=payg;row.sp1Item=sp1;row.sp3Item=sp3;row.ri1Item=ri1Item;row.ri3Item=ri3Item;
    if (payg) { const tags=['PAYG'];if(sp1)tags.push('SP1Y');if(sp3)tags.push('SP3Y');if(ri1Item)tags.push('RI1Y');if(ri3Item)tags.push('RI3Y'); setStatus('ok',`${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${Number(payg.unitPrice).toFixed(2)}/h`); }
    else setStatus('error',`${row.skuName}: 매칭 없음 (${consumptionItems.length}건) - F12 확인`);
  } catch(err) {
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error',`API 실패: ${err.message.slice(0,100)}`); console.error('조회 실패:',err);
  }
  updatePriceCells(row); updateTotalsRow();
}

function normalizeReservationPrice(item,years) {
  const up=Number(item.unitPrice),rp=Number(item.retailPrice||item.unitPrice),h=years*8760;
  const hp=rp>0&&up/rp>1000?rp:up/h;
  return {...item,unitPrice:hp,retailPrice:hp,unitOfMeasure:'1 Hour (normalized)',_originalUnitPrice:up,_originalUnitOfMeasure:item.unitOfMeasure,_termYears:years};
}

function makeSpItem(baseItem,spData) {
  return { unitPrice:Number(spData.unitPrice),retailPrice:Number(spData.retailPrice||spData.unitPrice),currencyCode:baseItem.currencyCode,type:'SavingsPlan',armRegionName:baseItem.armRegionName,productName:baseItem.productName,skuName:baseItem.skuName,armSkuName:baseItem.armSkuName,meterName:baseItem.meterName,unitOfMeasure:baseItem.unitOfMeasure,term:spData.term };
}
