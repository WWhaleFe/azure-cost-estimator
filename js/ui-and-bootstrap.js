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

// Service Category 목록 순서 정의 (등록 순 대신 직접 지정)
const SERVICE_CATEGORY_ORDER = [
  'Virtual Machine',
  'Disk',
  'Azure Files',
  'Blob Storage',
  'VPN Gateway',
  'Load Balancer',
  'Application Gateway',
  'Public IP',
  'Azure Firewall',
  'Bandwidth',
  'NAT Gateway',
  'Azure SQL Database',
  'Azure Database for MySQL',
  'App Service',
  'Azure Bastion',
];

function render(){
  $body.innerHTML='';
  let totals={paygM:0,paygY:0,sp1M:0,sp1Y:0,sp3M:0,sp3Y:0,ri1M:0,ri1Y:0,ri3M:0,ri3Y:0};
  rows.forEach((row,idx)=>{
    const tr=document.createElement('tr');tr.dataset.id=row.id;tr.draggable=false;
    const qty=Number(row.qty)||0,usage=Number(row.usage)||0;
    const payg=calcGroup(row.paygItem,qty,usage),sp1=calcGroup(row.sp1Item,qty,usage),sp3=calcGroup(row.sp3Item,qty,usage),ri1=calcGroup(row.ri1Item,qty,usage),ri3=calcGroup(row.ri3Item,qty,usage);
    if(payg){totals.paygM+=payg.monthly;totals.paygY+=payg.year;}
    if(sp1){totals.sp1M+=sp1.monthly;totals.sp1Y+=sp1.year;}
    if(sp3){totals.sp3M+=sp3.monthly;totals.sp3Y+=sp3.year;}
    if(ri1){totals.ri1M+=ri1.monthly;totals.ri1Y+=ri1.year;}
    if(ri3){totals.ri3M+=ri3.monthly;totals.ri3Y+=ri3.year;}

    // SKU 표시: Disk 프로비저닝은 GiB로, 나머지는 skuName
    const isDiskProv = row.serviceCategory==='Disk' &&
      (row.options.diskSubType==='프리미엄 SSD v2'||row.options.diskSubType==='Ultra Disk');
    const skuDisplay = isDiskProv
      ? (row.options.diskSizeGiB ? `${row.options.diskSizeGiB}GiB` : '')
      : escapeHtml(row.skuName);

    // Service Category: 일반 <select>
    const catOptions = SERVICE_CATEGORY_ORDER.filter(c=>SERVICE_CATEGORIES[c])
      .map(c=>`<option value="${escapeHtml(c)}" ${row.serviceCategory===c?'selected':''}>${escapeHtml(c)}</option>`).join('');
    const catCell = `<td><select class="cell-input cell-select" data-act="cat-select" data-id="${row.id}">
      <option value="">선택...</option>${catOptions}</select></td>`;

    // Region: 일반 <select>
    const regionOptions = Object.entries(REGION_LABEL)
      .map(([code,lbl])=>`<option value="${code}" ${row.region===code?'selected':''}>${escapeHtml(lbl)}</option>`).join('');
    const regionCell = `<td><select class="cell-input cell-select" data-act="region-select" data-id="${row.id}">${regionOptions}</select></td>`;

    tr.innerHTML=`
      <td class="cell-drag" data-act="drag-handle" title="드래그해서 순서 변경">⋮⋮</td>
      <td class="cell-readonly text-center">${idx+1}</td>
      ${regionCell}
      <td><input type="text" class="cell-input text-left" data-act="freetext" data-id="${row.id}" data-field="category" placeholder="예: Web/WAS Server" value="${escapeHtml(row.category)}" /></td>
      ${catCell}
      <td><input type="text" class="cell-input text-left" data-act="open-config" data-id="${row.id}" ${!row.serviceCategory?'disabled style="background:#f3f2f1;color:#a19f9d;cursor:not-allowed;"':''} placeholder="${row.serviceCategory?'클릭하여 옵션 선택...':''}" value="${skuDisplay}" readonly /></td>
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
    if(!data){tds[base].className='cell-readonly';tds[base].textContent='';tds[base+1].className='cell-readonly';tds[base+1].textContent='';tds[base+2].className='cell-readonly';tds[base+2].textContent='';}
    else{tds[base].className='cell-readonly cell-ok';tds[base].textContent=fmtUnit(data.unit);tds[base+1].className='cell-readonly cell-ok';tds[base+1].textContent=fmtMoney(data.monthly);tds[base+2].className='cell-readonly cell-ok';tds[base+2].textContent=fmtMoney(data.year);}
  });
}
function updateTotalsRow(){
  let totals={paygM:0,paygY:0,sp1M:0,sp1Y:0,sp3M:0,sp3Y:0,ri1M:0,ri1Y:0,ri3M:0,ri3Y:0};
  rows.forEach(row=>{const qty=Number(row.qty)||0,usage=Number(row.usage)||0;const add=(item,mK,yK)=>{const d=calcGroup(item,qty,usage);if(d){totals[mK]+=d.monthly;totals[yK]+=d.year;}};add(row.paygItem,'paygM','paygY');add(row.sp1Item,'sp1M','sp1Y');add(row.sp3Item,'sp3M','sp3Y');add(row.ri1Item,'ri1M','ri1Y');add(row.ri3Item,'ri3M','ri3Y');});
  const totalRow=$foot.querySelector('tr.total-row');if(!totalRow)return;
  const tds=totalRow.querySelectorAll('td');
  const map=[null,'paygM','paygY',null,'sp1M','sp1Y',null,'sp3M','sp3Y',null,'ri1M','ri1Y',null,'ri3M','ri3Y'];
  for(let i=0;i<map.length;i++){const td=tds[i+1];if(!td)continue;if(map[i]===null)td.textContent='-';else td.textContent=fmtMoney(totals[map[i]]);}
}

// 이벤트 위임: 일반 input/select
function resetRow(r){
  r.skuName='';r.detail='';r.options={};
  r.paygItem=null;r.sp1Item=null;r.sp3Item=null;r.ri1Item=null;r.ri3Item=null;
}

$body.addEventListener('change',(e)=>{
  const t=e.target,id=Number(t.dataset.id),r=rows.find(x=>x.id===id);if(!r)return;
  if(t.dataset.act==='region-select'){
    r.region=t.value;
    if(r.skuName||r.options.diskSubType)tryResolveItem(r);
    return;
  }
  if(t.dataset.act==='cat-select'){
    resetRow(r);
    r.serviceCategory=t.value;
    render();
    if(r.serviceCategory) openConfig(r.id);
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
$body.addEventListener('click',(e)=>{
  const t=e.target;
  if(t.dataset.act==='dup') duplicateRow(Number(t.dataset.id));
  else if(t.dataset.act==='del') removeRow(Number(t.dataset.id));
  else if(t.dataset.act==='config'||t.dataset.act==='open-config') openConfig(Number(t.dataset.id));
});

document.getElementById('btnAddRow').addEventListener('click',addRow);
document.getElementById('currencySelect').addEventListener('change',async(e)=>{
  const prev=e.target._prevValue||'KRW';clearCacheForCurrency(prev);e.target._prevValue=e.target.value;
  for(const r of rows){r.paygItem=null;r.sp1Item=null;r.sp3Item=null;r.ri1Item=null;r.ri3Item=null;}
  render();
  for(const r of rows){
    const hasSku = r.skuName||(r.serviceCategory==='Disk'&&r.options.diskSubType);
    if(hasSku)await tryResolveItem(r);
  }
});
document.getElementById('currencySelect')._prevValue=document.getElementById('currencySelect').value;
document.getElementById('defaultHours').addEventListener('change',(e)=>{
  const v=Number(e.target.value)||730;
  rows.forEach(r=>{r.usage=v;});
  rows.forEach(r=>{updatePriceCells(r);});
  updateTotalsRow();
  render();
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
document.addEventListener('mousedown',async(e)=>{
  if(!$configPanel.classList.contains('active')||!configDirty)return;
  if(e.target.closest('#configPanel')||e.target.closest('[data-act="config"]')||e.target.closest('[data-act="open-config"]'))return;
  await applyConfig();
});
function openConfig(rowId){
  const r=rows.find(x=>x.id===rowId);if(!r||!r.serviceCategory)return;
  if(activeConfigRowId!==null&&activeConfigRowId!==rowId&&configDirty){applyConfig().finally(()=>{activeConfigRowId=rowId;$configPanel.classList.add('active');renderConfigPanel();});return;}
  activeConfigRowId=rowId;$configPanel.classList.add('active');renderConfigPanel();
}
function closeConfig(){activeConfigRowId=null;$configPanel.classList.remove('active');configDirty=false;const $b=document.getElementById('configDirtyBadge');if($b)$b.style.display='none';}

// ================================================================
// renderConfigPanel — 단일 'Disk' 카테고리 + diskSubType 동적 표시
// ================================================================
function renderConfigPanel(){
  const r=rows.find(x=>x.id===activeConfigRowId);if(!r){closeConfig();return;}
  const def=SERVICE_CATEGORIES[r.serviceCategory];if(!def){closeConfig();return;}
  $configTitle.textContent=`${r.serviceCategory} 옵션 (행 #${rows.findIndex(x=>x.id===r.id)+1})`;

  if(r.serviceCategory==='Disk'){
    _renderDiskConfigPanel(r);
    return;
  }

  // 일반 카테고리
  const allSteps = def.steps.filter(s=>!s._hidden);
  const renderStep = _makeStepRenderer();
  let instanceHtml='';
  if(def.instanceField){
    let instanceOptions=[];
    if(r.serviceCategory==='Virtual Machine'){
      const series=r.options.series;
      if(series&&VM_INSTANCE_CATALOG[series])instanceOptions=VM_INSTANCE_CATALOG[series].map(i=>({value:i.name,label:`${i.name} (vCPU:${i.vCPU} RAM:${i.ram}GB)`}));
    }
    const sel=r.options.instance||r.skuName||'';
    instanceHtml=`<div class="config-field" style="grid-column:1/-1;"><label>인스턴스</label><select data-opt-key="instance" ${instanceOptions.length===0?'disabled':''}><option value="">${instanceOptions.length===0?'상위 옵션을 먼저 선택하세요':'선택...'}</option>${instanceOptions.map(o=>`<option value="${escapeHtml(o.value)}" ${sel===o.value?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
  }
  $configContent.innerHTML=allSteps.map(renderStep).join('')+instanceHtml;
  _bindConfigEvents(r, def);
}

// 디스크 전용 옵션 패널 렌더
function _renderDiskConfigPanel(r) {
  const o = r.options;
  const sub = DISK_SUBTYPE_MAP[o.diskSubType];
  const html = [];

  // 1. 디스크 종류 선택
  const subtypeOptions = Object.keys(DISK_SUBTYPE_MAP)
    .map(k=>`<option value="${escapeHtml(k)}" ${o.diskSubType===k?'selected':''}>${escapeHtml(k)}</option>`).join('');
  html.push(`<div class="config-field"><label>디스크 종류</label><select data-opt-key="diskSubType"><option value="">선택...</option>${subtypeOptions}</select></div>`);

  if (!sub) {
    $configContent.innerHTML=html.join('');
    _bindDiskConfigEvents(r);
    return;
  }

  if (sub.isProvisioned) {
    // --- Premium SSD v2 / Ultra Disk ---
    if (sub.diskType === 'ultra') {
      // Ultra: 고정 목록
      const sizeOptions = ULTRA_DISK_SIZES.map(s=>`<option value="${s.gib}" ${Number(o.diskSizeGiB)===s.gib?'selected':''}>${escapeHtml(s.label)}</option>`).join('');
      html.push(`<div class="config-field"><label>디스크 크기</label><select data-opt-key="diskSizeGiB">${sizeOptions}</select></div>`);
    } else {
      // Premium SSD v2: GiB 직접입력 (1~65536)
      html.push(`<div class="config-field"><label>디스크 크기 (GiB)<span style="font-size:10px;color:#0078d4;cursor:help;" title="1 ~ 65,536 GiB. 스토리지 비용: GiB × 730h × 단가/GiB"> [?]</span></label><input type="number" data-opt-key="diskSizeGiB" data-opt-type="number" min="1" max="65536" step="1" value="${o.diskSizeGiB||1}" style="text-align:right;"/></div>`);
    }
    // IOPS
    const minIOPS = sub.diskType==='ultra' ? 100 : 3000;
    const freeLabel = sub.diskType==='premiumv2' ? ' (3,000 무료 포함)' : '';
    html.push(`<div class="config-field"><label>IOPS${freeLabel}<span style="font-size:10px;color:#0078d4;cursor:help;" title="${sub.diskType==='premiumv2'?'3,000 IOPS구방까지 무료, 초과분 유료':'IOPS 수 × 730h × 단가/IOPS/시간'"> [?]</span></label><input type="number" data-opt-key="provisionedIOPS" data-opt-type="number" min="${minIOPS}" step="100" value="${o.provisionedIOPS||minIOPS}" style="text-align:right;"/></div>`);
    // 처리량
    const minMBps = sub.diskType==='ultra' ? 1 : 125;
    const bwFreeLabel = sub.diskType==='premiumv2' ? ' (125 MB/s 무료 포함)' : '';
    html.push(`<div class="config-field"><label>처리량 MB/s${bwFreeLabel}<span style="font-size:10px;color:#0078d4;cursor:help;" title="${sub.diskType==='premiumv2'?'125 MB/s구방까지 무료, 초과분 유료':'MB/s × 730h × 단가/MB/s/시간'"> [?]</span></label><input type="number" data-opt-key="provisionedMBps" data-opt-type="number" min="${minMBps}" step="1" value="${o.provisionedMBps||minMBps}" style="text-align:right;"/></div>`);
  } else {
    // --- 표준 HDD / 표준 SSD / 프리미엄 SSD ---
    // 중복성 (표준 SSD, 프리미엄 SSD만)
    if (sub.hasRedundancy) {
      const redOptions = ['LRS','ZRS'].map(v=>`<option value="${v}" ${o.redundancy===v?'selected':''}>${v}</option>`).join('');
      html.push(`<div class="config-field"><label>중복성</label><select data-opt-key="redundancy"><option value="">선택...</option>${redOptions}</select></div>`);
    }

    // 디스크 크기 (SKU 목록)
    const catalog = DISK_CATALOG[sub.storageType]||[];
    const instOptions = catalog.map(d=>{
      const extra = d.iops ? `, ${d.iops.toLocaleString()} IOPS` : '';
      return `<option value="${d.name}" ${o.diskInstance===d.name?'selected':''}>${d.name} (${d.size}GB${extra})</option>`;
    }).join('');
    html.push(`<div class="config-field" style="grid-column:1/-1;"><label>디스크 크기 (SKU)</label><select data-opt-key="diskInstance"><option value="">선택...</option>${instOptions}</select></div>`);

    // 프리미엄 SSD 전용 옵션
    if (sub.diskType === 'premium') {
      const perfOpts = ['없음 (기본)','P4','P6','P10','P15','P20','P30','P40','P50','P60','P70','P80']
        .map(v=>`<option value="${v}" ${o.perfTier===v?'selected':''}>${v}</option>`).join('');
      html.push(`<div class="config-field"><label>성능 계층 업그레이드<span style="font-size:10px;color:#0078d4;cursor:help;" title="용량 유지하면서 성능만 상위 계층으로 업그레이드"> [?]</span></label><select data-opt-key="perfTier"><option value="">선택...</option>${perfOpts}</select></div>`);
      const savOpts = ['용량제 (기본)','1년 예약']
        .map(v=>`<option value="${v}" ${o.savingsOption===v?'selected':''}>${v}</option>`).join('');
      html.push(`<div class="config-field"><label>절약 옵션<span style="font-size:10px;color:#0078d4;cursor:help;" title="용량제: PAYG | 1년 예약: RI 1Y 적용
"> [?]</span></label><select data-opt-key="savingsOption"><option value="">선택...</option>${savOpts}</select></div>`);
    }

    // 트랜잭션 (HDD/SSD만)
    if (sub.diskType !== 'premium') {
      html.push(`<div class="config-field"><label>Storage 트랜잭션 (10,000단위, 월)</label><input type="number" data-opt-key="transactionUnits" data-opt-type="number" min="0" step="1" value="${o.transactionUnits||0}" style="text-align:right;"/></div>`);
    }

    // 스냅샷 (HDD/SSD/Premium 공통)
    html.push(`<div class="config-field"><label>스냅샷 (GB, 월)<span style="font-size:10px;color:#0078d4;cursor:help;" title="LRS 저장 GB × 단가/GB"> [?]</span></label><input type="number" data-opt-key="snapshotGB" data-opt-type="number" min="0" step="1" value="${o.snapshotGB||0}" style="text-align:right;"/></div>`);

    // Confidential OS Encryption (HDD/SSD/Premium 공통)
    const confOpts = ['비활성 (기본)','활성화'].map(v=>`<option value="${v}" ${o.confEncryptionEnabled===v?'selected':''}>${v}</option>`).join('');
    html.push(`<div class="config-field"><label>Confidential OS Encryption<span style="font-size:10px;color:#0078d4;cursor:help;" title="GiB × 730h × Per GiB 단가"> [?]</span></label><select data-opt-key="confEncryptionEnabled"><option value="">선택...</option>${confOpts}</select></div>`);

    // 디스크 버스팅 (Premium SSD만)
    if (sub.diskType === 'premium') {
      const burstOpts = ['비활성 (기본)','활성화 (P30 이상)'].map(v=>`<option value="${v}" ${o.burstingEnabled===v?'selected':''}>${v}</option>`).join('');
      html.push(`<div class="config-field"><label>디스크 버스팅<span style="font-size:10px;color:#0078d4;cursor:help;" title="P30 이상에서 사용 가능. 활성화 월정액 + 버스트 트랜잭션"> [?]</span></label><select data-opt-key="burstingEnabled"><option value="">선택...</option>${burstOpts}</select></div>`);
      if (o.burstingEnabled==='활성화 (P30 이상)') {
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
  const $dirtyBadge=document.getElementById('configDirtyBadge');
  const markDirty=()=>{configDirty=true;if($dirtyBadge)$dirtyBadge.style.display='';};
  const clearDirty=()=>{configDirty=false;if($dirtyBadge)$dirtyBadge.style.display='none';};
  clearDirty();

  $configContent.querySelectorAll('select[data-opt-key]').forEach(sel=>{
    sel.addEventListener('change',(e)=>{
      const key=e.target.dataset.optKey, val=e.target.value;
      r.options[key]=val;
      // diskSubType 변경 시 연관 옵션 초기화
      if(key==='diskSubType'){
        r.options={diskSubType:val};
        r.skuName='';r.detail='';
        r.paygItem=null;r.sp1Item=null;r.sp3Item=null;r.ri1Item=null;r.ri3Item=null;
      }
      // diskInstance 변경 시 skuName 동기화
      if(key==='diskInstance') r.skuName=val;
      // 버스팅 활성/비활성 시 관련 필드 초기화
      if(key==='burstingEnabled'&&val!=='활성화 (P30 이상)'){
        delete r.options.burstMaxIOPS; delete r.options.burstMaxThroughputMBs;
        delete r.options.burstMinsPerDay; delete r.options.burstWorkDaysPerMonth;
      }
      buildSkuAndDetail(r);render();
      // diskSubType, burstingEnabled 변경은 패널 재렌더 필요
      if(key==='diskSubType'||key==='burstingEnabled') renderConfigPanel();
      markDirty();
    });
  });
  $configContent.querySelectorAll('input[data-opt-type="number"]').forEach(inp=>{
    inp.addEventListener('input',(e)=>{
      const key=e.target.dataset.optKey, raw=e.target.value;
      r.options[key]=(raw===''?0:Number(raw));
      buildSkuAndDetail(r);render();markDirty();
    });
  });
}

// 일반 옵션 패널 렌더 헬퍼
function _makeStepRenderer() {
  return function(step){
    const tooltip=step.tooltip?`title="${escapeHtml(step.tooltip)}"`:''
    if(step.type==='number'){
      const cur=(step.default!==undefined?step.default:0);
      return`<div class="config-field"><label ${tooltip}>${escapeHtml(step.label)}${step.tooltip?' <span style="font-size:10px;color:#0078d4;cursor:help;">[?]</span>':''}</label><input type="number" data-opt-key="${step.key}" data-opt-type="number" min="${step.min!==undefined?step.min:0}" step="${step.step!==undefined?step.step:1}" value="${cur}" style="text-align:right;"/></div>`;
    }
    return`<div class="config-field"><label ${tooltip}>${escapeHtml(step.label)}${step.tooltip?' <span style="font-size:10px;color:#0078d4;cursor:help;">[?]</span>':''}</label><select data-opt-key="${step.key}"><option value="">선택...</option>${step.options.map(opt=>`<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}</select></div>`;
  };
}

function _bindConfigEvents(r, def){
  const $dirtyBadge=document.getElementById('configDirtyBadge');
  const markDirty=()=>{configDirty=true;if($dirtyBadge)$dirtyBadge.style.display='';};
  const clearDirty=()=>{configDirty=false;if($dirtyBadge)$dirtyBadge.style.display='none';};
  clearDirty();
  const KEYS_REBUILD=[def.instanceParentKey].filter(Boolean);
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
const EXPORT_GROUPS = [
  { key:'payg', label:'용량제 (PAYG)',   itemKey:'paygItem', color:'2E75B6', totMKey:'paygM', totYKey:'paygY' },
  { key:'sp1',  label:'절약 플랜 1년', itemKey:'sp1Item',  color:'70AD47', totMKey:'sp1M',  totYKey:'sp1Y' },
  { key:'sp3',  label:'절약 플랜 3년', itemKey:'sp3Item',  color:'548235', totMKey:'sp3M',  totYKey:'sp3Y' },
  { key:'ri1',  label:'예약 1년',     itemKey:'ri1Item',  color:'C55A11', totMKey:'ri1M',  totYKey:'ri1Y' },
  { key:'ri3',  label:'예약 3년',     itemKey:'ri3Item',  color:'843C0C', totMKey:'ri3M',  totYKey:'ri3Y' },
];
function getEnabledGroups(){return EXPORT_GROUPS.filter(g=>{const chk=document.getElementById(`chk-group-${g.key}`);return !chk||chk.checked;});}

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
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Azure 곬적');
  XLSX.writeFile(wb,`azure-quote-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.xlsx`);
});

addRow();addRow();addRow();
setStatus('ok','준비 완료');
bootDiagnostics();
