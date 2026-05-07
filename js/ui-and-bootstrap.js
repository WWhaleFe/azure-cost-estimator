let rows = [];
let nextId = 1;
let activeConfigRowId = null;

function blankRow() {
  return {
    id: nextId++,
    region: document.getElementById('defaultRegion').value,
    category: '',
    serviceCategory: '',
    skuName: '',
    detail: '',
    qty: 1,
    usage: Number(document.getElementById('defaultHours').value) || 730,
    options: {},
    paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null,
  };
}

function addRow() { rows.push(blankRow()); render(); }
function removeRow(id) {
  rows = rows.filter(r => r.id !== id);
  if (activeConfigRowId === id) closeConfig();
  render();
}
function duplicateRow(id) {
  const idx = rows.findIndex(r => r.id === id);
  if (idx < 0) return;
  const copy = JSON.parse(JSON.stringify(rows[idx]));
  copy.id = nextId++;
  rows.splice(idx + 1, 0, copy);
  render();
}

const $body = document.getElementById('gridBody');
const $foot = document.getElementById('gridFoot');
const $apiStatus = document.getElementById('apiStatus');

function fmtMoney(n, dp = 2) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtUnit(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

function calcGroup(item, qty, usage) {
  if (!item) return null;
  if (item._billingMode === 'monthly' && typeof item._monthlyTotal === 'number') {
    const monthly = Number(item._monthlyTotal);
    const unit = monthly / 730;
    return { unit, monthly: monthly * qty, year: monthly * qty * 12 };
  }
  const u = Number(item.unitPrice);
  if (isNaN(u)) return null;
  return { unit: u, monthly: u * qty * usage, year: u * qty * usage * 12 };
}

function priceCells(data, hasItem) {
  if (!hasItem || !data) {
    return `<td class="cell-readonly"></td>
            <td class="cell-readonly"></td>
            <td class="cell-readonly"></td>`;
  }
  return `<td class="cell-readonly cell-ok">${fmtUnit(data.unit)}</td>
          <td class="cell-readonly cell-ok">${fmtMoney(data.monthly)}</td>
          <td class="cell-readonly cell-ok">${fmtMoney(data.year)}</td>`;
}

function render() {
  $body.innerHTML = '';
  let totals = { paygM:0, paygY:0, sp1M:0, sp1Y:0, sp3M:0, sp3Y:0, ri1M:0, ri1Y:0, ri3M:0, ri3Y:0 };

  rows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.id = row.id;
    tr.draggable = false;

    const qty = Number(row.qty) || 0;
    const usage = Number(row.usage) || 0;
    const payg = calcGroup(row.paygItem, qty, usage);
    const sp1 = calcGroup(row.sp1Item, qty, usage);
    const sp3 = calcGroup(row.sp3Item, qty, usage);
    const ri1 = calcGroup(row.ri1Item, qty, usage);
    const ri3 = calcGroup(row.ri3Item, qty, usage);

    if (payg) { totals.paygM += payg.monthly; totals.paygY += payg.year; }
    if (sp1)  { totals.sp1M  += sp1.monthly;  totals.sp1Y  += sp1.year; }
    if (sp3)  { totals.sp3M  += sp3.monthly;  totals.sp3Y  += sp3.year; }
    if (ri1)  { totals.ri1M  += ri1.monthly;  totals.ri1Y  += ri1.year; }
    if (ri3)  { totals.ri3M  += ri3.monthly;  totals.ri3Y  += ri3.year; }

    tr.innerHTML = `
      <td class="cell-drag" data-act="drag-handle" title="드래그해서 순서 변경">⋮⋮</td>
      <td class="cell-readonly text-center">${idx + 1}</td>
      ${comboCell(row.id, 'region', REGION_LABEL[row.region] || row.region)}
      <td>
        <input type="text" class="cell-input text-left"
          data-act="freetext" data-id="${row.id}" data-field="category"
          placeholder="예: Web/WAS Server(운영망)"
          value="${escapeHtml(row.category)}" />
      </td>
      ${comboCell(row.id, 'serviceCategory', row.serviceCategory)}
      <td>
        <input type="text" class="cell-input text-left"
          data-act="open-config" data-id="${row.id}"
          ${!row.serviceCategory ? 'disabled style="background:#f3f2f1;color:#a19f9d;cursor:not-allowed;"' : ''}
          placeholder="${row.serviceCategory ? '클릭하여 옵션 선택...' : ''}"
          value="${escapeHtml(row.skuName)}" readonly />
      </td>
      <td>
        <input type="text" class="cell-input text-left"
          data-act="freetext" data-id="${row.id}" data-field="detail"
          placeholder="자동 생성됨"
          value="${escapeHtml(row.detail)}" />
      </td>
      <td><input type="number" min="0" step="any" class="cell-input text-right"
          data-act="num" data-id="${row.id}" data-field="qty" value="${row.qty}" /></td>
      <td><input type="number" min="0" step="1" class="cell-input text-right"
          data-act="num" data-id="${row.id}" data-field="usage" value="${row.usage}" placeholder="730" /></td>
      ${priceCells(payg, !!row.paygItem)}
      ${priceCells(sp1, !!row.sp1Item)}
      ${priceCells(sp3, !!row.sp3Item)}
      ${priceCells(ri1, !!row.ri1Item)}
      ${priceCells(ri3, !!row.ri3Item)}
      <td class="text-center whitespace-nowrap" style="background:#f8fbff;">
        <button class="row-action-btn" data-act="config" data-id="${row.id}" title="옵션 설정">⚙</button>
        <button class="row-action-btn" data-act="dup" data-id="${row.id}" title="행 복사">⎘</button>
        <button class="row-action-btn danger" data-act="del" data-id="${row.id}" title="행 삭제">✕</button>
      </td>
    `;
    $body.appendChild(tr);
  });

  $foot.innerHTML = `
    <tr class="total-row">
      <td colspan="9" style="text-align:right;padding:6px 8px;">Total</td>
      <td class="cell-readonly cell-ok">-</td>
      <td class="cell-readonly cell-ok">${fmtMoney(totals.paygM)}</td>
      <td class="cell-readonly cell-ok">${fmtMoney(totals.paygY)}</td>
      <td class="cell-readonly cell-ok">-</td>
      <td class="cell-readonly cell-ok">${fmtMoney(totals.sp1M)}</td>
      <td class="cell-readonly cell-ok">${fmtMoney(totals.sp1Y)}</td>
      <td class="cell-readonly cell-ok">-</td>
      <td class="cell-readonly cell-ok">${fmtMoney(totals.sp3M)}</td>
      <td class="cell-readonly cell-ok">${fmtMoney(totals.sp3Y)}</td>
      <td class="cell-readonly cell-ok">-</td>
      <td class="cell-readonly cell-ok">${fmtMoney(totals.ri1M)}</td>
      <td class="cell-readonly cell-ok">${fmtMoney(totals.ri1Y)}</td>
      <td class="cell-readonly cell-ok">-</td>
      <td class="cell-readonly cell-ok">${fmtMoney(totals.ri3M)}</td>
      <td class="cell-readonly cell-ok">${fmtMoney(totals.ri3Y)}</td>
      <td></td>
    </tr>
  `;
}

