# Changelog

버전 번호는 정수 체계(vNN)를 따릅니다. 새 버전을 맨 위에 추가합니다.

## v87 — 2026-06-29
- feat: **가격 계산기와 선택 항목 완전 동일화** 작업 시작(라벨·드롭다운·옵션까지 일치). 1차 대상 **Virtual Machine**: 계산기의 **범주(Category)** 차원 추가 → 계산기와 동일한 '범주 → 인스턴스 시리즈 → 인스턴스' 3단계 선택 흐름. 범주 옵션은 계산기 라벨 그대로(전체/일반적인 용도/컴퓨팅 최적화/메모리에 최적화/Storage에 최적화/GPU/고성능 컴퓨팅), 24개 시리즈를 범주별로 분류. tier 라벨 'Tier'→'계층'으로 정렬
- 구현: `_VM_CATEGORY_SERIES` 매핑 + `_vm_applyStepVisibility`(범주→시리즈 옵션 전환) + `rebuildKeys:['category']`. 가격 로직 무변경(시리즈/인스턴스는 그대로) — 범주는 시리즈 필터일 뿐이라 가격 영향 없음
- 영향 파일: js/services/vm.js, CHANGELOG.md
- 검증: 브라우저에서 범주별 시리즈 분배(전체24·일반9·컴퓨팅2·메모리7·Storage2·GPU1·HPC3) 및 DOM 흐름(고성능 컴퓨팅→HPC 3시리즈→HC44rs) 확인, 메모리 최적화 E8s_v5 912.55 조회. node --check 통과

## v86 — 2026-06-29
- 작업: 가격 계산기 UI 비교(2차) — AKS·Disk·Storage·MySQL 대조
- fix: **Azure Database for MySQL** General Purpose vCore 옵션에 **96** 추가(계산기 GP 인스턴스 D2ds~D96ds=최대 96 vCore와 정합. GP는 per-vCore×N 모델이라 선형, 64vCore 11334.80→96vCore 17002.20 KRW/h 확인). Business Critical은 이미 96·104 포함, Burstable B1MS~B20MS 정합
- 비교 메모(정합 확인): **AKS**(계층 표준/Automatic + SLA 3종 = 계산기 동일), **Disk**(HDD/SSD 계층·S4~S60 사이즈 동일), **Storage 중복성**(LRS/ZRS/RA-GRS/RA-GZRS 동일). 계산기의 VM '범주'·'지원 플랜', SQL '재해 복구 대기 복제본'은 필터/계산기 전용(우리 범위 밖)
- 영향 파일: js/services/mysql.js, CHANGELOG.md
- 검증: 브라우저에서 GP 96 vCore 가격 조회 확인. node --check 통과

## v85 — 2026-06-29
- 작업: 공식 Azure 가격 계산기(calculator) UI와 우리 앱 옵션을 **브라우저로 직접 비교**(계산기 각 서비스 설정 패널의 select·option을 DOM 덤프하여 대조)
- fix: **Azure SQL Database** vCore 인스턴스 옵션에 **14·18·20 vCore** 추가(계산기 인스턴스 목록과 정합, koreacentral GP·BC Gen5에 실제 존재 확인 — 3614/4647/5163 KRW/h 선형). 기존 1·2·4·6·8·10·12·16·24·32·40·80 → 14·18·20 보강
- 비교 메모: 계산기의 'DC 시리즈'(GP 하드웨어)는 koreacentral API 미제공이라 앱이 올바르게 생략(리전별 실데이터 기반). '재해 복구(기본/대기 복제본)'·'지원 플랜'은 Retail API 범위 밖(계산기 전용). 계산기상 SQL '유형'은 단일 DB/탄력적 풀 2종이며 Managed Instance는 계산기에서도 별도 제품 → 우리 카테고리 분리와 정합
- 영향 파일: js/services/sql-database.js, CHANGELOG.md
- 검증: 브라우저에서 14/18/20 vCore 가격 조회 확인. node --check 통과

## v84 — 2026-06-29
- feat: **Azure SQL Database 탄력적 풀(Elastic Pool, DTU 모델)** 신규 카테고리. 계층(Basic/Standard/Premium) × eDTU 팩(Basic 50~1600 / Standard 50~3000 / Premium 125~4000). productName='SQL Database Elastic Pool - <계층>', skuName='<N> DTU Pack', meter 'eDTUs' 단위 '1/Day' → 시간당가=÷24로 엔진 합류. 절약/예약 미제공. 라이브 브라우저 검증(Basic 100 eDTU 335.20/h, Standard 200 1006.85/h, Premium 500 6231.86/h, Standard 3000 15102.81/h)
- 참고: vCore 탄력적 풀은 단일 DB와 동일 productName('Single/Elastic Pool')·단가라 별도 추가 없이 기존 'Azure SQL Database'(vCore) 카테고리에서 동일하게 산출됨(문서에 명시)
- 영향 파일: js/services/sql-elastic-pool.js(신규), index.html, js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: 실제 브라우저(CORS 프록시 경로)에서 4개 조합 가격 조회 + 카테고리 드롭다운 노출 확인, 콘솔 오류 0. node --check 통과
- 마일스톤: 후속 항목(VM HPC·SQL Managed Instance·SQL Elastic Pool) 완료. SQL 계열은 단일 DB(vCore+DTU)·Managed Instance·탄력적 풀(DTU) 망라

## v83 — 2026-06-29
- feat: **Azure SQL Managed Instance** 신규 카테고리 추가(serviceName='SQL Managed Instance'). 계층(General Purpose/Business Critical) × 하드웨어(Gen5/Premium-series/Premium-series MO) × vCore(4~80) × 중복성(로컬/영역 중복 ZR). SQL Database vCore와 동일 패턴(meter 'vCore' + 'Zone Redundancy vCore' add-on, 절약 1년·예약 1·3년). 라이브 브라우저 검증(GP Gen5 8vCore 로컬 2065.31/ZR 3304.50, BC Premium-series 16vCore 11408.34, GP Premium-series MO 8vCore 3992.39). index.html 스크립트 등록 + SERVICE_CATEGORY_ORDER 추가
- feat: **Virtual Machine HPC 시리즈** 추가 — HB-series v4·HC-series·HX-series. 제약 코어(예 HB176-24rs_v4=실제 24 vCPU)는 카탈로그에 vCPU 명시값으로 등록해 파싱 오류 회피. RAM은 사양 미상이라 생략(라벨 vCPU만). 21→24시리즈
- fix: VM resolver `skuM`에 정규화(밑줄·공백 제거) 비교 추가 — HB v4는 API의 skuName/meterName이 'HB176-24rsv4'(밑줄 없이 'rsv4' 융합)인데 armSkuName은 'Standard_HB176-24rs_v4'라 기존 비교로는 매칭 실패하던 것 해결(HC/HX는 영향 없음). 라이브 검증 HB176-24rs_v4 14588.75 등 전 HPC SKU 매칭 확인
- fix: VM 행 detail의 'RAM:undefinedGB' 표기 수정 — RAM 미상 시 생략(HPC·M 일부 사이즈)
- 영향 파일: js/services/{sql-managed-instance(신규),vm}.js, index.html, js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: 실제 브라우저(CORS 프록시 경로)에서 MI 4조합·HPC 6 SKU 가격 조회 + MI 카테고리 드롭다운 노출 확인. node --check 통과

## v82 — 2026-06-29
- feat: **공식 Azure 가격 계산기와 옵션 정합** (단계적, 핵심 서비스부터). 기준은 Azure Retail Prices API가 노출하는 가격 차원 전체 — 각 옵션이 실제 라이브 API/브라우저에서 매칭(가격 조회)되는지 검증한 것만 추가. 계산기 전용 할인 로직(AHB·Dev/Test·지원 플랜·무료 한도 등)은 Retail API 범위 밖이라 제외
- **App Service**: 노출 계층 5종 → 10종(Premium v1(Win 전용)·v2·v4, Isolated v1·v4 추가). 계층별 인스턴스(skuName) 전체 등록. koreacentral 라이브 110개 조합 매칭(Premium v1 Linux 4개만 API 미제공=정상)
- **Azure SQL Database**: 원격 v80(중복성 ZR add-on)을 유지하면서 **① Hyperscale 하드웨어 확대**(Gen5→Gen5·Premium-series·Premium-series MO·DC-series, vCore Provisioned), **② DTU 구매 모델 신설**(구매 모델 vCore/DTU 선택 → Basic(B)·Standard(S0~S12)·Premium(P1~P15), '1/Day'→시간당가÷24). 구매모델·계층에 따라 하위 스텝(compute/hardware/vCore/redundancy ↔ DTU 크기)을 _hidden 전환. DTU는 절약/예약·ZR 미적용
- **Virtual Machine**: 인스턴스 카탈로그 11시리즈·~60종 → **21시리즈·181종**. 추가: D v3/v4 + Das v5/v6(AMD) + Dd v6, E v3/v4 + Eas v5(AMD) + Ed v6, L v3 + Las v3(AMD), A v2, N(GPU: NC v3·NV v4), FX, M 추가 사이즈. koreacentral 라이브로 전부 Linux 용량제 단가 검증(누락 0). vCPU=SKU명 파싱, RAM=시리즈 표준 사양(M·M v2 일부는 미상이라 생략 → 라벨 vCPU만). HPC HB/HC/HX는 제약 코어 명명(HB176-24rs_v4=실24코어)이라 vCPU 파싱 오류 위험으로 제외. 인스턴스 라벨도 RAM 없을 때 생략하도록 보강
- **Azure Files**: 중복성 +GZRS, 청구 항목 +Write/Read/List Operations(트랜잭션). 신규 33개 조합 매칭(Premium·일부 GZRS Data Stored 미제공은 graceful 실패=정상)
- **Blob Storage**: 액세스 계층에 Premium(고성능 블록 Blob, productName 분기) 추가, 청구 항목에 List and Create Container·All Other Operations 추가. Premium 10개·Hot 작업 미터 매칭(작업 미터는 계정 단위라 Hot에 태깅)
- **Storage Account**: Table 청구 항목에 List/Delete/Scan Operations 추가(Queue엔 없어 매칭 실패=정상)
- core: ui-and-bootstrap.js `_bindConfigEvents`에 `def.rebuildKeys` 지원 추가(instanceParentKey 외 추가 키 변경 시에도 옵션 패널 재구성 — SQL 구매모델 전환용)
- 영향 파일: js/services/{app-service,sql-database,vm,azure-files,blob-storage,storage-account}.js, js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: 실제 브라우저(CORS 프록시 corsproxy.io 경로)에서 전 서비스 신규 옵션 가격 조회 + SQL DTU DOM 스텝 전환·표 채움 확인. node --check 통과
- 비고: 작업 중 원격에 별도 v80(SQL ZR)·CHANGELOG 복원 커밋이 들어와, 로컬 v80/v81을 rebase 후 v81(Bastion)·v82(옵션 정합)로 재번호. SQL은 양쪽 작업(ZR 중복성 + Hyperscale HW + DTU)을 모두 보존하도록 수동 병합

