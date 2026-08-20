# Changelog

버전 번호는 정수 체계(vNN)를 따릅니다. 새 버전을 맨 위에 추가합니다.

## v128 — 2026-08-20
- feat/fix: **Azure OpenAI 배포 유형** · **무료 허용량 차감** · **ML 워크스페이스 0원 항목**. 기존 견적서를 이 도구로 옮길 때 막히던 지점들을 걷어내면서 **GPT-5 계열 단가 2배 과다 산정 버그**를 함께 잡았다
- **fix ⚠️ Azure OpenAI GPT-5 계열이 표준 단가의 2배로 계산되고 있었다** (`services/azure-openai.ts`) — API 의 `pp` 접두 미터는 **우선 처리(Priority Processing)** 로 표준의 정확히 2배다(koreacentral GPT-5 입력: 표준 `GPT 5 Inpt Glbl` 1,809.1875 vs `5 pp inp Gl` 3,618.375). 예전 카탈로그가 GPT-5·5 mini·5.1·5.2 를 **pp 미터로 하드코딩**해 두어 네 모델 전부 2배였다. 이제 base 를 `gpt 5…` 로 잡아 표준 미터만 매칭한다(pp 는 범위 외)
- **feat Azure OpenAI `deploymentType` 옵션 신설** — 같은 모델·같은 토큰이라도 배포 유형별로 미터와 단가가 다르다(japaneast GPT-4.1 mini 입력: Global `0.5789/1K` vs Regional `0.7005/1K` = 1.21배). 예전에는 Global 미터 이름을 통째로 하드코딩해 Data Zone·Regional·Batch 를 **고를 수조차 없었고**, 리전에 그 유형이 없으면 조용히 매칭 실패했다. `Global | Data Zone | Regional | Batch Global | Batch Data Zone | Batch Regional` 6종
- **매칭 방식을 카탈로그 → 문법 해석으로 바꿨다** — skuName = `<모델 base> + [pp] [batch] + <토큰 종류> + <배포 유형 꼬리>`. API 표기가 리전·모델마다 제각각이라(`glbl/global/Gl/glb` · `DZ/Dz/dzone/DataZone/Data Zone` · `regnl/rgnl/regional` · `Inp/Input/Inpt` · `Outp/Out/Opt/Outpt` · `cached/cd/cchd/ccchd`) 각 자리를 동의어 집합으로 받는다. **모르는 토큰이 하나라도 남으면 후보에서 뺀다** — 미세 조정(`ft`·`dev ft`·`rft`·`training`·`hosting`)이나 하위 모델(`mini`·`nano`·`pro`·`chat`·`codex`) 미터가 base 접두사만 같다는 이유로 섞여 드는 것을 막는 장치다
- **매칭 실패 시 그 리전에서 고를 수 있는 배포 유형을 알려 준다** — `koreacentral` 은 GPT-4.1 mini=Global 만, text-embedding-3-small=Data Zone 만 있는 식으로 편차가 커서, 실패 메시지에 `이 리전에서 고를 수 있는 배포 유형 → Global, Batch Global` 을 붙인다
- 모델 목록 보완: **GPT-5 nano · GPT-5 pro · GPT-5 codex · GPT-5 chat · GPT-5.1 chat · GPT-5.2 chat · GPT-5.2 pro** 추가(15 → 22종)
- **feat 무료 허용량 차감** (`services/azure-devops.ts`, `ui-and-bootstrap.js`) — Retail Prices API 는 조직 무료 한도를 단가에 반영하지 않아(Basic 사용자 8,684.1원 단일 단가) 그대로 곱하면 과다 산정된다. resolver 가 `paygItem._freeUnits` 를 실어 보내고 `calcGroup` 이 **과금 수량 = max(0, Qty × Hours − 무료 수량)** 으로 계산한다. Basic 사용자 첫 5명 / MS-hosted·Self-hosted 병렬 작업 첫 1개 / Artifacts 첫 2GB. 예) Basic 10명 86,841원 → **43,420.5원**
  - Qty·Hours **둘의 곱**에서 빼므로 어느 칸에 수량을 넣든 같게 동작한다
  - 무료 한도는 **조직 단위**라 다른 프로젝트가 이미 쓰는 경우가 있다 → `freeTier=미차감 (전량 과금)` 으로 끌 수 있다(기본은 차감)
  - Unit Price 는 API 값 그대로 두고 월비용에서만 뺀다(단가의 출처를 흐리지 않기 위해)
- **feat Azure ML `워크스페이스 (무료 · 과금 미터 없음)` 청구 항목** (`services/azure-ml.ts`) — 워크스페이스를 과금하는 미터는 API 에 **존재하지 않는다**(전 리전에서 meterName 에 `workspace` 가 든 미터 0건, koreacentral 은 vCPU/GPU Surcharge 10건이 전부). 논리적 컨테이너라 보유만으로는 요금이 붙지 않고 비용은 전부 딸린 리소스로 청구되기 때문이다. 그래서 원본 견적서에 "ML Workspace" 항목이 있어도 적을 자리가 없어 **"반영 불가"로 빠졌다**. 이제 API 를 조회하지 않고 0원 항목으로 남겨 원본 항목 수와 행 수를 맞춘다. 상태 표시줄에 어느 카테고리로 나눠 적어야 하는지(VM·Blob·ACR·Log Analytics·Key Vault) 근거를 남긴다
- **Elasticsearch** — 여전히 Retail Prices API 에 단가가 없다(Azure Marketplace SaaS). 자체 구축 모델링을 실제로 쓸 수 있게 양식에 `Elasticsearch 노드 3대`(VM `E8s_v5` ×3) + `Elasticsearch 데이터 디스크`(Disk `P20`) 예시 행을 넣고 안내를 붙였다
- CSV 양식: 예시 행 6개 추가·4개 갱신(OpenAI 3행에 `deploymentType`, Batch 예시, ML 워크스페이스, DevOps `freeTier`, Elasticsearch VM+Disk) + 배포 유형·무료 허용량·워크스페이스 안내 절 추가, `azure-quote-template_file.csv` 재생성
- 안내(Remark) 3줄 추가 — OpenAI 배포 유형 · DevOps 무료 한도 · Elasticsearch/Workspace 미지원
- **테스트**: `azure-openai-deployment.test.js` 신규 7종(녹화 픽스처 `azure-openai.json` — koreacentral·japaneast 245건. 표기 동의어 해석, 남의 미터 배제, pp 배제, 배포 유형별 단가 차이, Batch 절반, 리전에 없는 유형 안내), `free-allowance.test.js` 신규 7종, `platform-services-resolve.test.js` 에 워크스페이스 1종 추가
- **검증(라이브 API · KRW)**: 양식 123행 전부 매칭. koreacentral·japaneast·eastus 3개 리전에서 22개 모델 × 3 배포 유형 × 3 토큰 종류를 실 API 로 해석해 오분류 0건 확인
- 영향 파일: src/services/azure-openai.ts, src/services/azure-ml.ts, src/services/azure-devops.ts, src/ui-and-bootstrap.js, src/ui/csv-template.js, src/core/remark.js, azure-quote-template_file.csv, test/azure-openai-deployment.test.js(신규), test/free-allowance.test.js(신규), test/fixtures/azure-openai.json(신규), test/platform-services-resolve.test.js, README.md, CHANGELOG.md
- 검증: `npm test` **148 pass / 9 skip**, `tsc --noEmit` 0, `vite build` 성공

## v127 — 2026-08-20
- feat: **플랫폼·거버넌스 서비스 5종 신설** — Microsoft Fabric · Azure Monitor · Azure Key Vault · GitHub · Azure Machine Learning. 기존 견적에서 "대응 ServiceCategory 가 없어" 옮기지 못하던 항목을 드롭다운·CSV 양식에서 그대로 추가할 수 있다
- **Microsoft Fabric** (`services/fabric.ts`) — Retail Prices API 에는 **F64 한 줄 미터가 없다**. 공시 단가가 **CU 시간**뿐이고 그마저 워크로드별(Power BI·Spark·Data Warehouse·Eventhouse…) 미터로 쪼개져 나온다(koreacentral 92건이 전부 같은 값). 그래서 productName='Fabric Capacity' & meterName 이 `… Capacity Usage CU` 로 끝나는 **유료 미터의 최빈 단가**를 기준 CU 단가로 잡고 F SKU 의 CU 수를 곱한다(F64 → ×64). 초과분(`Capacity Overage`)·서버리스(`… Serverless Usage CU`)는 기준에서 제외. 예약은 `Fabric Capacity Reservation` 1·3년을 시간당 환산 후 ×CU. OneLake 저장소(Hot/Cool/Cold·캐시·BCDR·SQL·미러링)는 별도 청구 항목으로 분리(`metric` 2단 구성)
- **Azure Monitor** (`services/azure-monitor.ts`) — 이 서비스는 **productName 이 전부 `Azure Monitor` 한 값**이고 청구 항목 묶음이 **skuName** 에 들어 있다(다른 서비스와 반대). 그래서 매칭 축을 `skuName + meterName` 으로 잡았다. 항목이 200건 넘어 **그룹(메트릭/경고/로그/약정 계층/웹 테스트) → 청구 항목** 2단으로 나눈다. 국가코드별 SMS·Voice 미터(대부분 0원)는 제외
- **Azure Key Vault** (`services/key-vault.ts`) — 계층(Standard/Premium/Managed HSM)에 따라 청구 항목이 갈린다. Premium 전용 HSM 보호 키(RSA 2048·고급 키), Managed HSM 은 productName='Key Vault HSM Pool' 의 시간당 인스턴스 미터
- **GitHub** (`services/github.ts`) — **리전 비종속(Global)** 이라 Azure DevOps 와 같이 armRegionName 필터 없이 조회한다. Enterprise·Copilot(Business/Enterprise/Premium Request)·Advanced Security·Code/Secret Scanning·Code Quality·Actions 실행(분)·Storage·Codespaces·Bandwidth 21종
- **Azure Machine Learning** (`services/azure-ml.ts`) — **워크스페이스 자체는 무료**이고 관리형 컴퓨팅은 같은 VM SKU 요금이라, 컴퓨팅은 `Virtual Machine` 행으로 적고 이 카테고리에는 그 위에 붙는 **추가 요금(Surcharge)** 만 넣는다. 리전·SKU 에 따라 0원인 경우가 많아 **0원 조회를 매칭 실패로 다루지 않는다**(상태 표시줄에 근거를 남긴다)
- **미지원 명시** — Elastic Cloud(Elasticsearch)는 Azure Marketplace SaaS 라 Retail Prices API 에 단가가 없다. 양식 주석·README 에 "자체 관리형이면 VM+Disk 행, 관리형이면 Elastic 견적을 옮겨 적으라"고 안내
- CSV 양식 예시 행 14개 추가(Fabric F64/F2/OneLake 5TB, Monitor 메트릭·경고·기본 로그·약정, Key Vault 작업/HSM 키/Managed HSM, GitHub GHE·Copilot·Actions, Azure ML vCPU·GPU) + 사용량 단위·조건부 옵션·글로벌 서비스 안내 갱신, `azure-quote-template_file.csv` 재생성
- **테스트**: `platform-services-resolve.test.js` 신규 20종(녹화 픽스처 5개 — Fabric CU 배수·초과분 미터 배제·OneLake 대소문자 혼용 매칭, Monitor 의 skuName 조회 축·그룹 전환 시 항목 교체, Key Vault 계층 전환 대체, GitHub 동명 미터의 제품군 분리·리전 필터 미사용, ML 0원 미터). `live-smoke.test.js` 에 5종 계약 검증 추가
- **검증(라이브 API · KRW · koreacentral)**: 양식 예시 14행을 엔진 경로 그대로 조회 — Fabric F64 `CU 303.9435 × 64 = 19,452.384/h` (RI 1·3년 `11,568.2258/h`), F2 가 정확히 1/32, OneLake Hot `36.18375 /GB·월`, Monitor 약정 100GB/일 `382,968.81 /Day`·경고 5분 `217.1025 /Month`, Key Vault Managed HSM `4,631.52/h`, GHE 사용자 `30,394.35/Month`, Actions Linux `8.6841/분`, ML GPU 추가요금 `159.2085/h`·vCPU `0` — 14행 전부 매칭
- 영향 파일: src/services/fabric.ts(신규), src/services/azure-monitor.ts(신규), src/services/key-vault.ts(신규), src/services/github.ts(신규), src/services/azure-ml.ts(신규), src/services/all.js, src/ui/service-order.js, src/ui/csv-template.js, azure-quote-template_file.csv, test/platform-services-resolve.test.js(신규), test/fixtures/{fabric-koreacentral,azure-monitor-koreacentral,key-vault-koreacentral,github-global,azure-ml-koreacentral}.json(신규), test/live-smoke.test.js, README.md, CHANGELOG.md
- 검증: `npm test` **133 pass / 4 skip**, `RUN_LIVE=1` 라이브 스모크 8 pass, `tsc --noEmit` 0, `vite build` 성공

