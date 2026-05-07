const API_BASE = 'https://prices.azure.com/api/retail/prices';
const API_VERSION = '2023-01-01-preview';
const apiCache = new Map();
let activeProxyIndex = 0;
// CORS 프록시 정의 (v31):
//
// 중요 정정: Azure Retail Prices API는 실제로 CORS를 지원하지 않음
// (origin이 "https://wwhalefe.github.io" 등 외부 도메인일 때 401/no-CORS 응답)
// → direct 호출은 거의 항상 실패하지만, 일부 환경에서는 회사 프록시가
//   응답을 가공하여 통과시켜주기도 하므로 시도 비용은 작음 → 1순위 유지.
//
// sizeKB: 응답 본문 사이즈 제한 (KB)
const CORS_PROXIES = [
  { name: 'direct',         wrap: false, sizeKB: Infinity, url: t => t },
  { name: 'corsproxy.io',   wrap: false, sizeKB: 1024,     url: t => `https://corsproxy.io/?url=${encodeURIComponent(t)}` },
  { name: 'allorigins-raw', wrap: false, sizeKB: Infinity, url: t => `https://api.allorigins.win/raw?url=${encodeURIComponent(t)}` },
  { name: 'allorigins-get', wrap: true,  sizeKB: Infinity, url: t => `https://api.allorigins.win/get?url=${encodeURIComponent(t)}` },
  { name: 'codetabs.com',   wrap: false, sizeKB: 625,      url: t => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(t)}` },
  { name: 'cors.x2u.in',    wrap: false, sizeKB: 500,      url: t => `https://cors.x2u.in/${t}` },
];

