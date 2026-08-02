// ================================================================
// ui/export-csv.js — 엑셀 내보내기 + CSV 양식 다운로드/업로드/직렬화
// (ui-and-bootstrap.js 에서 분리. 공유 상태는 접근자 getRows/setRows/setActiveConfigRowId 사용)
// 부수효과: 로드 시 내보내기·CSV 버튼 핸들러를 등록한다.
// ================================================================
import { REG, SERVICE_CATEGORIES } from '../core/registry.js';
import { REGION_LABEL } from '../core/config.js';
import { buildSkuAndDetail, tryResolveItem } from '../core/resolver-engine.js';
import { SERVICE_CATEGORY_ORDER } from './service-order.js';
import {
  getRows, setRows, setActiveConfigRowId,
  blankRow, render, closeConfig, calcGroup, setStatus, showToast,
} from '../ui-and-bootstrap.js';

// ================================================================
// 엑셀 내보내기
// ================================================================
const EXPORT_GROUPS=[
  {key:'payg',label:'용량제 (PAYG)',  itemKey:'paygItem',color:'2E75B6',totMKey:'paygM',totYKey:'paygY'},
  {key:'sp1', label:'절약 플랜 1년',itemKey:'sp1Item', color:'70AD47',totMKey:'sp1M', totYKey:'sp1Y'},
  {key:'sp3', label:'절약 플랜 3년',itemKey:'sp3Item', color:'548235',totMKey:'sp3M', totYKey:'sp3Y'},
  {key:'ri1', label:'예약 1년',    itemKey:'ri1Item', color:'C55A11',totMKey:'ri1M', totYKey:'ri1Y'},
  {key:'ri3', label:'예약 3년',    itemKey:'ri3Item', color:'843C0C',totMKey:'ri3M', totYKey:'ri3Y'},
];
function getEnabledGroups(){return EXPORT_GROUPS.filter(g=>{
  // 엑셀 출력 선택 체크박스(chk-group-*)가 해제된 그룹은 제외
  const c=document.getElementById(`chk-group-${g.key}`);
  if(c && !c.checked) return false;
  // '열 보기'(chkVis-*)로 화면에서 숨긴 열은 엑셀에서도 제외(PAYG는 항상 표시 — chkVis 없음)
  const vc=document.getElementById(`chkVis-${g.key}`);
  if(vc && !vc.checked) return false;
  return true;
});}

