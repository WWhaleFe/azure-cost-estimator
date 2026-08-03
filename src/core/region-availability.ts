// ================================================================
// core/region-availability.ts — SKU 리전 가용성 공용 헬퍼
// ----------------------------------------------------------------
// 특정 SKU/항목이 현재 리전에 없어 매칭 실패했을 때, 리전 필터 없이 전-리전을 조회해
// "이 리전 미제공 · 지원 리전 → …" 안내를 만들 수 있게 한다. VM·App Service 등이 공유.
// ================================================================
import { apiFetch } from './network.js';
import type { ApiItem } from './types.js';

// baseFilters(리전 필터 없이)로 Consumption 을 전-리전 조회 → matchFn 을 통과한 항목의 리전 집합
export async function probeRegions(
  baseFilters: Record<string, any>,
  cur: string,
  matchFn: (it: ApiItem) => boolean = () => true,
): Promise<string[]> {
  try {
    const items: ApiItem[] = await apiFetch(
      { ...baseFilters, priceType: 'Consumption' }, cur, 1000, 3,
      { pageSize: 1000, expectedSizeKB: 150 },
    );
    const set = new Set<string>();
    for (const it of items) {
      if (String(it.type || '').toLowerCase() !== 'consumption') continue;
      if (!matchFn(it)) continue;
      if (it.armRegionName) set.add(String(it.armRegionName));
    }
    return Array.from(set).sort();
  } catch (e) { console.warn('리전 가용성 조회 실패:', e); return []; }
}

// 지원 리전 목록 → 현재 리전 미제공 여부 + 안내 문구(라벨 매핑 적용, 최대 6개 + '외 N개')
export function regionHint(
  regions: string[], here: string, labelOf: (r: string) => string,
): { unavailable: boolean; known: boolean; text: string } {
  const hereLabel = labelOf(here) || here;
  if (regions.length && regions.indexOf(here) < 0) {
    const labeled = regions.map(labelOf);
    const shown = labeled.slice(0, 6).join(', ');
    const more = labeled.length > 6 ? ` 외 ${labeled.length - 6}개` : '';
    return { unavailable: true, known: true, text: `'${hereLabel}' 리전에서 미제공 · 지원 리전 → ${shown}${more}` };
  }
  return { unavailable: false, known: regions.length > 0, text: '' };
}