## v126 — 2026-08-07
- fix/feat: **정렬 UI 다듬기** — 헤더 글자 가림 해소 · 원본 보기 버튼 상단 이동 · 정렬 상태 상시 표시
- **① 헤더 글자가 안 보이던 문제** — 활성 열에 `background: rgba(255,255,255,0.20)` 를 덮었더니 남색·초록 헤더 위 흰 글자의 대비가 무너져 내용이 읽히지 않았다. 배경 덮기를 **제거**하고, 활성 표시는 **헤더 아래쪽 노란 강조선(3px)** 과 **또렷해진 ▲▼** 로만 한다(비활성은 흐린 `⇅`)
- **② `↺ 원본 데이터 순으로 보기` 버튼을 상단 툴바로 이동** — 표 아래 "행 추가" 옆에 있던 것을 상단으로 옮기고 **항상 노출**한다(정렬 중에만 나타나 찾기 어려웠다). 이미 원본 순서면 눌러도 아무 일도 하지 않는다
- **③ 정렬 상태를 상시 표시** — 사라지는 상태 메시지(`정렬: …`)를 없애고, 상단에 **`현재 'Qty' 열 오름차순으로 보는 중`** 칩을 정렬이 풀릴 때까지 계속 띄운다(`sortStatusText()`)
- **검증(브라우저)**: 정렬 전후 헤더 배경 `rgb(48,84,150)`·글자 `rgb(255,255,255)` **불변**(대비 유지), 강조선만 `rgb(255,217,102)` 로 켜짐 · 표시자 `⇅` → `▲` → `▼` · 상단 버튼이 header 안·표보다 위에 위치 · 칩 문구가 오름/내림에 따라 바뀌고 원본 복귀 시 숨겨짐 · 하단에 버튼 잔존 없음
- **테스트**: `table-sort.test.js` 에 2종 추가(상시 표시 문구·원본일 때 빈 문자열)
- 영향 파일: index.html, css/main.css, src/ui/table-sort.js, src/ui-and-bootstrap.js, test/table-sort.test.js, README.md, CHANGELOG.md
- 검증: `npm test` **113 pass / 4 skip**, `tsc --noEmit` 0, `vite build` 성공

## v125 — 2026-08-07
- feat: **조회 완료 시 진행 팝업 자동 닫힘**. 전부 성공하면 읽을 내용이 없으므로 2초 카운트다운(`2초 후 자동으로 닫힙니다.`) 뒤 스스로 닫힌다
- **실패한 행이 있으면 자동으로 닫지 않는다** — 실패 목록을 읽어야 하므로. v122 에서 넣은 결과 표시를 그대로 살리기 위한 절충이다(닫기 버튼은 어느 경우든 즉시 누를 수 있다)
- 자동·수동 닫기를 `closeNow()` 로 합치고, 팝업 재사용·조회 오류 시 카운트다운 타이머가 남지 않도록 정리
- 검증(브라우저): 힌트가 `2초 → 1초 → 0초 후 자동으로 닫힙니다.` 로 바뀐 뒤 팝업이 닫히는 것 확인
- 영향 파일: src/ui/progress-modal.js, README.md, CHANGELOG.md

## v124 — 2026-08-07
- feat: **열 정렬 — 오름차순 / 내림차순 / 원본 순서**. 각 열 헤더 클릭으로 순환하며 ▲▼ 로 현재 상태를 표시한다
- **정렬 대상 22개 열**: Region·분류·Service Category·SKU·상세 사양·Qty·사용량(7) + 가격 5그룹 × Unit Price/1 Monthly Cost/1 Year Cost(15). 가격 열은 **계산된 값**(Qty·사용량 반영)으로 정렬한다
- **보기 전용 설계** — `src/ui/table-sort.js` 가 원본 `rows` 를 건드리지 않고 정렬된 **새 배열**을 돌려주고, `render()` 가 그걸 그린다. 그래서 "원본 형태로 보기"가 언제든 정확히 복원된다(헤더 3번째 클릭 또는 표 아래 `↺ 원본 순서로 보기` 버튼 — 정렬 중에만 노출)
- **정렬 규칙**: 값이 없는 행은 오름·내림 어느 쪽이든 항상 뒤로(빈 칸이 위로 몰리는 것 방지) · 값이 같으면 원본 순서 유지(안정 정렬) · Region 은 화면에 보이는 이름 기준
- **정렬 중 드래그 순서 변경 잠금** — 보이는 순서와 원본 순서가 달라 드롭 결과가 어긋난다. 시도하면 안내 메시지를 띄운다
- **엑셀·CSV 내보내기는 화면에 보이는 순서를 따른다**(`getViewRows()`). 정렬해 둔 대로 저장된다
- **테스트**: `table-sort.test.js` 신규 13종(원본 무변경·null 상태·텍스트/숫자 비교·가격 계산값 정렬·빈 값 뒤로·안정 정렬·Region 라벨 기준·3단 순환·미지정 키 무시·22열 존재)
- **검증(브라우저, 104행 견적)**: `qty`·`skuName`·`region`·`payg.monthly`·`ri3.year` 5개 열에서 **오름(asc) → 내림(desc) → 원본(복귀)** 3단 순환 및 행 `data-id` 순서 기준 **원본 정확 복원** 확인. `↺` 버튼 복원·버튼 자동 숨김·정렬 중 `draggable=false` 확인
- 영향 파일: index.html, css/main.css, src/ui/table-sort.js(신규), src/ui-and-bootstrap.js, src/ui/export-csv.js, test/table-sort.test.js(신규), README.md, CHANGELOG.md
- 검증: `npm test` **111 pass / 4 skip**, `tsc --noEmit` 0, `vite build` 성공

## v123 — 2026-08-07
- feat: **"＋ CSV로 견적 추가하기" 버튼** — 표 아래 "+ 행 추가" 왼쪽에 추가. CSV 행을 **지금 작성 중인 견적 뒤에 덧붙인다**(기존 행 유지, 교체 여부를 묻지 않음)
- 기존 상단 "CSV 불러오기"는 기존 행이 있으면 *교체/추가*를 묻는 동작 그대로 두고, 하단 버튼만 **항상 추가** 모드로 동작한다. 견적을 나눠 만들거나 부서·환경별 CSV 를 하나로 합칠 때 쓴다
- `_csvHandleUpload(file, {mode:'append'})` 로 모드를 받게 하고, 전용 파일 입력(`#fileCsvAppend`)을 별도로 뒀다. 진행 팝업 제목·완료 문구도 모드에 맞춰 `CSV로 견적 추가 — 가격 조회 중` / `…행 추가` 로 바뀐다
- **검증(브라우저 · Chrome CDP 실제 사용자 입력)**
  - 버튼 위치: `+ 행 추가` 의 **왼쪽**·같은 줄 (x 28 < 194) 확인
  - 기본 3행 상태에서 추가 → **3행 → 107행**, 가격표시 104, 확인창 0회, 팝업 제목 `CSV로 견적 추가 — 가격 조회 중` → `조회 완료`
  - 104행 견적에 다시 추가 → **104행 → 208행**, 가격표시 208, **기존 첫 3행 내용 그대로 유지**, 확인창 0회
- 영향 파일: index.html, src/ui/export-csv.js, README.md, CHANGELOG.md
- 검증: `npm test` **98 pass / 4 skip**, `tsc --noEmit` 0, `vite build` 성공

