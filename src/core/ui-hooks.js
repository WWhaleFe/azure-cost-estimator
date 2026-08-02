// ================================================================
// core/ui-hooks.js — resolver/서비스 → UI 역호출 간접층
// ----------------------------------------------------------------
// 서비스 resolve 함수와 resolver-engine 은 setStatus / updatePriceCells /
// updateTotalsRow / showToast 를 호출한다. 실제 구현은 ui-and-bootstrap.js 에 있어
// 순환 의존이 생기므로, 여기 얇은 간접층을 두고 UI 가 부팅 시 구현을 등록한다.
// (호출부 코드는 setStatus(...) 그대로 — import 대상만 이 파일이 됨)
// ================================================================
const impl = {
  setStatus: () => {},
  updatePriceCells: () => {},
  updateTotalsRow: () => {},
  showToast: () => {},
};

// UI 가 부팅 시 실제 구현을 등록
export function registerUIHooks(hooks) {
  Object.assign(impl, hooks);
}

export function setStatus(kind, msg) { return impl.setStatus(kind, msg); }
export function updatePriceCells(row) { return impl.updatePriceCells(row); }
export function updateTotalsRow() { return impl.updateTotalsRow(); }
export function showToast(msg, kind) { return impl.showToast(msg, kind); }
