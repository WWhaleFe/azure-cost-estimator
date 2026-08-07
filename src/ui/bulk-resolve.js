// ================================================================
// ui/bulk-resolve.js — 여러 행 일괄 조회 + 빈칸 자동 재조회 (v121)
// ----------------------------------------------------------------
// CSV 불러오기와 통화 변경이 같은 일을 각자 하고 있었다(하나는 6레인 풀, 다른 하나는
// 순차 루프). 여기로 모으고, **모든 조회가 끝난 뒤 남은 빈칸을 자동으로 재조회**한다.
//
// 왜 재조회가 필요한가
//   일괄 조회 중에는 프록시 전환·스로틀링(429)·타임아웃 같은 일시적 실패가 섞인다.
//   그런 행은 가격 칸이 빈 채로 남는데, 잠시 뒤 다시 물어보면 대개 성공한다.
//
// 왜 재조회가 싸게 끝나는가
//   확정적 실패(그 리전에 없는 SKU·옵션 조합 불일치)는 이미 캐시가 받아준다 —
//   응답이 0건이면 음성 캐시(network.js, 60초), 응답은 왔는데 매칭만 실패했으면
//   apiCache 가 그대로 재사용된다. 즉 재조회의 네트워크 비용은 **일시적 실패 행에만**
//   발생한다. 그래서 확정 실패가 많아도 라운드가 빠르게 끝난다.
// ================================================================
import { tryResolveItem, isRowResolvable } from '../core/resolver-engine.js';

export const BULK_LANES = 6;      // 동시에 조회할 행 수(실제 요청 수는 network.js 세마포어가 제한)
export const RETRY_ROUNDS = 3;    // 빈칸 재조회 라운드 수

export function isRowEmpty(r) { return !r.paygItem; }

// 동시 실행 풀 — 행 하나씩 await 하면 대기 시간이 그대로 합산된다.
// active 집합으로 "지금 조회 중인 행"을 밖에 알려준다(진행 팝업이 표시).
async function runPool(rows, lanes, onEvent) {
  const queue = rows.slice();
  const active = new Set();
  async function worker() {
    for (;;) {
      const r = queue.shift();
      if (!r) return;
      active.add(r);
      if (onEvent) onEvent('start', r, active);
      try { await tryResolveItem(r); }
      catch (e) { /* 개별 행 실패는 각 resolver 가 상태로 처리 */ }
      active.delete(r);
      if (onEvent) onEvent('done', r, active);
    }
  }
  await Promise.all(Array.from({ length: Math.min(lanes, queue.length) }, worker));
}

/**
 * 행들을 일괄 조회하고, 끝난 뒤 빈칸만 골라 최대 retryRounds 회 더 조회한다.
 * @param {Array} rows 대상 행(설정이 덜 된 행은 자동 제외)
 * @param {{lanes?:number, retryRounds?:number, onProgress?:Function}} opts
 *        onProgress({phase:'initial'|'retry', done, total, round, rounds, remaining})
 * @returns {Promise<{total:number, resolved:number, failed:Array, rounds:number}>}
 */
export async function resolveRowsWithRetry(rows, opts = {}) {
  const lanes = opts.lanes || BULK_LANES;
  const rounds = opts.retryRounds === undefined ? RETRY_ROUNDS : opts.retryRounds;
  const onProgress = opts.onProgress || function () {};

  const targets = (rows || []).filter(isRowResolvable);
  if (targets.length === 0) return { total: 0, resolved: 0, failed: [], rounds: 0 };

  let done = 0;
  await runPool(targets, lanes, function (type, row, active) {
    if (type === 'done') done++;
    onProgress({ phase: 'initial', done, total: targets.length, active: Array.from(active) });
  });

  let pending = targets.filter(isRowEmpty);
  let usedRounds = 0;
  for (let round = 1; round <= rounds && pending.length > 0; round++) {
    // 일시적 실패가 가라앉을 시간을 준다(프록시 쿨다운 전환·429 백오프).
    // 지터를 섞어 여러 재조회가 같은 순간에 몰리지 않게 한다.
    const wait = Math.round(700 * Math.pow(2, round - 1) * (0.5 + Math.random()));
    await new Promise(function (r) { setTimeout(r, wait); });

    onProgress({ phase: 'retry', round, rounds, remaining: pending.length, active: [] });
    const roundTotal = pending.length;
    await runPool(pending, lanes, function (type, row, active) {
      onProgress({ phase: 'retry', round, rounds, remaining: roundTotal, active: Array.from(active) });
    });

    const before = pending.length;
    pending = pending.filter(isRowEmpty);
    usedRounds = round;
    // 이번 라운드에서 하나도 못 건졌으면 더 해도 같은 결과일 가능성이 높다
    if (pending.length === before) break;
  }

  return { total: targets.length, resolved: targets.length - pending.length, failed: pending, rounds: usedRounds };
}

// 상태 표시줄용 요약 문구
export function summarize(result) {
  if (result.failed.length === 0) return `${result.resolved}행 조회 완료`;
  return `${result.resolved}/${result.total}행 조회 완료 · ${result.failed.length}행은 가격을 찾지 못했습니다` +
         (result.rounds ? ` (재조회 ${result.rounds}회 시도)` : '');
}
