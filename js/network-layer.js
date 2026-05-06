async function fetchOnce(targetUrl, proxy, timeoutMs = 25000) {
  // Simple request로 만들기 위해 커스텀 헤더 제거.
  // 'Accept' 헤더 자체는 simple request에 포함되지만, 일부 환경에서 preflight를
  // 트리거할 수 있어 안전하게 헤더 없이 호출.
  // AbortSignal을 fetch options에 직접 전달하면 일부 환경(iframe/worker postMessage 경로)에서
  // "AbortSignal object could not be cloned" 오류가 발생함 → Promise.race로 timeout 처리.
  const fetchPromise = fetch(proxy.url(targetUrl), {
    method: 'GET',
    // mode/credentials 명시 안 함 (브라우저 기본값으로 simple request 시도)
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
    const text = await res.text();
    if (!text || text.length < 10) throw new Error('empty response');
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      const lastBrace = text.lastIndexOf('}');
      if (lastBrace > 0) {
        try { data = JSON.parse(text.slice(0, lastBrace + 1)); }
        catch { throw new Error('JSON parse error'); }
      } else {
        throw new Error('JSON parse error');
      }
    }
    if (proxy.wrap && data && typeof data.contents === 'string') {
      try { data = JSON.parse(data.contents); }
      catch { throw new Error('wrapped JSON parse error'); }
    }
    if (!data || typeof data !== 'object') throw new Error('invalid response');
    return data;
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([fetchPromise, timeoutPromise]);
}

async function fetchWithCorsFallback(targetUrl) {
  // file:// 스킴 감지 - 모든 외부 호출이 거부될 가능성 큼
  if (location.protocol === 'file:') {
    console.warn(
      '⚠ HTML이 file:// 로 열려있음. 브라우저가 외부 API 호출을 차단할 수 있음.\n' +
      '→ 로컬 웹서버로 열거나 (예: python -m http.server), https://*.html 로 호스팅된 파일을 사용하세요.'
    );
  }

  const errors = [];
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const idx = (activeProxyIndex + i) % CORS_PROXIES.length;
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
  // 모든 프록시 실패 - 모든 오류를 보여줌
  throw new Error(`모든 프록시 실패 (${CORS_PROXIES.length}개 시도): ${errors.join(' | ')}`);
}

async function apiFetch(filters, currencyCode = 'KRW', maxItems = 1000, maxPages = 5) {
  const fp = [];
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '') continue;
    if (k === '__raw') {
      // raw OData 표현식 (예: "contains(meterName, 'Inter-Virtual')")
      // 배열이면 모든 항목을 and 결합, 문자열이면 그대로
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

  const targetUrl = `${API_BASE}?${params.toString()}`;
  if (apiCache.has(targetUrl)) {
    const cached = apiCache.get(targetUrl);
    // 캐시된 결과가 비어있으면 재시도 가능하게 캐시 무효화 후 재호출
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
    const data = await fetchWithCorsFallback(nextUrl);
    if (Array.isArray(data.Items)) items.push(...data.Items);
    nextUrl = data.NextPageLink || null;
    pages++;
  }
  // 비어있지 않을 때만 캐시 (빈 결과는 캐시 안 해서 재시도 가능)
  if (items.length > 0) apiCache.set(targetUrl, items);
  return items;
}
