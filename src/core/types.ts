// ================================================================
// core/types.ts — 공유 타입 정의 (TS 점진 도입)
// 동적 접근이 많은 API 데이터는 index signature 로 유연성 유지.
// ================================================================

/** Azure Retail Prices API 단일 항목 */
export interface ApiItem {
  currencyCode?: string;
  unitPrice?: number;
  retailPrice?: number;
  armRegionName?: string;
  armSkuName?: string;
  productName?: string;
  skuName?: string;
  meterName?: string;
  unitOfMeasure?: string;
  type?: string;
  reservationTerm?: string;
  tierMinimumUnits?: number;
  savingsPlan?: Array<{ term?: string; unitPrice?: number; retailPrice?: number }>;
  // 서비스 resolver 가 붙이는 파생 필드 + 미열거 필드 허용
  [k: string]: unknown;
}

/** 화면 견적 행 */
export interface Row {
  id?: number;
  region: string;
  category?: string;
  serviceCategory: string;
  skuName: string;
  detail?: string;
  qty?: number;
  usage?: number;
  options: Record<string, any>;
  paygItem: ApiItem | null;
  sp1Item: ApiItem | null;
  sp3Item: ApiItem | null;
  ri1Item: ApiItem | null;
  ri3Item: ApiItem | null;
  [k: string]: unknown;
}

/** 옵션 패널 스텝 정의 */
export interface Step {
  key: string;
  label?: string;
  options?: string[];
  type?: string;
  default?: unknown;
  min?: number;
  step?: number;
  tooltip?: string;
  _hidden?: boolean;
}

/** 서비스 카테고리 정의 */
export interface ServiceDef {
  apiServiceName?: string;
  steps?: Step[];
  instanceField?: boolean;
  instanceParentKey?: string;
  rebuildKeys?: string[];
  _applyStepVisibility?: (r: Row) => void;
  [k: string]: any;
}

/** CORS 프록시 항목 */
export interface ProxyEntry {
  name: string;
  wrap: boolean;
  sizeKB: number;
  url: (t: string) => string;
}

/** apiFetch OData 필터 (키=값 eq, __raw 는 원시 조건) */
export type PriceFilters = Record<string, unknown>;

/** SavingsPlan/Reservation 추출 결과 쌍 */
export interface SpPair { sp1: ApiItem | null; sp3: ApiItem | null; }
export interface RiPair { ri1: ApiItem | null; ri3: ApiItem | null; }

/** 서비스 레지스트리 — 정의/조회함수/카탈로그를 담는 동적 네임스페이스 */
export interface Registry {
  _svcDefs: Record<string, ServiceDef>;
  [k: string]: any;
}
