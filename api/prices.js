// ================================================================
// api/prices.js — Vercel 서버리스 프록시 (Azure Retail Prices API 전용)
// ----------------------------------------------------------------
// 목적: 앱을 Vercel 로 배포하면 이 함수가 같은 오리진(/api/prices)에서
//       prices.azure.com 을 대신 호출한다 → 브라우저 CORS 자체가 사라짐.
//       (GitHub Pages 등 함수가 없는 배포에선 404 가 나고, 프런트가
//        기존 공개 CORS 프록시 체인으로 자동 폴백한다)
// 보안: 대상 host 를 prices.azure.com 으로 강제(오픈 프록시 악용 차단).
// 사용: GET /api/prices?url=<prices.azure.com 전체 URL(encodeURIComponent)>
// ================================================================
const ALLOWED_HOST = 'prices.azure.com';

export default async function handler(req, res) {
  // 읽기 전용 프록시 — GET/OPTIONS 만 허용
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
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
    res.status(upstream.status).send(text);
  } catch (err) {
    res.status(502).json({ error: 'upstream fetch failed', detail: String((err && err.message) || err) });
  }
}

// host 잠금된 읽기 전용 가격 프록시라 * 허용(GitHub Pages 오리진에서도 폴백 대상으로 쓸 수 있게).
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
