// ================================================================
// ui/table-sort.js — 표 열 정렬(보기 전용) (v124)
// ----------------------------------------------------------------
// 정렬은 **화면에 보이는 순서만** 바꾼다. 원본 배열(rows)의 순서는 절대 건드리지
// 않으므로 "원본 형태로 보기"가 언제든 정확히 복원된다.
//   · 헤더를 누르면 오름차순 → 내림차순 → 원본 순서로 순환한다.
//   · 값이 없는 행(가격 미조회 등)은 방향과 무관하게 항상 뒤로 보낸다.
//     (내림차순에서 빈 칸이 위로 몰리면 읽기 어렵다)
//   · JS sort 는 안정 정렬이라 값이 같으면 원본 순서가 유지된다.
// DOM 을 모르는 순수 모듈이라 테스트에서 그대로 쓴다.
// ================================================================
import { REGION_LABEL } from '../core/config.js';

const text = (v) => String(v == null ? '' : v);

// 가격 열: 그룹 5종 × 단가/월/연
const PRICE_GROUPS = [
  { key: 'payg', itemKey: 'paygItem', label: '용량제' },
  { key: 'sp1',  itemKey: 'sp1Item',  label: '절약 1년' },
  { key: 'sp3',  itemKey: 'sp3Item',  label: '절약 3년' },
  { key: 'ri1',  itemKey: 'ri1Item',  label: '예약 1년' },
  { key: 'ri3',  itemKey: 'ri3Item',  label: '예약 3년' },
];
const PRICE_FIELDS = [
  { key: 'unit',    label: 'Unit Price' },
  { key: 'monthly', label: '1 Monthly Cost' },
  { key: 'year',    label: '1 Year Cost' },
];

// key → { label, type, get(row, calcGroup) }
export const SORT_COLUMNS = {
  region:          { label: 'Region',           type: 'text', get: (r) => REGION_LABEL[r.region] || r.region },
  category:        { label: '분류',              type: 'text', get: (r) => r.category },
  serviceCategory: { label: 'Service Category', type: 'text', get: (r) => r.serviceCategory },
  skuName:         { label: 'Service name (SKU)', type: 'text', get: (r) => r.skuName },
  detail:          { label: '상세 사양',          type: 'text', get: (r) => r.detail },
  qty:             { label: 'Qty',              type: 'num',  get: (r) => r.qty },
  usage:           { label: '사용량(Hours)',      type: 'num',  get: (r) => r.usage },
};
PRICE_GROUPS.forEach((g) => {
  PRICE_FIELDS.forEach((f) => {
    SORT_COLUMNS[`${g.key}.${f.key}`] = {
      label: `${g.label} ${f.label}`,
      type: 'num',
      get: (r, calcGroup) => {
        const d = calcGroup(r[g.itemKey], Number(r.qty) || 0, Number(r.usage) || 0);
        return d ? d[f.key] : null;
      },
    };
  });
});

// 값이 비었는가(정렬에서 뒤로 보낼 대상)
function isBlank(v, type) {
  if (v === null || v === undefined) return true;
  if (type === 'num') return !isFinite(Number(v));
  return text(v).trim() === '';
}

/**
 * 화면에 보일 순서를 만든다. rows 는 건드리지 않고 **새 배열**을 돌려준다.
 * @param {Array} rows 원본 행 배열
 * @param {{key:string, dir:'asc'|'desc'}|null} sortState null 이면 원본 순서 그대로
 * @param {Function} calcGroup 가격 열 계산기(ui 에서 주입)
 * @returns {Array} 보기용 배열
 */
export function sortRowsForView(rows, sortState, calcGroup) {
  const list = (rows || []).slice();
  if (!sortState || !SORT_COLUMNS[sortState.key]) return list;

  const col = SORT_COLUMNS[sortState.key];
  const sign = sortState.dir === 'desc' ? -1 : 1;
  const calc = calcGroup || (() => null);

  // 값을 미리 뽑아 둔다(가격 열은 계산 비용이 있어 비교마다 다시 구하면 낭비)
  const keyed = list.map((row, i) => {
    const raw = col.get(row, calc);
    return { row, i, blank: isBlank(raw, col.type), raw };
  });

  keyed.sort((a, b) => {
    if (a.blank !== b.blank) return a.blank ? 1 : -1;   // 빈 값은 방향과 무관하게 뒤로
    if (a.blank) return a.i - b.i;                       // 빈 값끼리는 원본 순서
    let d;
    if (col.type === 'num') d = Number(a.raw) - Number(b.raw);
    else d = text(a.raw).localeCompare(text(b.raw), 'ko');
    if (d === 0) return a.i - b.i;                       // 동률은 원본 순서(안정)
    return d * sign;
  });
  return keyed.map((k) => k.row);
}

/** 헤더 클릭 시 다음 상태: 오름차순 → 내림차순 → 원본 */
export function nextSortState(current, key) {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;                                            // 원본 형태로 복귀
}

export function sortLabel(sortState) {
  if (!sortState) return '원본 순서';
  const col = SORT_COLUMNS[sortState.key];
  return `${col ? col.label : sortState.key} ${sortState.dir === 'asc' ? '오름차순' : '내림차순'}`;
}

/** 상단에 계속 띄우는 문구 — "현재 'Qty' 열 오름차순으로 보는 중" */
export function sortStatusText(sortState) {
  if (!sortState) return '';
  const col = SORT_COLUMNS[sortState.key];
  const name = col ? col.label : sortState.key;
  return `현재 '${name}' 열 ${sortState.dir === 'asc' ? '오름차순' : '내림차순'}으로 보는 중`;
}
