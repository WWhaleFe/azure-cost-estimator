// ================================================================
// live-csv-import.test.js — 양식 104행을 실제 API 로 일괄 조회 (RUN_LIVE=1 에서만)
//
// 두 가지를 한 번에 지킨다.
//   1) 양식의 모든 예시 행이 실제로 가격까지 조회되는가(v115 카탈로그 동기화의 최종 확인)
//   2) 동시 실행 풀 + 진행 중 요청 병합이 순차 대비 실제로 빠른가(v117)
// 네트워크가 필요하므로 기본 실행에서는 건너뛴다(CI 제외): RUN_LIVE=1 npm test
// ※ 실제 네트워크·프록시 상태에 좌우된다. direct 가 일시적으로 실패하면
//    activeProxyIndex 가 느린 공개 프록시로 넘어가 수 분이 걸릴 수 있다(회귀가 아님).
// ================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';

const LIVE = process.env.RUN_LIVE === '1';
const d = LIVE ? describe : describe.skip;

globalThis.document = { getElementById: () => ({ value: 'KRW' }) };

let buildSkuAndDetail, tryResolveItem, apiCache, CSV_SKU_OPTION_KEY;
beforeAll(async () => {
  await import('../src/services/all.js');
  ({ buildSkuAndDetail, tryResolveItem } = await import('../src/core/resolver-engine.js'));
  ({ apiCache } = await import('../src/core/network.js'));
  ({ CSV_SKU_OPTION_KEY } = await import('../src/ui/csv-template.js'));
});

// 따옴표를 존중하는 CSV 한 줄 분해(양식에는 "tier=Standard; metric=규칙 (시간당, 5개 포함)" 같은 필드가 있다)
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}
const parseOpts = (s) => {
  const o = {};
  String(s || '').split(';').forEach((p) => { const q = p.trim(), e = q.indexOf('='); if (e > 0) o[q.slice(0, e).trim()] = q.slice(e + 1).trim(); });
  return o;
};

function templateRows() {
  const csv = readFileSync(new URL('../azure-quote-template_file.csv', import.meta.url), 'utf8');
  return csv.replace(/^﻿/, '').split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map(splitCsv).filter((f) => f[0] !== 'Region' && f[2])
    .map((f) => {
      const options = parseOpts(f[6]);
      const k = CSV_SKU_OPTION_KEY[f[2]];
      if (f[3] && k) options[k] = f[3];
      return { region: f[0], category: f[1], serviceCategory: f[2], qty: Number(f[4]) || 1, usage: Number(f[5]) || 730,
               options, skuName: '', detail: '', paygItem: null, sp1Item: null, sp3Item: null, ri1Item: null, ri3Item: null };
    });
}

async function resolveAll(concurrency) {
  apiCache.clear();
  const rows = templateRows();
  rows.forEach(buildSkuAndDetail);            // 공유 def 를 만지므로 조회 전에 동기로 끝낸다
  const t0 = performance.now();
  const q = rows.slice();
  const worker = async () => { for (;;) { const r = q.shift(); if (!r) return; try { await tryResolveItem(r); } catch { /* resolver 가 상태로 처리 */ } } };
  await Promise.all(Array.from({ length: Math.min(concurrency, q.length) }, worker));
  return { ms: performance.now() - t0, rows };
}

d('양식 전 행 라이브 조회 (RUN_LIVE=1)', () => {
  it('104행이 모두 가격까지 조회되고, 동시 실행이 순차보다 빠르다', async () => {
    const par = await resolveAll(6);
    const seq = await resolveAll(1);

    const failed = par.rows.filter((r) => !r.paygItem)
      .map((r) => `${r.serviceCategory} / ${r.category}`);
    expect(failed, `가격 미조회 행:\n${failed.join('\n')}`).toEqual([]);
    expect(par.rows.length).toBeGreaterThan(100);

    console.log(`\n  ${par.rows.length}행 일괄 조회 — 순차 ${(seq.ms / 1000).toFixed(1)}초 → 동시 6개 ${(par.ms / 1000).toFixed(1)}초 (${(seq.ms / par.ms).toFixed(1)}×)`);
    expect(par.ms).toBeLessThan(seq.ms);
  }, 600000);
});
