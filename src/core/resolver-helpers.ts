// ================================================================
// core/resolver-helpers.ts — 가격 정규화 순수 함수 모음
// (구 resolver-engine 상단부: 서비스들이 kernel 로부터 import)
// UI/DOM/네트워크 의존 없음 → 단위 테스트 대상.
// ================================================================
import type { ApiItem, SpPair, RiPair } from './types.js';

export function normalizeReservationPrice(item: ApiItem, years: number): ApiItem {
  const up=Number(item.unitPrice), rp=Number(item.retailPrice||item.unitPrice), h=years*8760;
  const hp = rp>0 && up/rp>1000 ? rp : up/h;
  return {...item, unitPrice:hp, retailPrice:hp, unitOfMeasure:'1 Hour (normalized)',
          _originalUnitPrice:up, _originalUnitOfMeasure:item.unitOfMeasure, _termYears:years};
}
export function makeSpItem(base: ApiItem, sp: { term?: string; unitPrice?: number; retailPrice?: number }): ApiItem {
  return { unitPrice:Number(sp.unitPrice), retailPrice:Number(sp.retailPrice||sp.unitPrice),
    currencyCode:base.currencyCode, type:'SavingsPlan',
    armRegionName:base.armRegionName, productName:base.productName,
    skuName:base.skuName, armSkuName:base.armSkuName,
    meterName:base.meterName, unitOfMeasure:base.unitOfMeasure, term:sp.term };
}

// ── per-단가(× mult) 컴퓨팅 모델 공용 절약/예약 추출 (SQL·MySQL·Synapse) ──
// base(용량제 Consumption 항목)의 savingsPlan에서 1년/3년 항목을 mult배해 시간당 단가로 생성.
// 엔진 기본 계산(월=단가×Qty×usage)에 맞춰 unitOfMeasure='1 Hour'로 통일.
export function spItemsFromBase(base: ApiItem | null | undefined, mult: number, cur: string): SpPair {
  var out: SpPair = { sp1:null, sp3:null };
  if (!base || !Array.isArray(base.savingsPlan)) return out;
  for (var i = 0; i < base.savingsPlan.length; i++) {
    var sp = base.savingsPlan[i], t = String(sp.term||'').toLowerCase();
    var p = Number(sp.unitPrice) * mult;
    if (!(p > 0)) continue;
    var it = { currencyCode:cur, unitPrice:p, retailPrice:p, armRegionName:base.armRegionName,
      productName:base.productName, skuName:base.skuName, meterName:base.meterName,
      unitOfMeasure:'1 Hour', type:'SavingsPlan', term:sp.term };
    if      ((/1\s*year/.test(t) || t === '1' || t.indexOf('1 ') === 0) && !out.sp1) out.sp1 = it;
    else if ((/3\s*year/.test(t) || t === '3' || t.indexOf('3 ') === 0) && !out.sp3) out.sp3 = it;
  }
  return out;
}
// 예약(Reservation priceType 항목 배열)에서 skuName 일치 + 1년/3년을 골라
// normalizeReservationPrice로 시간당 단가로 환산한 뒤 mult배해 생성.
export function riItemsFromResv(resvItems: ApiItem[], skuLower: string, mult: number, cur: string): RiPair {
  function pick(years: number, re: RegExp): ApiItem | null {
    var c = (resvItems||[]).filter(function(it){
      if (String(it.type||'').toLowerCase() !== 'reservation') return false;
      if (skuLower && String(it.skuName||'').toLowerCase() !== skuLower) return false;
      return re.test(String(it.reservationTerm||''));
    }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); })[0];
    if (!c) return null;
    var hourly = Number(normalizeReservationPrice(c, years).unitPrice) * mult;
    if (!(hourly > 0)) return null;
    return { currencyCode:cur, unitPrice:hourly, retailPrice:hourly, armRegionName:c.armRegionName,
      productName:c.productName, skuName:c.skuName, meterName:c.meterName, unitOfMeasure:'1 Hour',
      type:'Reservation', term:c.reservationTerm };
  }
  return { ri1:pick(1, /1\s*year/i), ri3:pick(3, /3\s*year/i) };
}

// ── 구간(tier) 요금 미터에서 대표 단가 고르기 ──
// Retail Prices API 는 한 미터를 tierMinimumUnits 로 나눠 여러 건으로 돌려준다.
// 첫 구간(tierMinimumUnits=0)이 0원인 미터가 있는데, 이건 요율이 아니라 **무료 허용량**이다.
//   예) Service Bus Standard Messaging Operations — 첫 13M 무료, 이후 1,227.68/1M
//       Service Bus Hybrid Connections Data Transfer — 첫 5GB 무료, 이후 1,534.6/GB
//       Front Door Standard Included Routing Rules — 5개 포함, 이후 46.038/시간
// 첫 구간을 그대로 쓰면 견적이 통째로 0원이 되므로, **0원이 아닌 가장 낮은 구간**을 고른다.
// (전 구간이 0원인 미터는 그대로 0원 — 실제로 무료인 항목)
export function pickTieredMeter(cands: ApiItem[] | null | undefined): ApiItem | null {
  if (!cands || !cands.length) return null;
  const sorted = cands.slice().sort(function (a, b) {
    return (Number(a.tierMinimumUnits || 0) - Number(b.tierMinimumUnits || 0))
        || (Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
  });
  for (let i = 0; i < sorted.length; i++) if (Number(sorted[i].unitPrice || 0) > 0) return sorted[i];
  return sorted[0];
}

// 무료 허용량을 건너뛰고 유료 구간을 골랐을 때 사용자에게 보여줄 꼬리말
export function tierNote(chosen: ApiItem | null): string {
  const min = Number(chosen && chosen.tierMinimumUnits || 0);
  return min > 0 ? ` (${min} 초과분 단가 · 그 이하는 무료)` : '';
}
