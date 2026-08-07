// ================================================================
// core/network.js — CORS 폴백 + apiFetch
// 수정 대상: 프록시 폴백 로직, OData 필터 빌더, 캐시 로직
// ESM: 가변 상태(apiCache/activeProxyIndex)를 이 모듈이 소유한다.
//      activeProxyIndex 는 라이브 export(diagnostics 가 읽음).
// ================================================================
import { API_BASE, API_VERSION, CORS_PROXIES } from './config.js';
import type { ApiItem, ProxyEntry, PriceFilters } from './types.js';

export const apiCache = new Map<string, ApiItem[]>();
export let activeProxyIndex = 0;

// 진행 중인 요청(URL → Promise). apiCache 는 요청이 "끝난 뒤에만" 채워지므로,
// 같은 URL 을 동시에 요청하면 캐시가 비어 있는 사이 전부 네트워크로 나간다.
// 행을 동시에 조회하면 이런 겹침이 흔하다 — 한 서비스의 여러 행은 보통
// (serviceName, region) 만으로 URL 이 같다(예: Front Door 4행 = 216KB × 4).
// 같은 URL 이 이미 떠 있으면 그 Promise 를 그대로 돌려줘 한 번만 나가게 한다.
const inFlight = new Map<string, Promise<ApiItem[]>>();

// ── 빈 결과 음성 캐시 (v119) ──
// apiCache 는 items.length>0 일 때만 채운다. 그래서 "0건" 응답(그 리전에 없는 SKU 등)은
// 캐시되지 않아, 같은 실패 조회가 화면을 다시 그릴 때마다 매번 네트워크로 나갔다.
// 실패 경로는 성공 경로보다 무거우므로(probeRegions 235KB) 반복 비용이 크다.
// 0건도 짧게 기억해 두되, 카탈로그가 바뀌면 스스로 풀리도록 TTL 을 짧게 둔다.
const NEGATIVE_TTL_MS = 60000;
const negativeCache = new Map<string, number>();   // url → 만료 시각

function validateApiResponse(data: any): { ok: boolean; reason?: string } {
  if (!data || typeof data !== 'object') return { ok:false, reason:'not an object' };
  if (!Array.isArray(data.Items))         return { ok:false, reason:'no Items array' };
  if (typeof data.Count === 'number' && data.Count > data.Items.length*2 && !data.NextPageLink)
    return { ok:false, reason:`truncated (Count=${data.Count}, Items=${data.Items.length})` };
  return { ok:true };
}

// ── 계단식 타임아웃 (v118) ──
// 기존엔 프록시마다 25초 고정이라 최악 7×25=175초를 기다렸다. 첫 시도는 짧게 끊어
// 죽은 경로를 빨리 버리고, 뒤로 갈수록 여유를 준다(느리지만 살아 있는 경로 구제).
// 한 URL 전체에도 상한을 둬서 "언젠간 끝난다"를 보장한다.
const ATTEMPT_TIMEOUT_MS = [10000, 15000, 20000];   // 시도 차수별 제한(마지막 값이 이후 전부)
const TOTAL_BUDGET_MS = 60000;                       // 한 URL 에 쓰는 전체 상한

function attemptTimeout(attempt: number, expectedSizeKB: number): number {
  const base = ATTEMPT_TIMEOUT_MS[Math.min(attempt, ATTEMPT_TIMEOUT_MS.length-1)];
  // 대용량 응답(probeRegions 235KB·Front Door 216KB)은 느린 회선에서 더 걸린다
  return expectedSizeKB >= 100 ? Math.round(base*1.5) : base;
}

// ── 프록시 쿨다운 (v118) ──
// 기존엔 성공한 프록시를 activeProxyIndex 에 눌러 담고 되돌리는 장치가 없었다.
// direct 가 한 번 실패해 느린 공개 프록시로 넘어가면 그 뒤 모든 요청이 그 경로로
// 가서 전체가 느려졌다(실측: 같은 작업이 374초). 이제 실패한 프록시만 한동안
// 뒤로 미루고, 쿨다운이 끝나면 원래 우선순위로 자동 복귀한다.
const PROXY_COOLDOWN_MS = 60000;        // 1회 실패 시
const PROXY_COOLDOWN_MAX_MS = 300000;   // 연속 실패해도 이 이상은 안 미룸
const proxyCooldownUntil: number[] = CORS_PROXIES.map(()=>0);
const proxyFailStreak: number[] = CORS_PROXIES.map(()=>0);

