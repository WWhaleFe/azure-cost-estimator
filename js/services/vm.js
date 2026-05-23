// ================================================================
// services/vm.js — Virtual Machine
// 수정 대상: VM 시리즈/인스턴스 목록, OS/라이선스 옵션, 가격 매칭 로직
// ================================================================

// 카테고리 정의 등록
window._svcDefs['Virtual Machine'] = {
  apiServiceName: 'Virtual Machines',
  steps: [
    { key:'os',      label:'운영체제', options:['Linux','Windows','Red Hat Enterprise Linux','SUSE'] },
    { key:'tier',    label:'Tier',     options:['Standard','Spot'] },
    { key:'license', label:'라이선스', options:['라이선스 포함','Azure Hybrid Benefit'] },
    { key:'series',  label:'시리즈',   options:['B-series','D-series v6','D-series v5','D-series v3','Dl-series v6','Ds-series v6','E-series v6','E-series v5','F-series v2','M-series','N-series'] },
  ],
  instanceField: true,
  instanceParentKey: 'series',
};

// 전역 노출 (ui-and-bootstrap.js 에서 접근)
var VM_INSTANCE_CATALOG = window.VM_INSTANCE_CATALOG = {
  'B-series':    [{name:'B1s',vCPU:1,ram:1},{name:'B1ms',vCPU:1,ram:2},{name:'B2s',vCPU:2,ram:4},{name:'B2ms',vCPU:2,ram:8},{name:'B4ms',vCPU:4,ram:16},{name:'B8ms',vCPU:8,ram:32},{name:'B12ms',vCPU:12,ram:48},{name:'B16ms',vCPU:16,ram:64},{name:'B20ms',vCPU:20,ram:80}],
  'D-series v6': [{name:'D2s_v6',vCPU:2,ram:8},{name:'D4s_v6',vCPU:4,ram:16},{name:'D8s_v6',vCPU:8,ram:32},{name:'D16s_v6',vCPU:16,ram:64},{name:'D32s_v6',vCPU:32,ram:128},{name:'D48s_v6',vCPU:48,ram:192},{name:'D64s_v6',vCPU:64,ram:256},{name:'D96s_v6',vCPU:96,ram:384}],
  'D-series v5': [{name:'D2s_v5',vCPU:2,ram:8},{name:'D4s_v5',vCPU:4,ram:16},{name:'D8s_v5',vCPU:8,ram:32},{name:'D16s_v5',vCPU:16,ram:64},{name:'D32s_v5',vCPU:32,ram:128},{name:'D64s_v5',vCPU:64,ram:256}],
  'D-series v3': [{name:'D2s_v3',vCPU:2,ram:8},{name:'D4s_v3',vCPU:4,ram:16},{name:'D8s_v3',vCPU:8,ram:32},{name:'D16s_v3',vCPU:16,ram:64},{name:'D32s_v3',vCPU:32,ram:128},{name:'D64s_v3',vCPU:64,ram:256}],
  'Dl-series v6':[{name:'D2ls_v6',vCPU:2,ram:4},{name:'D4ls_v6',vCPU:4,ram:8},{name:'D8ls_v6',vCPU:8,ram:16},{name:'D16ls_v6',vCPU:16,ram:32},{name:'D32ls_v6',vCPU:32,ram:64},{name:'D64ls_v6',vCPU:64,ram:128}],
  'Ds-series v6':[{name:'D2ds_v6',vCPU:2,ram:8},{name:'D4ds_v6',vCPU:4,ram:16},{name:'D8ds_v6',vCPU:8,ram:32},{name:'D16ds_v6',vCPU:16,ram:64},{name:'D32ds_v6',vCPU:32,ram:128},{name:'D64ds_v6',vCPU:64,ram:256}],
  'E-series v6': [{name:'E2s_v6',vCPU:2,ram:16},{name:'E4s_v6',vCPU:4,ram:32},{name:'E8s_v6',vCPU:8,ram:64},{name:'E16s_v6',vCPU:16,ram:128},{name:'E32s_v6',vCPU:32,ram:256},{name:'E64s_v6',vCPU:64,ram:512}],
  'E-series v5': [{name:'E2s_v5',vCPU:2,ram:16},{name:'E4s_v5',vCPU:4,ram:32},{name:'E8s_v5',vCPU:8,ram:64},{name:'E16s_v5',vCPU:16,ram:128},{name:'E32s_v5',vCPU:32,ram:256},{name:'E64s_v5',vCPU:64,ram:432}],
  'F-series v2': [{name:'F2s_v2',vCPU:2,ram:4},{name:'F4s_v2',vCPU:4,ram:8},{name:'F8s_v2',vCPU:8,ram:16},{name:'F16s_v2',vCPU:16,ram:32},{name:'F32s_v2',vCPU:32,ram:64},{name:'F64s_v2',vCPU:64,ram:128}],
  'M-series':    [{name:'M8ms',vCPU:8,ram:218.75},{name:'M16ms',vCPU:16,ram:437.5},{name:'M32ms',vCPU:32,ram:875},{name:'M64ms',vCPU:64,ram:1750}],
  'N-series':    [{name:'NC4as_T4_v3',vCPU:4,ram:28},{name:'NC8as_T4_v3',vCPU:8,ram:56},{name:'NC16as_T4_v3',vCPU:16,ram:110},{name:'NC64as_T4_v3',vCPU:64,ram:440}],
};

