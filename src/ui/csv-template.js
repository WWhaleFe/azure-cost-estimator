// ================================================================
// ui/csv-template.js — CSV 양식(예시 행 + 옵션 사전) 생성 (DOM 비의존)
// ----------------------------------------------------------------
// export-csv.js 에서 분리. 브라우저 API를 쓰지 않으므로 테스트(Node)에서도
// 그대로 import 해 양식 본문을 생성·검증할 수 있다(service-order.js 와 같은 이유).
//
// [v115] 부모 종속 옵션 전개
//   각 서비스의 steps[].options 는 _applyStepVisibility 가 부모 값
//   (rebuildKeys·instanceParentKey)에 따라 통째로 갈아끼운다. 따라서 정의를 그냥
//   읽으면 "기본 부모 값에 해당하는 목록"만 보이고, 나머지 값은 사전에서 누락된다.
//   누락된 값을 양식에 적으면 _applyStepVisibility 가 조용히 첫 번째 값으로
//   바꿔버리므로(대체), 사전에는 부모 조합을 순회해 얻은 전체 값이 실려야 한다.
//     예) Azure SQL Database hardware — 정의상 [Gen5|Fsv2-series] 뿐이지만
//         Business Critical=M-series, Hyperscale=Premium-series 등이 실제로 유효
// ================================================================
import { REG, SERVICE_CATEGORIES } from '../core/registry.js';
import { REGION_LABEL } from '../core/config.js';
import { SERVICE_CATEGORY_ORDER } from './service-order.js';

export var CSV_HEADER = ['Region', '분류', 'ServiceCategory', 'SKU', 'Qty', 'Hours', 'Options'];

// SKU 열로 받는 옵션 키(인스턴스·단일 SKU가 있는 서비스만). 나머지는 Options로만 지정
export var CSV_SKU_OPTION_KEY = {
  'Virtual Machine': 'instance', 'Disk': 'diskInstance', 'VPN Gateway': 'sku',
  'App Service': 'size',
  'Application Gateway': 'sku', 'Public IP': 'sku',
  'Azure Cache for Redis': 'sku',
};

// 각 서비스의 SKU 열 의미(인스턴스/단일 SKU가 있는 서비스만)
export var CSV_SKU_DESC = {
  'Virtual Machine': '인스턴스(예 D4s_v5, 선택 series에 속해야 함)',
  'Disk': '디스크 크기 SKU(예 P30; 프로비저닝형은 비움)',
  'VPN Gateway': '게이트웨이 SKU(예 VpnGw1)',
  'App Service': '인스턴스(예 P1 v3, 선택 tier에 속해야 함)',
  'Application Gateway': 'SKU(예 Standard_v2)',
  'Public IP': 'SKU(예 Standard)',
  'Azure Cache for Redis': '캐시 크기(예 C0, 선택 tier에 속해야 함)',
};

