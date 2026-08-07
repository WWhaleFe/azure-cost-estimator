// ================================================================
// ui/progress-modal.js — 일괄 조회 진행 팝업 (v122)
// ----------------------------------------------------------------
// 조회 중 무엇을 조회하는지 보여주고, 끝날 때까지 배경 조작을 막는다.
// <dialog>.showModal() 을 쓰므로 배경 클릭·포커스 이동·스크롤이 브라우저 차원에서
// 차단된다(직접 만든 오버레이보다 확실하고, 키보드 접근성도 함께 얻는다).
// Esc 로 닫히는 기본 동작은 조회 중에는 막고, 완료 후에만 허용한다.
//
// bulk-resolve.js 는 DOM 을 모르는 순수 모듈로 두고(테스트 대상), 여기서 감싼다.
// ================================================================
import { resolveRowsWithRetry, summarize } from './bulk-resolve.js';

const $ = (id) => document.getElementById(id);

function els() {
  return {
    dlg: $('progressDialog'), title: $('progressTitle'), count: $('progressCount'),
    fill: $('progressFill'), phase: $('progressPhase'), active: $('progressActive'),
    result: $('progressResult'), hint: $('progressHint'), close: $('btnProgressClose'),
  };
}

// 행을 사람이 알아볼 수 있는 한 줄로
export function rowLabel(r) {
  if (!r) return '';
  const what = r.skuName || (r.options && (r.options.diskSubType || r.options.item || r.options.metric)) || '';
  const memo = r.category ? ` (${r.category})` : '';
  return `${r.serviceCategory}${what ? ' · ' + what : ''}${memo}`;
}

let busy = false;
let autoCloseTimer = null;

// 완료 후 자동 닫힘까지의 시간(성공만 있을 때). 결과를 한 번 볼 여유는 남긴다.
const AUTO_CLOSE_MS = 2000;

function onCancel(e) { if (busy) e.preventDefault(); }   // 조회 중 Esc 차단

function open(title) {
  const e = els();
  if (!e.dlg) return null;
  if (autoCloseTimer) { clearInterval(autoCloseTimer); autoCloseTimer = null; }
  busy = true;
  e.title.textContent = title;
  e.count.textContent = '';
  e.fill.style.width = '0%';
  e.fill.className = 'progress-bar-fill';
  e.phase.textContent = '준비 중...';
  e.active.innerHTML = '';
  e.result.hidden = true;
  e.result.innerHTML = '';
  e.hint.textContent = '조회가 끝날 때까지 화면을 수정할 수 없습니다.';
  e.close.disabled = true;
  e.dlg.addEventListener('cancel', onCancel);
  if (!e.dlg.open) e.dlg.showModal();
  return e;
}

function update(e, p) {
  if (!e) return;
  const total = p.total || 0;
  const done = p.done || 0;
  if (p.phase === 'initial') {
    e.count.textContent = total ? `${done} / ${total}` : '';
    e.fill.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
    e.phase.textContent = '가격을 조회하고 있습니다.';
  } else {
    // 재조회 라운드는 남은 행 기준으로 표시(전체 진행률은 이미 100%)
    e.count.textContent = `남은 ${p.remaining}행`;
    e.fill.style.width = '100%';
    e.phase.textContent = `빈칸 재조회 중... (${p.round}/${p.rounds} 회차)`;
  }
  const list = (p.active || []).slice(0, 6);
  e.active.innerHTML = list.map((r) => `<li>${escapeHtml(rowLabel(r))}</li>`).join('')
    || '<li style="color:#a19f9d">대기 중...</li>';
}

function finish(e, result, notes) {
  busy = false;
  if (!e) return;
  const failedN = result.failed.length;
  e.title.textContent = failedN ? '조회 완료 (일부 실패)' : '조회 완료';
  e.count.textContent = `${result.resolved} / ${result.total}`;
  e.fill.style.width = '100%';
  e.fill.className = 'progress-bar-fill ' + (failedN ? 'partial' : 'done');
  e.phase.textContent = summarize(result);
  e.active.innerHTML = '';

  const parts = [
    `<div><span class="ok">조회 성공 ${result.resolved}행</span>` +
    (failedN ? ` · <span class="fail">조회 실패 ${failedN}행</span>` : '') + '</div>',
  ];
  (notes || []).forEach((n) => parts.push(`<div class="note">${escapeHtml(n)}</div>`));
  if (failedN) {
    parts.push(`<div class="note" style="margin-top:8px;">가격을 찾지 못한 행 (재조회 ${result.rounds}회 시도)</div>`);
    parts.push('<ul class="progress-fail-list">' +
      result.failed.map((r) => `<li>${escapeHtml(rowLabel(r))}</li>`).join('') + '</ul>');
  }
  e.result.innerHTML = parts.join('');
  e.result.hidden = false;
  e.close.disabled = false;
  e.close.focus();

  // 전부 성공했으면 읽을 게 없으므로 잠시 뒤 자동으로 닫는다(v125).
  // 실패가 있으면 목록을 읽어야 하므로 자동으로 닫지 않는다.
  if (failedN) {
    e.hint.textContent = '실패한 행은 옵션·리전을 확인해 주세요.';
    return;
  }
  let left = Math.round(AUTO_CLOSE_MS / 1000);
  const tick = () => {
    e.hint.textContent = `${left}초 후 자동으로 닫힙니다.`;
    if (left <= 0) { closeNow(); return; }
    left--;
  };
  tick();
  autoCloseTimer = setInterval(tick, 1000);
}

// 팝업 닫기(자동·수동 공통) — 타이머와 cancel 가드를 함께 정리한다
function closeNow() {
  if (autoCloseTimer) { clearInterval(autoCloseTimer); autoCloseTimer = null; }
  const d = els().dlg;
  if (!d) return;
  d.removeEventListener('cancel', onCancel);
  if (d.open) d.close();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// 닫기 버튼은 한 번만 묶는다(모듈 로드 시)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', bindClose);
  bindClose();
}
function bindClose() {
  const e = els();
  if (!e.close || e.close._bound) return;
  e.close._bound = true;
  e.close.addEventListener('click', closeNow);
}

/**
 * 진행 팝업을 띄운 채 일괄 조회를 수행한다.
 * @param {string} title 팝업 제목(예: 'CSV 불러오기')
 * @param {Array} rows 조회 대상 행
 * @param {{lanes?:number, retryRounds?:number, notes?:string[], onTick?:Function}} opts
 * @returns {Promise<object>} resolveRowsWithRetry 의 결과
 */
export async function resolveWithProgressModal(title, rows, opts = {}) {
  const e = open(title);
  try {
    const result = await resolveRowsWithRetry(rows, {
      lanes: opts.lanes,
      retryRounds: opts.retryRounds,
      onProgress: (p) => { update(e, p); if (opts.onTick) opts.onTick(p); },
    });
    finish(e, result, opts.notes);
    return result;
  } catch (err) {
    // 예기치 못한 실패에도 팝업이 잠기지 않게 반드시 풀어준다
    busy = false;
    if (autoCloseTimer) { clearInterval(autoCloseTimer); autoCloseTimer = null; }
    if (e) {
      e.title.textContent = '조회 중 오류';
      e.phase.textContent = String((err && err.message) || err).slice(0, 200);
      e.hint.textContent = '';
      e.close.disabled = false;
    }
    throw err;
  }
}