## v81 — 2026-06-29
- fix: **Azure Bastion**의 모든 청구 항목(게이트웨이·추가 게이트웨이·데이터 전송)이 항상 "매칭 실패"로 빠져 비용이 조회되지 않던 문제 수정. `_resolve_Azure_Bastion`이 meterName 비교 시 `it.meterName.toLowerCase()`(전부 소문자)와 target 문자열을 비교하는데, target을 `` `${tier} gateway` ``로 만들면서 tier('Basic'/'Standard'/'Premium', 첫 글자 대문자)를 소문자화하지 않아 `'basic gateway' !== 'Basic gateway'`로 모든 조합이 불일치했음(v62부터 잠재). target에 `tier.toLowerCase()` 적용으로 해결
- 영향 파일: js/services/bastion.js, CHANGELOG.md
- 검증: koreacentral 라이브 API(20건)로 5개 조합 재현 — 수정 전 전부 "매칭 실패", 수정 후 Basic Gateway 285.171 / Standard Gateway 435.261 / Premium Gateway 675.405 / Standard Additional Gateway 210.126 / Standard Data Transfer Out 180.108(KRW) 정상 매칭. node --check 통과
- 비고: 원격 main에 별도 v80(SQL 중복성 ZR)이 먼저 들어와 충돌 방지 규칙대로 v80→v81로 채번

## v80 — 2026-06-23
- feat: Azure SQL Database에 **중복성(재해 복구) 옵션** 추가 — '로컬 중복' / '영역 중복(ZR)'. 공식 Azure 가격 계산기의 재해복구·중복성 옵션에 대응하며, 선택이 용량제·절약·예약 가격에 즉시 반영됨(가격 하드코딩 없음, 전부 라이브 API 조회)
- 무엇을: redundancy 스텝(def.steps) 신설 + _resolve_Azure_SQL_Database가 ZR 선택 시 'Zone Redundancy vCore' 추가 미터를 용량제·절약(1년)·예약(1·3년)에 각각 합산. ZR 추가 미터가 없는 조합(BC/HS/Fsv2)은 로컬 기준으로 폴백하고 상태창에 안내(빈 가격 방지)
- 왜: 기존엔 중복성 옵션 자체가 없어 영역 중복 비용을 추정할 수 없었고(공식 계산기 대비 누락). 더불어 '예약이 빈칸'이라는 제보를 진단 — GP/Gen5 등 예약 제공 조합의 예약 매칭 로직 자체는 정상이었고(라이브 데이터 재현 시 RI1/RI3 산출됨), 별도 예약 호출이 일시 실패하면 조용히 빈칸이 되던 약점을 보강
- 어떻게: ZR add-on은 'N vCore Zone Redundancy' 정확가 우선/없으면 per-vCore('vCore ZR Zone Redundancy'/'1 vCore Zone Redundancy')×N. 예약 제공 조합(Provisioned·非Fsv2)인데 예약 조회가 비면 1회 재시도, 그래도 비면 '예약 조회 실패(새로고침 권장)' 표기. 서버리스/Fsv2는 '예약 미제공' 명시. DOM id 변경 없음(스텝은 제네릭 렌더) → index.html·ui-and-bootstrap.js 무변경
- 영향 파일: js/services/sql-database.js, CHANGELOG.md
- 검증: 실제 sql-database.js를 Node 하니스로 로드해 koreacentral 라이브 API 데이터로 실행 — GP/Gen5/Prov 2vCore 로컬 PAYG 516.32 / SP1 413.06 / RI1 335.48 / RI3 232.33, 영역중복(ZR) PAYG 826.12(=로컬 516.32 + ZR 309.79) / SP1 660.90 / RI1 536.97 / RI3 371.68, 8vCore 선형 확인. BC/Gen5는 ZR 미터 없어 로컬 폴백+안내 확인. 모든 경우 PAYG>SP1>RI1>RI3 정합. node --check 통과. 실제 행 표시는 브라우저에서 최종 확인 권장
- 비고: 직전 제안 번호는 v79였으나 원격 main에 이미 v79(SQL/MySQL/Synapse 절약·예약 추가)가 존재해 충돌 방지 규칙대로 v80으로 채번. docs/service-status.csv는 이미 v80 항목을 반영하고 있어 본 커밋으로 코드와 문서가 일치됨

## v79 — 2026-06-23
- feat: 용량제만 나오던 컴퓨팅 서비스에 **절약 플랜·예약(RI)** 가격 추가 표시 — Azure SQL Database, Azure Database for MySQL, Azure Synapse Analytics. 기존엔 세 resolver가 sp/ri를 항상 null로 두고 "절약/예약 미적용"으로 처리했음. 가격 하드코딩 없음(모두 API 동적 조회)
- 조사: 22개 카테고리 전체를 라이브 API로 스캔해 savingsPlan(절약)·priceType=Reservation(예약) 보유 여부 확인. 컴퓨팅 모델이 앱의 시간당×N 계산과 정합한 3개만 구현 대상으로 선정. Backup·Storage(Blob/Files)의 Reserved Capacity는 100TB~10PB 대용량 약정 SKU(GB/Month)라 per-GB 사용량 모델과 불일치하여 제외(문서에 명시). 그 외(AKS·Bastion·Firewall·LB·NAT·VNet·Public IP·VPN·Bandwidth·Log Analytics·Sentinel·Storage Account)는 SP/RI 자체가 API에 없음
- 공용 헬퍼 2개 신설(js/core/resolver-engine.js): `spItemsFromBase(base, mult, cur)` — Consumption 항목의 savingsPlan을 1·3년 시간당 단가로 ×mult 환산; `riItemsFromResv(resvItems, skuLower, mult, cur)` — Reservation 항목을 normalizeReservationPrice로 시간당 환산 후 ×mult. 둘 다 unitOfMeasure='1 Hour'로 통일해 엔진 기본 계산(월=단가×Qty×usage)에 그대로 합류
- **Azure SQL Database**: per-vCore Consumption 항목의 savingsPlan(1년)을 ×N, 같은 productName의 Reservation(skuName='vCore') 1·3년을 시간당 환산 ×N. Provisioned GP/BC는 예약 제공, Serverless는 절약만(예약 미제공→빈칸 정상). 절약은 1년만(API에 3년 없음)
- **Azure Database for MySQL**: 절약은 용량제로 쓴 항목의 savingsPlan을 같은 배수로(GP=per-vCore×N, Burstable/BC=×1). 예약은 하드웨어 세대별 제품(Ddsv5/Edsv5)엔 미터가 없어 **세대 무관 generic 'General Purpose/Memory Optimized Series Compute' 제품**(skuName='vCore')에서 1·3년을 시간당 환산 ×N. Burstable은 예약 미제공(빈칸 정상)
- **Azure Synapse Analytics**: Dedicated SQL Pool만 같은 productName의 Reservation(skuName=DWU 레벨) 1·3년을 시간당 환산. 현재 API엔 DW100c만 예약 존재 → 다른 DWU 레벨·Serverless·Data Flow는 빈칸이 정상. Synapse는 절약 플랜 미제공
- 영향 파일: js/core/resolver-engine.js, js/services/{sql-database,mysql,synapse}.js, CHANGELOG.md, docs/service-status.csv
- 검증: koreacentral 라이브 API로 정규화·대소관계 확인(예약 < 절약 < 용량제). 예) SQL GP Gen5 8vCore/h PAYG 2065.30 > SP1 1652.24 > RI1 1341.90 > RI3 929.32; MySQL GP 4vCore/h 708.42 > 566.74 > 424.91 > 283.27; Synapse DW100c/h 2536.52 > RI1 1598.05 > RI3 887.75. 예약 없는 구성(Synapse DW300c 등)은 빈칸 확인. node --check 4파일 통과. 실제 행 표시는 브라우저에서 최종 확인 권장

## v78 — 2026-06-23
- feat: 신규 5개 카테고리 추가(전부 전용 resolver + 라이브 API 검증) — Storage Account, Virtual Network, Log Analytics, Microsoft Sentinel, Azure Synapse Analytics. 총 17 → 22개 카테고리. 가격은 모두 Azure Retail Prices API에서 동적 조회(하드코딩 없음)
- **Storage Account**(storage-account.js, serviceName='Storage'): 범용 v2 계정의 Table·Queue 스토리지를 다룸(Blob/파일은 기존 Blob Storage·Azure Files 카테고리 사용). 종류(Table→productName='Tables' / Queue→'Queues v2') × 중복성(skuName='Standard <LRS/ZRS/GRS/RA-GRS/GZRS/RA-GZRS>') × 청구 항목(meterName). 작업 미터 표기가 종류별로 달라(Table=Write/Read Operations, Queue=Class 1/2 Operations) 키워드+대안으로 매칭, Batch/Additional IO 제외. Data Stored=GB/Month, 작업=10K 단위. Account Encrypted SKU 범위 외
- **Virtual Network**(virtual-network.js, serviceName='Virtual Network'): VNet 리소스 자체는 무료이므로 과금되는 **글로벌 피어링 데이터 전송**을 다룸. productName='Global Virtual Network Peering' + meterName 정확 일치(Inter-Region Egress/Ingress, 0.09/GB). usage=GB. 동일 리전 내(Intra-Region) 피어링·공인 IP(Public IP 카테고리)·Public IP Prefix 범위 외
- **Log Analytics**(log-analytics.js, serviceName='Log Analytics'): skuName='Analytics Logs' + 청구 항목(metric) → meterName 키워드 매칭. Data Ingestion(3.11/GB, 무료 0.0 미터 제외) / Data Retention(0.14/GB·Month) / Data Analyzed(2.3/GB). Free 계층·Basic/Auxiliary Logs·커밋 계층 범위 외
- **Microsoft Sentinel**(sentinel.js, serviceName='Sentinel'): productName='Sentinel' + skuName(과금 모델) 정확 일치. Pay-as-you-go(5.81/GB) / Basic Logs(1.18/GB) / 100~10000 GB Commitment Tier(1/Day, usage=일수). Free Trial·M365 Defender 무료 혜택·SAP 솔루션·Classic Auxiliary Logs 범위 외
- **Azure Synapse Analytics**(synapse.js, serviceName='Azure Synapse Analytics'): 구성요소(component)별 productName 분리 + 필드 전환(instanceParentKey='component' + _synapse_applyStepVisibility). Dedicated SQL Pool=skuName(DWU 레벨 DW100c~DW30000c)+meter '100 DWUs'(예약 미터 섞이면 최저 시간단가 선택) / Serverless SQL Pool='Standard Data Processed'(6.0/TB) / Data Flow=유형별 productName(Basic/Standard/Compute Optimized)+meter 'vCore'. 파이프라인/IR·SSIS·Spark 풀·스토리지 범위 외
- 공통: 월=단가×Qty×usage(엔진 기본). 절약/예약 미적용(전부 Consumption 미터). 못 찾으면 "매칭 실패"
- chore: index.html 스크립트 로드 추가(5개), SERVICE_CATEGORY_ORDER에 5종 등록, CSV 양식 예시 행 5개 추가
- 영향 파일: js/services/{storage-account,virtual-network,log-analytics,sentinel,synapse}.js, index.html, js/ui-and-bootstrap.js, CHANGELOG.md, docs/service-status.csv
- 검증: koreacentral 라이브 API로 5개 서비스 모두 productName/skuName/meterName/단위/단가 확인(Sentinel 18건, Synapse 125건, Virtual Network 12건, Log Analytics 5건, Storage Table/Queue). node --check 6파일 통과. 함수명(_buildDetail_*/_resolve_*)이 resolver-engine 정규화 규칙과 일치. 실제 드롭다운·행 표시는 브라우저에서 최종 확인 권장
- 비고: 본래 로컬에서 v73으로 작성했으나 원격이 v77까지 진행되어(v73~v77 사용 중) rebase 후 v78로 재번호
- 마일스톤: 전체 22개 카테고리 전용 resolver + 라이브 검증

