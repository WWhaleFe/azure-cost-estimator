// ================================================================
// core/network.js — CORS 폴백 + apiFetch
// 수정 대상: 프록시 폴백 로직, OData 필터 빌더, 캐시 로직
// ESM: 가변 상태(apiCache/activeProxyIndex)를 이 모듈이 소유한다.
//      activeProxyIndex 는 라이브 export(diagnostics 가 읽음).
// ================================================================
import { API_BASE, API_VERSION, CORS_PROXIES } from './config.js';

export const apiCache = new Map();
export let activeProxyIndex = 0;

function validateApiResponse(data) {
  if (!data || typeof data !== 'object') return { ok:false, reason:'not an object' };
  if (!Array.isArray(data.Items))         return { ok:false, reason:'no Items array' };
  if (typeof data.Count === 'number' && data.Count > data.Items.length*2 && !data.NextPageLink)
    return { ok:false, reason:`truncated (Count=${data.Count}, Items=${data.Items.length})` };
  return { ok:true };
}

async function fetchOnce(targetUrl, proxy, timeoutMs=25000) {
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

function getProxyOrder(expectedSizeKB) {
  if (!expectedSizeKB || expectedSizeKB<=0)
    return CORS_PROXIES.map((_,i)=>(activeProxyIndex+i)%CORS_PROXIES.length);
  const wi = CORS_PROXIES.map((p,i)=>({p,i}));
  return [
    ...wi.filter(x=>(x.p.sizeKB||Infinity)>=expectedSizeKB),
    ...wi.filter(x=>(x.p.sizeKB||Infinity)< expectedSizeKB),
  ].map(x=>x.i);
}

export async function fetchWithCorsFallback(targetUrl, expectedSizeKB=0) {
  const errors = [];
  for (const idx of getProxyOrder(expectedSizeKB)) {
    const proxy = CORS_PROXIES[idx];
    try {
      const data = await fetchOnce(targetUrl, proxy);
      if (idx !== activeProxyIndex)
        console.log(`✓ 프록시 전환: ${proxy.name}`);
      activeProxyIndex = idx;
      return data;
    } catch(err) {
      errors.push(`${proxy.name}: ${err.message}`);
      console.warn(`프록시 [${proxy.name}] 실패: ${err.message}`);
    }
  }
  throw new Error(`모든 프록시 실패: ${errors.join(' | ')}`);
}

function buildApiUrl(filters, currencyCode, pageSize) {
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

export async function apiFetch(filters, currencyCode='KRW', maxItems=1000, maxPages=5, opts={}) {
  const targetUrl = buildApiUrl(filters, currencyCode, opts.pageSize||0);
  if (apiCache.has(targetUrl)) {
    const c = apiCache.get(targetUrl);
    if (Array.isArray(c) && c.length>0) return c;
    apiCache.delete(targetUrl);
  }
  const items = [];
  let nextUrl = targetUrl, pages = 0;
  while (nextUrl && items.length<maxItems && pages<maxPages) {
    const data = await fetchWithCorsFallback(nextUrl, opts.expectedSizeKB||0);
    if (Array.isArray(data.Items)) items.push(...data.Items);
    nextUrl = data.NextPageLink || null;
    pages++;
  }
  if (items.length>0) apiCache.set(targetUrl, items);
  return items;
}

export function clearCacheForCurrency(currencyCode) {
  const kw = `currencyCode=${currencyCode}`;
  let n = 0;
  for (const k of [...apiCache.keys()]) {
    if (k.includes(kw)) { apiCache.delete(k); n++; }
  }
  console.log(`[캐시] ${currencyCode} ${n}건 삭제`);
}
