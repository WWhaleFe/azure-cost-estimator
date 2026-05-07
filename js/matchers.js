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
    if (o.os && o.os !== 'Linux' && o.license) parts.push(o.license);
    r.detail = parts.join(', ');

  } else if (r.serviceCategory === 'Disk') {
    r.skuName = o.instance || '';
    const disk = (DISK_CATALOG[o.storageType] || []).find(d => d.name === o.instance);
    const parts = [];
    if (o.storageType) parts.push(o.storageType);
    if (disk) parts.push(`${disk.size}GB`);
    if (o.redundancy) parts.push(o.redundancy);
    if (o.storageType === 'Premium SSD Managed Disks') {
      if (o.perfTier && o.perfTier !== '없음 (기본)') parts.push(`성능층: ${o.perfTier}`);
      if (o.burstingEnabled === '활성화') {
        const burstTx = Number(o.burstTxUnits || 0);
        parts.push(`버스팅${burstTx > 0 ? ` Tx:${burstTx.toLocaleString()}×10K` : ''}`);
      }
    } else {
      const tx = Number(o.transactionUnits || 0);
      if (tx > 0) parts.push(`Tx ${tx.toLocaleString()}×10K`);
    }
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
    const gh = Number(o.gatewayHours !== undefined && o.gatewayHours !== '' ? o.gatewayHours : 730);
    parts.push(`GW ${gh}h`);
    const eS2s = Number(o.extraS2sTunnels || 0), eP2s = Number(o.extraP2sConnections || 0), vnet = Number(o.vnetGB || 0);
    if (eS2s > 0) parts.push(`S2S +${eS2s}`);
    if (eP2s > 0) parts.push(`P2S +${eP2s}`);
    if (vnet > 0) parts.push(`${o.vnetTransferType || 'VNET 간'} ${vnet}GB`);
    r.detail = parts.join(', ');
  } else if (r.serviceCategory === 'Load Balancer') {
    r.skuName = o.tier || '';
    r.detail = `${o.tier || ''} - ${o.metric || ''}`.trim();
  } else if (r.serviceCategory === 'Application Gateway') {
    r.skuName = o.sku || ''; r.detail = o.sku || '';
  } else if (r.serviceCategory === 'Public IP') {
    r.skuName = `${o.sku || ''} ${o.ipType || ''}`.trim();
    r.detail = `${o.sku || ''} ${o.ipType || ''} IP`.trim();
  } else if (r.serviceCategory === 'Azure Firewall') {
    r.skuName = o.tier || '';
    r.detail = `${o.tier || ''} - ${o.metric || ''}`.trim();
  } else if (r.serviceCategory === 'Bandwidth') {
    r.skuName = o.direction || ''; r.detail = o.direction || '';
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
    r.skuName = vals[0] || ''; r.detail = vals.join(', ');
  }
}