## v76 — 2026-06-22
- fix: App Service의 절약 플랜(1·3년)·예약(1·3년) 비용이 항상 빈칸으로 나오던 문제 수정. _resolve_App_Service가 sp1/sp3/ri1/ri3를 항상 null로 두고 "절약/예약 미적용"으로 처리하던 것을, VM·_genericResolve와 동일한 방식으로 실제 API 값에서 채우도록 변경(용량제 계산은 기존과 동일 — 정상)
- 절약 플랜: 매칭된 Consumption 항목(productName=계층+OS, skuName=인스턴스)에 중첩된 savingsPlan 배열에서 1년·3년 term을 makeSpItem으로 추출. 매칭 항목에 없으면 같은 skuName의 다른 Consumption 항목에서 폴백
- 예약: priceType='Reservation'을 region 기준으로 함께 조회한 뒤 skuName=인스턴스 + OS(productName의 Linux 여부) + reservationTerm(1/3년)으로 필터하고 최저가를 normalizeReservationPrice로 시간당 단가로 환산(VM과 동일한 정규화: 전체 기간가→시간당). 월=시간당×Qty×usage
- 절약 플랜·예약은 이를 제공하는 계층(주로 Premium v3·Isolated v2)에서만 값이 나오고, 미제공 계층(Free/Basic/Standard)은 자연히 빈칸으로 남음(정상)
- 한계: 예약은 컴퓨팅 기준이라 Windows OS 라이선스 추가분은 미반영(별도 PAYG 미터). 절약 플랜은 매칭된 OS 항목의 savingsPlan을 쓰므로 OS가 반영됨
- 가격 하드코딩 없음(절약 플랜·예약 모두 Azure Retail Prices API에서 동적 조회)
- 영향 파일: js/services/app-service.js, CHANGELOG.md
- 검증: get_commit 패치로 변경 범위 확인(커밋 a50e8bbf, +58/-11: 헤더 주석 + resolver만 — def·_applyStepVisibility·_buildDetail 무변경). 헬퍼 makeSpItem/normalizeReservationPrice는 resolver-engine.js에 기존 존재(VM이 동일 사용)하므로 함수 부재 위험 없음. 실제 절약/예약 단가·구간은 prices.azure.com 직접 호출이 이 환경에서 막혀 브라우저에서 최종 확인 권장(특히 예약 항목의 skuName·OS 표기, savingsPlan 제공 여부)

## v75 — 2026-06-22
- refactor: v74의 표 위 "열 도구" 툴바를 해체하고 두 기능을 더 직관적인 위치로 이동
  - 빈칸 채우기: 표 헤더의 절약 1년/3년·예약 1년/3년 그룹 체크박스 아래에 '채우기' 토글 버튼(btnFillCol-*)으로 이동. 누르면 그 열에 수동 채움이 있으면 모두 지우고(지우기), 없으면 용량제(PAYG) 값이 있는 모든 행의 빈 칸을 채움(채우기) — _toggleFillColumn. 버튼 텍스트/상태(on)는 render마다 _refreshFillButtons로 현재 열의 수동 채움 여부에 맞춰 동기화(더블클릭 토글·행별 ⊕·통화 변경 등 모든 갱신 반영)
  - 열 숨기기/보이기: "기본 Region" 박스 우측에 체크박스 4개(chkVis-sp1/sp3/ri1/ri3, 기본 체크=표시)로 이동. 체크 해제 시 표 element에 hide-<key> 클래스를 더해 CSS display:none으로만 숨김 — 셀을 DOM에서 제거하지 않아 셀 위치(cellIndex 9~23)·더블클릭 그룹 토글·총계 map·엑셀 내보내기 로직 보존 — _applyColumnVisibility
- 제거: v74의 columnToolbar(index.html), _fillColumnAllRows·_toggleColumnVisibility·btnToggleCol-* 의존 코드. v74에서 추가한 CSS hide-* 규칙은 체크박스가 그대로 재사용(무변경)
- 주의: 열 숨김은 화면 표시 전용이며 엑셀 출력 대상은 기존 헤더 체크박스(chk-group-*)로 별도 제어됨(숨겨도 출력에는 영향 없음)
- 가격 로직·하드코딩 변경 없음(표시/입력 보조 기능만)
- 영향 파일: css/main.css, index.html, js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: 3개 파일 각각 get_commit 패치로 변경 범위 확인 — css(커밋 d3a00296: .th-fill-btn 스타일만 추가, 기존 규칙 무변경), index.html(커밋 d1ce12dc, +12/-18: columnToolbar 제거 + Region 박스 chkVis-* 4개 + 헤더 btnFillCol-* 4개, 표 본문/엑셀 체크박스 무변경), ui-and-bootstrap.js(커밋 955e90fa, +49/-25: render 끝에 _refreshFillButtons 호출, v74 함수 2개를 _columnHasManualFill·_toggleFillColumn·_refreshFillButtons·_applyColumnVisibility로 교체, 바인딩을 토글 버튼+체크박스로 교체 — 셀 인덱스/더블클릭/총계 map/엑셀 getEnabledGroups 무변경). 신규 DOM id(btnFillCol-* / chkVis-*) ↔ getElementById 일치 확인. 실제 토글·숨김 동작은 브라우저에서 하드 새로고침 후 확인 권장(Mac Chrome/Edge: Cmd+Shift+R)

## v74 — 2026-06-22
- feat: 표 위에 "열 도구" 툴바 신설 — 절약 플랜 1년·3년, 예약 1년·3년 4개 열에 대해 (1) 열별 빈칸 채우기, (2) 열별 숨기기/보이기 제공
- 열별 빈칸 채우기(_fillColumnAllRows): 선택한 한 열(그룹)만, 용량제(PAYG) 값이 있는 모든 행의 빈 칸을 용량제 값으로 복사해 채움(수동, _manualFill). 원본 API 값이 있는 그룹·용량제 없는 행은 건드리지 않음. 처리 결과(채운 행 수, 용량제 없는 행 제외 수)를 상태창에 표시. 기존 행별 ⊕·전체 채우기(v50/v52)와 동일한 _makeManualFromPayg 로직 재사용
- 열별 숨기기/보이기(_toggleColumnVisibility): 표 element에 hide-<key> 클래스를 토글해 CSS display:none으로만 숨김 — 셀을 DOM에서 제거하지 않으므로 셀 위치(cellIndex 9~23)·더블클릭 그룹 토글(v50)·총계 map·엑셀 내보내기 로직이 모두 보존됨. 숨긴 열의 토글 버튼은 회색+취소선(btn-col-off)으로 상태 표시. 데이터는 유지되며 다시 누르면 복원
- 가격 셀(본문/총계)에 그룹 클래스(group-payg/sp1/sp3/ri1/ri3) 부여: priceCells에 groupClass 인자 추가, render()의 5개 호출과 총계행 td에 클래스 부여, updatePriceCells도 className 갱신 시 그룹 클래스를 함께 유지(가격 재계산 후에도 숨김 지속). 헤더 th에는 기존부터 그룹 클래스가 있어 그대로 사용
- 주의: 열 숨김은 화면 표시 전용이며 엑셀 출력 대상은 기존 헤더 체크박스(chk-group-*)로 별도 제어됨(숨겨도 출력에는 영향 없음)
- 가격 로직·하드코딩 변경 없음(표시/입력 보조 기능만)
- 영향 파일: index.html, css/main.css, js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: 3개 파일 각각 get_commit 패치로 변경 범위 확인 — css(+8, 삭제 0: hide-* 규칙·btn-col-off만 추가), index.html(+17, 삭제 0: columnToolbar 블록만 추가), ui-and-bootstrap.js(+63/-20: priceCells·render 5개 호출·총계행·updatePriceCells에 그룹 클래스, COLUMN_LABELS, 두 함수, 버튼 연결 루프만 — 셀 인덱스/더블클릭/총계 map/엑셀 getEnabledGroups 로직 무변경). 신규 DOM id(btnFillCol-* / btnToggleCol-* / columnToolbar) ↔ getElementById 일치 확인. 실제 채우기·숨김 동작은 브라우저에서 하드 새로고침 후 확인 권장(Mac Chrome/Edge: Cmd+Shift+R)

## v73 — 2026-06-22
- feat: 페이지 최하단에 "시뮬레이터 소개 · 사용 가이드 보기" 링크 버튼 추가. index.html의 [Remark] 박스 아래에 <footer>를 두고 https://wwhalefe-log.vercel.app/azure-cost-estimator-guide-20260622 로 새 탭 이동(target=_blank, rel=noopener noreferrer). 기존 'btn btn-calculator' 스타일 재사용
- 비고: index.html 변경은 커밋 0b894dd5에 들어갔는데, 저장소가 동시에 v72까지 진행된 것을 모른 채 그 커밋 메시지를 "v62"로 잘못 표기함(v62는 Azure Bastion). 실제 버전은 이 v73 항목으로 확정
- 영향 파일: index.html(커밋 0b894dd5), CHANGELOG.md
- 검증: get_commit 패치로 footer 블록만 추가(6줄, 삭제 0, 그 외 무변경 → 나머지 원본과 동일하므로 DOM 구조·스크립트 로드 순서 보존) 확인. list_commits로 index.html HEAD가 0b894dd5(footer)임을 확인(이후 작업에 덮이지 않음). 외부 링크 실제 동작·생존 여부는 브라우저에서 확인 권장(이 환경은 외부 URL 접속 불가)
## v72 — 2026-06-22
- feat: Bandwidth 전용 가격 조회 함수(_resolve_Bandwidth) 신설 — C 그룹 → A 그룹 승격(C 그룹까지 전부 완료). 기존엔 엔진에 전용 매핑이 없어 제네릭 기본 경로(skuName='Outbound (Internet Egress)' 정확 일치)로 처리됐는데 실제 API skuName('Standard')·meterName과 달라 매칭이 거의 실패했음
- API 구조(serviceName='Bandwidth', koreacentral): productName='Rtn Preference: MGN'(Microsoft Global Network), 단위 1 GB. 전송 방향(direction) → meterName:
  - Outbound (Internet Egress) → 'Standard Data Transfer Out'(계단형: 0~100GB 무료, 이후 0.12 → 0.085 → 0.082 → 0.08). 엔진은 단일 단가만 쓰므로 첫 유료 구간(tierMinimumUnits=100, 0.12)을 대표값으로 사용 → 무료 100GB·대용량 할인은 미반영(상태창에 명시)
  - Inter-region → 'Standard Inter-Region Data Transfer'(0.08)
  - Intra-region → 'Standard Inter-Availability Zone Data Transfer Out'(0.01, 가용성 영역 간)
- 매칭: productName='Rtn Preference: MGN' + meterName **정확 일치**, Egress는 무료(0.0) 구간 제외 후 첫 유료 구간 선택. 월=단가×Qty×usage(엔진 기본, usage 칸에 GB). 절약/예약 미적용. 못 찾으면 "매칭 실패"
- 범위 외: Routing Preference: Internet(별도 라우팅 제품, Out 0.11), Data Transfer In(수신, 무료), China 전용 미터
- 가격: 모두 API에서 동적 조회(하드코딩 없음)
- 영향 파일: js/services/bandwidth.js, CHANGELOG.md, docs/service-status.csv
- 검증: koreacentral 라이브 API(17건)로 productName/meterName/tierMinimumUnits/단위/단가 확인. node --check 통과. 실데이터로 3개 방향(Internet Egress 0.12, Inter-region 0.08, Intra-region 0.01) 정확 일치 확인. 함수명(_buildDetail_Bandwidth / _resolve_Bandwidth)이 resolver-engine 규칙과 일치. 실제 행 표시는 브라우저에서 최종 확인 권장
- 마일스톤: 전체 17개 카테고리 모두 전용 resolver + 라이브 검증 완료(A 그룹 17개, B·C 그룹 0개). B 그룹 8개(v62~v70)·C 그룹 2개(v71~v72) 승격 종료

