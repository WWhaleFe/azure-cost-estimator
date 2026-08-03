// ================================================================
// core/config.js — 공통 상수 (API, CORS, REGION)
// 수정 대상: API 버전, CORS 프록시 목록, 리전 목록
// ESM: 순수 상수만 export. 가변 상태(apiCache/activeProxyIndex)는 network.js가 소유하고,
//      서비스 레지스트리(_svcDefs)는 registry.js가 소유한다.
// ================================================================
import type { ProxyEntry } from './types.js';

export const API_BASE    = 'https://prices.azure.com/api/retail/prices';
export const API_VERSION = '2023-01-01-preview';

export const CORS_PROXIES: ProxyEntry[] = [
  // 1순위: 같은 오리진 Vercel 서버리스 프록시(api/prices.js). Vercel 배포에선 CORS 없이 동작.
  // 함수가 없는 환경(GitHub Pages·Vite dev)에선 404/비-JSON → network.js 검증 실패 → 아래 공개 프록시로 자동 폴백.
  { name:'vercel-fn',      wrap:false, sizeKB:Infinity, url:t=>`/api/prices?url=${encodeURIComponent(t)}` },
  { name:'direct',         wrap:false, sizeKB:Infinity, url:t=>t },
  { name:'corsproxy.io',   wrap:false, sizeKB:1024,     url:t=>`https://corsproxy.io/?url=${encodeURIComponent(t)}` },
  { name:'allorigins-raw', wrap:false, sizeKB:Infinity, url:t=>`https://api.allorigins.win/raw?url=${encodeURIComponent(t)}` },
  { name:'allorigins-get', wrap:true,  sizeKB:Infinity, url:t=>`https://api.allorigins.win/get?url=${encodeURIComponent(t)}` },
  { name:'codetabs.com',   wrap:false, sizeKB:625,      url:t=>`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(t)}` },
  { name:'cors.x2u.in',   wrap:false, sizeKB:500,      url:t=>`https://cors.x2u.in/${t}` },
];
export const CORS_PROXY_DOMAINS = [
  'prices.azure.com','corsproxy.io','api.allorigins.win','api.codetabs.com','cors.x2u.in',
];

// 지원 리전 — 지역(대륙)별 그룹. 드롭다운은 이 그룹으로 <optgroup> 렌더한다.
// (추가/제거 시 이 배열만 수정하면 REGION_LABEL·드롭다운이 자동 반영)
export const REGION_GROUPS: { label: string; regions: Record<string, string> }[] = [
  { label: '아시아 태평양', regions: {
    koreacentral:      'Korea Central (한국 중부)',
    koreasouth:        'Korea South (한국 남부)',
    japaneast:         'Japan East (일본 동부)',
    japanwest:         'Japan West (일본 서부)',
    southeastasia:     'Southeast Asia (싱가포르)',
    eastasia:          'East Asia (홍콩)',
    australiaeast:     'Australia East',
    australiasoutheast:'Australia Southeast',
    centralindia:      'Central India',
    southindia:        'South India',
    westindia:         'West India',
    indonesiacentral:  'Indonesia Central',
    malaysiawest:      'Malaysia West',
    newzealandnorth:   'New Zealand North',
  }},
  { label: '미주', regions: {
    eastus:            'East US',
    eastus2:           'East US 2',
    centralus:         'Central US',
    northcentralus:    'North Central US',
    southcentralus:    'South Central US',
    westus:            'West US',
    westus2:           'West US 2',
    westus3:           'West US 3',
    westcentralus:     'West Central US',
    canadacentral:     'Canada Central',
    canadaeast:        'Canada East',
    mexicocentral:     'Mexico Central',
    brazilsouth:       'Brazil South',
  }},
  { label: '유럽', regions: {
    westeurope:        'West Europe (네덜란드)',
    northeurope:       'North Europe (아일랜드)',
    uksouth:           'UK South',
    ukwest:            'UK West',
    francecentral:     'France Central',
    germanywestcentral:'Germany West Central',
    switzerlandnorth:  'Switzerland North',
    norwayeast:        'Norway East',
    swedencentral:     'Sweden Central',
    polandcentral:     'Poland Central',
    italynorth:        'Italy North',
    spaincentral:      'Spain Central',
    austriaeast:       'Austria East',
  }},
  { label: '중동 · 아프리카', regions: {
    uaenorth:          'UAE North',
    qatarcentral:      'Qatar Central',
    israelcentral:     'Israel Central',
    southafricanorth:  'South Africa North',
  }},
];

// 코드→표시명 평면 맵(그룹에서 자동 파생). CSV 정규화·상태 메시지 등에서 사용.
export const REGION_LABEL: Record<string, string> =
  Object.assign({}, ...REGION_GROUPS.map(g => g.regions));