// detail 빌더
window['_buildDetail_Virtual_Machine'] = function(r) {
  const o = r.options;
  r.skuName = o.instance || '';
  const inst = (VM_INSTANCE_CATALOG[o.series]||[]).find(i=>i.name===o.instance);
  const parts = [];
  if (o.os) parts.push(o.os);
  if (inst) parts.push(`CPU:${inst.vCPU}core RAM:${inst.ram}GB`);
  if (o.tier && o.tier!=='Standard') parts.push(o.tier);
  if (o.os && o.os!=='Linux' && o.license) parts.push(o.license);
  r.detail = parts.join(', ');
};

// 가격 조회
window['_resolve_Virtual_Machine'] = async function(row, cur) {
  const armSku = `Standard_${row.skuName}`;
  const bf = { serviceName:'Virtual Machines', armRegionName:row.region, armSkuName:armSku };
  try {
    const [cItems, rItems] = await Promise.all([
      apiFetch({...bf, priceType:'Consumption'}, cur, 200, 3),
      apiFetch({...bf, priceType:'Reservation'}, cur, 200, 3).catch(()=>[]),
    ]);
    const isWin =(it)=>/windows/i.test(it.productName||'');
    const isRHEL=(it)=>/red\s*hat/i.test(it.productName||'');
    const isSUSE=(it)=>/suse/i.test(it.productName||'');
    const isLinux=(it)=>!isWin(it)&&!isRHEL(it)&&!isSUSE(it);
    const isSpot=(it)=>{ const s=(it.skuName||'').toLowerCase(),m=(it.meterName||'').toLowerCase(),p=(it.productName||'').toLowerCase(); return s.includes('spot')||m.includes('spot')||s.includes('low priority')||m.includes('low priority')||p.includes('low priority'); };
    const isDev =(it)=>(it.type||'').toLowerCase()==='devtestconsumption';
    const skuM =(it)=>{ const t1=row.skuName.toLowerCase(),t2=t1.replace(/_/g,' '); const s=(it.skuName||'').toLowerCase(),m=(it.meterName||'').toLowerCase(); return s===t1||s===t2||m===t1||m===t2; };
    const osC=row.options.os||'Linux', tierC=row.options.tier||'Standard';
    const licC=row.options.license||'라이선스 포함', isAHB=licC==='Azure Hybrid Benefit', isPaid=osC!=='Linux';
    const base=(it)=>{ if((it.type||'').toLowerCase()!=='consumption') return false; if(it.armSkuName!==armSku||!skuM(it)||isDev(it)) return false; if(tierC==='Spot'?!isSpot(it):isSpot(it)) return false; if(!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false; if(Number(it.tierMinimumUnits||0)!==0) return false; return true; };
    const low=(arr)=>{ arr.sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0)); return arr[0]||null; };
    const lP=low(cItems.filter(it=>base(it)&&isLinux(it)));
    const wP=low(cItems.filter(it=>base(it)&&isWin(it)));
    const rP=low(cItems.filter(it=>base(it)&&isRHEL(it)));
    const sP=low(cItems.filter(it=>base(it)&&isSUSE(it)));
    let osP=osC==='Linux'?lP:osC==='Windows'?wP:osC.includes('Red Hat')?rP:sP;
    let licH=0;
    if(isPaid&&osP&&lP){ const d=Number(osP.unitPrice)-Number(lP.unitPrice); licH=d>0?d:0; }
    let payg=!isPaid?lP:isAHB?(lP?{...lP,_licenseMode:'AHB'}:null):(osP?{...osP,_licenseMode:'License-included'}:null);
    let s1=null,s3=null;
    const exSp=(item)=>{ if(!item||!Array.isArray(item.savingsPlan)) return; for(const sp of item.savingsPlan){ const t=String(sp.term||'').toLowerCase(); if(!s1&&(t==='1 year'||t.startsWith('1 year')||t==='1'||t.startsWith('1 '))) s1=makeSpItem(item,sp); else if(!s3&&(t==='3 year'||t==='3 years'||t.startsWith('3 year')||t==='3'||t.startsWith('3 '))) s3=makeSpItem(item,sp); } };
    exSp(lP); if(!s1||!s3) exSp(osP);
    if(!s1||!s3){ for(const it of cItems){ if(!base(it)||it===lP||it===osP) continue; exSp(it); if(s1&&s3) break; } }
    const addL=(bi,lic)=>{ if(!bi) return null; const bh=Number(bi.unitPrice),t=bh+(lic>0?lic:0); return{...bi,unitPrice:t,retailPrice:t,_baseHourly:bh,_licenseHourly:lic,_licenseMode:isAHB?'AHB':'License-included'}; };
    const sp1=(isPaid&&!isAHB)?addL(s1,licH):s1;
    const sp3=(isPaid&&!isAHB)?addL(s3,licH):s3;
    const riAll=rItems.filter(it=>{ if((it.type||'').toLowerCase()!=='reservation') return false; if(it.armSkuName!==armSku||Number(it.tierMinimumUnits||0)!==0||isSpot(it)||!skuM(it)) return false; return true; });
    const ri1C=riAll.filter(it=>/1\s*year/i.test(String(it.reservationTerm||''))).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const ri3C=riAll.filter(it=>/3\s*year/i.test(String(it.reservationTerm||''))).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const nRi=(item,y)=>{ if(!item) return null; const t=Number(item.unitPrice); if(!isFinite(t)||t<=0) return null; return{...item,unitPrice:t/(y*8760),retailPrice:t/(y*8760),unitOfMeasure:'1 Hour (normalized)',_originalUnitPrice:t,_termYears:y}; };
    const ri1=(isPaid&&!isAHB)?addL(nRi(ri1C[0]||null,1),licH):nRi(ri1C[0]||null,1);
    const ri3=(isPaid&&!isAHB)?addL(nRi(ri3C[0]||null,3),licH):nRi(ri3C[0]||null,3);
    row.paygItem=payg; row.sp1Item=sp1; row.sp3Item=sp3; row.ri1Item=ri1; row.ri3Item=ri3;
    if(payg){ const tags=['PAYG'];if(sp1)tags.push('SP1Y');if(sp3)tags.push('SP3Y');if(ri1)tags.push('RI1Y');if(ri3)tags.push('RI3Y'); setStatus('ok',`${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${Number(payg.unitPrice).toFixed(4)}/h`); }
    else setStatus('error',`${row.skuName}: 매칭 없음 (${cItems.length}건)`);
  } catch(err){ row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null; setStatus('error',`API 실패: ${err.message.slice(0,100)}`); console.error('VM:',err); }
  updatePriceCells(row); updateTotalsRow();
};
