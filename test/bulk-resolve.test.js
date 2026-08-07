// ================================================================
// bulk-resolve.test.js — 일괄 조회 + 빈칸 자동 재조회 (v121)
//
// 배경: 일괄 조회 중에는 프록시 전환·스로틀링(429)·타임아웃 같은 일시적 실패가
//       섞여 가격 칸이 빈 채로 남는 행이 생긴다. 예전에는 그대로 끝나서 사용자가
//       직접 행을 다시 건드려야 했다. 이제 끝난 뒤 빈칸만 골라 최대 3회 더 조회한다.
// ================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

let attempts = new Map();          // row.id → 시도 횟수
let succeedAfter = new Map();      // row.id → N회차부터 성공(없으면 계속 실패)

vi.mock('../src/core/resolver-engine.js', () => ({
  isRowResolvable: (r) => !!(r.serviceCategory && r.skuName),
  tryResolveItem: vi.fn(async (row) => {
    const n = (attempts.get(row.id) || 0) + 1;
    attempts.set(row.id, n);
    await new Promise((r) => setTimeout(r, 1));
    const need = succeedAfter.get(row.id);
    row.paygItem = (need !== undefined && n >= need) ? { unitPrice: 1 } : null;
  }),
}));

const { resolveRowsWithRetry, summarize, isRowEmpty } = await import('../src/ui/bulk-resolve.js');

const mk = (id, opts = {}) => ({ id, serviceCategory: 'X', skuName: 'S' + id, options: {},
  paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null, ...opts });

beforeEach(() => { attempts = new Map(); succeedAfter = new Map(); });

describe('빈칸 자동 재조회', () => {
  it('첫 조회에서 다 채워지면 재조회하지 않는다', async () => {
    const rows = [mk(1), mk(2), mk(3)];
    rows.forEach((r) => succeedAfter.set(r.id, 1));
    const res = await resolveRowsWithRetry(rows);
    expect(res.resolved).toBe(3);
    expect(res.failed).toEqual([]);
    expect(res.rounds).toBe(0);                       // 재조회 라운드 없음
    rows.forEach((r) => expect(attempts.get(r.id)).toBe(1));
  });

  it('일시적으로 실패한 행만 다시 조회한다(성공한 행은 건드리지 않음)', async () => {
    const rows = [mk(1), mk(2), mk(3)];
    succeedAfter.set(1, 1);                            // 1행: 처음부터 성공
    succeedAfter.set(2, 2);                            // 2행: 2회차에 성공
    succeedAfter.set(3, 3);                            // 3행: 3회차에 성공
    const res = await resolveRowsWithRetry(rows);
    expect(res.failed).toEqual([]);
    expect(attempts.get(1)).toBe(1);                   // 성공한 행은 재조회 안 함
    expect(attempts.get(2)).toBe(2);
    expect(attempts.get(3)).toBe(3);
  });

  it('끝내 실패한 행은 최대 라운드까지만 시도하고 목록으로 돌려준다', async () => {
    const rows = [mk(1), mk(2)];
    succeedAfter.set(1, 1);                            // 성공
    // 2행은 계속 실패
    const res = await resolveRowsWithRetry(rows, { retryRounds: 3 });
    expect(res.total).toBe(2);
    expect(res.resolved).toBe(1);
    expect(res.failed.map((r) => r.id)).toEqual([2]);
    expect(attempts.get(2)).toBeLessThanOrEqual(1 + 3);
  });

  it('한 라운드에서 하나도 못 건지면 조기 종료한다(무의미한 반복 방지)', async () => {
    const rows = [mk(1)];                              // 계속 실패
    const res = await resolveRowsWithRetry(rows, { retryRounds: 3 });
    expect(attempts.get(1)).toBe(2);                   // 최초 1 + 재조회 1회에서 중단
    expect(res.rounds).toBe(1);
  });

  it('retryRounds=0 이면 재조회하지 않는다', async () => {
    const rows = [mk(1)];
    const res = await resolveRowsWithRetry(rows, { retryRounds: 0 });
    expect(attempts.get(1)).toBe(1);
    expect(res.failed).toHaveLength(1);
  });

  it('설정이 덜 된 행은 대상에서 빼고, 실패로도 세지 않는다', async () => {
    const rows = [mk(1, { skuName: '' }), mk(2, { serviceCategory: '' }), mk(3)];
    succeedAfter.set(3, 1);
    const res = await resolveRowsWithRetry(rows);
    expect(res.total).toBe(1);                         // 3번만 대상
    expect(res.failed).toEqual([]);
    expect(attempts.has(1)).toBe(false);
    expect(attempts.has(2)).toBe(false);
  });

  it('진행 상황을 initial → retry 순으로 알린다', async () => {
    const rows = [mk(1), mk(2)];
    succeedAfter.set(1, 1); succeedAfter.set(2, 2);
    const phases = [];
    await resolveRowsWithRetry(rows, { onProgress: (p) => phases.push(p.phase) });
    expect(phases[0]).toBe('initial');
    expect(phases).toContain('retry');
  });

  // 진행 팝업이 "무엇을 조회 중인지" 보여주려면 진행 중인 행 목록이 필요하다(v122)
  it('진행 중인 행 목록(active)을 함께 알려준다', async () => {
    const rows = [mk(1), mk(2), mk(3), mk(4)];
    rows.forEach((r) => succeedAfter.set(r.id, 1));
    const seen = [];
    await resolveRowsWithRetry(rows, { lanes: 2, onProgress: (p) => seen.push(p.active) });
    expect(seen.length).toBeGreaterThan(0);
    seen.forEach((a) => expect(Array.isArray(a)).toBe(true));
    // 레인 수를 넘지 않고, 최소 한 번은 실제로 조회 중인 행이 담긴다
    expect(Math.max(...seen.map((a) => a.length))).toBeGreaterThan(0);
    expect(Math.max(...seen.map((a) => a.length))).toBeLessThanOrEqual(2);
  });

  it('재조회 라운드에서도 active 를 알려준다', async () => {
    const rows = [mk(1)];
    succeedAfter.set(1, 2);                            // 2회차에 성공 → 재조회 라운드 발생
    const retryActives = [];
    await resolveRowsWithRetry(rows, { onProgress: (p) => { if (p.phase === 'retry') retryActives.push(p.active); } });
    expect(retryActives.some((a) => a.length > 0)).toBe(true);
  });

  it('summarize 가 남은 빈칸을 알려준다', () => {
    expect(summarize({ total: 3, resolved: 3, failed: [], rounds: 0 })).toContain('3행 조회 완료');
    const s = summarize({ total: 3, resolved: 2, failed: [{}], rounds: 2 });
    expect(s).toContain('1행');
    expect(s).toContain('재조회 2회');
  });

  it('isRowEmpty 는 가격이 없는 행을 가리킨다', () => {
    expect(isRowEmpty({ paygItem: null })).toBe(true);
    expect(isRowEmpty({ paygItem: { unitPrice: 1 } })).toBe(false);
  });
});
