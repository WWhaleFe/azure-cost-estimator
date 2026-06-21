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
function priceCells(data,hasItem,isManual){
  if(!hasItem||!data)return`<td class="cell-readonly"></td><td class="cell-readonly"></td><td class="cell-readonly"></td>`;
  const cls=isManual?'cell-readonly cell-ok cell-fill':'cell-readonly cell-ok';
  return`<td class="${cls}">${fmtUnit(data.unit)}</td><td class="${cls}">${fmtMoney(data.monthly)}</td><td class="${cls}">${fmtMoney(data.year)}</td>`;
}

const SERVICE_CATEGORY_ORDER = [
  'Virtual Machine','Azure Kubernetes Service','Disk','Azure Files','Blob Storage','Backup',
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
      ${priceCells(payg,!!row.paygItem,!!(row.paygItem&&row.paygItem._manualFill))}
      ${priceCells(sp1,!!row.sp1Item,!!(row.sp1Item&&row.sp1Item._manualFill))}
      ${priceCells(sp3,!!row.sp3Item,!!(row.sp3Item&&row.sp3Item._manualFill))}
      ${priceCells(ri1,!!row.ri1Item,!!(row.ri1Item&&row.ri1Item._manualFill))}
      ${priceCells(ri3,!!row.ri3Item,!!(row.ri3Item&&row.ri3Item._manualFill))}
      <td class="text-center whitespace-nowrap" style="background:#f8fbff;">
        <button class="row-action-btn" data-act="fill-empty" data-id="${row.id}" title="빈 절약/예약 칸을 용량제 값으로 채우기 (셀 더블클릭으로 개별 토글)">⊕</button>
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
      const cls=(item&&item._manualFill)?'cell-readonly cell-ok cell-fill':'cell-readonly cell-ok';
      tds[base].className=cls;tds[base].textContent=fmtUnit(data.unit);
      tds[base+1].className=cls;tds[base+1].textContent=fmtMoney(data.monthly);
      tds[base+2].className=cls;tds[base+2].textContent=fmtMoney(data.year);
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
// 빈 절약/예약 그룹에 용량제(PAYG) 값 채우기 / 더블클릭 토글 (수동 채움)
//   - 대상은 절약 1·3년, 예약 1·3년 4개 그룹뿐 (용량제는 원본이라 제외)
//   - 채운 항목에는 _manualFill 표시를 달아 원본 API 값과 구분
//   - 원래 API로 값이 들어온 그룹(및 용량제)은 어떤 동작에도 건드리지 않음 → 보호
// ================================================================
var FILLABLE_GROUPS = [
  { key: 'sp1', itemKey: 'sp1Item', tdBase: 12 },
  { key: 'sp3', itemKey: 'sp3Item', tdBase: 15 },
  { key: 'ri1', itemKey: 'ri1Item', tdBase: 18 },
  { key: 'ri3', itemKey: 'ri3Item', tdBase: 21 },
];
function _makeManualFromPayg(payg) {
  if (!payg) return null;
  var copy = Object.assign({}, payg);
  copy._manualFill = true;
  return copy;
}
function _fillEmptyGroups(rowId) {
  var r = rows.find(function (x) { return x.id === rowId; });
  if (!r) return;
  if (!r.paygItem) { setStatus('error', '용량제 값이 없어 채울 수 없습니다.'); return; }
  var filled = 0;
  FILLABLE_GROUPS.forEach(function (g) {
    if (!r[g.itemKey]) { r[g.itemKey] = _makeManualFromPayg(r.paygItem); filled++; }
  });
  render();
  var idx = rows.findIndex(function (x) { return x.id === rowId; }) + 1;
  if (filled > 0) setStatus('ok', '행 #' + idx + ': 빈 칸 ' + filled + '개 그룹을 용량제 값으로 채움(수동)');
  else setStatus('ok', '행 #' + idx + ': 채울 빈 칸이 없습니다(이미 값이 있음).');
}
function _toggleGroupFill(rowId, groupKey) {
  var r = rows.find(function (x) { return x.id === rowId; });
  if (!r) return;
  var g = FILLABLE_GROUPS.find(function (x) { return x.key === groupKey; });
  if (!g) return;
  var cur = r[g.itemKey];
  if (cur && !cur._manualFill) return;          // 원본 API 값 → 보호(토글 금지)
  if (cur && cur._manualFill) {
    r[g.itemKey] = null;                         // 채움 → 빈칸
  } else {
    if (!r.paygItem) { setStatus('error', '용량제 값이 없어 채울 수 없습니다.'); return; }
    r[g.itemKey] = _makeManualFromPayg(r.paygItem); // 빈칸 → 채움
  }
  render();
}

// 모든 행 일괄 처리 — 빈 절약/예약 칸을 용량제 값으로 채우기
//   용량제가 있는 행만 대상. 원본 API 값이 있는 그룹은 건드리지 않음(빈 그룹에만 채움).
function _fillAllEmptyGroups() {
  var filledRows = 0, filledGroups = 0, noPaygRows = 0;
  rows.forEach(function (r) {
    if (!r.paygItem) { if (r.serviceCategory) noPaygRows++; return; }
    var any = 0;
    FILLABLE_GROUPS.forEach(function (g) {
      if (!r[g.itemKey]) { r[g.itemKey] = _makeManualFromPayg(r.paygItem); filledGroups++; any++; }
    });
    if (any) filledRows++;
  });
  render();
  var msg = '전체 채우기: ' + filledRows + '개 행, ' + filledGroups + '개 그룹을 용량제 값으로 채움(수동)';
  if (noPaygRows > 0) msg += ' · 용량제 없는 ' + noPaygRows + '개 행 제외';
  if (filledGroups === 0) msg = '전체 채우기: 채울 빈 칸이 없습니다(이미 값이 있거나 용량제 없음).';
  setStatus('ok', msg);
}

// 모든 행 일괄 처리 — 수동으로 채운 절약/예약 값만 비우기
//   _manualFill 표시가 달린 값만 제거. 용량제와 원본 API 값은 그대로 보존.
function _clearAllManualFills() {
  var clearedGroups = 0, clearedRows = 0;
  rows.forEach(function (r) {
    var any = 0;
    FILLABLE_GROUPS.forEach(function (g) {
      var cur = r[g.itemKey];
      if (cur && cur._manualFill) { r[g.itemKey] = null; clearedGroups++; any++; }
    });
    if (any) clearedRows++;
  });
  render();
  if (clearedGroups === 0) setStatus('ok', '전체 지우기: 지울 수동 입력 값이 없습니다.');
  else setStatus('ok', '전체 지우기: ' + clearedRows + '개 행, ' + clearedGroups + '개 그룹의 수동 입력 값을 지움(원본 값은 유지)');
}

// 가격 셀 더블클릭 → 그룹 단위 토글 (절약/예약 4개 그룹만, 용량제 제외)
$body.addEventListener('dblclick', function (e) {
  var td = e.target.closest('td');
  if (!td) return;
  var tr = td.closest('tr');
  if (!tr || !tr.dataset.id) return;
  var ci = td.cellIndex;
  var grp = null;
  if (ci >= 12 && ci <= 14) grp = 'sp1';
  else if (ci >= 15 && ci <= 17) grp = 'sp3';
  else if (ci >= 18 && ci <= 20) grp = 'ri1';
  else if (ci >= 21 && ci <= 23) grp = 'ri3';
  if (!grp) return;
  _toggleGroupFill(Number(tr.dataset.id), grp);
});

// ================================================================
// 이벤트 위임
// ================================================================
function _resetRow(r){
  r.skuName='';r.detail='';r.options={};
  r.paygItem=null;r.sp1Item=null;r.sp3Item=null;r.ri1Item=null;r.ri3Item=null;
}

$body.addEventListener('click', async (e)=>{
  const t = e.target;
  if(t.dataset.act==='fill-empty'){_fillEmptyGroups(Number(t.dataset.id));return;}
  if(t.dataset.act==='dup'){duplicateRow(Number(t.dataset.id));return;}
  if(t.dataset.act==='del'){removeRow(Number(t.dataset.id));return;}
  if(t.dataset.act==='drag-handle')return;
  if(t.tagName==='SELECT'||t.tagName==='OPTION')return;
  if(t.dataset.act==='num'||t.dataset.act==='freetext')return;
  const _ptd=t.closest('td');
  if(_ptd&&_ptd.cellIndex>=9&&_ptd.cellIndex<=23)return; // 가격 셀 클릭은 옵션 패널을 열지 않음(더블클릭 토글용)
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
document.getElementById('btnFillAll').addEventListener('click',_fillAllEmptyGroups);
document.getElementById('btnClearAll').addEventListener('click',_clearAllManualFills);
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
  if(typeof def._applyStepVisibility==='function')def._applyStepVisibility(r);
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

function setStatus(kind,msg){const cls=kind==='ok'?'badge badge-ok':kind==='error'?'badge badge-error':'badge badge-loading';$apiStatus.innerHTML=`<span class="${cls}">${escapeHtml(msg)}</span>`;if(kind==='error')showToast(msg,'error');}

// 화면 상단 중앙에 잠깐 떴다 사라지는 알림 (특히 경고가 눈에 잘 띄도록)
function showToast(msg,kind){
  kind=kind||'info';
  var wrap=document.getElementById('toastWrap');
  if(!wrap){wrap=document.createElement('div');wrap.id='toastWrap';wrap.className='toast-wrap';document.body.appendChild(wrap);}
  var t=document.createElement('div');t.className='toast toast-'+kind;t.textContent=msg;
  wrap.appendChild(t);
  requestAnimationFrame(function(){t.classList.add('show');});
  var dur=kind==='error'?6000:3500;
  setTimeout(function(){t.classList.remove('show');setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},250);},dur);
}

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

document.getElementById('btnExport').addEventListener('click',async ()=>{
  const cur=document.getElementById('currencySelect').value;
  const enabledGroups=getEnabledGroups();
  if(enabledGroups.length===0){alert('엑셀로 출력할 가격 그룹을 하나 이상 선택하세요.');return;}
  const data=[];
  data.push(['Azure 견적 시뮬레이션']);
  data.push([`통화: ${cur} | 출력: ${enabledGroups.map(g=>g.label).join(', ')} | 생성: ${new Date().toLocaleString('ko-KR')}`]);
  data.push([]);
  const bH=['#','Region','분류','Service Category','Service name (SKU)','상세 사양','Qty','사용량(Hours)'];
  const gHdr=[...bH],gCol=[...bH];
  enabledGroups.forEach(g=>{gHdr.push(g.label,'','');gCol.push('Unit Price','1 Monthly Cost','1 Year Cost');});
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
  const base='azure-quote-'+new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const xlsxOut=XLSX.write(wb,{bookType:'xlsx',type:'array'});
  const xlsxBlob=new Blob([xlsxOut],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const csvBlob=new Blob(['\ufeff'+_csvExportCurrentRows()],{type:'text/csv;charset=utf-8;'});
  await _exportSaveFiles(base,xlsxBlob,csvBlob);
});

addRow();addRow();addRow();
setStatus('ok','준비 완료');
bootDiagnostics();

// ================================================================
// CSV 양식 다운로드 / 업로드 (v46, v63에서 전 서비스로 확장)
// 지원: 전체 서비스 카테고리(SERVICE_CATEGORY_ORDER 전부). 양식 다운로드는 서비스마다
//       예시 행을 1개 이상 포함하고, 옵션 사전(# 주석)으로 각 서비스의 옵션을 안내한다.
// SKU 열 매핑: 인스턴스/단일 SKU가 있는 서비스만 SKU 열로 받고, 나머지는 Options로 지정
//   (VM=instance, Disk=diskInstance, VPN=sku, App Service=size,
//    Azure Database for MySQL=compute, Application Gateway=sku, Public IP=sku)
//   ※ 모든 서비스가 _buildDetail_*에서 options로 skuName을 구성하므로, SKU 열이 없는
//      서비스는 Options만으로 식별된다. 가격 매칭 정확도는 각 서비스 resolver 수준을 따른다
//      (A 그룹=라이브 검증, 일부 제네릭 서비스는 매칭이 취약할 수 있음 — service-status.csv 참고).
// ================================================================
var CSV_SUPPORTED_CATEGORIES = (typeof SERVICE_CATEGORY_ORDER !== 'undefined')
  ? SERVICE_CATEGORY_ORDER.slice()
  : ['Virtual Machine', 'Disk', 'VPN Gateway'];
var CSV_SKU_OPTION_KEY = {
  'Virtual Machine': 'instance', 'Disk': 'diskInstance', 'VPN Gateway': 'sku',
  'App Service': 'size', 'Azure Database for MySQL': 'compute',
  'Application Gateway': 'sku', 'Public IP': 'sku',
};
var CSV_HEADER = ['Region', '분류', 'ServiceCategory', 'SKU', 'Qty', 'Hours', 'Options'];

function _csvEscapeField(v) {
  var s = (v === null || v === undefined) ? '' : String(v);
  if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function _csvRowToLine(arr) { return arr.map(_csvEscapeField).join(','); }

// 각 서비스의 SKU 열 의미(인스턴스/단일 SKU가 있는 서비스만)
var CSV_SKU_DESC = {
  'Virtual Machine': '인스턴스(예 D4s_v5, 선택 series에 속해야 함)',
  'Disk': '디스크 크기 SKU(예 P30; 프로비저닝형은 비움)',
  'VPN Gateway': '게이트웨이 SKU(예 VpnGw1)',
  'App Service': '인스턴스(예 P1V3)',
  'Azure Database for MySQL': 'vCore SKU(예 D2ds_v4)',
  'Application Gateway': 'SKU(예 Standard_v2)',
  'Public IP': 'SKU(예 Standard)',
};

// 양식에 넣을 서비스별 예시 행([Region, 분류(메모), ServiceCategory, SKU, Qty, Hours, Options])
// SERVICE_CATEGORY_ORDER 순서를 따르며, 복합 서비스(Disk/Backup)는 예시를 2개 둔다.
function _csvBuildExampleRows() {
  return [
    ['koreacentral', '웹 서버',              'Virtual Machine',            'D4s_v5',       '2', '730',  'os=Linux; swType=(OS Only); tier=Standard; license=라이선스 포함; series=D-series v5'],
    ['koreacentral', 'AKS 클러스터 관리',     'Azure Kubernetes Service',   '',             '1', '730',  'aksTier=Standard (표준); slaOption=SLA'],
    ['koreacentral', 'DB 디스크(용량형)',     'Disk',                       'P30',          '1', '730',  'diskSubType=프리미엄 SSD; redundancy=LRS; snapshotGB=0'],
    ['koreacentral', '로그 디스크(프로비저닝)', 'Disk',                     '',             '1', '730',  'diskSubType=Ultra Disk; diskSizeGiB=1024; provisionedIOPS=2000; provisionedMBps=200'],
    ['koreacentral', '파일 공유',            'Azure Files',                '',             '1', '100',  'fileTier=Hot; redundancy=LRS; metric=Data Stored'],
    ['koreacentral', '오브젝트 스토리지',     'Blob Storage',               '',             '1', '1000', 'blobTier=Hot; redundancy=LRS; metric=Data Stored'],
    ['koreacentral', '백업-보호 인스턴스',    'Backup',                     '',             '1', '1',    'metric=보호 인스턴스; workload=Azure VM'],
    ['koreacentral', '백업-저장소',          'Backup',                     '',             '1', '500',  'metric=백업 저장소; storageTier=Standard; redundancy=LRS'],
    ['koreacentral', '본사 VPN',            'VPN Gateway',                'VpnGw1',       '1', '730',  'gatewayHours=730; vnetTransferType=VNET 간; vnetGB=0'],
    ['koreacentral', '부하 분산',            'Load Balancer',              '',             '1', '730',  'tier=Standard; metric=Rules'],
    ['koreacentral', '앱 게이트웨이',         'Application Gateway',         'Standard_v2',  '1', '730',  'metric=고정 비용 (시간당)'],
    ['koreacentral', '공인 IP',             'Public IP',                  'Standard',     '1', '730',  'ipType=Static'],
    ['koreacentral', '방화벽',              'Azure Firewall',             '',             '1', '730',  'tier=Standard; metric=Deployment'],
    ['koreacentral', '아웃바운드 전송',       'Bandwidth',                  '',             '1', '1000', 'direction=Outbound (Internet Egress)'],
    ['koreacentral', 'NAT 게이트웨이',        'NAT Gateway',                '',             '1', '730',  'metric=Resource Hour'],
    ['koreacentral', 'SQL Database',        'Azure SQL Database',         '',             '1', '730',  'tier=General Purpose; compute=Provisioned; hardware=Gen5'],
    ['koreacentral', 'MySQL',              'Azure Database for MySQL',   'D2ds_v4',      '1', '730',  'tier=General Purpose'],
    ['koreacentral', '앱 서비스',            'App Service',                'P1V3',         '1', '730',  'tier=Premium v3; os=Linux'],
    ['koreacentral', 'Bastion',            'Azure Bastion',              '',             '1', '730',  'tier=Basic; metric=게이트웨이(시간당)'],
  ];
}

function _csvBuildOptionGuide() {
  var lines = [];
  lines.push('# ────────────────────────────────────────────────────────────');
  lines.push('# [작성 안내] 아래 # 줄은 업로드 시 모두 무시됩니다(설명/사전 전용).');
  lines.push('# 열 구성: Region, 분류(메모), ServiceCategory, SKU, Qty, Hours, Options');
  lines.push('#   · Options : "키=값"을 세미콜론(;)으로 구분. 예) tier=Standard; metric=Rules');
  lines.push('#   · Qty     : 수량(인스턴스/리소스 개수)');
  lines.push('#   · Hours   : 시간제 서비스=월 사용시간(예 730) / 저장·전송 서비스=사용량(GB 등) / 인스턴스 과금=1');
  lines.push('#   · SKU     : 인스턴스·단일 SKU가 있는 서비스만 사용. 그 외 서비스는 비우고 Options로만 지정');
  lines.push('#   · 가격 매칭 정확도는 서비스별 resolver 수준을 따름(일부 제네릭 서비스는 매칭 실패 가능 — docs/service-status.csv 참고)');
  lines.push('# ────────────────────────────────────────────────────────────');
  lines.push('# [서비스별 옵션 사전]');

  var defs = (typeof SERVICE_CATEGORIES !== 'undefined') ? SERVICE_CATEGORIES : {};
  var order = (typeof SERVICE_CATEGORY_ORDER !== 'undefined') ? SERVICE_CATEGORY_ORDER : Object.keys(defs);
  order.forEach(function (cat) {
    var def = defs[cat];
    if (!def || !def.steps) return;
    var skuKey = CSV_SKU_OPTION_KEY[cat];
    var parts = [];
    def.steps.forEach(function (s) {
      if (s.key === skuKey) return;                                  // SKU 열로 받는 키는 Options에서 제외
      if (cat === 'Virtual Machine' && s.key === 'series') return;   // series는 아래 인스턴스 카탈로그로 안내
      if (Array.isArray(s.options)) parts.push(s.key + '=[' + s.options.join('|') + ']');
      else if (s.type === 'number') parts.push(s.key + '=숫자');
    });
    var skuPart = skuKey ? ('SKU=' + (CSV_SKU_DESC[cat] || skuKey)) : 'SKU=비움';
    lines.push('# ' + cat + ' | ' + skuPart + (parts.length ? ' | Options: ' + parts.join('; ') : ' | Options: (없음)'));
  });

  // Virtual Machine — series별 인스턴스 카탈로그(SKU는 선택 series에 속한 인스턴스여야 함)
  var series = (typeof VM_INSTANCE_CATALOG !== 'undefined') ? Object.keys(VM_INSTANCE_CATALOG) : [];
  if (series.length) {
    lines.push('# [Virtual Machine 인스턴스 카탈로그] Options에 series=[...]를 함께 지정, SKU는 해당 series 인스턴스');
    series.forEach(function (sr) {
      lines.push('#   ' + sr + ': ' + VM_INSTANCE_CATALOG[sr].map(function (i) { return i.name; }).join(', '));
    });
  }

  // Disk — 종류별 카탈로그 및 추가 옵션
  if (typeof DISK_SUBTYPE_MAP !== 'undefined') {
    lines.push('# [Disk 상세] 용량형(표준 HDD/표준 SSD/프리미엄 SSD)은 SKU=크기 SKU, 프로비저닝형(프리미엄 SSD v2/Ultra Disk)은 SKU 비움+크기/IOPS/MBps를 Options로');
    if (typeof DISK_CATALOG !== 'undefined') {
      Object.keys(DISK_CATALOG).forEach(function (st) {
        lines.push('#   ' + st + ': ' + DISK_CATALOG[st].map(function (d) { return d.name; }).join(', '));
      });
    }
    lines.push('#   추가 옵션 — 표준 HDD/SSD: transactionUnits=숫자(만 단위) / 프리미엄 SSD: burstingEnabled=[비활성 (기본)|활성화 (P30 이상)] / 프로비저닝형: diskSizeGiB, provisionedIOPS, provisionedMBps');
  }

  // 조건부 옵션이 있는 서비스 안내
  lines.push('# [조건부 옵션] Backup: metric=보호 인스턴스 → workload만 / metric=백업 저장소 → storageTier+redundancy 만 사용');
  lines.push('# [사용량 단위] 저장·전송 항목(Azure Files/Blob/Backup 저장소/Bandwidth/Bastion 데이터 전송)은 Hours 칸에 사용량(GB 등)을 입력');

  if (typeof REGION_LABEL !== 'undefined') {
    lines.push('# [Region 코드] ' + Object.keys(REGION_LABEL).join(', '));
  }
  return lines;
}

function _csvDownloadTemplate() {
  var lines = [];
  lines.push(_csvRowToLine(CSV_HEADER));
  _csvBuildExampleRows().forEach(function (r) { lines.push(_csvRowToLine(r)); });
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
  alert(msg + '\n(전 서비스 지원. 가격 매칭 정확도는 서비스별 resolver 수준을 따릅니다 — docs/service-status.csv 참고)');
}

// ================================================================
// 내보내기 보조 (v48): 현재 행을 CSV(불러오기 양식)로 직렬화 + 파일 저장
// ================================================================
function _csvExportCurrentRows() {
  var lines = [];
  lines.push(_csvRowToLine(CSV_HEADER));
  rows.forEach(function (r) {
    if (!r.serviceCategory) return;
    var cat = r.serviceCategory;
    var skuKey = CSV_SKU_OPTION_KEY[cat];
    var opts = r.options || {};
    var skuVal = skuKey ? (opts[skuKey] || '') : (r.skuName || '');
    var optPairs = Object.keys(opts)
      .filter(function (k) { return opts[k] !== '' && opts[k] !== null && opts[k] !== undefined; })
      .map(function (k) { return k + '=' + opts[k]; })
      .join('; ');
    lines.push(_csvRowToLine([r.region || '', r.category || '', cat, skuVal, r.qty, r.usage, optPairs]));
  });
  lines.push('');
  _csvBuildOptionGuide().forEach(function (l) { lines.push(l); });
  return lines.join('\n');
}

function _downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 디렉터리 핸들에 blob 1개 쓰기 (엑셀과 같은 폴더에 CSV 자동 저장용)
async function _writeBlobToDir(dir, name, blob) {
  var fh = await dir.getFileHandle(name, { create: true });
  var w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

// 파일 저장 위치 선택 창(showSaveFilePicker)으로 blob 1개 저장. 같은 폴더 핸들을 받으면 in 으로 재사용.
async function _saveBlobWithPicker(suggestedName, blob, opts) {
  opts = opts || {};
  var pickerOpts = { suggestedName: suggestedName };
  if (opts.startIn) pickerOpts.startIn = opts.startIn;
  var ext = (suggestedName.split('.').pop() || '').toLowerCase();
  if (ext === 'xlsx') {
    pickerOpts.types = [{ description: 'Excel 통합 문서', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];
  } else if (ext === 'csv') {
    pickerOpts.types = [{ description: 'CSV 파일', accept: { 'text/csv': ['.csv'] } }];
  }
  var handle = await window.showSaveFilePicker(pickerOpts);
  var w = await handle.createWritable();
  await w.write(blob);
  await w.close();
  return handle;
}

// 엑셀 + CSV를 같은 이름(base)으로 저장.
// 1) showSaveFilePicker 지원: 엑셀 저장 위치를 고르면 CSV는 같은 폴더에 자동 저장 시도, 안 되면 CSV도 위치 선택.
// 2) 미지원: 두 파일 다운로드. 어떤 단계에서 오류가 나도 마지막엔 반드시 다운로드로 폴백.
async function _exportSaveFiles(base, xlsxBlob, csvBlob) {
  if (window.showSaveFilePicker) {
    var xlsxHandle = null;
    try {
      xlsxHandle = await _saveBlobWithPicker(base + '.xlsx', xlsxBlob);
    } catch (e) {
      if (e && e.name === 'AbortError') { setStatus('ok', '내보내기 취소됨'); return; }
      // 그 외 오류 → 둘 다 다운로드로 폴백
      _downloadBlob(xlsxBlob, base + '.xlsx');
      _downloadBlob(csvBlob, base + '.csv');
      setStatus('ok', '내보내기 완료(다운로드) · ' + base + '.xlsx / .csv');
      showToast('저장 창을 쓸 수 없어 다운로드로 받았습니다: ' + base, 'info');
      return;
    }

    // 엑셀이 저장된 같은 폴더에 CSV를 같은 이름으로 자동 저장 시도
    if (xlsxHandle && window.FileSystemHandle && xlsxHandle.getParent) {
      try {
        var parent = await xlsxHandle.getParent();
        await _writeBlobToDir(parent, base + '.csv', csvBlob);
        setStatus('ok', '내보내기 완료 · ' + base + '.xlsx / .csv');
        showToast('선택한 위치에 저장했습니다: ' + base + '.xlsx, ' + base + '.csv', 'ok');
        return;
      } catch (e2) { /* getParent 미지원/권한 → 아래에서 CSV도 위치 선택 */ }
    }

    // 같은 폴더 자동 저장이 안 되면 CSV 저장 위치를 한 번 더 선택 (엑셀과 같은 폴더에서 시작)
    try {
      await _saveBlobWithPicker(base + '.csv', csvBlob, { startIn: xlsxHandle || undefined });
      setStatus('ok', '내보내기 완료 · ' + base + '.xlsx / .csv');
      showToast('엑셀과 CSV를 저장했습니다: ' + base, 'ok');
      return;
    } catch (e3) {
      if (e3 && e3.name === 'AbortError') {
        // CSV 저장만 취소 → CSV는 다운로드로 보장
        _downloadBlob(csvBlob, base + '.csv');
        setStatus('ok', '엑셀 저장 완료 · CSV는 다운로드 · ' + base);
        showToast('엑셀은 저장, CSV는 다운로드로 받았습니다: ' + base, 'info');
        return;
      }
      _downloadBlob(csvBlob, base + '.csv');
      setStatus('ok', '엑셀 저장 완료 · CSV는 다운로드 · ' + base);
      showToast('CSV는 다운로드로 받았습니다: ' + base, 'info');
      return;
    }
  }

  // showSaveFilePicker 미지원 브라우저 → 기존 다운로드
  _downloadBlob(xlsxBlob, base + '.xlsx');
  _downloadBlob(csvBlob, base + '.csv');
  setStatus('ok', '내보내기 완료(다운로드) · ' + base + '.xlsx / .csv');
  showToast('엑셀과 CSV를 함께 내려받았습니다: ' + base, 'ok');
}

document.getElementById('btnCsvTemplate').addEventListener('click', _csvDownloadTemplate);
document.getElementById('btnCsvImport').addEventListener('click', function () { document.getElementById('fileCsvImport').click(); });
document.getElementById('fileCsvImport').addEventListener('change', function (e) {
  var f = e.target.files && e.target.files[0];
  if (f) _csvHandleUpload(f);
  e.target.value = '';
});
