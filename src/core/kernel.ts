// ================================================================
// core/kernel.js — 서비스가 import 하는 단일 파사드
// ----------------------------------------------------------------
// services/*.js 는 이 파일에서 필요한 심볼을 한 줄로 가져온다:
//   import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow,
//            showToast, normalizeReservationPrice, makeSpItem,
//            spItemsFromBase, riItemsFromResv } from '../core/kernel.js';
// 등록은 REG 에, UI 역호출은 ui-hooks 파사드를 통해 이뤄진다.
// ================================================================
export { REG, SERVICE_CATEGORIES } from './registry.js';
export { apiFetch, clearCacheForCurrency } from './network.js';
export {
  normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv,
  pickTieredMeter, tierNote,
} from './resolver-helpers.js';
export { probeRegions, regionHint } from './region-availability.js';
export {
  setStatus, updatePriceCells, updateTotalsRow, showToast,
} from './ui-hooks.js';
export type { ApiItem, Row, ServiceDef, Step, SpPair, RiPair } from './types.js';
