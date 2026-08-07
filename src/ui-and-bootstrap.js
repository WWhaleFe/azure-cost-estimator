// ESM: 코어에서 필요한 심볼 import. XLSX 는 index.html 의 CDN <script> 전역 그대로 사용.
import { REG, SERVICE_CATEGORIES } from './core/registry.js';
import { REGION_LABEL, REGION_GROUPS } from './core/config.js';
import { clearCacheForCurrency } from './core/network.js';
import { buildSkuAndDetail, tryResolveItem } from './core/resolver-engine.js';
import { registerUIHooks } from './core/ui-hooks.js';
import { bootDiagnostics } from './diagnostics.js';
import { SERVICE_CATEGORY_ORDER } from './ui/service-order.js';

// setStatus/updatePriceCells/updateTotalsRow/showToast 는 아래에서 function 선언(호이스팅)되므로
// 여기서 UI 훅을 미리 등록해 resolver/서비스가 역호출할 수 있게 한다.
registerUIHooks({ setStatus, updatePriceCells, updateTotalsRow, showToast });

let rows = [];
let nextId = 1;
let activeConfigRowId = null;

// 공유 상태 접근자(ui/export-csv.js 등 분리 모듈이 rows/activeConfigRowId 를 재할당하기 위한 seam)
function getRows(){ return rows; }
function setRows(v){ rows = v; }
function setActiveConfigRowId(v){ activeConfigRowId = v; }
export { getRows, setRows, setActiveConfigRowId, blankRow, render, closeConfig, calcGroup, setStatus, showToast };

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

// 리전 <select> 옵션을 지역(대륙)별 <optgroup>으로 렌더 (선택 코드 표시)
function regionOptionsHtml(selected){
  return REGION_GROUPS.map(g=>{
    const opts=Object.entries(g.regions)
      .map(([code,lbl])=>`<option value="${escapeHtml(code)}" ${selected===code?'selected':''}>${escapeHtml(lbl)}</option>`).join('');
    return `<optgroup label="${escapeHtml(g.label)}">${opts}</optgroup>`;
  }).join('');
}
// 상단 '기본 Region' 셀렉트를 그룹 옵션으로 채운다(정적 HTML 대체, koreacentral 기본 선택)
(function initDefaultRegionSelect(){
  const el=document.getElementById('defaultRegion');
  if(el) el.innerHTML=regionOptionsHtml(el.value||'koreacentral');
})();

