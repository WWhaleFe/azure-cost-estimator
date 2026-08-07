// ================================================================
// ui/export-csv.js — 엑셀 내보내기 + CSV 양식 다운로드/업로드/직렬화
// (ui-and-bootstrap.js 에서 분리. 공유 상태는 접근자 getRows/setRows/setActiveConfigRowId 사용)
// 부수효과: 로드 시 내보내기·CSV 버튼 핸들러를 등록한다.
// ================================================================
import { REGION_LABEL } from '../core/config.js';
import { buildSkuAndDetail } from '../core/resolver-engine.js';
import { SERVICE_CATEGORY_ORDER } from './service-order.js';
import {
  CSV_HEADER, CSV_SKU_OPTION_KEY, csvRowToLine, buildOptionGuide, buildTemplateCsv,
} from './csv-template.js';
import { summarize } from './bulk-resolve.js';
import { resolveWithProgressModal } from './progress-modal.js';
import {
  getRows, getViewRows, setRows, setActiveConfigRowId,
  blankRow, render, closeConfig, calcGroup, setStatus, showToast,
} from '../ui-and-bootstrap.js';

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
function getEnabledGroups(){return EXPORT_GROUPS.filter(g=>{
  // 엑셀 출력 선택 체크박스(chk-group-*)가 해제된 그룹은 제외
  const c=document.getElementById(`chk-group-${g.key}`);
  if(c && !c.checked) return false;
  // '열 보기'(chkVis-*)로 화면에서 숨긴 열은 엑셀에서도 제외(PAYG는 항상 표시 — chkVis 없음)
  const vc=document.getElementById(`chkVis-${g.key}`);
  if(vc && !vc.checked) return false;
  return true;
});}

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
  getViewRows().forEach((r,idx)=>{
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
  for(let i=0;i<getViewRows().length;i++){const ri=5+i;for(let c=0;c<tC;c++){const addr=XLSX.utils.encode_cell({r:ri,c});if(!ws[addr])ws[addr]={v:''};if(c>=6&&typeof ws[addr].v==='number')ws[addr].s=nSt;else ws[addr].s={...dSt,alignment:{...dSt.alignment,horizontal:c===0?'center':'left'}};}}
  const tri=5+getViewRows().length;for(let c=0;c<tC;c++){const addr=XLSX.utils.encode_cell({r:tri,c});if(!ws[addr])ws[addr]={v:''};ws[addr].s=totSt;}
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

// ================================================================
// CSV 양식 다운로드 / 업로드 (v46, v63에서 전 서비스로 확장)
// 지원: 전체 서비스 카테고리(SERVICE_CATEGORY_ORDER 전부). 양식 본문(예시 행 + 옵션 사전)은
//       DOM 비의존 모듈 ui/csv-template.js 가 만든다(테스트에서 같은 함수로 검증).
// SKU 열 매핑: 인스턴스/단일 SKU가 있는 서비스만 SKU 열로 받고, 나머지는 Options로 지정
//   (VM=instance, Disk=diskInstance, VPN=sku, App Service=size,
//    Application Gateway=sku, Public IP=sku, Azure Cache for Redis=sku)
//   ※ 모든 서비스가 _buildDetail_*에서 options로 skuName을 구성하므로, SKU 열이 없는
//      서비스는 Options만으로 식별된다. 가격 매칭 정확도는 각 서비스 resolver 수준을 따른다
//      (A 그룹=라이브 검증, 일부 제네릭 서비스는 매칭이 취약할 수 있음 — service-status.csv 참고).
// ================================================================
var CSV_SUPPORTED_CATEGORIES = SERVICE_CATEGORY_ORDER.slice();

// CSV 불러오기 시 동시에 조회할 행 수. 공개 프록시 폴백 환경에서도 무리가 없도록
// 낮게 잡았다(6 레인이면 104행 ≈49초 → ≈24초).
var CSV_IMPORT_CONCURRENCY = 6;

function _csvDownloadTemplate() {
  var blob = new Blob(['\ufeff' + buildTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
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

// opts.mode = 'append' 면 기존 행을 지울지 묻지 않고 항상 뒤에 덧붙인다
// (하단 'CSV로 견적 추가하기' 버튼 전용 — 상단 'CSV 불러오기'는 기존대로 교체/추가를 묻는다)
async function _csvHandleUpload(file, opts) {
  var mode = (opts && opts.mode) || 'ask';
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

  var replace = false;
  if (mode !== 'append') {
    replace = true;
    var hasExisting = getRows().some(function (r) { return r.serviceCategory || r.skuName || (r.options && Object.keys(r.options).length > 0); });
    if (hasExisting) {
      replace = confirm('기존 행을 모두 비우고 불러올까요?\n확인 = 교체, 취소 = 기존 행 뒤에 추가');
    }
  }
  if (replace) { setRows([]); setActiveConfigRowId(null); closeConfig(); }

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

  setRows(getRows().concat(newRows));
  render();

  // SKU/상세는 먼저 전부 동기로 만든다.
  //   buildSkuAndDetail → _applyStepVisibility 는 공유 def.steps 를 갈아끼우므로
  //   조회(await)와 섞이면 안 된다. 반면 _resolve_* 는 row.options 만 읽고 def 를
  //   건드리지 않으므로(공유 상태 없음) 동시에 돌려도 안전하다.
  newRows.forEach(function (rr) { buildSkuAndDetail(rr); });

  // 진행 팝업을 띄운 채 조회한다(조회 중 배경 조작 차단). 끝나면 팝업에 결과가 남는다.
  var notes = [];
  if (skippedCat > 0) notes.push('미지원 서비스 ' + skippedCat + '행은 제외했습니다.');
  if (skippedRegion > 0) notes.push('미지원 Region ' + skippedRegion + '행은 제외했습니다.');
  var titleWord = (mode === 'append') ? 'CSV로 견적 추가' : 'CSV 불러오기';
  var result = await resolveWithProgressModal(titleWord + ' — 가격 조회 중', newRows, {
    lanes: CSV_IMPORT_CONCURRENCY,
    notes: notes,
    onTick: function (p) {
      if (p.phase === 'initial') setStatus('loading', titleWord + ': 가격 조회 중... (' + p.done + '/' + p.total + ')');
      else setStatus('loading', '빈칸 재조회 중... (' + p.round + '/' + p.rounds + ' · 남은 ' + p.remaining + '행)');
    },
  });
  render();

  // 결과는 진행 팝업이 그대로 보여주므로 alert 는 띄우지 않는다(v122).
  var msg = titleWord + ' 완료: ' + created + '행 ' + (mode === 'append' ? '추가' : '생성') + ' · ' + summarize(result);
  if (skippedCat > 0) msg += ', 미지원 서비스 ' + skippedCat + '행 제외';
  if (skippedRegion > 0) msg += ', 미지원 Region ' + skippedRegion + '행 제외';
  setStatus(result.failed.length ? 'error' : 'ok', msg);
}

// ================================================================
// 내보내기 보조 (v48): 현재 행을 CSV(불러오기 양식)로 직렬화 + 파일 저장
// ================================================================
function _csvExportCurrentRows() {
  var lines = [];
  lines.push(csvRowToLine(CSV_HEADER));
  getViewRows().forEach(function (r) {
    if (!r.serviceCategory) return;
    var cat = r.serviceCategory;
    var skuKey = CSV_SKU_OPTION_KEY[cat];
    var opts = r.options || {};
    var skuVal = skuKey ? (opts[skuKey] || '') : (r.skuName || '');
    var optPairs = Object.keys(opts)
      .filter(function (k) { return opts[k] !== '' && opts[k] !== null && opts[k] !== undefined; })
      .map(function (k) { return k + '=' + opts[k]; })
      .join('; ');
    lines.push(csvRowToLine([r.region || '', r.category || '', cat, skuVal, r.qty, r.usage, optPairs]));
  });
  lines.push('');
  buildOptionGuide().forEach(function (l) { lines.push(l); });
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

// 하단 'CSV로 견적 추가하기' — 기존 견적을 유지한 채 CSV 행을 덧붙인다
document.getElementById('btnCsvAppend').addEventListener('click', function () { document.getElementById('fileCsvAppend').click(); });
document.getElementById('fileCsvAppend').addEventListener('change', function (e) {
  var f = e.target.files && e.target.files[0];
  if (f) _csvHandleUpload(f, { mode: 'append' });
  e.target.value = '';
});

