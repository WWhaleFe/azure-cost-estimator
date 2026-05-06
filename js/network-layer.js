// ==================================================================
// network-layer.js (v30)
// ------------------------------------------------------------------
// CORS 프록시 폴백 + 응답 무결성 검증
//
// v30 변경사항:
// 1. 잘린 JSON에 대한 "lastBrace 폴백" 제거
//    → codetabs (625KB) / cors.x2u.in (500KB) 등이 응답을 잘랐을 때
//      이를 정상 데이터로 둔갑시키지 않고 즉시 다음 프록시로 폴백
// 2. OData 응답 구조 검증 (Items 배열 + 옵션의 NextPageLink)
//    → Azure Retail Prices API 응답이 아닌 것은 에러로 판정
// 3. 프록시별 sizeKB 메타데이터 활용
//    → 큰 응답 페이지를 받을 때 size 제한 작은 프록시는 후순위
// 4. apiFetch에 pageSize 인자 추가
//    → 페이지당 항목 수를 줄여 작은 프록시도 통과 가능
// ==================================================================

// 응답 무결성 판정
//  - data 자체가 객체인지
//  - Azure Retail Prices API의 OData 페이지 구조인지 (Items 배열 보유)
//  - 'Count' 필드가 있고 Items 배열 길이와 일치하는지 (잘림 감지)
// returns: { ok: true } | { ok: false, reason: string }
function validateApiResponse(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'not an object' };
  }
  if (!Array.isArray(data.Items)) {
    return { ok: false, reason: 'no Items array (likely truncated or wrong endpoint)' };
  }
  // Count 필드가 있고 Items 길이의 2배 이상인데 NextPageLink가 없으면 잘린 것으로 간주
  if (typeof data.Count === 'number' && data.Count > data.Items.length * 2) {
    if (!data.NextPageLink) {
      return { ok: false, reason: `truncated (Count=${data.Count}, Items=${data.Items.length}, no NextPageLink)` };
    }
  }
  return { ok: true };
}

async function fetchOnce(targetUrl, proxy, timeoutMs = 25000) {
  const fetchPromise = fetch(proxy.url(targetUrl), {
    method: 'GET',
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
    const text = await res.text();
    if (!text || text.length < 10) throw new Error('empty response');

    // [v30] 잘린 JSON에 대한 lastBrace 폴백 제거
    // 이전 코드는 response가 잘렸을 때도 lastIndexOf('}') 위치까지 파싱해서
    // "정상 데이터처럼 보이는 부분 데이터"를 반환했음 → 다음 프록시로 폴백 안 됨.
    // v30: JSON parse 실패는 즉시 에러로 처리 → 다음 프록시 시도.
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`JSON parse error (response size: ${text.length}B, may be truncated by proxy)`);
    }

    // allorigins-get 같은 wrap 모드 프록시: data.contents가 문자열로 들어옴
    if (proxy.wrap && data && typeof data.contents === 'string') {
      try { data = JSON.parse(data.contents); }
      catch { throw new Error(`wrapped JSON parse error (size: ${data.contents.length}B)`); }
    }

    // [v30] OData 응답 구조 검증
    const validation = validateApiResponse(data);
    if (!validation.ok) {
      throw new Error(`invalid OData response: ${validation.reason}`);
    }

    return data;
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([fetchPromise, timeoutPromise]);
}

// 큰 응답이 예상되는 호출에 대해서는 size 제한 작은 프록시를 후순위로 정렬
function getProxyOrder(expectedSizeKB) {
  if (!expectedSizeKB || expectedSizeKB <= 0) {
    return CORS_PROXIES.map((_, i) => (activeProxyIndex + i) % CORS_PROXIES.length);
  }
  const proxiesWithIdx = CORS_PROXIES.map((p, i) => ({ proxy: p, idx: i }));
  const safe = proxiesWithIdx.filter(x => (x.proxy.sizeKB || Infinity) >= expectedSizeKB);
  const risky = proxiesWithIdx.filter(x => (x.proxy.sizeKB || Infinity) < expectedSizeKB);
  return [...safe, ...risky].map(x => x.idx);
}

async function fetchWithCorsFallback(targetUrl, expectedSizeKB = 0) {
  if (location.protocol === 'file:') {
    console.warn(
      '⚠ HTML이 file:// 로 열려있음. 브라우저가 외부 API 호출을 차단할 수 있음.\n' +
      '→ 로컬 웹서버로 열거나 (예: python -m http.server), https://*.html 로 호스팅된 파일을 사용하세요.'
    );
  }

  const errors = [];
  const order = getProxyOrder(expectedSizeKB);

  for (const idx of order) {
    const proxy = CORS_PROXIES[idx];
    try {
      const data = await fetchOnce(targetUrl, proxy);
      if (idx !== activeProxyIndex) {
        console.log(`✓ 프록시 전환: ${proxy.name} (이전 ${CORS_PROXIES[activeProxyIndex].name} 실패)`);
      }
      activeProxyIndex = idx;
      return data;
    } catch (err) {
      errors.push(`${proxy.name}: ${err.message}`);
      console.warn(`프록시 [${proxy.name}] 실패: ${err.message}`);
    }
  }
  throw new Error(`모든 프록시 실패 (${CORS_PROXIES.length}개 시도): ${errors.join(' | ')}`);
}

// apiFetch (v30)
//  - opts.pageSize: $top 파라미터로 페이지당 항목 수 제어 (기본 미설정 = API 기본값)
//  - opts.expectedSizeKB: 응답 사이즈 추정값 (큰 호출은 큰 프록시 우선 시도)
async function apiFetch(filters, currencyCode = 'KRW', maxItems = 1000, maxPages = 5, opts = {}) {
  const pageSize = opts.pageSize || 0;
  const expectedSizeKB = opts.expectedSizeKB || 0;

  const fp = [];
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '') continue;
    if (k === '__raw') {
      if (Array.isArray(v)) {
        v.forEach(expr => { if (expr) fp.push(String(expr)); });
      } else {
        fp.push(String(v));
      }
    } else {
      fp.push(`${k} eq '${String(v).replace(/'/g, "''")}'`);
    }
  }
  const filterStr = fp.join(' and ');
  const params = new URLSearchParams();
  params.set('api-version', API_VERSION);
  if (currencyCode && currencyCode !== 'USD') params.set('currencyCode', currencyCode);
  if (filterStr) params.set('$filter', filterStr);
  if (pageSize > 0) params.set('$top', String(pageSize));

  const targetUrl = `${API_BASE}?${params.toString()}`;
  if (apiCache.has(targetUrl)) {
    const cached = apiCache.get(targetUrl);
    if (!Array.isArray(cached) || cached.length === 0) {
      apiCache.delete(targetUrl);
    } else {
      return cached;
    }
  }

  const items = [];
  let nextUrl = targetUrl;
  let pages = 0;
  while (nextUrl && items.length < maxItems && pages < maxPages) {
    const data = await fetchWithCorsFallback(nextUrl, expectedSizeKB);
    if (Array.isArray(data.Items)) items.push(...data.Items);
    nextUrl = data.NextPageLink || null;
    pages++;
  }
  if (items.length > 0) apiCache.set(targetUrl, items);
  return items;
}
