// ================================================================
// ui/column-resize.js — 표 열 너비 드래그 조절 (v130)
// ----------------------------------------------------------------
// 요구사항: 한 열의 너비를 바꿔도 **다른 열의 너비는 그대로**여야 한다.
//
// 기본(table-layout:auto)에서는 브라우저가 내용에 맞춰 전체를 다시 배분하므로
// 한 열만 늘려도 옆 열이 밀리거나 줄어든다. 그래서
//   ① <table> 을 table-layout:fixed 로 두고
//   ② 너비는 <colgroup><col> 만 정하게 하고
//   ③ <table> 전체 폭 = 보이는 열 너비의 합
// 으로 만든다. 이러면 col 하나의 px 을 바꿔도 나머지 col 은 손대지 않으니
// 폭이 변하는 건 그 열과 표 전체 폭뿐이다(가로 스크롤은 바깥 div 가 맡는다).
//
// 열 숨기기('열 보기' 체크박스)는 td/th 에 display:none 을 거는 방식이라,
// 숨긴 열의 <col> 도 같이 빼지 않으면 그 뒤 열들이 한 칸씩 밀린다.
// → syncColgroup() 이 **보이는 열만** col 로 그린다.
//
// 아래 createColumnModel() 은 DOM 을 모르는 순수 모델이다(테스트 대상).
// ================================================================

const STORAGE_KEY = 'aceColWidths.v1';
const MAX_WIDTH = 900;

// 화면에 나타나는 순서 그대로. group 이 있는 열은 그 그룹이 숨겨지면 col 도 빠진다.
// w = 기본 너비(px, 기존 <th style="width:..."> 와 같은 값), min = 드래그 하한.
export const COLUMNS = [
  { key: 'drag',            w: 24,  min: 20 },
  { key: 'no',              w: 34,  min: 28 },
  { key: 'region',          w: 110, min: 60 },
  { key: 'category',        w: 170, min: 60 },
  { key: 'serviceCategory', w: 130, min: 60 },
  { key: 'skuName',         w: 140, min: 60 },
  { key: 'detail',          w: 260, min: 80 },
  { key: 'qty',             w: 44,  min: 36 },
  { key: 'usage',           w: 80,  min: 50 },
  { key: 'payg.unit',       w: 82,  min: 50, group: 'payg' },
  { key: 'payg.monthly',    w: 96,  min: 50, group: 'payg' },
  { key: 'payg.year',       w: 96,  min: 50, group: 'payg' },
  { key: 'sp1.unit',        w: 82,  min: 50, group: 'sp1' },
  { key: 'sp1.monthly',     w: 96,  min: 50, group: 'sp1' },
  { key: 'sp1.year',        w: 96,  min: 50, group: 'sp1' },
  { key: 'sp3.unit',        w: 82,  min: 50, group: 'sp3' },
  { key: 'sp3.monthly',     w: 96,  min: 50, group: 'sp3' },
  { key: 'sp3.year',        w: 96,  min: 50, group: 'sp3' },
  { key: 'ri1.unit',        w: 82,  min: 50, group: 'ri1' },
  { key: 'ri1.monthly',     w: 96,  min: 50, group: 'ri1' },
  { key: 'ri1.year',        w: 96,  min: 50, group: 'ri1' },
  { key: 'ri3.unit',        w: 82,  min: 50, group: 'ri3' },
  { key: 'ri3.monthly',     w: 96,  min: 50, group: 'ri3' },
  { key: 'ri3.year',        w: 96,  min: 50, group: 'ri3' },
  { key: 'action',          w: 100, min: 60 },
];

/**
 * 열 너비 모델 — DOM 비의존. 한 열을 바꿔도 다른 열 값은 건드리지 않는다는
 * 이 파일의 핵심 규칙이 여기 담겨 있다.
 */