## v122 — 2026-08-07
- feat: **일괄 조회 진행 팝업** — 무엇을 조회 중인지 보여주고, 끝날 때까지 배경 조작을 막고, 완료 시 성공·실패 건수와 실패 목록을 남긴다
- **`<dialog>.showModal()` 사용** — 직접 만든 오버레이 대신 네이티브 모달이라 배경 클릭·포커스 이동·스크롤이 **브라우저 차원에서** 차단된다(키보드 접근성도 함께). 조회 중에는 Esc 로 닫히지 않도록 `cancel` 이벤트를 막고, 완료 후에만 닫기 버튼이 활성화된다
- **표시 내용**: 진행바 + `16 / 104` 카운트 + 현재 단계 문구 + **지금 조회 중인 항목 목록**(동시 실행이라 여러 건이 함께 뜬다. 예: `Virtual Machine · D4s_v5 (웹 서버(Linux))`). 재조회 라운드에서는 `빈칸 재조회 중... (2/3 회차)` 와 남은 행 수
- **완료 시**: 제목이 `조회 완료` / `조회 완료 (일부 실패)` 로 바뀌고 진행바 색이 초록·주황으로 구분된다. `조회 성공 101행 · 조회 실패 3행` 과 함께 **실패한 행 목록**을 보여준다. CSV 불러오기의 미지원 서비스·Region 제외 건수도 여기에 함께 싣는다
- **완료 alert 제거** — 결과가 팝업에 남으므로 기존 `alert()` 는 없앴다(확인 클릭 한 번이 줄고, 실패 목록을 바로 읽을 수 있다)
- 적용 경로: CSV 불러오기, 통화 변경 재조회(두 일괄 조회 경로 모두)
- `bulk-resolve.js` 는 DOM 을 모르는 순수 모듈로 두고 `ui/progress-modal.js` 가 감싼다(테스트 가능성 유지). 진행 중인 행은 `onProgress({active})` 로 전달
- **검증(브라우저 · Chrome CDP 실제 사용자 입력)**
  - 모달 열기 전 실제 클릭 → 행 3 → 4개 (배경 정상 동작, 대조군)
  - 조회 중 같은 좌표 실제 클릭 2회 + Esc → **클릭 무시·행 변화 없음·팝업 유지**, 포커스는 팝업 안에 갇힘
  - 완료 후 닫기 클릭 → 팝업 닫힘, 이후 배경 클릭 → 행 104 → 105개 (조작 복구)
  - 특정 SKU 조회를 끝까지 실패시킨 뒤: 제목 `조회 완료 (일부 실패)`, 카운트 `101 / 104`, `조회 성공 101행 · 조회 실패 3행` + 실패 3행 목록 표시 확인
- **테스트**: `bulk-resolve.test.js` 에 2종 추가(진행 중 행 목록 보고 · 재조회 라운드에서도 보고)
- 영향 파일: index.html, css/main.css, src/ui/progress-modal.js(신규), src/ui/bulk-resolve.js, src/ui/export-csv.js, src/ui-and-bootstrap.js, test/bulk-resolve.test.js, CHANGELOG.md
- 검증: `npm test` **98 pass / 4 skip**, `tsc --noEmit` 0, `vite build` 성공

## v121 — 2026-08-07
- feat: **일괄 조회가 끝난 뒤 남은 빈칸을 자동으로 재조회**(최대 3라운드). "모두 조회했는데 이따금 가격 칸이 비어 있다"는 문제에 대응
- 기존에는 재조회 장치가 없었다(예약 조회 1회 재시도가 `sql-database.ts` 에 있는 게 전부). 일괄 조회 중 섞이는 일시적 실패(프록시 전환·429 스로틀링·타임아웃)로 빈 채 남은 행은 사용자가 직접 다시 건드려야 했다
- **`src/ui/bulk-resolve.js` 신설** — 동시 실행 풀 + 빈칸 재조회를 한 곳으로 모았다. 라운드마다 지수 백오프(+지터)로 700ms→1.4s→2.8s 를 쉬어 일시적 실패가 가라앉을 시간을 준다. **한 라운드에서 하나도 못 건지면 조기 종료**해 무의미한 반복을 막는다
- **재조회가 싸게 끝나는 이유**: 확정적 실패(그 리전에 없는 SKU·옵션 조합 불일치)는 이미 캐시가 받아준다 — 응답이 0건이면 음성 캐시(v119, 60초), 응답은 왔는데 매칭만 실패했으면 `apiCache` 재사용. 즉 재조회의 네트워크 비용은 **일시적 실패 행에만** 발생한다
- **통화 변경 재조회도 같은 경로로 통일** — `ui-and-bootstrap.js` 의 통화 변경 처리가 아직 행을 하나씩 `await` 하는 순차 루프였다(v117 에서 CSV 경로만 고쳤음). 동시 실행 풀 + 빈칸 재조회를 함께 적용
- **결과 보고** — 완료 상태·alert 에 `104행 조회 완료` 또는 `102/104행 조회 완료 · 2행은 가격을 찾지 못했습니다 (재조회 3회 시도)` 를 표시한다. 예전에는 빈칸이 남아도 아무 안내가 없었다
- `isRowResolvable()` 을 `resolver-engine` 으로 추출 — "조회 가능한 행" 판정이 세 곳에 흩어져 있었고, 설정이 덜 된 행을 실패로 세지 않기 위해 필요하다
- **검증(브라우저 장애 주입)**: Chrome CDP `Fetch` 도메인으로 특정 SKU 5개의 조회를 **전 프록시에서 35건 실패**시킨 뒤 양식 104행을 불러왔다
  - 재조회 없음(v120): **99/104행** — 빈칸 5행이 그대로 남고 안내도 없음 (41.2초)
  - 재조회 있음(v121): **104/104행** — 전부 복구, alert 에 `104행 조회 완료` (23.2초)
- **테스트**: `bulk-resolve.test.js` 신규 9종(성공 시 재조회 안 함 / 빈칸만 재조회 / 최대 라운드 준수 / 조기 종료 / retryRounds=0 / 미설정 행 제외 / 진행 보고 / 요약 문구). 변이 테스트로 검증(재조회를 끄면 2종 실패)
- 영향 파일: src/ui/bulk-resolve.js(신규), src/ui/export-csv.js, src/ui-and-bootstrap.js, src/core/resolver-engine.ts, test/bulk-resolve.test.js(신규), CHANGELOG.md
- 검증: `npm test` **96 pass / 4 skip**, `tsc --noEmit` 0, `vite build` 성공. 정상 경로 소요는 4.0초 → 4.5초(빈칸이 없으면 재조회 라운드가 아예 돌지 않는다)

## v120 — 2026-08-07
- fix: **브라우저 실측에서 드러난 프로덕션 스로틀링(429) 문제**. 로컬에선 3.2초인 일괄 조회가 **배포 환경에서 161초·12행 미조회**로 무너졌다. v118 쿨다운이 이를 악화시키고 있었다
- **측정 방법**: Chrome 151 을 CDP 로 직접 구동(설치 없음)해 실제 파일 업로드(`DOM.setFileInputFiles`)로 양식 104행을 불러오고 완료 alert 까지를 측정. 브라우저의 호스트당 연결 수 제한이 그대로 반영된다
- **관측**: 개선 전(v116) 13.0초 → v119 3.2초(로컬, 같은 조건에서 `/api/prices` 함께 서빙). 그러나 **배포 프로덕션은 161.3초·요청 163건·92/104행만 가격 표시**. 프로덕션 프록시에 동시 요청을 넣어보니 동시 1~12건 구간에서 **429 (Too Many Requests)** 가 섞여 나왔다(Vercel 함수는 공유 IP 라 Azure API 스로틀링에 더 쉽게 걸린다)
- **원인**: ① 행 6레인 풀이지만 행마다 Consumption·Reservation 을 병렬로 던져 **실제 동시 요청은 12건**까지 뛴다 ② `429` 를 일반 실패로 처리해 **v118 쿨다운이 가장 빠른 경로(vercel-fn)를 60초 유배**시키고 느린 공개 프록시로 몰았다 ③ 그래서 요청 수가 92 → 163 건으로 불어나고 일부는 끝내 실패했다
- **① 업스트림 동시 요청 상한** — `network.ts` 에 세마포어(4건) 도입. 행 단위 레인 수와 무관하게 실제 나가는 요청을 묶는다(실측상 동시 3건까지는 429 없음). 대기 시간은 타임아웃 예산에 넣지 않는다
- **② 429/503 은 쿨다운 대상에서 제외** — "이 프록시가 고장났다"가 아니라 "잠시 뒤 다시"이므로, **같은 프록시로** 지수 백오프(+지터) 재시도(최대 3회). `Retry-After` 헤더가 있으면 그 값을 존중. 3회를 넘겨야 다음 프록시로 넘어간다
- **테스트**: `network-proxy-health.test.js` 에 5종 추가 — 429 시 같은 프록시 재시도 / 쿨다운 대상 아님 / 계속되면 다음 프록시로 / `Retry-After` 존중 / 동시 요청 4건 상한
- 영향 파일: src/core/network.ts, test/network-proxy-health.test.js, CHANGELOG.md
- 검증: `npm test` **87 pass / 4 skip**, `tsc --noEmit` 0, `vite build` 성공. 브라우저 로컬 실측 13.0초 → 4.0초(동시 피크 12 → 3)
- 참고: 동시 상한 때문에 로컬 최적 조건에서는 3.2초 → 4.0초로 조금 늘었다. 프로덕션에서 429 로 무너지는 쪽이 훨씬 큰 손해라 의도한 교환이다

