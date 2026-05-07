// ================================================================
// services/disk.js — Disk (Managed Disks)
// 수정 대상: 디스크 SKU 목록, Premium SSD 옵션, 가격 매칭 로직
// ================================================================

window._svcDefs['Disk'] = {
  apiServiceName: 'Storage',
  steps: [
    { key:'storageType', label:'Storage Type', options:['Premium SSD Managed Disks','Standard SSD Managed Disks','Standard HDD Managed Disks'] },
    { key:'redundancy',  label:'중복성',       options:['LRS','ZRS'] },
  ],
  conditionalSteps: {
    'Premium SSD Managed Disks': [
      { key:'perfTier',            label:'성능 계층 업그레이드',         options:['없음 (기본)','P4','P6','P10','P15','P20','P30','P40','P50','P60','P70','P80'], tooltip:'용량 유지하며 성능만 상위 계층으로 업그레이드' },
      { key:'snapshotGB',          label:'스냅샷 (GB, 월)',              type:'number', min:0, step:1, default:0, tooltip:'증분 스냅샷 LRS 저장 GB × 단가' },
      { key:'confEncryptionEnabled',label:'Confidential OS Encryption', options:['비활성 (기본)','활성화'], tooltip:'GiB × 730h × Per GiB 단가' },
      { key:'burstingEnabled',     label:'디스크 버스팅 (On-Demand)',   options:['비활성 (기본)','활성화 (P30 이상)'], tooltip:'P30 이상. 활성화 월정액 + 버스트 트랜잭션' },
      { key:'burstMaxIOPS',        label:'예상 최대 IOPS (버스트)',      type:'number', min:0, step:100, default:0 },
      { key:'burstMaxThroughputMBs',label:'예상 최대 처리량 MB/s',      type:'number', min:0, step:10,  default:0 },
      { key:'burstMinsPerDay',     label:'근무일당 버스트 시간 (분)',    type:'number', min:0, step:1,   default:30 },
      { key:'burstWorkDaysPerMonth',label:'월간 근무일 수',              type:'number', min:0, step:1,   default:20 },
      { key:'sharedDiskMounts',    label:'공유 디스크 마운트 수 (VM수)', type:'number', min:0, step:1,   default:0,  tooltip:'마운트당 추가 비용' },
    ],
    'Standard SSD Managed Disks': [
      { key:'transactionUnits', label:'Storage 트랜잭션 (10,000단위, 월)', type:'number', min:0, step:1, default:0 },
      { key:'snapshotGB',       label:'스냅샷 (GB, 월)',                   type:'number', min:0, step:1, default:0 },
    ],
    'Standard HDD Managed Disks': [
      { key:'transactionUnits', label:'Storage 트랜잭션 (10,000단위, 월)', type:'number', min:0, step:1, default:0 },
      { key:'snapshotGB',       label:'스냅샷 (GB, 월)',                   type:'number', min:0, step:1, default:0 },
    ],
  },
  instanceField: true,
  instanceParentKey: 'storageType',
};

const DISK_CATALOG = {
  'Premium SSD Managed Disks': [
    {name:'P1',size:4,iops:120,throughput:25},{name:'P2',size:8,iops:120,throughput:25},
    {name:'P3',size:16,iops:120,throughput:25},{name:'P4',size:32,iops:120,throughput:25},
    {name:'P6',size:64,iops:240,throughput:50},{name:'P10',size:128,iops:500,throughput:100},
    {name:'P15',size:256,iops:1100,throughput:125},{name:'P20',size:512,iops:2300,throughput:150},
    {name:'P30',size:1024,iops:5000,throughput:200},{name:'P40',size:2048,iops:7500,throughput:250},
    {name:'P50',size:4096,iops:7500,throughput:250},{name:'P60',size:8192,iops:16000,throughput:500},
    {name:'P70',size:16384,iops:18000,throughput:750},{name:'P80',size:32767,iops:20000,throughput:900},
  ],
  'Standard SSD Managed Disks': [
    {name:'E1',size:4},{name:'E2',size:8},{name:'E3',size:16},{name:'E4',size:32},
    {name:'E6',size:64},{name:'E10',size:128},{name:'E15',size:256},{name:'E20',size:512},
    {name:'E30',size:1024},{name:'E40',size:2048},{name:'E50',size:4096},
    {name:'E60',size:8192},{name:'E70',size:16384},{name:'E80',size:32767},
  ],
  'Standard HDD Managed Disks': [
    {name:'S4',size:32},{name:'S6',size:64},{name:'S10',size:128},{name:'S15',size:256},
    {name:'S20',size:512},{name:'S30',size:1024},{name:'S40',size:2048},{name:'S50',size:4096},
    {name:'S60',size:8192},{name:'S70',size:16384},{name:'S80',size:32767},
  ],
};