function calcGroup(item,qty,usage){
  if(!item)return null;
  if(item._billingMode==='monthly'&&typeof item._monthlyTotal==='number'){
    const monthly=Number(item._monthlyTotal);
    return{unit:monthly/730,monthly:monthly*qty,year:monthly*qty*12};
  }
  const u=Number(item.unitPrice);if(isNaN(u))return null;
  return{unit:u,monthly:u*qty*usage,year:u*qty*usage*12};
}
function priceCells(data,hasItem,isManual,groupClass){
  const gc=groupClass?(' '+groupClass):'';
  if(!hasItem||!data)return`<td class="cell-readonly${gc}"></td><td class="cell-readonly${gc}"></td><td class="cell-readonly${gc}"></td>`;
  const cls=isManual?'cell-readonly cell-ok cell-fill':'cell-readonly cell-ok';
  return`<td class="${cls}${gc}">${fmtUnit(data.unit)}</td><td class="${cls}${gc}">${fmtMoney(data.monthly)}</td><td class="${cls}${gc}">${fmtMoney(data.year)}</td>`;
}


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

    const regionCell = `<td><select class="cell-input cell-select" data-act="region-select" data-id="${row.id}">${regionOptionsHtml(row.region)}</select></td>`;

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
      ${priceCells(payg,!!row.paygItem,!!(row.paygItem&&row.paygItem._manualFill),'group-payg')}
      ${priceCells(sp1,!!row.sp1Item,!!(row.sp1Item&&row.sp1Item._manualFill),'group-sp1')}
      ${priceCells(sp3,!!row.sp3Item,!!(row.sp3Item&&row.sp3Item._manualFill),'group-sp3')}
      ${priceCells(ri1,!!row.ri1Item,!!(row.ri1Item&&row.ri1Item._manualFill),'group-ri1')}
      ${priceCells(ri3,!!row.ri3Item,!!(row.ri3Item&&row.ri3Item._manualFill),'group-ri3')}
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
    <td class="cell-readonly cell-ok group-payg">-</td><td class="cell-readonly cell-ok group-payg">${fmtMoney(totals.paygM)}</td><td class="cell-readonly cell-ok group-payg">${fmtMoney(totals.paygY)}</td>
    <td class="cell-readonly cell-ok group-sp1">-</td><td class="cell-readonly cell-ok group-sp1">${fmtMoney(totals.sp1M)}</td><td class="cell-readonly cell-ok group-sp1">${fmtMoney(totals.sp1Y)}</td>
    <td class="cell-readonly cell-ok group-sp3">-</td><td class="cell-readonly cell-ok group-sp3">${fmtMoney(totals.sp3M)}</td><td class="cell-readonly cell-ok group-sp3">${fmtMoney(totals.sp3Y)}</td>
    <td class="cell-readonly cell-ok group-ri1">-</td><td class="cell-readonly cell-ok group-ri1">${fmtMoney(totals.ri1M)}</td><td class="cell-readonly cell-ok group-ri1">${fmtMoney(totals.ri1Y)}</td>
    <td class="cell-readonly cell-ok group-ri3">-</td><td class="cell-readonly cell-ok group-ri3">${fmtMoney(totals.ri3M)}</td><td class="cell-readonly cell-ok group-ri3">${fmtMoney(totals.ri3Y)}</td>
    <td></td></tr>`;
  _refreshFillButtons();
}

function updatePriceCells(row){
  const tr=$body.querySelector(`tr[data-id="${row.id}"]`);if(!tr)return;
  const tds=tr.querySelectorAll('td'),qty=Number(row.qty)||0,usage=Number(row.usage)||0;
  [{item:row.paygItem,base:9,gc:'group-payg'},{item:row.sp1Item,base:12,gc:'group-sp1'},{item:row.sp3Item,base:15,gc:'group-sp3'},{item:row.ri1Item,base:18,gc:'group-ri1'},{item:row.ri3Item,base:21,gc:'group-ri3'}].forEach(({item,base,gc})=>{
    if(!tds[base]||!tds[base+1]||!tds[base+2])return;
    const data=calcGroup(item,qty,usage);
    if(!data){
      tds[base].className='cell-readonly '+gc;tds[base].textContent='';
      tds[base+1].className='cell-readonly '+gc;tds[base+1].textContent='';
      tds[base+2].className='cell-readonly '+gc;tds[base+2].textContent='';
    }else{
      const cls=(item&&item._manualFill)?'cell-readonly cell-ok cell-fill':'cell-readonly cell-ok';
      tds[base].className=cls+' '+gc;tds[base].textContent=fmtUnit(data.unit);
      tds[base+1].className=cls+' '+gc;tds[base+1].textContent=fmtMoney(data.monthly);
      tds[base+2].className=cls+' '+gc;tds[base+2].textContent=fmtMoney(data.year);
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
// 열(그룹) 라벨 — 열 도구 버튼/상태 메시지에서 사용
var COLUMN_LABELS = { sp1: '절약 플랜 1년', sp3: '절약 플랜 3년', ri1: '예약 1년', ri3: '예약 3년' };
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

// ================================================================
// 열(그룹) 단위 처리 (v75)
//   _toggleFillColumn: 헤더 '채우기' 버튼 토글 — 그 열에 수동 채움이 있으면 모두 지우고,
//                      없으면 용량제 값이 있는 모든 행의 빈 칸을 채움
//   _columnHasManualFill / _refreshFillButtons: 헤더 버튼의 채움 상태 표시 동기화(render마다)
//   _applyColumnVisibility: Region 박스의 '열 보기' 체크박스 — 그 열을 CSS로 표시/숨김
//                           (셀은 DOM에서 제거하지 않아 셀 위치·더블클릭·총계·엑셀 로직 보존)
// ================================================================
function _columnHasManualFill(groupKey) {
  var g = FILLABLE_GROUPS.find(function (x) { return x.key === groupKey; });
  if (!g) return false;
  return rows.some(function (r) { var c = r[g.itemKey]; return c && c._manualFill; });
}
function _toggleFillColumn(groupKey) {
  var g = FILLABLE_GROUPS.find(function (x) { return x.key === groupKey; });
  if (!g) return;
  var label = COLUMN_LABELS[groupKey] || groupKey;
  if (_columnHasManualFill(groupKey)) {
    var cleared = 0;
    rows.forEach(function (r) { var c = r[g.itemKey]; if (c && c._manualFill) { r[g.itemKey] = null; cleared++; } });
    render();
    setStatus('ok', label + ' 열: 수동 채움 ' + cleared + '개 행 지움(원본 값은 유지)');
  } else {
    var filled = 0, noPaygRows = 0;
    rows.forEach(function (r) {
      if (!r.paygItem) { if (r.serviceCategory) noPaygRows++; return; }
      if (!r[g.itemKey]) { r[g.itemKey] = _makeManualFromPayg(r.paygItem); filled++; }
    });
    render();
    var msg = label + ' 열: 빈 칸 ' + filled + '개 행을 용량제 값으로 채움(수동)';
    if (noPaygRows > 0) msg += ' · 용량제 없는 ' + noPaygRows + '개 행 제외';
    if (filled === 0) msg = label + ' 열: 채울 빈 칸이 없습니다(이미 값이 있거나 용량제 없음).';
    setStatus('ok', msg);
  }
}
function _refreshFillButtons() {
  ['sp1', 'sp3', 'ri1', 'ri3'].forEach(function (k) {
    var btn = document.getElementById('btnFillCol-' + k);
    if (!btn) return;
    var on = _columnHasManualFill(k);
    var label = COLUMN_LABELS[k] || k;
    btn.classList.toggle('on', on);
    btn.textContent = on ? '지우기' : '채우기';
    btn.title = on ? (label + ' 열의 수동 채움 값을 모두 지웁니다') : (label + ' 열의 빈 칸을 용량제 값으로 채웁니다');
  });
}
function _applyColumnVisibility(groupKey, visible) {
  var table = document.getElementById('mainTable');
  if (!table) return;
  var label = COLUMN_LABELS[groupKey] || groupKey;
  if (visible) table.classList.remove('hide-' + groupKey);
  else table.classList.add('hide-' + groupKey);
  setStatus('ok', label + (visible ? ' 열을 표시했습니다.' : ' 열을 숨겼습니다(데이터는 유지).'));
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
// 열 도구(v75): 헤더 '채우기' 토글 버튼 + Region 박스 '열 보기' 체크박스 연결
['sp1','sp3','ri1','ri3'].forEach(function(k){
  var fb=document.getElementById('btnFillCol-'+k);
  if(fb)fb.addEventListener('click',function(){_toggleFillColumn(k);});
  var vc=document.getElementById('chkVis-'+k);
  if(vc)vc.addEventListener('change',function(e){_applyColumnVisibility(k,e.target.checked);});
});
_refreshFillButtons();
document.getElementById('currencySelect').addEventListener('change',async(e)=>{
  const prev=e.target._prevValue||'KRW';clearCacheForCurrency(prev);e.target._prevValue=e.target.value;
  for(const r of rows){r.paygItem=null;r.sp1Item=null;r.sp3Item=null;r.ri1Item=null;r.ri3Item=null;}
  render();
  // 통화가 바뀌면 전 행을 다시 조회한다. 예전엔 행을 하나씩 await 해서 104행이면
  // 대기 시간이 그대로 합산됐다 — CSV 불러오기와 같은 일괄 조회 경로로 통일하고,
  // 끝난 뒤 남은 빈칸은 자동으로 재조회한다(v121).
  const {resolveRowsWithRetry,summarize}=await import('./ui/bulk-resolve.js');
  const result=await resolveRowsWithRetry(rows,{
    onProgress:(p)=>{
      if(p.phase==='initial')setStatus('loading',`통화 변경 재조회 중... (${p.done}/${p.total})`);
      else setStatus('loading',`빈칸 재조회 중... (${p.round}/${p.rounds} · 남은 ${p.remaining}행)`);
    },
  });
  render();
  setStatus(result.failed.length?'error':'ok',summarize(result));
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
  // number 스텝의 default를 옵션에 시드 → 화면에 보이는 기본값이 곧 계산값이 되도록(미시드 시 resolver가 0 처리하던 불일치 방지)
  (def.steps||[]).forEach(s=>{ if(s.type==='number'&&!s._hidden&&s.default!==undefined&&(r.options[s.key]===undefined||r.options[s.key]===''))r.options[s.key]=s.default; });
  const allSteps=(def.steps||[]).filter(s=>!s._hidden);
  const renderStep=_makeStepRenderer(r);
  let instanceHtml='';
  if(def.instanceField){
    let instanceOptions=[];
    if(r.serviceCategory==='Virtual Machine'){
      const series=r.options.series;
      if(series&&typeof REG.VM_INSTANCE_CATALOG!=='undefined'&&REG.VM_INSTANCE_CATALOG[series])
        instanceOptions=REG.VM_INSTANCE_CATALOG[series].map(i=>({value:i.name,label:`${i.name} (vCPU:${i.vCPU}${(i.ram!==undefined&&i.ram!==null)?' RAM:'+i.ram+'GB':''})`}));
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
  const sub=typeof REG.DISK_SUBTYPE_MAP!=='undefined'?REG.DISK_SUBTYPE_MAP[o.diskSubType]:null;
  const html=[];

  // 1. 디스크 종류
  const subtypeOptions=typeof REG.DISK_SUBTYPE_MAP!=='undefined'
    ?Object.keys(REG.DISK_SUBTYPE_MAP).map(k=>`<option value="${escapeHtml(k)}" ${o.diskSubType===k?'selected':''}>${escapeHtml(k)}</option>`).join('')
    :'';
  html.push(`<div class="config-field"><label>디스크 종류</label><select data-opt-key="diskSubType"><option value="">선택...</option>${subtypeOptions}</select></div>`);

  if(!sub){$configContent.innerHTML=html.join('');_bindDiskConfigEvents(r);return;}

  if(sub.isProvisioned){
    if(sub.diskType==='ultra'){
      const sizeOpts=(typeof REG.ULTRA_DISK_SIZES!=='undefined'?REG.ULTRA_DISK_SIZES:[])
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
    const catalog=(typeof REG.DISK_CATALOG!=='undefined'?REG.DISK_CATALOG[sub.storageType]:null)||[];
    const instOpts=catalog.map(d=>{
      const extra=d.iops?`, ${d.iops.toLocaleString()} IOPS`:'';
      // P30 이상은 RI 지원 표시
      const riTag=(sub.diskType==='premium'&&typeof REG.PREMIUM_SSD_RI_SUPPORTED!=='undefined'&&REG.PREMIUM_SSD_RI_SUPPORTED.has(d.name))?' [RI가능]':'';
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
      const riSupported=typeof REG.PREMIUM_SSD_RI_SUPPORTED!=='undefined'&&REG.PREMIUM_SSD_RI_SUPPORTED.has(selectedSku);
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
  const KEYS_REBUILD=[(def.instanceParentKey||null)].concat(def.rebuildKeys||[]).filter(Boolean);
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

addRow();addRow();addRow();
setStatus('ok','준비 완료');
bootDiagnostics();

// 엑셀 내보내기 + CSV 기능은 별도 모듈에서 로드(부수효과로 버튼 핸들러 등록)
import './ui/export-csv.js';