document.getElementById('btnExport').addEventListener('click',async ()=>{
  const cur=document.getElementById('currencySelect').value;
  const enabledGroups=getEnabledGroups();
  if(enabledGroups.length===0){alert('엑셀로 출력할 가격 그룹을 하나 이상 선택하세요.');return;}
  const data=[];
  data.push(['Azure 견적 시뮬레이션']);
  data.push([`통화: ${cur} | 출력: ${enabledGroups.map(g=>g.label).join(', ')} | 생성: ${new Date().toLocaleString('ko-KR')}`]);
  data.push([]);
  const bH=['#','Region','분류','Service Category','Service name (SKU)','상세 사양','Qty','사용량(Hours)'];
  const gHdr=[...bH],gCol=[...bH];
  enabledGroups.forEach(g=>{gHdr.push(g.label,'','');gCol.push('Unit Price','1 Monthly Cost','1 Year Cost');});
  data.push(gHdr);data.push(gCol);
  let totals={};enabledGroups.forEach(g=>{totals[g.totMKey]=0;totals[g.totYKey]=0;});
  getRows().forEach((r,idx)=>{
    const qty=Number(r.qty)||0,usage=Number(r.usage)||0;
    const calc=(it)=>{if(!it)return['','',''];const d=calcGroup(it,qty,usage);if(!d)return['','',''];return[d.unit,d.monthly,d.year];};
    const isDiskProv=r.serviceCategory==='Disk'&&(r.options.diskSubType==='프리미엄 SSD v2'||r.options.diskSubType==='Ultra Disk');
    const skuForExport=isDiskProv?(r.options.diskSizeGiB?`${r.options.diskSizeGiB}GiB`:''):r.skuName;
    const row=[idx+1,REGION_LABEL[r.region]||r.region,r.category,r.serviceCategory,skuForExport,r.detail,qty,usage];
    enabledGroups.forEach(g=>{const[u,m,y]=calc(r[g.itemKey]);row.push(u,m,y);if(typeof m==='number'){totals[g.totMKey]+=m;totals[g.totYKey]+=y;}});
    data.push(row);
  });
  const tr=['Total','','','','','','',''];enabledGroups.forEach(g=>{tr.push('',totals[g.totMKey],totals[g.totYKey]);});data.push(tr);
  data.push([]);data.push(['[Remark]']);
  data.push(['1. Azure Retail Prices API의 공시 가격이며, EA 등 별도 할인은 반영되지 않습니다.']);
  data.push(['2. 절약 플랜/예약 단가는 시간당 환산 단가입니다.']);
  data.push(['3. 프리미엄 SSD P30 이상: 용량제열=PAYG, 예약 1년열=RI 1Y 단가 (자동 표시). P1~P20은 RI 미지원.']);
  const ws=XLSX.utils.aoa_to_sheet(data);
  const bA={top:{style:'thin',color:{rgb:'BFBFBF'}},bottom:{style:'thin',color:{rgb:'BFBFBF'}},left:{style:'thin',color:{rgb:'BFBFBF'}},right:{style:'thin',color:{rgb:'BFBFBF'}}};
  const tSt={font:{bold:true,sz:16,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'305496'}},alignment:{horizontal:'center',vertical:'center'}};
  const sSt={font:{italic:true,sz:10,color:{rgb:'595959'}},alignment:{horizontal:'left'}};
  const hSt=(c)=>({font:{bold:true,sz:11,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:c}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:bA});
  const dSt={font:{sz:10},alignment:{vertical:'center',wrapText:true},border:bA};
  const nSt={font:{sz:10},alignment:{horizontal:'right',vertical:'center'},numFmt:'#,##0.00',border:bA};
  const totSt={font:{bold:true,sz:11},fill:{fgColor:{rgb:'FFF2CC'}},alignment:{horizontal:'right',vertical:'center'},border:{top:{style:'medium',color:{rgb:'305496'}},bottom:{style:'medium',color:{rgb:'305496'}},left:bA.left,right:bA.right},numFmt:'#,##0.00'};
  if(!ws['A1'])ws['A1']={v:'Azure 견적 시뮬레이션'};ws['A1'].s=tSt;
  if(ws['A2'])ws['A2'].s=sSt;
  const tC=8+enabledGroups.length*3;
  for(let c=0;c<tC;c++){const a3=XLSX.utils.encode_cell({r:3,c}),a4=XLSX.utils.encode_cell({r:4,c});let color='305496';if(c>=8){const gi=Math.floor((c-8)/3);if(gi<enabledGroups.length)color=enabledGroups[gi].color;}if(!ws[a3])ws[a3]={v:''};ws[a3].s=hSt(color);if(!ws[a4])ws[a4]={v:''};ws[a4].s=hSt(color);}
  for(let i=0;i<getRows().length;i++){const ri=5+i;for(let c=0;c<tC;c++){const addr=XLSX.utils.encode_cell({r:ri,c});if(!ws[addr])ws[addr]={v:''};if(c>=6&&typeof ws[addr].v==='number')ws[addr].s=nSt;else ws[addr].s={...dSt,alignment:{...dSt.alignment,horizontal:c===0?'center':'left'}};}}
  const tri=5+getRows().length;for(let c=0;c<tC;c++){const addr=XLSX.utils.encode_cell({r:tri,c});if(!ws[addr])ws[addr]={v:''};ws[addr].s=totSt;}
  ws['!cols']=[{wch:4},{wch:14},{wch:24},{wch:22},{wch:18},{wch:36},{wch:6},{wch:12},...enabledGroups.flatMap(()=>[{wch:13},{wch:16},{wch:16}])];
  ws['!rows']=[];ws['!rows'][0]={hpt:28};ws['!rows'][3]={hpt:22};ws['!rows'][4]={hpt:22};
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:tC-1}},{s:{r:1,c:0},e:{r:1,c:tC-1}},...[0,1,2,3,4,5,6,7].map(c=>({s:{r:3,c},e:{r:4,c}})),...enabledGroups.map((_,gi)=>({s:{r:3,c:8+gi*3},e:{r:3,c:8+gi*3+2}})),{s:{r:tri,c:0},e:{r:tri,c:7}}];
  const rsR=tri+2;ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rsR+3,c:tC-1}});
  ws['!freeze']={xSplit:0,ySplit:5,topLeftCell:'A6',activePane:'bottomLeft',state:'frozen'};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Azure 견적');
  const base='azure-quote-'+new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const xlsxOut=XLSX.write(wb,{bookType:'xlsx',type:'array'});
  const xlsxBlob=new Blob([xlsxOut],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const csvBlob=new Blob(['\ufeff'+_csvExportCurrentRows()],{type:'text/csv;charset=utf-8;'});
  await _exportSaveFiles(base,xlsxBlob,csvBlob);
});