export function csvEscapeField(v) {
  var s = (v === null || v === undefined) ? '' : String(v);
  if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
export function csvRowToLine(arr) { return arr.map(csvEscapeField).join(','); }

// ================================================================
// 양식에 넣을 서비스별 예시 행
//   [Region, 분류(메모), ServiceCategory, SKU, Qty, Hours, Options]
//   SERVICE_CATEGORY_ORDER 순서를 따르며, 서비스마다 서로 다른 구성 예시를 2~3개 둔다(v101).
//   ※ 카테고리가 하나라도 빠지면 test/csv-template.test.js 가 실패한다.
// ================================================================
export function buildExampleRows() {
  return [
    ['koreacentral', '웹 서버(Linux)',        'Virtual Machine',            'D4s_v5',       '2', '730',  'os=Linux; swType=(OS Only); tier=Standard; license=라이선스 포함; category=전체; series=D-series v5'],
    ['koreacentral', '앱 서버(Windows)',      'Virtual Machine',            'D2s_v5',       '1', '730',  'os=Windows; swType=(OS Only); tier=Standard; license=라이선스 포함; category=전체; series=D-series v5'],
    ['koreacentral', '웹 서버(신형 v7)',       'Virtual Machine',            'D4s_v7',       '2', '730',  'os=Linux; swType=(OS Only); tier=Standard; license=라이선스 포함; category=일반적인 용도; series=D-series v7'],
    ['koreacentral', 'DB 서버(메모리 v7)',     'Virtual Machine',            'E8ds_v7',      '1', '730',  'os=Linux; swType=(OS Only); tier=Standard; license=라이선스 포함; category=메모리에 최적화; series=Ed-series v7'],
    ['koreacentral', '개발 서버(B시리즈)',     'Virtual Machine',            'B2ms',         '1', '730',  'os=Linux; swType=(OS Only); tier=Standard; license=라이선스 포함; category=전체; series=B-series'],
    ['koreacentral', 'GPU 학습(NC A100 v4)',   'Virtual Machine',            'NC24ads_A100_v4','1','730',  'os=Linux; swType=(OS Only); tier=Standard; license=라이선스 포함; category=GPU; series=NC A100 v4 (GPU)'],
    ['polandcentral','GPU 추론(ND A100 v4)',   'Virtual Machine',            'ND96amsr_A100_v4','1','730', 'os=Linux; swType=(OS Only); tier=Standard; license=라이선스 포함; category=GPU; series=ND A100 v4 (GPU)'],
    ['koreacentral', 'Elasticsearch 노드 3대',  'Virtual Machine',            'E8s_v5',       '3', '730',  'os=Linux; swType=(OS Only); tier=Standard; license=라이선스 포함; category=메모리에 최적화; series=E-series v5'],
    ['koreacentral', 'Elasticsearch 데이터 디스크','Disk',                     'P20',          '3', '730',  'diskSubType=프리미엄 SSD; redundancy=LRS; snapshotGB=0'],
    ['koreacentral', 'AKS 클러스터(SLA)',     'Azure Kubernetes Service',   '',             '1', '730',  'aksTier=Standard (표준); slaOption=SLA'],
    ['koreacentral', 'AKS 클러스터(LTS)',     'Azure Kubernetes Service',   '',             '1', '730',  'aksTier=Standard (표준); slaOption=SLA and Long Term Support'],
    ['koreacentral', '컨테이너 앱(vCPU 활성)',  'Container Apps',             '',             '1', '2628000', 'plan=Standard; item=Standard vCPU Active Usage'],
    ['koreacentral', '컨테이너 앱(요청 5백만)', 'Container Apps',             '',             '1', '5',    'plan=Standard; item=Standard Requests'],
    ['koreacentral', '컨테이너 앱(Dedicated)',  'Container Apps',             '',             '1', '730',  'plan=Dedicated; item=Dedicated Plan Management'],
    ['koreacentral', '레지스트리 Basic',       'Azure Container Registry',   '',             '1', '30',   'tier=Basic; metric=레지스트리 (일 단위)'],
    ['koreacentral', '레지스트리 Premium',     'Azure Container Registry',   '',             '1', '30',   'tier=Premium; metric=레지스트리 (일 단위)'],
    ['koreacentral', 'ACR 추가 저장소 100GB',  'Azure Container Registry',   '',             '1', '100',  'tier=Standard; metric=추가 저장소 (GB/월)'],
    ['koreacentral', 'DB 디스크(프리미엄 SSD)', 'Disk',                      'P30',          '1', '730',  'diskSubType=프리미엄 SSD; redundancy=LRS; snapshotGB=0'],
    ['koreacentral', 'OS 디스크(표준 SSD)',    'Disk',                       'E10',          '1', '730',  'diskSubType=표준 SSD; redundancy=LRS; transactionUnits=10; snapshotGB=0'],
    ['koreacentral', '로그 디스크(프로비저닝)', 'Disk',                       '',             '1', '730',  'diskSubType=Ultra Disk; diskSizeGiB=1024; provisionedIOPS=2000; provisionedMBps=200'],
    ['koreacentral', '파일 공유(Hot 100GB)',   'Azure Files',                '',             '1', '100',  'fileTier=Hot; redundancy=LRS; metric=Data Stored'],
    ['koreacentral', '파일 공유(Premium 500GB)','Azure Files',               '',             '1', '500',  'fileTier=Premium; redundancy=LRS; metric=Data Stored'],
    ['koreacentral', '파일 v2(SSD 1TiB)',     'Azure Files Provisioned v2', '',             '1', '730',  'media=SSD; redundancy=LRS; storageGiB=1024; iops=3000; throughput=125'],
    ['koreacentral', '파일 v2(HDD 2TiB)',     'Azure Files Provisioned v2', '',             '1', '730',  'media=HDD; redundancy=LRS; storageGiB=2048; iops=0; throughput=0'],
    ['koreacentral', '오브젝트(Hot 1TB)',      'Blob Storage',               '',             '1', '1000', 'blobTier=Hot; redundancy=LRS; metric=Data Stored'],
    ['koreacentral', '오브젝트(Cool 5TB)',     'Blob Storage',               '',             '1', '5000', 'blobTier=Cool; redundancy=LRS; metric=Data Stored'],
    ['koreacentral', '아카이브(10TB)',         'Blob Storage',               '',             '1', '10000','blobTier=Archive; redundancy=LRS; metric=Data Stored'],
    ['koreacentral', '페이지 Blob(프리미엄 P30)','Page Blob',                '',             '1', '730',  'performance=Premium; redundancy=LRS; diskSize=P30'],
    ['koreacentral', '페이지 Blob(표준 1TB)',  'Page Blob',                  '',             '1', '1000', 'performance=Standard; redundancy=LRS; metric=Data Stored'],
    ['koreacentral', '테이블 스토리지 100GB',   'Storage Account',            '',             '1', '100',  'storageType=Table; redundancy=LRS; metric=Data Stored'],
    ['koreacentral', '큐 스토리지 50GB',       'Storage Account',            '',             '1', '50',   'storageType=Queue; redundancy=LRS; metric=Data Stored'],
    ['koreacentral', 'Data Lake(Hot 1TB)',   'Data Lake Storage Gen2',     '',             '1', '1000', 'namespace=계층 구조 네임스페이스; accessTier=Hot; redundancy=LRS; metric=Data Stored'],
    ['koreacentral', 'Data Lake(Cool 5TB)',  'Data Lake Storage Gen2',     '',             '1', '5000', 'namespace=계층 구조 네임스페이스; accessTier=Cool; redundancy=LRS; metric=Data Stored'],
    ['koreacentral', '백업-보호 인스턴스(VM)',  'Backup',                     '',             '1', '1',    'metric=보호 인스턴스; workload=Azure VM'],
    ['koreacentral', '백업-저장소 500GB',      'Backup',                     '',             '1', '500',  'metric=백업 저장소; storageTier=Standard; redundancy=LRS'],
    ['koreacentral', 'VNet 피어링(송신 1TB)',  'Virtual Network',            '',             '1', '1000', 'direction=Global Peering - Outbound (Egress)'],
    ['koreacentral', 'VNet 피어링(수신 1TB)',  'Virtual Network',            '',             '1', '1000', 'direction=Global Peering - Inbound (Ingress)'],
    ['koreacentral', '본사 VPN(VpnGw1)',      'VPN Gateway',                'VpnGw1',       '1', '730',  'gatewayHours=730; vnetTransferType=VNET 간; vnetGB=0'],
    ['koreacentral', '지사 VPN(VpnGw2+전송)',  'VPN Gateway',                'VpnGw2',       '1', '730',  'gatewayHours=730; vnetTransferType=VNET 간; vnetGB=100'],
    ['koreacentral', '부하 분산(규칙)',        'Load Balancer',              '',             '1', '730',  'tier=Standard; metric=규칙 (시간당, 5개 포함)'],
    ['koreacentral', '부하 분산(데이터 500GB)', 'Load Balancer',              '',             '1', '500',  'tier=Standard; metric=데이터 처리 (GB)'],
    ['koreacentral', '게이트웨이 LB',          'Load Balancer',              '',             '1', '730',  'tier=Gateway; metric=게이트웨이 (시간당)'],
    ['koreacentral', '앱 게이트웨이(v2 고정)',  'Application Gateway',        'Standard_v2',  '1', '730',  'metric=고정 비용 (시간당)'],
    ['koreacentral', '앱 게이트웨이(WAF v2)',   'Application Gateway',        'WAF_v2',       '1', '730',  'metric=고정 비용 (시간당)'],
    ['koreacentral', 'Front Door(Std 기본료)',  'Azure Front Door',           '',             '1', '1',    'tier=Standard; zone=Zone 2; item=Standard Base Fees'],
    ['koreacentral', 'Front Door(Std 송신 1TB)','Azure Front Door',           '',             '1', '1000', 'tier=Standard; zone=Zone 2; item=Standard Data Transfer Out'],
    ['koreacentral', 'Front Door(Premium 기본료)','Azure Front Door',         '',             '1', '1',    'tier=Premium; zone=Zone 2; item=Premium Base Fees'],
    ['koreacentral', 'Front Door(WAF 정책)',      'Azure Front Door',           '',             '1', '1',    'tier=Standard; zone=Zone 2; item=Standard Policy'],
    ['koreacentral', '공인 IP(Standard)',     'Public IP',                  'Standard',     '1', '730',  'ipType=Static'],
    ['koreacentral', '공인 IP(Basic)',        'Public IP',                  'Basic',        '1', '730',  'ipType=Static'],
    ['koreacentral', '방화벽(Standard 배포)',  'Azure Firewall',             '',             '1', '730',  'tier=Standard; metric=Deployment (배포, 시간당)'],
    ['koreacentral', '방화벽(데이터 1TB)',     'Azure Firewall',             '',             '1', '1000', 'tier=Standard; metric=Data Processed (데이터 처리, GB)'],
    ['koreacentral', '인터넷 송신 1TB',        'Bandwidth',                  '',             '1', '1000', 'direction=Outbound (Internet Egress)'],
    ['koreacentral', '리전 간 전송 500GB',     'Bandwidth',                  '',             '1', '500',  'direction=Inter-region'],
    ['koreacentral', 'NAT 게이트웨이(시간)',    'NAT Gateway',                '',             '1', '730',  'metric=Resource Hour'],
    ['koreacentral', 'NAT 데이터 1TB',        'NAT Gateway',                '',             '1', '1000', 'metric=Data Processed'],
    ['koreacentral', '프라이빗 엔드포인트 3개', 'Azure Private Link',          '',             '3', '730',  'metric=프라이빗 엔드포인트 (시간당)'],
    ['koreacentral', 'PL 데이터 처리 1TB',     'Azure Private Link',         '',             '1', '1000', 'metric=데이터 처리 - Inbound (GB)'],
    ['koreacentral', 'DNS 영역 2개',          'Azure DNS',                  '',             '2', '1',    'zoneType=Public; metric=호스팅 영역 (월)'],
    ['koreacentral', 'DNS 쿼리 10백만',        'Azure DNS',                  '',             '1', '10',   'zoneType=Public; metric=DNS 쿼리 (백만)'],
    ['koreacentral', '프라이빗 DNS 영역',      'Azure DNS',                  '',             '1', '1',    'zoneType=Private; metric=호스팅 영역 (월)'],
    ['koreacentral', 'SQL DB(GP 2vCore)',    'Azure SQL Database',         '',             '1', '730',  'model=vCore; tier=General Purpose; compute=Provisioned; hardware=Gen5; vCores=2; redundancy=로컬 중복; license=라이선스 포함; storageGB=32'],
    ['koreacentral', 'SQL DB(BC 4vCore)',    'Azure SQL Database',         '',             '1', '730',  'model=vCore; tier=Business Critical; compute=Provisioned; hardware=Gen5; vCores=4; redundancy=로컬 중복; license=라이선스 포함; storageGB=64'],
    ['koreacentral', 'SQL DB(서버리스 2vCore)','Azure SQL Database',         '',             '1', '300',  'model=vCore; tier=General Purpose; compute=Serverless; hardware=Gen5; vCores=2; redundancy=로컬 중복'],
    ['koreacentral', 'SQL DB(DTU S3)',       'Azure SQL Database',         '',             '1', '730',  'model=DTU; tier=Standard; dtuSize=S3'],
    ['koreacentral', 'SQL 풀(Basic 100)',     'Azure SQL Database Elastic Pool', '',        '1', '730',  'tier=Basic; poolSize=100'],
    ['koreacentral', 'SQL 풀(Standard 200)',  'Azure SQL Database Elastic Pool', '',        '1', '730',  'tier=Standard; poolSize=200'],
    ['koreacentral', 'SQL MI(GP 8vCore)',    'Azure SQL Managed Instance', '',             '1', '730',  'tier=General Purpose; hardware=Gen5; vCores=8; redundancy=로컬 중복; license=라이선스 포함'],
    ['koreacentral', 'SQL MI(BC 4vCore)',    'Azure SQL Managed Instance', '',             '1', '730',  'tier=Business Critical; hardware=Gen5; vCores=4; redundancy=로컬 중복; license=라이선스 포함'],
    ['koreacentral', 'MySQL(개발 B1MS)',      'Azure Database for MySQL',   '',             '1', '730',  'tier=Burstable; instance=B1MS'],
    ['koreacentral', 'MySQL(GP 2vCore)',     'Azure Database for MySQL',   '',             '1', '730',  'tier=General Purpose; series=Ddsv5; vCores=2'],
    ['koreacentral', 'MySQL(BC 2vCore)',     'Azure Database for MySQL',   '',             '1', '730',  'tier=Business Critical; series=Edsv5; vCores=2'],
    ['koreacentral', 'Cosmos DB(수동 400RU)', 'Azure Cosmos DB',            '',             '1', '730',  'model=Provisioned (수동, RU/s); rus=400'],
    ['koreacentral', 'Cosmos DB(Autoscale 1000RU)','Azure Cosmos DB',       '',             '1', '730',  'model=Autoscale (RU/s); rus=1000'],
    ['koreacentral', 'Cosmos DB(저장소 100GB)','Azure Cosmos DB',            '',             '1', '100',  'model=저장소 (Data Stored, GB)'],
    ['koreacentral', 'Redis(Standard C0)',   'Azure Cache for Redis',      'C0',           '1', '730',  'tier=Standard'],
    ['koreacentral', 'Redis(Basic C1)',      'Azure Cache for Redis',      'C1',           '1', '730',  'tier=Basic'],
    ['koreacentral', 'Redis(Premium P1)',    'Azure Cache for Redis',      'P1',           '1', '730',  'tier=Premium'],
    ['koreacentral', '앱 서비스(P1 v3)',       'App Service',                'P1 v3',        '1', '730',  'tier=Premium v3; os=Linux'],
    ['koreacentral', '앱 서비스(S1 Windows)',  'App Service',                'S1',           '1', '730',  'tier=Standard; os=Windows'],
    ['koreacentral', '앱 서비스(P0v3)',        'App Service',                'P0v3',         '1', '730',  'tier=Premium v3; os=Linux'],
    ['koreacentral', 'APIM(Basic)',           'API Management',             '',             '1', '730',  'tier=Basic'],
    ['koreacentral', 'APIM(Standard v2)',     'API Management',             '',             '1', '730',  'tier=Standard v2'],
    ['koreacentral', 'APIM(Consumption 100만 콜)','API Management',          '',             '1', '100',  'tier=Consumption'],
    ['koreacentral', 'Bastion(Basic)',        'Azure Bastion',              '',             '1', '730',  'tier=Basic; metric=게이트웨이(시간당)'],
    ['koreacentral', 'Bastion(Standard)',     'Azure Bastion',              '',             '1', '730',  'tier=Standard; metric=게이트웨이(시간당)'],
    ['koreacentral', 'Event Hubs(Std TU)',    'Event Hubs',                 '',             '1', '730',  'tier=Standard; item=Standard Throughput Unit'],
    ['koreacentral', 'Event Hubs(수신 100M)',  'Event Hubs',                 '',             '1', '100',  'tier=Standard; item=Standard Ingress Events'],
    ['koreacentral', 'Event Hubs(Premium PU)', 'Event Hubs',                 '',             '1', '730',  'tier=Premium; item=Premium Processing Unit'],
    ['koreacentral', 'Event Hubs(지역복제 100GB)','Event Hubs',                 '',             '1', '100',  'tier=Geo Replication Zone 2; item=Geo Replication Zone 2 Data Transfer'],
    ['koreacentral', 'Service Bus(Std 기본)',  'Service Bus',                '',             '1', '730',  'tier=Standard; item=Standard Base Unit'],
    ['koreacentral', 'Service Bus(작업 50M)',  'Service Bus',                '',             '1', '50',   'tier=Standard; item=Standard Messaging Operations'],
    ['koreacentral', 'Service Bus(Premium MU)','Service Bus',                '',             '1', '730',  'tier=Premium; item=Premium Messaging Unit'],
    ['koreacentral', 'Service Bus(하이브리드 연결)','Service Bus',              '',             '1', '730',  'tier=Hybrid Connections; item=Hybrid Connections Listener Unit'],
    ['koreacentral', 'Service Bus(WCF Relay)', 'Service Bus',                '',             '1', '730',  'tier=WCF Relay; item=WCF Relay'],
    ['koreacentral', '모니터 메트릭 수집',      'Azure Monitor',              '',             '1', '10',   'group=메트릭; item=메트릭 수집 (10M 샘플)'],
    ['koreacentral', '모니터 경고 20개',        'Azure Monitor',              '',             '20', '1',   'group=경고 (월); item=리소스 모니터링 - 5분 주기'],
    ['koreacentral', '모니터 기본 로그 500GB',  'Azure Monitor',              '',             '1', '500',  'group=로그; item=기본 로그 수집 (GB)'],
    ['koreacentral', '모니터 약정 100GB/일',    'Azure Monitor',              '',             '1', '30',   'group=약정 계층 (일); item=100 GB/일 약정'],
    ['koreacentral', '로그 수집 100GB',        'Log Analytics',              '',             '1', '100',  'metric=Data Ingestion'],
    ['koreacentral', '로그 보존 500GB',        'Log Analytics',              '',             '1', '500',  'metric=Data Retention'],
    ['koreacentral', 'Sentinel(PAYG 100GB)',  'Microsoft Sentinel',         '',             '1', '100',  'model=Pay-as-you-go'],
    ['koreacentral', 'Sentinel(100GB 커밋 30일)','Microsoft Sentinel',       '',             '1', '30',   'model=100 GB Commitment Tier'],
    ['koreacentral', 'Key Vault 작업 100만건',  'Azure Key Vault',            '',             '1', '100',  'tier=Standard; metric=작업 (10K)'],
    ['koreacentral', 'Key Vault HSM 키 10개',   'Azure Key Vault',            '',             '10', '1',   'tier=Premium; metric=HSM 보호 RSA 2048비트 키 (키/월)'],
    ['koreacentral', 'Managed HSM(B1)',         'Azure Key Vault',            '',             '1', '730',  'tier=Managed HSM; metric=Standard B1 인스턴스 (시간)'],
    ['koreacentral', 'Synapse DW(DW100c)',    'Azure Synapse Analytics',    '',             '1', '730',  'component=Dedicated SQL Pool (DWU); dwuLevel=DW100c'],
    ['koreacentral', 'Synapse 서버리스(2TB)',  'Azure Synapse Analytics',    '',             '1', '2',    'component=Serverless SQL Pool (Data Processed)'],
    ['koreacentral', 'Fabric 용량(F64)',       'Microsoft Fabric',           '',             '1', '730',  'metric=용량 (CU 시간); capacity=F64'],
    ['koreacentral', 'Fabric 용량(F2 소규모)',  'Microsoft Fabric',           '',             '1', '730',  'metric=용량 (CU 시간); capacity=F2'],
    ['koreacentral', 'OneLake 저장소 5TB',     'Microsoft Fabric',           '',             '1', '5000', 'metric=OneLake 저장소 (GB/월); storageItem=OneLake 저장소 Hot (GB/월)'],
    ['koreacentral', 'OpenAI 입력(GPT-4.1 mini 10M)','Azure OpenAI',        '',             '1', '10',   'model=GPT-4.1 mini; deploymentType=Global; metric=입력 토큰'],
    ['koreacentral', 'OpenAI 출력(GPT-4.1 mini 3M)','Azure OpenAI',         '',             '1', '3',    'model=GPT-4.1 mini; deploymentType=Global; metric=출력 토큰'],
    ['koreacentral', 'OpenAI 임베딩(small 20M)','Azure OpenAI',              '',             '1', '20',   'model=text-embedding-3-small; deploymentType=Data Zone; metric=입력 토큰'],
    ['koreacentral', 'OpenAI 일괄 입력(GPT-5 10M)','Azure OpenAI',           '',             '1', '10',   'model=GPT-5; deploymentType=Batch Global; metric=입력 토큰'],
    ['koreacentral', 'ML 워크스페이스(0원)',    'Azure Machine Learning',     '',             '1', '1',    'metric=워크스페이스 (무료 · 과금 미터 없음)'],
    ['koreacentral', 'ML 추론 vCPU 추가요금',   'Azure Machine Learning',     '',             '32', '730', 'metric=vCPU 추가 요금 (시간)'],
    ['koreacentral', 'ML 추론 GPU 추가요금',    'Azure Machine Learning',     '',             '1', '730',  'metric=GPU 추가 요금 (시간)'],
    ['koreacentral', 'DevOps Basic 10명(5명 무료)','Azure DevOps',           '',             '10','1',    'plan=Basic Plan 사용자 (월); freeTier=차감 (조직 무료 한도 적용)'],
    ['koreacentral', 'DevOps 병렬 작업 3개',    'Azure DevOps',               '',             '3', '1',    'plan=MS-hosted 병렬 작업 (월); freeTier=차감 (조직 무료 한도 적용)'],
    ['koreacentral', 'GHE 사용자 50명',        'GitHub',                     '',             '50', '1',   'plan=GitHub Enterprise 사용자 (월)'],
    ['koreacentral', 'Copilot Business 20명',  'GitHub',                     '',             '20', '1',   'plan=Copilot Business 사용자 (월)'],
    ['koreacentral', 'Actions Linux 10000분',  'GitHub',                     '',             '1', '10000','plan=Actions Linux 실행 (분)'],
  ];
}

// ================================================================
// 부모 종속 옵션 전개
// ================================================================
var COMBO_LIMIT = 400;   // 조합 폭발 방어(초과하면 그 서비스는 합집합만 싣는다)

function _stepIndex(def, key) {
  for (var i = 0; i < def.steps.length; i++) if (def.steps[i].key === key) return i;
  return -1;
}

// 부모(드라이버) 키 — 이 값이 바뀌면 _applyStepVisibility 가 하위 스텝 옵션을 재구성한다.
//   instanceField=true 인 서비스(VM)의 instanceParentKey(series)는 SKU 열(인스턴스)만
//   좌우하고 목록은 별도 카탈로그 절에 실으므로 드라이버에서 뺀다(조합 폭발 방지).
function _driverKeys(def) {
  var keys = (def.rebuildKeys || []).slice();
  if (def.instanceParentKey && !def.instanceField) keys.push(def.instanceParentKey);
  var out = [];
  keys.forEach(function (k) {
    if (out.indexOf(k) < 0 && _stepIndex(def, k) >= 0) out.push(k);
  });
  return out.sort(function (a, b) { return _stepIndex(def, a) - _stepIndex(def, b); });
}

function _snapshotSteps(def) {
  var opts = {}, hidden = [];
  def.steps.forEach(function (s) {
    if (Array.isArray(s.options)) opts[s.key] = s.options.slice();
    if (s._hidden) hidden.push(s.key);
  });
  return { options: opts, hidden: hidden };
}

/**
 * 한 서비스의 모든 부모 조합을 실제로 적용해 스텝별 유효 값을 모은다.
 * @returns {{union:Object, combos:Array, drivers:string[], truncated:boolean}}
 *   union[key]  = 전 조합에서 유효한 값의 합집합(첫 등장 순서)
 *   combos[i]   = { driver:{key:value}, options:{key:[..]}, hidden:[key] }
 */
export function expandServiceOptions(cat) {
  var def = SERVICE_CATEGORIES[cat];
  if (!def || !def.steps) return null;

  // _applyStepVisibility 는 def.steps[].options 를 실제로 갈아끼우므로 원본을 되돌려 둔다
  var origin = def.steps.map(function (s) { return { options: s.options, _hidden: s._hidden }; });
  var restore = function () {
    def.steps.forEach(function (s, i) { s.options = origin[i].options; s._hidden = origin[i]._hidden; });
  };

  var apply = def._applyStepVisibility;
  var drivers = apply ? _driverKeys(def) : [];
  var combos = [], truncated = false;

  function walk(i, chosen) {
    if (combos.length >= COMBO_LIMIT) { truncated = true; return; }
    if (i === drivers.length) {
      var row = { options: Object.assign({}, chosen) };
      try { apply.call(def, row); } catch (e) { /* 조합이 성립하지 않으면 건너뜀 */ }
      var snap = _snapshotSteps(def);
      combos.push({ driver: Object.assign({}, chosen), options: snap.options, hidden: snap.hidden });
      return;
    }
    // 여기까지 고른 부모 값을 적용해야 이 드라이버의 실제 선택지가 나온다
    var probe = { options: Object.assign({}, chosen) };
    try { apply.call(def, probe); } catch (e) { /* 무시 */ }
    var idx = _stepIndex(def, drivers[i]);
    var opts = (idx >= 0 && Array.isArray(def.steps[idx].options)) ? def.steps[idx].options.slice() : [];
    if (!opts.length) opts = [''];
    opts.forEach(function (v) {
      var next = Object.assign({}, chosen);
      next[drivers[i]] = v;
      walk(i + 1, next);
    });
  }

  if (drivers.length) walk(0, {});
  else combos.push({ driver: {}, options: _snapshotSteps(def).options, hidden: _snapshotSteps(def).hidden });

  restore();

  var union = {};
  combos.forEach(function (c) {
    Object.keys(c.options).forEach(function (k) {
      if (!union[k]) union[k] = [];
      c.options[k].forEach(function (v) { if (union[k].indexOf(v) < 0) union[k].push(v); });
    });
  });
  return { union: union, combos: combos, drivers: drivers, truncated: truncated };
}

// 조합들을 "같은 결과" 단위로 묶는다(동일 서명 = 하위 옵션·미사용 스텝이 완전히 동일)
function _groupCombos(combos, keysOfInterest) {
  var groups = [], byKey = {};
  combos.forEach(function (c) {
    var sig = JSON.stringify([keysOfInterest.map(function (k) { return c.options[k] || null; }), c.hidden]);
    if (!byKey[sig]) { byKey[sig] = { sig: sig, combos: [], options: c.options, hidden: c.hidden }; groups.push(byKey[sig]); }
    byKey[sig].combos.push(c);
  });
  return groups;
}

// 그룹의 부모 값들을 압축 표기. 완전한 교차곱일 때만 'k=[a|b]' 로 묶고, 아니면 조합을 나열한다.
function _describeDrivers(group, drivers, skuKey) {
  if (!drivers.length) return '';
  var label = function (k) { return k === skuKey ? 'SKU' : k; };
  var vals = {};
  drivers.forEach(function (k) {
    vals[k] = [];
    group.combos.forEach(function (c) { if (vals[k].indexOf(c.driver[k]) < 0) vals[k].push(c.driver[k]); });
  });
  var product = drivers.reduce(function (n, k) { return n * vals[k].length; }, 1);
  if (product === group.combos.length) {
    return drivers.map(function (k) {
      return label(k) + '=' + (vals[k].length > 1 ? '[' + vals[k].join('|') + ']' : vals[k][0]);
    }).join(', ');
  }
  return group.combos.map(function (c) {
    return drivers.map(function (k) { return label(k) + '=' + c.driver[k]; }).join(', ');
  }).join(' / ');
}

// ================================================================
// 옵션 사전(# 주석) 생성
// ================================================================
export function buildOptionGuide() {
  var lines = [];
  lines.push('# ────────────────────────────────────────────────────────────');
  lines.push('# [작성 안내] 아래 # 줄은 업로드 시 모두 무시됩니다(설명/사전 전용).');
  lines.push('# 열 구성: Region, 분류(메모), ServiceCategory, SKU, Qty, Hours, Options');
  lines.push('#   · Options : "키=값"을 세미콜론(;)으로 구분. 예) tier=Standard; metric=규칙 (시간당, 5개 포함)');
  lines.push('#   · Qty     : 수량(인스턴스/리소스 개수)');
  lines.push('#   · Hours   : 시간제 서비스=월 사용시간(예 730) / 저장·전송 서비스=사용량(GB 등) / 인스턴스 과금=1');
  lines.push('#   · SKU     : 인스턴스·단일 SKU가 있는 서비스만 사용. 그 외 서비스는 비우고 Options로만 지정');
  lines.push('#   · 가격 매칭 정확도는 서비스별 resolver 수준을 따름(일부 제네릭 서비스는 매칭 실패 가능 — docs/service-status.csv 참고)');
  lines.push('# ────────────────────────────────────────────────────────────');
  lines.push('# [서비스별 옵션 사전]');
  lines.push('#   · 서비스 줄의 Options 는 그 서비스에서 쓸 수 있는 값 전체(합집합)입니다.');
  lines.push('#   · "↳" 줄은 부모 옵션에 따라 달라지는 하위 값입니다. 부모와 짝이 맞지 않는 값을 적으면');
  lines.push('#     업로드 시 경고 없이 그 부모의 첫 번째 값으로 바뀌므로(대체) 반드시 짝을 맞추세요.');
  lines.push('#   · "미사용" 은 그 조합에서 무시되는 옵션 키입니다(적어도 계산에 영향 없음).');

  var defs = SERVICE_CATEGORIES || {};
  var order = SERVICE_CATEGORY_ORDER || Object.keys(defs);

  order.forEach(function (cat) {
    var def = defs[cat];
    if (!def || !def.steps) return;
    var skuKey = CSV_SKU_OPTION_KEY[cat];
    var exp = expandServiceOptions(cat);
    var union = (exp && exp.union) || {};

    // 서비스 헤더 줄 — 값은 전 조합의 합집합
    var parts = [];
    def.steps.forEach(function (s) {
      if (s.key === skuKey) return;                                  // SKU 열로 받는 키는 Options에서 제외
      if (cat === 'Virtual Machine' && s.key === 'series') return;   // series는 아래 인스턴스 카탈로그로 안내
      if (union[s.key] && union[s.key].length) parts.push(s.key + '=[' + union[s.key].join('|') + ']');
      else if (Array.isArray(s.options)) parts.push(s.key + '=[' + s.options.join('|') + ']');
      else if (s.type === 'number') parts.push(s.key + '=숫자');
    });
    var skuPart = skuKey ? ('SKU=' + (CSV_SKU_DESC[cat] || skuKey)) : 'SKU=비움';
    lines.push('# ' + cat + ' | ' + skuPart + (parts.length ? ' | Options: ' + parts.join('; ') : ' | Options: (없음)'));

    if (!exp || !exp.drivers.length || exp.combos.length < 2) return;

    // 부모에 따라 실제로 달라지는 스텝만 골라 ↳ 줄로 싣는다
    // (드라이버 자신도 다른 드라이버에 따라 달라질 수 있어 함께 검사한다 — 예 SQL Database model→tier)
    var varying = Object.keys(union).filter(function (k) {
      var first = JSON.stringify(exp.combos[0].options[k] || null);
      return exp.combos.some(function (c) { return JSON.stringify(c.options[k] || null) !== first; });
    });
    var hiddenVaries = exp.combos.some(function (c) {
      return JSON.stringify(c.hidden) !== JSON.stringify(exp.combos[0].hidden);
    });
    if (!varying.length && !hiddenVaries) return;

    _groupCombos(exp.combos, varying).forEach(function (g) {
      var shown = varying.filter(function (k) {
        if (exp.drivers.indexOf(k) >= 0) return false;      // 부모 값은 앞의 조합 표기에 이미 있음
        if (g.hidden.indexOf(k) >= 0) return false;         // 이 조합에서 쓰지 않는 키
        return (g.options[k] || []).length > 0;
      }).map(function (k) {
        return (k === skuKey ? 'SKU' : k) + '=[' + g.options[k].join('|') + ']';
      });
      var unusable = g.hidden.filter(function (k) { return k !== skuKey; });
      if (!shown.length && !unusable.length) return;        // 알릴 내용이 없는 조합은 생략
      var tail = shown.join('; ') + (unusable.length ? (shown.length ? ' | ' : '') + '미사용: ' + unusable.join(', ') : '');
      lines.push('#   ↳ ' + _describeDrivers(g, exp.drivers, skuKey) + ' → ' + tail);
    });
    if (exp.truncated) lines.push('#   ↳ (조합이 많아 일부만 표기 — 위 합집합 값 참고)');
  });

  // Virtual Machine — series별 인스턴스 카탈로그(SKU는 선택 series에 속한 인스턴스여야 함)
  var series = REG.VM_INSTANCE_CATALOG ? Object.keys(REG.VM_INSTANCE_CATALOG) : [];
  if (series.length) {
    lines.push('# [Virtual Machine 인스턴스 카탈로그] Options에 series=[...]를 함께 지정, SKU는 해당 series 인스턴스');
    series.forEach(function (sr) {
      lines.push('#   ' + sr + ': ' + REG.VM_INSTANCE_CATALOG[sr].map(function (i) { return i.name; }).join(', '));
    });
  }

  // Disk — 종류별 카탈로그 및 추가 옵션
  if (REG.DISK_SUBTYPE_MAP) {
    lines.push('# [Disk 상세] 용량형(표준 HDD/표준 SSD/프리미엄 SSD)은 SKU=크기 SKU, 프로비저닝형(프리미엄 SSD v2/Ultra Disk)은 SKU 비움+크기/IOPS/MBps를 Options로');
    if (REG.DISK_CATALOG) {
      Object.keys(REG.DISK_CATALOG).forEach(function (st) {
        lines.push('#   ' + st + ': ' + REG.DISK_CATALOG[st].map(function (d) { return d.name; }).join(', '));
      });
    }
    lines.push('#   추가 옵션 — 표준 HDD/SSD: transactionUnits=숫자(만 단위) / 프리미엄 SSD: burstingEnabled=[비활성 (기본)|활성화 (P30 이상)] / 프로비저닝형: diskSizeGiB, provisionedIOPS, provisionedMBps');
  }

  // 조건부 옵션이 있는 서비스 안내
  lines.push('# [조건부 옵션] Backup: metric=보호 인스턴스 → workload만 / metric=백업 저장소 → storageTier+redundancy 만 사용');
  lines.push('#   · Microsoft Fabric: metric=용량 (CU 시간) → capacity만 / metric=OneLake 저장소 (GB/월) → storageItem 만 사용');
  lines.push('# [사용량 단위] 저장·전송 항목(Azure Files/Blob/Backup 저장소/Bandwidth/Bastion 데이터 전송)은 Hours 칸에 사용량(GB 등)을 입력');
  lines.push('# [사용량 단위 2] Cosmos DB Serverless=백만 RU, 저장소=GB / API Management Consumption=만 콜 / ACR 레지스트리=일수, 저장소=GB / Azure DNS 영역=1(Qty=영역 수), 쿼리=백만 / Azure DevOps=1(Qty=사용자·작업 수) / Azure OpenAI=백만 토큰 / Private Link 데이터=GB');
  lines.push('# [사용량 단위 3] Event Hubs·Service Bus·Container Apps·Front Door 는 청구 항목(item)의 단위를 그대로 Hours 에 입력');
  lines.push('#   · 1 Hour/1(시간당) → 월 사용시간(730) / 1M → 백만 건 / 1 GB·1 GiB → GB(GiB) / 1 Second·1 GiB Second → 초(GiB·초) / 1/Month → 1');
  lines.push('# [사용량 단위 4] Microsoft Fabric 용량=월 사용시간(24×7 이면 730, F SKU 의 CU 수를 자동으로 곱함), OneLake 저장소=GB');
  lines.push('#   · Azure Monitor — 메트릭=샘플 수÷단위(10M 또는 1K) / 경고=1(Qty=규칙 수) / 로그=GB / 약정 계층=일수(예 30) / 웹 테스트=월 실행 횟수');
  lines.push('#   · Azure Key Vault — 작업(10K)=만 건 수 / 키·갱신=1(Qty=키·건수) / Managed HSM=월 사용시간(730)');
  lines.push('#   · GitHub — 사용자·커미터=1(Qty=인원 수) / Actions 실행=분 / 저장소·전송=GB(GiB) / Codespaces=시간');
  lines.push('#   · Azure Machine Learning — Qty=vCPU·GPU 수, Hours=월 사용시간. 컴퓨팅 자체 요금은 Virtual Machine 행으로 따로 적으세요');
  lines.push('#     (워크스페이스는 무료, 추가 요금은 리전·SKU 에 따라 0원인 경우가 많습니다 — 0원 조회는 오류가 아닙니다)');
  lines.push('# [Azure OpenAI 배포 유형] 같은 모델·같은 토큰이라도 배포 유형에 따라 미터와 단가가 다릅니다(지정하지 않으면 최대 2배 오차).');
  lines.push('#   · Global < Data Zone < Regional 순으로 비싸고, Batch 계열은 절반 수준입니다');
  lines.push('#   · 리전마다 제공되는 배포 유형이 다릅니다 — 예) koreacentral 은 GPT-4.1 mini=Global 만, text-embedding-3-small=Data Zone 만');
  lines.push('#     없는 조합을 적으면 매칭 실패로 알리면서 그 리전에서 고를 수 있는 배포 유형을 함께 표시합니다');
  lines.push('#   · 우선 처리(Priority Processing, 표준의 2배)·미세 조정·오디오/이미지/실시간 모델·PTU 는 범위 외입니다');
  lines.push('# [무료 허용량 차감] Azure DevOps 는 freeTier=차감 (조직 무료 한도 적용) 이 기본이라 과금 수량 = max(0, Qty×Hours − 무료 수량) 입니다.');
  lines.push('#   · Basic 사용자 첫 5명 / MS-hosted·Self-hosted 병렬 작업 첫 1개 / Artifacts 첫 2GB 가 무료입니다(Retail Prices API 단가에는 반영돼 있지 않습니다)');
  lines.push('#   · 무료 한도는 조직 단위라 같은 조직의 다른 프로젝트가 이미 쓰고 있다면 freeTier=미차감 (전량 과금) 을 고르세요');
  lines.push('# [지역 복제] Event Hubs·Service Bus 의 tier=Geo Replication Zone N 은 리전이 속한 존만 매칭됩니다(예 koreacentral=Zone 2)');
  lines.push('# [무료 허용량 주의] 일부 미터는 첫 구간이 0원(무료 허용량)이라 그 구간을 쓰면 견적이 0원이 됩니다.');
  lines.push('#   · 계산기는 0원이 아닌 최저 구간 단가를 씁니다 — 예) Service Bus Standard Messaging Operations(첫 13M 무료),');
  lines.push('#     Standard Brokered Connection(첫 1,000개 무료), Hybrid Connections Data Transfer(첫 5GB 무료),');
  lines.push('#     Front Door Standard Included Routing Rules(5개 포함). 무료 허용량 이하만 쓸 계획이면 그 행은 빼세요');
  lines.push('# [글로벌 서비스] Azure Front Door 는 Region 열을 무시하고 zone(요금 존)으로 가격이 정해집니다. Zone 1=북미·유럽, Zone 2=아시아 태평양(한국·일본), Zone 5=인도');
  lines.push('#   · Azure DevOps·GitHub 도 리전 비종속(Global) 이라 Region 열이 가격에 영향을 주지 않습니다');
  lines.push('# [미지원 — 별도 산정 필요] Elastic Cloud(Elasticsearch)는 Azure Marketplace SaaS 라 Retail Prices API 에 단가가 없습니다.');
  lines.push('#   · 자체 관리형으로 올린다면 Virtual Machine + Disk 행으로, 관리형(Elastic Cloud)이면 Elastic 견적을 그대로 옮겨 적으세요');
  lines.push('#   · 자체 관리형 예시는 위 "Elasticsearch 노드 3대"(VM) + "Elasticsearch 데이터 디스크"(Disk) 두 행을 참고하세요');
  lines.push('# [과금 미터가 없어 0원인 항목] Azure ML Workspace 는 논리적 컨테이너라 보유만으로는 요금이 붙지 않습니다(Retail Prices API 에 미터 자체가 없음).');
  lines.push('#   · metric=워크스페이스 (무료 · 과금 미터 없음) 행으로 0원임을 견적서에 남기고, 실제 비용은 딸린 리소스로 각각 잡으세요');
  lines.push('#     컴퓨팅=Virtual Machine / 저장소=Blob Storage·Storage Account / 이미지=Azure Container Registry / 로그=Log Analytics·Azure Monitor / 비밀=Azure Key Vault');

  lines.push('# [Region 코드] ' + Object.keys(REGION_LABEL).join(', '));
  return lines;
}

// 양식 CSV 본문(BOM 제외) 생성 — 다운로드/검증이 같은 함수를 쓴다
export function buildTemplateCsv() {
  var lines = [];
  lines.push(csvRowToLine(CSV_HEADER));
  buildExampleRows().forEach(function (r) { lines.push(csvRowToLine(r)); });
  lines.push('');
  buildOptionGuide().forEach(function (l) { lines.push(l); });
  return lines.join('\n');
}
