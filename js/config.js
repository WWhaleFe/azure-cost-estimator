const API_BASE = 'https://prices.azure.com/api/retail/prices';
const API_VERSION = '2023-01-01-preview';
const apiCache = new Map();
let activeProxyIndex = 0;

const CORS_PROXIES = [
  { name: 'direct',         wrap: false, sizeKB: Infinity, url: t => t },
  { name: 'corsproxy.io',   wrap: false, sizeKB: 1024,     url: t => `https://corsproxy.io/?url=${encodeURIComponent(t)}` },
  { name: 'allorigins-raw', wrap: false, sizeKB: Infinity, url: t => `https://api.allorigins.win/raw?url=${encodeURIComponent(t)}` },
  { name: 'allorigins-get', wrap: true,  sizeKB: Infinity, url: t => `https://api.allorigins.win/get?url=${encodeURIComponent(t)}` },
  { name: 'codetabs.com',   wrap: false, sizeKB: 625,      url: t => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(t)}` },
  { name: 'cors.x2u.in',    wrap: false, sizeKB: 500,      url: t => `https://cors.x2u.in/${t}` },
];

const CORS_PROXY_DOMAINS = [
  'prices.azure.com', 'corsproxy.io', 'api.allorigins.win', 'api.codetabs.com', 'cors.x2u.in',
];