## v71 — 2026-06-22
- feat: Azure Database for MySQL 전용 가격 조회 함수(_resolve_Azure_Database_for_MySQL) 신설 — C 그룹 → A 그룹 승격. 기존엔 엔진에 전용 매핑이 없어 제네릭 기본 경로(skuName 정확 일치)로 처리됐고, 옵션('D2ds_v4' 등)이 실제 API skuName과 달라 매칭이 거의 실패했음. Flexible Server 모델로 재설계
- API 구조(serviceName='Azure Database for MySQL', koreacentral): 계층마다 productName·과금 구조가 다름:
  - Burstable → '...Flexible Server Burstable BS Series Compute', meterName=인스턴스 정확 일치(B1MS 0.026 / B2S 0.104 / B2MS 0.208 / B4MS 0.416 / B8MS 0.832 / B12MS 1.248 / B16MS 1.664 / B20MS 2.08, 1 Hour)
  - General Purpose → '...Flexible Server General Purpose Ddsv5 Series Compute', per-vCore 단가(skuName='vCore', meter 'vCore', 0.118) × vCore 수
  - Business Critical → '...Flexible Server Memory Optimized Edsv5 Series Compute', meterName='<N> vCore' 정확 일치(전체 인스턴스 시간당가; N∈2/4/8/16/20/32/48/64/96/104)
- 계층에 따라 입력 필드 전환(instanceParentKey='tier' + _mysql_applyStepVisibility): Burstable=인스턴스(instance) 선택, GP/BC=vCore 수(vCores) 선택. 기존 'compute' 단일 필드를 instance/vCores 2개로 분리
- 월=단가(설정 1개 시간당가)×Qty(서버 수)×usage(시간, 예 730). 절약/예약 미적용. 못 찾으면 "매칭 실패"
- chore: CSV 양식(v63)에서 MySQL 예시를 'tier=General Purpose; vCores=2'로 갱신, CSV_SKU_OPTION_KEY/CSV_SKU_DESC에서 MySQL의 'compute' 매핑 제거(이제 Options로 식별)
- 범위 외(매칭 실패 정상): Single Server(레거시), 스토리지/백업, 표에 없는 D/E 시리즈(Dadsv6·Edsv6 등), Confidential Compute, Extended Support
- 가격: 모두 API에서 동적 조회(하드코딩 없음)
- 영향 파일: js/services/mysql.js, js/ui-and-bootstrap.js, CHANGELOG.md, docs/service-status.csv
- 검증: koreacentral 라이브 API(75건)로 productName 분포·skuName·meterName·단위·단가 확인. node --check 통과(2파일). 실데이터로 Burstable 인스턴스(B1MS/B2S/B4MS/B20MS), GP per-vCore(0.118×N), BC N vCore(2/8/32/104) 매칭 검증. 함수명이 resolver-engine 규칙과 일치. 실제 드롭다운(계층별 필드 전환)·행 표시는 브라우저에서 최종 확인 권장

## v70 — 2026-06-22
- feat: NAT Gateway 전용 가격 조회 함수(_resolve_NAT_Gateway) 신설 — B 그룹 → A 그룹 승격(B 그룹 8개 전부 완료). 기존 svcDef는 apiServiceName이 'Virtual Network'였고 제네릭이 row.region(koreacentral)으로 조회해 0건이었음 — NAT Gateway 미터는 리전 비종속(Global)이라 koreacentral엔 없음(Load Balancer v64와 동일 유형)
- API 구조: serviceName='NAT Gateway', productName='NAT Gateway', **armRegionName='Global'**, skuName='Standard'. row.region이 아닌 'Global'로 조회. apiServiceName도 'NAT Gateway'로 정정
- 청구 항목(metric) 매핑: Resource Hour → 'Standard Gateway'(1 Hour, 0.045) / Data Processed → 'Standard Data Processed'(1 GB, 0.045). skuName='Standard' + meterName **정확 일치**로 StandardV2(Log Enabled, 1/Month)를 제외
- 월=단가×Qty×usage(엔진 기본). Resource Hour는 usage 칸에 시간(예 730), Data Processed는 GB. 절약/예약 미적용. 못 찾으면 "매칭 실패". StandardV2 Log Enabled는 범위 외
- 가격: 모두 API에서 동적 조회(하드코딩 없음). resolver-engine.js의 NAT Gateway 제네릭 매핑은 전용 resolver 우선 호출로 더 이상 타지 않음(데드코드, 미삭제)
- 영향 파일: js/services/nat-gateway.js, CHANGELOG.md, docs/service-status.csv
- 검증: koreacentral 0건 확인 후 armRegionName='Global'에서 미터 확보. node --check 통과. 실데이터로 2개 청구 항목(Resource Hour 0.045/Hour, Data Processed 0.045/GB) 정확 일치 확인. 함수명(_buildDetail_NAT_Gateway / _resolve_NAT_Gateway)이 resolver-engine 규칙과 일치. 실제 행 표시는 브라우저에서 최종 확인 권장
- 마일스톤: B 그룹 8개(Load Balancer, Application Gateway, Public IP, Azure Firewall, Azure SQL Database, App Service, Azure Bastion, NAT Gateway) 전부 전용 resolver + 라이브 검증 완료(A 그룹 15개). 남은 보완 대상은 C 그룹 2개(Azure Database for MySQL, Bandwidth)

## v69 — 2026-06-22
- feat: App Service 전용 가격 조회 함수(_resolve_App_Service) 신설 — B 그룹 → A 그룹 승격. 기존 제네릭은 skuName 정확 일치였으나 옵션 표기('P1V3')가 실제 API skuName('P1 v3', 공백 포함)과 달라 매칭이 깨졌고, OS·계층별 productName 구분이 없었음
- API 구조: serviceName='Azure App Service', productName='Azure App Service <계층> Plan'(Windows) / '... Plan - Linux'(Linux), skuName=인스턴스(공백 표기 'P1 v3','I1 v2' 등), meterName='<인스턴스> App', 단위 1 Hour
- 계층에 따라 인스턴스(size) 옵션 동적 전환(instanceParentKey='tier' + _appsvc_applyStepVisibility): Free=F1, Basic=B1~B3, Standard=S1~S3, Premium v3=P0v3·P1 v3~P3 v3·P1mv3~P5mv3, Isolated v2=I1 v2~I6 v2·I1mv2~I5mv2. Shared 계층은 koreacentral 미제공이라 제외
- 매칭: productName(계층+OS) + skuName=인스턴스 **정확 일치**. Windows/Linux 단가 차이 반영(예 Premium v3 P1 v3 Windows 0.341 / Linux 0.181). 월=단가×Qty(인스턴스 수)×usage(시간, 예 730). 절약/예약 미적용. 못 찾으면 "매칭 실패" ※ v76에서 절약 플랜·예약을 채우도록 보완
- chore: CSV 양식(v63)의 App Service 예시 SKU를 'P1V3' → 'P1 v3'(실제 skuName)로 수정
- 범위 외: Shared, Isolated 스탬프(ASIP)·Windows Container·도메인/SSL 등 부가 미터, 예약 인스턴스
- 가격: 모두 API에서 동적 조회(하드코딩 없음). resolver-engine.js의 App Service 제네릭 매핑은 전용 resolver 우선 호출로 더 이상 타지 않음(데드코드, 미삭제)
- 영향 파일: js/services/app-service.js, js/ui-and-bootstrap.js, CHANGELOG.md, docs/service-status.csv
- 검증: koreacentral 라이브 API(serviceName 'Azure App Service', 128건)로 productName(계층+OS)·skuName·meterName·단위·단가 확인. node --check 통과(2파일). 실데이터로 계층×OS×인스턴스 14건 매칭 검증(Free 0.0, Basic B1 Win 0.085/Linux 0.018, Standard S1, Premium v3 P1 v3·P3mv3, Isolated v2 I1 v2 등) 정확 일치. 함수명(_buildDetail_App_Service / _resolve_App_Service)이 resolver-engine 규칙과 일치. 실제 드롭다운(계층별 인스턴스 전환)·행 표시는 브라우저에서 최종 확인 권장

## v68 — 2026-06-22
- feat: Azure SQL Database 전용 가격 조회 함수(_resolve_Azure_SQL_Database) 신설 — B 그룹 → A 그룹 승격. 기존 제네릭은 productName이 'Compute Gen5'로 고정되고 vCore 차원이 없어 특정 vCore 미터와 매칭되지 않아 취약했음. vCore 구매 모델을 정식 반영
- vCore 수(vCores) 옵션 신설 + tier×compute×hardware → productName 매핑(7종): GP Provisioned Gen5/FSv2, GP Serverless Gen5, BC Provisioned Gen5/M-series, HS Provisioned Gen5, HS Serverless Gen5(=productName 'SQL Database SingleDB Hyperscale - Serverless - Compute Gen5')
- 가격은 vCore에 선형 비례: Provisioned는 skuName='<N> vCore'(meter 'vCore') 정확 일치 단가(N vCore 전체 시간당가)를 우선, 없으면 per-vCore 기준 단가(skuName='vCore') × N. Serverless는 per-vCore 단가(skuName='1 vCore', meter 'vCore', '- Free' 제외) × N(최대 vCore 기준 상한 추정 — 실제는 사용 vCore-초로 과금, 상태창에 명시)
- tier에 따라 compute/hardware 옵션 동적 전환(instanceParentKey='tier' + _sql_applyStepVisibility): BC는 Provisioned만, 하드웨어 GP=Gen5·Fsv2-series / BC=Gen5·M-series / HS=Gen5
- 월=단가(설정 1개 시간당가)×Qty(DB 수)×usage(시간, 예 730). 절약/예약(RI) 미적용. 매칭 미터를 그대로 두지 않고 N vCore 환산가를 paygItem.unitPrice로 구성(per-vCore·vCore 수·산출 근거를 _sqlPerVcore/_sqlVcores/_sqlBasis에 보존)
- 범위 외(매칭 실패 정상): Zone Redundancy(비ZR 기준), 예약 용량, 스토리지/백업(PITR·LTR), DTU 모델(Basic/Standard/Premium), Elastic Pool 전용 미터, 매핑 표에 없는 조합
- chore: CSV 양식(v63)의 SQL Database 예시에 vCores=2 추가
- 가격: 모두 API에서 동적 조회(하드코딩 없음). resolver-engine.js의 Azure SQL Database 제네릭 매핑/Reservation 분기는 전용 resolver 우선 호출로 더 이상 타지 않음(데드코드, 미삭제)
- 영향 파일: js/services/sql-database.js, js/ui-and-bootstrap.js, CHANGELOG.md, docs/service-status.csv
- 검증: koreacentral 라이브 API(serviceName 'SQL Database', 261건)로 productName 분포·skuName('<N> vCore')·meterName('vCore')·단위·단가 확인. node --check 통과(2파일). 실데이터로 7개 productName×vCore(2·8) 해석 검증 — Provisioned 정확 미터가(GP Gen5 2vCore 0.3440, BC Gen5 8vCore 2.7521 등)와 per-vCore 선형(FSv2 0.150945×N, GP Serverless 0.589587×N, HS Serverless 0.79×N, HS Provisioned 0.206406×N) 일치 확인. 실제 드롭다운(계층별 compute/hardware 전환)·행 표시는 브라우저에서 최종 확인 권장

