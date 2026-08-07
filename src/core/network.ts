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

function validateApiResponse(data: any): { ok: boolean; reason?: string } {
  if (!data || typeof data !== 'object') return { ok:false, reason:'not an object' };
  if (!Array.isArray(data.Items))         return { ok:false, reason:'no Items array' };
  if (typeof data.Count === 'number' && data.Count > data.Items.length*2 && !data.NextPageLink)
    return { ok:false, reason:`truncated (Count=${data.Count}, Items=${data.Items.length})` };
  return { ok:true };
}

async function fetchOnce(targetUrl: string, proxy: ProxyEntry, timeoutMs = 25000): Promise<any> {
  const fp = fetch(proxy.url(targetUrl), { method:'GET' }).then(async res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  });
  return Promise.race([fp, new Promise((_,rej)=>setTimeout(()=>rej(new Error(`timeout ${timeoutMs}ms`)),timeoutMs))]);
}

function getProxyOrder(expectedSizeKB: number): number[] {
  if (!expectedSizeKB || expectedSizeKB<=0)
    return CORS_PROXIES.map((_,i)=>(activeProxyIndex+i)%CORS_PROXIES.length);
  const wi = CORS_PROXIES.map((p,i)=>({p,i}));
  return [
    ...wi.filter(x=>(x.p.sizeKB||Infinity)>=expectedSizeKB),
    ...wi.filter(x=>(x.p.sizeKB||Infinity)< expectedSizeKB),
  ].map(x=>x.i);
}

export async function fetchWithCorsFallback(targetUrl: string, expectedSizeKB = 0): Promise<any> {
  const errors = [];
  for (const idx of getProxyOrder(expectedSizeKB)) {
    const proxy = CORS_PROXIES[idx];
    try {
      const data = await fetchOnce(targetUrl, proxy);
      if (idx !== activeProxyIndex)
        console.log(`✓ 프록시 전환: ${proxy.name}`);
      activeProxyIndex = idx;
      return data;
    } catch(err: any) {
      errors.push(`${proxy.name}: ${err.message}`);
      console.warn(`프록시 [${proxy.name}] 실패: ${err.message}`);
    }
  }
  throw new Error(`모든 프록시 실패: ${errors.join(' | ')}`);
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
    if (items.length>0) apiCache.set(targetUrl, items);
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
  console.log(`[캐시] ${currencyCode} ${n}건 삭제`);
}
