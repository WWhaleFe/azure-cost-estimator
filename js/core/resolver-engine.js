// ================================================================
// core/resolver-engine.js — 공통 가격 조회 엔진
// ================================================================

function normalizeReservationPrice(item, years) {
  const up=Number(item.unitPrice), rp=Number(item.retailPrice||item.unitPrice), h=years*8760;
  const hp = rp>0 && up/rp>1000 ? rp : up/h;
  return {...item, unitPrice:hp, retailPrice:hp, unitOfMeasure:'1 Hour (normalized)',
          _originalUnitPrice:up, _originalUnitOfMeasure:item.unitOfMeasure, _termYears:years};
}
function makeSpItem(base, sp) {
  return { unitPrice:Number(sp.unitPrice), retailPrice:Number(sp.retailPrice||sp.unitPrice),
    currencyCode:base.currencyCode, type:'SavingsPlan',
    armRegionName:base.armRegionName, productName:base.productName,
    skuName:base.skuName, armSkuName:base.armSkuName,
    meterName:base.meterName, unitOfMeasure:base.unitOfMeasure, term:sp.term };
}

// ── per-단가(× mult) 컴퓨팅 모델 공용 절약/예약 추출 (SQL·MySQL·Synapse) ──
// base(용량제 Consumption 항목)의 savingsPlan에서 1년/3년 항목을 mult배해 시간당 단가로 생성.
// 엔진 기본 계산(월=단가×Qty×usage)에 맞춰 unitOfMeasure='1 Hour'로 통일.
function spItemsFromBase(base, mult, cur) {
  var out = { sp1:null, sp3:null };
  if (!base || !Array.isArray(base.savingsPlan)) return out;
  for (var i = 0; i < base.savingsPlan.length; i++) {
    var sp = base.savingsPlan[i], t = String(sp.term||'').toLowerCase();
    var p = Number(sp.unitPrice) * mult;
    if (!(p > 0)) continue;
    var it = { currencyCode:cur, unitPrice:p, retailPrice:p, armRegionName:base.armRegionName,
      productName:base.productName, skuName:base.skuName, meterName:base.meterName,
      unitOfMeasure:'1 Hour', type:'SavingsPlan', term:sp.term };
    if      ((/1\s*year/.test(t) || t === '1' || t.indexOf('1 ') === 0) && !out.sp1) out.sp1 = it;
    else if ((/3\s*year/.test(t) || t === '3' || t.indexOf('3 ') === 0) && !out.sp3) out.sp3 = it;
  }
  return out;
}
// 예약(Reservation priceType 항목 배열)에서 skuName 일치 + 1년/3년을 골라
// normalizeReservationPrice로 시간당 단가로 환산한 뒤 mult배해 생성.
function riItemsFromResv(resvItems, skuLower, mult, cur) {
  function pick(years, re) {
    var c = (resvItems||[]).filter(function(it){
      if (String(it.type||'').toLowerCase() !== 'reservation') return false;
      if (skuLower && String(it.skuName||'').toLowerCase() !== skuLower) return false;
      return re.test(String(it.reservationTerm||''));
    }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); })[0];
    if (!c) return null;
    var hourly = Number(normalizeReservationPrice(c, years).unitPrice) * mult;
    if (!(hourly > 0)) return null;
    return { currencyCode:cur, unitPrice:hourly, retailPrice:hourly, armRegionName:c.armRegionName,
      productName:c.productName, skuName:c.skuName, meterName:c.meterName, unitOfMeasure:'1 Hour',
      type:'Reservation', term:c.reservationTerm };
  }
  return { ri1:pick(1, /1\s*year/i), ri3:pick(3, /3\s*year/i) };
}

function buildSkuAndDetail(r) {
  const def = SERVICE_CATEGORIES[r.serviceCategory];
  if (!def) return;
  const fnName = `_buildDetail_${r.serviceCategory.replace(/[^a-zA-Z0-9]/g,'_')}`;
  if (typeof window[fnName] === 'function') { window[fnName](r); return; }
  const o = r.options;
  const vals = def.steps.filter(s=>!s._hidden).map(s=>o[s.key]).filter(Boolean);
  r.skuName = vals[0] || '';
  r.detail  = vals.join(', ');
}

async function tryResolveItem(row) {
  // Disk: diskSubType에 따라 프로비저닝 계층 (v2/Ultra)는 skuName 없어도 조회 가능
  const isDiskProv = row.serviceCategory === 'Disk' &&
    (row.options.diskSubType === '프리미엄 SSD v2' || row.options.diskSubType === 'Ultra Disk');

  if (!row.serviceCategory) {
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null; return;
  }
  if (!isDiskProv && !row.skuName) {
    // Disk SKU기반 계층: diskInstance 확인
    if (row.serviceCategory === 'Disk') {
      const hasInstance = row.options.diskInstance;
      if (!hasInstance) { row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null; return; }
    } else {
      row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null; return;
    }
  }
  const def = SERVICE_CATEGORIES[row.serviceCategory];
  if (!def) return;
  const cur = document.getElementById('currencySelect').value;
  setStatus('loading', `${row.skuName||row.options.diskSubType||row.serviceCategory} 가격 조회 중...`);
  const fnName = `_resolve_${row.serviceCategory.replace(/[^a-zA-Z0-9]/g,'_')}`;
  if (typeof window[fnName] === 'function') return await window[fnName](row, cur);
  return await _genericResolve(row, cur);
}

