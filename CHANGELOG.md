# Changelog

버전 번호는 정수 체계(vNN)를 따릅니다. 새 버전을 맨 위에 추가합니다.

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