// 진단용: 프록시별 도메인 목록 (회사망 화이트리스트 안내 시 사용)
const CORS_PROXY_DOMAINS = [
  'prices.azure.com',
  'corsproxy.io',
  'api.allorigins.win',
  'api.codetabs.com',
  'cors.x2u.in',
];
const SERVICE_CATEGORIES = {
  'Virtual Machine': {
    apiServiceName: 'Virtual Machines',
    steps: [
      { key: 'os', label: '운영체제', options: ['Linux', 'Windows', 'Red Hat Enterprise Linux', 'SUSE'] },
      { key: 'tier', label: 'Tier', options: ['Standard', 'Spot'] },
      { key: 'license', label: '라이선스', options: ['라이선스 포함', 'Azure Hybrid Benefit'] },
      { key: 'series', label: '시리즈', options: ['B-series', 'D-series v6', 'D-series v5', 'D-series v3', 'Dl-series v6', 'Ds-series v6', 'E-series v6', 'E-series v5', 'F-series v2', 'M-series', 'N-series'] },
    ],
    instanceField: true,
    // instanceKey: instance 드롭다운을 갱신해야 하는 상위 옵션 키
    instanceParentKey: 'series',
  },
  // Storage 카테고리명을 'Disk'로 변경 (구분 명확화)
  'Disk': {
    apiServiceName: 'Storage',
    steps: [
      { key: 'storageType', label: 'Storage Type', options: ['Premium SSD Managed Disks', 'Standard SSD Managed Disks', 'Standard HDD Managed Disks'] },
      { key: 'redundancy', label: '중복성', options: ['LRS', 'ZRS'] },
      { key: 'transactionUnits', label: 'Storage 트랜잭션 (10,000 단위, 월)', type: 'number', min: 0, step: 1, default: 0 },
    ],
    instanceField: true,
    instanceParentKey: 'storageType',
  },
  'Azure Files': {
    apiServiceName: 'Storage',
    steps: [
      { key: 'fileTier', label: '계층', options: ['Premium', 'Hot', 'Cool', 'Transaction Optimized'] },
      { key: 'redundancy', label: '중복성', options: ['LRS', 'ZRS', 'GRS'] },
      { key: 'metric', label: '청구 항목', options: ['Data Stored', 'Snapshots', 'Metadata'] },
    ],
    instanceField: false,
  },
  'Blob Storage': {
    apiServiceName: 'Storage',
    steps: [
      { key: 'blobTier', label: '액세스 계층', options: ['Hot', 'Cool', 'Cold', 'Archive'] },
      { key: 'redundancy', label: '중복성', options: ['LRS', 'ZRS', 'GRS', 'RA-GRS', 'GZRS', 'RA-GZRS'] },
      { key: 'metric', label: '청구 항목', options: ['Data Stored', 'Read Operations', 'Write Operations', 'Data Retrieval'] },
    ],
    instanceField: false,
  },
  'VPN Gateway': {
    apiServiceName: 'VPN Gateway',
    steps: [
      { key: 'sku', label: 'SKU', options: ['Basic', 'VpnGw1', 'VpnGw2', 'VpnGw3', 'VpnGw4', 'VpnGw5', 'VpnGw1AZ', 'VpnGw2AZ', 'VpnGw3AZ', 'VpnGw4AZ', 'VpnGw5AZ'] },
      { key: 'gatewayHours', label: '게이트웨이 시간 (월, Hours)', type: 'number', min: 0, step: 1, default: 730 },
      { key: 'extraS2sTunnels', label: 'S2S 추가 터널 수 (기본 포함분 초과)', type: 'number', min: 0, step: 1, default: 0 },
      { key: 'extraP2sConnections', label: 'P2S 추가 연결 수 (기본 포함분 초과)', type: 'number', min: 0, step: 1, default: 0 },
      { key: 'vnetTransferType', label: 'VNET 데이터 전송 유형', options: ['VNET 간', 'VPN'] },
      { key: 'vnetGB', label: 'VNET 간 데이터 전송 (월, GB)', type: 'number', min: 0, step: 1, default: 0 },
    ],
    instanceField: false,
  },
  'Load Balancer': {
    apiServiceName: 'Load Balancer',
    steps: [
      { key: 'tier', label: '계층', options: ['Standard', 'Basic', 'Gateway'] },
      { key: 'metric', label: '청구 항목', options: ['Rules', 'Data Processed', 'Inbound NAT Rules'] },
    ],
    instanceField: false,
  },
  'Application Gateway': {
    apiServiceName: 'Application Gateway',
    steps: [
      { key: 'sku', label: 'SKU', options: ['Standard_v2', 'WAF_v2', 'Standard_Small', 'Standard_Medium', 'Standard_Large'] },
    ],
    instanceField: false,
  },
  'Public IP': {
    apiServiceName: 'Virtual Network',
    steps: [
      { key: 'sku', label: 'SKU', options: ['Standard', 'Basic'] },
      { key: 'ipType', label: 'IP 유형', options: ['Static', 'Dynamic'] },
    ],
    instanceField: false,
  },
  'Azure Firewall': {
    apiServiceName: 'Azure Firewall',
    steps: [
      { key: 'tier', label: '계층', options: ['Standard', 'Premium', 'Basic'] },
      { key: 'metric', label: '청구 항목', options: ['Deployment', 'Data Processed'] },
    ],
    instanceField: false,
  },
  'Bandwidth': {
    apiServiceName: 'Bandwidth',
    steps: [
      { key: 'direction', label: '전송 방향', options: ['Outbound (Internet Egress)', 'Inter-region', 'Intra-region'] },
    ],
    instanceField: false,
  },
  'Azure SQL Database': {
    apiServiceName: 'SQL Database',
    steps: [
      { key: 'tier', label: '계층', options: ['General Purpose', 'Business Critical', 'Hyperscale'] },
      { key: 'compute', label: '컴퓨팅', options: ['Provisioned', 'Serverless'] },
      { key: 'hardware', label: '하드웨어', options: ['Gen5', 'M-series', 'Fsv2-series'] },
    ],
    instanceField: false,
  },
  'Azure Database for MySQL': {
    apiServiceName: 'Azure Database for MySQL',
    steps: [
      { key: 'tier', label: '계층', options: ['Burstable', 'General Purpose', 'Business Critical'] },
      { key: 'compute', label: 'vCore', options: ['B1ms', 'B2s', 'D2ds_v4', 'D4ds_v4', 'D8ds_v4', 'D16ds_v4', 'D32ds_v4'] },
    ],
    instanceField: false,
  },
  'App Service': {
    apiServiceName: 'Azure App Service',
    steps: [
      { key: 'tier', label: '계층', options: ['Free', 'Shared', 'Basic', 'Standard', 'Premium v3', 'Isolated v2'] },
      { key: 'os', label: 'OS', options: ['Windows', 'Linux'] },
      { key: 'size', label: '인스턴스', options: ['B1', 'B2', 'B3', 'S1', 'S2', 'S3', 'P1V3', 'P2V3', 'P3V3'] },
    ],
    instanceField: false,
  },
  'Azure Bastion': {
    apiServiceName: 'Azure Bastion',
    steps: [
      { key: 'tier', label: '계층', options: ['Basic', 'Standard'] },
    ],
    instanceField: false,
  },
  'NAT Gateway': {
    apiServiceName: 'Virtual Network',
    steps: [
      { key: 'metric', label: '청구 항목', options: ['Resource Hour', 'Data Processed'] },
    ],
    instanceField: false,
  },
};

