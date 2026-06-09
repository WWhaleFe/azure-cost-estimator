let rows = [];
let nextId = 1;
let activeConfigRowId = null;

function blankRow() {
  return {
    id: nextId++,
    region: document.getElementById('defaultRegion').value,
    category: '', serviceCategory: '', skuName: '', detail: '',
    qty: 1, usage: Number(document.getElementById('defaultHours').value) || 730,
    options: {},
    paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null,
  };
}
function addRow(){rows.push(blankRow());render();}
function removeRow(id){rows=rows.filter(r=>r.id!==id);if(activeConfigRowId===id)closeConfig();render();}
function duplicateRow(id){const idx=rows.findIndex(r=>r.id===id);if(idx<0)return;const copy=JSON.parse(JSON.stringify(rows[idx]));copy.id=nextId++;rows.splice(idx+1,0,copy);render();}

const $body=document.getElementById('gridBody');
const $foot=document.getElementById('gridFoot');
const $apiStatus=document.getElementById('apiStatus');

function fmtMoney(n){if(n===null||n===undefined||isNaN(n))return'-';return Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtUnit(n){if(n===null||n===undefined||isNaN(n))return'-';return Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function escapeHtml(s){if(s===null||s===undefined)return'';return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);}

function calcGroup(item,qty,usage){
  if(!item)return null;
  if(item._billingMode==='monthly'&&typeof item._monthlyTotal==='number'){
    const monthly=Number(item._monthlyTotal);
    return{unit:monthly/730,monthly:monthly*qty,year:monthly*qty*12};
  }
  const u=Number(item.unitPrice);if(isNaN(u))return null;
  return{unit:u,monthly:u*qty*usage,year:u*qty*usage*12};
}
function priceCells(data,hasItem){
  if(!hasItem||!data)return`<td class="cell-readonly"></td><td class="cell-readonly"></td><td class="cell-readonly"></td>`;
  return`<td class="cell-readonly cell-ok">${fmtUnit(data.unit)}</td><td class="cell-readonly cell-ok">${fmtMoney(data.monthly)}</td><td class="cell-readonly cell-ok">${fmtMoney(data.year)}</td>`;
}

const SERVICE_CATEGORY_ORDER = [
  'Virtual Machine','Disk','Azure Files','Blob Storage',
  'VPN Gateway','Load Balancer','Application Gateway','Public IP',
  'Azure Firewall','Bandwidth','NAT Gateway',
  'Azure SQL Database','Azure Database for MySQL','App Service','Azure Bastion',
];

function _updateActiveRowHighlight(){
  $body.querySelectorAll('tr').forEach(tr=>{
    const id=Number(tr.dataset.id);
    if(id===activeConfigRowId)tr.classList.add('tr-active');
    else tr.classList.remove('tr-active');
  });
}

function render(){
  $body.innerHTML='';
  let totals={paygM:0,paygY:0,sp1M:0,sp1Y:0,sp3M:0,sp3Y:0,ri1M:0,ri1Y:0,ri3M:0,ri3Y:0};
  rows.forEach((row,idx)=>{
    const tr=document.createElement('tr');
    tr.dataset.id=row.id;
    tr.draggable=false;
    if(row.id===activeConfigRowId) tr.classList.add('tr-active');

    const qty=Number(row.qty)||0,usage=Number(row.usage)||0;
    const payg=calcGroup(row.paygItem,qty,usage);
    const sp1=calcGroup(row.sp1Item,qty,usage);
    const sp3=calcGroup(row.sp3Item,qty,usage);
    const ri1=calcGroup(row.ri1Item,qty,usage);
    const ri3=calcGroup(row.ri3Item,qty,usage);
    if(payg){totals.paygM+=payg.monthly;totals.paygY+=payg.year;}
    if(sp1){totals.sp1M+=sp1.monthly;totals.sp1Y+=sp1.year;}
    if(sp3){totals.sp3M+=sp3.monthly;totals.sp3Y+=sp3.year;}
    if(ri1){totals.ri1M+=ri1.monthly;totals.ri1Y+=ri1.year;}
    if(ri3){totals.ri3M+=ri3.monthly;totals.ri3Y+=ri3.year;}

    const isDiskProv = row.serviceCategory==='Disk' &&
      (row.options.diskSubType==='프리미엄 SSD v2'||row.options.diskSubType==='Ultra Disk');
    const skuDisplay = isDiskProv
      ? (row.options.diskSizeGiB?`${row.options.diskSizeGiB}GiB`:'')
      : escapeHtml(row.skuName);

    const cats = SERVICE_CATEGORY_ORDER.filter(c=>typeof SERVICE_CATEGORIES!=='undefined'&&SERVICE_CATEGORIES[c]);
    const catOpts = cats.map(c=>`<option value="${escapeHtml(c)}" ${row.serviceCategory===c?'selected':''}>${escapeHtml(c)}</option>`).join('');
    const catCell = `<td><select class="cell-input cell-select" data-act="cat-select" data-id="${row.id}"><option value="">선택...</option>${catOpts}</select></td>`;

    const regionOpts = Object.entries(REGION_LABEL)
      .map(([code,lbl])=>`<option value="${code}" ${row.region===code?'selected':''}>${escapeHtml(lbl)}</option>`).join('');
    const regionCell = `<td><select class="cell-input cell-select" data-act="region-select" data-id="${row.id}">${regionOpts}</select></td>`;

    const skuCellDisabled = !row.serviceCategory ? 'disabled style="background:#f3f2f1;color:#a19f9d;cursor:not-allowed;"' : '';
    const skuPlaceholder = row.serviceCategory ? '클릭하여 옵션 선택...' : '';
    const skuCell = `<td data-act="open-config-td" data-id="${row.id}" style="cursor:${row.serviceCategory?'pointer':'default'};">
      <input type="text" class="cell-input text-left" data-act="open-config" data-id="${row.id}" ${skuCellDisabled}
        placeholder="${skuPlaceholder}" value="${skuDisplay}" readonly style="cursor:${row.serviceCategory?'pointer':'default'};"/></td>`;

    tr.innerHTML=`
      <td class="cell-drag" data-act="drag-handle" title="드래그해서 순서 변경">⋮⋮</td>
      <td class="cell-readonly text-center">${idx+1}</td>
      ${regionCell}
      <td><input type="text" class="cell-input text-left" data-act="freetext" data-id="${row.id}" data-field="category" placeholder="예: Web/WAS Server" value="${escapeHtml(row.category)}" /></td>
      ${catCell}
      ${skuCell}
      <td class="cell-detail"><div class="detail-wrap">${escapeHtml(row.detail)||'<span style="color:#a19f9d;font-size:10px;">자동 생성됨</span>'}</div></td>
      <td><input type="number" min="0" step="any" class="cell-input text-right" data-act="num" data-id="${row.id}" data-field="qty" value="${row.qty}" /></td>
      <td><input type="number" min="0" step="1" class="cell-input text-right" data-act="num" data-id="${row.id}" data-field="usage" value="${row.usage}" placeholder="730" /></td>
      ${priceCells(payg,!!row.paygItem)}
      ${priceCells(sp1,!!row.sp1Item)}
      ${priceCells(sp3,!!row.sp3Item)}
      ${priceCells(ri1,!!row.ri1Item)}
      ${priceCells(ri3,!!row.ri3Item)}
      <td class="text-center whitespace-nowrap" style="background:#f8fbff;">
        <button class="row-action-btn" data-act="config" data-id="${row.id}" title="옵션 설정">⚙</button>
        <button class="row-action-btn" data-act="dup" data-id="${row.id}" title="행 복사">⎘</button>
        <button class="row-action-btn danger" data-act="del" data-id="${row.id}" title="행 삭제">✕</button>
      </td>`;
    $body.appendChild(tr);
  });

  $foot.innerHTML=`<tr class="total-row">
    <td colspan="9" style="text-align:right;padding:6px 8px;">Total</td>
    <td class="cell-readonly cell-ok">-</td><td class="cell-readonly cell-ok">${fmtMoney(totals.paygM)}</td><td class="cell-readonly cell-ok">${fmtMoney(totals.paygY)}</td>
    <td class="cell-readonly cell-ok">-</td><td class="cell-readonly cell-ok">${fmtMoney(totals.sp1M)}</td><td class="cell-readonly cell-ok">${fmtMoney(totals.sp1Y)}</td>
    <td class="cell-readonly cell-ok">-</td><td class="cell-readonly cell-ok">${fmtMoney(totals.sp3M)}</td><td class="cell-readonly cell-ok">${fmtMoney(totals.sp3Y)}</td>
    <td class="cell-readonly cell-ok">-</td><td class="cell-readonly cell-ok">${fmtMoney(totals.ri1M)}</td><td class="cell-readonly cell-ok">${fmtMoney(totals.ri1Y)}</td>
    <td class="cell-readonly cell-ok">-</td><td class="cell-readonly cell-ok">${fmtMoney(totals.ri3M)}</td><td class="cell-readonly cell-ok">${fmtMoney(totals.ri3Y)}</td>
    <td></td></tr>`;
}

function updatePriceCells(row){
  const tr=$body.querySelector(`tr[data-id="${row.id}"]`);if(!tr)return;
  const tds=tr.querySelectorAll('td'),qty=Number(row.qty)||0,usage=Number(row.usage)||0;
  [{item:row.paygItem,base:9},{item:row.sp1Item,base:12},{item:row.sp3Item,base:15},{item:row.ri1Item,base:18},{item:row.ri3Item,base:21}].forEach(({item,base})=>{
    if(!tds[base]||!tds[base+1]||!tds[base+2])return;
    const data=calcGroup(item,qty,usage);
    if(!data){
      tds[base].className='cell-readonly';tds[base].textContent='';
      tds[base+1].className='cell-readonly';tds[base+1].textContent='';
      tds[base+2].className='cell-readonly';tds[base+2].textContent='';
    }else{
      tds[base].className='cell-readonly cell-ok';tds[base].textContent=fmtUnit(data.unit);
      tds[base+1].className='cell-readonly cell-ok';tds[base+1].textContent=fmtMoney(data.monthly);
      tds[base+2].className='cell-readonly cell-ok';tds[base+2].textContent=fmtMoney(data.year);
    }
  });
}
function updateTotalsRow(){
  let totals={paygM:0,paygY:0,sp1M:0,sp1Y:0,sp3M:0,sp3Y:0,ri1M:0,ri1Y:0,ri3M:0,ri3Y:0};
  rows.forEach(row=>{
    const qty=Number(row.qty)||0,usage=Number(row.usage)||0;
    const add=(item,mK,yK)=>{const d=calcGroup(item,qty,usage);if(d){totals[mK]+=d.monthly;totals[yK]+=d.year;}};
    add(row.paygItem,'paygM','paygY');add(row.sp1Item,'sp1M','sp1Y');add(row.sp3Item,'sp3M','sp3Y');
    add(row.ri1Item,'ri1M','ri1Y');add(row.ri3Item,'ri3M','ri3Y');
  });
  const totalRow=$foot.querySelector('tr.total-row');if(!totalRow)return;
  const tds=totalRow.querySelectorAll('td');
  const map=[null,'paygM','paygY',null,'sp1M','sp1Y',null,'sp3M','sp3Y',null,'ri1M','ri1Y',null,'ri3M','ri3Y'];
  for(let i=0;i<map.length;i++){const td=tds[i+1];if(!td)continue;if(map[i]===null)td.textContent='-';else td.textContent=fmtMoney(totals[map[i]]);}
}

// ================================================================
// 이벤트 위임
// ================================================================
function _resetRow(r){
  r.skuName='';r.detail='';r.options={};
  r.paygItem=null;r.sp1Item=null;r.sp3Item=null;r.ri1Item=null;r.ri3Item=null;
}

$body.addEventListener('click', async (e)=>{
  const t = e.target;
  if(t.dataset.act==='dup'){duplicateRow(Number(t.dataset.id));return;}
  if(t.dataset.act==='del'){removeRow(Number(t.dataset.id));return;}
  if(t.dataset.act==='drag-handle')return;
  if(t.tagName==='SELECT'||t.tagName==='OPTION')return;
  if(t.dataset.act==='num'||t.dataset.act==='freetext')return;
  const tr=t.closest('tr');
  if(!tr||!tr.dataset.id)return;
  const rowId=Number(tr.dataset.id);
  const r=rows.find(x=>x.id===rowId);
  if(!r||!r.serviceCategory)return;
  if(activeConfigRowId!==null && activeConfigRowId!==rowId && configDirty){
    await applyConfig();
  }
  openConfig(rowId);
});

$body.addEventListener('change',(e)=>{
  const t=e.target,id=Number(t.dataset.id),r=rows.find(x=>x.id===id);if(!r)return;
  if(t.dataset.act==='region-select'){
    r.region=t.value;
    if(r.skuName||(r.serviceCategory==='Disk'&&r.options.diskSubType))tryResolveItem(r);
    return;
  }
  if(t.dataset.act==='cat-select'){
    _resetRow(r);
    r.serviceCategory=t.value;
    render();
    if(r.serviceCategory)openConfig(r.id);
    return;
  }
});
$body.addEventListener('input',(e)=>{
  const t=e.target,id=Number(t.dataset.id),r=rows.find(x=>x.id===id);if(!r)return;
  if(t.dataset.act==='num'){
    const f=t.dataset.field,raw=String(t.value).trim(),n=raw===''?0:Number(raw);
    r[f]=isNaN(n)?0:n;
    updatePriceCells(r);updateTotalsRow();
  } else if(t.dataset.act==='freetext') r[t.dataset.field]=t.value;
});

document.getElementById('btnAddRow').addEventListener('click',addRow);
document.getElementById('currencySelect').addEventListener('change',async(e)=>{
  const prev=e.target._prevValue||'KRW';clearCacheForCurrency(prev);e.target._prevValue=e.target.value;
  for(const r of rows){r.paygItem=null;r.sp1Item=null;r.sp3Item=null;r.ri1Item=null;r.ri3Item=null;}
  render();
  for(const r of rows){
    const hasSku=r.skuName||(r.serviceCategory==='Disk'&&r.options.diskSubType);
    if(hasSku)await tryResolveItem(r);
  }
});
document.getElementById('currencySelect')._prevValue=document.getElementById('currencySelect').value;
document.getElementById('defaultHours').addEventListener('change',(e)=>{
  const v=Number(e.target.value)||730;
  rows.forEach(r=>{r.usage=v;});
  rows.forEach(r=>{updatePriceCells(r);});
  updateTotalsRow();render();
});

let dragSrcId=null;
$body.addEventListener('mousedown',(e)=>{const h=e.target.closest('[data-act="drag-handle"]');if(h)h.closest('tr').draggable=true;});
$body.addEventListener('dragstart',(e)=>{const tr=e.target.closest('tr');if(!tr)return;dragSrcId=Number(tr.dataset.id);tr.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
$body.addEventListener('dragover',(e)=>{e.preventDefault();const tr=e.target.closest('tr');if(!tr)return;$body.querySelectorAll('tr').forEach(t=>t.classList.remove('drag-over'));tr.classList.add('drag-over');});
$body.addEventListener('drop',(e)=>{e.preventDefault();const tr=e.target.closest('tr');if(!tr||dragSrcId===null)return;const tid=Number(tr.dataset.id);if(tid===dragSrcId)return;const si=rows.findIndex(r=>r.id===dragSrcId),ti=rows.findIndex(r=>r.id===tid);if(si<0||ti<0)return;const[moved]=rows.splice(si,1);rows.splice(ti,0,moved);render();});
$body.addEventListener('dragend',()=>{$body.querySelectorAll('tr').forEach(t=>{t.classList.remove('dragging');t.classList.remove('drag-over');t.draggable=false;});dragSrcId=null;});

// ================================================================
// 옵션 패널
// ================================================================
const $configPanel=document.getElementById('configPanel');
const $configTitle=document.getElementById('configTitle');
const $configContent=document.getElementById('configContent');
let configDirty=false,applyConfigBusy=false;

async function applyConfig(){
  if(applyConfigBusy||!configDirty)return;
  const r=rows.find(x=>x.id===activeConfigRowId);if(!r)return;
  applyConfigBusy=true;
  try{
    buildSkuAndDetail(r);
    await tryResolveItem(r);
    render();
    configDirty=false;
    const $b=document.getElementById('configDirtyBadge');if($b)$b.style.display='none';
  }finally{applyConfigBusy=false;}
}
document.getElementById('btnCloseConfig').addEventListener('click',async()=>{if(configDirty)await applyConfig();closeConfig();});
document.getElementById('btnApplyConfig').addEventListener('click',applyConfig);

function openConfig(rowId){
  const r=rows.find(x=>x.id===rowId);if(!r||!r.serviceCategory)return;
  activeConfigRowId=rowId;
  $configPanel.classList.add('active');
  renderConfigPanel();
  _updateActiveRowHighlight();
}
function closeConfig(){
  activeConfigRowId=null;
  $configPanel.classList.remove('active');
  configDirty=false;
  const $b=document.getElementById('configDirtyBadge');if($b)$b.style.display='none';
  _updateActiveRowHighlight();
}

// ================================================================
// renderConfigPanel
// ================================================================
function renderConfigPanel(){
  const r=rows.find(x=>x.id===activeConfigRowId);if(!r){closeConfig();return;}
  const def=SERVICE_CATEGORIES[r.serviceCategory];if(!def){closeConfig();return;}
  $configTitle.textContent=`${r.serviceCategory} 옵션 (행 #${rows.findIndex(x=>x.id===r.id)+1})`;
  if(r.serviceCategory==='Disk'){
    _renderDiskConfigPanel(r);
    return;
  }
  const allSteps=(def.steps||[]).filter(s=>!s._hidden);
  const renderStep=_makeStepRenderer(r);
  let instanceHtml='';
  if(def.instanceField){
    let instanceOptions=[];
    if(r.serviceCategory==='Virtual Machine'){
      const series=r.options.series;
      if(series&&typeof VM_INSTANCE_CATALOG!=='undefined'&&VM_INSTANCE_CATALOG[series])
        instanceOptions=VM_INSTANCE_CATALOG[series].map(i=>({value:i.name,label:`${i.name} (vCPU:${i.vCPU} RAM:${i.ram}GB)`}));
    }
    const sel=r.options.instance||r.skuName||'';
    instanceHtml=`<div class="config-field" style="grid-column:1/-1;"><label>인스턴스</label><select data-opt-key="instance" ${instanceOptions.length===0?'disabled':''}><option value="">${instanceOptions.length===0?'상위 옵션을 먼저 선택하세요':'선택...'}</option>${instanceOptions.map(o=>`<option value="${escapeHtml(o.value)}" ${sel===o.value?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
  }
  $configContent.innerHTML=allSteps.map(renderStep).join('')+instanceHtml;
  _bindConfigEvents(r,def);
}

// ================================================================
// Disk 전용 패널
// [v40] perfTier 제거, P30 이상 RI 알림 추가
// ================================================================
function _renderDiskConfigPanel(r){
  const o=r.options;
  const sub=typeof DISK_SUBTYPE_MAP!=='undefined'?DISK_SUBTYPE_MAP[o.diskSubType]:null;
  const html=[];

  // 1. 디스크 종류
  const subtypeOptions=typeof DISK_SUBTYPE_MAP!=='undefined'
    ?Object.keys(DISK_SUBTYPE_MAP).map(k=>`<option value="${escapeHtml(k)}" ${o.diskSubType===k?'selected':''}>${escapeHtml(k)}</option>`).join('')
    :'';
  html.push(`<div class="config-field"><label>디스크 종류</label><select data-opt-key="diskSubType"><option value="">선택...</option>${subtypeOptions}</select></div>`);

  if(!sub){$configContent.innerHTML=html.join('');_bindDiskConfigEvents(r);return;}

  if(sub.isProvisioned){
    if(sub.diskType==='ultra'){
      const sizeOpts=(typeof ULTRA_DISK_SIZES!=='undefined'?ULTRA_DISK_SIZES:[])
        .map(s=>`<option value="${s.gib}" ${Number(o.diskSizeGiB)===s.gib?'selected':''}>${escapeHtml(s.label)}</option>`).join('');
      html.push(`<div class="config-field"><label>디스크 크기</label><select data-opt-key="diskSizeGiB">${sizeOpts}</select></div>`);
    }else{
      html.push(`<div class="config-field"><label>디스크 크기 (GiB)</label><input type="number" data-opt-key="diskSizeGiB" data-opt-type="number" min="1" max="65536" step="1" value="${o.diskSizeGiB||1}" style="text-align:right;"/></div>`);
    }
    const minI=sub.diskType==='ultra'?100:3000;
    const fL=sub.diskType==='premiumv2'?' (3,000 무료 포함)':'';
    html.push(`<div class="config-field"><label>IOPS${fL}</label><input type="number" data-opt-key="provisionedIOPS" data-opt-type="number" min="${minI}" step="100" value="${o.provisionedIOPS||minI}" style="text-align:right;"/></div>`);
    const minB=sub.diskType==='ultra'?1:125;
    const bL=sub.diskType==='premiumv2'?' (125 MB/s 무료 포함)':'';
    html.push(`<div class="config-field"><label>처리량 MB/s${bL}</label><input type="number" data-opt-key="provisionedMBps" data-opt-type="number" min="${minB}" step="1" value="${o.provisionedMBps||minB}" style="text-align:right;"/></div>`);
  }else{
    // 표준 HDD / 표준 SSD / 프리미엄 SSD
    if(sub.hasRedundancy){
      const redOpts=['LRS','ZRS'].map(v=>`<option value="${v}" ${o.redundancy===v?'selected':''}>${v}</option>`).join('');
      html.push(`<div class="config-field"><label>중복성</label><select data-opt-key="redundancy"><option value="">선택...</option>${redOpts}</select></div>`);
    }
    const catalog=(typeof DISK_CATALOG!=='undefined'?DISK_CATALOG[sub.storageType]:null)||[];
    const instOpts=catalog.map(d=>{
      const extra=d.iops?`, ${d.iops.toLocaleString()} IOPS`:'';
      // P30 이상은 RI 지원 표시
      const riTag=(sub.diskType==='premium'&&typeof PREMIUM_SSD_RI_SUPPORTED!=='undefined'&&PREMIUM_SSD_RI_SUPPORTED.has(d.name))?' [RI가능]':'';
      return `<option value="${d.name}" ${o.diskInstance===d.name?'selected':''}>${d.name} (${d.size}GB${extra})${riTag}</option>`;
    }).join('');
    html.push(`<div class="config-field" style="grid-column:1/-1;"><label>디스크 크기 (SKU)</label><select data-opt-key="diskInstance"><option value="">선택...</option>${instOpts}</select></div>`);

    // [v40] perfTier 제거 — Azure 가격 계산기에 없는 옵션
    // 스냅샷, Conf OS Enc, 버스팅 (Premium SSD만)
    if(sub.diskType!=='premium'){
      html.push(`<div class="config-field"><label>Storage 트랜잭션 (10,000단위, 월)</label><input type="number" data-opt-key="transactionUnits" data-opt-type="number" min="0" step="1" value="${o.transactionUnits||0}" style="text-align:right;"/></div>`);
    }
    html.push(`<div class="config-field"><label>스냅샷 (GB, 월)<span style="font-size:10px;color:#0078d4;cursor:help;" title="LRS 저장 GB × 단가/GB"> [?]</span></label><input type="number" data-opt-key="snapshotGB" data-opt-type="number" min="0" step="1" value="${o.snapshotGB||0}" style="text-align:right;"/></div>`);
    const confOpts=['비활성 (기본)','활성화'].map(v=>`<option value="${v}" ${o.confEncryptionEnabled===v?'selected':''}>${v}</option>`).join('');
    html.push(`<div class="config-field"><label>Confidential OS Encryption<span style="font-size:10px;color:#0078d4;cursor:help;" title="GiB × 730h × Per GiB 단가"> [?]</span></label><select data-opt-key="confEncryptionEnabled"><option value="">선택...</option>${confOpts}</select></div>`);
    if(sub.diskType==='premium'){
      // P30 이상: RI 안내
      const selectedSku=o.diskInstance||'';
      const riSupported=typeof PREMIUM_SSD_RI_SUPPORTED!=='undefined'&&PREMIUM_SSD_RI_SUPPORTED.has(selectedSku);
      if(riSupported){
        html.push(`<div class="config-field" style="grid-column:1/-1;"><div style="background:#f0f6ff;border:1px solid #b3d4ff;border-radius:2px;padding:6px 10px;font-size:11px;color:#0050a0;">&#10003; <strong>1년 예약 지원</strong> — 확인 클릭 시 <strong>예약 1년</strong> 열에 자동 표시됩니다.</div></div>`);
      } else if(selectedSku){
        html.push(`<div class="config-field" style="grid-column:1/-1;"><div style="background:#f8f8f8;border:1px solid #ddd;border-radius:2px;padding:6px 10px;font-size:11px;color:#666;">&#9432; ${selectedSku}는 1년 예약을 지원하지 않습니다. P30 이상 SKU에서 예약이 가능합니다.</div></div>`);
      }
      const burstOpts=['비활성 (기본)','활성화 (P30 이상)'].map(v=>`<option value="${v}" ${o.burstingEnabled===v?'selected':''}>${v}</option>`).join('');
      html.push(`<div class="config-field"><label>디스크 버스팅<span style="font-size:10px;color:#0078d4;cursor:help;" title="P30 이상에서 사용 가능. 활성화 월정액 + 버스트 트랜잭션"> [?]</span></label><select data-opt-key="burstingEnabled"><option value="">선택...</option>${burstOpts}</select></div>`);
      if(o.burstingEnabled==='활성화 (P30 이상)'){
        html.push(`<div class="config-field"><label>예상 최대 IOPS</label><input type="number" data-opt-key="burstMaxIOPS" data-opt-type="number" min="0" step="100" value="${o.burstMaxIOPS||0}" style="text-align:right;"/></div>`);
        html.push(`<div class="config-field"><label>예상 최대 처리량 (MB/s)</label><input type="number" data-opt-key="burstMaxThroughputMBs" data-opt-type="number" min="0" step="10" value="${o.burstMaxThroughputMBs||0}" style="text-align:right;"/></div>`);
        html.push(`<div class="config-field"><label>근무일당 버스트 시간 (분)</label><input type="number" data-opt-key="burstMinsPerDay" data-opt-type="number" min="0" step="1" value="${o.burstMinsPerDay||30}" style="text-align:right;"/></div>`);
        html.push(`<div class="config-field"><label>월간 근무일 수</label><input type="number" data-opt-key="burstWorkDaysPerMonth" data-opt-type="number" min="0" step="1" value="${o.burstWorkDaysPerMonth||20}" style="text-align:right;"/></div>`);
      }
    }
  }
  $configContent.innerHTML=html.join('');
  _bindDiskConfigEvents(r);
}

function _bindDiskConfigEvents(r){
  const $db=document.getElementById('configDirtyBadge');
  const markDirty=()=>{configDirty=true;if($db)$db.style.display='';};
  const clearDirty=()=>{configDirty=false;if($db)$db.style.display='none';};
  clearDirty();
  $configContent.querySelectorAll('select[data-opt-key]').forEach(sel=>{
    sel.addEventListener('change',(e)=>{
      const key=e.target.dataset.optKey,val=e.target.value;
      r.options[key]=val;
      if(key==='diskSubType'){r.options={diskSubType:val};r.skuName='';r.detail='';r.paygItem=null;r.sp1Item=null;r.sp3Item=null;r.ri1Item=null;r.ri3Item=null;}
      if(key==='diskInstance')r.skuName=val;
      if(key==='burstingEnabled'&&val!=='활성화 (P30 이상)'){delete r.options.burstMaxIOPS;delete r.options.burstMaxThroughputMBs;delete r.options.burstMinsPerDay;delete r.options.burstWorkDaysPerMonth;}
      buildSkuAndDetail(r);render();
      // diskSubType, diskInstance(예약 안내 갱신), burstingEnabled 변경 시 패널 재렌더
      if(key==='diskSubType'||key==='diskInstance'||key==='burstingEnabled')renderConfigPanel();
      markDirty();
    });
  });
  $configContent.querySelectorAll('input[data-opt-type="number"]').forEach(inp=>{
    inp.addEventListener('input',(e)=>{
      const key=e.target.dataset.optKey,raw=e.target.value;
      r.options[key]=(raw===''?0:Number(raw));
      buildSkuAndDetail(r);render();markDirty();
    });
  });
}

function _makeStepRenderer(r){
  return function(step){
    if(!step||!step.key)return'';
    const tooltip=step.tooltip?`title="${escapeHtml(step.tooltip)}"`:"";
    const curVal=r&&r.options?r.options[step.key]:undefined;
    if(step.type==='number'){
      const curNum=(curVal!==undefined&&curVal!=='')?curVal:(step.default!==undefined?step.default:0);
      return`<div class="config-field"><label ${tooltip}>${escapeHtml(step.label)}${step.tooltip?' <span style="font-size:10px;color:#0078d4;cursor:help;">[?]</span>':''}</label><input type="number" data-opt-key="${step.key}" data-opt-type="number" min="${step.min!==undefined?step.min:0}" step="${step.step!==undefined?step.step:1}" value="${curNum}" style="text-align:right;"/></div>`;
    }
    if(!Array.isArray(step.options))return'';
    const opts=step.options.map(opt=>`<option value="${escapeHtml(opt)}" ${curVal===opt?'selected':''}>${escapeHtml(opt)}</option>`).join('');
    return`<div class="config-field"><label ${tooltip}>${escapeHtml(step.label)}${step.tooltip?' <span style="font-size:10px;color:#0078d4;cursor:help;">[?]</span>':''}</label><select data-opt-key="${step.key}"><option value="">선택...</option>${opts}</select></div>`;
  };
}

function _bindConfigEvents(r,def){
  const $db=document.getElementById('configDirtyBadge');
  const markDirty=()=>{configDirty=true;if($db)$db.style.display='';};
  const clearDirty=()=>{configDirty=false;if($db)$db.style.display='none';};
  clearDirty();
  const KEYS_REBUILD=[(def.instanceParentKey||null)].filter(Boolean);
  $configContent.querySelectorAll('select[data-opt-key]').forEach(sel=>{
    sel.addEventListener('change',(e)=>{
      const key=e.target.dataset.optKey;r.options[key]=e.target.value;
      if(KEYS_REBUILD.includes(key)){r.options.instance='';buildSkuAndDetail(r);render();renderConfigPanel();markDirty();return;}
      buildSkuAndDetail(r);render();markDirty();
    });
  });
  $configContent.querySelectorAll('input[data-opt-type="number"]').forEach(inp=>{
    inp.addEventListener('input',(e)=>{
      const key=e.target.dataset.optKey,raw=e.target.value;
      r.options[key]=(raw===''?0:Number(raw));
      if(key==='gatewayHours')r.usage=Number(raw)||0;
      buildSkuAndDetail(r);render();markDirty();
    });
  });
}

function setStatus(kind,msg){const cls=kind==='ok'?'badge badge-ok':kind==='error'?'badge badge-error':'badge badge-loading';$apiStatus.innerHTML=`<span class="${cls}">${escapeHtml(msg)}</span>`;}

// ================================================================
// 엑셀 내보내기
// ================================================================
const EXPORT_GROUPS=[
  {key:'payg',label:'용량제 (PAYG)',  itemKey:'paygItem',color:'2E75B6',totMKey:'paygM',totYKey:'paygY'},
  {key:'sp1', label:'절약 플랜 1년',itemKey:'sp1Item', color:'70AD47',totMKey:'sp1M', totYKey:'sp1Y'},
  {key:'sp3', label:'절약 플랜 3년',itemKey:'sp3Item', color:'548235',totMKey:'sp3M', totYKey:'sp3Y'},
  {key:'ri1', label:'예약 1년',    itemKey:'ri1Item', color:'C55A11',totMKey:'ri1M', totYKey:'ri1Y'},
  {key:'ri3', label:'예약 3년',    itemKey:'ri3Item', color:'843C0C',totMKey:'ri3M', totYKey:'ri3Y'},
];
function getEnabledGroups(){return EXPORT_GROUPS.filter(g=>{const c=document.getElementById(`chk-group-${g.key}`);return !c||c.checked;});}

document.getElementById('btnExport').addEventListener('click',()=>{
  const cur=document.getElementById('currencySelect').value;
  const enabledGroups=getEnabledGroups();
  if(enabledGroups.length===0){alert('엑셀로 출력할 가격 그룹을 하나 이상 선택하세요.');return;}
  const data=[];
  data.push(['Azure 견적 시뮬레이션']);
  data.push([`통화: ${cur} | 출력: ${enabledGroups.map(g=>g.label).join(', ')} | 생성: ${new Date().toLocaleString('ko-KR')}`]);
  data.push([]);
  const bH=['#','Region','분류','Service Category','Service name (SKU)','상세 사양','Qty','사용량(Hours)'];
  const gHdr=[...bH],gCol=[...bH];
  enabledGroups.forEach(g=>{gHdr.push(g.label,'','');gCol.push('Unit Price','1 Monthly Cost','1 Year cost');});
  data.push(gHdr);data.push(gCol);
  let totals={};enabledGroups.forEach(g=>{totals[g.totMKey]=0;totals[g.totYKey]=0;});
  rows.forEach((r,idx)=>{
    const qty=Number(r.qty)||0,usage=Number(r.usage)||0;
    const calc=(it)=>{if(!it)return['','',''];const d=calcGroup(it,qty,usage);if(!d)return['','',''];return[d.unit,d.monthly,d.year];};
    const isDiskProv=r.serviceCategory==='Disk'&&(r.options.diskSubType==='프리미엄 SSD v2'||r.options.diskSubType==='Ultra Disk');
    const skuForExport=isDiskProv?(r.options.diskSizeGiB?`${r.options.diskSizeGiB}GiB`:''):r.skuName;
    const row=[idx+1,REGION_LABEL[r.region]||r.region,r.category,r.serviceCategory,skuForExport,r.detail,qty,usage];
    enabledGroups.forEach(g=>{const[u,m,y]=calc(r[g.itemKey]);row.push(u,m,y);if(typeof m==='number'){totals[g.totMKey]+=m;totals[g.totYKey]+=y;}});
    data.push(row);
  });
  const tr=['Total','','','','','','',''];enabledGroups.forEach(g=>{tr.push('',totals[g.totMKey],totals[g.totYKey]);});data.push(tr);
  data.push([]);data.push(['[Remark]']);
  data.push(['1. Azure Retail Prices API의 공시 가격이며, EA 등 별도 할인은 반영되지 않습니다.']);
  data.push(['2. 절약 플랜/예약 단가는 시간당 환산 단가입니다.']);
  data.push(['3. 프리미엄 SSD P30 이상: 용량제열=PAYG, 예약 1년열=RI 1Y 단가 (자동 표시). P1~P20은 RI 미지원.']);
  const ws=XLSX.utils.aoa_to_sheet(data);
  const bA={top:{style:'thin',color:{rgb:'BFBFBF'}},bottom:{style:'thin',color:{rgb:'BFBFBF'}},left:{style:'thin',color:{rgb:'BFBFBF'}},right:{style:'thin',color:{rgb:'BFBFBF'}}};
  const tSt={font:{bold:true,sz:16,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'305496'}},alignment:{horizontal:'center',vertical:'center'}};
  const sSt={font:{italic:true,sz:10,color:{rgb:'595959'}},alignment:{horizontal:'left'}};
  const hSt=(c)=>({font:{bold:true,sz:11,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:c}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:bA});
  const dSt={font:{sz:10},alignment:{vertical:'center',wrapText:true},border:bA};
  const nSt={font:{sz:10},alignment:{horizontal:'right',vertical:'center'},numFmt:'#,##0.00',border:bA};
  const totSt={font:{bold:true,sz:11},fill:{fgColor:{rgb:'FFF2CC'}},alignment:{horizontal:'right',vertical:'center'},border:{top:{style:'medium',color:{rgb:'305496'}},bottom:{style:'medium',color:{rgb:'305496'}},left:bA.left,right:bA.right},numFmt:'#,##0.00'};
  if(!ws['A1'])ws['A1']={v:'Azure 견적 시뮬레이션'};ws['A1'].s=tSt;
  if(ws['A2'])ws['A2'].s=sSt;
  const tC=8+enabledGroups.length*3;
  for(let c=0;c<tC;c++){const a3=XLSX.utils.encode_cell({r:3,c}),a4=XLSX.utils.encode_cell({r:4,c});let color='305496';if(c>=8){const gi=Math.floor((c-8)/3);if(gi<enabledGroups.length)color=enabledGroups[gi].color;}if(!ws[a3])ws[a3]={v:''};ws[a3].s=hSt(color);if(!ws[a4])ws[a4]={v:''};ws[a4].s=hSt(color);}
  for(let i=0;i<rows.length;i++){const ri=5+i;for(let c=0;c<tC;c++){const addr=XLSX.utils.encode_cell({r:ri,c});if(!ws[addr])ws[addr]={v:''};if(c>=6&&typeof ws[addr].v==='number')ws[addr].s=nSt;else ws[addr].s={...dSt,alignment:{...dSt.alignment,horizontal:c===0?'center':'left'}};}}
  const tri=5+rows.length;for(let c=0;c<tC;c++){const addr=XLSX.utils.encode_cell({r:tri,c});if(!ws[addr])ws[addr]={v:''};ws[addr].s=totSt;}
  ws['!cols']=[{wch:4},{wch:14},{wch:24},{wch:22},{wch:18},{wch:36},{wch:6},{wch:12},...enabledGroups.flatMap(()=>[{wch:13},{wch:16},{wch:16}])];
  ws['!rows']=[];ws['!rows'][0]={hpt:28};ws['!rows'][3]={hpt:22};ws['!rows'][4]={hpt:22};
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:tC-1}},{s:{r:1,c:0},e:{r:1,c:tC-1}},...[0,1,2,3,4,5,6,7].map(c=>({s:{r:3,c},e:{r:4,c}})),...enabledGroups.map((_,gi)=>({s:{r:3,c:8+gi*3},e:{r:3,c:8+gi*3+2}})),{s:{r:tri,c:0},e:{r:tri,c:7}}];
  const rsR=tri+2;ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rsR+3,c:tC-1}});
  ws['!freeze']={xSplit:0,ySplit:5,topLeftCell:'A6',activePane:'bottomLeft',state:'frozen'};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Azure 견적');
  XLSX.writeFile(wb,`azure-quote-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.xlsx`);
});

