// core/resolver-helpers.js 순수 함수 단위 테스트 (픽스처 불필요 — 결정론적)
import { describe, it, expect } from 'vitest';
import {
  normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv,
} from '../src/core/resolver-helpers.js';

describe('normalizeReservationPrice', () => {
  it('선불 예약 총액을 시간당 단가로 환산(1년=8760h)', () => {
    // unitPrice=총액(선불), retailPrice 동일 → up/rp=1 (>1000 아님) → up/h
    const item = { unitPrice: 8760, retailPrice: 8760, unitOfMeasure: '1 Year' };
    const r = normalizeReservationPrice(item, 1);
    expect(r.unitPrice).toBeCloseTo(1, 6);       // 8760/8760
    expect(r.retailPrice).toBeCloseTo(1, 6);
    expect(r._termYears).toBe(1);
    expect(r.unitOfMeasure).toBe('1 Hour (normalized)');
    expect(r._originalUnitPrice).toBe(8760);
  });

  it('3년 예약은 3*8760 으로 나눔', () => {
    const r = normalizeReservationPrice({ unitPrice: 26280, retailPrice: 26280 }, 3);
    expect(r.unitPrice).toBeCloseTo(1, 6);       // 26280/(3*8760)
  });

  it('이미 시간당(up/rp>1000)이면 retailPrice 사용', () => {
    // up=2000000, rp=1000 → up/rp=2000>1000 → hp=rp=1000
    const r = normalizeReservationPrice({ unitPrice: 2000000, retailPrice: 1000 }, 1);
    expect(r.unitPrice).toBe(1000);
  });
});

describe('makeSpItem', () => {
  it('base 메타 + savingsPlan 단가로 SavingsPlan 항목 생성', () => {
    const base = { currencyCode: 'KRW', armRegionName: 'koreacentral', productName: 'P',
      skuName: 'S', armSkuName: 'AS', meterName: 'M', unitOfMeasure: '1 Hour' };
    const sp = { unitPrice: 12.5, retailPrice: 12.5, term: '1 Year' };
    const it = makeSpItem(base, sp);
    expect(it.type).toBe('SavingsPlan');
    expect(it.unitPrice).toBe(12.5);
    expect(it.skuName).toBe('S');
    expect(it.term).toBe('1 Year');
  });
});

describe('spItemsFromBase', () => {
  const base = {
    armRegionName: 'kc', productName: 'P', skuName: 'S', meterName: 'M',
    savingsPlan: [
      { term: '1 Year', unitPrice: 10 },
      { term: '3 Years', unitPrice: 6 },
    ],
  };
  it('mult 배해 1년/3년 시간당 단가 추출', () => {
    const { sp1, sp3 } = spItemsFromBase(base, 2, 'KRW');
    expect(sp1.unitPrice).toBe(20);   // 10*2
    expect(sp3.unitPrice).toBe(12);   // 6*2
    expect(sp1.unitOfMeasure).toBe('1 Hour');
    expect(sp1.type).toBe('SavingsPlan');
  });
  it('savingsPlan 없으면 null 쌍', () => {
    expect(spItemsFromBase({}, 1, 'KRW')).toEqual({ sp1: null, sp3: null });
    expect(spItemsFromBase(null, 1, 'KRW')).toEqual({ sp1: null, sp3: null });
  });
  it('단가 0 이하는 건너뜀', () => {
    const b = { savingsPlan: [{ term: '1 Year', unitPrice: 0 }] };
    expect(spItemsFromBase(b, 1, 'KRW').sp1).toBeNull();
  });
});

describe('riItemsFromResv', () => {
  const resv = [
    { type: 'Reservation', skuName: 's', reservationTerm: '1 Year', unitPrice: 8760, armRegionName: 'kc', productName: 'P', meterName: 'M' },
    { type: 'Reservation', skuName: 's', reservationTerm: '3 Years', unitPrice: 26280, armRegionName: 'kc', productName: 'P', meterName: 'M' },
    { type: 'Consumption', skuName: 's', reservationTerm: '1 Year', unitPrice: 999 }, // 무시
  ];
  it('skuName 일치 + 1년/3년 골라 시간당×mult', () => {
    const { ri1, ri3 } = riItemsFromResv(resv, 's', 1, 'KRW');
    expect(ri1.unitPrice).toBeCloseTo(1, 6);   // 8760/8760
    expect(ri3.unitPrice).toBeCloseTo(1, 6);   // 26280/(3*8760)
    expect(ri1.type).toBe('Reservation');
  });
  it('skuName 불일치면 null', () => {
    const { ri1 } = riItemsFromResv(resv, 'other', 1, 'KRW');
    expect(ri1).toBeNull();
  });
  it('mult 반영', () => {
    const { ri1 } = riItemsFromResv(resv, 's', 4, 'KRW');
    expect(ri1.unitPrice).toBeCloseTo(4, 6);
  });
});
