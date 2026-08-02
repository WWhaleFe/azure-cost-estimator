import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
// ================================================================
// services/vpn-gateway.js — VPN Gateway
// 수정 대상: SKU 목록, S2S/P2S/VNET 매칭 로직, Zone 매핑
// ================================================================

REG._svcDefs['VPN Gateway'] = {
  apiServiceName: 'VPN Gateway',
  steps: [
    { key:'sku',                 label:'SKU',                          options:['Basic','VpnGw1','VpnGw2','VpnGw3','VpnGw4','VpnGw5','VpnGw1AZ','VpnGw2AZ','VpnGw3AZ','VpnGw4AZ','VpnGw5AZ'] },
    { key:'gatewayHours',        label:'게이트웨이 시간 (월, Hours)',   type:'number', min:0, step:1, default:730 },
    { key:'extraS2sTunnels',     label:'S2S 추가 터널 수',              type:'number', min:0, step:1, default:0 },
    { key:'extraP2sConnections', label:'P2S 추가 연결 수',              type:'number', min:0, step:1, default:0 },
    { key:'vnetTransferType',    label:'VNET 데이터 전송 유형',         options:['VNET 간','VPN'] },
    { key:'vnetGB',              label:'VNET 간 데이터 전송 (월, GB)',  type:'number', min:0, step:1, default:0 },
  ],
  instanceField: false,
};

REG['_buildDetail_VPN_Gateway'] = function(r) {
  const o = r.options;
  r.skuName = o.sku || '';
  const parts = [];
  if (o.sku) parts.push(o.sku);
  const gh = Number(o.gatewayHours!==undefined&&o.gatewayHours!==''?o.gatewayHours:730);
  parts.push(`GW ${gh}h`);
  const eS2s=Number(o.extraS2sTunnels||0),eP2s=Number(o.extraP2sConnections||0),vnet=Number(o.vnetGB||0);
  if(eS2s>0)parts.push(`S2S +${eS2s}`);
  if(eP2s>0)parts.push(`P2S +${eP2s}`);
  if(vnet>0)parts.push(`${o.vnetTransferType||'VNET 간'} ${vnet}GB`);
  r.detail = parts.join(', ');
};