## v119 — 2026-08-07
- fix/perf: **v117 조사에서 남겨둔 마지막 두 항목** — 늦게 온 과거 응답이 최신 값을 덮어쓰던 경합, 0건 결과가 캐시되지 않아 반복 조회되던 문제
- **① 행 단위 직렬화(`resolver-engine.ts`)** — 옵션을 빠르게 바꾸면 `ui-and-bootstrap` 이 `tryResolveItem` 을 `await` 없이 여러 번 쏜다. 예전에는 **가장 늦게 도착한** 응답이 이겨서, 과거 옵션으로 조회한 가격이 최신 값을 덮어쓸 수 있었다(옵션·상세는 새 값인데 가격만 옛 값이라 알아채기 어렵다). 이제 행마다 하나씩만 돌리고, 진행 중에 다시 요청이 오면 끝난 뒤 **최신 옵션으로 한 번 더** 돌린다. `WeakMap`/`WeakSet` 잠금이라 resolver 39개는 그대로 두고 경합만 없앴다. 부수 효과로 슬라이더·드롭다운을 연타할 때 나가던 중복 조회도 사라진다
- **② 빈 결과 음성 캐시(`network.ts`)** — `apiCache` 는 `items.length>0` 일 때만 채워서, "0건"(그 리전에 없는 SKU 등)은 화면을 다시 그릴 때마다 매번 네트워크로 나갔다. 실패 경로는 성공 경로보다 무거워서(probeRegions 235KB) 반복 비용이 크다. 0건도 60초 TTL 로 기억하되, **네트워크 실패는 기록하지 않고**(다음 호출이 재시도) 통화를 바꾸면 함께 비운다. `clearNegativeCache()` export 추가
- **테스트**: `row-serialization.test.js` 신규 4종(진행 중 옵션 변경 → 최신 값이 남음 / 동시 호출은 조회 1건 / 다른 행끼리는 안 막음 / 종료 후 잠금 해제), `network-inflight.test.js` 에 음성 캐시 4종 추가. **변이 테스트로 둘 다 검증**(직렬화 무력화 → 조회 3건으로 실패, 음성 캐시 무력화 → 재조회로 실패)
- 영향 파일: src/core/resolver-engine.ts, src/core/network.ts, test/row-serialization.test.js(신규), test/network-inflight.test.js, CHANGELOG.md
- 검증: `npm test` **82 pass / 4 skip**, `tsc --noEmit` 0, `vite build` 성공. 라이브 104행 일괄 조회 정상(순차 11.4초 → 동시 6개 5.3초)
- 이로써 v117 조사에서 도출한 6개 항목을 모두 반영했다(v117 ①~③, v118 ④~⑤·프록시 복귀, v119 ⑥·세대 경합)

## v118 — 2026-08-07
- perf/fix: **느린 프록시에 눌러앉아 전체가 느려지던 문제(sticky) + 프록시당 25초 고정 대기**. v117 조사에서 관측한 "같은 작업이 374초" 사례를 직접 겨냥
- **① 프록시 쿨다운·자동 복귀** — 기존엔 성공한 프록시를 `activeProxyIndex` 에 눌러 담고 되돌리는 장치가 없었다. `direct` 가 **한 번** 실패해 느린 공개 프록시(allorigins-get)로 넘어가면 그 뒤 **모든** 요청이 그 경로로 갔다. 이제 실패한 프록시만 쿨다운(60초, 연속 실패 시 2배씩 최대 5분)으로 뒤로 미루고, 쿨다운이 끝나면 `CORS_PROXIES` 원래 우선순위로 자동 복귀한다(성공 시 즉시 초기화)
- **② `getProxyOrder` 비일관성 해소** — `expectedSizeKB>0` 이면 sticky 를 통째로 무시하고 항상 `vercel-fn` 부터 시도하던 분기를 없앴다. 이제 크기 조건과 건강 상태를 함께 보고 (크기 OK·정상) → (크기 OK·쿨다운) → (크기 부족·정상) 순으로 정렬한다
- **③ 계단식 타임아웃** — 프록시당 25초 고정(최악 7×25=**175초**)에서 시도 차수별 10s→15s→20s 로 바꾸고, 한 URL 전체에 **60초 상한**을 뒀다. 대용량 응답(≥100KB: probeRegions 235KB·Front Door 216KB)은 1.5배 여유
- **④ `AbortController` 로 실제 취소** — 기존 `Promise.race` 는 타이머만 이겼을 뿐 fetch 는 계속 살아 있었다. 브라우저의 호스트당 연결 수(약 6개)를 죽은 요청이 점유해, v117 에서 동시 실행을 6레인으로 올린 뒤에는 뒤따르는 조회까지 막을 수 있었다. 이제 타임아웃 시 실제로 abort 한다
- **`resetProxyHealth()`** export 추가(진단·테스트에서 프록시 상태 초기화)
- **테스트**: `network-proxy-health.test.js` 신규 6종 — 실패 프록시 건너뜀 / 쿨다운 후 1순위 복귀 / 성공 시 초기화 / 크기 제한 있어도 정상 프록시 우선 / 응답 없는 프록시를 끊고 다음으로 / abort 신호 전달. **변이 테스트로 둘 다 검증**(쿨다운 무력화 → 건너뜀 실패, 25초 고정 복원 → 타임아웃 테스트 실패)
- 영향 파일: src/core/network.ts, test/network-proxy-health.test.js(신규), CHANGELOG.md
- 검증: `npm test` **74 pass / 4 skip**, `tsc --noEmit` 0, `vite build` 성공. 라이브 104행 일괄 조회 순차 12.6초 → 동시 6개 3.8초(3.3×) 유지
- 남은 항목: 행별 요청 세대 토큰(옵션을 빠르게 바꾸면 늦게 온 과거 응답이 최신 값을 덮어씀), 빈 결과 음성 캐시

## v117 — 2026-08-07
- perf: **조회가 느리거나 멈춘 것처럼 보이는 문제 개선** — 순차 처리·중복 요청·실패 경로 3가지를 손봤다
- **원인 조사(실측)**: VM 1행 콜드 468ms / 엣지 캐시 HIT 16ms · 매칭 실패 시 추가되는 `probeRegions` 535ms·**235KB**(성공 경로보다 무겁다) · Front Door 1행 216KB(리전 필터 없는 전체 조회)
- **① 진행 중 요청 병합(`network.ts`)** — `apiCache` 는 요청이 *끝난 뒤에만* 채워져서, 같은 URL 을 동시에 요청하면 전부 네트워크로 나갔다. 한 서비스의 여러 행은 보통 `(serviceName, region)` 만으로 URL 이 같다(양식 기준 Service Bus 5·Event Hubs 4·Front Door 4·Container Apps 3행). `Map<url, Promise>` 로 진행 중 요청을 공유해 한 번만 나가게 함 — **동시 실행의 전제 조건**
- **② 동시 실행 풀(`export-csv.js`)** — 일괄 불러오기가 행을 하나씩 `await` 했다. 6레인 풀로 전환. `buildSkuAndDetail` 은 공유 `def.steps` 를 갈아끼우므로 조회 전에 전부 동기로 끝내고, `_resolve_*` 는 `row.options` 만 읽어 공유 상태가 없음을 확인한 뒤 병렬화
- **③ 실패 경로 비차단화(`vm.ts`·`app-service.ts`)** — 매칭 실패 시 `probeRegions`(전-리전 조회)를 `await` 한 뒤에야 상태가 갱신돼, 실패한 행일수록 더 오래 "조회 중"으로 보였다. 결과를 먼저 알리고 리전 안내는 백그라운드로 채우도록 변경. 비동기가 된 만큼 **낡은 응답이 최신 값을 덮어쓰지 않도록** 행 스탬프(region|skuName|options) 가드 추가
- **효과(라이브 실측, 양식 104행 일괄 조회)**: 순차 **14.8초 → 동시 6개 3.4초 (4.3×)**, 104/104행 전부 가격 조회 성공
- **테스트**: `network-inflight.test.js` 신규 4종(동시 4요청 → fetch 1회 / 필터 다르면 분리 / 완료 후 캐시 / 실패는 병합에 안 남음, 변이 테스트로 검증). `live-csv-import.test.js` 신규 — `RUN_LIVE=1` 에서 양식 전 행이 실제 가격까지 조회되는지 + 동시 실행이 순차보다 빠른지 확인(CI 제외)
- 영향 파일: src/core/network.ts, src/ui/export-csv.js, src/services/vm.ts, src/services/app-service.ts, test/network-inflight.test.js(신규), test/live-csv-import.test.js(신규), CHANGELOG.md
- 검증: `npm test` **68 pass / 4 skip**, `tsc --noEmit` 0, `vite build` 성공
- **남은 개선(미적용)**: 조사 중 `direct` 프록시가 일시 실패하자 `activeProxyIndex` 가 느린 공개 프록시(allorigins-get)에 눌러앉아 같은 작업이 **374초**까지 늘어나는 상황을 실제로 관측했다. 다음 항목이 남아 있다 — (a) 계단식 타임아웃(현재 프록시당 25초 고정, 최악 7×25=175초) (b) `AbortController` 로 실제 요청 취소(현재 `Promise.race` 는 fetch 를 취소하지 않아 죽은 요청이 살아 있음) (c) 행별 요청 세대 토큰(옵션을 빠르게 바꾸면 늦게 온 과거 응답이 최신 값을 덮어씀) (d) 빈 결과 음성 캐시 (e) `getProxyOrder` 가 `expectedSizeKB>0` 일 때 sticky 프록시를 무시하는 비일관성

## v116 — 2026-08-06
- fix: **`/api/prices` 서버리스 프록시가 HEAD 를 405 로 거부하던 문제**. HEAD 를 GET 과 동일하게 처리(상태·헤더 동일, 본문만 비움 — HTTP 규약)
- 프런트는 GET 만 쓰지만, 헬스체크·모니터링 도구나 `curl -I` 로 점검하면 405 가 떨어지고 그 응답의 기본 헤더(`public, max-age=0, must-revalidate`)가 보여 **캐시 설정이 안 걸린 것처럼 오인**됐다(실제 GET 은 `s-maxage=3600` 정상, 재요청 시 `x-vercel-cache: HIT`)
- HEAD 도 GET 과 동일한 host 잠금(`prices.azure.com` 강제)·CORS·`Cache-Control` 을 적용하고 `Content-Length` 만 알린 뒤 본문 없이 종료
- 405 응답에 `Allow: GET, HEAD, OPTIONS` 추가, OPTIONS 의 `Access-Control-Allow-Methods` 도 HEAD 포함으로 갱신
- **테스트 보강**: 캐시 헤더 단언을 `toContain('max-age')` → `public`·`max-age=3600`·`s-maxage=3600`·`stale-while-revalidate=86400` 개별 검증으로 조임(기존 단언은 s-maxage 가 빠져도 통과 — 엣지 캐시가 꺼지는 회귀를 놓침). HEAD 케이스 2종 추가
- 영향 파일: api/prices.js, test/prices-handler.test.js, CHANGELOG.md
- 검증: `npm test` **64 pass / 3 skip**. 실 HTTP 서버에 핸들러를 붙여 확인 — HEAD 200 + `Content-Length: 6910`(GET 본문과 동일) + 본문 0바이트, POST 405 + Allow, OPTIONS 204, HEAD 로 타 host 요청 시 403. 변이 테스트로 `s-maxage` 제거 시 테스트가 실패하는 것도 확인

