# Changelog

버전 번호는 정수 체계(vNN)를 따릅니다. 새 버전을 맨 위에 추가합니다.

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