function comboCell(rowId, field, value, disabled = false) {
  return `
    <td>
      <div class="combo-wrap" data-row="${rowId}" data-field="${field}">
        <input type="text" class="cell-input combo-input combo-input-with-arrow text-left"
          ${disabled ? 'disabled style="background:#f3f2f1;color:#a19f9d;cursor:not-allowed;"' : ''}
          data-act="combo-input" data-id="${rowId}" data-field="${field}"
          placeholder="${disabled ? '' : '선택...'}"
          value="${escapeHtml(value)}" autocomplete="off" />
        <div class="combo-list hidden" data-list="${rowId}-${field}"></div>
      </div>
    </td>
  `;
}

function updatePriceCells(row) {
  const tr = $body.querySelector(`tr[data-id="${row.id}"]`);
  if (!tr) return;
  const tds = tr.querySelectorAll('td');
  const qty = Number(row.qty) || 0;
  const usage = Number(row.usage) || 0;

  const groups = [
    { item: row.paygItem, base: 9 },
    { item: row.sp1Item,  base: 12 },
    { item: row.sp3Item,  base: 15 },
    { item: row.ri1Item,  base: 18 },
    { item: row.ri3Item,  base: 21 },
  ];

  groups.forEach(({ item, base }) => {
    if (!tds[base] || !tds[base+1] || !tds[base+2]) return;
    const data = calcGroup(item, qty, usage);
    if (!data) {
      tds[base].className = 'cell-readonly';   tds[base].textContent = '';
      tds[base+1].className = 'cell-readonly'; tds[base+1].textContent = '';
      tds[base+2].className = 'cell-readonly'; tds[base+2].textContent = '';
    } else {
      tds[base].className = 'cell-readonly cell-ok';   tds[base].textContent = fmtUnit(data.unit);
      tds[base+1].className = 'cell-readonly cell-ok'; tds[base+1].textContent = fmtMoney(data.monthly);
      tds[base+2].className = 'cell-readonly cell-ok'; tds[base+2].textContent = fmtMoney(data.year);
    }
  });
}

