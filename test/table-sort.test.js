// ================================================================
// table-sort.test.js — 열 정렬(보기 전용) (v124)
//
// 핵심 성질: 정렬은 화면 순서만 바꾸고 원본 배열을 건드리지 않는다.
//            그래야 "원본 형태로 보기"가 언제든 정확히 복원된다.
// ================================================================
import { describe, it, expect } from 'vitest';
import { sortRowsForView, nextSortState, sortLabel, SORT_COLUMNS } from '../src/ui/table-sort.js';

// 가격 셀 계산기(ui-and-bootstrap 의 calcGroup 과 같은 모양)
const calcGroup = (item, qty, usage) => {
  if (!item) return null;
  const unit = Number(item.unitPrice);
  const monthly = unit * qty * usage;
  return { unit, monthly, year: monthly * 12 };
};

const mk = (id, o = {}) => ({
  id, region: 'koreacentral', category: '', serviceCategory: 'VM', skuName: '', detail: '',
  qty: 1, usage: 730, paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null, ...o,
});

describe('열 정렬 — 보기 전용', () => {
  it('원본 배열을 재배열하지 않는다(원본 복원의 근거)', () => {
    const rows = [mk(1, { skuName: 'C' }), mk(2, { skuName: 'A' }), mk(3, { skuName: 'B' })];
    const snapshot = rows.map((r) => r.id);
    const view = sortRowsForView(rows, { key: 'skuName', dir: 'asc' }, calcGroup);
    expect(rows.map((r) => r.id)).toEqual(snapshot);       // 원본 그대로
    expect(view).not.toBe(rows);                            // 새 배열
    expect(view.map((r) => r.skuName)).toEqual(['A', 'B', 'C']);
  });

  it('sortState 가 null 이면 원본 순서를 그대로 돌려준다', () => {
    const rows = [mk(1, { skuName: 'C' }), mk(2, { skuName: 'A' })];
    expect(sortRowsForView(rows, null, calcGroup).map((r) => r.id)).toEqual([1, 2]);
  });

  it('텍스트 열 오름/내림차순', () => {
    const rows = [mk(1, { category: '웹' }), mk(2, { category: 'DB' }), mk(3, { category: '앱' })];
    const asc = sortRowsForView(rows, { key: 'category', dir: 'asc' }, calcGroup).map((r) => r.category);
    const desc = sortRowsForView(rows, { key: 'category', dir: 'desc' }, calcGroup).map((r) => r.category);
    expect(desc).toEqual([...asc].reverse());
  });

  it('숫자 열은 문자열이 아니라 수로 비교한다', () => {
    const rows = [mk(1, { qty: 9 }), mk(2, { qty: 10 }), mk(3, { qty: 2 })];
    expect(sortRowsForView(rows, { key: 'qty', dir: 'asc' }, calcGroup).map((r) => r.qty)).toEqual([2, 9, 10]);
  });

  it('가격 열은 계산된 값으로 정렬한다(Qty·사용량 반영)', () => {
    const rows = [
      mk(1, { paygItem: { unitPrice: 10 }, qty: 1, usage: 1 }),   // 월 10
      mk(2, { paygItem: { unitPrice: 1 },  qty: 100, usage: 1 }), // 월 100
      mk(3, { paygItem: { unitPrice: 5 },  qty: 1, usage: 1 }),   // 월 5
    ];
    expect(sortRowsForView(rows, { key: 'payg.monthly', dir: 'asc' }, calcGroup).map((r) => r.id)).toEqual([3, 1, 2]);
    expect(sortRowsForView(rows, { key: 'payg.unit', dir: 'asc' }, calcGroup).map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('값이 없는 행은 오름·내림 어느 쪽이든 뒤로 간다', () => {
    const rows = [mk(1), mk(2, { paygItem: { unitPrice: 5 } }), mk(3), mk(4, { paygItem: { unitPrice: 1 } })];
    const asc = sortRowsForView(rows, { key: 'payg.unit', dir: 'asc' }, calcGroup).map((r) => r.id);
    const desc = sortRowsForView(rows, { key: 'payg.unit', dir: 'desc' }, calcGroup).map((r) => r.id);
    expect(asc).toEqual([4, 2, 1, 3]);
    expect(desc).toEqual([2, 4, 1, 3]);                     // 빈 행은 항상 끝, 그들끼리는 원본 순서
  });

  it('값이 같으면 원본 순서를 유지한다(안정 정렬)', () => {
    const rows = [mk(1, { qty: 5 }), mk(2, { qty: 5 }), mk(3, { qty: 5 })];
    expect(sortRowsForView(rows, { key: 'qty', dir: 'asc' }, calcGroup).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(sortRowsForView(rows, { key: 'qty', dir: 'desc' }, calcGroup).map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('Region 은 화면에 보이는 이름 기준으로 정렬한다', () => {
    const rows = [mk(1, { region: 'westeurope' }), mk(2, { region: 'japaneast' }), mk(3, { region: 'koreacentral' })];
    const view = sortRowsForView(rows, { key: 'region', dir: 'asc' }, calcGroup).map((r) => r.region);
    expect(view[0]).toBe('japaneast');                       // Japan East < Korea Central < West Europe
    expect(view[2]).toBe('westeurope');
  });
});

describe('정렬 상태 순환', () => {
  it('오름차순 → 내림차순 → 원본 순서', () => {
    let st = null;
    st = nextSortState(st, 'qty'); expect(st).toEqual({ key: 'qty', dir: 'asc' });
    st = nextSortState(st, 'qty'); expect(st).toEqual({ key: 'qty', dir: 'desc' });
    st = nextSortState(st, 'qty'); expect(st).toBe(null);    // 원본 형태로 보기
  });

  it('다른 열을 누르면 그 열의 오름차순부터 시작한다', () => {
    const st = nextSortState({ key: 'qty', dir: 'desc' }, 'skuName');
    expect(st).toEqual({ key: 'skuName', dir: 'asc' });
  });

  it('알 수 없는 키는 무시하고 원본 순서를 준다', () => {
    const rows = [mk(1), mk(2)];
    expect(sortRowsForView(rows, { key: '없는열', dir: 'asc' }, calcGroup).map((r) => r.id)).toEqual([1, 2]);
  });

  it('sortLabel 이 현재 상태를 사람 말로 알려준다', () => {
    expect(sortLabel(null)).toBe('원본 순서');
    expect(sortLabel({ key: 'qty', dir: 'asc' })).toContain('오름차순');
    expect(sortLabel({ key: 'payg.year', dir: 'desc' })).toContain('내림차순');
  });

  it('가격 15열 + 일반 7열이 모두 정렬 대상이다', () => {
    const keys = Object.keys(SORT_COLUMNS);
    expect(keys).toHaveLength(7 + 15);
    ['payg.unit', 'sp1.monthly', 'sp3.year', 'ri1.unit', 'ri3.year'].forEach((k) => expect(keys).toContain(k));
  });
});