const VM_INSTANCE_CATALOG = {
  'B-series': [
    { name: 'B1s', vCPU: 1, ram: 1 }, { name: 'B1ms', vCPU: 1, ram: 2 },
    { name: 'B2s', vCPU: 2, ram: 4 }, { name: 'B2ms', vCPU: 2, ram: 8 },
    { name: 'B4ms', vCPU: 4, ram: 16 }, { name: 'B8ms', vCPU: 8, ram: 32 },
    { name: 'B12ms', vCPU: 12, ram: 48 }, { name: 'B16ms', vCPU: 16, ram: 64 },
    { name: 'B20ms', vCPU: 20, ram: 80 },
  ],
  'D-series v6': [
    { name: 'D2s_v6', vCPU: 2, ram: 8 }, { name: 'D4s_v6', vCPU: 4, ram: 16 },
    { name: 'D8s_v6', vCPU: 8, ram: 32 }, { name: 'D16s_v6', vCPU: 16, ram: 64 },
    { name: 'D32s_v6', vCPU: 32, ram: 128 }, { name: 'D48s_v6', vCPU: 48, ram: 192 },
    { name: 'D64s_v6', vCPU: 64, ram: 256 }, { name: 'D96s_v6', vCPU: 96, ram: 384 },
  ],
  'D-series v5': [
    { name: 'D2s_v5', vCPU: 2, ram: 8 }, { name: 'D4s_v5', vCPU: 4, ram: 16 },
    { name: 'D8s_v5', vCPU: 8, ram: 32 }, { name: 'D16s_v5', vCPU: 16, ram: 64 },
    { name: 'D32s_v5', vCPU: 32, ram: 128 }, { name: 'D64s_v5', vCPU: 64, ram: 256 },
  ],
  'D-series v3': [
    { name: 'D2s_v3', vCPU: 2, ram: 8 }, { name: 'D4s_v3', vCPU: 4, ram: 16 },
    { name: 'D8s_v3', vCPU: 8, ram: 32 }, { name: 'D16s_v3', vCPU: 16, ram: 64 },
    { name: 'D32s_v3', vCPU: 32, ram: 128 }, { name: 'D64s_v3', vCPU: 64, ram: 256 },
  ],
  'Dl-series v6': [
    { name: 'D2ls_v6', vCPU: 2, ram: 4 }, { name: 'D4ls_v6', vCPU: 4, ram: 8 },
    { name: 'D8ls_v6', vCPU: 8, ram: 16 }, { name: 'D16ls_v6', vCPU: 16, ram: 32 },
    { name: 'D32ls_v6', vCPU: 32, ram: 64 }, { name: 'D64ls_v6', vCPU: 64, ram: 128 },
  ],
  'Ds-series v6': [
    { name: 'D2ds_v6', vCPU: 2, ram: 8 }, { name: 'D4ds_v6', vCPU: 4, ram: 16 },
    { name: 'D8ds_v6', vCPU: 8, ram: 32 }, { name: 'D16ds_v6', vCPU: 16, ram: 64 },
    { name: 'D32ds_v6', vCPU: 32, ram: 128 }, { name: 'D64ds_v6', vCPU: 64, ram: 256 },
  ],
  'E-series v6': [
    { name: 'E2s_v6', vCPU: 2, ram: 16 }, { name: 'E4s_v6', vCPU: 4, ram: 32 },
    { name: 'E8s_v6', vCPU: 8, ram: 64 }, { name: 'E16s_v6', vCPU: 16, ram: 128 },
    { name: 'E32s_v6', vCPU: 32, ram: 256 }, { name: 'E64s_v6', vCPU: 64, ram: 512 },
  ],
  'E-series v5': [
    { name: 'E2s_v5', vCPU: 2, ram: 16 }, { name: 'E4s_v5', vCPU: 4, ram: 32 },
    { name: 'E8s_v5', vCPU: 8, ram: 64 }, { name: 'E16s_v5', vCPU: 16, ram: 128 },
    { name: 'E32s_v5', vCPU: 32, ram: 256 }, { name: 'E64s_v5', vCPU: 64, ram: 432 },
  ],
  'F-series v2': [
    { name: 'F2s_v2', vCPU: 2, ram: 4 }, { name: 'F4s_v2', vCPU: 4, ram: 8 },
    { name: 'F8s_v2', vCPU: 8, ram: 16 }, { name: 'F16s_v2', vCPU: 16, ram: 32 },
    { name: 'F32s_v2', vCPU: 32, ram: 64 }, { name: 'F64s_v2', vCPU: 64, ram: 128 },
  ],
  'M-series': [
    { name: 'M8ms', vCPU: 8, ram: 218.75 }, { name: 'M16ms', vCPU: 16, ram: 437.5 },
    { name: 'M32ms', vCPU: 32, ram: 875 }, { name: 'M64ms', vCPU: 64, ram: 1750 },
  ],
  'N-series': [
    { name: 'NC4as_T4_v3', vCPU: 4, ram: 28 }, { name: 'NC8as_T4_v3', vCPU: 8, ram: 56 },
    { name: 'NC16as_T4_v3', vCPU: 16, ram: 110 }, { name: 'NC64as_T4_v3', vCPU: 64, ram: 440 },
  ],
};

