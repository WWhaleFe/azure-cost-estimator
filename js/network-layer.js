// ==================================================================
// network-layer.js (v31)
// ==================================================================

function validateApiResponse(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'not an object' };
  }
  if (!Array.isArray(data.Items)) {
    return { ok: false, reason: 'no Items array (likely truncated or wrong endpoint)' };
  }
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

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`JSON parse error (response size: ${text.length}B, may be truncated by proxy)`);
    }

    if (proxy.wrap && data && typeof data.contents === 'string') {
      try { data = JSON.parse(data.contents); }
      catch { throw new Error(`wrapped JSON parse error (size: ${data.contents.length}B)`); }
    }

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

function buildApiUrl(filters, currencyCode, pageSize) {
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
  if (currencyCode) params.set('currencyCode', currencyCode);
  if (filterStr) params.set('$filter', filterStr);
  if (pageSize > 0) params.set('$top', String(pageSize));
  return `${API_BASE}?${params.toString()}`;
}

async function apiFetch(filters, currencyCode = 'KRW', maxItems = 1000, maxPages = 5, opts = {}) {
  const pageSize = opts.pageSize || 0;
  const expectedSizeKB = opts.expectedSizeKB || 0;

  const targetUrl = buildApiUrl(filters, currencyCode, pageSize);

  if (apiCache.has(targetUrl)) {
    const cached = apiCache.get(targetUrl);
    if (Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
    apiCache.delete(targetUrl);
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

function clearCacheForCurrency(currencyCode) {
  const keyword = `currencyCode=${currencyCode}`;
  const keysToDelete = [];
  for (const key of apiCache.keys()) {
    if (key.includes(keyword)) keysToDelete.push(key);
  }
  keysToDelete.forEach(k => apiCache.delete(k));
  console.log(`[캐시] ${currencyCode} 캐시 ${keysToDelete.length}건 삭제`);
}