// ================================================================
// CSV 양식 다운로드 / 업로드 (v46, v63에서 전 서비스로 확장)
// 지원: 전체 서비스 카테고리(SERVICE_CATEGORY_ORDER 전부). 양식 다운로드는 서비스마다
//       예시 행을 1개 이상 포함하고, 옵션 사전(# 주석)으로 각 서비스의 옵션을 안내한다.
// SKU 열 매핑: 인스턴스/단일 SKU가 있는 서비스만 SKU 열로 받고, 나머지는 Options로 지정
//   (VM=instance, Disk=diskInstance, VPN=sku, App Service=size,
//    Azure Database for MySQL=compute, Application Gateway=sku, Public IP=sku)
//   ※ 모든 서비스가 _buildDetail_*에서 options로 skuName을 구성하므로, SKU 열이 없는
//      서비스는 Options만으로 식별된다. 가격 매칭 정확도는 각 서비스 resolver 수준을 따른다
//      (A 그룹=라이브 검증, 일부 제네릭 서비스는 매칭이 취약할 수 있음 — service-status.csv 참고).
// ================================================================
var CSV_SUPPORTED_CATEGORIES = SERVICE_CATEGORY_ORDER.slice();
var CSV_SKU_OPTION_KEY = {
  'Virtual Machine': 'instance', 'Disk': 'diskInstance', 'VPN Gateway': 'sku',
  'App Service': 'size',
  'Application Gateway': 'sku', 'Public IP': 'sku',
  'Azure Cache for Redis': 'sku',
};
var CSV_HEADER = ['Region', '분류', 'ServiceCategory', 'SKU', 'Qty', 'Hours', 'Options'];

