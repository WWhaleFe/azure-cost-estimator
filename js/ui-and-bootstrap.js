let rows = [];
let rowId = 0;
let selectedRowId=null;
let configDirty=false;
let apiTotalCount=0,apiSuccessCount=0,apiFailCount=0;
const SERVICE_CATEGORY_ORDER=['Virtual Machine','Disk','VPN Gateway','Load Balancer','Application Gateway','Public IP','Azure Firewall','Bandwidth','NAT Gateway','Azure SQL Database','Azure Database for MySQL','App Service','Azure Bastion','Azure Files','Blob Storage'];
function _addRowsForCategoryDisk(){const rs=[];const sub='Standard SSD',red='LRS',sz='P10';rs.push({id:++rowId,region:'koreacentral',regionLabel:'Korea Central',qty:1,usage:730,paygItem:null,sp1Item:null,sp3Item:null,ri1Item:null,ri3Item:null,serviceCategory:'Disk',skuName:sz,detail:`${sub} - ${red} - ${sz}`,options:{diskSubType:sub,redundancy:red,diskInstance:sz}});return rs;}
function _addRowsForCategoryGeneric(cat){const r={id:++rowId,region:'koreacentral',regionLabel:'Korea Central',qty:1,usage:730,paygItem:null,sp1Item:null,sp3Item:null,ri1Item:null,ri3Item:null,serviceCategory:cat,skuName:'',detail:'',options:{}};const def=SERVICE_CATEGORIES[cat];if(def&&def.steps){def.steps.forEach(s=>{if(s.options&&s.options.length>0)r.options[s.key]=s.options[0];if(s.default!==undefined)r.options[s.key]=s.default;});}buildSkuAndDetail(r);return[r];}
function addRow(){const cat=$selServiceCategory?.value||'';const newRows=cat==='Disk'?_addRowsForCategoryDisk():_addRowsForCategoryGeneric(cat);rows.push(...newRows);if(newRows.length>0){selectedRowId=newRows[0].id;renderConfigPanel();}render();}

// ================================================================
// 고정 검증값 제공 (테스트 용)
// ================================================================
function loadSample(){
  rows.length=0;rowId=0;
  const region='koreacentral',regionLabel='Korea Central';
  rows.push({id:++rowId,region,regionLabel,qty:1,usage:730,paygItem:null,sp1Item:null,sp3Item:null,ri1Item:null,ri3Item:null,serviceCategory:'Virtual Machine',skuName:'D2s_v5',detail:'',options:{os:'Linux',tier:'Standard',license:'라이선스 포함',series:'D-series v5',instance:'D2s_v5'}});
  rows.push({id:++rowId,region,regionLabel,qty:1,usage:730,paygItem:null,sp1Item:null,sp3Item:null,ri1Item:null,ri3Item:null,serviceCategory:'Disk',skuName:'P10',detail:'프리미엄 SSD - LRS - P10',options:{diskSubType:'프리미엄 SSD',redundancy:'LRS',diskInstance:'P10'}});
  rows.forEach(r=>{if(r.serviceCategory==='Virtual Machine')buildSkuAndDetail(r);});
  selectedRowId=null;
  render();renderConfigPanel();
}

// ================================================================
// 전체 행 재조회
// ================================================================
async function recalcAll(){
  apiTotalCount=apiSuccessCount=apiFailCount=0;
  const total=rows.length;
  if(total===0){setStatus('ok','조회할 행이 없습니다');return;}
  setStatus('loading',`${total}개 행 조회 시작...`);
  for(let i=0;i<rows.length;i++){
    const r=rows[i];
    if(!r.serviceCategory){apiFailCount++;continue;}
    if(r.region==='koreacentral'||!r.region){r.region='koreacentral';r.regionLabel='Korea Central';}
    try{await tryResolveItem(r);apiTotalCount++;if(r.paygItem)apiSuccessCount++;else apiFailCount++;}catch(err){apiFailCount++;apiTotalCount++;console.error('recalcAll row',r.id,err);}
  }
  render();updateTotalsRow();
  setStatus('ok',`완료 · 성공 ${apiSuccessCount}/${apiTotalCount} · 실패 ${apiFailCount}`);
}

async function recalcRow(r){if(!r||!r.serviceCategory)return;await tryResolveItem(r);render();updateTotalsRow();}