## v115 — 2026-08-06
- fix: **견적 양식·서비스 카탈로그·Retail Prices API 3자 동기화**. API에는 정상 조회되는 SKU가 양식에 없어 작성 시 누락·대체되던 문제 + 카탈로그 자체가 API를 못 담던 문제 + 일부 미터가 항상 0원으로 계산되던 문제

### 1) 양식이 앱 카탈로그를 다 담지 못하던 문제 (누락·대체의 직접 원인)
- **원인 — 부모 종속 옵션의 스냅샷**: 옵션 사전은 `services/*.ts` 의 `steps[].options` 를 그대로 읽어 만들었는데, 이 배열은 `_applyStepVisibility` 가 부모 값(tier/model/plan/category…)에 따라 **통째로 갈아끼우는** 런타임 값입니다. 결과적으로 "기본 부모 값의 목록"만 사전에 실렸고, 나머지 값은 존재 자체가 안 보였습니다. 게다가 업로드 시 `_applyStepVisibility` 는 목록에 없는 값을 **경고 없이 첫 번째 값으로 대체**하므로(`r.options.item = items[0]`), 사용자는 틀어진 걸 알 수 없었습니다
- **부모 조합 전개(`expandServiceOptions`)**: 서비스마다 드라이버 키(`rebuildKeys` + `instanceParentKey`)의 조합을 실제로 순회하며 `_applyStepVisibility` 를 적용해 스텝별 유효 값을 수집. 사전에는 **합집합**을 싣고, 부모별 차이는 `↳` 줄로 명시(`미사용` = 그 조합에서 무시되는 키). 열거 후 `steps[].options` 는 원복(테스트로 고정)
- **되살아난 값(대표)**: SQL Database `hardware` = M-series·Premium-series·Premium-series MO·DC-series, `dtuSize` = B·P1~P15 / MySQL BC `series` = Edsv5·Edsv6·Eadsv5·Eadsv6, `vCores` 20·104 / App Service `SKU` 전 11계층(Premium v4·Isolated v4 등) / Redis `SKU` 전 9계층(Enterprise·Enterprise Flash·AMR 4종) / Elastic Pool `poolSize` 계층별 / Load Balancer Gateway `metric` / Application Gateway v1 SKU / VM 범주→시리즈 매핑
- **양식 파일 갱신**: 루트 `azure-quote-template_file.csv` 는 7월 7일 다운로드본이라 v102~v114 의 리전 9→**44개**, VM 시리즈 25→**46계열**, 신규 서비스 4종이 전부 빠져 있었음 → 현재 카탈로그로 재생성(165행 → 305행, 예시 84행 → **104행**)

### 2) 카탈로그가 API 미터를 다 담지 못하던 문제
- **Event Hubs** — `Geo Replication Zone 1~3` 계층 추가(Geo Replication Zone N Data Transfer, 1 GB)
- **Service Bus** — `Hybrid Connections`(Listener Unit·Data Transfer), `WCF Relay`(WCF Relay·WCF Relay Message), `Geo Replication Zone 1~3` 계층 추가
- **Azure Front Door** — Standard 8종(Default Request·Bot Protection Ruleset/Request·Included/Overage Routing Rules·Edge Actions Base Fee·Invocations·Overage Execution Time), Premium 4종(Captcha Sessions·Edge Actions Base Fee·Invocations·Overage Execution Time) 추가
- **Container Apps** — 라이브 대조 결과 이미 전 미터 수록(변경 없음)

### 3) 무료 허용량 구간을 요율로 오인해 견적이 0원이 되던 문제
- Retail Prices API 는 한 미터를 `tierMinimumUnits` 로 나눠 여러 건으로 돌려주는데, **첫 구간이 0원인 미터**가 있습니다(무료 허용량). 기존 4개 resolver 는 `tierMinimumUnits=0` 만 남기고 최저가를 골라, 이런 미터가 **항상 0원**으로 계산됐습니다
- 해당 미터: Service Bus `Standard Messaging Operations`(첫 13M 무료 → 1,227.68/1M), `Standard Brokered Connection`(첫 1,000개 무료 → 46.038), `Hybrid Connections Data Transfer`(첫 5GB 무료 → 1,534.6/GB), Front Door `Standard Included Routing Rules`(5개 포함 → 46.038/시간)
- **`pickTieredMeter`(core/resolver-helpers)** 신설 — 구간을 `tierMinimumUnits` 오름차순으로 보고 **0원이 아닌 최저 구간**을 고름(전 구간 0원이면 그대로 0원). Event Hubs·Service Bus·Container Apps·Front Door 4종에 적용. `tierNote` 로 상태 표시줄에 `(13 초과분 단가 · 그 이하는 무료)` 를 덧붙여 근거를 노출
- 양식 사전에도 `[무료 허용량 주의]`·`[지역 복제]` 안내 추가

### 재발 방지·구조
- 양식 본문 생성을 DOM 비의존 모듈 **`src/ui/csv-template.js`** 로 분리하고, **`test/csv-template.test.js`** 가 ① 전 서비스 예시 행 존재 ② 예시 행 값이 실제 부모 조합에서 유효(=대체되지 않음) ③ 저장된 양식 파일이 카탈로그와 일치 ④ 사전 생성이 서비스 정의를 훼손하지 않음 을 검사. 재생성은 `UPDATE_TEMPLATE=1 npx vitest run test/csv-template.test.js`
- **`src/services/all.js`** 신설 — 39개 서비스 등록 배럴. `main.js` 와 테스트가 같은 목록을 공유(서비스 추가 시 한 곳만 수정)
- 영향 파일: src/ui/csv-template.js·src/services/all.js·test/csv-template.test.js(신규), src/core/resolver-helpers.ts·kernel.ts(pickTieredMeter·tierNote), src/services/{event-hubs,service-bus,container-apps,front-door}.ts(카탈로그·구간 선택), src/ui/export-csv.js(양식 생성 로직 이관), src/main.js(배럴 사용), test/{resolver-helpers,new-services-resolve}.test.js(케이스 추가), azure-quote-template_file.csv(재생성), README.md, CHANGELOG.md
- 검증: `npm test` **62 pass / 3 skip**(25→62), `npx tsc --noEmit` 0, `vite build` 성공. **라이브 API 34종 실조회 확인**(KRW) — 양식 신규 행 13종(VM D4s_v7·E8ds_v7, EH/SB/ACA/FD 기본 미터, SQL BC M-series, App Service P0v4, Redis E10) + 신규 카탈로그 21종(EH·SB 지역복제/Hybrid/WCF, FD Standard 9·Premium 4, 무료구간 미터 3) 전부 매칭 및 0원 아님

## v105 — 2026-08-02
- feat: **자동 회귀 방지 (Phase 3) — Vitest 테스트 + 녹화 픽스처 + CI**. 35개 서비스 조회 로직의 회귀를 잡는 안전망
- **녹화 픽스처**: 실제 `prices.azure.com` 응답을 `test/fixtures/*.json`으로 녹화(VM D4s_v5 koreacentral Consumption 6 + Reservation 2, Public IP 4) → 테스트가 네트워크 없이 결정론적으로 동작
- **테스트 5파일 / 25 케이스**(+라이브 스모크 2):
  - `resolver-helpers.test.js` — 정규화 순수 함수(`normalizeReservationPrice`·`makeSpItem`·`spItemsFromBase`·`riItemsFromResv`) 10 케이스
  - `vm-resolve.test.js` — `REG['_resolve_Virtual_Machine']`를 픽스처+apiFetch 목으로 구동. PAYG Linux 매칭·SP/RI 추출·OS 분기(Windows>Linux) 검증 (REG 디스패치→apiFetch→헬퍼→UI훅 전 경로)
  - `public-ip-resolve.test.js` — `tryResolveItem` 경로(커스텀 resolve). Standard/Static 매칭(meterName) 7.673 검증
  - `prices-handler.test.js` — 서버리스 프록시 host 잠금·메서드·프록시 릴레이·502 (fetch 목) 7 케이스
  - `live-smoke.test.js` — `RUN_LIVE=1`에서만 실제 API 호출(API 계약 변화 감지)