function _csvEscapeField(v) {
  var s = (v === null || v === undefined) ? '' : String(v);
  if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function _csvRowToLine(arr) { return arr.map(_csvEscapeField).join(','); }

// 각 서비스의 SKU 열 의미(인스턴스/단일 SKU가 있는 서비스만)
var CSV_SKU_DESC = {
  'Virtual Machine': '인스턴스(예 D4s_v5, 선택 series에 속해야 함)',
  'Disk': '디스크 크기 SKU(예 P30; 프로비저닝형은 비움)',
  'VPN Gateway': '게이트웨이 SKU(예 VpnGw1)',
  'App Service': '인스턴스(예 P1V3)',
  'Application Gateway': 'SKU(예 Standard_v2)',
  'Public IP': 'SKU(예 Standard)',
  'Azure Cache for Redis': '캐시 크기(예 C0, 선택 tier에 속해야 함)',
};

// 양식에 넣을 서비스별 예시 행([Region, 분류(메모), ServiceCategory, SKU, Qty, Hours, Options])
// SERVICE_CATEGORY_ORDER 순서를 따르며, 서비스마다 서로 다른 구성 예시를 2~3개 둔다(v101).
function _csvBuildExampleRows() {
  return [
    ['koreacentral', '웹 서버(Linux)',        'Virtual Machine',            'D4s_v5',       '2', '730',  'os=Linux; swType=(OS Only); tier=Standard; license=라이선스 포함; category=전체; series=D-series v5'],
    ['koreacentral', '앱 서버(Windows)',      'Virtual Machine',            'D2s_v5',       '1', '730',  'os=Windows; swType=(OS Only); tier=Standard; license=라이선스 포함; category=전체; series=D-series v5'],
    ['koreacentral', '개발 서버(B시리즈)',     'Virtual Machine',            'B2ms',         '1', '730',  'os=Linux; swType=(OS Only); tier=Standard; license=라이선스 포함; category=전체; series=B-series'],
    ['koreacentral', 'GPU 학습(NC A100 v4)',   'Virtual Machine',            'NC24ads_A100_v4','1','730',  'os=Linux; swType=(OS Only); tier=Standard; license=라이선스 포함; category=GPU; series=NC A100 v4 (GPU)'],
    ['polandcentral','GPU 추론(ND A100 v4)',   'Virtual Machine',            'ND96amsr_A100_v4','1','730', 'os=Linux; swType=(OS Only); tier=Standard; license=라이선스 포함; category=GPU; series=ND A100 v4 (GPU)'],
    ['koreacentral', 'AKS 클러스터(SLA)',     'Azure Kubernetes Service',   '',             '1', '730',  'aksTier=Standard (표준); slaOption=SLA'],
    ['koreacentral', 'AKS 클러스터(LTS)',     'Azure Kubernetes Service',   '',             '1', '730',  'aksTier=Standard (표준); slaOption=SLA and Long Term Support'],
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
    ['koreacentral', '로그 수집 100GB',        'Log Analytics',              '',             '1', '100',  'metric=Data Ingestion'],
    ['koreacentral', '로그 보존 500GB',        'Log Analytics',              '',             '1', '500',  'metric=Data Retention'],
    ['koreacentral', 'Sentinel(PAYG 100GB)',  'Microsoft Sentinel',         '',             '1', '100',  'model=Pay-as-you-go'],
    ['koreacentral', 'Sentinel(100GB 커밋 30일)','Microsoft Sentinel',       '',             '1', '30',   'model=100 GB Commitment Tier'],
    ['koreacentral', 'Synapse DW(DW100c)',    'Azure Synapse Analytics',    '',             '1', '730',  'component=Dedicated SQL Pool (DWU); dwuLevel=DW100c'],
    ['koreacentral', 'Synapse 서버리스(2TB)',  'Azure Synapse Analytics',    '',             '1', '2',    'component=Serverless SQL Pool (Data Processed)'],
    ['koreacentral', 'OpenAI 입력(GPT-4.1 mini 10M)','Azure OpenAI',        '',             '1', '10',   'model=GPT-4.1 mini; metric=입력 토큰'],
    ['koreacentral', 'OpenAI 출력(GPT-4.1 mini 3M)','Azure OpenAI',         '',             '1', '3',    'model=GPT-4.1 mini; metric=출력 토큰'],
    ['koreacentral', 'OpenAI 임베딩(small 20M)','Azure OpenAI',              '',             '1', '20',   'model=text-embedding-3-small; metric=입력 토큰'],
    ['koreacentral', 'DevOps Basic 5명',       'Azure DevOps',               '',             '5', '1',    'plan=Basic Plan 사용자 (월)'],
    ['koreacentral', 'DevOps 병렬 작업 1개',    'Azure DevOps',               '',             '1', '1',    'plan=MS-hosted 병렬 작업 (월)'],
  ];
}

function _csvBuildOptionGuide() {
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

  var defs = (typeof SERVICE_CATEGORIES !== 'undefined') ? SERVICE_CATEGORIES : {};
  var order = (typeof SERVICE_CATEGORY_ORDER !== 'undefined') ? SERVICE_CATEGORY_ORDER : Object.keys(defs);
  order.forEach(function (cat) {
    var def = defs[cat];
    if (!def || !def.steps) return;
    var skuKey = CSV_SKU_OPTION_KEY[cat];
    var parts = [];
    def.steps.forEach(function (s) {
      if (s.key === skuKey) return;                                  // SKU 열로 받는 키는 Options에서 제외
      if (cat === 'Virtual Machine' && s.key === 'series') return;   // series는 아래 인스턴스 카탈로그로 안내
      if (Array.isArray(s.options)) parts.push(s.key + '=[' + s.options.join('|') + ']');
      else if (s.type === 'number') parts.push(s.key + '=숫자');
    });
    var skuPart = skuKey ? ('SKU=' + (CSV_SKU_DESC[cat] || skuKey)) : 'SKU=비움';
    lines.push('# ' + cat + ' | ' + skuPart + (parts.length ? ' | Options: ' + parts.join('; ') : ' | Options: (없음)'));
  });

  // Virtual Machine — series별 인스턴스 카탈로그(SKU는 선택 series에 속한 인스턴스여야 함)
  var series = (typeof REG.VM_INSTANCE_CATALOG !== 'undefined') ? Object.keys(REG.VM_INSTANCE_CATALOG) : [];
  if (series.length) {
    lines.push('# [Virtual Machine 인스턴스 카탈로그] Options에 series=[...]를 함께 지정, SKU는 해당 series 인스턴스');
    series.forEach(function (sr) {
      lines.push('#   ' + sr + ': ' + REG.VM_INSTANCE_CATALOG[sr].map(function (i) { return i.name; }).join(', '));
    });
  }

  // Disk — 종류별 카탈로그 및 추가 옵션
  if (typeof REG.DISK_SUBTYPE_MAP !== 'undefined') {
    lines.push('# [Disk 상세] 용량형(표준 HDD/표준 SSD/프리미엄 SSD)은 SKU=크기 SKU, 프로비저닝형(프리미엄 SSD v2/Ultra Disk)은 SKU 비움+크기/IOPS/MBps를 Options로');
    if (typeof REG.DISK_CATALOG !== 'undefined') {
      Object.keys(REG.DISK_CATALOG).forEach(function (st) {
        lines.push('#   ' + st + ': ' + REG.DISK_CATALOG[st].map(function (d) { return d.name; }).join(', '));
      });
    }
    lines.push('#   추가 옵션 — 표준 HDD/SSD: transactionUnits=숫자(만 단위) / 프리미엄 SSD: burstingEnabled=[비활성 (기본)|활성화 (P30 이상)] / 프로비저닝형: diskSizeGiB, provisionedIOPS, provisionedMBps');
  }

  // 조건부 옵션이 있는 서비스 안내
  lines.push('# [조건부 옵션] Backup: metric=보호 인스턴스 → workload만 / metric=백업 저장소 → storageTier+redundancy 만 사용');
  lines.push('# [사용량 단위] 저장·전송 항목(Azure Files/Blob/Backup 저장소/Bandwidth/Bastion 데이터 전송)은 Hours 칸에 사용량(GB 등)을 입력');
  lines.push('# [사용량 단위 2] Cosmos DB Serverless=백만 RU, 저장소=GB / API Management Consumption=만 콜 / ACR 레지스트리=일수, 저장소=GB / Azure DNS 영역=1(Qty=영역 수), 쿼리=백만 / Azure DevOps=1(Qty=사용자·작업 수) / Azure OpenAI=백만 토큰 / Private Link 데이터=GB');

  if (typeof REGION_LABEL !== 'undefined') {
    lines.push('# [Region 코드] ' + Object.keys(REGION_LABEL).join(', '));
  }
  return lines;
}

function _csvDownloadTemplate() {
  var lines = [];
  lines.push(_csvRowToLine(CSV_HEADER));
  _csvBuildExampleRows().forEach(function (r) { lines.push(_csvRowToLine(r)); });
  lines.push('');
  _csvBuildOptionGuide().forEach(function (l) { lines.push(l); });

  var csv = lines.join('\n');
  var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'azure-quote-template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _csvParseOptions(str) {
  var o = {};
  if (!str) return o;
  String(str).split(';').forEach(function (part) {
    var p = part.trim();
    if (!p) return;
    var eq = p.indexOf('=');
    if (eq < 0) return;
    var k = p.slice(0, eq).trim();
    var v = p.slice(eq + 1).trim();
    if (k) o[k] = v;
  });
  return o;
}

function _csvNormalizeRegion(v) {
  var s = String(v || '').trim();
  if (!s) return '';
  if (typeof REGION_LABEL === 'undefined') return s;
  if (REGION_LABEL[s]) return s;
  var low = s.toLowerCase();
  for (var code in REGION_LABEL) {
    if (REGION_LABEL[code].toLowerCase() === low) return code;
  }
  return '';
}

async function _csvHandleUpload(file) {
  var text;
  try { text = await file.text(); }
  catch (e) { alert('파일을 읽지 못했습니다: ' + e.message); return; }

  var aoa;
  try {
    var wb = XLSX.read(text, { type: 'string' });
    var ws = wb.Sheets[wb.SheetNames[0]];
    aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false });
  } catch (e) { alert('CSV 해석에 실패했습니다: ' + e.message); return; }

  var headerIdx = -1;
  for (var i = 0; i < aoa.length; i++) {
    var first = String((aoa[i] && aoa[i][0]) || '').trim().toLowerCase();
    if (first === 'region') { headerIdx = i; break; }
  }
  if (headerIdx < 0) { alert('헤더 행(Region, 분류, ServiceCategory, SKU, Qty, Hours, Options)을 찾지 못했습니다.'); return; }

  var dataRows = [];
  for (var r = headerIdx + 1; r < aoa.length; r++) {
    var rowArr = aoa[r] || [];
    var c0 = String(rowArr[0] || '').trim();
    if (!c0) continue;
    if (c0.charAt(0) === '#') continue;
    dataRows.push(rowArr);
  }
  if (dataRows.length === 0) { alert('불러올 데이터 행이 없습니다.'); return; }

  var replace = true;
  var hasExisting = getRows().some(function (r) { return r.serviceCategory || r.skuName || (r.options && Object.keys(r.options).length > 0); });
  if (hasExisting) {
    replace = confirm('기존 행을 모두 비우고 불러올까요?\n확인 = 교체, 취소 = 기존 행 뒤에 추가');
  }
  if (replace) { setRows([]); setActiveConfigRowId(null); closeConfig(); }

  var created = 0, skippedCat = 0, skippedRegion = 0;
  var newRows = [];
  dataRows.forEach(function (arr) {
    var region = _csvNormalizeRegion(arr[0]);
    var category = String(arr[1] || '').trim();
    var serviceCategory = String(arr[2] || '').trim();
    var sku = String(arr[3] || '').trim();
    var qty = Number(arr[4]); if (!isFinite(qty) || qty <= 0) qty = 1;
    var hours = Number(arr[5]); if (!isFinite(hours) || hours <= 0) hours = 730;
    var opts = _csvParseOptions(arr[6]);

    if (CSV_SUPPORTED_CATEGORIES.indexOf(serviceCategory) < 0) { skippedCat++; return; }
    if (!region) { skippedRegion++; return; }

    var row = blankRow();
    row.region = region;
    row.category = category;
    row.serviceCategory = serviceCategory;
    row.qty = qty;
    row.usage = hours;
    row.options = opts;
    var skuKey = CSV_SKU_OPTION_KEY[serviceCategory];
    if (sku && skuKey) row.options[skuKey] = sku;
    newRows.push(row);
    created++;
  });

  setRows(getRows().concat(newRows));
  render();

  setStatus('loading', 'CSV 불러오기: 가격 조회 중... (0/' + newRows.length + ')');
  var done = 0;
  for (var k = 0; k < newRows.length; k++) {
    var rr = newRows[k];
    buildSkuAndDetail(rr);
    try { await tryResolveItem(rr); } catch (e) { /* 개별 행 실패는 각 resolver가 상태로 처리 */ }
    done++;
    setStatus('loading', 'CSV 불러오기: 가격 조회 중... (' + done + '/' + newRows.length + ')');
  }
  render();

  var msg = 'CSV 불러오기 완료: ' + created + '행 생성';
  if (skippedCat > 0) msg += ', 미지원 서비스 ' + skippedCat + '행 제외';
  if (skippedRegion > 0) msg += ', 미지원 Region ' + skippedRegion + '행 제외';
  setStatus('ok', msg);
  alert(msg + '\n(전 서비스 지원. 가격 매칭 정확도는 서비스별 resolver 수준을 따릅니다 — docs/service-status.csv 참고)');
}