export function createColumnModel(columns = COLUMNS) {
  const defs = columns.slice();
  const byKey = {};
  const widths = {};
  defs.forEach((c) => { byKey[c.key] = c; widths[c.key] = c.w; });

  return {
    defs,
    widths,
    /** 하한/상한으로 가둔 뒤 그 열만 기록한다. 반환값 = 실제 적용된 px. */
    setWidth(key, px) {
      const def = byKey[key];
      if (!def) return null;
      const w = Math.max(def.min, Math.min(MAX_WIDTH, Math.round(Number(px) || 0)));
      widths[key] = w;
      return w;
    },
    reset(key) {
      if (key === undefined) { defs.forEach((c) => { widths[c.key] = c.w; }); return null; }
      if (!byKey[key]) return null;
      widths[key] = byKey[key].w;
      return widths[key];
    },
    /** hiddenGroups = ['sp1', …]. 숨긴 그룹의 열은 목록에서 빠진다. */
    visibleColumns(hiddenGroups = []) {
      return defs.filter((c) => !c.group || hiddenGroups.indexOf(c.group) < 0);
    },
    totalWidth(hiddenGroups = []) {
      return this.visibleColumns(hiddenGroups).reduce((sum, c) => sum + widths[c.key], 0);
    },
    /** 저장값 복원 — 범위를 벗어나거나 숫자가 아닌 값은 무시하고 기본값을 지킨다. */
    restore(saved) {
      if (!saved || typeof saved !== 'object') return;
      defs.forEach((c) => {
        const v = Number(saved[c.key]);
        if (isFinite(v) && v >= c.min && v <= MAX_WIDTH) widths[c.key] = Math.round(v);
      });
    },
  };
}

// ================================================================
// 아래부터 DOM 연결부
// ================================================================
const model = createColumnModel();
const colOf = {};           // key -> <col> (보이는 열만)
let $table = null;
let $colgroup = null;

function loadWidths() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch (e) { saved = null; }                 // 손상된 값은 조용히 버리고 기본값을 쓴다
  model.restore(saved);
}
function saveWidths() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(model.widths)); }
  catch (e) { /* 저장 실패(사생활 보호 모드 등)는 화면 동작에 영향 없음 */ }
}

function hiddenGroups() {
  return ['payg', 'sp1', 'sp3', 'ri1', 'ri3'].filter((g) => $table.classList.contains('hide-' + g));
}

/** 열을 숨기거나 다시 보일 때마다 호출해야 col 과 셀의 순서가 맞는다. */
export function syncColgroup() {
  if (!$colgroup) return;
  const hidden = hiddenGroups();
  for (const k in colOf) delete colOf[k];
  $colgroup.innerHTML = '';
  model.visibleColumns(hidden).forEach((c) => {
    const col = document.createElement('col');
    col.dataset.col = c.key;
    col.style.width = model.widths[c.key] + 'px';
    $colgroup.appendChild(col);
    colOf[c.key] = col;
  });
  $table.style.width = model.totalWidth(hidden) + 'px';
}

function applyWidth(key, px) {
  const w = model.setWidth(key, px);
  if (w === null) return;
  // 만지는 건 이 열의 <col> 하나뿐. 나머지 col 의 width 는 건드리지 않는다.
  if (colOf[key]) colOf[key].style.width = w + 'px';
  $table.style.width = model.totalWidth(hiddenGroups()) + 'px';
}

function startDrag(e, key) {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const startW = model.widths[key];
  document.body.classList.add('col-resizing');

  const onMove = (ev) => applyWidth(key, startW + (ev.clientX - startX));
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.classList.remove('col-resizing');
    saveWidths();
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function attachHandles() {
  $table.querySelectorAll('th[data-col]').forEach((th) => {
    const key = th.dataset.col;
    if (!COLUMNS.some((c) => c.key === key)) return;
    if (th.querySelector('.col-resizer')) return;
    const grip = document.createElement('div');
    grip.className = 'col-resizer';
    grip.title = '드래그: 이 열의 너비만 조절 · 더블클릭: 기본 너비로';
    grip.addEventListener('mousedown', (e) => startDrag(e, key));
    // 정렬 헤더 위에 얹혀 있으므로 클릭이 정렬로 새지 않게 막는다
    grip.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    grip.addEventListener('dblclick', (e) => {
      e.preventDefault(); e.stopPropagation();
      applyWidth(key, model.reset(key));
      saveWidths();
    });
    th.appendChild(grip);
  });
}

/** 모든 열을 기본 너비로 되돌린다. */
export function resetColumnWidths() {
  model.reset();
  syncColgroup();
  saveWidths();
}

export function initColumnResize() {
  $table = document.getElementById('mainTable');
  $colgroup = document.getElementById('mainTableCols');
  if (!$table || !$colgroup) return;
  loadWidths();
  syncColgroup();
  attachHandles();
}