async function _genericResolve(row, cur) {
  const def = SERVICE_CATEGORIES[row.serviceCategory];
  try {
    const bf = { serviceName:def.apiServiceName, armRegionName:row.region };
    const cat = row.serviceCategory;
    if      (cat==='Azure Files')         { const m={'Premium':'Premium Files','Hot':'General Purpose v2 Files','Cool':'Cool Files','Transaction Optimized':'General Purpose v2 Files'}; const pn=m[row.options.fileTier||'Premium']; if(pn) bf.productName=pn; }
    else if (cat==='Blob Storage')        { const m={'Hot':'Hot Block Blob','Cool':'Cool Block Blob','Cold':'Cold Block Blob','Archive':'Archive Block Blob'}; const pn=m[row.options.blobTier||'Hot']; if(pn) bf.productName=pn; }
    else if (cat==='Load Balancer')       bf.productName=`${row.options.tier||'Standard'} Load Balancer`;
    else if (cat==='Application Gateway') bf.skuName=row.skuName;
    else if (cat==='Public IP')           bf.productName='IP Addresses';
    else if (cat==='Azure Firewall')      bf.productName=`Azure Firewall ${row.options.tier||'Standard'}`;
    else if (cat==='Azure SQL Database')  bf.productName=`SQL Database Single/Elastic Pool ${row.options.tier||'General Purpose'} - Compute Gen5`;
    else if (cat==='App Service')         bf.skuName=row.skuName||row.options.size||'';
    else if (cat==='Azure Bastion')       bf.productName=`Azure Bastion ${row.options.tier||'Basic'}`;
    else if (cat==='NAT Gateway')         bf.productName='NAT Gateway';
    const supR = ['Azure SQL Database'].includes(cat);
    const [cItems, rItems] = await Promise.all([
      apiFetch({...bf, priceType:'Consumption'}, cur, 200, 3),
      supR ? apiFetch({...bf, priceType:'Reservation'}, cur, 200, 3).catch(()=>[]) : Promise.resolve([]),
    ]);
    const mC = (it) => {
      if (cat==='Azure Files')         { const r=row.options.redundancy||'LRS',s=it.skuName||'',m=(it.meterName||'').toLowerCase(),metric=(row.options.metric||'Data Stored').toLowerCase(); return s.includes(r)&&m.includes(metric.replace('data stored','stored')); }
      if (cat==='Blob Storage')        return (it.skuName||'').includes(row.options.redundancy||'LRS');
      if (cat==='Load Balancer')       return (it.meterName||'').toLowerCase().includes((row.options.metric||'Rules').toLowerCase());
      if (cat==='Public IP')           { const s=it.skuName||''; return s.includes(row.options.sku||'Standard')&&s.includes(row.options.ipType||'Static'); }
      if (cat==='Azure Firewall')      return (it.meterName||'').toLowerCase().includes((row.options.metric||'Deployment').toLowerCase());
      if (cat==='Application Gateway') return (it.skuName||'').includes(row.skuName);
      if (cat==='Azure Bastion')       return true;
      if (cat==='NAT Gateway')         return (it.meterName||'').toLowerCase().includes((row.options.metric||'Resource Hour').toLowerCase());
      return (it.skuName||it.armSkuName||'')===row.skuName;
    };
    const notSpot=(it)=>{ const s=(it.skuName||'').toLowerCase(),m=(it.meterName||'').toLowerCase(); return !s.includes('spot')&&!m.includes('spot')&&!s.includes('low priority')&&!m.includes('low priority')&&(it.type||'').toLowerCase()!=='devtestconsumption'; };
    const pC=cItems.filter(it=>(it.type||'').toLowerCase()==='consumption'&&mC(it)&&notSpot(it));
    pC.sort((a,b)=>{ const ta=Number(a.tierMinimumUnits||0),tb=Number(b.tierMinimumUnits||0); if(ta!==tb) return ta-tb; return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
    const payg=pC[0]||null;
    let sp1=null,sp3=null;
    const ckSp=(item)=>{ if(!item||!Array.isArray(item.savingsPlan)) return; for(const sp of item.savingsPlan){ const t=String(sp.term||'').toLowerCase(); if((t.includes('1 year')||t==='1'||t.startsWith('1 '))&&!sp1) sp1=makeSpItem(item,sp); else if((t.includes('3 year')||t==='3'||t.startsWith('3 '))&&!sp3) sp3=makeSpItem(item,sp); } };
    ckSp(payg);
    if(!sp1||!sp3){ for(const item of cItems){ if(item===payg||(item.type||'').toLowerCase()!=='consumption'||!mC(item)||!notSpot(item)) continue; ckSp(item); if(sp1&&sp3) break; } }
    const ri1C=rItems.filter(it=>(it.type||'').toLowerCase()==='reservation'&&/1\s*year/i.test(String(it.reservationTerm||''))&&(it.skuName||it.armSkuName||'')===row.skuName).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const ri3C=rItems.filter(it=>(it.type||'').toLowerCase()==='reservation'&&/3\s*year/i.test(String(it.reservationTerm||''))&&(it.skuName||it.armSkuName||'')===row.skuName).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    row.paygItem=payg;row.sp1Item=sp1;row.sp3Item=sp3;
    row.ri1Item=ri1C[0]?normalizeReservationPrice(ri1C[0],1):null;
    row.ri3Item=ri3C[0]?normalizeReservationPrice(ri3C[0],3):null;
    if(payg){ const tags=['PAYG'];if(sp1)tags.push('SP1Y');if(sp3)tags.push('SP3Y');if(row.ri1Item)tags.push('RI1Y');if(row.ri3Item)tags.push('RI3Y'); setStatus('ok',`${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${Number(payg.unitPrice).toFixed(2)}/h`); }
    else setStatus('error',`${row.skuName}: 매칭 없음 (${cItems.length}건)`);
  } catch(err) {
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error',`API 실패: ${err.message.slice(0,100)}`); console.error('조회실패:',err);
  }
  updatePriceCells(row); updateTotalsRow();
}