## v67 — 2026-06-22
- feat: Azure Firewall 전용 가격 조회 함수(_resolve_Azure_Firewall) 신설 — B 그룹 → A 그룹 승격. 기존엔 전용 resolver가 없어 엔진 _genericResolve가 productName 'Azure Firewall <계층>'(존재하지 않음) + meterName 부분일치로 처리해 부정확했음(실제 productName은 'Azure Firewall' 단일)
- API 구조: serviceName='Azure Firewall', productName='Azure Firewall', skuName=계층(독립형 VNet 기준 'Standard'/'Premium'/'Basic'). koreacentral 단가:
  - Deployment(배포, 1 Hour): Standard 1.25 / Premium 1.75 / Basic 0.395
  - Data Processed(데이터 처리, 1 GB): Standard 0.016 / Premium 0.016 / Basic 0.065
  - Capacity Unit(용량 단위, 1 Hour): Standard 0.07 / Premium 0.11 (Basic은 미터 없음)
- 계층에 따라 청구 항목(metric) 옵션 동적 전환(instanceParentKey='tier' + _fw_applyStepVisibility): Standard/Premium=3개(Deployment/Data Processed/Capacity Unit), Basic=2개(Capacity Unit 없음)
- 매칭: skuName=계층 + meterName='<계층> <청구 항목>' **정확 일치** → Virtual WAN용 'Secured Virtual Hub' SKU(skuName='Standard Secure Virtual Hub' 등)를 자동 제외(범위 외). 못 찾으면 "매칭 실패"
- 월=단가×Qty×usage(엔진 기본). 시간제(Deployment/Capacity Unit)는 usage 칸에 시간(예 730), 데이터 처리는 GB. 절약/예약 미적용
- chore: CSV 양식(v63)의 Azure Firewall 예시 행 metric을 'Deployment (배포, 시간당)'로 갱신(새 청구 항목 라벨 반영)
- 가격: 모두 API에서 동적 조회(하드코딩 없음). resolver-engine.js의 Azure Firewall 제네릭 매핑은 전용 resolver 우선 호출로 더 이상 타지 않음(데드코드, 미삭제 — 이전 버전과 동일 방침)
- 영향 파일: js/services/firewall.js, js/ui-and-bootstrap.js, CHANGELOG.md, docs/service-status.csv
- 검증: koreacentral 라이브 API 16건으로 skuName/meterName/단위/단가 확인. node --check 통과(2파일). 실데이터로 8개(계층×청구 항목) 조합 전부 정확 일치 확인, Basic Capacity Unit 미터 부재(미노출 정상) 확인. 함수명(_buildDetail_Azure_Firewall / _resolve_Azure_Firewall)이 resolver-engine 규칙과 일치. 실제 드롭다운(계층별 청구 항목 전환)·행 표시는 브라우저에서 최종 확인 권장

## v66 — 2026-06-22
- feat: Public IP 전용 가격 조회 함수(_resolve_Public_IP) 신설 — B 그룹 → A 그룹 승격. 기존엔 전용 resolver가 없어 엔진 _genericResolve가 skuName 부분일치(sku & ipType 포함)만 했음
- API 구조: serviceName='Virtual Network', productName='IP Addresses', skuName=SKU. 미터명 패턴 '<SKU> IPv4 <Static|Dynamic> Public IP'(단위 1 Hour, IPv4). koreacentral 단가: Standard Static 0.005 / Global Static 0.01 / Basic Static 0.0036 / Basic Dynamic 0.004
- SKU 옵션에 Global 추가(Standard/Global/Basic). Standard·Global SKU는 Static만 제공(Dynamic 미지원)하므로 SKU에 따라 IP 유형 옵션을 동적 전환(instanceParentKey='sku' + _pip_applyStepVisibility). Basic만 Static/Dynamic 모두
- 매칭: skuName=SKU + meterName='<SKU> IPv4 <유형> Public IP' **정확 일치**. 못 찾으면 "매칭 실패"(Standard+Dynamic은 미터가 없어 정상적으로 실패, UI에서도 미노출)
- 월=단가×Qty×usage(엔진 기본). usage 칸에 시간(예 730), Qty=IP 개수. 절약/예약 미적용. IPv6·Public IP Prefix는 범위 외(현재 IPv4 단일 주소만)
- 가격: 모두 API에서 동적 조회(하드코딩 없음). resolver-engine.js의 Public IP 제네릭 매핑은 전용 resolver 우선 호출로 더 이상 타지 않음(데드코드, 미삭제 — 이전 버전과 동일 방침)
- 영향 파일: js/services/public-ip.js, CHANGELOG.md, docs/service-status.csv
- 검증: koreacentral 라이브 API(productName 'IP Addresses', 4개 미터)로 skuName/meterName/단위/단가 확인. node --check 통과. 실데이터로 5개 조합 검증 — Standard Static/Global Static/Basic Static/Basic Dynamic 정확 일치, Standard Dynamic은 미터 없음 확인(매칭 실패 정상). 함수명(_buildDetail_Public_IP / _resolve_Public_IP)이 resolver-engine 규칙과 일치. 실제 드롭다운(SKU별 IP 유형 전환)·행 표시는 브라우저에서 최종 확인 권장

## v65 — 2026-06-22
- feat: Application Gateway 전용 가격 조회 함수(_resolve_Application_Gateway) 신설 — B 그룹 → A 그룹 승격. 기존엔 전용 resolver가 없어 엔진 _genericResolve가 skuName 부분일치만 했고, 제품군마다 다른 과금 체계(v2=고정+CU, v1=게이트웨이+데이터)를 반영하지 못했음
- API 구조: serviceName='Application Gateway'(koreacentral). 제품군(productName)별로 과금이 다름:
  - v2 제품군(고정 비용 + 용량 단위 CU, 단위 1/Hour): Standard_v2→'Application Gateway Standard v2'(Fixed 0.27/CU 0.008), WAF_v2→'Application Gateway WAF v2'(Fixed 0.486/CU 0.0144), Basic_v2→'Application Gateway Basic v2'(Fixed 0.0225/CU 0.008)
  - v1 제품군(게이트웨이 시간당 + 데이터 처리 GB): Standard_Small/Medium/Large→'Basic Application Gateway'(Gateway 0.027/0.0756/0.3456, Data 0.008/0.007/0.0035), WAF_Medium/Large→'WAF Application Gateway'(Gateway 0.1701/0.604, 데이터 처리 미터 없음)
- SKU(제품군)에 따라 청구 항목(metric) 옵션을 동적 전환(instanceParentKey='sku' + _agw_applyStepVisibility). v2=고정 비용/용량 단위, v1=게이트웨이/데이터 처리. SKU 변경 시 청구 항목을 해당 제품군 첫 항목으로 기본 설정
- 매칭: productName+skuName+meterName **정확 일치** → 'Application Gateway WAF v2 - Discounted'(예약형 할인 제품, Fixed 0.27)를 자동 제외하고 PAYG(0.486) 선택. 데이터 처리는 무료(0.0) 구간을 빼고 첫 유료 구간 사용. 'Application Gateway for Containers'(AGC)는 범위 외
- 월=단가×Qty×usage(엔진 기본). 시간제는 usage 칸에 시간(예 730), 데이터 처리는 GB. 절약/예약 미적용. 못 찾으면 "매칭 실패"
- chore: CSV 양식(v63)의 Application Gateway 예시 행에 metric=고정 비용 (시간당) 추가(새 청구 항목 옵션 반영)
- 가격: 모두 API에서 동적 조회(하드코딩 없음). resolver-engine.js의 Application Gateway 제네릭 매핑은 전용 resolver 우선 호출로 더 이상 타지 않음(데드코드, 미삭제 — 이전 버전과 동일 방침)
- 영향 파일: js/services/app-gateway.js, js/ui-and-bootstrap.js, CHANGELOG.md, docs/service-status.csv
- 검증: koreacentral 라이브 API 27건으로 제품군/skuName/meterName/단위/단가 확인. node --check 통과(app-gateway.js, ui-and-bootstrap.js). 실데이터로 14개(SKU×청구 항목) 조합 전부 정확 일치 확인('- Discounted' 제외·데이터 처리 유료 구간 선택 포함). 함수명(_buildDetail_Application_Gateway / _resolve_Application_Gateway)이 resolver-engine 규칙과 일치. 실제 드롭다운(SKU별 청구 항목 전환)·행 표시는 브라우저에서 최종 확인 권장

## v64 — 2026-06-21
- feat: Load Balancer 전용 가격 조회 함수(_resolve_Load_Balancer) 신설 — B 그룹 → A 그룹 승격. 기존엔 전용 resolver가 없어 엔진 _genericResolve로 처리됐는데, productName을 '<계층> Load Balancer'(존재하지 않음)로 조회하고 row.region(koreacentral)으로 찾아 0건이 됐음(LB 미터는 리전 비종속이라 koreacentral엔 없음)
- API 구조: serviceName='Load Balancer', productName='Load Balancer', **armRegionName='Global'**(리전 비종속), skuName=계층. row.region이 아닌 'Global'로 조회
- 계층마다 미터 체계가 달라 청구 항목(metric) 옵션을 계층에 따라 교체(instanceParentKey='tier' + _lb_applyStepVisibility, Backup/AKS 패턴):
  - Standard/Global: 규칙(시간당, 5개 포함)='<계층> Included LB Rules and Outbound Rules'(1 Hour, 0.025) / 초과 규칙(시간당)='<계층> Overage ...'(1/Hour, 0.01) / 데이터 처리(GB)='<계층> Data Processed'(Standard 0.005 / Global 0.0)
  - Gateway: 게이트웨이(시간당)='Gateway'(0.0125) / 게이트웨이 체인(시간당)='Gateway Chain'(0.01) / 데이터 처리(GB)='Gateway Data Processed'(0.004)
  - Basic: 과금 미터 없음(무료) → 선택 시 "무료" 안내만 표시(paygItem=null)
- 매칭: skuName=계층 + meterName **정확 일치**('- Free' 무료 변형 미터 자동 제외). 계층에 없는 항목 조합은 "매칭 실패"
- 월=단가×Qty×usage(엔진 기본). 시간제는 usage 칸에 시간(초과 규칙은 Qty=추가 규칙 수), 데이터 처리는 usage 칸에 GB. 절약/예약 미적용
- 가격: 모두 API에서 동적 조회(하드코딩 없음). resolver-engine.js의 Load Balancer 제네릭 매핑은 전용 resolver 우선 호출로 더 이상 타지 않음(데드코드, 위험 회피 위해 미삭제 — Azure Files v60·Bastion v62와 동일 방침)
- 영향 파일: js/services/load-balancer.js, CHANGELOG.md, docs/service-status.csv
- 검증: koreacentral 0건 확인 후 armRegionName='Global'에서 12개 미터 확보. node --check 통과. 실데이터로 9개(계층×청구 항목) 조합 전부 정확 일치 확인('- Free' 제외, Standard/Global/Gateway 각 단가 대조). 함수명(_buildDetail_Load_Balancer / _resolve_Load_Balancer)이 resolver-engine 규칙과 일치. 실제 드롭다운(계층별 청구 항목 전환)·행 표시는 브라우저에서 최종 확인 권장