function updateTotalsRow() {
  let totals = { paygM:0, paygY:0, sp1M:0, sp1Y:0, sp3M:0, sp3Y:0, ri1M:0, ri1Y:0, ri3M:0, ri3Y:0 };
  rows.forEach(row => {
    const qty = Number(row.qty) || 0;
    const usage = Number(row.usage) || 0;
    const add = (item, mKey, yKey) => {
      const d = calcGroup(item, qty, usage);
      if (d) { totals[mKey] += d.monthly; totals[yKey] += d.year; }
    };
    add(row.paygItem, 'paygM', 'paygY');
    add(row.sp1Item, 'sp1M', 'sp1Y');
    add(row.sp3Item, 'sp3M', 'sp3Y');
    add(row.ri1Item, 'ri1M', 'ri1Y');
    add(row.ri3Item, 'ri3M', 'ri3Y');
  });

  const totalRow = $foot.querySelector('tr.total-row');
  if (!totalRow) return;
  const tds = totalRow.querySelectorAll('td');
  const map = [null,'paygM','paygY',null,'sp1M','sp1Y',null,'sp3M','sp3Y',null,'ri1M','ri1Y',null,'ri3M','ri3Y'];
  for (let i = 0; i < map.length; i++) {
    const td = tds[i + 1];
    if (!td) continue;
    if (map[i] === null) td.textContent = '-';
    else td.textContent = fmtMoney(totals[map[i]]);
  }
}

$body.addEventListener('input', (e) => {
  const t = e.target;
  const id = Number(t.dataset.id);
  const r = rows.find(x => x.id === id);
  if (!r) return;
  if (t.dataset.act === 'num') {
    const f = t.dataset.field;
    const raw = String(t.value).trim();
    const n = raw === '' ? 0 : Number(raw);
    r[f] = isNaN(n) ? 0 : n;
    updatePriceCells(r);
    updateTotalsRow();
  } else if (t.dataset.act === 'freetext') {
    r[t.dataset.field] = t.value;
  } else if (t.dataset.act === 'combo-input') {
    onComboInput(r, t.dataset.field, t.value, t);
  }
});

$body.addEventListener('focus', (e) => {
  const t = e.target;
  if (t.dataset.act === 'combo-input') {
    const id = Number(t.dataset.id);
    const r = rows.find(x => x.id === id);
    if (r) onComboInput(r, t.dataset.field, t.value || '', t);
  }
}, true);

$body.addEventListener('click', (e) => {
  const t = e.target;
  if (t.dataset.act === 'dup') duplicateRow(Number(t.dataset.id));
  else if (t.dataset.act === 'del') removeRow(Number(t.dataset.id));
  else if (t.dataset.act === 'config' || t.dataset.act === 'open-config') {
    openConfig(Number(t.dataset.id));
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.combo-wrap') && !e.target.closest('.combo-list')) {
    document.querySelectorAll('.combo-list').forEach(el => el.classList.add('hidden'));
  }
});

window.addEventListener('scroll', () => {
  document.querySelectorAll('.combo-list').forEach(el => el.classList.add('hidden'));
}, true);
window.addEventListener('resize', () => {
  document.querySelectorAll('.combo-list').forEach(el => el.classList.add('hidden'));
});

document.getElementById('btnAddRow').addEventListener('click', addRow);

