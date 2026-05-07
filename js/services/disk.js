// ================================================================
// services/disk.js — Disk (Managed Disks)
// 수정 대상: 디스크 SKU 목록, 계층별 옵션, 가격 매칭 로직
//
// 계층별 옵션 구조 (MS 가격 계산기 기준):
//   표준 HDD  : 디스크 크기(SKU) → 트랜잭션 → 스냅샷 → Confidential OS Enc
//   표준 SSD  : 중복성 → 디스크 크기(SKU) → 트랜잭션 → 스냅샷 → Confidential OS Enc
//   프리미엄 SSD : 중복성 → 디스크 크기(SKU) → 절약옵션(PAYG/RI1Y) → 스냅샷 → Conf OS Enc → 버스팅
//   프리미엄 SSD v2: 스토리지 GiB(1~65536) → IOPS → 처리량 MB/s  (스토리지 크기별 GiB×시간 과금)
//   Ultra Disk   : 디스크 GiB(4~65536) → IOPS → 처리량 MB/s
// ================================================================

// ----- 표준 HDD : LRS 고정, SKU 목록, 트랜잭션+스냅샷+ConfEnc -----
window._svcDefs['Disk - Standard HDD'] = {
  apiServiceName: 'Storage',
  _diskType: 'hdd',
  steps: [
    { key:'storageType', label:'Storage Type', options:['Standard HDD Managed Disks'], _hidden:true },  // 내부 식별용
    { key:'transactionUnits', label:'Storage 트랜잭션 (10,000단위, 월)', type:'number', min:0, step:1, default:0, tooltip:'10K IO 연산 단위. 트랜잭션 단가 × 단위 수' },
    { key:'snapshotGB', label:'스냅샷 크기 (GB, 월)', type:'number', min:0, step:1, default:0, tooltip:'증분 스냅샷 LRS 저장 GB × 단가/GB' },
    { key:'confEncryptionEnabled', label:'Confidential OS Encryption', options:['비활성 (기본)','활성화'], tooltip:'GiB × 730h × Per GiB 단가' },
  ],
  instanceField: true,
  instanceParentKey: 'storageType',
  instanceLabel: '디스크 크기',
};

// ----- 표준 SSD : 중복성(LRS/ZRS), SKU, 트랜잭션+스냅샷+ConfEnc -----
window._svcDefs['Disk - Standard SSD'] = {
  apiServiceName: 'Storage',
  _diskType: 'ssd',
  steps: [
    { key:'storageType', label:'Storage Type', options:['Standard SSD Managed Disks'], _hidden:true },
    { key:'redundancy',  label:'중복성', options:['LRS','ZRS'] },
    { key:'transactionUnits', label:'Storage 트랜잭션 (10,000단위, 월)', type:'number', min:0, step:1, default:0, tooltip:'10K IO 연산 단위' },
    { key:'snapshotGB', label:'스냅샷 크기 (GB, 월)', type:'number', min:0, step:1, default:0, tooltip:'LRS 저장 GB × 단가/GB' },
    { key:'confEncryptionEnabled', label:'Confidential OS Encryption', options:['비활성 (기본)','활성화'], tooltip:'GiB × 730h × Per GiB 단가' },
  ],
  instanceField: true,
  instanceParentKey: 'storageType',
  instanceLabel: '디스크 크기',
};

