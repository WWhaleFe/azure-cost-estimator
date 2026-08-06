// ================================================================
// api/prices.js — Vercel 서버리스 프록시 (Azure Retail Prices API 전용)
// ----------------------------------------------------------------
// 목적: 앱을 Vercel 로 배포하면 이 함수가 같은 오리진(/api/prices)에서
//       prices.azure.com 을 대신 호출한다 → 브라우저 CORS 자체가 사라짐.
//       (GitHub Pages 등 함수가 없는 배포에선 404 가 나고, 프런트가
//        기존 공개 CORS 프록시 체인으로 자동 폴백한다)
// 보안: 대상 host 를 prices.azure.com 으로 강제(오픈 프록시 악용 차단).
// 사용: GET|HEAD /api/prices?url=<prices.azure.com 전체 URL(encodeURIComponent)>
// ================================================================
const ALLOWED_HOST = 'prices.azure.com';
const ALLOWED_METHODS = 'GET, HEAD, OPTIONS';

export default async function handler(req, res) {
  // 읽기 전용 프록시 — GET/HEAD/OPTIONS 만 허용
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.status(204).end();
    return;
  }
  // HEAD 는 GET 과 같은 상태/헤더를 주고 본문만 비운다(HTTP 규약).
  // 프런트는 GET 만 쓰지만, 헬스체크·모니터링 도구가 HEAD 를 보내면 405 가 떨어져
  // 캐시 헤더까지 기본값으로 보이는 혼선이 있었다.
  const isHead = req.method === 'HEAD';
  if (req.method !== 'GET' && !isHead) {
    res.setHeader('Allow', ALLOWED_METHODS);
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const target = req.query && req.query.url;
  if (!target || typeof target !== 'string') {
    res.status(400).json({ error: 'missing url query param' });
    return;
  }

  let u;
  try {
    u = new URL(target);
  } catch {
    res.status(400).json({ error: 'invalid url' });
    return;
  }
  // host 강제 — 오픈 프록시 방지
  if (u.protocol !== 'https:' || u.hostname !== ALLOWED_HOST) {
    res.status(403).json({ error: `host not allowed: only https://${ALLOWED_HOST}` });
    return;
  }

  try {
    const upstream = await fetch(u.toString(), { headers: { Accept: 'application/json' } });
    const text = await upstream.text();
    setCors(res);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // 공시 가격은 자주 바뀌지 않음 — 엣지/브라우저 1시간 캐시
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
    if (isHead) {
      // 본문 없이 GET 과 동일한 길이를 알린다(Node 가 HEAD 응답의 본문은 알아서 생략).
      res.setHeader('Content-Length', String(Buffer.byteLength(text)));
      res.status(upstream.status).end();
      return;
    }
    res.status(upstream.status).send(text);
  } catch (err) {
    res.status(502).json({ error: 'upstream fetch failed', detail: String((err && err.message) || err) });
  }
}

// host 잠금된 읽기 전용 가격 프록시라 * 허용(GitHub Pages 오리진에서도 폴백 대상으로 쓸 수 있게).
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