// [v31] 통화 변경 시 해당 통화 캐시만 삭제 (다른 통화 캐시 유지)
document.getElementById('currencySelect').addEventListener('change', async (e) => {
  const prevCurrency = e.target._prevValue || 'KRW';
  clearCacheForCurrency(prevCurrency);
  e.target._prevValue = e.target.value;
  for (const r of rows) {
    r.paygItem = null; r.sp1Item = null; r.sp3Item = null;
    r.ri1Item = null; r.ri3Item = null;
  }
  render();
  for (const r of rows) {
    if (r.skuName) await tryResolveItem(r);
  }
});
// 초기값 기록
document.getElementById('currencySelect')._prevValue = document.getElementById('currencySelect').value;

document.getElementById('defaultHours').addEventListener('change', (e) => {
  const v = Number(e.target.value) || 730;
  rows.forEach(r => { r.usage = v; });
  render();
});

let dragSrcId = null;
$body.addEventListener('mousedown', (e) => {
  const handle = e.target.closest('[data-act="drag-handle"]');
  if (handle) handle.closest('tr').draggable = true;
});
$body.addEventListener('dragstart', (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  dragSrcId = Number(tr.dataset.id);
  tr.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
$body.addEventListener('dragover', (e) => {
  e.preventDefault();
  const tr = e.target.closest('tr');
  if (!tr) return;
  $body.querySelectorAll('tr').forEach(t => t.classList.remove('drag-over'));
  tr.classList.add('drag-over');
});
$body.addEventListener('drop', (e) => {
  e.preventDefault();
  const tr = e.target.closest('tr');
  if (!tr || dragSrcId === null) return;
  const targetId = Number(tr.dataset.id);
  if (targetId === dragSrcId) return;
  const srcIdx = rows.findIndex(r => r.id === dragSrcId);
  const tgtIdx = rows.findIndex(r => r.id === targetId);
  if (srcIdx < 0 || tgtIdx < 0) return;
  const [moved] = rows.splice(srcIdx, 1);
  rows.splice(tgtIdx, 0, moved);
  render();
});
$body.addEventListener('dragend', () => {
  $body.querySelectorAll('tr').forEach(t => {
    t.classList.remove('dragging'); t.classList.remove('drag-over'); t.draggable = false;
  });
  dragSrcId = null;
});

function onComboInput(row, field, value, inputEl) {
  if (field === 'region') {
    const code = lookupRegionCode(value);
    if (code) row.region = code;
  }
  const candidates = getCandidates(row, field, value);
  showCombo(row.id, field, candidates, inputEl);
}

function lookupRegionCode(label) {
  for (const [code, lbl] of Object.entries(REGION_LABEL)) {
    if (lbl.toLowerCase() === String(label).toLowerCase() || code === label) return code;
  }
  return null;
}

function getCandidates(row, field, typed) {
  const q = (typed || '').toLowerCase();
  const matches = (s) => {
    if (!q) return true;
    const t = String(s || '').toLowerCase();
    return t.startsWith(q) || t.includes(q);
  };
  if (field === 'region') return Object.values(REGION_LABEL).filter(matches);
  if (field === 'serviceCategory') return Object.keys(SERVICE_CATEGORIES).filter(matches);
  return [];
}

function showCombo(rowId, field, options, inputEl) {
  document.querySelectorAll('.combo-list').forEach(el => el.classList.add('hidden'));
  const list = document.querySelector(`[data-list="${rowId}-${field}"]`);
  if (!list) return;
  list.classList.remove('hidden');

  if (inputEl) {
    const rect = inputEl.getBoundingClientRect();
    list.style.left = rect.left + 'px';
    list.style.top = (rect.bottom + 2) + 'px';
    list.style.minWidth = Math.max(rect.width, 200) + 'px';
  }

  if (!options || options.length === 0) {
    list.innerHTML = `<div class="combo-empty">일치하는 항목이 없습니다</div>`;
    return;
  }
  list.innerHTML = options.map(v =>
    `<div class="combo-item" data-pick="${escapeHtml(v)}">${escapeHtml(v)}</div>`
  ).join('');
  list.querySelectorAll('[data-pick]').forEach(el => {
    el.addEventListener('mousedown', async (e) => {
      e.preventDefault();
      const picked = el.dataset.pick;
      const r = rows.find(x => x.id === rowId);
      if (!r) return;
      if (field === 'region') {
        r.region = lookupRegionCode(picked) || r.region;
        list.classList.add('hidden');
        if (r.skuName) await tryResolveItem(r);
        render();
      } else if (field === 'serviceCategory') {
        r.serviceCategory = picked;
        r.skuName = ''; r.detail = ''; r.options = {};
        r.paygItem = null; r.sp1Item = null; r.sp3Item = null;
        r.ri1Item = null; r.ri3Item = null;
        list.classList.add('hidden');
        render();
        openConfig(r.id);
      }
    });
  });
}

const $configPanel = document.getElementById('configPanel');
const $configTitle = document.getElementById('configTitle');
const $configContent = document.getElementById('configContent');

let configDirty = false;
let applyConfigBusy = false;

async function applyConfig() {
  if (applyConfigBusy) return;
  if (!configDirty) return;
  const r = rows.find(x => x.id === activeConfigRowId);
  if (!r) return;
  applyConfigBusy = true;
  try {
    buildSkuAndDetail(r);
    await tryResolveItem(r);
    render();
    configDirty = false;
    const $dirtyBadge = document.getElementById('configDirtyBadge');
    if ($dirtyBadge) $dirtyBadge.style.display = 'none';
  } finally {
    applyConfigBusy = false;
  }
}

document.getElementById('btnCloseConfig').addEventListener('click', async () => {
  if (configDirty) await applyConfig();
  closeConfig();
});
document.getElementById('btnApplyConfig').addEventListener('click', applyConfig);

document.addEventListener('mousedown', async (e) => {
  if (!$configPanel.classList.contains('active')) return;
  if (!configDirty) return;
  if (e.target.closest('#configPanel')) return;
  if (e.target.closest('[data-act="config"]') || e.target.closest('[data-act="open-config"]')) return;
  if (e.target.closest('.combo-list')) return;
  await applyConfig();
});

function openConfig(rowId) {
  const r = rows.find(x => x.id === rowId);
  if (!r || !r.serviceCategory) return;
  if (activeConfigRowId !== null && activeConfigRowId !== rowId && configDirty) {
    applyConfig().finally(() => {
      activeConfigRowId = rowId;
      $configPanel.classList.add('active');
      renderConfigPanel();
    });
    return;
  }
  activeConfigRowId = rowId;
  $configPanel.classList.add('active');
  renderConfigPanel();
}
function closeConfig() {
  activeConfigRowId = null;
  $configPanel.classList.remove('active');
  configDirty = false;
  const $dirtyBadge = document.getElementById('configDirtyBadge');
  if ($dirtyBadge) $dirtyBadge.style.display = 'none';
}

/**
 * 옵션 패널 렌더 (v31)
 *
 * [핵심 버그 수정]
 * 기존: series/storageType 변경 시 r.options.instance 를 초기화하고 render()만 호출
 *       → 패널의 인스턴스 드롭다운이 갱신되지 않음
 * 수정: KEYS_REBUILD_INSTANCE 키 변경 시 renderConfigPanel() 재호출
 *       → 인스턴스 드롭다운이 새로운 상위 옵션 기준으로 즉시 재구성됨
 */
function renderConfigPanel() {
  const r = rows.find(x => x.id === activeConfigRowId);
  if (!r) { closeConfig(); return; }
  const def = SERVICE_CATEGORIES[r.serviceCategory];
  if (!def) { closeConfig(); return; }

  $configTitle.textContent = `${r.serviceCategory} 옵션 (행 #${rows.findIndex(x => x.id === r.id) + 1})`;

  const fields = [];
  def.steps.forEach(step => {
    if (step.type === 'number') {
      const cur = (r.options[step.key] !== undefined && r.options[step.key] !== '')
        ? r.options[step.key]
        : (step.default !== undefined ? step.default : 0);
      fields.push(`
        <div class="config-field">
          <label>${escapeHtml(step.label)}</label>
          <input type="number"
                 data-opt-key="${step.key}"
                 data-opt-type="number"
                 min="${step.min !== undefined ? step.min : 0}"
                 step="${step.step !== undefined ? step.step : 1}"
                 value="${escapeHtml(String(cur))}"
                 style="text-align:right;" />
        </div>
      `);
    } else {
      const sel = r.options[step.key] || '';
      fields.push(`
        <div class="config-field">
          <label>${escapeHtml(step.label)}</label>
          <select data-opt-key="${step.key}">
            <option value="">선택...</option>
            ${step.options.map(opt =>
              `<option value="${escapeHtml(opt)}" ${sel === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
            ).join('')}
          </select>
        </div>
      `);
    }
  });

  // 인스턴스 / 디스크 크기 드롭다운
  // [버그 수정] instanceParentKey 기반으로 현재 상위 옵션 값을 읽어 동적 구성
  if (def.instanceField) {
    let instanceOptions = [];
    if (r.serviceCategory === 'Virtual Machine') {
      const series = r.options.series;
      if (series && VM_INSTANCE_CATALOG[series]) {
        instanceOptions = VM_INSTANCE_CATALOG[series].map(i =>
          ({ value: i.name, label: `${i.name} (vCPU: ${i.vCPU}, RAM: ${i.ram}GB)` })
        );
      }
    } else if (r.serviceCategory === 'Disk') {
      const st = r.options.storageType;
      if (st && DISK_CATALOG[st]) {
        instanceOptions = DISK_CATALOG[st].map(d =>
          ({ value: d.name, label: `${d.name} (${d.size}GB)` })
        );
      }
    }
    const sel = r.options.instance || r.skuName || '';
    const hasOptions = instanceOptions.length > 0;
    fields.push(`
      <div class="config-field" style="grid-column: 1 / -1;">
        <label>인스턴스 / 디스크 크기</label>
        <select data-opt-key="instance" ${!hasOptions ? 'disabled' : ''}>
          <option value="">${!hasOptions ? '상위 옵션을 먼저 선택하세요' : '선택...'}</option>
          ${instanceOptions.map(o =>
            `<option value="${escapeHtml(o.value)}" ${sel === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
          ).join('')}
        </select>
      </div>
    `);
  }

  $configContent.innerHTML = fields.join('');

  // 인스턴스 드롭다운을 재구성해야 하는 상위 키 목록
  // 이 키가 변경되면 renderConfigPanel()을 재호출하여 instance 드롭다운을 즉시 갱신
  const KEYS_REBUILD_INSTANCE = def.instanceParentKey ? [def.instanceParentKey] : [];

  const $dirtyBadge = document.getElementById('configDirtyBadge');
  const markDirty = () => {
    configDirty = true;
    if ($dirtyBadge) $dirtyBadge.style.display = '';
  };
  const clearDirty = () => {
    configDirty = false;
    if ($dirtyBadge) $dirtyBadge.style.display = 'none';
  };
  clearDirty();

  $configContent.querySelectorAll('select[data-opt-key]').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const key = e.target.dataset.optKey;
      r.options[key] = e.target.value;

      // 인스턴스 부모 키가 변경되면 instance 초기화 + 패널 재렌더
      if (KEYS_REBUILD_INSTANCE.includes(key)) {
        r.options.instance = '';
        buildSkuAndDetail(r);
        render();
        // [핵심 수정] 패널을 재렌더하여 instance 드롭다운을 새 옵션으로 즉시 교체
        renderConfigPanel();
        // renderConfigPanel이 clearDirty를 호출하므로 재호출 후 dirty 상태 다시 설정
        markDirty();
        return;
      }

      buildSkuAndDetail(r);
      render();
      markDirty();
    });
  });

  $configContent.querySelectorAll('input[data-opt-type="number"]').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const key = e.target.dataset.optKey;
      const raw = e.target.value;
      r.options[key] = (raw === '' ? 0 : Number(raw));
      if (key === 'gatewayHours') r.usage = Number(raw) || 0;
      buildSkuAndDetail(r);
      render();
      markDirty();
    });
  });
}