window['_buildDetail_Disk'] = function(r) {
  const o = r.options;
  r.skuName = o.instance || '';
  const disk = (DISK_CATALOG[o.storageType]||[]).find(d=>d.name===o.instance);
  const parts = [];
  if (o.storageType) parts.push(o.storageType);
  if (disk) parts.push(`${disk.size}GB`);
  if (o.redundancy) parts.push(o.redundancy);
  if (o.storageType === 'Premium SSD Managed Disks') {
    if (o.perfTier && o.perfTier!=='없음 (기본)') parts.push(`성능업그:${o.perfTier}`);
    if (Number(o.snapshotGB)>0) parts.push(`스냅샷 ${o.snapshotGB}GB`);
    if (o.confEncryptionEnabled==='활성화') parts.push('Conf-Enc');
    if (o.burstingEnabled==='활성화 (P30 이상)') parts.push('버스팅');
    if (Number(o.sharedDiskMounts)>0) parts.push(`공유×${o.sharedDiskMounts}`);
  } else {
    const tx = Number(o.transactionUnits||0);
    if (tx>0) parts.push(`Tx ${tx.toLocaleString()}×10K`);
    if (Number(o.snapshotGB)>0) parts.push(`스냅샷 ${o.snapshotGB}GB`);
  }
  r.detail = parts.join(', ');
};