// ----- 프리미엄 SSD : 중복성, SKU, RI 1년, 스냅샷+ConfEnc+버스팅 -----
window._svcDefs['Disk - Premium SSD'] = {
  apiServiceName: 'Storage',
  _diskType: 'premium',
  steps: [
    { key:'storageType', label:'Storage Type', options:['Premium SSD Managed Disks'], _hidden:true },
    { key:'redundancy', label:'중복성', options:['LRS','ZRS'] },
    { key:'perfTier', label:'성능 계층 업그레이드', options:['없음 (기본)','P4','P6','P10','P15','P20','P30','P40','P50','P60','P70','P80'], tooltip:'용량 유지하면서 성능만 상위 계층으로 업그레이드' },
    // 절약 옵션: PAYG 기본, RI 1년 선택 시 ri1Item 활성화
    { key:'savingsOption', label:'절약 옵션', options:['용량제 (기본)','1년 예약'], tooltip:'용량제: PAYG | 1년 예약: RI 1Y 적용' },
    { key:'snapshotGB', label:'스냅샷 크기 (GB, 월)', type:'number', min:0, step:1, default:0, tooltip:'LRS 저장 GB × 단가/GB' },
    { key:'confEncryptionEnabled', label:'Confidential OS Encryption', options:['비활성 (기본)','활성화'], tooltip:'GiB × 730h × Per GiB 단가' },
    { key:'burstingEnabled', label:'디스크 버스팅', options:['비활성 (기본)','활성화 (P30 이상)'], tooltip:'P30 이상에서 사용 가능 | P20 이하는 기반 사용' },
    { key:'burstMaxIOPS',         label:'예상 최대 IOPS',       type:'number', min:0, step:100, default:0 },
    { key:'burstMaxThroughputMBs',label:'예상 최대 처리량 (MB/s)', type:'number', min:0, step:10,  default:0 },
    { key:'burstMinsPerDay',      label:'근무일당 버스트 시간 (분)', type:'number', min:0, step:1,   default:30 },
    { key:'burstWorkDaysPerMonth',label:'월간 근무일 수',     type:'number', min:0, step:1,   default:20 },
  ],
  instanceField: true,
  instanceParentKey: 'storageType',
  instanceLabel: '디스크 크기',
};

// ----- 프리미엄 SSD v2 : GiB 직접입력, IOPS, 처리량 -----
window._svcDefs['Disk - Premium SSD v2'] = {
  apiServiceName: 'Storage',
  _diskType: 'premiumv2',
  steps: [
    { key:'storageType', label:'Storage Type', options:['Premium SSD v2 Managed Disks'], _hidden:true },
    // 스토리지 비용: GiB × 시간 × 단가
    { key:'diskSizeGiB', label:'디스크 크기 (GiB)', type:'number', min:1, step:1, default:1, tooltip:'1 ~ 65,536 GiB. 스토리지 비용: GiB × 730h × 단가/GiB/시간' },
    // IOPS: 기본 3,000 UB early 포함, 초과분만 유료
    { key:'provisionedIOPS', label:'프로비저닝된 IOPS', type:'number', min:3000, step:100, default:3000, tooltip:'3,000 IOPS까지 무료. 초과분 × 단가/IOPS/시간' },
    // 처리량: 기본 125 MB/s 포함, 초과분만 유료
    { key:'provisionedMBps', label:'프로비저닝된 처리량 (MB/s)', type:'number', min:125, step:1, default:125, tooltip:'125 MB/s까지 무료. 초과분 × 단가/MB/s/시간' },
  ],
  instanceField: false,
};

// ----- Ultra Disk : GiB 직접입력, IOPS, 처리량 -----
window._svcDefs['Disk - Ultra Disk'] = {
  apiServiceName: 'Storage',
  _diskType: 'ultra',
  steps: [
    { key:'storageType', label:'Storage Type', options:['Ultra Disk'], _hidden:true },
    { key:'diskSizeGiB', label:'디스크 크기 (GiB)', type:'number', min:4, step:1, default:4, tooltip:'4 ~ 65,536 GiB. 스토리지 비용: GiB × 730h × 단가/GiB/시간' },
    { key:'provisionedIOPS', label:'프로비저닝된 IOPS', type:'number', min:100, step:100, default:100, tooltip:'IOPS 수 × 730h × 단가/IOPS/시간' },
    { key:'provisionedMBps', label:'프로비저닝된 처리량 (MB/s)', type:'number', min:1, step:1, default:1, tooltip:'MB/s × 730h × 단가/MB/s/시간' },
  ],
  instanceField: false,
};

