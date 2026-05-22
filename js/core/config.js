// ================================================================
// core/config.js — 공통 상수 (API, CORS, REGION)
//
// 이 파일은 다음을 정의합니다.
//   - API_BASE, API_VERSION : Azure Retail Prices API 엔드포인트
//   - CORS_PROXIES          : CORS 우회용 공개 프록시 목록 + 사용자 정의 프록시
//   - REGION_LABEL          : 지원 리전 목록
//   - LOCAL_STORAGE_KEYS    : 브라우저 LocalStorage 키 모음
//
// === 회사 보안 솔루션 / 광고 차단기에 의한 차단 ===
//
// 이 도구는 브라우저에서 직접 prices.azure.com 을 호출하지만, CORS 정책으로
// 인해 거의 항상 외부 프록시를 거쳐야 합니다. 그런데 회사 보안 솔루션이나
// 광고 차단 확장 프로그램이 외부 프록시 도메인(corsproxy.io, allorigins.win
// 등)을 차단하면 도구 전체가 동작하지 않게 됩니다.
//
// 이를 해결하기 위해 사용자가 LocalStorage 에 직접 자체 프록시 URL 을
// 저장할 수 있도록 했습니다. (UI 의 "프록시 설정" 버튼에서 입력)
//
// 사용자 정의 프록시 URL 형식:
//   - {TARGET}         : 원본 URL 그대로
//   - {ENCODED_TARGET} : encodeURIComponent 적용된 원본 URL
//   - 플레이스홀더가 없으면 URL 끝에 인코딩된 타겟을 자동으로 붙임
//
//   예 1) https://my-worker.workers.dev/?url={ENCODED_TARGET}
//   예 2) https://my-proxy.example.com/{TARGET}
//   예 3) https://my-proxy.example.com/?url=     (플레이스홀더 없음, 자동 추가)
// ================================================================

const API_BASE    = 'https://prices.azure.com/api/retail/prices';
const API_VERSION = '2023-01-01-preview';
const apiCache    = new Map();
let   activeProxyIndex = 0;

// LocalStorage 키 (다른 파일에서 일관되게 참조)
const LOCAL_STORAGE_KEYS = {
  customProxyUrl: 'azure-cost-estimator.customCorsProxyUrl',
};

// ----------------------------------------------------------------
// 공개 CORS 프록시 목록 (기본 폴백 체인)
//
// sizeKB : 해당 프록시가 잘 처리하는 최대 응답 크기 (대략)
// wrap   : 응답이 { contents: "<원본 JSON 문자열>" } 형태로 감싸져 있는지
// url    : 타겟 URL 을 받아 최종 요청 URL 을 만드는 함수
// ----------------------------------------------------------------
const CORS_PROXIES = [
  // 0순위: 직접 호출. 대부분 CORS 로 실패하지만, Azure 가 CORS 헤더를
  // 허용하는 미래의 경우와 사용자 자체 호스팅 환경을 대비해 유지.
  { name: 'direct', wrap: false, sizeKB: Infinity, url: (t) => t },

  // 가장 많이 쓰이는 공개 프록시. 1MB 제한 (무료 티어).
  { name: 'corsproxy.io', wrap: false, sizeKB: 1024,
    url: (t) => `https://corsproxy.io/?url=${encodeURIComponent(t)}` },

  // AllOrigins. raw 모드 (응답 본문 그대로).
  { name: 'allorigins-raw', wrap: false, sizeKB: Infinity,
    url: (t) => `https://api.allorigins.win/raw?url=${encodeURIComponent(t)}` },

  // AllOrigins. get 모드 (JSON 으로 감싼 응답). raw 가 실패할 때를 대비.
  { name: 'allorigins-get', wrap: true, sizeKB: Infinity,
    url: (t) => `https://api.allorigins.win/get?url=${encodeURIComponent(t)}` },

  // CodeTabs.
  { name: 'codetabs.com', wrap: false, sizeKB: 625,
    url: (t) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(t)}` },

  // 추가 프록시 #1: killcors.com (2025 등록, rate limit 없음, 가입 불필요)
  { name: 'killcors.com', wrap: false, sizeKB: 1024,
    url: (t) => `https://proxy.killcors.com/?url=${encodeURIComponent(t)}` },

  // 추가 프록시 #2: cors.x2u.in (prefix 형태, 작은 응답에 효과적)
  { name: 'cors.x2u.in', wrap: false, sizeKB: 500,
    url: (t) => `https://cors.x2u.in/${t}` },
];

