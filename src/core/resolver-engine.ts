// ================================================================
// core/resolver-engine.js — 공통 가격 조회 엔진
// ESM: 순수 정규화 헬퍼는 resolver-helpers.js 로 분리됨.
//      서비스별 조회/빌더는 REG['_resolve_*'] / REG['_buildDetail_*'] 로 조회.
// ================================================================
import { REG, SERVICE_CATEGORIES } from './registry.js';
import { apiFetch } from './network.js';
import { normalizeReservationPrice, makeSpItem } from './resolver-helpers.js';
import { setStatus, updatePriceCells, updateTotalsRow } from './ui-hooks.js';
import type { Row, ApiItem } from './types.js';

export function buildSkuAndDetail(r: Row): void {
  const def = SERVICE_CATEGORIES[r.serviceCategory];
  if (!def) return;
  const fnName = `_buildDetail_${r.serviceCategory.replace(/[^a-zA-Z0-9]/g,'_')}`;
  if (typeof REG[fnName] === 'function') { REG[fnName](r); return; }
  const o = r.options;
  const vals = (def.steps || []).filter(s=>!s._hidden).map(s=>o[s.key]).filter(Boolean);
  r.skuName = vals[0] || '';
  r.detail  = vals.join(', ');
}

// ── 행 단위 직렬화 (v119) ──
// 옵션을 빠르게 바꾸면 ui-and-bootstrap 이 tryResolveItem 을 await 없이 여러 번 쏜다.
// 그러면 "가장 늦게 도착한" 응답이 이기므로, 과거 옵션으로 조회한 가격이 최신 값을
// 덮어쓸 수 있었다(옵션은 이미 새 값이라 상세와 가격이 어긋난 채 남는다).
// 행마다 한 번에 하나만 돌리고, 진행 중에 다시 요청이 오면 끝난 뒤 **최신 옵션으로**
// 한 번 더 돌린다. resolver 39개를 건드리지 않고 경합을 없앤다.
const rowInFlight = new WeakMap<Row, Promise<any>>();
const rowRerun = new WeakSet<Row>();

export async function tryResolveItem(row: Row): Promise<any> {
  const running = rowInFlight.get(row);
  if (running) { rowRerun.add(row); return running; }   // 진행 중이면 재실행 예약만

  const p = (async () => {
    let out;
    try {
      do {
        rowRerun.delete(row);
        out = await resolveOnce(row);                   // 매 회차마다 최신 row 를 읽는다
      } while (rowRerun.has(row));
    } finally {
      rowRerun.delete(row);
      rowInFlight.delete(row);
    }
    return out;
  })();

  rowInFlight.set(row, p);
  return p;
}

// 조회를 시도할 수 있는 행인가(서비스·SKU 가 정해졌는가).
// 아직 설정이 덜 된 행은 조회 대상이 아니다 — 일괄 조회·재시도에서 "실패"로 세지 않도록
// 판정을 이 한 곳에 모은다.
export function isRowResolvable(row: Row): boolean {
  if (!row.serviceCategory) return false;
  // Disk 프로비저닝 계층(프리미엄 SSD v2/Ultra)은 skuName 없이도 조회된다
  if (row.serviceCategory === 'Disk') {
    const sub = row.options && row.options.diskSubType;
    if (sub === '프리미엄 SSD v2' || sub === 'Ultra Disk') return true;
    return !!(row.options && row.options.diskInstance) || !!row.skuName;
  }
  return !!row.skuName;
}

async function resolveOnce(row: Row): Promise<any> {
  if (!isRowResolvable(row)) {
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null; return;
  }
  const def = SERVICE_CATEGORIES[row.serviceCategory];
  if (!def) return;
  const cur = (document.getElementById('currencySelect') as HTMLSelectElement).value;
  setStatus('loading', `${row.skuName||row.options.diskSubType||row.serviceCategory} 가격 조회 중...`);
  const fnName = `_resolve_${row.serviceCategory.replace(/[^a-zA-Z0-9]/g,'_')}`;
  if (typeof REG[fnName] === 'function') return await REG[fnName](row, cur);
  return await _genericResolve(row, cur);
}

