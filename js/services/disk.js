// ================================================================
// services/disk.js — Disk (Managed Disks)
//
// [v41] 수정사항
//   1. console.log 문법 오류 수정 (Disk 카테고리 미노출 원인)
//   2. P20 이하: ri1Item 명시적 null 보장
//   3. PREMIUM_SSD_RI_SUPPORTED window 전역 노출
// ================================================================

var DISK_SUBTYPE_MAP = window.DISK_SUBTYPE_MAP = {
  '표준 HDD':        { diskType:'hdd',       storageType:'Standard HDD Managed Disks',   hasRedundancy:false, isProvisioned:false },
  '표준 SSD':        { diskType:'ssd',       storageType:'Standard SSD Managed Disks',   hasRedundancy:true,  isProvisioned:false },
  '프리미엄 SSD':    { diskType:'premium',   storageType:'Premium SSD Managed Disks',    hasRedundancy:true,  isProvisioned:false },
  '프리미엄 SSD v2': { diskType:'premiumv2', storageType:'Premium SSD v2 Managed Disks', hasRedundancy:false, isProvisioned:true  },
  'Ultra Disk':      { diskType:'ultra',      storageType:'Ultra Disk',                   hasRedundancy:false, isProvisioned:true  },
};

// P30 이상에서만 1년 예약 지원 (Azure 정책 기준)
var PREMIUM_SSD_RI_SUPPORTED = window.PREMIUM_SSD_RI_SUPPORTED = new Set(['P30','P40','P50','P60','P70','P80']);

var ULTRA_DISK_SIZES = window.ULTRA_DISK_SIZES = [
  { gib:4,     label:'4 GiB' },
  { gib:8,     label:'8 GiB' },
  { gib:16,    label:'16 GiB' },
  { gib:32,    label:'32 GiB' },
  { gib:64,    label:'64 GiB' },
  { gib:128,   label:'128 GiB' },
  { gib:256,   label:'256 GiB' },
  { gib:512,   label:'512 GiB' },
  { gib:1024,  label:'1 TiB (1,024 GiB)' },
  { gib:2048,  label:'2 TiB (2,048 GiB)' },
  { gib:4096,  label:'4 TiB (4,096 GiB)' },
  { gib:8192,  label:'8 TiB (8,192 GiB)' },
  { gib:16384, label:'16 TiB (16,384 GiB)' },
  { gib:32768, label:'32 TiB (32,768 GiB)' },
  { gib:65536, label:'64 TiB (65,536 GiB)' },
];

window._svcDefs['Disk'] = {
  apiServiceName: 'Storage',
  steps: [
    { key:'diskSubType', label:'디스크 종류', options:['표준 HDD','표준 SSD','프리미엄 SSD','프리미엄 SSD v2','Ultra Disk'] },
  ],
  instanceField: false,
};

var DISK_CATALOG = window.DISK_CATALOG = {
  'Premium SSD Managed Disks': [
    {name:'P1', size:4,     iops:120,   throughput:25},
    {name:'P2', size:8,     iops:120,   throughput:25},
    {name:'P3', size:16,    iops:120,   throughput:25},
    {name:'P4', size:32,    iops:120,   throughput:25},
    {name:'P6', size:64,    iops:240,   throughput:50},
    {name:'P10',size:128,   iops:500,   throughput:100},
    {name:'P15',size:256,   iops:1100,  throughput:125},
    {name:'P20',size:512,   iops:2300,  throughput:150},
    {name:'P30',size:1024,  iops:5000,  throughput:200},
    {name:'P40',size:2048,  iops:7500,  throughput:250},
    {name:'P50',size:4096,  iops:7500,  throughput:250},
    {name:'P60',size:8192,  iops:16000, throughput:500},
    {name:'P70',size:16384, iops:18000, throughput:750},
    {name:'P80',size:32767, iops:20000, throughput:900},
  ],
  'Standard SSD Managed Disks': [
    {name:'E1', size:4},    {name:'E2', size:8},   {name:'E3', size:16},
    {name:'E4', size:32},   {name:'E6', size:64},  {name:'E10',size:128},
    {name:'E15',size:256},  {name:'E20',size:512}, {name:'E30',size:1024},
    {name:'E40',size:2048}, {name:'E50',size:4096},{name:'E60',size:8192},
    {name:'E70',size:16384},{name:'E80',size:32767},
  ],
  'Standard HDD Managed Disks': [
    {name:'S4', size:32},   {name:'S6', size:64},  {name:'S10',size:128},
    {name:'S15',size:256},  {name:'S20',size:512}, {name:'S30',size:1024},
    {name:'S40',size:2048}, {name:'S50',size:4096},{name:'S60',size:8192},
    {name:'S70',size:16384},{name:'S80',size:32767},
  ],
};