// CORS 프록시 호출이 거치는 도메인 목록 (진단 도구 / 차단 안내용)
const CORS_PROXY_DOMAINS = [
  'prices.azure.com',
  'corsproxy.io',
  'api.allorigins.win',
  'api.codetabs.com',
  'proxy.killcors.com',
  'cors.x2u.in',
];

// ----------------------------------------------------------------
// 사용자 정의 프록시 URL 을 LocalStorage 에서 읽어와
// CORS_PROXIES 의 맨 앞(direct 다음)에 추가합니다.
//
// 사용자가 자체 호스팅한 프록시(Cloudflare Workers, Vercel 등)나
// 회사 내부 프록시를 사용하면, 외부 도메인 차단 환경에서도 동작합니다.
//
// 이 함수는 다음 두 시점에 호출됩니다.
//   1) 페이지 로드 시 (config.js 끝부분에서 자동)
//   2) 사용자가 UI 에서 프록시 설정을 변경한 직후 (ui-and-bootstrap.js)
// ----------------------------------------------------------------
function reloadCustomCorsProxy() {
  // 기존에 추가된 사용자 정의 항목 제거 (이름이 'custom' 인 것)
  for (let i = CORS_PROXIES.length - 1; i >= 0; i--) {
    if (CORS_PROXIES[i].name === 'custom') CORS_PROXIES.splice(i, 1);
  }

  // LocalStorage 가 없는 환경(시크릿 모드 일부 등)에서도 안전하게
  let customUrlTemplate = '';
  try {
    customUrlTemplate = (localStorage.getItem(LOCAL_STORAGE_KEYS.customProxyUrl) || '').trim();
  } catch (err) {
    console.warn('LocalStorage 접근 실패:', err.message);
    return;
  }

  if (!customUrlTemplate) return;  // 사용자 정의 프록시 미설정 시 종료

  // 'direct' 다음 위치(인덱스 1)에 사용자 정의 프록시 삽입 → 가장 먼저 시도됨
  CORS_PROXIES.splice(1, 0, {
    name:    'custom',
    wrap:    false,
    sizeKB:  Infinity,
    url:     (targetUrl) => _buildCustomProxyUrl(customUrlTemplate, targetUrl),
  });

  console.log(`[CORS] 사용자 정의 프록시 활성화: ${customUrlTemplate}`);
}

// 사용자 정의 프록시 URL 템플릿에 타겟 URL 을 끼워 넣어 최종 요청 URL 생성
//
// 우선순위:
//   1) 템플릿에 {ENCODED_TARGET} 이 있으면 encodeURIComponent 적용된 타겟으로 치환
//   2) 템플릿에 {TARGET} 이 있으면 타겟 URL 그대로 치환
//   3) 둘 다 없으면 템플릿 끝에 encodeURIComponent(타겟) 을 자동으로 붙임
function _buildCustomProxyUrl(template, targetUrl) {
  if (template.includes('{ENCODED_TARGET}')) {
    return template.replace('{ENCODED_TARGET}', encodeURIComponent(targetUrl));
  }
  if (template.includes('{TARGET}')) {
    return template.replace('{TARGET}', targetUrl);
  }
  // 플레이스홀더 없음: 가장 흔한 패턴(?url= 또는 / 끝) 으로 자동 추가
  const separator = template.endsWith('=') || template.endsWith('/') || template.endsWith('?')
    ? ''
    : (template.includes('?') ? '&' : '?url=');
  return `${template}${separator}${encodeURIComponent(targetUrl)}`;
}

// ----------------------------------------------------------------
// 지원 리전 목록 (추가/제거 시 이 파일만 수정)
// ----------------------------------------------------------------
const REGION_LABEL = {
  koreacentral:  'Korea Central',
  koreasouth:    'Korea South',
  japaneast:     'Japan East',
  eastus:        'East US',
  westus2:       'West US 2',
  westeurope:    'West Europe',
  southeastasia: 'Southeast Asia',
};

// 각 services/*.js 파일이 여기에 자신의 카테고리 정의를 등록합니다.
// 마지막에 SERVICE_CATEGORIES 로 완성됩니다.
window._svcDefs = window._svcDefs || {};

// 페이지 로드 시 한 번 사용자 정의 프록시 적용
// (typeof 가드: Node 환경 등에서 localStorage 가 없을 때 안전)
if (typeof localStorage !== 'undefined') {
  reloadCustomCorsProxy();
}
