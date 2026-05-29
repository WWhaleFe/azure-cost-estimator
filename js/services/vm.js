// ================================================================
// services/vm.js — Virtual Machine
// 수정 대상: VM 시리즈/인스턴스 목록, OS/유형(SW)/라이선스 옵션, 가격 매칭 로직
// ================================================================

// 카테고리 정의 등록
window._svcDefs['Virtual Machine'] = {
  apiServiceName: 'Virtual Machines',
  steps: [
    { key:'os',      label:'운영 체제', options:['Linux','Windows','Red Hat Enterprise Linux','SUSE'] },
    { key:'swType',  label:'유형',      options:['(OS Only)','SQL Server (Enterprise)','SQL Server (Standard)','SQL Server (Web)','BizTalk Server (Enterprise)','BizTalk Server (Standard)'] },
    { key:'tier',    label:'Tier',      options:['Standard','Spot'] },
    { key:'license', label:'라이선스',  options:['라이선스 포함','Azure Hybrid Benefit'] },
    { key:'series',  label:'인스턴스 시리즈', options:['B-series','D-series v6','D-series v5','D-series v3','Dl-series v6','Ds-series v6','E-series v6','E-series v5','F-series v2','M-series','N-series'] },
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

// 유형(소프트웨어) -> Retail Prices API의 productName ('Virtual Machines Licenses')
var VM_SW_PRODUCT = window.VM_SW_PRODUCT = {
  'SQL Server (Enterprise)':  'SQL Server Enterprise',
  'SQL Server (Standard)':    'SQL Server Standard',
  'SQL Server (Web)':         'SQL Server Web',
  'BizTalk Server (Enterprise)':'BizTalk Server Enterprise',
  'BizTalk Server (Standard)': 'BizTalk Server Standard',
};

// SW 라이선스 시간당 단가 조회 (vCPU 구간 매칭). 못 찾으면 0 반환(가산 안 함).
window['_vmSwLicenseHourly'] = async function(region, productName, vcpu, cur) {
  if (!productName || !(vcpu > 0)) return { hourly:0, band:null };
  let items = [];
  try {
    items = await apiFetch({ serviceName:'Virtual Machines Licenses', armRegionName:region, productName, priceType:'Consumption' }, cur, 200, 3);
  } catch (e) { console.warn('SW 라이선스 조회 실패:', e); return { hourly:0, band:null }; }
  const bands = [];
  for (const it of items) {
    if ((it.type||'').toLowerCase() !== 'consumption') continue;
    if (!(it.unitOfMeasure||'').toLowerCase().includes('hour')) continue;
    const sk = String(it.skuName||'') + ' ' + String(it.meterName||'');
    const mRange = sk.match(/([0-9]+)[ ]*-[ ]*([0-9]+)[ ]*vcpu/i);
    const mOne   = sk.match(/([0-9]+)[ ]*vcpu/i);
    let lo=0, hi=0;
    if (mRange) { lo=Number(mRange[1]); hi=Number(mRange[2]); }
    else if (mOne) { lo=Number(mOne[1]); hi=Number(mOne[1]); }
    else continue;
    const price = Number(it.unitPrice);
    if (!isFinite(price) || price <= 0) continue;
    bands.push({ lo, hi, price, skuName:it.skuName, meterName:it.meterName });
  }
  if (bands.length === 0) return { hourly:0, band:null };
  bands.sort((a,b)=>a.hi-b.hi);
  // vCPU를 포함하는 구간 우선, 없으면 vCPU 이상 중 가장 작은 구간(올림 라이선스)
  const chosen = bands.find(b=>vcpu>=b.lo && vcpu<=b.hi) || bands.find(b=>b.hi>=vcpu) || null;
  if (!chosen) return { hourly:0, band:null };
  return { hourly: chosen.price, band: chosen };
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
  if (o.swType && o.swType!=='(OS Only)') parts.push(o.swType);
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
    const isRHEL=(it)=>/red[ ]*hat/i.test(it.productName||'');
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
    const ri1C=riAll.filter(it=>/1[ ]*year/i.test(String(it.reservationTerm||''))).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const ri3C=riAll.filter(it=>/3[ ]*year/i.test(String(it.reservationTerm||''))).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const nRi=(item,y)=>{ if(!item) return null; const t=Number(item.unitPrice); if(!isFinite(t)||t<=0) return null; return{...item,unitPrice:t/(y*8760),retailPrice:t/(y*8760),unitOfMeasure:'1 Hour (normalized)',_originalUnitPrice:t,_termYears:y}; };
    const ri1=(isPaid&&!isAHB)?addL(nRi(ri1C[0]||null,1),licH):nRi(ri1C[0]||null,1);
    const ri3=(isPaid&&!isAHB)?addL(nRi(ri3C[0]||null,3),licH):nRi(ri3C[0]||null,3);

    // 유형(SW) 라이선스: 컴퓨팅 가격에 시간당 라이선스 가산 (예약/절약 플랜은 컴퓨팅만 할인하므로 동일 가산)
    const swType=row.options.swType||'(OS Only)';
    const swProduct=VM_SW_PRODUCT[swType]||null;
    const instMeta=(VM_INSTANCE_CATALOG[row.options.series]||[]).find(i=>i.name===row.skuName);
    const vcpu=instMeta?Number(instMeta.vCPU):0;
    let swHourly=0, swMatched=false;
    if(swProduct){
      const sw=await window['_vmSwLicenseHourly'](row.region, swProduct, vcpu, cur);
      swHourly=Number(sw.hourly)||0; swMatched=swHourly>0;
    }
    const addSw=(it)=>{ if(!it||swHourly<=0) return it; const b=Number(it.unitPrice)+swHourly; return {...it,unitPrice:b,retailPrice:b,_swProduct:swProduct,_swHourly:swHourly,_computeHourly:Number(it.unitPrice)}; };

    row.paygItem=addSw(payg); row.sp1Item=addSw(sp1); row.sp3Item=addSw(sp3); row.ri1Item=addSw(ri1); row.ri3Item=addSw(ri3);
    if(row.paygItem){
      const tags=['PAYG'];if(row.sp1Item)tags.push('SP1Y');if(row.sp3Item)tags.push('SP3Y');if(row.ri1Item)tags.push('RI1Y');if(row.ri3Item)tags.push('RI3Y');
      let swMsg='';
      if(swProduct) swMsg = swMatched ? ` +SW(${swType}):${swHourly.toFixed(4)}/h` : ` +SW(${swType}):미매칭`;
      setStatus('ok',`${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${Number(row.paygItem.unitPrice).toFixed(4)}/h${swMsg}`);
    }
    else setStatus('error',`${row.skuName}: 매칭 없음 (${cItems.length}건)`);
  } catch(err){ row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null; setStatus('error',`API 실패: ${err.message.slice(0,100)}`); console.error('VM:',err); }
  updatePriceCells(row); updateTotalsRow();
};