- **툴체인**: `vitest.config.js`(node env, globals). 서비스 resolve 는 `document` 스텁 + `vi.mock('src/core/network.js')` 로 jsdom 없이 테스트. `.github/workflows/ci.yml` — push/PR 마다 Node 22 `npm ci && build && test`(라이브 스모크는 CI 제외)
- 영향 파일: vitest.config.js·test/**(신규)·.github/workflows/ci.yml(신규), package.json(vitest devDep·lock), README.md(테스트 안내), CHANGELOG.md
- 검증: `npm test` **25 pass / 3 skip**, `RUN_LIVE=1 npm test` **27 pass**(라이브 3종 API 통과). `npm ci`→build→test 클린 재현(CI 동등) 확인
- 범위: Phase 3은 핵심 경로 커버(pure 함수·VM 커스텀·제네릭 dispatch·프록시). 나머지 33개 서비스 개별 픽스처·ui-and-bootstrap.js 분할·TS(Phase 4) 후속

## v104 — 2026-08-02
- feat: **CORS 프록시 탈피 (Phase 2) — Vercel 단일 오리진 서버리스 프록시**. 공개 무료 프록시(corsproxy.io 등) 의존을 벗어나 API 조회 신뢰성 확보
- **`api/prices.js` 신설** — Vercel 서버리스 함수. 같은 오리진(`/api/prices?url=...`)에서 `prices.azure.com`을 대신 호출 → Vercel 배포 시 브라우저 CORS 자체가 사라짐. 대상 host를 `prices.azure.com`으로 강제(오픈 프록시 악용 차단), GET/OPTIONS만 허용, 엣지/브라우저 1시간 캐시(`Cache-Control: s-maxage=3600`)
- **프런트 폴백 유지**: `config.js`의 `CORS_PROXIES` 맨 앞에 `vercel-fn`(같은 오리진) 추가. 함수가 없는 환경(GitHub Pages·로컬 Vite dev)에선 404/비-JSON 응답 → `network.js` 기존 검증이 실패로 처리 → direct→corsproxy.io→... 공개 프록시 체인으로 **자동 폴백**(기존 배포 무손상)
- **`vercel.json`** — framework=vite, buildCommand/outputDirectory, `api/prices.js` maxDuration=15s
- 영향 파일: api/prices.js·vercel.json(신규), src/core/config.js(vercel-fn 프록시 추가), README.md(Vercel 배포 안내·CORS 순서), CHANGELOG.md
- 검증: **서버리스 함수 단위 테스트 8/8 통과**(라이브 prices.azure.com) — url 누락 400·타 host 403·http 403·POST 405·정상 200+Items[]·Cache-Control·CORS. **브라우저 폴백 검증**(Vite dev, 함수 없음): 콘솔에 `vercel-fn 실패(JSON parse) → direct 실패 → corsproxy.io 전환` 확인, VM D4s_v5 라이브 조회 유지(362.17/h). Vercel 실배포는 사용자 계정에서 진행(자동 배포 안 함)
- 범위: Phase 2는 프록시/배포. 실제 Vercel 배포 시 `vercel-fn`이 1순위로 성공. Vitest 정식 도입(Phase 3)·TS(Phase 4) 후속

## v103 — 2026-08-02
- refactor: **빌드/모듈 현대화 (Phase 1) — Vite + ES 모듈 전환**. 동작·가격 로직 무변경, 구조만 전환(무빌드 전역 스크립트 → ESM 번들)
- **디렉토리**: `js/` → `src/`. `index.html`의 40개 `<script>` 나열을 `<script type="module" src="/src/main.js">` 하나로 대체. 로드 순서는 `src/main.js` import 그래프가 결정
- **전역 스코프 제거**: 파일 간 공유가 전역(`window._svcDefs`, top-level `const`)에 의존하던 것을 명시적 import/export 로 전환
  - `src/core/registry.js` 신설 — 공유 레지스트리 `REG`(구 window 네임스페이스). 서비스는 `REG._svcDefs`/`REG['_resolve_*']`/`REG['_buildDetail_*']` 에 등록하고 resolver 는 `REG[fnName]` 로 조회(문자열 on-window 디스패치 제거)
  - `src/core/kernel.js` 신설 — 서비스가 import 하는 단일 파사드(REG·apiFetch·정규화 헬퍼·UI훅). 서비스 파일당 import 1줄 + `window`→`REG` 로만 변환(35개 균일 코드모드)
  - `src/core/ui-hooks.js` 신설 — 서비스/resolver 가 `setStatus`/`updatePriceCells`/`updateTotalsRow`/`showToast` 를 역호출하던 순환 의존을, UI 가 부팅 시 구현을 등록하는 얇은 간접층으로 차단(호출부 코드 무변경)
  - `src/core/resolver-helpers.js` 신설 — 순수 정규화 함수(`normalizeReservationPrice`·`makeSpItem`·`spItemsFromBase`·`riItemsFromResv`)를 엔진에서 분리(향후 단위 테스트 대상)
  - `network-layer.js` → `network.js` 로 rename, 가변 상태(`apiCache`·`activeProxyIndex`)를 네트워크 모듈이 소유(라이브 export)
  - `service-categories.js` 제거(registry.js 로 대체)
- **툴체인**: `package.json`(vite/vitest/typescript devDeps), `vite.config.js`(`base:'./'` — GH Pages 서브패스·Vercel 루트 양쪽 호환), `tsconfig.json`(allowJs, TS 점진 도입 준비). XLSX 2종은 CDN 전역 유지(번들 제외)
- 영향 파일: 전체 `src/**`(rename+ESM화), index.html, package.json/vite.config.js/tsconfig.json(신규), .gitignore(node_modules/dist), README.md, CHANGELOG.md
- 검증(실제 브라우저 Chrome + Vite dev + 라이브 KRW, 앱 end-to-end): `npm run build` 49개 모듈 번들 성공 · 부팅 3행 생성·35개 카테고리 레지스트리 등록·진단 연결 정상 ✓ · **커스텀 resolve**(VM D4s_v5@koreacentral PAYG 362.17/h, SP1/SP3/RI1/RI3 5군 전부) ✓ · **제네릭 resolve**(Public IP Standard 7.673/h) ✓ · Total 합계(269,982.18=VM+PublicIP) 정확 ✓ · 콘솔 에러 0. 프로덕션 dist 자산 상대경로(`./assets/`) 확인
- 범위: Phase 1은 구조 전환만. ui-and-bootstrap.js 파일 분할(→ui/*), Vercel 서버리스 프록시(단일 오리진), Vitest 테스트, TS 마이그레이션은 후속 Phase

## v102 — 2026-07-29
- feat: **리전 2종 추가** — Poland Central(`polandcentral`), Italy North(`italynorth`). 리전 목록은 `REGION_LABEL` 한 곳에서 관리되며(행별 리전 드롭다운·CSV 템플릿 리전 안내가 자동 반영), 상단 '기본 Region' 셀렉트에도 동일 옵션 추가
- feat: **VM GPU 신규 계열 4종(SKU 8개) 추가** — 고객 견적서에서 요청된 NVIDIA A100/H100 계열. 범주 'GPU' 하위에 시리즈로 편입
  - **NC A100 v4 (GPU)**(NCads A100 v4, A100 80GB PCIe): NC24ads_A100_v4(24c/220GB)·NC48ads_A100_v4(48c/440GB)·NC96ads_A100_v4(96c/880GB) — koreacentral·polandcentral·italynorth 등 광범위 제공
  - **NC H100 v5 (GPU)**(NCads H100 v5, H100 NVL 94GB): NC40ads_H100_v5(40c/320GB)·NC80adis_H100_v5(80c/640GB) — skuName이 'NC40adsH100v5'(밑줄 없음)이라 resolver 정규화 매칭에 의존
  - **ND A100 v4 (GPU)**(NDamsr A100 v4, A100 80GB SXM ×8): ND96amsr_A100_v4(96c/1900GB) — polandcentral·italynorth 등
  - **ND H100 v5 (GPU)**(NDsr H100 v5, H100 80GB SXM ×8): ND96isr_H100_v5(96c/1900GB) — koreacentral·polandcentral 등
- 범위: 제외 — ND96asr_v4(A100 40GB)는 API skuName(`ND96asr_A100_v4`)이 armSkuName 별칭(`_NU` 접미사)과 어긋나 resolver의 `skuM`을 통과 못 함(깨진 옵션 방지 위해 미수록). Spot/Low Priority는 기존과 동일하게 계층 선택으로 처리
- 영향 파일: js/core/config.js(REGION_LABEL), index.html(#defaultRegion 옵션), js/services/vm.js(_VM_ALL_SERIES·_VM_CATEGORY_SERIES['GPU']·VM_INSTANCE_CATALOG), js/ui-and-bootstrap.js(_csvBuildExampleRows에 GPU 예시 2행), CHANGELOG.md
- 검증(실제 브라우저 Chrome + 라이브 프록시 USD, 앱 resolver end-to-end): NC24ads_A100_v4@polandcentral PAYG 4.775/h·SP1Y 3.975·SP3Y 2.946·RI1Y 3.121·RI3Y 1.772 ✓, NC40ads_H100_v5@koreacentral 9.423·RI3 5.183 ✓, ND96isr_H100_v5@koreacentral 132.732·RI3 58.269 ✓, ND96amsr_A100_v4@italynorth 40.962·RI3 18.023 ✓, NC96ads_A100_v4@italynorth 19.100 ✓. 라벨(vCPU/RAM) 정상 표기. Python 하니스로 base()/skuM() 매칭도 focus 3개 리전 전 조합 통과

## v101 — 2026-07-02
- fix: **Load Balancer·MySQL 가격 미조회 수정**(구버전 CSV/부분 입력 호환)
- Load Balancer: 구버전 양식의 영문 청구 항목 값(`metric=Rules`/`Overage Rules`/`Data Processed`/`Gateway`/`Gateway Chain`)이 현재 한글 라벨 목록과 불일치해 조용히 지워지고 "청구 항목을 선택하세요" 오류로 가격이 안 나오던 것 → `_LB_METRIC_ALIAS`로 현재 라벨에 정규화 후 조회
- Azure Database for MySQL: ① tier 미선택 상태에서 인스턴스만 고르면(또는 구버전 CSV가 tier 없이 오면) buildDetail이 비Burstable 분기로 빠져 skuName이 비고 엔진이 조회를 **조용히 생략**하던 것 → tier 기본값(Burstable)을 resolver와 일치시켜 수정 ② vCores가 숫자로 오면 문자열 옵션 목록과 불일치해 1 vCore로 몰래 리셋되던 것 → 문자열 강제 변환 ③ 구버전 SKU 열 키(`compute=B2S`)를 인스턴스로 수용
- feat: **예시 CSV(양식 다운로드) 서비스당 2~3개 샘플로 전면 확장** — 35개 카테고리 × 서로 다른 구성 83행(VM Linux/Windows/B시리즈, Disk 프리미엄/표준SSD/Ultra, SQL DB GP/BC/서버리스, MySQL Burstable/GP/BC, Cosmos 수동/Autoscale/저장소, Redis Standard/Basic/Premium, DNS 영역/쿼리/프라이빗 등). 루트 샘플 파일 `azure-quote-template_file.csv`도 동일 내용으로 재생성(기존 파일은 v97 이전 옵션값이 섞여 있어 이번 오류의 원인이었음)
- 영향 파일: js/services/load-balancer.js, js/services/mysql.js, js/ui-and-bootstrap.js(_csvBuildExampleRows), azure-quote-template_file.csv(재생성), CHANGELOG.md
- 검증(실제 브라우저 Chrome + 라이브 KRW): 새 양식 83행 CSV 업로드 → **83/83 가격 조회 성공**(실패 0). 레거시 값 회귀 확인 — LB `metric=Rules` 38.365/h·`Data Processed` 7.673/GB·Gateway 정규화 ✓, MySQL vCores=2(숫자) → per-vCore×2 ✓, `compute=B2S`/`instance=B2MS`만 있어도 Burstable로 조회 ✓. 저장된 샘플 파일 자체도 Node 하니스 라운드트립 83/83 통과. node --check 통과

## v100 — 2026-07-02
- feat: **신규 카테고리 8종 추가** — Azure Cosmos DB, Azure Cache for Redis, API Management, Azure Private Link, Azure Container Registry, Azure DNS, Azure DevOps, Azure OpenAI (고객 견적서에서 미지원이던 서비스 전부). 총 27 → 35개 카테고리
- **Azure Cosmos DB**(serviceName='Azure Cosmos DB'): 과금 모델 4종 — Provisioned 수동(sku 'RUs', meter '100 RU/s' × RU/100, usage=시간) / Autoscale(productName '... autoscale', meter 'AP* 100 RUs' — 수동의 1.5배 단가, 최대 RU 기준) / Serverless(meter '1M RUs', usage=백만 RU) / 저장소(meter 'Data Stored', usage=GB). 다중 리전 쓰기(mRUs)·Dedicated Gateway·백업·DocumentDB(vCore)는 범위 외
- **Azure Cache for Redis**(serviceName='Redis Cache'): 계층 9종(Basic/Standard/Premium C0~C6·P1~P5 + Enterprise/Flash + Azure Managed Redis 4개 제품군), 계층 변경 시 캐시 크기 옵션 전환(LB 패턴). meter '<SKU> Cache'(전체 요금, Standard 복제본 포함)를 '<SKU> Cache Instance'(노드당)보다 우선 매칭
- **API Management**(serviceName='API Management'): 계층 9종(Developer/Basic/Standard/Premium + v2 3종 + Consumption + Self-hosted Gateway). meter '<계층> Unit' 정확 일치, Consumption은 유료 콜 구간(10K 단위, 무료 100만 콜 미반영)
- **Azure Private Link**(serviceName='Virtual Network', productName='Virtual Network Private Link', armRegionName='Global'): 엔드포인트(시간당 0.01)/데이터 처리 Ingress·Egress(GB, 계단형 첫 구간)
- **Azure Container Registry**(serviceName='Container Registry'): 계층(Basic/Standard/Premium) × 레지스트리(1/Day)·추가 저장소(GB/월, 포함 용량 초과분)
- **Azure DNS**(serviceName='Azure DNS', 리전 비종속): Public/Private × 호스팅 영역(월 0.5, Qty=영역 수)·쿼리(1M 0.4). Gov 존 제외, 공통('')→Zone 순 선택, 26개+ 영역 할인 미반영
- **Azure DevOps**(serviceName='Azure DevOps', 리전 비종속): Basic Plan·Advanced·Test Plans 사용자(월), Artifacts 저장소(GB/월), MS-hosted($40)·Self-hosted($15) 병렬 작업. 무료 한도(Basic 5명, Artifacts 2GB) 미반영
- **Azure OpenAI**(serviceName='Foundry Models'): 모델 15종 카탈로그(GPT-5/5.1/5.2·GPT-4.1(mini/nano)·GPT-4o(mini)·o1/o3/o3 mini/o4-mini·임베딩 2종) × 토큰 종류(입력/출력/캐시 입력). skuName 정확 일치(Global 배포 기준), 1K 미터는 ×1000으로 1M 토큰 단가 통일(usage=백만 토큰). Batch/Fine-tuning/오디오·이미지·실시간/PTU는 범위 외
- 영향 파일: js/services/{cosmos-db,redis-cache,api-management,private-link,container-registry,azure-dns,azure-devops,azure-openai}.js(신규 8), index.html, js/ui-and-bootstrap.js(SERVICE_CATEGORY_ORDER·CSV 예시 8행·SKU 열 매핑(Redis)·사용량 단위 안내), docs/service-status.csv, CHANGELOG.md
- 검증(Node 하니스, koreacentral 라이브 USD): 26개 조합 전부 매칭 통과 — Cosmos 400RU 0.032/h·Autoscale 1000RU 0.12/h·Serverless 0.271/1M·저장소 0.25/GB, APIM Basic 0.2016/h·Standard v2 0.9589/h, Redis Standard C0 0.07/h·Premium P1 0.711/h·AMR B10 0.381/h, Private Link EP 0.01/h, ACR Basic 0.1666/일, DevOps Basic User 6/월, DNS Zone 0.5/월, AOAI GPT-4.1 mini 입력 0.4/1M·GPT-5 출력 20/1M 등. node --check 전 파일 통과

## v99 — 2026-06-30
- feat: **Azure SQL Database에 '스토리지(GB)' 옵션 추가**(계산기 정밀 대조). 그간 컴퓨팅(vCore)만 계산하고 계산기의 '스토리지' 슬라이더에 해당하는 프로비저닝 데이터 스토리지 비용이 빠져 있던 것 보강. vCore 모델에 `storageGB` 입력 추가(기본 32GB, 0이면 제외)
- 구현: tier별 `... - Storage` 제품의 'Data Stored' 미터(단위 '1 GB/Month', 선택 통화로 반환)를 GB만큼 곱해 월비용 산출 → 시간당으로 환산(÷usage)해 **라이선스 가산과 동일 패턴**으로 컴퓨팅·절약(SP)·예약(RI)에 동일 가산. 스토리지는 약정 할인 대상이 아니라 전 가격대에 정가로 더함. usage=730에서 정확(그 외 시간 비례 근사). GP는 영역 중복(ZR) 선택 시 ZR 전용 스토리지 단가, BC/HS는 ZR 미터 없어 base 폴백
- 범위: 데이터 스토리지만(요청 범위). 백업(PITR/LTR) 스토리지·IO Rate Operations는 별도이며 미포함. DTU 모델은 storageGB 숨김
- fix(부수): 설정 패널 렌더 시 **number 스텝의 default를 옵션에 시드**하도록 보강 — 기존엔 number 입력이 화면엔 기본값을 보여주면서도 사용자가 건드리기 전까진 옵션에 저장되지 않아 resolver가 0으로 계산하던 불일치가 있었음(Files Provisioned v2의 storageGiB/IOPS/처리량 등 공통). 이제 '보이는 기본값=계산값' 일치
- 영향 파일: js/services/sql-database.js, js/ui-and-bootstrap.js(number default 시드 + 예시 CSV `storageGB=32`), CHANGELOG.md
- 검증(Node 하니스, koreacentral 라이브 KRW): GP 2vCore 32GB 스토리지월 6517.51(=32×203.67) · PAYG/h 816.50→825.43 · 0GB는 기존값 유지(하위호환). GP ZR 100GB 40674.39(=100×406.74, ZR 단가). BC 256GB·HS 512GB 정상. RI3에도 stoHourly 동일 가산 확인(약정 할인 미적용). node --check 통과
- 후속: 백업 스토리지(PITR/LTR) 옵션은 요청 시 추가 가능

## v98 — 2026-06-30
- feat: **엑셀 내보내기 시 '열 보기'로 숨긴 열을 제외**. 기존엔 '열 보기'(chkVis-*) 체크 해제는 화면만 숨기고 엑셀 출력엔 영향이 없었음 → `getEnabledGroups()`가 `chk-group-*`(엑셀 출력 선택)뿐 아니라 `chkVis-*`(열 보기)도 함께 확인해, 숨긴 가격 열(절약 1·3년/예약 1·3년)은 엑셀에서도 빠지도록 변경(PAYG는 항상 표시)
- 영향 파일: js/ui-and-bootstrap.js, index.html(주석)
- 검증: 브라우저에서 '열 보기'로 예약 1년 숨김 → 내보내기 그룹 [payg,sp1,sp3,ri3]로 ri1 제외 확인. node --check 통과
- 참고: 직전 작업으로 각 서비스 가격을 계산기(Azure Retail API)와 대조 — SQL Database는 계산기 렌더값까지 센트 일치(GP/BC 컴퓨팅+라이선스), App Service·MySQL·Bastion·LB·Disk·Blob/ADLS·Firewall·VPN·Synapse는 API 단가 일치 확인

## v97 — 2026-06-30
- fix: **Load Balancer 비용이 안 나오던 문제 수정**. 원인은 예시 CSV의 Load Balancer 행이 옛 영문 옵션값 `metric=Rules`를 써서, 현재 한글 청구 항목('규칙 (시간당, 5개 포함)')과 불일치 → 매칭 실패였음(resolver 자체는 정상, Standard 37.52/h 등 라이브 확인). 예시값을 `metric=규칙 (시간당, 5개 포함)`로 수정 + 작성 안내문 예시도 갱신
- chore: **예시 CSV(양식 다운로드)를 현재 상태로 전면 갱신**. 신규 카테고리 예시 행 5개 추가 — Azure Files Provisioned v2, Page Blob, Data Lake Storage Gen2, Azure SQL Database Elastic Pool, Azure SQL Managed Instance. VM에 `category=전체`, SQL Database에 `redundancy`·`license=라이선스 포함`, MySQL에 `series=Ddsv5` 명시. SERVICE_CATEGORY_ORDER 순서로 정렬
- 영향 파일: js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: 갱신한 예시 행 전체를 resolver로 실행해 모두 가격 산출 확인(LB 37.52, Files v2 381,908/월, Page Blob 202,876/월, ADLS 30.02, Elastic Pool 1006.85, MI 3266.03 등). node --check 통과

## v96 — 2026-06-30
- feat: **페이지 Blob + Azure Files Provisioned v2 신규 카테고리 추가** — 이로써 계산기 'Storage Accounts > 유형' 7종(블록 Blob·Table·Queue·ADLS Gen2·Azure 파일·**페이지 Blob**·Managed Disks)을 모두 커버
- **Page Blob**(serviceName='Storage'): 성능(Standard/Premium) 조건 분기. Standard='Standard Page Blob' × 중복성(LRS/GRS/RA-GRS) × 청구항목(Data Stored/Read·Write Operations). Premium='Premium Page Blob' × 디스크 크기(P10~P80) × 중복성(LRS/ZRS), 디스크당 월정액(_billingMode monthly). 검증: Standard LRS Data Stored 88.85/GB·Month, Premium P30 LRS 202,877/월
- **Azure Files Provisioned v2**(productName='Azure Files Provisioned v2'): 미디어(SSD/HDD) × 중복성 × 프로비저닝(스토리지 GiB + IOPS + 처리량 MiB/s 합산). 프로비저닝 디스크 모델(_billingMode monthly). 검증: SSD LRS 1024GiB+3000IOPS+125MiB/s 381,908/월, HDD GRS 1024GiB 29,170/월. (SSD 무료 IOPS/처리량 미차감 — 보수적 상향)
- 영향 파일: js/services/{page-blob,files-provisioned-v2}.js(신규), index.html, js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: 브라우저(koreacentral)에서 4개 조합 가격 조회 + 카테고리 드롭다운 노출 확인. node --check 통과

## v95 — 2026-06-30
- feat: **Microsoft Sentinel 커밋 계층 보강**(계산기/API 정밀 대조). 커밋 계층에 **50 / 25000 / 50000 GB** 누락이었음 → 추가. 이제 PAYG·Basic Logs + 50~50000 GB 커밋 계층 12종 = 14개 과금 모델로 API와 완전 일치
- 비교 메모: Log Analytics는 일치(Data Ingestion/Retention/Analyzed = API 'Analytics Logs' 미터), VPN Gateway SKU 전체 일치(Basic/VpnGw1-5/AZ)
- 영향 파일: js/services/sentinel.js, CHANGELOG.md
- 검증: 브라우저(koreacentral)에서 50 GB 326,727/일, 25000·50000 GB 조회 확인. node --check 통과

## v94 — 2026-06-30
- feat: **Data Lake Storage Gen2(ADLS Gen2) 신규 카테고리 추가**(계산기 정밀 대조). 계산기 'Storage Accounts > 유형'은 7종(블록 Blob/Table/Queue/**Data Lake Gen2**/Azure 파일/**페이지 Blob**/Managed Disks)인데, 우리는 ADLS Gen2·페이지 Blob 누락이었음 → ADLS Gen2 추가
- 구성: 파일 구조(계층 구조/단일 구조 네임스페이스 → productName 분기) × 액세스 계층(Hot/Cool/Cold/Archive) × 중복성(6) × 청구 항목(Data Stored/Iterative Read·Write/Read·Write·Delete Operations). serviceName='Storage', skuName='<계층> <중복성>', meterName 키워드 매칭(Blob Storage와 동일 패턴)
- 영향 파일: js/services/adls-gen2.js(신규), index.html, js/ui-and-bootstrap.js, CHANGELOG.md
- 검증: 브라우저(koreacentral)에서 Hierarchical Hot LRS Data Stored 30.018/GB·Month, Cool ZRS 20.71, Iterative Write 97.56, Flat 네임스페이스 정상 + 카테고리 드롭다운 노출 확인. node --check 통과
- 후속: 페이지 Blob(Standard/Premium Page Blob — 비관리 디스크용 레거시)은 미추가(요청 시 추가)