async function resolveVmPrices(row, currencyCode) {
  const armSku = `Standard_${row.skuName}`;
  const baseFilter = { serviceName:'Virtual Machines', armRegionName:row.region, armSkuName:armSku };
  try {
    const [consumptionItems, reservationItems] = await Promise.all([
      apiFetch({...baseFilter, priceType:'Consumption'}, currencyCode, 200, 3),
      apiFetch({...baseFilter, priceType:'Reservation'}, currencyCode, 200, 3).catch(()=>[]),
    ]);
    const isWindows=(it)=>/windows/i.test(it.productName||'');
    const isRHEL=(it)=>/red\s*hat/i.test(it.productName||'');
    const isSUSE=(it)=>/suse/i.test(it.productName||'');
    const isLinux=(it)=>!isWindows(it)&&!isRHEL(it)&&!isSUSE(it);
    const isSpot=(it)=>{ const s=(it.skuName||'').toLowerCase(),m=(it.meterName||'').toLowerCase(),p=(it.productName||'').toLowerCase(); return s.includes('spot')||m.includes('spot')||s.includes('low priority')||m.includes('low priority')||p.includes('low priority'); };
    const isDevTest=(it)=>(it.type||'').toLowerCase()==='devtestconsumption';
    const skuMatch=(it)=>{ const t1=row.skuName.toLowerCase(),t2=t1.replace(/_/g,' '); const s=(it.skuName||'').toLowerCase(),m=(it.meterName||'').toLowerCase(); return s===t1||s===t2||m===t1||m===t2; };
    const osChoice=row.options.os||'Linux', tierChoice=row.options.tier||'Standard';
    const licenseChoice=row.options.license||'라이선스 포함', isAHB=licenseChoice==='Azure Hybrid Benefit', isPaidOs=osChoice!=='Linux';
    const baseCons=(it)=>{
      if((it.type||'').toLowerCase()!=='consumption') return false;
      if(it.armSkuName!==armSku||!skuMatch(it)||isDevTest(it)) return false;
      if(tierChoice==='Spot'?!isSpot(it):isSpot(it)) return false;
      if(!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false;
      if(Number(it.tierMinimumUnits||0)!==0) return false;
      return true;
    };
    const pickLowest=(arr)=>{ arr.sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0)); return arr[0]||null; };
    const linuxPayg=pickLowest(consumptionItems.filter(it=>baseCons(it)&&isLinux(it)));
    const windowsPayg=pickLowest(consumptionItems.filter(it=>baseCons(it)&&isWindows(it)));
    const rhelPayg=pickLowest(consumptionItems.filter(it=>baseCons(it)&&isRHEL(it)));
    const susePayg=pickLowest(consumptionItems.filter(it=>baseCons(it)&&isSUSE(it)));
    let paygOs=osChoice==='Linux'?linuxPayg:osChoice==='Windows'?windowsPayg:osChoice.includes('Red Hat')?rhelPayg:susePayg;
    let licH=0;
    if(isPaidOs&&paygOs&&linuxPayg){ const d=Number(paygOs.unitPrice)-Number(linuxPayg.unitPrice); licH=d>0?d:0; }
    let payg=!isPaidOs?linuxPayg:isAHB?(linuxPayg?{...linuxPayg,_licenseMode:'AHB'}:null):(paygOs?{...paygOs,_licenseMode:'License-included'}:null);
    let sp1Base=null,sp3Base=null;
    const exSp=(item)=>{ if(!item||!Array.isArray(item.savingsPlan)) return; for(const sp of item.savingsPlan){ const t=String(sp.term||'').toLowerCase(); if(!sp1Base&&(t==='1 year'||t.startsWith('1 year')||t==='1'||t.startsWith('1 '))) sp1Base=makeSpItem(item,sp); else if(!sp3Base&&(t==='3 year'||t==='3 years'||t.startsWith('3 year')||t==='3'||t.startsWith('3 '))) sp3Base=makeSpItem(item,sp); } };
    exSp(linuxPayg); if(!sp1Base||!sp3Base) exSp(paygOs);
    if(!sp1Base||!sp3Base){ for(const it of consumptionItems){ if(!baseCons(it)||it===linuxPayg||it===paygOs) continue; exSp(it); if(sp1Base&&sp3Base) break; } }
    const addLic=(bi,lic)=>{ if(!bi) return null; const bh=Number(bi.unitPrice),t=bh+(lic>0?lic:0); return{...bi,unitPrice:t,retailPrice:t,_baseHourly:bh,_licenseHourly:lic,_licenseMode:isAHB?'AHB':'License-included'}; };
    const sp1=(isPaidOs&&!isAHB)?addLic(sp1Base,licH):sp1Base;
    const sp3=(isPaidOs&&!isAHB)?addLic(sp3Base,licH):sp3Base;
    const riAll=reservationItems.filter(it=>{ if((it.type||'').toLowerCase()!=='reservation') return false; if(it.armSkuName!==armSku||Number(it.tierMinimumUnits||0)!==0||isSpot(it)||!skuMatch(it)) return false; return true; });
    const ri1C=riAll.filter(it=>/1\s*year/i.test(String(it.reservationTerm||''))).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const ri3C=riAll.filter(it=>/3\s*year/i.test(String(it.reservationTerm||''))).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const normRi=(item,years)=>{ if(!item) return null; const t=Number(item.unitPrice); if(!isFinite(t)||t<=0) return null; return{...item,unitPrice:t/(years*8760),retailPrice:t/(years*8760),unitOfMeasure:'1 Hour (normalized)',_originalUnitPrice:t,_termYears:years}; };
    const ri1B=normRi(ri1C[0]||null,1),ri3B=normRi(ri3C[0]||null,3);
    const ri1Item=(isPaidOs&&!isAHB)?addLic(ri1B,licH):ri1B;
    const ri3Item=(isPaidOs&&!isAHB)?addLic(ri3B,licH):ri3B;
    row.paygItem=payg;row.sp1Item=sp1;row.sp3Item=sp3;row.ri1Item=ri1Item;row.ri3Item=ri3Item;
    if(payg){ const tags=['PAYG'];if(sp1)tags.push('SP1Y');if(sp3)tags.push('SP3Y');if(ri1Item)tags.push('RI1Y');if(ri3Item)tags.push('RI3Y'); setStatus('ok',`${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${Number(payg.unitPrice).toFixed(4)}/h`); }
    else setStatus('error',`${row.skuName}: 매칭 없음 (${consumptionItems.length}건)`);
  } catch(err){ row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null; setStatus('error',`API 실패: ${err.message.slice(0,100)}`); console.error('VM:',err); }
  updatePriceCells(row); updateTotalsRow();
}