// ================================================================
// 메인 테이블 렌더링
// ================================================================
function render(){
  const tbody=document.getElementById('tableBody');
  if(!tbody)return;
  tbody.innerHTML='';
  rows.forEach((r,idx)=>{
    const tr=document.createElement('tr');
    tr.dataset.rowId=r.id;
    if(selectedRowId===r.id)tr.classList.add('row-selected');
    tr.innerHTML=_renderRowHtml(r,idx);
    tbody.appendChild(tr);
  });
  _attachRowEventHandlers();
  updateTotalsRow();
}

function _renderRowHtml(r,idx){
  const isSelected=selectedRowId===r.id;
  const num=idx+1;
  const optionsBtn=`<button class="btn btn-secondary btn-sm" data-action="select" data-row-id="${r.id}">${isSelected?'●':'○'} 옵션</button>`;
  const deleteBtn=`<button class="btn btn-danger btn-sm" data-action="delete" data-row-id="${r.id}">삭제</button>`;
  const dupBtn=`<button class="btn btn-secondary btn-sm" data-action="duplicate" data-row-id="${r.id}">복사</button>`;
  return `
    <td class="col-num">${num}</td>
    <td class="col-actions">${optionsBtn} ${dupBtn} ${deleteBtn}</td>
    <td class="col-region">${escapeHtml(r.regionLabel||r.region||'')}</td>
    <td class="col-service">${escapeHtml(r.serviceCategory||'')}</td>
    <td class="col-sku">${escapeHtml(r.skuName||'')}</td>
    <td class="col-detail">${escapeHtml(r.detail||'')}</td>
    <td class="col-qty"><input type="number" min="0" step="1" value="${r.qty}" data-row-id="${r.id}" data-input="qty" style="width:60px;"/></td>
    <td class="col-usage"><input type="number" min="0" step="1" value="${r.usage}" data-row-id="${r.id}" data-input="usage" style="width:80px;"/></td>
    ${_renderPriceCell(r,'paygItem')}
    ${_renderPriceCell(r,'sp1Item')}
    ${_renderPriceCell(r,'sp3Item')}
    ${_renderPriceCell(r,'ri1Item')}
    ${_renderPriceCell(r,'ri3Item')}
  `;
}

function _renderPriceCell(r,itemKey){
  const item=r[itemKey];
  if(!item){const lbl=itemKey==='paygItem'?'-':'-';return `<td class="col-price"><div class="price-empty">${lbl}</div></td>`;}
  const g=calcGroup(r,item);
  const m=g.monthly,y=g.yearly,h=g.hourly;
  const cur=item.currencyCode||'KRW';
  return `<td class="col-price">
    <div class="price-monthly">${formatCurrency(m,cur)}/월</div>
    <div class="price-yearly">${formatCurrency(y,cur)}/년</div>
    <div class="price-hourly">${formatCurrency(h,cur,6)}/h</div>
  </td>`;
}

function calcGroup(r,item){
  if(!item)return{monthly:0,yearly:0,hourly:0};
  const hourly=Number(item.unitPrice||0);
  const qty=Number(r.qty||0),usage=Number(r.usage||0);
  let monthly,yearly;
  // 월정액 모드(VPN Gateway 등)의 경우 _monthlyTotal 을 그대로 사용
  if(item._billingMode==='monthly'&&item._monthlyTotal!==undefined){
    monthly=item._monthlyTotal*qty;
  }else{
    monthly=hourly*usage*qty;
  }
  yearly=monthly*12;
  return{monthly,yearly,hourly:hourly*qty};
}

function updatePriceCells(r){
  const tr=document.querySelector(`tr[data-row-id='${r.id}']`);
  if(!tr)return;
  const cells=tr.querySelectorAll('.col-price');
  if(cells.length!==5)return;
  ['paygItem','sp1Item','sp3Item','ri1Item','ri3Item'].forEach((key,i)=>{
    const tmp=document.createElement('tr');
    tmp.innerHTML=_renderPriceCell(r,key);
    cells[i].replaceWith(tmp.firstElementChild);
  });
}