const SERVICE_CATEGORIES = {
  'Virtual Machine': {
    apiServiceName: 'Virtual Machines',
    steps: [
      { key: 'os',      label: '운영체제', options: ['Linux', 'Windows', 'Red Hat Enterprise Linux', 'SUSE'] },
      { key: 'tier',    label: 'Tier',      options: ['Standard', 'Spot'] },
      { key: 'license', label: '라이선스', options: ['라이선스 포함', 'Azure Hybrid Benefit'] },
      { key: 'series',  label: '시리즈',   options: ['B-series', 'D-series v6', 'D-series v5', 'D-series v3', 'Dl-series v6', 'Ds-series v6', 'E-series v6', 'E-series v5', 'F-series v2', 'M-series', 'N-series'] },
    ],
    instanceField: true,
    instanceParentKey: 'series',
  },

  'Disk': {
    apiServiceName: 'Storage',
    steps: [
      { key: 'storageType', label: 'Storage Type', options: ['Premium SSD Managed Disks', 'Standard SSD Managed Disks', 'Standard HDD Managed Disks'] },
      { key: 'redundancy',  label: '중복성',      options: ['LRS', 'ZRS'] },
    ],
    conditionalSteps: {
      'Premium SSD Managed Disks': [
        {
          key: 'perfTier',
          label: '성능 계층 업그레이드',
          options: ['없음 (기본)', 'P4', 'P6', 'P10', 'P15', 'P20', 'P30', 'P40', 'P50', 'P60', 'P70', 'P80'],
          tooltip: '디스크 SKU보다 높은 성능 계층으로 업그레이드. 스토리지 용량 유지하면서 성능만 향상.',
        },
        {
          key: 'snapshotGB',
          label: '스냅샷 (GB, 월)',
          type: 'number', min: 0, step: 1, default: 0,
          tooltip: '증분 스냅샷 저장 GB. 단가(LRS 기준) × GB/월로 계산',
        },
        {
          key: 'confEncryptionEnabled',
          label: 'Confidential OS Encryption',
          options: ['비활성 (기본)', '활성화'],
          tooltip: 'GiB × 730h × 단가(Per GiB)로 계산. 디스크 크기에 자동 적용됨.',
        },
        {
          key: 'burstingEnabled',
          label: '디스크 버스팅 (On-Demand)',
          options: ['비활성 (기본)', '활성화 (P30 이상)'],
          tooltip: 'P30 이상에서 사용 가능. 활성화 월 정액 + 버스트 트랜잭션 비용',
        },
        {
          key: 'burstMaxIOPS',
          label: '예상 최대 IOPS (버스트)',
          type: 'number', min: 0, step: 100, default: 0,
          tooltip: '버스트 중 예상하는 최대 IOPS. 0이면 계산에서 제외됨.',
        },
        {
          key: 'burstMaxThroughputMBs',
          label: '예상 최대 처리량 (MB/s, 버스트)',
          type: 'number', min: 0, step: 10, default: 0,
          tooltip: '버스트 중 예상하는 최대 처리량 MB/s.',
        },
        {
          key: 'burstMinsPerDay',
          label: '근무일당 버스트 시간 (분)',
          type: 'number', min: 0, step: 1, default: 30,
          tooltip: '하루 근무 중 버스트를 사용하는 분. 트랜잭션 양 계산에 사용.',
        },
        {
          key: 'burstWorkDaysPerMonth',
          label: '월간 근무일 수',
          type: 'number', min: 0, step: 1, default: 20,
          tooltip: '한 달 중 실제 근무일 수. 트랜잭션 양 계산에 사용.',
        },
        {
          key: 'sharedDiskMounts',
          label: '공유 디스크 마운트 수 (VM 수)',
          type: 'number', min: 0, step: 1, default: 0,
          tooltip: '하나의 디스크를 마운트할 VM 수. 마운트당 추가 비용 발생. 0이면 공유 안 함.',
        },
      ],
      'Standard SSD Managed Disks': [
        {
          key: 'transactionUnits',
          label: 'Storage 트랜잭션 (10,000 단위, 월)',
          type: 'number', min: 0, step: 1, default: 0,
        },
        {
          key: 'snapshotGB',
          label: '스냅샷 (GB, 월)',
          type: 'number', min: 0, step: 1, default: 0,
          tooltip: '디스크 스냅샷 LRS 저장 GB',
        },
      ],
      'Standard HDD Managed Disks': [
        {
          key: 'transactionUnits',
          label: 'Storage 트랜잭션 (10,000 단위, 월)',
          type: 'number', min: 0, step: 1, default: 0,
        },
        {
          key: 'snapshotGB',
          label: '스냅샷 (GB, 월)',
          type: 'number', min: 0, step: 1, default: 0,
          tooltip: '디스크 스냅샷 LRS 저장 GB',
        },
      ],
    },
    instanceField: true,
    instanceParentKey: 'storageType',
  },

  'Azure Files': {
    apiServiceName: 'Storage',
    steps: [
      { key: 'fileTier',   label: '계층',      options: ['Premium', 'Hot', 'Cool', 'Transaction Optimized'] },
      { key: 'redundancy', label: '중복성',  options: ['LRS', 'ZRS', 'GRS'] },
      { key: 'metric',     label: '청구 항목', options: ['Data Stored', 'Snapshots', 'Metadata'] },
    ],
    instanceField: false,
  },
  'Blob Storage': {
    apiServiceName: 'Storage',
    steps: [
      { key: 'blobTier',   label: '액세스 계층', options: ['Hot', 'Cool', 'Cold', 'Archive'] },
      { key: 'redundancy', label: '중복성',      options: ['LRS', 'ZRS', 'GRS', 'RA-GRS', 'GZRS', 'RA-GZRS'] },
      { key: 'metric',     label: '청구 항목',   options: ['Data Stored', 'Read Operations', 'Write Operations', 'Data Retrieval'] },
    ],
    instanceField: false,
  },
  'VPN Gateway': {
    apiServiceName: 'VPN Gateway',
    steps: [
      { key: 'sku',                 label: 'SKU',                            options: ['Basic','VpnGw1','VpnGw2','VpnGw3','VpnGw4','VpnGw5','VpnGw1AZ','VpnGw2AZ','VpnGw3AZ','VpnGw4AZ','VpnGw5AZ'] },
      { key: 'gatewayHours',        label: '게이트웨이 시간 (월, Hours)',      type: 'number', min: 0, step: 1, default: 730 },
      { key: 'extraS2sTunnels',     label: 'S2S 추가 터널 수',                  type: 'number', min: 0, step: 1, default: 0 },
      { key: 'extraP2sConnections', label: 'P2S 추가 연결 수',                  type: 'number', min: 0, step: 1, default: 0 },
      { key: 'vnetTransferType',    label: 'VNET 데이터 전송 유형',            options: ['VNET 간', 'VPN'] },
      { key: 'vnetGB',              label: 'VNET 간 데이터 전송 (월, GB)',     type: 'number', min: 0, step: 1, default: 0 },
    ],
    instanceField: false,
  },
  'Load Balancer':   { apiServiceName: 'Load Balancer',          steps: [{ key: 'tier', label: '계층', options: ['Standard','Basic','Gateway'] }, { key: 'metric', label: '청구 항목', options: ['Rules','Data Processed','Inbound NAT Rules'] }], instanceField: false },
  'Application Gateway': { apiServiceName: 'Application Gateway', steps: [{ key: 'sku', label: 'SKU', options: ['Standard_v2','WAF_v2','Standard_Small','Standard_Medium','Standard_Large'] }], instanceField: false },
  'Public IP':       { apiServiceName: 'Virtual Network',         steps: [{ key: 'sku', label: 'SKU', options: ['Standard','Basic'] }, { key: 'ipType', label: 'IP 유형', options: ['Static','Dynamic'] }], instanceField: false },
  'Azure Firewall':  { apiServiceName: 'Azure Firewall',          steps: [{ key: 'tier', label: '계층', options: ['Standard','Premium','Basic'] }, { key: 'metric', label: '청구 항목', options: ['Deployment','Data Processed'] }], instanceField: false },
  'Bandwidth':       { apiServiceName: 'Bandwidth',               steps: [{ key: 'direction', label: '전송 방향', options: ['Outbound (Internet Egress)','Inter-region','Intra-region'] }], instanceField: false },
  'Azure SQL Database': { apiServiceName: 'SQL Database',         steps: [{ key: 'tier', label: '계층', options: ['General Purpose','Business Critical','Hyperscale'] }, { key: 'compute', label: '컴퓨팅', options: ['Provisioned','Serverless'] }, { key: 'hardware', label: '하드웨어', options: ['Gen5','M-series','Fsv2-series'] }], instanceField: false },
  'Azure Database for MySQL': { apiServiceName: 'Azure Database for MySQL', steps: [{ key: 'tier', label: '계층', options: ['Burstable','General Purpose','Business Critical'] }, { key: 'compute', label: 'vCore', options: ['B1ms','B2s','D2ds_v4','D4ds_v4','D8ds_v4','D16ds_v4','D32ds_v4'] }], instanceField: false },
  'App Service':     { apiServiceName: 'Azure App Service',       steps: [{ key: 'tier', label: '계층', options: ['Free','Shared','Basic','Standard','Premium v3','Isolated v2'] }, { key: 'os', label: 'OS', options: ['Windows','Linux'] }, { key: 'size', label: '인스턴스', options: ['B1','B2','B3','S1','S2','S3','P1V3','P2V3','P3V3'] }], instanceField: false },
  'Azure Bastion':   { apiServiceName: 'Azure Bastion',           steps: [{ key: 'tier', label: '계층', options: ['Basic','Standard'] }], instanceField: false },
  'NAT Gateway':     { apiServiceName: 'Virtual Network',         steps: [{ key: 'metric', label: '청구 항목', options: ['Resource Hour','Data Processed'] }], instanceField: false },
};