// ================================================================
// DISK_CATALOG — SKU별 디스크 목록
// ================================================================
const DISK_CATALOG = {
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
// _buildDetail — 상세 사양 텍스트 생성
// ================================================================
function _buildDiskDetail(r) {
  const o = r.options;
  const cat = r.serviceCategory;
  const defObj = window._svcDefs[cat];
  const diskType = defObj ? defObj._diskType : '';

  if (diskType === 'premiumv2' || diskType === 'ultra') {
    // GiB 직접입력 계층
    r.skuName = diskType === 'premiumv2' ? 'Premium SSD v2' : 'Ultra Disk';
    const parts = [];
    if (o.diskSizeGiB) parts.push(`${o.diskSizeGiB}GiB`);
    if (o.provisionedIOPS) parts.push(`IOPS:${Number(o.provisionedIOPS).toLocaleString()}`);
    if (o.provisionedMBps) parts.push(`BW:${o.provisionedMBps}MB/s`);
    r.detail = parts.join(', ');
    return;
  }

  // SKU 기반 계층 (HDD/SSD/Premium)
  r.skuName = o.instance || '';
  const storageType = (diskType==='hdd') ? 'Standard HDD Managed Disks'
                    : (diskType==='ssd') ? 'Standard SSD Managed Disks'
                    : 'Premium SSD Managed Disks';
  const disk = (DISK_CATALOG[storageType]||[]).find(d=>d.name===o.instance);
  const parts = [];
  parts.push(storageType.replace(' Managed Disks',''));
  if (disk) parts.push(`${disk.size}GB`);
  if (o.redundancy) parts.push(o.redundancy);
  if (diskType === 'premium') {
    if (o.perfTier && o.perfTier !== '없음 (기본)') parts.push(`업그:${o.perfTier}`);
    if (o.savingsOption && o.savingsOption !== '용량제 (기본)') parts.push('RI-1Y');
    if (Number(o.snapshotGB)>0) parts.push(`스냅샷 ${o.snapshotGB}GB`);
    if (o.confEncryptionEnabled==='활성화') parts.push('Conf-Enc');
    if (o.burstingEnabled==='활성화 (P30 이상)') parts.push('버스팅');
  } else {
    const tx = Number(o.transactionUnits||0);
    if (tx>0) parts.push(`Tx ${tx.toLocaleString()}×10K`);
    if (Number(o.snapshotGB)>0) parts.push(`스냅샷 ${o.snapshotGB}GB`);
    if (o.confEncryptionEnabled==='활성화') parts.push('Conf-Enc');
  }
  r.detail = parts.join(', ');
}

['Disk - Standard HDD','Disk - Standard SSD','Disk - Premium SSD','Disk - Premium SSD v2','Disk - Ultra Disk'].forEach(cat => {
  window[`_buildDetail_${cat.replace(/[^a-zA-Z0-9]/g,'_')}`] = _buildDiskDetail;
});

// ================================================================
// _resolve — 가격 조회
// ================================================================

// --- 공통 헬퍼 ---
function _getDiskStorageType(diskType) {
  if (diskType==='hdd')       return 'Standard HDD Managed Disks';
  if (diskType==='ssd')       return 'Standard SSD Managed Disks';
  if (diskType==='premium')   return 'Premium SSD Managed Disks';
  if (diskType==='premiumv2') return 'Premium SSD v2 Managed Disks';
  if (diskType==='ultra')     return 'Ultra Disk';
  return '';
}

// --- 표준 HDD / 표준 SSD 공통 resolve ---
async function _resolveStandardDisk(row, cur, diskType) {
  const o = row.options||{};
  const storageType = _getDiskStorageType(diskType);
  const redundancy  = (diskType==='hdd') ? 'LRS' : (o.redundancy||'LRS');  // HDD는 LRS 고정
  const skuFull     = `${row.skuName} ${redundancy}`;
  const txUnits     = Number(o.transactionUnits||0);
  const snapshotGB  = Number(o.snapshotGB||0);
  const confEncOn   = o.confEncryptionEnabled==='활성화';
  const diskEntry   = (DISK_CATALOG[storageType]||[]).find(d=>d.name===row.skuName);
  const diskSizeGiB = diskEntry ? diskEntry.size : 0;

  try {
    const needsExtras = snapshotGB>0 || confEncOn;
    const needsTx     = txUnits>0;
    const baseFilter  = { serviceName:'Storage', armRegionName:row.region, productName:storageType };

    const [diskItems, allItems, resItems] = await Promise.all([
      apiFetch({...baseFilter, skuName:skuFull, priceType:'Consumption'}, cur, 100, 2),
      (needsTx||needsExtras) ? apiFetch({...baseFilter, priceType:'Consumption'}, cur, 400, 3) : Promise.resolve([]),
      Promise.resolve([]),  // 표준 계층은 RI 없음
    ]);

    // 디스크 단가
    const isPlain = it=>{ const m=(it.meterName||'').toLowerCase(); return !m.includes('burst')&&!m.includes('enablement')&&!m.includes('snapshot')&&!m.includes('one-time')&&!m.includes('encrypt')&&!m.includes('shared')&&!m.includes('confidential'); };
    const exp = `${skuFull} Disk`.toLowerCase();
    const diskCands = diskItems.filter(it=>{
      if((it.type||'').toLowerCase()!=='consumption') return false;
      if(!(it.unitOfMeasure||'').toLowerCase().includes('month')) return false;
      if(!isPlain(it)) return false;
      const m=(it.meterName||'').toLowerCase();
      return m===exp||m.startsWith(skuFull.toLowerCase());
    }).sort((a,b)=>{ const ae=(a.meterName||'').toLowerCase()===exp?0:1,be=(b.meterName||'').toLowerCase()===exp?0:1; if(ae!==be) return ae-be; return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
    const disk = diskCands[0]||null;

    // 트랜잭션
    let txItem=null;
    if(needsTx){
      const aT=allItems.filter(it=>{ const u=(it.unitOfMeasure||'').toLowerCase(); return u.includes('10k')||u.includes('10,000')||u.includes('10000'); });
      let tC=aT.filter(it=>{ const m=(it.meterName||'').toLowerCase(),s=(it.skuName||'').toLowerCase(),rl=redundancy.toLowerCase(); return (m.includes('operation')||m.includes('transaction'))&&(m.includes(rl)||s.includes(rl)); });
      if(!tC.length) tC=aT.filter(it=>{ const m=(it.meterName||'').toLowerCase(),s=(it.skuName||'').toLowerCase(); return m.includes(redundancy.toLowerCase())||s.includes(redundancy.toLowerCase()); });
      if(!tC.length) tC=aT;
      tC.sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
      txItem=tC[0]||null;
    }

    // 스냅샷
    let snapPPG=0;
    if(snapshotGB>0){
      const sC=allItems.filter(it=>{ const m=(it.meterName||'').toLowerCase(); return m.includes('snapshot')&&(m.includes('lrs')||m.includes('locally')); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
      if(sC[0]) snapPPG=Number(sC[0].unitPrice);
    }

    // Confidential OS Encryption
    let confEncM=0;
    if(confEncOn&&diskSizeGiB>0){
      const eC=allItems.filter(it=>{ const m=(it.meterName||'').toLowerCase(); return m.includes('confidential')&&m.includes('encrypt'); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
      if(eC[0]) confEncM=diskSizeGiB*730*Number(eC[0].unitPrice);
    }

    let monthly=0;
    if(disk) monthly+=Number(disk.unitPrice);
    if(txItem&&txUnits>0) monthly+=Number(txItem.unitPrice)*txUnits;
    if(snapshotGB>0) monthly+=snapPPG*snapshotGB;
    if(confEncOn) monthly+=confEncM;

    const usH=Number(row.usage)||730;
    const hourlyEq=usH>0?monthly/usH:0;
    const payg=disk?{...disk,unitPrice:hourlyEq,retailPrice:hourlyEq,unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',_monthlyTotal:monthly}:null;

    row.paygItem=payg;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    if(payg) setStatus('ok',`${row.skuName} ${redundancy} 완료 · ${monthly.toFixed(2)}/월`);
    else setStatus('error',`${row.skuName}: 매칭 실패 - F12 확인`);
  } catch(err){
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error',`Disk 실패: ${err.message.slice(0,80)}`); console.error('Disk:',err);
  }
  updatePriceCells(row); updateTotalsRow();
}

// --- 프리미엄 SSD resolve ---
async function _resolvePremiumSSD(row, cur) {
  const o = row.options||{};
  const storageType = 'Premium SSD Managed Disks';
  const redundancy  = o.redundancy||'LRS';
  const skuFull     = `${row.skuName} ${redundancy}`;
  const perfTier    = (o.perfTier && o.perfTier!=='없음 (기본)') ? o.perfTier : null;
  const effectiveSku= perfTier ? `${perfTier} ${redundancy}` : skuFull;
  const snapshotGB  = Number(o.snapshotGB||0);
  const confEncOn   = o.confEncryptionEnabled==='활성화';
  const burstOn     = o.burstingEnabled==='활성화 (P30 이상)';
  const wantRI      = o.savingsOption==='1년 예약';

  // 버스트 트랜잭션 양 계산
  const bIOPS  = burstOn ? Number(o.burstMaxIOPS||0) : 0;
  const bMins  = burstOn ? Number(o.burstMinsPerDay||30) : 0;
  const bDays  = burstOn ? Number(o.burstWorkDaysPerMonth||20) : 0;
  const bTxUnits = bIOPS>0 ? Math.ceil(bIOPS*60*bMins*bDays/10000) : 0;

  const diskEntry   = (DISK_CATALOG[storageType]||[]).find(d=>d.name===row.skuName);
  const diskSizeGiB = diskEntry ? diskEntry.size : 0;

  try {
    const needsExtras = burstOn||snapshotGB>0||confEncOn;
    const baseFilter  = { serviceName:'Storage', armRegionName:row.region, productName:storageType };

    const [diskItems, perfItems, allItems, resItems] = await Promise.all([
      apiFetch({...baseFilter, skuName:skuFull, priceType:'Consumption'}, cur, 100, 2),
      perfTier ? apiFetch({...baseFilter, skuName:effectiveSku, priceType:'Consumption'}, cur, 100, 2) : Promise.resolve([]),
      needsExtras ? apiFetch({...baseFilter, priceType:'Consumption'}, cur, 400, 3) : Promise.resolve([]),
      apiFetch({...baseFilter, priceType:'Reservation'}, cur, 200, 2).catch(()=>[]),
    ]);

    // 디스크 단가 매칭
    const isPlain=it=>{ const m=(it.meterName||'').toLowerCase(); return !m.includes('mount')&&!m.includes('burst')&&!m.includes('enablement')&&!m.includes('snapshot')&&!m.includes('one-time')&&!m.includes('encrypt')&&!m.includes('shared')&&!m.includes('confidential'); };
    const findDisk=(items,sku)=>{ const exp=`${sku} Disk`.toLowerCase(); const c=items.filter(it=>{ if((it.type||'').toLowerCase()!=='consumption') return false; if(!(it.unitOfMeasure||'').toLowerCase().includes('month')) return false; if(!isPlain(it)) return false; const m=(it.meterName||'').toLowerCase(); return m===exp||m.startsWith(sku.toLowerCase()); }); c.sort((a,b)=>{ const ae=(a.meterName||'').toLowerCase()===exp?0:1,be=(b.meterName||'').toLowerCase()===exp?0:1; if(ae!==be) return ae-be; return Number(a.unitPrice||0)-Number(b.unitPrice||0); }); return c[0]||null; };
    const disk = perfTier ? (findDisk(perfItems,effectiveSku)||findDisk(diskItems,skuFull)) : findDisk(diskItems,skuFull);

    // 스냅샷
    let snapPPG=0;
    if(snapshotGB>0){
      const sC=allItems.filter(it=>{ const m=(it.meterName||'').toLowerCase(); return m.includes('snapshot')&&(m.includes('lrs')||m.includes('locally')); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
      if(sC[0]) snapPPG=Number(sC[0].unitPrice);
    }

    // Confidential OS Encryption
    let confEncM=0;
    if(confEncOn&&diskSizeGiB>0&&allItems.length>0){
      const eC=allItems.filter(it=>{ const m=(it.meterName||'').toLowerCase(); return m.includes('confidential')&&m.includes('encrypt'); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
      if(eC[0]) confEncM=diskSizeGiB*730*Number(eC[0].unitPrice);
    }

    // 버스팅
    let bEnaM=0, bTxPPU=0;
    if(burstOn&&allItems.length>0){
      const eC=allItems.filter(it=>{ const m=(it.meterName||'').toLowerCase(); return m.includes('burst')&&m.includes('enablement'); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
      if(eC[0]) bEnaM=Number(eC[0].unitPrice);
      if(bTxUnits>0){
        const bC=allItems.filter(it=>{ const m=(it.meterName||'').toLowerCase(),u=(it.unitOfMeasure||'').toLowerCase(); return m.includes('burst')&&(u.includes('10k')||u.includes('10,000')||u.includes('10000')); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
        if(bC[0]) bTxPPU=Number(bC[0].unitPrice);
      }
    }

    // 월 비용 합산
    const extras = (snapshotGB>0?snapPPG*snapshotGB:0) + confEncM + (burstOn?bEnaM+(bTxPPU*bTxUnits):0);
    let monthly = (disk?Number(disk.unitPrice):0) + extras;
    const usH=Number(row.usage)||730;
    const hourlyEq=usH>0?monthly/usH:0;
    const payg=disk?{...disk,unitPrice:hourlyEq,retailPrice:hourlyEq,unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',_monthlyTotal:monthly}:null;

    // RI 1년
    let ri1Item=null;
    if(wantRI){
      const ri1C=resItems.filter(it=>{ if((it.type||'').toLowerCase()!=='reservation') return false; if(!/1\s*year/i.test(String(it.reservationTerm||''))) return false; const s=(it.skuName||'').toLowerCase(),ms=perfTier?effectiveSku.toLowerCase():skuFull.toLowerCase(); return s.includes(ms.split(' ')[0].toLowerCase())&&s.includes(redundancy.toLowerCase()); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
      if(ri1C[0]){
        const tot=Number(ri1C[0].unitPrice), ri1M=tot/12;
        const ri1MT=ri1M+extras;
        const ri1H=usH>0?ri1MT/usH:0;
        ri1Item={...ri1C[0],unitPrice:ri1H,retailPrice:ri1H,unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',_monthlyTotal:ri1MT,_originalUnitPrice:tot,_termYears:1};
      }
    }

    row.paygItem=payg; row.sp1Item=null; row.sp3Item=null;
    row.ri1Item=wantRI?ri1Item:null; row.ri3Item=null;

    if(payg) setStatus('ok',`${row.skuName} ${redundancy} 완료${perfTier?` [업그→${perfTier}]`:''}${wantRI?' [RI-1Y]':''} · ${monthly.toFixed(2)}/월`);
    else setStatus('error',`${row.skuName}: 매칭 실패 - F12 확인`);
  } catch(err){
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error',`Premium SSD 실패: ${err.message.slice(0,80)}`); console.error('PremiumSSD:',err);
  }
  updatePriceCells(row); updateTotalsRow();
}

// --- 프리미엄 SSD v2 / Ultra Disk resolve (공통 구조: GiB×시간 + IOPS + 처리량) ---
async function _resolveProvisionedDisk(row, cur, diskType) {
  const o = row.options||{};
  const storageType  = _getDiskStorageType(diskType);
  const diskSizeGiB  = Number(o.diskSizeGiB || (diskType==='ultra'?4:1));
  const provIOPS     = Number(o.provisionedIOPS  || (diskType==='ultra'?100:3000));
  const provMBps     = Number(o.provisionedMBps  || (diskType==='ultra'?1:125));
  // 무료 기본정 (v2: IOPS 3000 / BW 125, Ultra: 없음)
  const freeIOPS     = diskType==='premiumv2' ? 3000  : 0;
  const freeMBps     = diskType==='premiumv2' ? 125   : 0;
  const chargeIOPS   = Math.max(0, provIOPS  - freeIOPS);
  const chargeMBps   = Math.max(0, provMBps  - freeMBps);

  try {
    const items = await apiFetch({serviceName:'Storage', armRegionName:row.region, productName:storageType, priceType:'Consumption'}, cur, 300, 3);
    const cons = items.filter(it=>(it.type||'').toLowerCase()==='consumption');

    // 스토리지 비용: GiB/시간당 단가 (LRS)
    const stoC=cons.filter(it=>{ const m=(it.meterName||'').toLowerCase(),u=(it.unitOfMeasure||'').toLowerCase(); return u.includes('gib')&&u.includes('hour')&&!m.includes('iops')&&!m.includes('throughput')&&!m.includes('burst'); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const stoPPG=stoC[0]?Number(stoC[0].unitPrice):0;

    // IOPS 단가
    const ioC=cons.filter(it=>{ const m=(it.meterName||'').toLowerCase(),u=(it.unitOfMeasure||'').toLowerCase(); return m.includes('iops')&&u.includes('hour'); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const ioPPU=ioC[0]?Number(ioC[0].unitPrice):0;

    // 처리량 단가
    const bwC=cons.filter(it=>{ const m=(it.meterName||'').toLowerCase(),u=(it.unitOfMeasure||'').toLowerCase(); return (m.includes('throughput')||m.includes('bandwidth')||m.includes('mb/s'))&&u.includes('hour'); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const bwPPU=bwC[0]?Number(bwC[0].unitPrice):0;

    // 월 비용 = 스토리지 + IOPS 추가분 + 처리량 추가분
    const stoMonthly = diskSizeGiB * 730 * stoPPG;
    const ioMonthly  = chargeIOPS  * 730 * ioPPU;
    const bwMonthly  = chargeMBps  * 730 * bwPPU;
    const monthly    = stoMonthly + ioMonthly + bwMonthly;
    const usH = Number(row.usage)||730;
    const hourlyEq=usH>0?monthly/usH:0;

    const baseItem = stoC[0]||cons[0]||null;
    const payg = baseItem?{...baseItem,unitPrice:hourlyEq,retailPrice:hourlyEq,unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',_monthlyTotal:monthly,_stoMonthly:stoMonthly,_ioMonthly:ioMonthly,_bwMonthly:bwMonthly}:null;

    console.group(`[${storageType}] ${diskSizeGiB}GiB IOPS=${provIOPS} BW=${provMBps}MB/s`);
    console.log(`스토리지: ${diskSizeGiB}GiB × 730h × ${stoPPG} = ${stoMonthly.toFixed(4)}/월`);
    console.log(`IOPS 추가: ${chargeIOPS} × 730h × ${ioPPU} = ${ioMonthly.toFixed(4)}/월`);
    console.log(`BW 추가: ${chargeMBps} × 730h × ${bwPPU} = ${bwMonthly.toFixed(4)}/월`);
    console.log(`합계: ${monthly.toFixed(4)}/월`);
    console.groupEnd();

    row.paygItem=payg;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    if(payg) setStatus('ok',`${storageType} ${diskSizeGiB}GiB 완료 · ${monthly.toFixed(2)}/월`);
    else setStatus('error',`${storageType}: 매칭 실패 - F12 확인`);
  } catch(err){
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error',`${storageType} 실패: ${err.message.slice(0,80)}`); console.error(storageType,err);
  }
  updatePriceCells(row); updateTotalsRow();
}

// --- resolve 라우터 등록 ---
window['_resolve_Disk___Standard_HDD']      = (row,cur)=>_resolveStandardDisk(row,cur,'hdd');
window['_resolve_Disk___Standard_SSD']      = (row,cur)=>_resolveStandardDisk(row,cur,'ssd');
window['_resolve_Disk___Premium_SSD']       = (row,cur)=>_resolvePremiumSSD(row,cur);
window['_resolve_Disk___Premium_SSD_v2']    = (row,cur)=>_resolveProvisionedDisk(row,cur,'premiumv2');
window['_resolve_Disk___Ultra_Disk']        = (row,cur)=>_resolveProvisionedDisk(row,cur,'ultra');

// ui-and-bootstrap.js의 renderConfigPanel이 instanceField + DISK_CATALOG를 참조하므로
// DISK_CATALOG을 window에도 노옶
// (이미 같은 파일 에서 const로 선언되어 있으므로 접근 가능)