REG['_resolve_VPN_Gateway'] = async function(row, cur) {
  const o=row.options||{};
  const sku=o.sku||row.skuName||'';
  const gwH=Number(o.gatewayHours!==undefined&&o.gatewayHours!==''?o.gatewayHours:730);
  const eS2s=Number(o.extraS2sTunnels||0),eP2s=Number(o.extraP2sConnections||0),vnetGB=Number(o.vnetGB||0);
  let allItems=[],gateway=null,s2sItem=null,p2sItem=null,vnetItem=null,steps=[],errors=[];
  try{ allItems=await apiFetch({serviceName:'VPN Gateway',armRegionName:row.region,priceType:'Consumption'},cur,200,3); }
  catch(err){ row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null; setStatus('error',`VPN 조회 실패: ${err.message.slice(0,80)}`); updatePriceCells(row);updateTotalsRow();return; }
  const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,''),skuN=norm(sku);
  try{
    const isE=it=>{ const m=(it.meterName||'').toLowerCase(); return m.includes('tunnel')||m.includes('s2s')||m.includes('p2s')||m.includes('connection')||m.includes('data transfer')||m.includes('inter-'); };
    const gwC=allItems.filter(it=>{ if((it.type||'').toLowerCase()!=='consumption') return false; if(!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false; if(isE(it)) return false; const mN=norm(it.meterName),sN=norm(it.skuName); return mN===skuN||sN===skuN||mN.startsWith(skuN)||sN.startsWith(skuN)||mN.endsWith(skuN)||sN.endsWith(skuN); });
    gwC.sort((a,b)=>{ const ae=(norm(a.meterName)===skuN||norm(a.skuName)===skuN)?0:1,be=(norm(b.meterName)===skuN||norm(b.skuName)===skuN)?0:1; if(ae!==be)return ae-be; return Number(b.unitPrice||0)-Number(a.unitPrice||0); });
    gateway=gwC[0]||null;
  }catch(err){errors.push(`GW:${err.message}`);}
  if(eS2s>0){try{ const c=allItems.filter(it=>{ if((it.type||'').toLowerCase()!=='consumption') return false; if(!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false; const m=(it.meterName||'').toLowerCase(); if(m.includes('p2s')||m.includes('point-to-site')) return false; return m.includes('s2s')||m.includes('site-to-site')||m.includes('tunnel'); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0)); s2sItem=c[0]||null; }catch(err){errors.push(`S2S:${err.message}`);}}
  if(eP2s>0){try{ const c=allItems.filter(it=>{ if((it.type||'').toLowerCase()!=='consumption') return false; if(!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false; const m=(it.meterName||'').toLowerCase(); if(m.includes('s2s')||m.includes('site-to-site')||m.includes('tunnel')) return false; return m.includes('p2s')||m.includes('point-to-site')||m.includes('connection'); }).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0)); p2sItem=c[0]||null; }catch(err){errors.push(`P2S:${err.message}`);}}
  // Zone 매핑 — 리전별 인터넷 이그레스 존 번호
  const ZM={eastus:1,eastus2:1,westus:1,westus2:1,westus3:1,northcentralus:1,southcentralus:1,centralus:1,westcentralus:1,westeurope:1,northeurope:1,francecentral:1,francesouth:1,uksouth:1,ukwest:1,canadacentral:1,canadaeast:1,koreacentral:2,koreasouth:2,japaneast:2,japanwest:2,eastasia:2,southeastasia:2,australiaeast:2,australiasoutheast:2,centralindia:2,southindia:2,westindia:2,qatarcentral:2,brazilsouth:3,brazilsoutheast:3,southafricanorth:3,southafricawest:3,uaenorth:3,uaecentral:3,israelcentral:3};
  const uZ=ZM[row.region]||1,tt=o.vnetTransferType||'VNET 간';
  const exGb=items=>items.filter(it=>{ if((it.type||'').toLowerCase()!=='consumption') return false; const u=(it.unitOfMeasure||'').toLowerCase(); return u.includes('gb')&&!u.includes('hour'); });
  // VNET 간(VNet-to-VNet) 송신 미터 판정.
  //   같은 리전 전용 미터가 없는 리전(예: koreacentral)에서는 'Global Virtual Network
  //   Peering'의 Inter-Region Egress($/GB)가 유일한 VNet 피어링 송신 미터이므로,
  //   송신 동의어에 egress를 포함하고 'virtual network peering'도 vnet 계열로 인식한다.
  //   수신(ingress)은 전송 비용 기준이 송신이라 매칭에서 제외된다.
  const isVnetOut=it=>{ const a=`${it.meterName||''} ${it.productName||''} ${it.skuName||''}`.toLowerCase(); const out=a.includes('outbound')||a.includes('egress')||/\bout\b/.test(a); const vnetish=a.includes('inter-virtual network')||a.includes('inter virtual network')||a.includes('inter-vnet')||a.includes('inter vnet')||a.includes('vnet to vnet')||a.includes('vnet-to-vnet')||a.includes('virtual network peering')||a.includes('vnet peering'); if(vnetish&&out) return true; if(a.includes('peering')&&out) return true; if(a.includes('outbound')&&(a.includes('vnet')||a.includes('virtual network'))) return true; return false; };
  const isVpnE=it=>{ const a=`${it.meterName||''} ${it.productName||''} ${it.skuName||''}`.toLowerCase(); if(a.includes('inter-virtual network')||a.includes('inter-vnet')||a.includes('peering')||a.includes('inter-region')||a.includes('cross region')) return false; return a.includes('vpn')||a.includes('data transfer'); };
  const fbT=(gbC,type)=>type==='VNET 간'?gbC.filter(it=>Number(it.unitPrice||0)>0&&isVnetOut(it)):gbC.filter(it=>isVpnE(it));
  const srtC=cands=>{ const zr=new RegExp(`zone\\s*${uZ}\\b`,'i'),ck=it=>zr.test(it.meterName||'')||zr.test(it.skuName||'')||zr.test(it.productName||''); return cands.slice().sort((a,b)=>{ const az=ck(a)?0:1,bz=ck(b)?0:1; if(az!==bz)return az-bz; const ao=/\bout\b|outbound/i.test(a.meterName||'')?0:1,bo=/\bout\b|outbound/i.test(b.meterName||'')?0:1; if(ao!==bo)return ao-bo; return Number(a.unitPrice||0)-Number(b.unitPrice||0); }); };
  const mkId=it=>it.meterId||`${it.serviceName}|${it.armRegionName}|${it.meterName}|${it.unitPrice}`;
  if(vnetGB>0){
    let am=[];
    try{ const c1=fbT(exGb(allItems),tt); if(c1.length>0){am=am.concat(c1);steps.push(`VPN ${c1.length}건`);}else{const gp=exGb(allItems).filter(it=>Number(it.unitPrice||0)>0);if(gp.length>0){am=am.concat(gp);steps.push(`VPN GB폴백 ${gp.length}건`);}} }catch(err){errors.push(`VNETA:${err.message}`);}
    if(am.length===0){try{const vn=await apiFetch({serviceName:'Virtual Network',armRegionName:row.region,priceType:'Consumption'},cur,500,3,{pageSize:200,expectedSizeKB:300});const c2=fbT(exGb(vn),tt);if(c2.length>0){am=am.concat(c2);steps.push(`VN ${c2.length}건`);}else steps.push(`VN 0/${vn.length}`);}catch(err){steps.push('VN실패');}}
    if(am.length===0){try{const bw=await apiFetch({serviceName:'Bandwidth',armRegionName:row.region,priceType:'Consumption'},cur,2000,5,{pageSize:500,expectedSizeKB:800});const c3=fbT(exGb(bw),tt);if(c3.length>0){am=am.concat(c3);steps.push(`BW ${c3.length}건`);}else steps.push(`BW 0/${bw.length}`);}catch(err){steps.push('BW실패');}}
    const uq=new Map();am.forEach(it=>{const id=mkId(it);if(!uq.has(id))uq.set(id,it);});const vc=srtC(Array.from(uq.values()));if(vc.length>0)vnetItem=vc[0];else if(tt==='VPN')vnetItem={meterName:`[zone${uZ} 무료]`,skuName:'Free',unitPrice:0,retailPrice:0,unitOfMeasure:'1 GB',currencyCode:cur,productName:'VPN intra',serviceName:'VPN Gateway'};
  }
  let monthly=0,gwH2=0,s2sH=0,p2sH=0,vGbP=0;
  if(gateway){gwH2=Number(gateway.unitPrice);monthly+=gwH2*gwH;}
  if(s2sItem&&eS2s>0){s2sH=Number(s2sItem.unitPrice);monthly+=s2sH*eS2s*gwH;}
  if(p2sItem&&eP2s>0){p2sH=Number(p2sItem.unitPrice);monthly+=p2sH*eP2s*gwH;}
  if(vnetItem&&vnetGB>0){vGbP=Number(vnetItem.unitPrice);monthly+=vGbP*vnetGB;}
  const hEq=monthly/730;
  let payg=null;
  if(gateway)payg={...gateway,unitPrice:hEq,retailPrice:hEq,unitOfMeasure:'1 Hour (equivalent)',_billingMode:'monthly',_monthlyTotal:monthly,_gwHourly:gwH2,_gatewayHours:gwH,_partialErrors:errors.length>0?errors:undefined};
  row.paygItem=payg;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null;
  // VNET 간을 입력했는데 매칭 미터를 못 찾으면 조용한 0원 대신 매칭 실패를 노출
  const vnetFailed=(vnetGB>0&&!vnetItem);
  if(payg){
    const tags=[gateway?'GW✓':'GW✗'];if(eS2s>0)tags.push(s2sItem?'S2S✓':'S2S✗');if(eP2s>0)tags.push(p2sItem?'P2S✓':'P2S✗');if(vnetGB>0)tags.push(vnetItem?'VNET✓':'VNET✗');
    if(vnetFailed){
      setStatus('error',`${sku}: VNET 간 데이터 전송 미터 매칭 실패 — 이 리전에 해당 미터 없음(VNET 비용 미포함) [${tags.join(', ')}] · GW등 ${monthly.toFixed(2)}/월`);
    }else{
      const vnote=(vnetGB>0&&vnetItem)?` · VNET ${vnetItem.meterName||''} ${vGbP}/GB`:'';
      setStatus('ok',`${sku} 완료 [${tags.join(', ')}] · ${monthly.toFixed(2)}/월${vnote}`);
    }
  }
  else setStatus('error',`${sku}: GW 매칭 실패`);
  updatePriceCells(row);updateTotalsRow();
};