const VM_INSTANCE_CATALOG = {
  'B-series':    [{name:'B1s',vCPU:1,ram:1},{name:'B1ms',vCPU:1,ram:2},{name:'B2s',vCPU:2,ram:4},{name:'B2ms',vCPU:2,ram:8},{name:'B4ms',vCPU:4,ram:16},{name:'B8ms',vCPU:8,ram:32},{name:'B12ms',vCPU:12,ram:48},{name:'B16ms',vCPU:16,ram:64},{name:'B20ms',vCPU:20,ram:80}],
  'D-series v6': [{name:'D2s_v6',vCPU:2,ram:8},{name:'D4s_v6',vCPU:4,ram:16},{name:'D8s_v6',vCPU:8,ram:32},{name:'D16s_v6',vCPU:16,ram:64},{name:'D32s_v6',vCPU:32,ram:128},{name:'D48s_v6',vCPU:48,ram:192},{name:'D64s_v6',vCPU:64,ram:256},{name:'D96s_v6',vCPU:96,ram:384}],
  'D-series v5': [{name:'D2s_v5',vCPU:2,ram:8},{name:'D4s_v5',vCPU:4,ram:16},{name:'D8s_v5',vCPU:8,ram:32},{name:'D16s_v5',vCPU:16,ram:64},{name:'D32s_v5',vCPU:32,ram:128},{name:'D64s_v5',vCPU:64,ram:256}],
  'D-series v3': [{name:'D2s_v3',vCPU:2,ram:8},{name:'D4s_v3',vCPU:4,ram:16},{name:'D8s_v3',vCPU:8,ram:32},{name:'D16s_v3',vCPU:16,ram:64},{name:'D32s_v3',vCPU:32,ram:128},{name:'D64s_v3',vCPU:64,ram:256}],
  'Dl-series v6':[{name:'D2ls_v6',vCPU:2,ram:4},{name:'D4ls_v6',vCPU:4,ram:8},{name:'D8ls_v6',vCPU:8,ram:16},{name:'D16ls_v6',vCPU:16,ram:32},{name:'D32ls_v6',vCPU:32,ram:64},{name:'D64ls_v6',vCPU:64,ram:128}],
  'Ds-series v6':[{name:'D2ds_v6',vCPU:2,ram:8},{name:'D4ds_v6',vCPU:4,ram:16},{name:'D8ds_v6',vCPU:8,ram:32},{name:'D16ds_v6',vCPU:16,ram:64},{name:'D32ds_v6',vCPU:32,ram:128},{name:'D64ds_v6',vCPU:64,ram:256}],
  'E-series v6': [{name:'E2s_v6',vCPU:2,ram:16},{name:'E4s_v6',vCPU:4,ram:32},{name:'E8s_v6',vCPU:8,ram:64},{name:'E16s_v6',vCPU:16,ram:128},{name:'E32s_v6',vCPU:32,ram:256},{name:'E64s_v6',vCPU:64,ram:512}],
  'E-series v5': [{name:'E2s_v5',vCPU:2,ram:16},{name:'E4s_v5',vCPU:4,ram:32},{name:'E8s_v5',vCPU:8,ram:64},{name:'E16s_v5',vCPU:16,ram:128},{name:'E32s_v5',vCPU:32,ram:256},{name:'E64s_v5',vCPU:64,ram:432}],
  'F-series v2': [{name:'F2s_v2',vCPU:2,ram:4},{name:'F4s_v2',vCPU:4,ram:8},{name:'F8s_v2',vCPU:8,ram:16},{name:'F16s_v2',vCPU:16,ram:32},{name:'F32s_v2',vCPU:32,ram:64},{name:'F64s_v2',vCPU:64,ram:128}],
  'M-series':    [{name:'M8ms',vCPU:8,ram:218.75},{name:'M16ms',vCPU:16,ram:437.5},{name:'M32ms',vCPU:32,ram:875},{name:'M64ms',vCPU:64,ram:1750}],
  'N-series':    [{name:'NC4as_T4_v3',vCPU:4,ram:28},{name:'NC8as_T4_v3',vCPU:8,ram:56},{name:'NC16as_T4_v3',vCPU:16,ram:110},{name:'NC64as_T4_v3',vCPU:64,ram:440}],
};