## v93 — 2026-06-30
- feat: **MySQL에 '인스턴스 시리즈(하드웨어 세대)' 선택 추가**(계산기 정밀 대조). 계산기 MySQL에는 GP/MO에 세대 선택(Ddsv6/Dadsv6 등)이 있는데 우리는 Ddsv5/Edsv5 고정이었음. **세대별 per-vCore 단가가 실제로 달라**(예 GP Ddsv5 $0.118 vs Ddsv6 $0.151, ~28%↑) 가격에 영향 → 세대 선택 필수
- 추가 세대: GP=Ddsv5/Ddsv6/Dadsv5(AMD)/Dadsv6(AMD), BC(메모리 최적화)=Edsv5/Edsv6/Eadsv5(AMD)/Eadsv6(AMD). productName을 tier+세대로 구성. Burstable은 세대 선택 없음(BS 단일)
- resolver 통합 매칭: 세대별 가격 구조가 달라(per-vCore vs '<N> vCore') per-vCore(skuName 'vCore'/'1 vCore')×N 우선, 없으면 '<N> vCore' 정확 일치 fallback. 절약/예약은 세대 무관 generic 제품에서 조회(기존과 동일)
- 영향 파일: js/services/mysql.js, CHANGELOG.md
- 검증(koreacentral 8vCore): GP Ddsv5 1416.85 vs Ddsv6 1813.09(=×1.28 정합), BC Edsv5 1702.02(SP/RI 정상), Burstable 세대 숨김. node --check 통과

