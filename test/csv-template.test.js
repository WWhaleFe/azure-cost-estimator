// ================================================================
// csv-template.test.js — CSV 견적 양식이 앱 카탈로그와 어긋나지 않도록 고정한다.
//
// 배경: 양식의 옵션 사전은 services/*.ts 의 steps[].options 를 읽어 만드는데, 그 배열은
//       _applyStepVisibility 가 부모 값(tier/model/plan…)에 따라 통째로 갈아끼운다.
//       기본 부모 값의 목록만 실리면 나머지 값은 사전에서 빠지고, 사용자가 그 값을 적어도
//       업로드 시 경고 없이 첫 번째 값으로 대체된다(= 견적이 조용히 틀어진다).
//       그래서 여기서 (1) 예시 행이 전 서비스를 덮는지 (2) 예시 행 값이 실제로 유효한지
//       (3) 저장된 azure-quote-template_file.csv 가 최신인지를 함께 검사한다.
//
// 양식 파일 재생성:  UPDATE_TEMPLATE=1 npx vitest run test/csv-template.test.js
// ================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import '../src/services/all.js';
import { REG, SERVICE_CATEGORIES } from '../src/core/registry.js';
import { REGION_LABEL } from '../src/core/config.js';
import { SERVICE_CATEGORY_ORDER } from '../src/ui/service-order.js';
import {
  CSV_SKU_OPTION_KEY, buildExampleRows, buildOptionGuide, buildTemplateCsv, expandServiceOptions,
} from '../src/ui/csv-template.js';

const TEMPLATE_PATH = fileURLToPath(new URL('../azure-quote-template_file.csv', import.meta.url));
const rows = buildExampleRows();

const parseOptions = (s) => {
  const o = {};
  String(s || '').split(';').forEach((part) => {
    const p = part.trim();
    const eq = p.indexOf('=');
    if (eq > 0) o[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
  });
  return o;
};

describe('CSV 양식 — 예시 행', () => {
  it('모든 서비스 카테고리에 예시 행이 하나 이상 있다', () => {
    const covered = new Set(rows.map((r) => r[2]));
    const missing = SERVICE_CATEGORY_ORDER.filter((c) => !covered.has(c));
    expect(missing, `예시 행 없는 서비스: ${missing.join(', ')}`).toEqual([]);
  });

  it('예시 행의 ServiceCategory·Region 이 모두 실재한다', () => {
    rows.forEach((r) => {
      expect(SERVICE_CATEGORY_ORDER, `알 수 없는 서비스: ${r[2]}`).toContain(r[2]);
      expect(Object.keys(REGION_LABEL), `알 수 없는 Region: ${r[0]}`).toContain(r[0]);
    });
  });

  // 업로드 경로와 같은 판정: 값이 그 부모 조합의 옵션 목록에 없으면 조용히 대체된다.
  it('예시 행의 Options 값이 실제 부모 조합에서 유효하다(대체되지 않는다)', () => {
    const bad = [];
    rows.forEach((r) => {
      const [, memo, cat, sku, , , optStr] = r;
      const def = SERVICE_CATEGORIES[cat];
      if (!def || !def.steps) return;
      const opts = parseOptions(optStr);
      const exp = expandServiceOptions(cat);

      // 이 행의 부모 값과 일치하는 조합을 찾아 그 조합의 옵션 목록으로 검사한다
      const drivers = exp.drivers;
      const combo = exp.combos.find((c) => drivers.every((k) => !opts[k] || c.driver[k] === opts[k]))
        || exp.combos[0];

      def.steps.forEach((s) => {
        const key = s.key;
        const isSkuCol = CSV_SKU_OPTION_KEY[cat] === key;
        const val = isSkuCol ? sku : opts[key];
        if (!val) return;
        const allowed = combo.options[key] || (Array.isArray(s.options) ? s.options : null);
        if (!allowed) return;                                  // 숫자형 등 자유 입력
        if (allowed.indexOf(val) < 0) bad.push(`${memo} [${cat}] ${key}=${val} — 유효: ${allowed.join('|')}`);
      });

      // VM 인스턴스(SKU)는 선택 series 의 카탈로그에 있어야 한다
      if (cat === 'Virtual Machine' && sku) {
        const list = (REG.VM_INSTANCE_CATALOG[opts.series] || []).map((i) => i.name);
        if (list.indexOf(sku) < 0) bad.push(`${memo} [VM] SKU=${sku} 가 series=${opts.series} 에 없음`);
      }
    });
    expect(bad, `양식 예시 행이 업로드 시 대체됨:\n${bad.join('\n')}`).toEqual([]);
  });
});

describe('CSV 양식 — 옵션 사전', () => {
  const guide = buildOptionGuide().join('\n');

  it('부모에 따라 달라지는 값이 사전에 모두 실린다', () => {
    // 대표 사례 — 정의상 기본 목록에는 없고 부모를 바꿔야 나오는 값들
    const mustAppear = [
      'M-series',            // SQL Database: tier=Business Critical 의 hardware
      'Premium-series',      // SQL Database: tier=Hyperscale 의 hardware
      'Edsv5',               // MySQL: tier=Business Critical 의 series
      'Standard Throughput Unit',   // Event Hubs: tier=Standard 의 item
      'Premium Messaging Unit',     // Service Bus: tier=Premium 의 item
      'Dedicated Plan Management',  // Container Apps: plan=Dedicated 의 item
      'Premium Base Fees',          // Front Door: tier=Premium 의 item
    ];
    const missing = mustAppear.filter((v) => guide.indexOf(v) < 0);
    expect(missing, `사전에서 누락된 값: ${missing.join(', ')}`).toEqual([]);
  });

  it('전 서비스가 사전에 한 줄씩 실린다', () => {
    const missing = SERVICE_CATEGORY_ORDER.filter((c) => guide.indexOf(`# ${c} | SKU=`) < 0);
    expect(missing, `사전에 없는 서비스: ${missing.join(', ')}`).toEqual([]);
  });

  it('사전 생성이 서비스 정의(steps[].options)를 훼손하지 않는다', () => {
    // expandServiceOptions 는 _applyStepVisibility 를 실제로 호출하므로 원복이 필수다
    const before = SERVICE_CATEGORY_ORDER.map((c) => JSON.stringify(SERVICE_CATEGORIES[c]?.steps));
    buildOptionGuide();
    const after = SERVICE_CATEGORY_ORDER.map((c) => JSON.stringify(SERVICE_CATEGORIES[c]?.steps));
    expect(after).toEqual(before);
  });
});

describe('CSV 양식 — 저장된 파일', () => {
  it('azure-quote-template_file.csv 가 현재 카탈로그와 일치한다', () => {
    const expected = '﻿' + buildTemplateCsv() + '\n';
    if (process.env.UPDATE_TEMPLATE) {
      writeFileSync(TEMPLATE_PATH, expected, 'utf8');
      return;
    }
    expect(existsSync(TEMPLATE_PATH)).toBe(true);
    const actual = readFileSync(TEMPLATE_PATH, 'utf8');
    expect(
      actual,
      '양식 파일이 오래됐습니다. UPDATE_TEMPLATE=1 npx vitest run test/csv-template.test.js 로 재생성하세요.',
    ).toBe(expected);
  });
});
