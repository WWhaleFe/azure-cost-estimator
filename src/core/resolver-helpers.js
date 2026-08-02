// ================================================================
// core/resolver-helpers.js — 가격 정규화 순수 함수 모음
// (구 resolver-engine.js 상단부: 서비스들이 kernel 로부터 import)
// UI/DOM/네트워크 의존 없음 → 단위 테스트 대상.
// ================================================================

export function normalizeReservationPrice(item, years) {
  const up=Number(item.unitPrice), rp=Number(item.retailPrice||item.unitPrice), h=years*8760;
  const hp = rp>0 && up/rp>1000 ? rp : up/h;
  return {...item, unitPrice:hp, retailPrice:hp, unitOfMeasure:'1 Hour (normalized)',
          _originalUnitPrice:up, _originalUnitOfMeasure:item.unitOfMeasure, _termYears:years};
}
export function makeSpItem(base, sp) {
  return { unitPrice:Number(sp.unitPrice), retailPrice:Number(sp.retailPrice||sp.unitPrice),
    currencyCode:base.currencyCode, type:'SavingsPlan',
    armRegionName:base.armRegionName, productName:base.productName,
    skuName:base.skuName, armSkuName:base.armSkuName,
    meterName:base.meterName, unitOfMeasure:base.unitOfMeasure, term:sp.term };
}

// ── per-단가(× mult) 컴퓨팅 모델 공용 절약/예약 추출 (SQL·MySQL·Synapse) ──
// base(용량제 Consumption 항목)의 savingsPlan에서 1년/3년 항목을 mult배해 시간당 단가로 생성.
// 엔진 기본 계산(월=단가×Qty×usage)에 맞춰 unitOfMeasure='1 Hour'로 통일.
export function spItemsFromBase(base, mult, cur) {
  var out = { sp1:null, sp3:null };
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
export function riItemsFromResv(resvItems, skuLower, mult, cur) {
  function pick(years, re) {
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