## v63 — 2026-06-21
- feat: "CSV 양식 다운로드"가 전체 17개 서비스 카테고리의 예시 행을 포함하도록 재작성. 기존엔 Virtual Machine·Disk·VPN Gateway 3개 예시만 들어 있었고 업로드도 그 3개만 지원했음 → 모든 서비스를 양식·업로드 모두에서 지원
- 예시 행 19개(복합 서비스 Disk·Backup은 2개씩): Virtual Machine, Azure Kubernetes Service, Disk(용량형+프로비저닝형), Azure Files, Blob Storage, Backup(보호 인스턴스+저장소), VPN Gateway, Load Balancer, Application Gateway, Public IP, Azure Firewall, Bandwidth, NAT Gateway, Azure SQL Database, Azure Database for MySQL, App Service, Azure Bastion. 각 행은 실제 옵션 키(예: blobTier/redundancy/metric, tier/metric, fileTier 등)로 채워 그대로 업로드 가능
- 업로드 확장: CSV_SUPPORTED_CATEGORIES를 SERVICE_CATEGORY_ORDER 전체로 자동 동기화(향후 카테고리 추가 시 자동 반영). SKU 열 매핑(CSV_SKU_OPTION_KEY)에 App Service=size, Azure Database for MySQL=compute, Application Gateway=sku, Public IP=sku 추가(기존 VM=instance/Disk=diskInstance/VPN=sku 유지). 인스턴스·단일 SKU가 없는 서비스는 SKU 열을 비우고 Options만으로 식별 — 모든 서비스가 _buildDetail_*에서 options로 skuName을 구성하므로 동작함
- 옵션 사전(# 주석) 자동 생성: SERVICE_CATEGORIES.steps에서 서비스별 옵션을 모두 나열(SKU 열로 받는 키는 제외 표기), VM series 인스턴스 카탈로그·Disk 종류별 카탈로그·Backup 조건부 옵션·저장/전송 사용량 단위(Hours 칸=GB) 안내 포함. 총 47줄
- 주의: 가격 매칭 정확도는 각 서비스 resolver 수준을 따름(A 그룹=라이브 검증, 일부 제네릭 서비스는 매칭 취약 가능 — docs/service-status.csv 참고). 업로드 완료 안내문도 이 취지로 수정
- 가격 하드코딩 없음(양식은 옵션 메타데이터만 사용, 가격은 업로드 후 API 실시간 조회)
- 영향 파일: js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: node --check 통과. Node 하니스로 실제 서비스 정의(js/services/*.js)를 로드해 _csvBuildExampleRows/_csvBuildOptionGuide 실행 — 17개 카테고리 전부 예시 포함(누락 0·오타 0), 옵션 사전 47줄 정상 생성 확인. 실제 다운로드 파일·재업로드 동작은 브라우저에서 최종 확인 권장

## v62 — 2026-06-21
- feat: Azure Bastion 전용 가격 조회 함수(_resolve_Azure_Bastion) 신설 — B 그룹 → A 그룹 승격. 기존엔 전용 resolver가 없어 엔진 _genericResolve로 처리됐는데, 거기서 productName을 'Azure Bastion <계층>'(존재하지 않음)으로 조회하고 매칭 조건이 `return true`(첫 consumption 항목)라 게이트웨이 시간요금/추가 게이트웨이/데이터 전송이 구분되지 않고 부정확했음(Blob v57·Azure Files v60과 동일 유형)
- 옵션 확장: 계층에 Premium 추가(Basic/Standard/**Premium**), 청구 항목(metric) 신설 — 게이트웨이(시간당) / 추가 게이트웨이(시간당) / 데이터 전송 아웃(GB)
- API 구조(koreacentral, USD): serviceName='Azure Bastion', productName='Azure Bastion'(계층 접미사 없음), skuName=계층. 매칭은 skuName=계층 + meterName 정확 일치('Standard Gateway'가 'Standard Additional Gateway'와 부분 충돌하지 않도록 정확 일치 사용)
  - 게이트웨이(시간당): '<계층> Gateway'(단위 1 Hour) — Basic 0.19 / Standard 0.29 / Premium 0.45
  - 추가 게이트웨이(시간당): '<계층> Additional Gateway'(단위 1 Hour, 스케일 유닛 추가분) — Standard 0.14 / Premium 0.22. Basic은 미터가 없어 매칭 실패가 정상
  - 데이터 전송 아웃(GB): '<계층> Data Transfer Out'(단위 1 GB, 계단형). 첫 5GB 무료 후 0.12부터(대용량 0.085→0.082→0.08). 엔진은 단일 단가만 쓰므로 '첫 유료 구간(unitPrice>0, tierMinimumUnits 최소=5GB) 단가 0.12'를 대표값으로 사용 → 무료 한도·대용량 할인은 미반영(상태창에 명시)
- 월=단가×Qty×usage(엔진 기본). 게이트웨이/추가 게이트웨이 usage 칸엔 시간(예 730), 데이터 전송 usage 칸엔 GB 입력. 절약/예약(SP/RI) 미적용 → sp/ri 전부 null. 매칭 실패 시 "매칭 실패" 표시
- 가격: 모두 API에서 동적 조회(하드코딩 없음). resolver-engine.js의 _genericResolve 내 Azure Bastion 매핑(productName/`return true`)은 전용 resolver 우선 호출로 더 이상 타지 않음(데드코드, 위험 회피 위해 이번엔 미삭제 — Azure Files v60과 동일 방침)
- 영향 파일: js/services/bastion.js, CHANGELOG.md, docs/service-status.csv
- 검증: koreacentral 라이브 API(serviceName 'Azure Bastion', 20건)로 실제 productName/skuName/meterName/단위/단가 확인. node --check 통과. 매칭 로직 확인 — skuName=계층 & meterName 정확 일치, 데이터 전송은 무료 0원 구간 제외 후 최소 tierMinimumUnits(=5GB,0.12) 선택. 함수명(_buildDetail_Azure_Bastion / _resolve_Azure_Bastion)이 resolver-engine 규칙(공백→_)과 일치. 실제 행 표시·드롭다운(Premium·청구항목 노출)·매칭은 브라우저에서 최종 확인 권장

## v61 — 2026-06-21
- docs: 서비스별 구현·검증 현황표 추가(docs/service-status.csv) — 17개 카테고리의 구현 방식(전용 resolver/제네릭)·검증 수준·계산 항목·주요 옵션·알려진 한계를 정리. 엑셀에서 바로 열림(UTF-8)
- 분류: A(전용 resolver + 라이브 API 검증) 7개 — Virtual Machine, Disk, VPN Gateway, AKS, Blob Storage, Backup, Azure Files / B(제네릭 처리, 실데이터 미검증) 8개 — Load Balancer, Application Gateway, Public IP, Azure Firewall, Azure SQL Database, App Service, Azure Bastion, NAT Gateway / C(제네릭 기본, 매칭 취약) 2개 — Azure Database for MySQL, Bandwidth
- 코드 변경 아님(index.html이 로드하지 않는 독립 문서) → 앱 동작 영향 없음
- 영향 파일: docs/service-status.csv(신규), CHANGELOG.md

## v60 — 2026-06-21
- fix: Azure Files 가격 조회가 안 되던 문제 수정 — 전용 함수 _resolve_Azure_Files 신설. 기존엔 전용 resolver가 없어 엔진 _genericResolve로 처리됐는데, 그 productName 매핑('General Purpose v2 Files','Cool Files' 등)이 실제 API에 존재하지 않아 조회가 0건이 되어 가격이 안 나왔음(Blob v57과 동일 유형)
- 매칭 방식: skuName("<API계층> <중복성>")으로 묶고 metric을 meterName 키워드로 가름. 계층 매핑 Premium→productName 'Premium Files'(sku 'Premium ...'), Hot/Cool/Transaction Optimized→'Files v2'(sku 'Hot ...'/'Cool ...'/'Standard ...'). 청구 항목 Data Stored→'data stored', Snapshots→'snapshots', Metadata→'metadata'. 단, Premium은 'Data Stored' 미터가 없어 'Provisioned'(프로비저닝 용량, burst 제외)로 매칭
- 월=단가×Qty×usage(엔진 기본, 단위 1 GB/Month). usage 칸에 GB 입력. 절약/예약 미적용. 못 찾으면 "매칭 실패" 표시(Premium은 GRS·Metadata 없음, Snapshots는 Premium만, Transaction Optimized는 Metadata 없음 → 정상적으로 매칭 실패)
- 가격: 모두 API(serviceName 'Storage')에서 동적 조회(하드코딩 없음)
- 영향 파일: js/services/azure-files.js, CHANGELOG.md
- 검증: koreacentral 라이브 API(contains(productName,'Files')) 응답으로 실제 productName/skuName/meterName/단위 확인. 실데이터 단가 대조(Hot LRS 0.03 / GRS 0.06 / ZRS 0.0375, Cool LRS 0.0216 / GRS 0.0432 / ZRS 0.027, Transaction Optimized LRS 0.066 / GRS 0.11 / ZRS 0.0825, Premium LRS Provisioned 0.176 / ZRS 0.22, Hot LRS Metadata 0.0286, Premium LRS Snapshots 0.15, 단위 1 GB/Month). 함수명(_resolve_Azure_Files)이 resolver-engine 규칙과 일치. 커밋 후 get_commit 패치로 변경 범위(헤더 주석 + resolver 추가, def·buildDetail 무변경) 확인. 실제 행 표시는 브라우저에서 최종 확인 권장

## v59 — 2026-06-21
- fix: 새 서비스 "Backup"이 Service Category 드롭다운에 나타나지 않던 문제 수정(스크린샷). SERVICE_CATEGORY_ORDER 배열('Blob Storage' 다음)에 'Backup'을 직접 추가
- 원인: v58에서 backup.js가 DOMContentLoaded 시점에 SERVICE_CATEGORY_ORDER에 지연 등록하도록 했으나, 부트스트랩이 addRow()×3를 스크립트 실행 중(동기) 호출해 초기 render()가 지연 등록보다 먼저 끝남 → 초기 드롭다운에 Backup 누락. render()는 매 호출 시 SERVICE_CATEGORY_ORDER로 카테고리 select를 다시 만들므로, 배열에 직접 넣으면 초기 동기 렌더부터 포함됨(다른 17개 카테고리와 동일 방식)
- refactor: backup.js의 지연 등록 IIFE 블록 제거(코어 배열 직접 등록으로 불필요해짐). resolve/visibility/buildDetail 로직은 변경 없음
- 영향 파일: js/ui-and-bootstrap.js, js/services/backup.js, CHANGELOG.md
- 검증: 두 변경 모두 get_commit 패치로 범위 확인 — ui-and-bootstrap.js는 배열 한 줄만(추가 1·삭제 1, 그 외 무변경 → 나머지 원본과 동일하므로 문법 보존), backup.js는 지연 등록 블록 제거(-28)+헤더 주석(+1). 실제 드롭다운 노출·선택·가격 조회는 브라우저에서 최종 확인 권장

## v58 — 2026-06-21
- feat: 새 서비스 "Azure Backup" 추가 — 두 청구 요소(보호 인스턴스 / 백업 저장소)를 청구 항목(metric)으로 선택해 각각 계산
- 보호 인스턴스(Protected Instance, 단위 1/Month): 워크로드별 월정액. skuName=워크로드, meterName '...Protected Instance' 매칭. 워크로드 13종(Azure VM $10, SQL Server in Azure VM $33.75, SAP HANA on Azure VM $108, SAP ASE on Azure VM $108, Azure Files $5.5, Azure Files Vaulted $13.5, Azure Blob $13.5, ADLS Gen2 Vaulted $13.5, Cross region for ADLS and Blobs $12, PostgreSQL $7.5, Cosmos DB $33.75, Azure Kubernetes $12, On Premises Server $10). Qty=인스턴스 수, usage=1 권장
- 백업 저장소(Data Stored, 단위 1 GB/Month): skuName=계층(Standard/Archive), meterName '<계층> <중복성> Data Stored' 정확 일치(GRS↔RA-GRS 부분 문자열 충돌 방지). Standard LRS $0.0246 / ZRS $0.0308 / GRS $0.0493 / RA-GRS $0.0626, Archive LRS $0.0027 / GRS $0.0063(Archive는 LRS/GRS만 제공 → 그 외 조합은 매칭 실패가 정상). usage=GB
- 월=단가×Qty×usage(엔진 기본 계산). 절약/예약 미적용. 매칭 실패 시 "매칭 실패" 표시. 인스턴스 요금과 저장소 요금은 각각 별도 Backup 행으로 추가
- 조건부 옵션: instanceParentKey='metric' + _backup_applyStepVisibility로 보호 인스턴스→워크로드만, 백업 저장소→계층+중복성만 노출(AKS 패턴)
- 신규 서비스 등록: js/services/backup.js 생성 + window._svcDefs 등록 + index.html script(blob-storage.js 다음) 추가. 단, 이번엔 코어 파일(ui-and-bootstrap.js)을 직접 수정하지 않고 backup.js가 DOMContentLoaded 시점에 SERVICE_CATEGORY_ORDER에 'Backup'을 지연 등록(Blob Storage 다음, 중복 가드 포함) — 대용량 코어 파일 재작성에 따른 위험을 피하기 위함 ※ v59에서 이 방식이 동작하지 않아 코어 배열 직접 등록으로 교체
- 가격: 모두 API(serviceName 'Backup', productName 'Backup')에서 동적 조회(하드코딩 없음). 'Backup Reserved Capacity'(예약 용량 SKU)는 기본 견적에서 제외
- 영향 파일: js/services/backup.js(신규), index.html, CHANGELOG.md
- 검증: koreacentral 라이브 API로 보호 인스턴스/저장소 미터명·skuName·단위·단가 확인. node --check 통과. 실데이터로 매칭 로직 확인(보호 인스턴스 skuName=워크로드 & 'protected instance' 포함, 저장소 meterName '<계층> <중복성> data stored' 정확 일치). 함수명(_buildDetail_Backup / _resolve_Backup)이 resolver-engine 규칙(공백→_)과 일치. 커밋 후 get_commit 패치로 backup.js(+등록 블록)·index.html(+script 1줄) 변경 범위만 확인(이번 환경은 로컬 byte 대조 불가로 패치 검토로 대체). 실제 행 표시·매칭·카테고리 노출은 브라우저에서 최종 확인 권장

## v57 — 2026-06-21
- fix: Blob Storage 전용 가격 조회 함수(_resolve_Blob_Storage)를 추가해 청구 항목별로 올바른 미터를 매칭. 기존엔 전용 resolver가 없어 엔진 _genericResolve로 처리됐는데, 거기서 청구 항목(metric)을 전혀 쓰지 않아 어떤 항목을 골라도 같은 미터로 매칭되고, productName 매핑('Hot Block Blob' 등)이 실제 API에 없어('General Block Blob v2'가 실제) 매칭이 안 됐음
- 매칭 방식: skuName("<계층> <중복성>", 예 'Hot LRS')로 계층+중복성을 묶고, meterName 키워드로 청구 항목을 가름 — Data Stored→'data stored'(GB/Month, tierMinimumUnits=0 우선), Read Operations→'read operations'(10K), Write Operations→'write operations'(10K), Data Retrieval→'data retrieval'(GB). 'priority' 계열(Archive Priority)은 제외
- 월 비용 = 단가 × Qty × usage(엔진 기본 계산). 저장은 usage에 GB, 작업은 usage에 "1만 건 수"를 입력. 절약/예약은 저장소 단가에 적용 안 함. 못 찾으면 "매칭 실패" 표시(예: Hot의 Data Retrieval, Archive의 ZRS 등은 미터가 없어 정상적으로 매칭 실패)
- 가격: 모두 API 응답에서 동적 조회(하드코딩 없음)
- 영향 파일: js/services/blob-storage.js, CHANGELOG.md
- 검증: koreacentral 라이브 API로 실제 productName/skuName/meterName/단위 확인. node --check 통과. 실데이터 조합별 선택 검증(Hot LRS Data Stored $0.02 GB/Month, Hot LRS Read $0.004 10K, Hot LRS Write $0.05 10K, Hot LRS Retrieval 매칭 실패, Cool GRS Data Stored $0.0254, Cold ZRS Retrieval $0.03, Archive LRS Data Stored $0.002, Archive ZRS 매칭 실패). 커밋본과 로컬 정답본 byte 동일 확인(sha256 일치). 실제 행 표시는 브라우저에서 최종 확인 권장

## v56 — 2026-06-21
- fix: VPN Gateway "VNET 간" 데이터 전송 비용이 koreacentral에서 조용히 0원으로 누락되던 버그 수정. isVnetOut 송신 판정에 egress/outbound/단어 'out'을 포함하고 vnet 계열 판정에 'virtual network peering'을 추가 → 'Global Virtual Network Peering / Inter-Region Egress'($/GB) 미터를 "VNET 간" 송신으로 매칭(수신 Ingress·인터넷 Data Transfer Out은 제외)
- fix: "VNET 간"을 입력했는데 매칭 미터가 없으면 vnetItem=null로 비용이 조용히 0원 처리되고 상태가 ok로 표시되던 것을, vnetFailed 플래그로 상태를 error("VNET 간 데이터 전송 미터 매칭 실패")로 노출하도록 변경
- 표기: VNET 매칭 시 적용 미터명과 단가($/GB, API 실시간 값)를 상태창에 함께 표시 → 같은 리전 전용 미터가 없어 리전 간 피어링 송신 미터가 적용됐음을 투명하게 안내
- 참고: VPN Gateway 서비스에는 데이터 전송 미터가 없고, koreacentral에는 같은 리전 VNet-to-VNet 전용 미터가 존재하지 않음(후보는 모두 리전 간 미터: Global VNet Peering Inter-Region Egress/Ingress $0.09, Bandwidth Inter-Region Data Transfer $0.08)
- 가격: 모두 API 응답에서 동적 조회(하드코딩 없음)
- 영향 파일: js/services/vpn-gateway.js, CHANGELOG.md
- 검증: koreacentral 라이브 API 조회로 후보 미터 확인. node --check 통과. 보강된 isVnetOut 실데이터 검증(Inter-Region Egress만 매칭, Ingress·인터넷 송신·Bandwidth 전송은 모두 비매칭). 커밋본과 로컬 정답본 byte 동일 확인(sha256 일치). 실제 행 표시·매칭 실패 메시지는 브라우저에서 최종 확인 권장

## v55 — 2026-06-21
- fix: AKS "SLA and Long Term Support"(LTS)가 항상 매칭 실패하던 버그 수정. _aks_pickGradeHourly의 looksCluster 키워드 게이트에 long term / long-term 추가(LTS 미터명 "Standard Long Term Support"에 cluster/management/uptime/sla가 없어 탈락하던 것이 원인)
- fix: AKS Automatic 관리요금이 표준 SLA 미터($0.10/h)로 잘못 조회되던 문제 수정. Automatic 전용 미터(productName "...- Automatic" + meterName "...Control Plane" = "Automatic Hosted Control Plane")를 조회하는 'automatic' 등급 경로 신설. resolve에서 Automatic이면 grade='automatic'. 공식 계산기 Automatic 클러스터관리(월 약 17.5만원, 약 $0.16/h)와 일치
- docs(주석): 헤더의 "Automatic 전용 관리요금 미터는 비공개" 설명을 사실(Automatic Hosted Control Plane 미터 존재)에 맞게 정정
- 가격: 세 등급 모두 Azure Retail Prices API 응답에서 동적 조회(하드코딩 없음). 오늘자 koreacentral 단가는 표준 SLA $0.10/h, LTS $0.60/h, Automatic Hosted Control Plane $0.16/h
- 영향 파일: js/services/aks.js, CHANGELOG.md
- 검증: koreacentral 라이브 API 조회로 미터명/단가 확인(셋 다 serviceName 'Azure Kubernetes Service' 한 번의 조회로 포함). node --check 통과. 실데이터로 _aks_pickGradeHourly 등급별 선택 검증(standard→Standard Uptime SLA $0.10, premium→Standard Long Term Support $0.60, automatic→Automatic Hosted Control Plane $0.16). 커밋본과 로컬 정답본 byte 동일 확인(sha256 일치). 실제 행 표시는 브라우저에서 최종 확인 권장

## v54 — 2026-06-16
- feat: AKS 계층을 "Standard(표준) / Automatic" 2종으로 개편(기존 Free/Standard/Premium에서 변경)
- feat: 표준을 고른 경우에만 SLA 옵션(No SLA (free, non-production) / SLA / SLA and Long Term Support)을 추가로 노출. Automatic이면 SLA 옵션 숨김(Azure 계산기 화면과 동일한 동작)
- 가격(모두 API 실시간 조회, 하드코딩 없음): 표준+No SLA=0원, 표준+SLA=표준 SLA 클러스터관리 미터, 표준+SLA and Long Term Support=LTS 미터, Automatic=표준 SLA 미터로 조회(Automatic 전용 관리요금 미터는 비공개이며 노드는 컴퓨팅 사용량 기준 별도 청구 → VM 행으로 추가)
- 구현: aks.js step에 slaOption 추가 + _aks_applyStepVisibility로 계층에 따라 _hidden 토글. instanceParentKey='aksTier'로 계층 변경 시 패널 재렌더. 서비스 정의에 _applyStepVisibility 훅을 두고, ui renderConfigPanel이 패널을 그리기 직전 현재 행 기준으로 호출(여러 AKS 행 전환 시에도 정확)
- 영향 파일: js/services/aks.js, js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: node --check 통과(aks.js, ui). ui는 renderConfigPanel에 한 줄(서비스별 _applyStepVisibility 훅 호출) 추가, 다른 서비스는 훅이 없어 영향 없음. 가격 하드코딩 없음. 커밋본과 로컬 정답본 byte 동일 확인. 실제 API 미터 매칭(표준 SLA ~0.10/h, LTS ~0.60/h per cluster)·Automatic 청구는 prices.azure.com 직접 호출이 이 환경에서 막혀 브라우저에서 최종 확인 필요

## v53 — 2026-06-11
- feat: 새 서비스 "Azure Kubernetes Service (AKS)" 추가 — 클러스터 관리(컨트롤 플레인) 요금 계산
- 구조: AKS 행은 클러스터 관리 요금만 계산. 노드(워커 VM)와 디스크는 기존 Virtual Machine / Disk 행으로 따로 추가(Azure 계산기와 동일하게 비용 항목이 분리됨)
- 계층 옵션: Free(무료, SLA 없음) / Standard(SLA) / Premium(LTS). Free는 0원, Standard·Premium은 Azure Retail Prices API의 'Azure Kubernetes Service'에서 클러스터당 시간당 요금을 실시간 조회(가격 하드코딩 없음). 매칭 실패 시 "매칭 실패" 표시
- 가격 표시: 용량제(시간환산 단가, _billingMode='monthly')에 클러스터관리요금×사용량(Hours)×Qty(클러스터 수)를 월 비용으로 표시. 절약/예약은 클러스터 관리 요금에 적용되지 않아 비움
- 신규 서비스 4단계: js/services/aks.js 생성 + window._svcDefs 등록 + index.html script(vm.js 다음) 추가 + SERVICE_CATEGORY_ORDER에 등록(VM 다음)
- 영향 파일: js/services/aks.js(신규), index.html, js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: node --check 통과(aks.js, ui). 함수명(_buildDetail_Azure_Kubernetes_Service / _resolve_Azure_Kubernetes_Service)이 resolver-engine 규칙(공백→_)과 일치. 로드 순서상 aks.js가 service-categories.js보다 앞. 커밋본과 로컬 정답본 byte 동일 확인. AKS 관리 요금의 실제 API 미터명 매칭은 prices.azure.com 직접 호출이 이 환경에서 막혀 브라우저에서 최종 확인 필요(참고 확인치: Standard ~0.10/h, Premium ~0.60/h per cluster)

## v52 — 2026-06-11
- feat: 표 아래 도구 영역에 "⊕ 전체 채우기"·"전체 지우기" 버튼 추가 — 모든 행을 한 번에 일괄 처리
- 전체 채우기(_fillAllEmptyGroups): 용량제 값이 있는 모든 행의 비어 있는 절약 1·3년·예약 1·3년 그룹에 용량제(PAYG) 값을 복사해 채움(수동). 원본 API 값이 있는 그룹은 건드리지 않음. 처리 결과(채운 행/그룹 수, 용량제 없는 행 제외 수)를 상태창에 표시
- 전체 지우기(_clearAllManualFills): _manualFill 표시가 달린 수동 입력 값만 모든 행에서 제거. 용량제와 원본 API 값은 그대로 보존
- 기존 행별 ⊕ 버튼·더블클릭 토글 로직(v50)을 그대로 재사용. css 미변경(기존 .btn/.btn-secondary 사용)
- 영향 파일: index.html, js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: node --check 통과. 신규 DOM id(btnFillAll, btnClearAll) ↔ getElementById 일치 확인. 가격/조회 로직 미변경(채움 값은 용량제 복사, 하드코딩 없음). 커밋본과 로컬 정답본 byte 동일 확인. 실제 일괄 채움/지움은 브라우저에서 확인 권장

## v51 — 2026-06-10
- feat: [Remark] 안내를 첫 진입 시 팝업으로 표시. 팝업 상단에 닫기(✕), 하단에 "오늘 하루 보지 않기"·"닫기" 버튼 제공
- feat: "오늘 하루 보지 않기"는 같은 브라우저에 당일만 기억(localStorage, 날짜 키). 다음 날 다시 표시. 본문에는 "안내 다시 보기" 버튼 추가
- feat: Remark 내용을 단일 소스(REMARK_ITEMS)로 통합 — 본문 목록과 팝업이 같은 배열을 렌더링하므로 한 곳만 수정하면 둘 다 반영
- feat: 본문 Remark 폰트 확대(12→14px, 제목 15px)로 가독성 개선
- feat: 팝업은 내용 길이에 따라 자동 크기 조절(width min(720px,92vw), 최대 높이 85vh, 길면 본문만 스크롤)로 잘림 방지
- 영향 파일: index.html, css/main.css, js/core/remark.js(신규), CHANGELOG.md
- 검증: node --check 통과. 신규 파일 js/core/remark.js를 index.html 로드 순서(8번)에 등록. index.html의 신규 DOM id(remarkList, remarkModalList, remarkModalOverlay, btnRemarkClose, btnRemarkCloseFoot, btnRemarkHideToday, btnRemarkOpen) ↔ getElementById 일치 확인. 가격/조회 로직 미변경. 커밋본과 로컬 정답본 byte 동일 확인. 실제 팝업 표시·하루 숨김은 브라우저에서 확인 권장

## v50 — 2026-06-09
- feat: 각 행 Action에 "빈 칸 채우기(⊕)" 버튼 추가 — 비어 있는 절약 1·3년, 예약 1·3년 그룹에 용량제(PAYG) 값을 복사해 채움(수동)
- feat: 수동으로 채운 셀은 배경색(cell-fill, 앰버)으로 구분 표시
- feat: 채운 가격 셀을 더블클릭하면 해당 그룹(Unit/Monthly/Year 3칸)이 채움↔빈칸으로 토글. 채움/빔은 항상 그룹 단위(3칸 동시)로 동작
- 보호: 채우기/토글/제거는 _manualFill 표시가 달린 수동 항목에만 작용. 용량제와 "원래 API로 값이 들어온 그룹"은 어떤 동작에도 변경·삭제되지 않음. 용량제 셀은 더블클릭/채우기 대상에서 제외
- fix(표기): 헤더 5개 그룹의 "1 Year cost" → "1 Year Cost"(엑셀 내보내기 열 라벨도 동일 통일)
- UX: 가격 셀 클릭은 더 이상 옵션 패널을 열지 않음(더블클릭 토글과의 충돌 방지). 옵션은 ⚙ 또는 SKU 셀 클릭으로 진입. Action 열 폭 74→100px(버튼 4개 수용)
- 영향 파일: index.html, js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: node --check 통과. 셀 td 인덱스(payg 9~11 제외, sp1 12~14·sp3 15~17·ri1 18~20·ri3 21~23) ↔ 더블클릭 매핑 일치. cell-fill 클래스는 기존 css에 이미 존재(재사용, css 미변경). 커밋본과 로컬 정답본 byte 동일 확인. 실제 채움/토글/색상은 브라우저에서 확인 권장
- 참고: 수동 채움은 화면상의 보조 표시이며, 해당 행을 다시 계산(통화 변경, 옵션 확인 등)하면 API 원본 기준으로 다시 그려져 수동 채움이 초기화될 수 있음

## v49 — 2026-06-09
- fix: "엑셀 내보내기" 저장 방식을 폴더 선택(showDirectoryPicker) → 파일 저장 위치 선택(showSaveFilePicker)으로 변경
- 배경: 폴더 선택 창에서 존재하지 않는 폴더 이름을 입력하면 "경로가 없습니다" 오류가 발생(스크린샷). 파일 탐색기에서 위치·파일명을 정해 저장하는 익숙한 방식으로 교체
- 동작: 엑셀 저장 위치를 고르면 CSV는 같은 폴더에 같은 이름으로 자동 저장 시도(getParent 지원 시), 안 되면 CSV 저장 창을 한 번 더 표시(엑셀과 같은 폴더에서 시작). 모든 단계에서 오류·취소 시 해당 파일은 다운로드로 폴백해 반드시 저장
- 영향 파일: js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: node --check 통과. 가격/엑셀 생성 로직 미변경(저장 경로 처리만 교체, showDirectoryPicker 제거). 커밋본과 로컬 정답본 byte 동일 확인. 실제 저장 동작은 브라우저(Chrome/Edge)에서 확인 권장

## v48 — 2026-06-09
- feat: "엑셀 내보내기"를 누르면 같은 이름(base)의 CSV 파일도 함께 생성. CSV는 "CSV 불러오기" 양식과 동일해 재업로드로 견적 복원 가능
- feat: 저장 위치 지정 — File System Access API(showDirectoryPicker) 지원 브라우저(Chrome/Edge)는 폴더 선택 후 두 파일 저장, 미지원 시 기존 다운로드 방식으로 자동 폴백
- feat: 경고 가독성 개선 — error 상태배지 폰트/여백 확대(11→13px, 테두리 추가) + 화면 상단 중앙 토스트 알림(15px) 추가. setStatus('error') 시 자동 노출
- docs: README 5번 항목 갱신(엑셀+CSV 동시 저장/폴더 선택), 6번 항목 오타(컰럼→컬럼) 수정
- 영향 파일: js/ui-and-bootstrap.js, css/main.css, README.md, CHANGELOG.md
- 검증: node --check 통과. 가격 매칭 로직 미변경(내보내기/알림/스타일만). 커밋본과 로컬 정답본 byte 동일 확인. 실제 저장 동작·토스트는 브라우저에서 확인 권장

## v47 — 2026-06-09
- feat: ZRS 미지원 리전에서 디스크(표준 SSD·프리미엄 SSD) 가격 조회가 0건일 때, 막연한 "매칭 실패" 대신 "이 리전에서 ZRS 미제공일 수 있음 - 중복성을 LRS로 바꿔 보세요" 안내 메시지 표시
- 배경: ZRS 관리 디스크는 가용성 영역이 있는 리전에서만 제공됨(예: Korea Central 지원, Korea South 미지원). 미지원 리전에서 ZRS를 고르면 가격이 비어 혼란스러웠음. 없는 가격을 지어내지 않고(하드코딩 없음) 원인·해결법만 안내
- 영향 파일: js/services/disk.js, CHANGELOG.md
- 검증: node --check 통과. 매칭 로직·LRS 경로 미변경(에러 메시지 분기에 ZRS 조건 1줄씩, 표준/프리미엄 각각 추가, 삭제 0줄). 커밋본과 로컬 정답본 byte 동일 확인. 실제 메시지 노출은 브라우저에서 ZRS×미지원 리전으로 확인 권장

## v46 — 2026-06-09
- feat: CSV 양식 다운로드 + CSV 불러오기(일괄 입력) 기능 추가. 1차 지원 서비스 = Virtual Machine, Disk, VPN Gateway
- feat: SKU를 별도 열로 분리(컬럼: Region, 분류, ServiceCategory, SKU, Qty, Hours, Options). 업로드 시 SKU 열을 서비스별 옵션 키로 매핑(VM=instance, Disk=diskInstance, VPN=sku). 프로비저닝형 디스크는 SKU 비움
- feat: 양식 파일 하단에 옵션 사전(허용값)을 코드 정의(_svcDefs, VM_INSTANCE_CATALOG, DISK_CATALOG)에서 자동 생성해 # 주석으로 포함. 업로드 시 # 줄/빈 줄 무시
- 안전장치: 지원 외 ServiceCategory 또는 미지원 Region 행은 건너뛰고 요약에 제외 건수 표시. 옵션 미일치는 가짜 숫자 없이 기존 resolver의 미매칭 처리로 위임(하드코딩 없음)
- 영향 파일: index.html, js/ui-and-bootstrap.js, CHANGELOG.md, README.md
- 검증: node --check 통과(ui-and-bootstrap.js). DOM id(btnCsvTemplate/btnCsvImport/fileCsvImport) ↔ getElementById 일치 확인. 실제 업로드 동작·가격 조회는 prices.azure.com 직접 호출이 이 환경에서 막혀 브라우저에서 최종 확인 필요

## v45 — 2026-05-29
- fix: VM 유형(SQL Server/BizTalk) 라이선스가 "미매칭"으로 가산되지 않던 문제 수정
- 원인: 라이선스 미터는 리전 비종속(global)인데 armRegionName=리전 필터를 넣어 조회 결과가 0건이었음
- 조치: 라이선스 조회에서 armRegionName 제거 + productName 정확 매칭 실패 시 전체 라이선스 목록 키워드 폴백 추가, 매칭된 vCPU 구간을 상태창에 표시
- 영향 파일: js/services/vm.js, CHANGELOG.md
- 검증: node --check 통과. 계산기 대조 — Compute(507,726.41)+OS Windows(395,854.49)는 v44에서 이미 일치, 누락됐던 SQL Software(약 3,227,074.66/월) 가산 시 합계가 계산기(4,130,655)와 거의 일치. 실제 구간 매칭은 브라우저에서 최종 확인 필요

## v44 — 2026-05-29
- feat: VM 옵션에 "유형(swType)" 추가 — (OS Only) / SQL Server(Enterprise·Standard·Web) / BizTalk Server(Enterprise·Standard). Azure 계산기처럼 선택 가능
- feat: SQL Server·BizTalk 선택 시 라이브 API "Virtual Machines Licenses"의 vCPU 구간 단가를 컴퓨팅 가격(PAYG·절약·예약 전부)에 가산. 구간 미매칭 시 가산하지 않고 상태창에 "미매칭" 표시 (하드코딩 없음, 안전 폴백)
- refactor: 라벨을 계산기 표현에 맞춤 (운영체제 → 운영 체제, 시리즈 → 인스턴스 시리즈)
- 영향 파일: js/services/vm.js, CHANGELOG.md
- 검증: node --check 통과. prices.azure.com이 이 환경에서 직접 호출 불가하여 SQL 구간 매칭 정확도는 브라우저에서 검증 필요

## v43 — 2026-05-29
- docs: README "기술 정보"의 CORS 폴백 목록을 실제 설정과 일치시킴