function updateTotalsRow(){
  const tfoot=document.getElementById('tableFooter');
  if(!tfoot)return;
  let paygM=0,paygY=0,sp1M=0,sp1Y=0,sp3M=0,sp3Y=0,ri1M=0,ri1Y=0,ri3M=0,ri3Y=0;
  rows.forEach(r=>{
    [['paygItem','paygM','paygY'],['sp1Item','sp1M','sp1Y'],['sp3Item','sp3M','sp3Y'],['ri1Item','ri1M','ri1Y'],['ri3Item','ri3M','ri3Y']].forEach(([itemKey,mKey,yKey])=>{
      const it=r[itemKey];
      if(!it)return;
      const g=calcGroup(r,it);
      if(itemKey==='paygItem'){paygM+=g.monthly;paygY+=g.yearly;}
      if(itemKey==='sp1Item'){sp1M+=g.monthly;sp1Y+=g.yearly;}
      if(itemKey==='sp3Item'){sp3M+=g.monthly;sp3Y+=g.yearly;}
      if(itemKey==='ri1Item'){ri1M+=g.monthly;ri1Y+=g.yearly;}
      if(itemKey==='ri3Item'){ri3M+=g.monthly;ri3Y+=g.yearly;}
    });
  });
  const cur=document.getElementById('currencySelect')?.value||'KRW';
  const ftr=(m,y)=>`<div class="price-monthly">${formatCurrency(m,cur)}/월</div><div class="price-yearly">${formatCurrency(y,cur)}/년</div>`;
  tfoot.innerHTML=`<tr class="row-totals"><td colspan="8">합계</td><td>${ftr(paygM,paygY)}</td><td>${ftr(sp1M,sp1Y)}</td><td>${ftr(sp3M,sp3Y)}</td><td>${ftr(ri1M,ri1Y)}</td><td>${ftr(ri3M,ri3Y)}</td></tr>`;
}

function _attachRowEventHandlers(){
  document.querySelectorAll('button[data-action]').forEach(btn=>{
    btn.addEventListener('click',(e)=>{
      const id=Number(e.target.dataset.rowId);
      const act=e.target.dataset.action;
      if(act==='delete'){rows=rows.filter(r=>r.id!==id);if(selectedRowId===id)selectedRowId=null;render();renderConfigPanel();}
      else if(act==='select'){selectedRowId=id;render();renderConfigPanel();}
      else if(act==='duplicate'){const orig=rows.find(r=>r.id===id);if(orig){const copy=JSON.parse(JSON.stringify(orig));copy.id=++rowId;copy.paygItem=copy.sp1Item=copy.sp3Item=copy.ri1Item=copy.ri3Item=null;rows.push(copy);render();}}
    });
  });
  document.querySelectorAll('input[data-input]').forEach(inp=>{
    inp.addEventListener('input',(e)=>{
      const id=Number(e.target.dataset.rowId);
      const f=e.target.dataset.input;
      const r=rows.find(x=>x.id===id);
      if(!r)return;
      const raw=e.target.value;
      r[f]=(raw===''?0:Number(raw));
      updatePriceCells(r);updateTotalsRow();
    });
  });
}