/**
 * Disk (Managed Disks) 가격 조회 (v33)
 * Premium SSD: PAYG + RI 1년 + 성능업그레이드 + 버스팅
 * Standard SSD/HDD: PAYG + RI 1년 + 트랜잭션
 */
async function resolveStoragePrices(row, currencyCode) {
  const o = row.options || {};
  const storageType = o.storageType || 'Premium SSD Managed Disks';
  const redundancy = o.redundancy || 'LRS';
  const isPremium = storageType === 'Premium SSD Managed Disks';
  const txUnits = isPremium ? 0 : Number(o.transactionUnits || 0);
  const skuFull = `${row.skuName} ${redundancy}`;

  // Premium SSD 업그레이드 SKU: 성능 대상 SKU (업그레이드 선택시 해당 SKU로 매출 요청)
  const perfTier = (isPremium && o.perfTier && o.perfTier !== '없음 (기본)') ? o.perfTier : null;
  const effectiveSku = perfTier ? `${perfTier} ${redundancy}` : skuFull;

  // 버스팅 옵션
  const burstingEnabled = isPremium && o.burstingEnabled === '활성화';
  const burstTxUnits = burstingEnabled ? Number(o.burstTxUnits || 0) : 0;

  try {
    // 병렬 요청: 디스크단가 + 트랜잭션 + RI
    // Premium SSD 성능업그레이드: effectiveSku로 병도 요청
    const diskFetchFilter = { serviceName:'Storage', armRegionName:row.region, productName:storageType, skuName:skuFull, priceType:'Consumption' };
    const perfFetchFilter = perfTier ? { serviceName:'Storage', armRegionName:row.region, productName:storageType, skuName:effectiveSku, priceType:'Consumption' } : null;

    // 버스팅 활성화 시 전체 리스트 필요 (enablement 비용 + 트랜잭션 단가 조회)
    const burstFetchFilter = burstingEnabled
      ? { serviceName:'Storage', armRegionName:row.region, productName:storageType, priceType:'Consumption' }
      : null;

    const [diskItems, perfItems, txItemsRaw, reservationItems, burstAllItems] = await Promise.all([
      apiFetch(diskFetchFilter, currencyCode, 100, 2),
      perfFetchFilter ? apiFetch(perfFetchFilter, currencyCode, 100, 2) : Promise.resolve([]),
      (!isPremium && txUnits > 0) ? apiFetch({ serviceName:'Storage', armRegionName:row.region, productName:storageType, priceType:'Consumption' }, currencyCode, 200, 3) : Promise.resolve([]),
      apiFetch({ serviceName:'Storage', armRegionName:row.region, productName:storageType, priceType:'Reservation' }, currencyCode, 200, 2).catch(()=>[]),
      burstFetchFilter ? apiFetch(burstFetchFilter, currencyCode, 300, 3) : Promise.resolve([]),
    ]);

    // 일반 디스크 단가 매칭
    const expectedMeter = `${row.skuName} ${redundancy} Disk`.toLowerCase();
    const isPlain = (it) => { const m=(it.meterName||'').toLowerCase(); return !m.includes('mount')&&!m.includes('burst')&&!m.includes('enablement')&&!m.includes('snapshot')&&!m.includes('one-time'); };
    const findDisk = (items, skuLabel) => {
      const exp = `${skuLabel} Disk`.toLowerCase();
      const cands = items.filter(it=>{
        if((it.type||'').toLowerCase()!=='consumption') return false;
        if(!(it.unitOfMeasure||'').toLowerCase().includes('month')) return false;
        if(!isPlain(it)) return false;
        const m=(it.meterName||'').toLowerCase();
        return m===exp || m.startsWith(skuLabel.toLowerCase());
      });
      cands.sort((a,b)=>{ const ae=(a.meterName||'').toLowerCase()===exp?0:1,be=(b.meterName||'').toLowerCase()===exp?0:1; if(ae!==be) return ae-be; return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
      return cands[0]||null;
    };

    // 디스크 단가: 성능업그레이드 옵션이 있으면 업그레이드 SKU 가격, 없으면 원본 SKU
    const disk = perfTier
      ? (findDisk(perfItems, effectiveSku) || findDisk(diskItems, skuFull))
      : findDisk(diskItems, skuFull);

    // 트랜잭션 (Standard에서만)
    let txItem = null;
    if (!isPremium && txUnits > 0) {
      const allTx = txItemsRaw.filter(it=>{ const u=(it.unitOfMeasure||'').toLowerCase(); return u.includes('10k')||u.includes('10,000')||u.includes('10000'); });
      let txC = allTx.filter(it=>{ const m=(it.meterName||'').toLowerCase(),s=(it.skuName||'').toLowerCase(),rl=redundancy.toLowerCase(); return (m.includes('operation')||m.includes('transaction'))&&(m.includes(rl)||s.includes(rl)); });
      if(!txC.length) txC=allTx.filter(it=>{ const m=(it.meterName||'').toLowerCase(),s=(it.skuName||'').toLowerCase(); return m.includes(redundancy.toLowerCase())||s.includes(redundancy.toLowerCase()); });
      if(!txC.length) txC=allTx;
      txC.sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
      txItem=txC[0]||null;
    }

    // 버스팅 enablement 비용 매칭 (P30 이상, 월 정액)
    let burstEnablementItem = null;
    let burstTxItem = null;
    if (burstingEnabled && burstAllItems.length > 0) {
      const allBurst = burstAllItems.filter(it=>(it.type||'').toLowerCase()==='consumption');
      // enablement flat fee: meterName에 'burst enablement' 포함
      const enaC = allBurst.filter(it=>{ const m=(it.meterName||'').toLowerCase(); return m.includes('burst')&&m.includes('enablement'); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
      burstEnablementItem = enaC[0]||null;
      // 버스트 트랜잭션 단가: 10K 단위, burst난 포함되는 항목
      if (burstTxUnits > 0) {
        const txC = allBurst.filter(it=>{ const m=(it.meterName||'').toLowerCase(),u=(it.unitOfMeasure||'').toLowerCase(); return m.includes('burst')&&(u.includes('10k')||u.includes('10,000')||u.includes('10000')); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
        burstTxItem = txC[0]||null;
      }
    }

    // 월 비용 합산
    const usageHours = Number(row.usage) || 730;
    let monthly = 0;
    if (disk) monthly += Number(disk.unitPrice);
    if (txItem && txUnits > 0) monthly += Number(txItem.unitPrice) * txUnits;
    if (burstEnablementItem) monthly += Number(burstEnablementItem.unitPrice);
    if (burstTxItem && burstTxUnits > 0) monthly += Number(burstTxItem.unitPrice) * burstTxUnits;
    const hourlyEq = usageHours > 0 ? monthly / usageHours : 0;

    let payg = null;
    if (disk) {
      payg = {
        ...disk,
        unitPrice: hourlyEq, retailPrice: hourlyEq,
        unitOfMeasure: '1 Hour (equivalent)',
        _billingMode: 'monthly', _monthlyTotal: monthly,
        _diskMonthly: Number(disk.unitPrice),
        _perfTier: perfTier,
        _burstEnablement: burstEnablementItem ? Number(burstEnablementItem.unitPrice) : 0,
        _burstTxMonthly: burstTxItem ? Number(burstTxItem.unitPrice) * burstTxUnits : 0,
        _txMonthly: txItem ? Number(txItem.unitPrice) * txUnits : 0,
      };
    }

    // RI 1년 (Premium SSD: skuFull 기준, Standard: 동일)
    let ri1Item = null;
    const ri1C = reservationItems.filter(it=>{
      if((it.type||'').toLowerCase()!=='reservation') return false;
      if(!/1\s*year/i.test(String(it.reservationTerm||''))) return false;
      const s=(it.skuName||'').toLowerCase();
      // 성능업그레이드시: effectiveSku 기준
      const matchSku = perfTier ? effectiveSku.toLowerCase() : skuFull.toLowerCase();
      return s.includes(matchSku.split(' ')[0].toLowerCase()) && s.includes(redundancy.toLowerCase());
    }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));

    if (ri1C[0]) {
      const total = Number(ri1C[0].unitPrice);
      const ri1M = total / 12;
      // RI 월 비용 = RI 디스크 월상당 + 버스팅/Tx 변동비용 (PAYG와 동일하게)
      const ri1MT = ri1M
        + (txItem && txUnits > 0 ? Number(txItem.unitPrice) * txUnits : 0)
        + (burstEnablementItem ? Number(burstEnablementItem.unitPrice) : 0)
        + (burstTxItem && burstTxUnits > 0 ? Number(burstTxItem.unitPrice) * burstTxUnits : 0);
      const ri1H = usageHours > 0 ? ri1MT / usageHours : 0;
      ri1Item = {
        ...ri1C[0],
        unitPrice: ri1H, retailPrice: ri1H,
        unitOfMeasure: '1 Hour (equivalent)',
        _billingMode: 'monthly', _monthlyTotal: ri1MT,
        _originalUnitPrice: total, _termYears: 1, _diskMonthly: ri1M,
      };
    }

    row.paygItem = payg; row.sp1Item = null; row.sp3Item = null;
    row.ri1Item = ri1Item; row.ri3Item = null;

    console.group(`[Disk] ${row.skuName} ${redundancy} / ${storageType}`);
    console.log(`디스크단가: ${disk ? disk.unitPrice+'/월' : '없음'} | perfTier=${perfTier||'없음'} | 버스팅=${burstingEnabled}`);
    if (burstEnablementItem) console.log(`Burst enablement: ${burstEnablementItem.unitPrice}/월`);
    if (burstTxItem) console.log(`Burst Tx: ${burstTxItem.unitPrice}/10K × ${burstTxUnits} = ${Number(burstTxItem.unitPrice)*burstTxUnits}/월`);
    console.log(`월합계: ${monthly.toFixed(4)} | RI1Y: ${ri1Item ? ri1Item._originalUnitPrice : '없음'}`);
    console.groupEnd();

    if (payg) setStatus('ok', `${row.skuName} ${redundancy} 완료${perfTier?` [업그레이드→${perfTier}]`:''} · ${monthly.toFixed(2)}/월`);
    else setStatus('error', `${row.skuName}: 디스크 매칭 실패 - F12 콘솔 확인`);
  } catch(err) {
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error',`Disk 조회 실패: ${err.message.slice(0,100)}`); console.error('Disk:',err);
  }
  updatePriceCells(row); updateTotalsRow();
}

async function resolveVpnGatewayPrices(row, currencyCode) {
  const o=row.options||{};
  const sku=o.sku||row.skuName||'';
  const gatewayHours=Number(o.gatewayHours!==undefined&&o.gatewayHours!==''?o.gatewayHours:730);
  const extraS2s=Number(o.extraS2sTunnels||0),extraP2s=Number(o.extraP2sConnections||0),vnetGB=Number(o.vnetGB||0);
  let allItems=[],gateway=null,s2sItem=null,p2sItem=null,vnetItem=null,vnetCandsAll=[],vnetSearchSteps=[],errors=[];
  try { allItems=await apiFetch({serviceName:'VPN Gateway',armRegionName:row.region,priceType:'Consumption'},currencyCode,200,3); }
  catch(err){ row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null; setStatus('error',`VPN 조회 실패: ${err.message.slice(0,100)}`); updatePriceCells(row);updateTotalsRow();return; }
  const norm=(s)=>String(s||'').toLowerCase().replace(/\s+/g,''),skuN=norm(sku);
  try{ const isE=(it)=>{const m=(it.meterName||'').toLowerCase();return m.includes('tunnel')||m.includes('s2s')||m.includes('p2s')||m.includes('connection')||m.includes('data transfer')||m.includes('inter-');}; const gwC=allItems.filter(it=>{if((it.type||'').toLowerCase()!=='consumption') return false;if(!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false;if(isE(it)) return false;const mN=norm(it.meterName),sN=norm(it.skuName);return mN===skuN||sN===skuN||mN.startsWith(skuN)||sN.startsWith(skuN)||mN.endsWith(skuN)||sN.endsWith(skuN);}); gwC.sort((a,b)=>{const ae=(norm(a.meterName)===skuN||norm(a.skuName)===skuN)?0:1,be=(norm(b.meterName)===skuN||norm(b.skuName)===skuN)?0:1;if(ae!==be) return ae-be;return Number(b.unitPrice||0)-Number(a.unitPrice||0);}); gateway=gwC[0]||null; }catch(err){errors.push(`GW:${err.message}`);}
  if(extraS2s>0){try{const c=allItems.filter(it=>{if((it.type||'').toLowerCase()!=='consumption') return false;if(!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false;const m=(it.meterName||'').toLowerCase();if(m.includes('p2s')||m.includes('point-to-site')) return false;return m.includes('s2s')||m.includes('site-to-site')||m.includes('tunnel');}).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));s2sItem=c[0]||null;}catch(err){errors.push(`S2S:${err.message}`);}}
  if(extraP2s>0){try{const c=allItems.filter(it=>{if((it.type||'').toLowerCase()!=='consumption') return false;if(!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false;const m=(it.meterName||'').toLowerCase();if(m.includes('s2s')||m.includes('site-to-site')||m.includes('tunnel')) return false;return m.includes('p2s')||m.includes('point-to-site')||m.includes('connection');}).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));p2sItem=c[0]||null;}catch(err){errors.push(`P2S:${err.message}`);}}
  const ZM={eastus:1,eastus2:1,westus:1,westus2:1,westus3:1,northcentralus:1,southcentralus:1,centralus:1,westcentralus:1,westeurope:1,northeurope:1,francecentral:1,francesouth:1,uksouth:1,ukwest:1,canadacentral:1,canadaeast:1,koreacentral:2,koreasouth:2,japaneast:2,japanwest:2,eastasia:2,southeastasia:2,australiaeast:2,australiasoutheast:2,centralindia:2,southindia:2,westindia:2,qatarcentral:2,brazilsouth:3,brazilsoutheast:3,southafricanorth:3,southafricawest:3,uaenorth:3,uaecentral:3,israelcentral:3};
  const uZ=ZM[row.region]||1,tt=o.vnetTransferType||'VNET 간';
  const exGb=(items)=>items.filter(it=>{if((it.type||'').toLowerCase()!=='consumption') return false;const u=(it.unitOfMeasure||'').toLowerCase();return u.includes('gb')&&!u.includes('hour');});
  const isVnetOut=(it)=>{const a=`${it.meterName||''} ${it.productName||''} ${it.skuName||''}`.toLowerCase();return a.includes('inter-virtual network')||a.includes('inter virtual network')||a.includes('inter-vnet')||a.includes('inter vnet')||a.includes('vnet to vnet')||a.includes('vnet-to-vnet')||(a.includes('peering')&&a.includes('out'))||(a.includes('outbound')&&(a.includes('vnet')||a.includes('virtual network')));},isVpnE=(it)=>{const a=`${it.meterName||''} ${it.productName||''} ${it.skuName||''}`.toLowerCase();if(a.includes('inter-virtual network')||a.includes('inter-vnet')||a.includes('peering')||a.includes('inter-region')||a.includes('cross region')) return false;return a.includes('vpn')||a.includes('data transfer');};
  const fbT=(gbC,type)=>type==='VNET 간'?gbC.filter(it=>Number(it.unitPrice||0)>0&&isVnetOut(it)):gbC.filter(it=>isVpnE(it));
  const srtC=(cands)=>{const zr=new RegExp(`zone\\s*${uZ}\\b`,'i'),ck=(it)=>zr.test(it.meterName||'')||zr.test(it.skuName||'')||zr.test(it.productName||'');return cands.slice().sort((a,b)=>{const az=ck(a)?0:1,bz=ck(b)?0:1;if(az!==bz) return az-bz;const ao=/\bout\b|outbound/i.test(a.meterName||'')?0:1,bo=/\bout\b|outbound/i.test(b.meterName||'')?0:1;if(ao!==bo) return ao-bo;return Number(a.unitPrice||0)-Number(b.unitPrice||0);});};
  const mkId=(it)=>it.meterId||`${it.serviceName}|${it.armRegionName}|${it.meterName}|${it.unitPrice}`;
  if(vnetGB>0){let am=[];try{const c1=fbT(exGb(allItems),tt);if(c1.length>0){am=am.concat(c1);vnetSearchSteps.push(`VPN응답 ${c1.length}`);} else{const gp=exGb(allItems).filter(it=>Number(it.unitPrice||0)>0);if(gp.length>0){am=am.concat(gp);vnetSearchSteps.push(`VPN GB폴백 ${gp.length}`);}}}catch(err){errors.push(`VNETA:${err.message}`);}
  if(am.length===0){try{const vn=await apiFetch({serviceName:'Virtual Network',armRegionName:row.region,priceType:'Consumption'},currencyCode,500,3,{pageSize:200,expectedSizeKB:300});const c2=fbT(exGb(vn),tt);if(c2.length>0){am=am.concat(c2);vnetSearchSteps.push(`VN ${c2.length}`);}else vnetSearchSteps.push(`VN 0/${vn.length}`);}catch(err){vnetSearchSteps.push(`VN실패`);}}
  if(am.length===0){try{const bw=await apiFetch({serviceName:'Bandwidth',armRegionName:row.region,priceType:'Consumption'},currencyCode,2000,5,{pageSize:500,expectedSizeKB:800});const c3=fbT(exGb(bw),tt);if(c3.length>0){am=am.concat(c3);vnetSearchSteps.push(`BW ${c3.length}`);}else vnetSearchSteps.push(`BW 0/${bw.length}`);}catch(err){vnetSearchSteps.push(`BW실패`);}}
  const uq=new Map();am.forEach(it=>{const id=mkId(it);if(!uq.has(id))uq.set(id,it);});vnetCandsAll=srtC(Array.from(uq.values()));if(vnetCandsAll.length>0)vnetItem=vnetCandsAll[0];else if(tt==='VPN')vnetItem={meterName:`[VPN zone ${uZ} 무료]`,skuName:'Free',unitPrice:0,retailPrice:0,unitOfMeasure:'1 GB',currencyCode,productName:'VPN intra-zone',serviceName:'VPN Gateway'};
  }
  let monthly=0,gwH=0,s2sH=0,p2sH=0,vnetGbP=0;
  if(gateway){gwH=Number(gateway.unitPrice);monthly+=gwH*gatewayHours;}
  if(s2sItem&&extraS2s>0){s2sH=Number(s2sItem.unitPrice);monthly+=s2sH*extraS2s*gatewayHours;}
  if(p2sItem&&extraP2s>0){p2sH=Number(p2sItem.unitPrice);monthly+=p2sH*extraP2s*gatewayHours;}
  if(vnetItem&&vnetGB>0){vnetGbP=Number(vnetItem.unitPrice);monthly+=vnetGbP*vnetGB;}
  const hourlyEq=monthly/730;
  let payg=null;
  if(gateway)payg={...gateway,unitPrice:hourlyEq,retailPrice:hourlyEq,unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',_monthlyTotal:monthly,_gwHourly:gwH,_s2sHourly:s2sH,_p2sHourly:p2sH,_vnetGbPrice:vnetGbP,_gatewayHours:gatewayHours,_partialErrors:errors.length>0?errors:undefined};
  row.paygItem=payg;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
  console.group(`[VPN] sku=${sku}/zone=${uZ}/${row.region}`);console.log(`전체:${allItems.length}`);if(gateway)console.log(`✓ GW:${gateway.meterName}=${gateway.unitPrice}/h`);else console.warn(`✗ GW 실패`);if(vnetGB>0){console.log(`VNET:${vnetSearchSteps.join('→')}`);if(vnetItem)console.log(`✓ VNET:${vnetItem.meterName}=${vnetItem.unitPrice}/GB`);}console.log(`월=${monthly.toFixed(2)}`);if(errors.length)console.warn(errors.join('|'));console.groupEnd();
  if(payg){const tags=[gateway?'GW✓':'GW✗'];if(extraS2s>0)tags.push(s2sItem?'S2S✓':'S2S✗');if(extraP2s>0)tags.push(p2sItem?'P2S✓':'P2S✗');if(vnetGB>0)tags.push(vnetItem?'VNET✓':'VNET✗');setStatus('ok',`${sku} 완료 [${tags.join(', ')}] · ${monthly.toFixed(2)}/월`);}else setStatus('error',`${sku}: GW 매칭 실패`);
  updatePriceCells(row);updateTotalsRow();
}

async function tryResolveItem(row) {
  if(!row.serviceCategory||!row.skuName){row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;return;}
  const def=SERVICE_CATEGORIES[row.serviceCategory];if(!def) return;
  const cur=document.getElementById('currencySelect').value;
  setStatus('loading',`${row.skuName} 가격 조회 중...`);
  if(row.serviceCategory==='Virtual Machine') return await resolveVmPrices(row,cur);
  if(row.serviceCategory==='Disk') return await resolveStoragePrices(row,cur);
  if(row.serviceCategory==='VPN Gateway') return await resolveVpnGatewayPrices(row,cur);
  try{
    const bf={serviceName:def.apiServiceName,armRegionName:row.region};
    if(row.serviceCategory==='Azure Files'){const tier=row.options.fileTier||'Premium';const m={'Premium':'Premium Files','Hot':'General Purpose v2 Files','Cool':'Cool Files','Transaction Optimized':'General Purpose v2 Files'};if(m[tier])bf.productName=m[tier];}
    else if(row.serviceCategory==='Blob Storage'){const tier=row.options.blobTier||'Hot';const m={'Hot':'Hot Block Blob','Cool':'Cool Block Blob','Cold':'Cold Block Blob','Archive':'Archive Block Blob'};if(m[tier])bf.productName=m[tier];}
    else if(row.serviceCategory==='Load Balancer')bf.productName=`${row.options.tier||'Standard'} Load Balancer`;
    else if(row.serviceCategory==='Application Gateway')bf.skuName=row.skuName;
    else if(row.serviceCategory==='Public IP')bf.productName='IP Addresses';
    else if(row.serviceCategory==='Azure Firewall')bf.productName=`Azure Firewall ${row.options.tier||'Standard'}`;
    else if(row.serviceCategory==='Azure SQL Database')bf.productName=`SQL Database Single/Elastic Pool ${row.options.tier||'General Purpose'} - Compute Gen5`;
    else if(row.serviceCategory==='App Service')bf.skuName=row.skuName||row.options.size||'';
    else if(row.serviceCategory==='Azure Bastion')bf.productName=`Azure Bastion ${row.options.tier||'Basic'}`;
    else if(row.serviceCategory==='NAT Gateway')bf.productName='NAT Gateway';
    const supR=['Azure SQL Database'].includes(row.serviceCategory);
    const[cItems,rItems]=await Promise.all([apiFetch({...bf,priceType:'Consumption'},cur,200,3),supR?apiFetch({...bf,priceType:'Reservation'},cur,200,3).catch(()=>[]):Promise.resolve([])]);
    const mC=(it)=>{
      if(row.serviceCategory==='Azure Files'){const r=row.options.redundancy||'LRS',s=it.skuName||'',m=(it.meterName||'').toLowerCase(),metric=(row.options.metric||'Data Stored').toLowerCase();return s.includes(r)&&m.includes(metric.replace('data stored','stored'));}
      if(row.serviceCategory==='Blob Storage')return(it.skuName||'').includes(row.options.redundancy||'LRS');
      if(row.serviceCategory==='Load Balancer')return(it.meterName||'').toLowerCase().includes((row.options.metric||'Rules').toLowerCase());
      if(row.serviceCategory==='Public IP'){const s=it.skuName||'';return s.includes(row.options.sku||'Standard')&&s.includes(row.options.ipType||'Static');}
      if(row.serviceCategory==='Azure Firewall')return(it.meterName||'').toLowerCase().includes((row.options.metric||'Deployment').toLowerCase());
      if(row.serviceCategory==='Application Gateway')return(it.skuName||'').includes(row.skuName);
      if(row.serviceCategory==='Azure Bastion')return true;
      if(row.serviceCategory==='NAT Gateway')return(it.meterName||'').toLowerCase().includes((row.options.metric||'Resource Hour').toLowerCase());
      return(it.skuName||it.armSkuName||'')===row.skuName;
    };
    const nS=(it)=>{const s=(it.skuName||'').toLowerCase(),m=(it.meterName||'').toLowerCase();return!s.includes('spot')&&!m.includes('spot')&&!s.includes('low priority')&&!m.includes('low priority')&&(it.type||'').toLowerCase()!=='devtestconsumption';};
    const pC=cItems.filter(it=>(it.type||'').toLowerCase()==='consumption'&&mC(it)&&nS(it));pC.sort((a,b)=>{const ta=Number(a.tierMinimumUnits||0),tb=Number(b.tierMinimumUnits||0);if(ta!==tb)return ta-tb;return Number(a.unitPrice||0)-Number(b.unitPrice||0);});
    const payg=pC[0]||null;
    let sp1=null,sp3=null;
    const ckSp=(item)=>{if(!item||!Array.isArray(item.savingsPlan))return;for(const sp of item.savingsPlan){const t=String(sp.term||'').toLowerCase();if((t.includes('1 year')||t==='1'||t.startsWith('1 '))&&!sp1)sp1=makeSpItem(item,sp);else if((t.includes('3 year')||t==='3'||t.startsWith('3 '))&&!sp3)sp3=makeSpItem(item,sp);}};
    ckSp(payg);
    if(!sp1||!sp3){for(const item of cItems){if(item===payg||(item.type||'').toLowerCase()!=='consumption'||!mC(item)||!nS(item))continue;ckSp(item);if(sp1&&sp3)break;}}
    const ri1C=rItems.filter(it=>(it.type||'').toLowerCase()==='reservation'&&/1\s*year/i.test(String(it.reservationTerm||''))&&((it.skuName||it.armSkuName||'')===row.skuName)).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const ri3C=rItems.filter(it=>(it.type||'').toLowerCase()==='reservation'&&/3\s*year/i.test(String(it.reservationTerm||''))&&((it.skuName||it.armSkuName||'')===row.skuName)).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const ri1Item=ri1C[0]?normalizeReservationPrice(ri1C[0],1):null;
    const ri3Item=ri3C[0]?normalizeReservationPrice(ri3C[0],3):null;
    row.paygItem=payg;row.sp1Item=sp1;row.sp3Item=sp3;row.ri1Item=ri1Item;row.ri3Item=ri3Item;
    if(payg){const tags=['PAYG'];if(sp1)tags.push('SP1Y');if(sp3)tags.push('SP3Y');if(ri1Item)tags.push('RI1Y');if(ri3Item)tags.push('RI3Y');setStatus('ok',`${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${Number(payg.unitPrice).toFixed(2)}/h`);}
    else setStatus('error',`${row.skuName}: 매칭 없음 (${cItems.length}건)`);
  }catch(err){row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;setStatus('error',`API 실패: ${err.message.slice(0,100)}`);console.error('조회실패:',err);}
  updatePriceCells(row);updateTotalsRow();
}

function normalizeReservationPrice(item,years){
  const up=Number(item.unitPrice),rp=Number(item.retailPrice||item.unitPrice),h=years*8760;
  const hp=rp>0&&up/rp>1000?rp:up/h;
  return{...item,unitPrice:hp,retailPrice:hp,unitOfMeasure:'1 Hour (normalized)',_originalUnitPrice:up,_originalUnitOfMeasure:item.unitOfMeasure,_termYears:years};
}
function makeSpItem(baseItem,spData){
  return{unitPrice:Number(spData.unitPrice),retailPrice:Number(spData.retailPrice||spData.unitPrice),currencyCode:baseItem.currencyCode,type:'SavingsPlan',armRegionName:baseItem.armRegionName,productName:baseItem.productName,skuName:baseItem.skuName,armSkuName:baseItem.armSkuName,meterName:baseItem.meterName,unitOfMeasure:baseItem.unitOfMeasure,term:spData.term};
}