// ================================================================
// 내보내기 보조 (v48): 현재 행을 CSV(불러오기 양식)로 직렬화 + 파일 저장
// ================================================================
function _csvExportCurrentRows() {
  var lines = [];
  lines.push(_csvRowToLine(CSV_HEADER));
  getRows().forEach(function (r) {
    if (!r.serviceCategory) return;
    var cat = r.serviceCategory;
    var skuKey = CSV_SKU_OPTION_KEY[cat];
    var opts = r.options || {};
    var skuVal = skuKey ? (opts[skuKey] || '') : (r.skuName || '');
    var optPairs = Object.keys(opts)
      .filter(function (k) { return opts[k] !== '' && opts[k] !== null && opts[k] !== undefined; })
      .map(function (k) { return k + '=' + opts[k]; })
      .join('; ');
    lines.push(_csvRowToLine([r.region || '', r.category || '', cat, skuVal, r.qty, r.usage, optPairs]));
  });
  lines.push('');
  _csvBuildOptionGuide().forEach(function (l) { lines.push(l); });
  return lines.join('\n');
}

function _downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 디렉터리 핸들에 blob 1개 쓰기 (엑셀과 같은 폴더에 CSV 자동 저장용)
async function _writeBlobToDir(dir, name, blob) {
  var fh = await dir.getFileHandle(name, { create: true });
  var w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

// 파일 저장 위치 선택 창(showSaveFilePicker)으로 blob 1개 저장. 같은 폴더 핸들을 받으면 in 으로 재사용.
async function _saveBlobWithPicker(suggestedName, blob, opts) {
  opts = opts || {};
  var pickerOpts = { suggestedName: suggestedName };
  if (opts.startIn) pickerOpts.startIn = opts.startIn;
  var ext = (suggestedName.split('.').pop() || '').toLowerCase();
  if (ext === 'xlsx') {
    pickerOpts.types = [{ description: 'Excel 통합 문서', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];
  } else if (ext === 'csv') {
    pickerOpts.types = [{ description: 'CSV 파일', accept: { 'text/csv': ['.csv'] } }];
  }
  var handle = await window.showSaveFilePicker(pickerOpts);
  var w = await handle.createWritable();
  await w.write(blob);
  await w.close();
  return handle;
}

// 엑셀 + CSV를 같은 이름(base)으로 저장.
// 1) showSaveFilePicker 지원: 엑셀 저장 위치를 고르면 CSV는 같은 폴더에 자동 저장 시도, 안 되면 CSV도 위치 선택.
// 2) 미지원: 두 파일 다운로드. 어떤 단계에서 오류가 나도 마지막엔 반드시 다운로드로 폴백.
async function _exportSaveFiles(base, xlsxBlob, csvBlob) {
  if (window.showSaveFilePicker) {
    var xlsxHandle = null;
    try {
      xlsxHandle = await _saveBlobWithPicker(base + '.xlsx', xlsxBlob);
    } catch (e) {
      if (e && e.name === 'AbortError') { setStatus('ok', '내보내기 취소됨'); return; }
      // 그 외 오류 → 둘 다 다운로드로 폴백
      _downloadBlob(xlsxBlob, base + '.xlsx');
      _downloadBlob(csvBlob, base + '.csv');
      setStatus('ok', '내보내기 완료(다운로드) · ' + base + '.xlsx / .csv');
      showToast('저장 창을 쓸 수 없어 다운로드로 받았습니다: ' + base, 'info');
      return;
    }

    // 엑셀이 저장된 같은 폴더에 CSV를 같은 이름으로 자동 저장 시도
    if (xlsxHandle && window.FileSystemHandle && xlsxHandle.getParent) {
      try {
        var parent = await xlsxHandle.getParent();
        await _writeBlobToDir(parent, base + '.csv', csvBlob);
        setStatus('ok', '내보내기 완료 · ' + base + '.xlsx / .csv');
        showToast('선택한 위치에 저장했습니다: ' + base + '.xlsx, ' + base + '.csv', 'ok');
        return;
      } catch (e2) { /* getParent 미지원/권한 → 아래에서 CSV도 위치 선택 */ }
    }

    // 같은 폴더 자동 저장이 안 되면 CSV 저장 위치를 한 번 더 선택 (엑셀과 같은 폴더에서 시작)
    try {
      await _saveBlobWithPicker(base + '.csv', csvBlob, { startIn: xlsxHandle || undefined });
      setStatus('ok', '내보내기 완료 · ' + base + '.xlsx / .csv');
      showToast('엑셀과 CSV를 저장했습니다: ' + base, 'ok');
      return;
    } catch (e3) {
      if (e3 && e3.name === 'AbortError') {
        // CSV 저장만 취소 → CSV는 다운로드로 보장
        _downloadBlob(csvBlob, base + '.csv');
        setStatus('ok', '엑셀 저장 완료 · CSV는 다운로드 · ' + base);
        showToast('엑셀은 저장, CSV는 다운로드로 받았습니다: ' + base, 'info');
        return;
      }
      _downloadBlob(csvBlob, base + '.csv');
      setStatus('ok', '엑셀 저장 완료 · CSV는 다운로드 · ' + base);
      showToast('CSV는 다운로드로 받았습니다: ' + base, 'info');
      return;
    }
  }

  // showSaveFilePicker 미지원 브라우저 → 기존 다운로드
  _downloadBlob(xlsxBlob, base + '.xlsx');
  _downloadBlob(csvBlob, base + '.csv');
  setStatus('ok', '내보내기 완료(다운로드) · ' + base + '.xlsx / .csv');
  showToast('엑셀과 CSV를 함께 내려받았습니다: ' + base, 'ok');
}

document.getElementById('btnCsvTemplate').addEventListener('click', _csvDownloadTemplate);
document.getElementById('btnCsvImport').addEventListener('click', function () { document.getElementById('fileCsvImport').click(); });
document.getElementById('fileCsvImport').addEventListener('change', function (e) {
  var f = e.target.files && e.target.files[0];
  if (f) _csvHandleUpload(f);
  e.target.value = '';
});