const DISK_CATALOG = {
  'Premium SSD Managed Disks': [
    {name:'P1',size:4,iops:120,throughput:25},
    {name:'P2',size:8,iops:120,throughput:25},
    {name:'P3',size:16,iops:120,throughput:25},
    {name:'P4',size:32,iops:120,throughput:25},
    {name:'P6',size:64,iops:240,throughput:50},
    {name:'P10',size:128,iops:500,throughput:100},
    {name:'P15',size:256,iops:1100,throughput:125},
    {name:'P20',size:512,iops:2300,throughput:150},
    {name:'P30',size:1024,iops:5000,throughput:200},
    {name:'P40',size:2048,iops:7500,throughput:250},
    {name:'P50',size:4096,iops:7500,throughput:250},
    {name:'P60',size:8192,iops:16000,throughput:500},
    {name:'P70',size:16384,iops:18000,throughput:750},
    {name:'P80',size:32767,iops:20000,throughput:900},
  ],
  'Standard SSD Managed Disks': [
    {name:'E1',size:4},{name:'E2',size:8},{name:'E3',size:16},{name:'E4',size:32},
    {name:'E6',size:64},{name:'E10',size:128},{name:'E15',size:256},{name:'E20',size:512},
    {name:'E30',size:1024},{name:'E40',size:2048},{name:'E50',size:4096},
    {name:'E60',size:8192},{name:'E70',size:16384},{name:'E80',size:32767},
  ],
  'Standard HDD Managed Disks': [
    {name:'S4',size:32},{name:'S6',size:64},{name:'S10',size:128},{name:'S15',size:256},
    {name:'S20',size:512},{name:'S30',size:1024},{name:'S40',size:2048},{name:'S50',size:4096},
    {name:'S60',size:8192},{name:'S70',size:16384},{name:'S80',size:32767},
  ],
};

const REGION_LABEL = {
  koreacentral: 'Korea Central', koreasouth: 'Korea South',
  japaneast: 'Japan East', eastus: 'East US', westus2: 'West US 2',
  westeurope: 'West Europe', southeastasia: 'Southeast Asia',
};