// ================================================================
// 설정 패널 (서비스 카테고리별 옵션 입력 UI)
// ================================================================
let $configContent,$configTitle,$apiStatus,$selServiceCategory;
function _initConfigPanelRefs(){
  $configContent=document.getElementById('configContent');
  $configTitle=document.getElementById('configTitle');
  $apiStatus=document.getElementById('apiStatus');
  $selServiceCategory=document.getElementById('selServiceCategory');
}
function renderConfigPanel(){
  if(!$configContent)return;
  $configContent.innerHTML='';
  if(!selectedRowId){$configTitle.textContent='행을 선택하면 옵션이 여기에 나타납니다';return;}
  const r=rows.find(x=>x.id===selectedRowId);
  if(!r){$configTitle.textContent='선택된 행을 찾을 수 없습니다';return;}
  const def=SERVICE_CATEGORIES[r.serviceCategory];
  if(!def){$configTitle.textContent=`알 수 없는 카테고리: ${r.serviceCategory}`;return;}
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
    // 카테고리별 동적 인스턴스 드롭다운 카탈로그 분기
    // (각 카테고리가 노출한 INSTANCE_CATALOG 전역 객체에서 부모 옵션 값을 키로 조회)
    if(r.serviceCategory==='Virtual Machine'){
      const series=r.options.series;
      if(series&&typeof VM_INSTANCE_CATALOG!=='undefined'&&VM_INSTANCE_CATALOG[series])
        instanceOptions=VM_INSTANCE_CATALOG[series].map(i=>({value:i.name,label:`${i.name} (vCPU:${i.vCPU} RAM:${i.ram}GB)`}));
    }
    else if(r.serviceCategory==='Azure Database for MySQL'){
      const hardware=r.options.hardware;
      if(hardware&&typeof MYSQL_INSTANCE_CATALOG!=='undefined'&&MYSQL_INSTANCE_CATALOG[hardware])
        instanceOptions=MYSQL_INSTANCE_CATALOG[hardware].map(i=>({value:i.name,label:`${i.name} (vCPU:${i.vCPU} RAM:${i.ram}GB)`}));
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

  // 상위 SKU
  html.push(`<div class="config-field"><label>디스크 종류</label><select data-opt-key="diskSubType">`);
  ['Standard HDD','Standard SSD','프리미엄 SSD','프리미엄 SSD v2','Ultra Disk'].forEach(s=>{html.push(`<option value="${s}" ${o.diskSubType===s?'selected':''}>${s}</option>`);});
  html.push(`</select></div>`);

  // 이중화
  html.push(`<div class="config-field"><label>이중화</label><select data-opt-key="redundancy">`);
  ['LRS','ZRS'].forEach(rd=>{html.push(`<option value="${rd}" ${o.redundancy===rd?'selected':''}>${rd}</option>`);});
  html.push(`</select></div>`);

  // 디스크 인스턴스 드롭다운
  if(sub&&Array.isArray(sub.instances)){
    html.push(`<div class="config-field" style="grid-column:1/-1;"><label>디스크 크기</label><select data-opt-key="diskInstance">`);
    html.push(`<option value="">선택...</option>`);
    sub.instances.forEach(it=>{html.push(`<option value="${it.name}" ${o.diskInstance===it.name?'selected':''}>${it.name} (${it.sizeGiB}GiB, ${it.iops}IOPS, ${it.mbps}MB/s)</option>`);});
    html.push(`</select></div>`);
  }

  // 프로비저닝 디스크 입력 (Premium SSD v2 / Ultra Disk)
  if(o.diskSubType==='프리미엄 SSD v2'||o.diskSubType==='Ultra Disk'){
    html.push(`<div class="config-field"><label>크기 (GiB)</label><input type="number" min="0" step="1" value="${o.diskSizeGiB||0}" data-opt-key="diskSizeGiB" data-opt-type="number"/></div>`);
    html.push(`<div class="config-field"><label>IOPS</label><input type="number" min="0" step="1" value="${o.diskIOPS||0}" data-opt-key="diskIOPS" data-opt-type="number"/></div>`);
    html.push(`<div class="config-field"><label>MB/s</label><input type="number" min="0" step="1" value="${o.diskMBps||0}" data-opt-key="diskMBps" data-opt-type="number"/></div>`);
  }

  // 윈도우 필드 - P30 이상 RI 알림
  let warn='';
  if(o.diskSubType==='프리미엄 SSD'&&['P30','P40','P50','P60','P70','P80'].includes(o.diskInstance)){
    warn=`<div class="warning-box">⚠ ${o.diskInstance} 이상은 일부 리전에서만 RI(예약 구매) 제공됩니다.</div>`;
  }
  $configContent.innerHTML=html.join('')+warn;
  _bindConfigEvents(r,SERVICE_CATEGORIES.Disk);
}

function _makeStepRenderer(r){
  return function(step){
    if(step.type==='number'){
      const cur=r.options[step.key]!==undefined?r.options[step.key]:(step.default!==undefined?step.default:0);
      return `<div class="config-field"><label>${escapeHtml(step.label)}</label><input type="number" ${step.min!==undefined?`min="${step.min}"`:''} ${step.max!==undefined?`max="${step.max}"`:''} ${step.step!==undefined?`step="${step.step}"`:''} value="${cur}" data-opt-key="${step.key}" data-opt-type="number" ${step.tooltip?`title="${escapeHtml(step.tooltip)}"`:''}/></div>`;
    }
    if(step.options){
      const cur=r.options[step.key]||'';
      return `<div class="config-field"><label>${escapeHtml(step.label)}</label><select data-opt-key="${step.key}">${step.options.map(o=>`<option value="${escapeHtml(o)}" ${cur===o?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select></div>`;
    }
    return '';
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
  {key:'ri1', label:'예약 1년',     itemKey:'ri1Item', color:'BF8F00',totMKey:'ri1M', totYKey:'ri1Y'},
  {key:'ri3', label:'예약 3년',     itemKey:'ri3Item', color:'806000',totMKey:'ri3M', totYKey:'ri3Y'},
];
function exportExcel(){
  const wb=XLSX.utils.book_new();
  const wsName='Azure 견적';
  const cur=document.getElementById('currencySelect')?.value||'KRW';
  const rowsData=[];
  rowsData.push([{v:'Azure 견적 시뮬레이션',t:'s',s:{font:{bold:true,sz:18}}}]);
  rowsData.push([`통화: ${cur}`,`행 수: ${rows.length}`,`생성: ${new Date().toLocaleString('ko-KR')}`]);
  rowsData.push([]);
  const header=['#','리전','서비스','SKU','상세 사양','Qty','사용 시간(h/월)'];
  EXPORT_GROUPS.forEach(g=>{header.push(`${g.label}\n(월)`,`${g.label}\n(년)`);});
  rowsData.push(header);
  rows.forEach((r,i)=>{
    const row=[i+1,r.regionLabel||r.region||'',r.serviceCategory||'',r.skuName||'',r.detail||'',r.qty,r.usage];
    EXPORT_GROUPS.forEach(g=>{
      const it=r[g.itemKey];if(!it){row.push('','');return;}
      const grp=calcGroup(r,it);row.push(grp.monthly,grp.yearly);
    });
    rowsData.push(row);
  });
  // 합계
  let paygM=0,paygY=0,sp1M=0,sp1Y=0,sp3M=0,sp3Y=0,ri1M=0,ri1Y=0,ri3M=0,ri3Y=0;
  rows.forEach(r=>{[['paygItem','paygM','paygY'],['sp1Item','sp1M','sp1Y'],['sp3Item','sp3M','sp3Y'],['ri1Item','ri1M','ri1Y'],['ri3Item','ri3M','ri3Y']].forEach(([k,mk,yk])=>{const it=r[k];if(!it)return;const g=calcGroup(r,it);if(k==='paygItem'){paygM+=g.monthly;paygY+=g.yearly;}if(k==='sp1Item'){sp1M+=g.monthly;sp1Y+=g.yearly;}if(k==='sp3Item'){sp3M+=g.monthly;sp3Y+=g.yearly;}if(k==='ri1Item'){ri1M+=g.monthly;ri1Y+=g.yearly;}if(k==='ri3Item'){ri3M+=g.monthly;ri3Y+=g.yearly;}});});
  rowsData.push(['','','','','','','합계',paygM,paygY,sp1M,sp1Y,sp3M,sp3Y,ri1M,ri1Y,ri3M,ri3Y]);
  const ws=XLSX.utils.aoa_to_sheet(rowsData);
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:16}}];
  ws['!cols']=[{wch:5},{wch:14},{wch:24},{wch:18},{wch:38},{wch:6},{wch:14},{wch:16},{wch:16},{wch:16},{wch:16},{wch:16},{wch:16},{wch:16},{wch:16},{wch:16},{wch:16}];
  XLSX.utils.book_append_sheet(wb,ws,wsName);
  XLSX.writeFile(wb,'azure-cost-estimate.xlsx');
}

// ================================================================
// 메인 초기화
// ================================================================
function initServiceCategoryDropdown(){
  const $s=document.getElementById('selServiceCategory');
  if(!$s)return;
  $s.innerHTML=SERVICE_CATEGORY_ORDER.map(c=>`<option value="${c}">${c}</option>`).join('');
}
function formatCurrency(n,cur,dec){if(typeof n!=='number'||!isFinite(n))n=0;const d=dec!==undefined?dec:(cur==='KRW'?0:2);try{return new Intl.NumberFormat('ko-KR',{style:'currency',currency:cur,maximumFractionDigits:d,minimumFractionDigits:d}).format(n);}catch(e){return n.toFixed(d)+' '+cur;}}
function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
async function refresh(){await recalcAll();}
function onCategoryChange(){}
function onRegionChange(){}
function onAddRow(){addRow();}
function onExport(){exportExcel();}
function onCurrencyChange(){render();updateTotalsRow();}

document.addEventListener('DOMContentLoaded',()=>{
  _initConfigPanelRefs();
  initServiceCategoryDropdown();
  loadSample();
  document.getElementById('btnRecalc')?.addEventListener('click',refresh);
  document.getElementById('btnAddRow')?.addEventListener('click',onAddRow);
  document.getElementById('btnExportExcel')?.addEventListener('click',onExport);
  document.getElementById('currencySelect')?.addEventListener('change',onCurrencyChange);
  bootDiagnostics();
});