async function _genericResolve(row: Row, cur: string): Promise<void> {
  const def = SERVICE_CATEGORIES[row.serviceCategory];
  try {
    const bf: Record<string, any> = { serviceName:def.apiServiceName, armRegionName:row.region };
    const cat = row.serviceCategory;
    if      (cat==='Azure Files')         { const m: Record<string,string>={'Premium':'Premium Files','Hot':'General Purpose v2 Files','Cool':'Cool Files','Transaction Optimized':'General Purpose v2 Files'}; const pn=m[row.options.fileTier||'Premium']; if(pn) bf.productName=pn; }
    else if (cat==='Blob Storage')        { const m: Record<string,string>={'Hot':'Hot Block Blob','Cool':'Cool Block Blob','Cold':'Cold Block Blob','Archive':'Archive Block Blob'}; const pn=m[row.options.blobTier||'Hot']; if(pn) bf.productName=pn; }
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
    const mC = (it: ApiItem): boolean => {
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
    const notSpot=(it: ApiItem)=>{ const s=(it.skuName||'').toLowerCase(),m=(it.meterName||'').toLowerCase(); return !s.includes('spot')&&!m.includes('spot')&&!s.includes('low priority')&&!m.includes('low priority')&&(it.type||'').toLowerCase()!=='devtestconsumption'; };
    const pC=cItems.filter(it=>(it.type||'').toLowerCase()==='consumption'&&mC(it)&&notSpot(it));
    pC.sort((a,b)=>{ const ta=Number(a.tierMinimumUnits||0),tb=Number(b.tierMinimumUnits||0); if(ta!==tb) return ta-tb; return Number(a.unitPrice||0)-Number(b.unitPrice||0); });
    const payg=pC[0]||null;
    let sp1: ApiItem|null=null, sp3: ApiItem|null=null;
    const ckSp=(item: ApiItem | null)=>{ if(!item||!Array.isArray(item.savingsPlan)) return; for(const sp of item.savingsPlan){ const t=String(sp.term||'').toLowerCase(); if((t.includes('1 year')||t==='1'||t.startsWith('1 '))&&!sp1) sp1=makeSpItem(item,sp); else if((t.includes('3 year')||t==='3'||t.startsWith('3 '))&&!sp3) sp3=makeSpItem(item,sp); } };
    ckSp(payg);
    if(!sp1||!sp3){ for(const item of cItems){ if(item===payg||(item.type||'').toLowerCase()!=='consumption'||!mC(item)||!notSpot(item)) continue; ckSp(item); if(sp1&&sp3) break; } }
    const ri1C=rItems.filter(it=>(it.type||'').toLowerCase()==='reservation'&&/1\s*year/i.test(String(it.reservationTerm||''))&&(it.skuName||it.armSkuName||'')===row.skuName).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const ri3C=rItems.filter(it=>(it.type||'').toLowerCase()==='reservation'&&/3\s*year/i.test(String(it.reservationTerm||''))&&(it.skuName||it.armSkuName||'')===row.skuName).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    row.paygItem=payg;row.sp1Item=sp1;row.sp3Item=sp3;
    row.ri1Item=ri1C[0]?normalizeReservationPrice(ri1C[0],1):null;
    row.ri3Item=ri3C[0]?normalizeReservationPrice(ri3C[0],3):null;
    if(payg){ const tags=['PAYG'];if(sp1)tags.push('SP1Y');if(sp3)tags.push('SP3Y');if(row.ri1Item)tags.push('RI1Y');if(row.ri3Item)tags.push('RI3Y'); setStatus('ok',`${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${Number(payg.unitPrice).toFixed(2)}/h`); }
    else setStatus('error',`${row.skuName}: 매칭 없음 (${cItems.length}건)`);
  } catch(err: any) {
    row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
    setStatus('error',`API 실패: ${err.message.slice(0,100)}`); console.error('조회실패:',err);
  }
  updatePriceCells(row); updateTotalsRow();
}