## v92 — 2026-06-30
- feat: **App Service에 '공유(Shared)' 계층 추가**(계산기 정밀 대조). 계산기 App Service 계층은 무료/공유/기본/표준/프리미엄V2/V3/Premium V4/Isolated V4/격리된V2/격리V2 — 우리에 '공유' 누락이었음. 계층 첫머리 Free 다음에 Shared(skuName 'Shared', Windows 전용) 추가
- 비고: Shared(D1)는 koreacentral 미제공이라 그 리전선 매칭 실패가 정상(다른 리전엔 존재 — eastus 검증 19.51 KRW/h=$0.013). 레거시 Premium(v1)·Isolated(v1)는 우리가 계산기보다 더 보유(상위집합), Isolated v2의 ASEv3/Dedicated Host 구분은 동일 제품이라 단일 옵션으로 충분
- 영향 파일: js/services/app-service.js, CHANGELOG.md
- 검증: 브라우저에서 eastus Shared 19.51/h, koreacentral 매칭 실패(정상), 계층 11종 노출 확인. node --check 통과
- MI 대조: 계산기의 'Next Generation General Purpose'·'Instance Pool'은 koreacentral·eastus·japaneast Retail API에 미존재(UI/프리뷰)라 생략 유지. MI 핵심 옵션은 일치(라이선스 v90 포함)

## v91 — 2026-06-29
- feat: **VM 계층에 'Basic' 추가**(계산기 정밀 대조). 계산기 VM 계층=Basic/Standard인데 우리는 Standard/Spot이라 Basic 누락이었음 → 계층 Standard/**Basic**/Spot(Spot은 우리 추가분 유지). Basic은 A0~A4(armSkuName 접두사 'Basic_'), 선택 시 시리즈=A-series Basic 전용·범주 자동 숨김
- 구현: 카탈로그 'A-series (Basic)'(A0 0.75GB~A4 14GB), `_vm_applyStepVisibility` 계층 인식, resolver armSku 접두사 분기('Basic_'/'Standard_'), rebuildKeys에 'tier' 추가. 라이브 검증(koreacentral Basic A1 48.03/h, A4 673.90/h)
- 계산기 대조 결과 VM 정합: OS(우리 Linux/Windows+RHEL/SUSE=상위집합), 유형(에디션 인라인=도달가능), 범주 7종 일치, 절약옵션 5종 일치, OS 라이선스(AHB) 일치
- 영향 파일: js/services/vm.js, CHANGELOG.md
- 검증: 브라우저에서 Basic A1/A4 가격 + 스텝 전환(Basic→A-series 전용·범주 숨김) + Standard/Spot 회귀 확인. node --check 통과

## v90 — 2026-06-29
- feat: **SQL Managed Instance에도 'SQL 라이선스'(AHB) 적용** — v89(SQL Database)와 동일. MI의 'vCore' 단가도 컴퓨팅 전용(=AHB)이라 라이선스 비용이 빠져 있던 것 정정. 기본값 '라이선스 포함'(컴퓨팅+SQL 코어 라이선스), 'Azure Hybrid Benefit' 선택 시 제외
- 라이선스 단가 USD 상수(GP=Standard $0.10, BC=Enterprise $0.375 /vCore/h), 통화는 API FX 환산. SP/RI에도 가산. 라이선스는 계층(GP/BC) 기준, 하드웨어 무관
- 검증(koreacentral 8vCore): GP 라이선스 포함 3266.03/h(라이선스 1200.72=150.09/vCore) vs AHB 2065.31/h, BC 라이선스 포함 8633.32/h(라이선스 562.84/vCore) vs AHB 4130.62/h — SQL Database·계산기 라이선스 단가와 일치
- 영향 파일: js/services/sql-managed-instance.js, CHANGELOG.md
- 검증: 브라우저에서 GP/BC × 라이선스 포함/AHB 가격 + 라이선스 스텝 노출 확인. node --check 통과

## v89 — 2026-06-29
- feat: **Azure SQL Database에 'SQL 라이선스' 선택 추가**(라이선스 포함 / Azure Hybrid Benefit) — 계산기와 동일. 계산기 검증 결과 Retail API의 'vCore' 단가는 **컴퓨팅 전용(=AHB)** 가격이었고, 우리 앱은 그간 사실상 AHB(라이선스 제외) 가격을 기본으로 보여 SQL 라이선스 비용이 빠져 있었음
- **가격 정정**: 기본값을 계산기와 동일하게 **'라이선스 포함'**으로 설정 → 컴퓨팅 + SQL Server 코어 라이선스. 'Azure Hybrid Benefit' 선택 시 라이선스 제외(기존 가격). 예) koreacentral GP Gen5 2vCore: 라이선스 포함 816.50/h vs AHB 516.32/h
- 라이선스 단가: Retail API 미제공이라 Azure 공시값을 USD 상수로 둠(GP=SQL Standard $0.10, BC=SQL Enterprise $0.375, Hyperscale=라이선스 없음 /vCore/h). 통화 환산은 같은 컴퓨팅 미터의 USD↔선택통화 비율(FX)을 API에서 도출해 적용(상수는 USD만, FX 하드코딩 없음). 계산기 East US 분해값(GP 라이선스 150.04 KRW/vCore/h, BC 562.84)과 일치 검증
- 라이선스는 컴퓨팅 절약(SP/RI)과 무관하게 동일 단가로 가산. DTU 모델은 라이선스 옵션 숨김(vCore 전용). Hyperscale은 라이선스 0
- 영향 파일: js/services/sql-database.js, CHANGELOG.md
- 검증: 브라우저에서 GP/BC/HS × 라이선스 포함/AHB 가격 + DOM 스텝 노출(vCore=표시, DTU=숨김) 확인. node --check 통과
- 후속: SQL Managed Instance도 동일 라이선스 모델(GP/BC) 적용 가능(미적용 — 요청 시 추가)

## v88 — 2026-06-29
- feat: **필드 라벨을 가격 계산기와 정렬**(표시용 라벨만 변경 — 옵션 값/가격 로직 무변경, 안전). 옵션 값은 Azure 공식 명칭 유지(계산기 한글 번역은 구버전 표기가 섞여 있어 제외)
  - **SQL Database**: 계층→'서비스 계층', 컴퓨팅→'컴퓨팅 계층', 하드웨어→'하드웨어 종류', vCore 수→'인스턴스(vCore)'
  - **App Service**: OS→'운영 체제'
  - **MySQL**: vCore 수→'인스턴스(vCore)'
  - **SQL Managed Instance**: 계층→'서비스 계층', 하드웨어→'하드웨어 종류', vCore 수→'인스턴스(vCore)'
- 영향 파일: js/services/{sql-database,app-service,mysql,sql-managed-instance}.js, CHANGELOG.md
- 검증: 라벨 변경 후 가격 정상 조회 확인(SQL 2065.30, App 271.66, MySQL 1416.85, MI 2065.31). node --check 통과

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