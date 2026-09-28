// 열 너비 모델(v130) — 핵심 요구는 "한 열을 조절해도 다른 열 너비는 그대로".
// DOM 연결부(colgroup 렌더·드래그)는 브라우저에서 확인하고, 여기서는 폭 계산 규칙만 본다.
import { describe, it, expect } from 'vitest';
import { createColumnModel, COLUMNS } from '../src/ui/column-resize.js';

describe('열 너비 모델', () => {
  it('한 열을 바꿔도 다른 열 너비는 한 칸도 움직이지 않는다', () => {
    const m = createColumnModel();
    const before = { ...m.widths };
    m.setWidth('detail', 420);

    expect(m.widths.detail).toBe(420);
    Object.keys(before).forEach((k) => {
      if (k === 'detail') return;
      expect(m.widths[k]).toBe(before[k]);
    });
  });

  it('표 전체 폭 = 보이는 열 너비의 합 — 늘린 만큼만 늘어난다', () => {
    const m = createColumnModel();
    const t0 = m.totalWidth();
    m.setWidth('region', m.widths.region + 90);
    expect(m.totalWidth()).toBe(t0 + 90);
  });

  it('하한(min) 아래로는 줄어들지 않는다', () => {
    const m = createColumnModel();
    const min = COLUMNS.find((c) => c.key === 'qty').min;
    m.setWidth('qty', 1);
    expect(m.widths.qty).toBe(min);
  });

  it('상한(900px) 위로는 늘어나지 않는다', () => {
    const m = createColumnModel();
    m.setWidth('detail', 99999);
    expect(m.widths.detail).toBe(900);
  });

  it('숨긴 그룹의 열은 목록과 합계에서 빠진다(그 뒤 열이 밀리지 않도록)', () => {
    const m = createColumnModel();
    const all = m.visibleColumns([]);
    const hidSp1 = m.visibleColumns(['sp1']);

    expect(all).toHaveLength(25);
    expect(hidSp1).toHaveLength(22);
    expect(hidSp1.some((c) => c.group === 'sp1')).toBe(false);

    const sp1Sum = ['sp1.unit', 'sp1.monthly', 'sp1.year'].reduce((s, k) => s + m.widths[k], 0);
    expect(m.totalWidth(['sp1'])).toBe(m.totalWidth([]) - sp1Sum);
  });

  it('숨긴 열도 너비는 기억한다 — 다시 표시하면 조절한 값 그대로', () => {
    const m = createColumnModel();
    m.setWidth('sp1.monthly', 200);
    const hidden = m.totalWidth(['sp1']);
    expect(m.widths['sp1.monthly']).toBe(200);
    expect(m.totalWidth([])).toBe(hidden + m.widths['sp1.unit'] + 200 + m.widths['sp1.year']);
  });

  it('reset(key) 는 그 열만 기본값으로 되돌린다', () => {
    const m = createColumnModel();
    m.setWidth('detail', 400);
    m.setWidth('region', 200);
    m.reset('detail');
    expect(m.widths.detail).toBe(COLUMNS.find((c) => c.key === 'detail').w);
    expect(m.widths.region).toBe(200);
  });

  it('저장값 복원: 범위를 벗어나거나 숫자가 아닌 값은 무시하고 기본값을 지킨다', () => {
    const m = createColumnModel();
    const def = { ...m.widths };
    m.restore({ detail: 300, qty: 1, region: 'abc', usage: 99999, nope: 123 });
    expect(m.widths.detail).toBe(300);       // 정상 범위 → 반영
    expect(m.widths.qty).toBe(def.qty);      // min 미만 → 무시
    expect(m.widths.region).toBe(def.region);// 숫자 아님 → 무시
    expect(m.widths.usage).toBe(def.usage);  // max 초과 → 무시
  });

  it('열 키는 중복 없이 표의 셀 수(25)와 맞는다', () => {
    const keys = COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(25);
  });
});