const DISK_CATALOG = {
  'Premium SSD Managed Disks': [
    { name: 'P1', size: 4 }, { name: 'P2', size: 8 }, { name: 'P3', size: 16 },
    { name: 'P4', size: 32 }, { name: 'P6', size: 64 }, { name: 'P10', size: 128 },
    { name: 'P15', size: 256 }, { name: 'P20', size: 512 }, { name: 'P30', size: 1024 },
    { name: 'P40', size: 2048 }, { name: 'P50', size: 4096 }, { name: 'P60', size: 8192 },
    { name: 'P70', size: 16384 }, { name: 'P80', size: 32767 },
  ],
  'Standard SSD Managed Disks': [
    { name: 'E1', size: 4 }, { name: 'E2', size: 8 }, { name: 'E3', size: 16 },
    { name: 'E4', size: 32 }, { name: 'E6', size: 64 }, { name: 'E10', size: 128 },
    { name: 'E15', size: 256 }, { name: 'E20', size: 512 }, { name: 'E30', size: 1024 },
    { name: 'E40', size: 2048 }, { name: 'E50', size: 4096 }, { name: 'E60', size: 8192 },
    { name: 'E70', size: 16384 }, { name: 'E80', size: 32767 },
  ],
  'Standard HDD Managed Disks': [
    { name: 'S4', size: 32 }, { name: 'S6', size: 64 }, { name: 'S10', size: 128 },
    { name: 'S15', size: 256 }, { name: 'S20', size: 512 }, { name: 'S30', size: 1024 },
    { name: 'S40', size: 2048 }, { name: 'S50', size: 4096 }, { name: 'S60', size: 8192 },
    { name: 'S70', size: 16384 }, { name: 'S80', size: 32767 },
  ],
};

const REGION_LABEL = {
  koreacentral: 'Korea Central', koreasouth: 'Korea South',
  japaneast: 'Japan East', eastus: 'East US', westus2: 'West US 2',
  westeurope: 'West Europe', southeastasia: 'Southeast Asia',
};
