// ================================================================
// core/config.js — 공통 상수 (API, CORS, REGION)
// 수정 대상: API 버전, CORS 프록시 목록, 리전 목록
// ================================================================
const API_BASE    = 'https://prices.azure.com/api/retail/prices';
const API_VERSION = '2023-01-01-preview';
const apiCache    = new Map();
let   activeProxyIndex = 0;

const CORS_PROXIES = [
  { name:'direct',         wrap:false, sizeKB:Infinity, url:t=>t },
  { name:'corsproxy.io',   wrap:false, sizeKB:1024,     url:t=>`https://corsproxy.io/?url=${encodeURIComponent(t)}` },
  { name:'allorigins-raw', wrap:false, sizeKB:Infinity, url:t=>`https://api.allorigins.win/raw?url=${encodeURIComponent(t)}` },
  { name:'allorigins-get', wrap:true,  sizeKB:Infinity, url:t=>`https://api.allorigins.win/get?url=${encodeURIComponent(t)}` },
  { name:'codetabs.com',   wrap:false, sizeKB:625,      url:t=>`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(t)}` },
  { name:'cors.x2u.in',   wrap:false, sizeKB:500,      url:t=>`https://cors.x2u.in/${t}` },
];
const CORS_PROXY_DOMAINS = [
  'prices.azure.com','corsproxy.io','api.allorigins.win','api.codetabs.com','cors.x2u.in',
];

// 지원 리전 목록 (추가/제거 시 이 파일만 수정)
const REGION_LABEL = {
  koreacentral:  'Korea Central',
  koreasouth:    'Korea South',
  japaneast:     'Japan East',
  eastus:        'East US',
  westus2:       'West US 2',
  westeurope:    'West Europe',
  southeastasia: 'Southeast Asia',
  polandcentral: 'Poland Central',
  italynorth:    'Italy North',
};

// 각 services/*.js 파일이 여기에 자신의 카테고리 정의를 등록
// 마지막에 SERVICE_CATEGORIES 로 완성됨
window._svcDefs = window._svcDefs || {};