addRow();addRow();addRow();
setStatus('ok','준비 완료');
bootDiagnostics();

// ================================================================
// CSV 양식 다운로드 / 업로드 (v46)
// 1차 지원: Virtual Machine, Disk, VPN Gateway
// SKU 열은 서비스별 옵션 키로 매핑(VM=instance, Disk=diskInstance, VPN=sku)
// ================================================================
var CSV_SUPPORTED_CATEGORIES = ['Virtual Machine', 'Disk', 'VPN Gateway'];
var CSV_SKU_OPTION_KEY = { 'Virtual Machine': 'instance', 'Disk': 'diskInstance', 'VPN Gateway': 'sku' };
var CSV_HEADER = ['Region', '분류', 'ServiceCategory', 'SKU', 'Qty', 'Hours', 'Options'];

function _csvEscapeField(v) {
  var s = (v === null || v === undefined) ? '' : String(v);
  if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function _csvRowToLine(arr) { return arr.map(_csvEscapeField).join(','); }

function _csvBuildOptionGuide() {
  var lines = [];
  lines.push('# [옵션 사전] 아래 # 줄은 업로드 시 무시됩니다. Options 칸은 키=값을 세미콜론(;)으로 구분하세요.');
  var defs = (typeof SERVICE_CATEGORIES !== 'undefined') ? SERVICE_CATEGORIES : {};

  // Virtual Machine
  var vm = defs['Virtual Machine'];
  if (vm && vm.steps) {
    var vmParts = [];
    vm.steps.forEach(function (s) {
      if (s.key === 'series') return;
      if (Array.isArray(s.options)) vmParts.push(s.key + '=[' + s.options.join('|') + ']');
      else if (s.type === 'number') vmParts.push(s.key + '=숫자');
    });
    lines.push('# Virtual Machine | SKU=인스턴스(예: D4s_v5) | Options: ' + vmParts.join('; '));
    var series = (typeof VM_INSTANCE_CATALOG !== 'undefined') ? Object.keys(VM_INSTANCE_CATALOG) : [];
    lines.push('#   series=[' + series.join('|') + '] (SKU는 선택한 series에 속한 인스턴스여야 함)');
    series.forEach(function (sr) {
      lines.push('#     ' + sr + ': ' + VM_INSTANCE_CATALOG[sr].map(function (i) { return i.name; }).join(', '));
    });
  }

  // Disk (전용 패널 — 종류별 옵션이 다름)
  if (typeof DISK_SUBTYPE_MAP !== 'undefined') {
    lines.push('# Disk | Options 필수: diskSubType=[' + Object.keys(DISK_SUBTYPE_MAP).join('|') + ']');
    lines.push('#   용량형(표준 HDD/표준 SSD/프리미엄 SSD): SKU=디스크 크기 SKU; Options: redundancy=[LRS|ZRS](HDD는 LRS 고정), snapshotGB=숫자, confEncryptionEnabled=[비활성 (기본)|활성화]');
    if (typeof DISK_CATALOG !== 'undefined') {
      Object.keys(DISK_CATALOG).forEach(function (st) {
        lines.push('#     ' + st + ': ' + DISK_CATALOG[st].map(function (d) { return d.name; }).join(', '));
      });
    }
    lines.push('#   표준 HDD/SSD 추가: transactionUnits=숫자(만 단위)');
    lines.push('#   프리미엄 SSD 추가: burstingEnabled=[비활성 (기본)|활성화 (P30 이상)] (활성화 시 burstMaxIOPS, burstMaxThroughputMBs, burstMinsPerDay, burstWorkDaysPerMonth)');
    lines.push('#   프로비저닝형(프리미엄 SSD v2/Ultra Disk): SKU는 비움; Options: diskSizeGiB=숫자, provisionedIOPS=숫자, provisionedMBps=숫자');
  }

  // VPN Gateway
  var vpn = defs['VPN Gateway'];
  if (vpn && vpn.steps) {
    var vpnParts = [];
    vpn.steps.forEach(function (s) {
      if (s.key === 'sku') return;
      if (Array.isArray(s.options)) vpnParts.push(s.key + '=[' + s.options.join('|') + ']');
      else if (s.type === 'number') vpnParts.push(s.key + '=숫자');
    });
    lines.push('# VPN Gateway | SKU=게이트웨이 SKU(예: VpnGw1) | Options: ' + vpnParts.join('; '));
  }

  if (typeof REGION_LABEL !== 'undefined') {
    lines.push('# Region 코드: ' + Object.keys(REGION_LABEL).join(', '));
  }
  return lines;
}

function _csvDownloadTemplate() {
  var lines = [];
  lines.push(_csvRowToLine(CSV_HEADER));
  lines.push(_csvRowToLine(['koreacentral', 'Web 서버', 'Virtual Machine', 'D4s_v5', '2', '730', 'os=Windows; tier=Standard; license=라이선스 포함; series=D-series v5; swType=(OS Only)']));
  lines.push(_csvRowToLine(['koreacentral', 'DB 디스크', 'Disk', 'P30', '1', '730', 'diskSubType=프리미엄 SSD; redundancy=LRS; snapshotGB=0']));
  lines.push(_csvRowToLine(['koreacentral', '로그 디스크', 'Disk', '', '1', '730', 'diskSubType=Ultra Disk; diskSizeGiB=1024; provisionedIOPS=2000; provisionedMBps=200']));
  lines.push(_csvRowToLine(['koreacentral', '본사 VPN', 'VPN Gateway', 'VpnGw1', '1', '730', 'gatewayHours=730; vnetTransferType=VNET 간; vnetGB=0']));
  lines.push('');
  _csvBuildOptionGuide().forEach(function (l) { lines.push(l); });

  var csv = lines.join('\n');
  var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'azure-quote-template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _csvParseOptions(str) {
  var o = {};
  if (!str) return o;
  String(str).split(';').forEach(function (part) {
    var p = part.trim();
    if (!p) return;
    var eq = p.indexOf('=');
    if (eq < 0) return;
    var k = p.slice(0, eq).trim();
    var v = p.slice(eq + 1).trim();
    if (k) o[k] = v;
  });
  return o;
}

function _csvNormalizeRegion(v) {
  var s = String(v || '').trim();
  if (!s) return '';
  if (typeof REGION_LABEL === 'undefined') return s;
  if (REGION_LABEL[s]) return s;
  var low = s.toLowerCase();
  for (var code in REGION_LABEL) {
    if (REGION_LABEL[code].toLowerCase() === low) return code;
  }
  return '';
}

async function _csvHandleUpload(file) {
  var text;
  try { text = await file.text(); }
  catch (e) { alert('파일을 읽지 못했습니다: ' + e.message); return; }

  var aoa;
  try {
    var wb = XLSX.read(text, { type: 'string' });
    var ws = wb.Sheets[wb.SheetNames[0]];
    aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false });
  } catch (e) { alert('CSV 해석에 실패했습니다: ' + e.message); return; }

  var headerIdx = -1;
  for (var i = 0; i < aoa.length; i++) {
    var first = String((aoa[i] && aoa[i][0]) || '').trim().toLowerCase();
    if (first === 'region') { headerIdx = i; break; }
  }
  if (headerIdx < 0) { alert('헤더 행(Region, 분류, ServiceCategory, SKU, Qty, Hours, Options)을 찾지 못했습니다.'); return; }

  var dataRows = [];
  for (var r = headerIdx + 1; r < aoa.length; r++) {
    var rowArr = aoa[r] || [];
    var c0 = String(rowArr[0] || '').trim();
    if (!c0) continue;
    if (c0.charAt(0) === '#') continue;
    dataRows.push(rowArr);
  }
  if (dataRows.length === 0) { alert('불러올 데이터 행이 없습니다.'); return; }

  var replace = true;
  var hasExisting = rows.some(function (r) { return r.serviceCategory || r.skuName || (r.options && Object.keys(r.options).length > 0); });
  if (hasExisting) {
    replace = confirm('기존 행을 모두 비우고 불러올까요?\n확인 = 교체, 취소 = 기존 행 뒤에 추가');
  }
  if (replace) { rows = []; activeConfigRowId = null; closeConfig(); }

  var created = 0, skippedCat = 0, skippedRegion = 0;
  var newRows = [];
  dataRows.forEach(function (arr) {
    var region = _csvNormalizeRegion(arr[0]);
    var category = String(arr[1] || '').trim();
    var serviceCategory = String(arr[2] || '').trim();
    var sku = String(arr[3] || '').trim();
    var qty = Number(arr[4]); if (!isFinite(qty) || qty <= 0) qty = 1;
    var hours = Number(arr[5]); if (!isFinite(hours) || hours <= 0) hours = 730;
    var opts = _csvParseOptions(arr[6]);

    if (CSV_SUPPORTED_CATEGORIES.indexOf(serviceCategory) < 0) { skippedCat++; return; }
    if (!region) { skippedRegion++; return; }

    var row = blankRow();
    row.region = region;
    row.category = category;
    row.serviceCategory = serviceCategory;
    row.qty = qty;
    row.usage = hours;
    row.options = opts;
    var skuKey = CSV_SKU_OPTION_KEY[serviceCategory];
    if (sku && skuKey) row.options[skuKey] = sku;
    newRows.push(row);
    created++;
  });

  rows = rows.concat(newRows);
  render();

  setStatus('loading', 'CSV 불러오기: 가격 조회 중... (0/' + newRows.length + ')');
  var done = 0;
  for (var k = 0; k < newRows.length; k++) {
    var rr = newRows[k];
    buildSkuAndDetail(rr);
    try { await tryResolveItem(rr); } catch (e) { /* 개별 행 실패는 각 resolver가 상태로 처리 */ }
    done++;
    setStatus('loading', 'CSV 불러오기: 가격 조회 중... (' + done + '/' + newRows.length + ')');
  }
  render();

  var msg = 'CSV 불러오기 완료: ' + created + '행 생성';
  if (skippedCat > 0) msg += ', 미지원 서비스 ' + skippedCat + '행 제외';
  if (skippedRegion > 0) msg += ', 미지원 Region ' + skippedRegion + '행 제외';
  setStatus('ok', msg);
  alert(msg + '\n(1차 지원 서비스: ' + CSV_SUPPORTED_CATEGORIES.join(', ') + ')');
}

document.getElementById('btnCsvTemplate').addEventListener('click', _csvDownloadTemplate);
document.getElementById('btnCsvImport').addEventListener('click', function () { document.getElementById('fileCsvImport').click(); });
document.getElementById('fileCsvImport').addEventListener('change', function (e) {
  var f = e.target.files && e.target.files[0];
  if (f) _csvHandleUpload(f);
  e.target.value = '';
});
