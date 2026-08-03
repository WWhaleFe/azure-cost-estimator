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

// 지원 리전 목록 (추가/제거 시 이 파일만 수정). 지역별 그룹 순서로 정렬.
export const REGION_LABEL: Record<string, string> = {
  // 아시아 태평양
  koreacentral:      'Korea Central',
  koreasouth:        'Korea South',
  japaneast:         'Japan East',
  japanwest:         'Japan West',
  southeastasia:     'Southeast Asia (Singapore)',
  eastasia:          'East Asia (Hong Kong)',
  australiaeast:     'Australia East',
  australiasoutheast:'Australia Southeast',
  centralindia:      'Central India',
  southindia:        'South India',
  westindia:         'West India',
  indonesiacentral:  'Indonesia Central',
  malaysiawest:      'Malaysia West',
  newzealandnorth:   'New Zealand North',
  // 미국
  eastus:            'East US',
  eastus2:           'East US 2',
  centralus:         'Central US',
  northcentralus:    'North Central US',
  southcentralus:    'South Central US',
  westus:            'West US',
  westus2:           'West US 2',
  westus3:           'West US 3',
  westcentralus:     'West Central US',
  mexicocentral:     'Mexico Central',
  // 캐나다 / 남미
  canadacentral:     'Canada Central',
  canadaeast:        'Canada East',
  brazilsouth:       'Brazil South',
  // 유럽
  westeurope:        'West Europe (Netherlands)',
  northeurope:       'North Europe (Ireland)',
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
  // 중동 / 아프리카
  uaenorth:          'UAE North',
  qatarcentral:      'Qatar Central',
  israelcentral:     'Israel Central',
  southafricanorth:  'South Africa North',
};