// 그룹 안에서는 CORS_PROXIES 원래 순서(우선순위)를 유지한다 →
// 쿨다운이 풀리면 vercel-fn·direct 가 다시 1순위로 돌아온다.
function getProxyOrder(expectedSizeKB: number): number[] {
  const now = Date.now();
  const all = CORS_PROXIES.map((p,i)=>({p,i}));
  const sizeOk = (x: {p:ProxyEntry;i:number}) => !expectedSizeKB || expectedSizeKB<=0 || (x.p.sizeKB||Infinity)>=expectedSizeKB;
  const cooling = (x: {p:ProxyEntry;i:number}) => proxyCooldownUntil[x.i] > now;
  return [
    ...all.filter(x=> sizeOk(x) && !cooling(x)),   // 크기 OK · 정상
    ...all.filter(x=> sizeOk(x) &&  cooling(x)),   // 크기 OK · 쿨다운 중(최후 수단)
    ...all.filter(x=>!sizeOk(x) && !cooling(x)),   // 크기 부족 · 정상
    ...all.filter(x=>!sizeOk(x) &&  cooling(x)),
  ].map(x=>x.i);
}

// ── 업스트림 동시 요청 상한 (v120) ──
// 행 6개를 동시에 조회해도 행마다 Consumption·Reservation 을 병렬로 던지므로 실제
// 동시 요청은 12건까지 뛴다. 브라우저 실측 결과 그 수준에서 Azure API 가 429 를
// 돌려주고(공유 IP 인 Vercel 함수 경유에선 더 쉽게), 그게 프록시 실패로 처리돼
// 오히려 전체가 느려졌다(프로덕션 161초). 실측상 동시 3건까지는 429 가 없었다.
const MAX_CONCURRENT = 4;
let running = 0;
const waiters: (()=>void)[] = [];
async function acquireSlot(): Promise<void> {
  while (running >= MAX_CONCURRENT) await new Promise<void>(r=>waiters.push(r));
  running++;
}
function releaseSlot(): void { running--; const w = waiters.shift(); if (w) w(); }

// 429/503 은 "이 프록시가 고장났다"가 아니라 "잠시 뒤 다시"라는 뜻이다.
// 쿨다운 대상으로 삼으면 가장 빠른 경로가 유배돼 되레 느려진다(v118 의 부작용).
class RateLimited extends Error {
  constructor(public retryAfterMs: number) { super('rate limited'); this.name = 'RateLimited'; }
}
const MAX_RATE_RETRIES = 3;
const sleep = (ms: number) => new Promise(r=>setTimeout(r, ms));

async function fetchOnce(targetUrl: string, proxy: ProxyEntry, timeoutMs: number): Promise<any> {
  // AbortController 로 실제로 끊는다. 예전 Promise.race 방식은 타이머만 이겼을 뿐
  // fetch 는 계속 살아 있어, 브라우저의 호스트당 연결 수(약 6개)를 죽은 요청이
  // 점유해 뒤따르는 조회까지 느려졌다.
  const ac = new AbortController();
  const timer = setTimeout(()=>ac.abort(), timeoutMs);
  try {
    const res = await fetch(proxy.url(targetUrl), { method:'GET', signal:ac.signal });
    if (!res.ok) {
      if (res.status === 429 || res.status === 503) {
        const ra = Number(res.headers.get('retry-after'));
        throw new RateLimited(isFinite(ra) && ra > 0 ? ra*1000 : 0);
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    if (!text || text.length < 10) throw new Error('empty response');
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`JSON parse error (${text.length}B)`); }
    if (proxy.wrap && data?.contents) {
      try { data = JSON.parse(data.contents); }
      catch { throw new Error('wrapped JSON parse error'); }
    }
    const v = validateApiResponse(data);
    if (!v.ok) throw new Error(`invalid OData: ${v.reason}`);
    return data;
  } catch (err: any) {
    if (ac.signal.aborted) throw new Error(`timeout ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWithCorsFallback(targetUrl: string, expectedSizeKB = 0): Promise<any> {
  await acquireSlot();                       // 대기 시간은 아래 예산에 넣지 않는다
  try { return await runFallback(targetUrl, expectedSizeKB); }
  finally { releaseSlot(); }
}

async function runFallback(targetUrl: string, expectedSizeKB: number): Promise<any> {
  const errors = [];
  const startedAt = Date.now();
  const order = getProxyOrder(expectedSizeKB);
  let rateRetries = 0;
  for (let attempt = 0; attempt < order.length; attempt++) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining <= 500) { errors.push(`전체 제한 ${TOTAL_BUDGET_MS}ms 초과`); break; }
    const idx = order[attempt];
    const proxy = CORS_PROXIES[idx];
    try {
      const data = await fetchOnce(targetUrl, proxy, Math.min(attemptTimeout(attempt, expectedSizeKB), remaining));
      if (idx !== activeProxyIndex)
        console.log(`✓ 프록시 전환: ${proxy.name}`);
      activeProxyIndex = idx;
      proxyFailStreak[idx] = 0;
      proxyCooldownUntil[idx] = 0;
      return data;
    } catch(err: any) {
      // 스로틀링은 같은 프록시로 잠깐 뒤 재시도(쿨다운 대상 아님)
      if (err instanceof RateLimited && rateRetries < MAX_RATE_RETRIES) {
        rateRetries++;
        const base = err.retryAfterMs || Math.min(500 * 2**(rateRetries-1), 4000);
        await sleep(Math.round(base * (0.5 + Math.random())));   // 지터 — 동시에 몰려 재시도하지 않게
        attempt--;
        continue;
      }
      proxyFailStreak[idx]++;
      proxyCooldownUntil[idx] = Date.now() +
        Math.min(PROXY_COOLDOWN_MS * 2**(proxyFailStreak[idx]-1), PROXY_COOLDOWN_MAX_MS);
      errors.push(`${proxy.name}: ${err.message}`);
      console.warn(`프록시 [${proxy.name}] 실패: ${err.message}`);
    }
  }
  throw new Error(`모든 프록시 실패: ${errors.join(' | ')}`);
}

// 진단/테스트용 — 쿨다운 상태를 비운다(프록시 상태를 처음으로 되돌림)
export function resetProxyHealth(): void {
  for (let i = 0; i < CORS_PROXIES.length; i++) { proxyCooldownUntil[i] = 0; proxyFailStreak[i] = 0; }
  activeProxyIndex = 0;
}

function buildApiUrl(filters: PriceFilters, currencyCode: string, pageSize: number): string {
  const fp = [];
  for (const [k,v] of Object.entries(filters)) {
    if (v===undefined||v===null||v==='') continue;
    if (k==='__raw') {
      (Array.isArray(v)?v:[v]).forEach(e=>{ if(e) fp.push(String(e)); });
    } else {
      fp.push(`${k} eq '${String(v).replace(/'/g,"''")}'`);
    }
  }
  const params = new URLSearchParams();
  params.set('api-version', API_VERSION);
  if (currencyCode) params.set('currencyCode', currencyCode);
  if (fp.length)    params.set('$filter', fp.join(' and '));
  if (pageSize>0)   params.set('$top', String(pageSize));
  return `${API_BASE}?${params}`;
}