function setStatus(kind, msg) {
  const cls = kind === 'ok' ? 'badge badge-ok' : kind === 'error' ? 'badge badge-error' : 'badge badge-loading';
  $apiStatus.innerHTML = `<span class="${cls}">${escapeHtml(msg)}</span>`;
}

document.getElementById('btnExport').addEventListener('click', () => {
  const cur = document.getElementById('currencySelect').value;
  const data = [];

  data.push(['Azure 견적 시뮬레이션']);
  data.push([`통화: ${cur} | 생성: ${new Date().toLocaleString('ko-KR')}`]);
  data.push([]);
  data.push([
    '#', 'Region', '분류', 'Service Category', 'Service name (SKU)', '상세 사양', 'Qty', '사용량(Hours)',
    '용량제 (PAYG)', '', '',
    '절약 플랜 1년', '', '',
    '절약 플랜 3년', '', '',
    '예약 1년', '', '',
    '예약 3년', '', '',
  ]);
  data.push([
    '', '', '', '', '', '', '', '',
    'Unit Price', '1 Monthly Cost', '1 Year cost',
    'Unit Price', '1 Monthly Cost', '1 Year cost',
    'Unit Price', '1 Monthly Cost', '1 Year cost',
    'Unit Price', '1 Monthly Cost', '1 Year cost',
    'Unit Price', '1 Monthly Cost', '1 Year cost',
  ]);

  let totals = { paygM:0, paygY:0, sp1M:0, sp1Y:0, sp3M:0, sp3Y:0, ri1M:0, ri1Y:0, ri3M:0, ri3Y:0 };

  rows.forEach((r, idx) => {
    const qty = Number(r.qty) || 0;
    const usage = Number(r.usage) || 0;
    const calc = (it) => {
      if (!it) return ['', '', ''];
      const d = calcGroup(it, qty, usage);
      if (!d) return ['', '', ''];
      return [d.unit, d.monthly, d.year];
    };
    const [pU, pM, pY] = calc(r.paygItem);
    const [s1U, s1M, s1Y] = calc(r.sp1Item);
    const [s3U, s3M, s3Y] = calc(r.sp3Item);
    const [r1U, r1M, r1Y] = calc(r.ri1Item);
    const [r3U, r3M, r3Y] = calc(r.ri3Item);
    if (typeof pM === 'number') { totals.paygM += pM; totals.paygY += pY; }
    if (typeof s1M === 'number') { totals.sp1M += s1M; totals.sp1Y += s1Y; }
    if (typeof s3M === 'number') { totals.sp3M += s3M; totals.sp3Y += s3Y; }
    if (typeof r1M === 'number') { totals.ri1M += r1M; totals.ri1Y += r1Y; }
    if (typeof r3M === 'number') { totals.ri3M += r3M; totals.ri3Y += r3Y; }
    data.push([
      idx + 1, REGION_LABEL[r.region] || r.region, r.category, r.serviceCategory,
      r.skuName, r.detail, qty, usage,
      pU, pM, pY, s1U, s1M, s1Y, s3U, s3M, s3Y, r1U, r1M, r1Y, r3U, r3M, r3Y,
    ]);
  });

  data.push(['Total', '', '', '', '', '', '', '', '', totals.paygM, totals.paygY, '', totals.sp1M, totals.sp1Y, '', totals.sp3M, totals.sp3Y, '', totals.ri1M, totals.ri1Y, '', totals.ri3M, totals.ri3Y]);
  data.push([]);
  data.push(['[Remark]']);
  data.push(['1. Azure Retail Prices API의 공시 가격이며, EA 등 별도 할인은 반영되지 않습니다.']);
  data.push(['2. 절약 플랜(Savings Plan), 예약(Reservation) 단가는 시간당 환산 단가입니다.']);

  const ws = XLSX.utils.aoa_to_sheet(data);

  const borderAll = {
    top: { style: 'thin', color: { rgb: 'BFBFBF' } },
    bottom: { style: 'thin', color: { rgb: 'BFBFBF' } },
    left: { style: 'thin', color: { rgb: 'BFBFBF' } },
    right: { style: 'thin', color: { rgb: 'BFBFBF' } },
  };
  const titleStyle = { font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '305496' } }, alignment: { horizontal: 'center', vertical: 'center' } };
  const subtitleStyle = { font: { italic: true, sz: 10, color: { rgb: '595959' } }, alignment: { horizontal: 'left' } };
  const groupColors = ['BASE','BASE','BASE','BASE','BASE','BASE','BASE','BASE','PAYG','PAYG','PAYG','SP1','SP1','SP1','SP3','SP3','SP3','RI1','RI1','RI1','RI3','RI3','RI3'];
  const groupHeaderStyles = { 'PAYG':{ fgColor:{ rgb:'2E75B6' } }, 'SP1':{ fgColor:{ rgb:'70AD47' } }, 'SP3':{ fgColor:{ rgb:'548235' } }, 'RI1':{ fgColor:{ rgb:'C55A11' } }, 'RI3':{ fgColor:{ rgb:'843C0C' } }, 'BASE':{ fgColor:{ rgb:'305496' } } };
  const headerCellStyle = (color) => ({ font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: color } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: borderAll });
  const dataCellStyle = { font: { sz: 10 }, alignment: { vertical: 'center', wrapText: true }, border: borderAll };
  const numberCellStyle = { font: { sz: 10 }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: '#,##0.00', border: borderAll };
  const totalRowStyle = { font: { bold: true, sz: 11, color: { rgb: '000000' } }, fill: { fgColor: { rgb: 'FFF2CC' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: { top: { style: 'medium', color: { rgb: '305496' } }, bottom: { style: 'medium', color: { rgb: '305496' } }, left: { style: 'thin', color: { rgb: 'BFBFBF' } }, right: { style: 'thin', color: { rgb: 'BFBFBF' } } }, numFmt: '#,##0.00' };

  if (!ws['A1']) ws['A1'] = { v: 'Azure 견적 시뮬레이션' };
  ws['A1'].s = titleStyle;
  if (ws['A2']) ws['A2'].s = subtitleStyle;

  for (let c = 0; c < 23; c++) {
    const a3 = XLSX.utils.encode_cell({ r: 3, c });
    const a4 = XLSX.utils.encode_cell({ r: 4, c });
    if (!ws[a3]) ws[a3] = { v: '' }; ws[a3].s = headerCellStyle(groupHeaderStyles[groupColors[c]].fgColor.rgb);
    if (!ws[a4]) ws[a4] = { v: '' }; ws[a4].s = headerCellStyle(groupHeaderStyles[groupColors[c]].fgColor.rgb);
  }

  for (let i = 0; i < rows.length; i++) {
    const rowIdx = 5 + i;
    for (let c = 0; c < 23; c++) {
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
      if (!ws[addr]) ws[addr] = { v: '' };
      if (c >= 6 && typeof ws[addr].v === 'number') ws[addr].s = numberCellStyle;
      else ws[addr].s = { ...dataCellStyle, alignment: { ...dataCellStyle.alignment, horizontal: c === 0 ? 'center' : 'left' } };
    }
  }

  const totalRowIdx = 5 + rows.length;
  for (let c = 0; c < 23; c++) {
    const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c });
    if (!ws[addr]) ws[addr] = { v: '' };
    ws[addr].s = totalRowStyle;
  }

  const remarkStartRow = totalRowIdx + 2;
  const remarkAddr = (offset) => XLSX.utils.encode_cell({ r: remarkStartRow + offset, c: 0 });
  if (ws[remarkAddr(0)]) ws[remarkAddr(0)].s = { font: { bold: true, sz: 11 } };

  ws['!cols'] = [
    { wch: 4 }, { wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 36 },
    { wch: 6 }, { wch: 12 },
    { wch: 13 }, { wch: 16 }, { wch: 16 },
    { wch: 13 }, { wch: 16 }, { wch: 16 },
    { wch: 13 }, { wch: 16 }, { wch: 16 },
    { wch: 13 }, { wch: 16 }, { wch: 16 },
    { wch: 13 }, { wch: 16 }, { wch: 16 },
  ];
  ws['!rows'] = [];
  ws['!rows'][0] = { hpt: 28 };
  ws['!rows'][3] = { hpt: 22 };
  ws['!rows'][4] = { hpt: 22 };
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 22 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 22 } },
    ...[0, 1, 2, 3, 4, 5, 6, 7].map(c => ({ s: { r: 3, c }, e: { r: 4, c } })),
    { s: { r: 3, c: 8 },  e: { r: 3, c: 10 } },
    { s: { r: 3, c: 11 }, e: { r: 3, c: 13 } },
    { s: { r: 3, c: 14 }, e: { r: 3, c: 16 } },
    { s: { r: 3, c: 17 }, e: { r: 3, c: 19 } },
    { s: { r: 3, c: 20 }, e: { r: 3, c: 22 } },
    { s: { r: totalRowIdx, c: 0 }, e: { r: totalRowIdx, c: 7 } },
  ];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: remarkStartRow + 3, c: 22 } });
  ws['!freeze'] = { xSplit: 0, ySplit: 5, topLeftCell: 'A6', activePane: 'bottomLeft', state: 'frozen' };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Azure 견적');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  XLSX.writeFile(wb, `azure-quote-${ts}.xlsx`);
});

addRow(); addRow(); addRow();
setStatus('ok', '준비 완료');
bootDiagnostics();