// ================================================================
// _buildDetail_Disk
// ================================================================
window['_buildDetail_Disk'] = function(r) {
  const o = r.options;
  const sub = DISK_SUBTYPE_MAP[o.diskSubType];
  if (!sub) { r.skuName=''; r.detail=''; return; }

  if (sub.isProvisioned) {
    r.skuName = o.diskSubType;
    const parts = [];
    if (o.diskSizeGiB) parts.push(o.diskSizeGiB + 'GiB');
    if (o.provisionedIOPS) parts.push('IOPS:' + Number(o.provisionedIOPS).toLocaleString());
    if (o.provisionedMBps) parts.push('BW:' + o.provisionedMBps + 'MB/s');
    r.detail = parts.join(', ');
    return;
  }

  r.skuName = o.diskInstance || '';
  const disk = (DISK_CATALOG[sub.storageType]||[]).find(function(d){ return d.name===o.diskInstance; });
  const parts = [o.diskSubType];
  if (disk) parts.push(disk.size + 'GB');
  if (sub.hasRedundancy && o.redundancy) parts.push(o.redundancy);
  if (sub.diskType === 'premium') {
    if (Number(o.snapshotGB)>0) parts.push('스냅샷 ' + o.snapshotGB + 'GB');
    if (o.confEncryptionEnabled==='활성화') parts.push('Conf-Enc');
    if (o.burstingEnabled==='활성화 (P30 이상)') parts.push('버스팅');
  } else {
    const tx = Number(o.transactionUnits||0);
    if (tx>0) parts.push('Tx ' + tx.toLocaleString() + 'x10K');
    if (Number(o.snapshotGB)>0) parts.push('스냅샷 ' + o.snapshotGB + 'GB');
    if (o.confEncryptionEnabled==='활성화') parts.push('Conf-Enc');
  }
  r.detail = parts.join(', ');
};

// ================================================================
// _resolve_Disk — 진입점
// ================================================================
window['_resolve_Disk'] = async function(row, cur) {
  const o = row.options||{};
  const sub = DISK_SUBTYPE_MAP[o.diskSubType];
  if (!sub) {
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error','Disk 종류를 먼저 선택하세요.');
    updatePriceCells(row);updateTotalsRow();return;
  }
  if (sub.isProvisioned) return _resolveProvisionedDisk(row, cur, sub.diskType);
  if (sub.diskType==='premium') {
    if (!row.skuName) {
      row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
      updatePriceCells(row);updateTotalsRow();return;
    }
    return _resolvePremiumSSD(row, cur);
  }
  if (!row.skuName) {
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    updatePriceCells(row);updateTotalsRow();return;
  }
  return _resolveStandardDisk(row, cur, sub.diskType);
};