window['_resolve_Disk'] = async function(row, cur) {
  const o = row.options||{};
  const storageType = o.storageType||'Premium SSD Managed Disks';
  const redundancy  = o.redundancy||'LRS';
  const isPremium   = storageType==='Premium SSD Managed Disks';
  const txUnits     = isPremium ? 0 : Number(o.transactionUnits||0);
  const skuFull     = `${row.skuName} ${redundancy}`;
  const snapshotGB  = Number(o.snapshotGB||0);
  const perfTier    = (isPremium&&o.perfTier&&o.perfTier!=='없음 (기본)') ? o.perfTier : null;
  const effectiveSku= perfTier ? `${perfTier} ${redundancy}` : skuFull;
  const burstOn     = isPremium && o.burstingEnabled==='활성화 (P30 이상)';
  const confEncOn   = isPremium && o.confEncryptionEnabled==='활성화';
  const sharedMnts  = isPremium ? Number(o.sharedDiskMounts||0) : 0;
  const bIOPS       = burstOn ? Number(o.burstMaxIOPS||0) : 0;
  const bMins       = burstOn ? Number(o.burstMinsPerDay||30) : 0;
  const bDays       = burstOn ? Number(o.burstWorkDaysPerMonth||20) : 0;
  const bTxUnits    = bIOPS>0 ? Math.ceil(bIOPS*60*bMins*bDays/10000) : 0;
  const diskEntry   = (DISK_CATALOG[storageType]||[]).find(d=>d.name===row.skuName);
  const diskSizeGiB = diskEntry ? diskEntry.size : 0;
  try {
    const needsExtras = isPremium&&(burstOn||snapshotGB>0||confEncOn||sharedMnts>0);
    const [diskItems,perfItems,txRaw,resItems,extItems] = await Promise.all([
      apiFetch({serviceName:'Storage',armRegionName:row.region,productName:storageType,skuName:skuFull,priceType:'Consumption'},cur,100,2),
      perfTier ? apiFetch({serviceName:'Storage',armRegionName:row.region,productName:storageType,skuName:effectiveSku,priceType:'Consumption'},cur,100,2) : Promise.resolve([]),
      (!isPremium&&txUnits>0) ? apiFetch({serviceName:'Storage',armRegionName:row.region,productName:storageType,priceType:'Consumption'},cur,200,3) : Promise.resolve([]),
      apiFetch({serviceName:'Storage',armRegionName:row.region,productName:storageType,priceType:'Reservation'},cur,200,2).catch(()=>[]),
      needsExtras ? apiFetch({serviceName:'Storage',armRegionName:row.region,productName:storageType,priceType:'Consumption'},cur,400,3) : Promise.resolve([]),
    ]);
    const isPlain=(it)=>{ const m=(it.meterName||'').toLowerCase(); return !m.includes('mount')&&!m.includes('burst')&&!m.includes('enablement')&&!m.includes('snapshot')&&!m.includes('one-time')&&!m.includes('encrypt')&&!m.includes('shared')&&!m.includes('confidential'); };
    const findDisk=(items,sku)=>{ const exp=`${sku} Disk`.toLowerCase(); const c=items.filter(it=>{ if((it.type||'').toLowerCase()!=='consumption') return false; if(!(it.unitOfMeasure||'').toLowerCase().includes('month')) return false; if(!isPlain(it)) return false; const m=(it.meterName||'').toLowerCase(); return m===exp||m.startsWith(sku.toLowerCase()); }); c.sort((a,b)=>{ const ae=(a.meterName||'').toLowerCase()===exp?0:1,be=(b.meterName||'').toLowerCase()===exp?0:1; if(ae!==be)return ae-be; return Number(a.unitPrice||0)-Number(b.unitPrice||0); }); return c[0]||null; };
    const disk = perfTier ? (findDisk(perfItems,effectiveSku)||findDisk(diskItems,skuFull)) : findDisk(diskItems,skuFull);
    let txItem=null;
    if(!isPremium&&txUnits>0){ const aT=txRaw.filter(it=>{ const u=(it.unitOfMeasure||'').toLowerCase(); return u.includes('10k')||u.includes('10,000')||u.includes('10000'); }); let tC=aT.filter(it=>{ const m=(it.meterName||'').toLowerCase(),s=(it.skuName||'').toLowerCase(),rl=redundancy.toLowerCase(); return (m.includes('operation')||m.includes('transaction'))&&(m.includes(rl)||s.includes(rl)); }); if(!tC.length)tC=aT.filter(it=>{ const m=(it.meterName||'').toLowerCase(),s=(it.skuName||'').toLowerCase(); return m.includes(redundancy.toLowerCase())||s.includes(redundancy.toLowerCase()); }); if(!tC.length)tC=aT; tC.sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0)); txItem=tC[0]||null; }
    let snapPPG=0;
    if(snapshotGB>0){ const src=extItems.length>0?extItems:txRaw; const sC=src.filter(it=>{ const m=(it.meterName||'').toLowerCase(); return m.includes('snapshot')&&(m.includes('lrs')||m.includes('locally')); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0)); if(sC[0])snapPPG=Number(sC[0].unitPrice); }
    let bEnaM=0,bTxPPU=0;
    if(burstOn&&extItems.length>0){ const eC=extItems.filter(it=>{ const m=(it.meterName||'').toLowerCase(); return m.includes('burst')&&m.includes('enablement'); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0)); if(eC[0])bEnaM=Number(eC[0].unitPrice); if(bTxUnits>0){ const bC=extItems.filter(it=>{ const m=(it.meterName||'').toLowerCase(),u=(it.unitOfMeasure||'').toLowerCase(); return m.includes('burst')&&(u.includes('10k')||u.includes('10,000')||u.includes('10000')); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0)); if(bC[0])bTxPPU=Number(bC[0].unitPrice); } }
    let confEncM=0;
    if(confEncOn&&diskSizeGiB>0&&extItems.length>0){ const eC=extItems.filter(it=>{ const m=(it.meterName||'').toLowerCase(); return m.includes('confidential')&&m.includes('encrypt'); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0)); if(eC[0])confEncM=diskSizeGiB*730*Number(eC[0].unitPrice); }
    let shrM=0;
    if(sharedMnts>0&&extItems.length>0){ const sC=extItems.filter(it=>{ const m=(it.meterName||'').toLowerCase(); return m.includes('mount')||(m.includes('shared')&&m.includes('disk')); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0)); if(sC[0])shrM=Number(sC[0].unitPrice)*sharedMnts; }
    const usH=Number(row.usage)||730;
    let monthly=0;
    if(disk)monthly+=Number(disk.unitPrice);
    if(txItem&&txUnits>0)monthly+=Number(txItem.unitPrice)*txUnits;
    if(snapshotGB>0)monthly+=snapPPG*snapshotGB;
    if(burstOn)monthly+=bEnaM+(bTxPPU*bTxUnits);
    if(confEncOn)monthly+=confEncM;
    if(sharedMnts>0)monthly+=shrM;
    const hourlyEq=usH>0?monthly/usH:0;
    let payg=null;
    if(disk)payg={...disk,unitPrice:hourlyEq,retailPrice:hourlyEq,unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',_monthlyTotal:monthly};
    let ri1Item=null;
    const ri1C=resItems.filter(it=>{ if((it.type||'').toLowerCase()!=='reservation') return false; if(!/1\s*year/i.test(String(it.reservationTerm||''))) return false; const s=(it.skuName||'').toLowerCase(),ms=perfTier?effectiveSku.toLowerCase():skuFull.toLowerCase(); return s.includes(ms.split(' ')[0].toLowerCase())&&s.includes(redundancy.toLowerCase()); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    if(ri1C[0]){ const tot=Number(ri1C[0].unitPrice),ri1M=tot/12,ri1MT=ri1M+(txItem&&txUnits>0?Number(txItem.unitPrice)*txUnits:0)+(snapshotGB>0?snapPPG*snapshotGB:0)+(burstOn?bEnaM+(bTxPPU*bTxUnits):0)+confEncM+shrM,ri1H=usH>0?ri1MT/usH:0; ri1Item={...ri1C[0],unitPrice:ri1H,retailPrice:ri1H,unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',_monthlyTotal:ri1MT,_originalUnitPrice:tot,_termYears:1}; }
    row.paygItem=payg;row.sp1Item=null;row.sp3Item=null;row.ri1Item=ri1Item;row.ri3Item=null;
    if(payg)setStatus('ok',`${row.skuName} ${redundancy} 완료${perfTier?` [업그→${perfTier}]`:''} · ${monthly.toFixed(2)}/월`);
    else setStatus('error',`${row.skuName}: 디스크 매칭 실패 - F12 확인`);
  }catch(err){row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;setStatus('error',`Disk 실패: ${err.message.slice(0,100)}`);console.error('Disk:',err);}
  updatePriceCells(row);updateTotalsRow();
};