export async function apiFetch(filters: PriceFilters, currencyCode = 'KRW', maxItems = 1000, maxPages = 5, opts: { pageSize?: number; expectedSizeKB?: number } = {}): Promise<ApiItem[]> {
  const targetUrl = buildApiUrl(filters, currencyCode, opts.pageSize||0);
  if (apiCache.has(targetUrl)) {
    const c = apiCache.get(targetUrl);
    if (Array.isArray(c) && c.length>0) return c;
    apiCache.delete(targetUrl);
  }
  const negUntil = negativeCache.get(targetUrl);
  if (negUntil !== undefined) {
    if (negUntil > Date.now()) return [];
    negativeCache.delete(targetUrl);
  }

  const pending = inFlight.get(targetUrl);
  if (pending) return pending;

  const run = (async (): Promise<ApiItem[]> => {
    const items: ApiItem[] = [];
    let nextUrl: string|null = targetUrl, pages = 0;
    while (nextUrl && items.length<maxItems && pages<maxPages) {
      const data = await fetchWithCorsFallback(nextUrl, opts.expectedSizeKB||0);
      if (Array.isArray(data.Items)) items.push(...data.Items);
      nextUrl = data.NextPageLink || null;
      pages++;
    }
    // 성공적으로 응답을 받았을 때만 기록한다(네트워크 실패는 throw 로 빠져 여기 안 옴)
    if (items.length>0) { apiCache.set(targetUrl, items); negativeCache.delete(targetUrl); }
    else negativeCache.set(targetUrl, Date.now() + NEGATIVE_TTL_MS);
    return items;
  })();

  inFlight.set(targetUrl, run);
  try { return await run; }
  finally { inFlight.delete(targetUrl); }   // 성공·실패 모두 정리(실패는 다음 호출이 재시도)
}

export function clearCacheForCurrency(currencyCode: string): void {
  const kw = `currencyCode=${currencyCode}`;
  let n = 0;
  for (const k of [...apiCache.keys()]) {
    if (k.includes(kw)) { apiCache.delete(k); n++; }
  }
  // 음성 캐시(0건 기억)도 같이 비운다 — 안 그러면 통화를 바꿔도 "조회 안 됨"이 남는다
  for (const k of [...negativeCache.keys()]) {
    if (k.includes(kw)) negativeCache.delete(k);
  }
  console.log(`[캐시] ${currencyCode} ${n}건 삭제`);
}

// 진단/테스트용 — 음성 캐시(0건 기억)를 비운다
export function clearNegativeCache(): void { negativeCache.clear(); }