// ================================================================
// 표준 HDD / 표준 SSD 공통 resolve
// ================================================================
async function _resolveStandardDisk(row, cur, diskType) {
  const o = row.options||{};
  const sub = DISK_SUBTYPE_MAP[o.diskSubType];
  const storageType = sub.storageType;
  const redundancy  = (diskType==='hdd') ? 'LRS' : (o.redundancy||'LRS');
  const skuFull     = row.skuName + ' ' + redundancy;
  const txUnits     = Number(o.transactionUnits||0);
  const snapshotGB  = Number(o.snapshotGB||0);
  const confEncOn   = o.confEncryptionEnabled==='활성화';
  const diskEntry   = (DISK_CATALOG[storageType]||[]).find(function(d){ return d.name===row.skuName; });
  const diskSizeGiB = diskEntry ? diskEntry.size : 0;
  try {
    const bf = { serviceName:'Storage', armRegionName:row.region, productName:storageType };
    const [diskItems, allItems] = await Promise.all([
      apiFetch(Object.assign({}, bf, { skuName:skuFull, priceType:'Consumption' }), cur, 100, 2),
      (txUnits>0||snapshotGB>0||confEncOn)
        ? apiFetch(Object.assign({}, bf, { priceType:'Consumption' }), cur, 400, 3)
        : Promise.resolve([]),
    ]);
    const isPlain = function(it){ const m=(it.meterName||'').toLowerCase(); return !m.includes('burst')&&!m.includes('enablement')&&!m.includes('snapshot')&&!m.includes('one-time')&&!m.includes('encrypt')&&!m.includes('shared')&&!m.includes('confidential'); };
    const exp = (skuFull + ' Disk').toLowerCase();
    const disk = diskItems.filter(function(it){
      if((it.type||'').toLowerCase()!=='consumption') return false;
      if(!(it.unitOfMeasure||'').toLowerCase().includes('month')) return false;
      if(!isPlain(it)) return false;
      const m=(it.meterName||'').toLowerCase();
      return m===exp||m.startsWith(skuFull.toLowerCase());
    }).sort(function(a,b){ const ae=(a.meterName||'').toLowerCase()===exp?0:1,be=(b.meterName||'').toLowerCase()===exp?0:1; if(ae!==be) return ae-be; return Number(a.unitPrice||0)-Number(b.unitPrice||0); })[0]||null;

    var txItem=null;
    if(txUnits>0){
      const aT=allItems.filter(function(it){ const u=(it.unitOfMeasure||'').toLowerCase(); return u.includes('10k')||u.includes('10,000')||u.includes('10000'); });
      var tC=aT.filter(function(it){ const m=(it.meterName||'').toLowerCase(),s=(it.skuName||'').toLowerCase(),rl=redundancy.toLowerCase(); return (m.includes('operation')||m.includes('transaction'))&&(m.includes(rl)||s.includes(rl)); });
      if(!tC.length) tC=aT.filter(function(it){ const m=(it.meterName||'').toLowerCase(),s=(it.skuName||'').toLowerCase(); return m.includes(redundancy.toLowerCase())||s.includes(redundancy.toLowerCase()); });
      if(!tC.length) tC=aT;
      tC.sort(function(a,b){ return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
      txItem=tC[0]||null;
    }
    var snapPPG=0;
    if(snapshotGB>0){ const sC=allItems.filter(function(it){ const m=(it.meterName||'').toLowerCase(); return m.includes('snapshot')&&(m.includes('lrs')||m.includes('locally')); }).sort(function(a,b){ return Number(a.unitPrice||0)-Number(b.unitPrice||0); }); if(sC[0]) snapPPG=Number(sC[0].unitPrice); }
    var confEncM=0;
    if(confEncOn&&diskSizeGiB>0){ const eC=allItems.filter(function(it){ const m=(it.meterName||'').toLowerCase(); return m.includes('confidential')&&m.includes('encrypt'); }).sort(function(a,b){ return Number(a.unitPrice||0)-Number(b.unitPrice||0); }); if(eC[0]) confEncM=diskSizeGiB*730*Number(eC[0].unitPrice); }

    var monthly=0;
    if(disk) monthly+=Number(disk.unitPrice);
    if(txItem&&txUnits>0) monthly+=Number(txItem.unitPrice)*txUnits;
    if(snapshotGB>0) monthly+=snapPPG*snapshotGB;
    if(confEncOn) monthly+=confEncM;
    const usH=Number(row.usage)||730;
    const payg=disk?Object.assign({},disk,{unitPrice:monthly/usH,retailPrice:monthly/usH,unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',_monthlyTotal:monthly}):null;
    row.paygItem=payg;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    if(payg) setStatus('ok', row.skuName+' '+redundancy+' 완료 · '+monthly.toFixed(2)+'/월');
    else if(redundancy==='ZRS') setStatus('error', row.skuName+' ZRS: 이 리전에서 ZRS 미제공일 수 있음 - 중복성을 LRS로 바꿔 보세요');
    else     setStatus('error', row.skuName+': 매칭 실패 - F12 확인');
  } catch(err){
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error','Disk 실패: '+err.message.slice(0,80)); console.error('Disk:',err);
  }
  updatePriceCells(row); updateTotalsRow();
}

// ================================================================
// 프리미엄 SSD resolve
// P30 이상에서만 RI 1년 조회·표시, P20 이하는 ri1Item=null 보장
// ================================================================
async function _resolvePremiumSSD(row, cur) {
  const o = row.options||{};
  const storageType = 'Premium SSD Managed Disks';
  const redundancy  = o.redundancy||'LRS';
  const skuFull     = row.skuName + ' ' + redundancy;
  const snapshotGB  = Number(o.snapshotGB||0);
  const confEncOn   = o.confEncryptionEnabled==='활성화';
  const burstOn     = o.burstingEnabled==='활성화 (P30 이상)';
  // P30 이상에서만 RI 조회 (P20 이하는 예약 미지원)
  const supportsRI  = PREMIUM_SSD_RI_SUPPORTED.has(row.skuName);

  const bIOPS   = burstOn ? Number(o.burstMaxIOPS||0) : 0;
  const bMins   = burstOn ? Number(o.burstMinsPerDay||30) : 0;
  const bDays   = burstOn ? Number(o.burstWorkDaysPerMonth||20) : 0;
  const bTxUnits= bIOPS>0 ? Math.ceil(bIOPS*60*bMins*bDays/10000) : 0;
  const diskEntry   = (DISK_CATALOG[storageType]||[]).find(function(d){ return d.name===row.skuName; });
  const diskSizeGiB = diskEntry ? diskEntry.size : 0;

  try {
    const needsExtras = burstOn||snapshotGB>0||confEncOn;
    const bf = { serviceName:'Storage', armRegionName:row.region, productName:storageType };
    const [diskItems, allItems, resItems] = await Promise.all([
      apiFetch(Object.assign({}, bf, { skuName:skuFull, priceType:'Consumption' }), cur, 100, 2),
      needsExtras
        ? apiFetch(Object.assign({}, bf, { priceType:'Consumption' }), cur, 400, 3)
        : Promise.resolve([]),
      supportsRI
        ? apiFetch(Object.assign({}, bf, { priceType:'Reservation' }), cur, 200, 2).catch(function(){ return []; })
        : Promise.resolve([]),
    ]);

    const isPlain=function(it){ const m=(it.meterName||'').toLowerCase(); return !m.includes('mount')&&!m.includes('burst')&&!m.includes('enablement')&&!m.includes('snapshot')&&!m.includes('one-time')&&!m.includes('encrypt')&&!m.includes('shared')&&!m.includes('confidential'); };
    const exp=(skuFull+' Disk').toLowerCase();
    const disk = diskItems.filter(function(it){
      if((it.type||'').toLowerCase()!=='consumption') return false;
      if(!(it.unitOfMeasure||'').toLowerCase().includes('month')) return false;
      if(!isPlain(it)) return false;
      const m=(it.meterName||'').toLowerCase();
      return m===exp||m.startsWith(skuFull.toLowerCase());
    }).sort(function(a,b){ const ae=(a.meterName||'').toLowerCase()===exp?0:1,be=(b.meterName||'').toLowerCase()===exp?0:1; if(ae!==be) return ae-be; return Number(a.unitPrice||0)-Number(b.unitPrice||0); })[0]||null;

    var snapPPG=0;
    if(snapshotGB>0){ const sC=allItems.filter(function(it){ const m=(it.meterName||'').toLowerCase(); return m.includes('snapshot')&&(m.includes('lrs')||m.includes('locally')); }).sort(function(a,b){ return Number(a.unitPrice||0)-Number(b.unitPrice||0); }); if(sC[0]) snapPPG=Number(sC[0].unitPrice); }
    var confEncM=0;
    if(confEncOn&&diskSizeGiB>0&&allItems.length>0){ const eC=allItems.filter(function(it){ const m=(it.meterName||'').toLowerCase(); return m.includes('confidential')&&m.includes('encrypt'); }).sort(function(a,b){ return Number(a.unitPrice||0)-Number(b.unitPrice||0); }); if(eC[0]) confEncM=diskSizeGiB*730*Number(eC[0].unitPrice); }
    var bEnaM=0,bTxPPU=0;
    if(burstOn&&allItems.length>0){
      const eC=allItems.filter(function(it){ const m=(it.meterName||'').toLowerCase(); return m.includes('burst')&&m.includes('enablement'); }).sort(function(a,b){ return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
      if(eC[0]) bEnaM=Number(eC[0].unitPrice);
      if(bTxUnits>0){ const bC=allItems.filter(function(it){ const m=(it.meterName||'').toLowerCase(),u=(it.unitOfMeasure||'').toLowerCase(); return m.includes('burst')&&(u.includes('10k')||u.includes('10,000')||u.includes('10000')); }).sort(function(a,b){ return Number(a.unitPrice||0)-Number(b.unitPrice||0); }); if(bC[0]) bTxPPU=Number(bC[0].unitPrice); }
    }
    const extras = (snapshotGB>0?snapPPG*snapshotGB:0) + confEncM + (burstOn?bEnaM+(bTxPPU*bTxUnits):0);
    const monthly = (disk?Number(disk.unitPrice):0) + extras;
    const usH = Number(row.usage)||730;

    const payg = disk
      ? Object.assign({},disk,{unitPrice:monthly/usH,retailPrice:monthly/usH,
          unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',_monthlyTotal:monthly})
      : null;

    // P30 이상에서만 RI 1년 — P20 이하는 무조건 null
    var ri1Item = null;
    if(supportsRI && resItems.length>0){
      const skuBase = row.skuName.toLowerCase();
      const ri1C = resItems.filter(function(it){
        if((it.type||'').toLowerCase()!=='reservation') return false;
        if(!/1\s*year/i.test(String(it.reservationTerm||''))) return false;
        const s=(it.skuName||'').toLowerCase();
        return s.includes(skuBase) && s.includes(redundancy.toLowerCase());
      }).sort(function(a,b){ return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
      if(ri1C[0]){
        const tot=Number(ri1C[0].unitPrice), ri1M=tot/12, ri1MT=ri1M+extras;
        ri1Item=Object.assign({},ri1C[0],{unitPrice:ri1MT/usH,retailPrice:ri1MT/usH,
                 unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',
                 _monthlyTotal:ri1MT,_originalUnitPrice:tot,_termYears:1});
      }
    }

    row.paygItem=payg; row.sp1Item=null; row.sp3Item=null;
    row.ri1Item=ri1Item; // P20 이하면 항상 null
    row.ri3Item=null;

    const riStatus = supportsRI ? (ri1Item ? 'RI1Y 있음' : 'RI1Y 매칭실패') : 'RI 미지원(P30이상만)';
    if(payg) setStatus('ok', row.skuName+' '+redundancy+' 완료 [PAYG'+( ri1Item?', RI1Y':'')+'] · '+monthly.toFixed(2)+'/월');
    else if(redundancy==='ZRS') setStatus('error', row.skuName+' ZRS: 이 리전에서 ZRS 미제공일 수 있음 - 중복성을 LRS로 바꿔 보세요');
    else      setStatus('error', row.skuName+': 매칭 실패 - F12 확인');
    console.log('[Premium SSD]', row.skuName, redundancy, '| PAYG:', payg?monthly.toFixed(2)+'/월':'없음', '|', riStatus);
  } catch(err){
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error','Premium SSD 실패: '+err.message.slice(0,80)); console.error('PremiumSSD:',err);
  }
  updatePriceCells(row); updateTotalsRow();
}

// ================================================================
// 프리미엄 SSD v2 / Ultra Disk resolve
// productName 필터 제거 → serviceName:Storage + 클라이언트 필터링
// ================================================================
async function _resolveProvisionedDisk(row, cur, diskType) {
  const o = row.options||{};
  const diskSizeGiB = Number(o.diskSizeGiB||(diskType==='ultra'?4:1));
  const provIOPS    = Number(o.provisionedIOPS||(diskType==='ultra'?100:3000));
  const provMBps    = Number(o.provisionedMBps||(diskType==='ultra'?1:125));
  const freeIOPS    = diskType==='premiumv2' ? 3000 : 0;
  const freeMBps    = diskType==='premiumv2' ? 125  : 0;
  const chargeIOPS  = Math.max(0, provIOPS - freeIOPS);
  const chargeMBps  = Math.max(0, provMBps - freeMBps);
  const kwStorage   = diskType==='premiumv2' ? ['premium ssd v2','premium disk v2'] : ['ultra disk','ultra disks'];
  const matchesType = function(it) {
    const pn = (it.productName||'').toLowerCase();
    const mn = (it.meterName||'').toLowerCase();
    return kwStorage.some(function(kw){ return pn.includes(kw)||mn.includes(kw); });
  };
  try {
    const items = await apiFetch(
      { serviceName:'Storage', armRegionName:row.region, priceType:'Consumption' },
      cur, 2000, 5
    );
    const cons = items.filter(function(it){
      return (it.type||'').toLowerCase()==='consumption' && matchesType(it);
    });
    console.group('['+o.diskSubType+'] '+row.region+' — 전체 '+items.length+'건 중 매칭 '+cons.length+'건');
    if(cons.length>0) console.log('샘플:', cons.slice(0,5).map(function(x){ return {productName:x.productName,meterName:x.meterName,unitOfMeasure:x.unitOfMeasure,unitPrice:x.unitPrice}; }));
    else console.warn('매칭 항목 없음 — productName 목록:', [...new Set(items.slice(0,30).map(function(x){ return x.productName; }))]);
    console.groupEnd();

    const stoC = cons.filter(function(it){
      const u=(it.unitOfMeasure||'').toLowerCase();
      const m=(it.meterName||'').toLowerCase();
      return (u.includes('gib')&&u.includes('hour'))&&!m.includes('iops')&&!m.includes('throughput')&&!m.includes('bandwidth')&&!m.includes('mb/s')&&!m.includes('burst');
    }).sort(function(a,b){ return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
    const ioC = cons.filter(function(it){
      const m=(it.meterName||'').toLowerCase(),u=(it.unitOfMeasure||'').toLowerCase();
      return m.includes('iops')&&u.includes('hour');
    }).sort(function(a,b){ return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
    const bwC = cons.filter(function(it){
      const m=(it.meterName||'').toLowerCase(),u=(it.unitOfMeasure||'').toLowerCase();
      return (m.includes('throughput')||m.includes('bandwidth')||m.includes('mb/s')||m.includes('mbps'))&&u.includes('hour');
    }).sort(function(a,b){ return Number(a.unitPrice||0)-Number(b.unitPrice||0); });

    const stoPPG=stoC[0]?Number(stoC[0].unitPrice):0;
    const ioPPU =ioC[0]?Number(ioC[0].unitPrice):0;
    const bwPPU =bwC[0]?Number(bwC[0].unitPrice):0;
    console.log('['+o.diskSubType+'] 단가 — 스토리지:'+stoPPG+'/GiB/h IOPS:'+ioPPU+'/h BW:'+bwPPU+'/h');

    const stoM   = diskSizeGiB*730*stoPPG;
    const ioM    = chargeIOPS*730*ioPPU;
    const bwM    = chargeMBps*730*bwPPU;
    const monthly= stoM+ioM+bwM;
    const usH    = Number(row.usage)||730;
    const baseItem = stoC[0]||cons[0]||null;
    const payg = baseItem
      ? Object.assign({},baseItem,{unitPrice:monthly/usH,retailPrice:monthly/usH,
          unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',
          _monthlyTotal:monthly,_stoMonthly:stoM,_ioMonthly:ioM,_bwMonthly:bwM})
      : null;
    row.paygItem=payg;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    if(payg) setStatus('ok', o.diskSubType+' '+diskSizeGiB+'GiB 완료 · '+monthly.toFixed(2)+'/월');
    else      setStatus('error', o.diskSubType+': 매칭 실패 — F12 콘솔 확인');
  } catch(err){
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error', o.diskSubType+' 실패: '+err.message.slice(0,80));
    console.error(o.diskSubType, err);
  }
  updatePriceCells(row); updateTotalsRow();
}
