# Azure 견적 시뮬레이션

Azure Retail Prices API를 호출하여 **용량제(PAYG)·절약 플랜(1Y/3Y)·예약(1Y/3Y)** 가격을 한 견적표에서 동시 비교하는 단일 페이지 웹 도구입니다. 단가는 모두 Azure 공시 가격에서 실시간 조회되며, 코드에 하드코딩된 수치는 없습니다.

---

## 빠른 시작

### 방법 1. 배포된 페이지에서 바로 사용 (가장 쉬움)

GitHub Pages가 활성화된 경우, 브라우저에서 다음 주소에 접속하세요.

```
https://<사용자명>.github.io/<저장소명>/
```

페이지가 열리면 화면 상단 배너에 다음 메시지가 표시되어야 정상입니다.

```
연결 정상 (프록시: direct)
```

만약 빨간 글씨로 실패 메시지가 보이면 그 글씨를 클릭하세요. 정중앙 모달이 열리며 환경별 해결 방법이 안내됩니다.

### 방법 2. 로컬에서 실행

v103부터 **Vite** 기반으로 빌드/실행합니다. **Node.js**가 필요합니다 (HTML 더블클릭 `file://` 방식은 여전히 불가).

#### 사전 준비

- Node.js 18+ — [nodejs.org](https://nodejs.org/)

#### 실행 명령

저장소를 클론한 뒤 디렉토리에서:

```bash
npm install       # 최초 1회 (의존성 설치)
npm run dev       # 개발 서버 (http://localhost:5173)
```

배포용 정적 산출물을 만들려면:

```bash
npm run build     # dist/ 생성
npm run preview   # 빌드 결과 미리보기
```

#### 접속

개발 서버 실행 후 브라우저 주소창에:

```
http://localhost:5173/
```

---

## 사용 방법

### 1. 통화 선택

상단 우측 드롭다운에서 KRW / USD / EUR / JPY 중 선택합니다. 통화를 바꾸면 다음 가격 조회부터 해당 통화로 응답이 옵니다.

### 2. 행 추가

표 아래 "+ 행 추가" 버튼을 누르면 빈 행이 생깁니다.

### 3. 서비스 입력

각 행에서 다음 순서로 입력합니다.

1. **Region** — 리전 선택 (Korea Central, Japan East 등)
2. **분류** — 자유 입력 (예: "Web Server(운영망)")
3. **Service Category** — Virtual Machine / Storage / VPN Gateway 등
4. **Service name (SKU)** — 시리즈/인스턴스 선택
5. **상세 사양** — 자동 채워짐
6. **Qty / 사용량(Hours)** — 한 달 = 730 Hours

### 4. 옵션 설정

행을 클릭하면 우측 옵션 패널이 펼쳐집니다. 운영체제, 라이선스 옵션(라이선스 포함 / Azure Hybrid Benefit), 디스크 종류, VPN Gateway SKU 등을 설정한 뒤 **확인** 버튼을 누르면 가격이 조회됩니다. 패널 외부를 클릭해도 자동 적용됩니다.

### 5. 엑셀 내보내기 (CSV 동시 저장)

상단 우측 "엑셀 내보내기" 버튼을 누르면 견적표 전체가 xlsx로 저장되며, **같은 이름의 CSV 파일도 함께** 만들어집니다. 이 CSV는 "CSV 불러오기" 양식과 동일한 형식이라 나중에 그대로 다시 불러와 견적을 복원할 수 있습니다.

폴더 선택을 지원하는 브라우저(Chrome/Edge)에서는 저장할 폴더를 고르는 창이 떠서 지정한 위치에 두 파일이 저장됩니다. 그 외 브라우저에서는 두 파일이 자동으로 다운로드 폴더에 받아집니다.

### 6. CSV 양식으로 일괄 입력

행이 많을 때 일일이 입력하는 대신, 정해진 양식의 CSV를 업로드하여 견적 행을 한 번에 만들 수 있습니다. (1차 지원 서비스: Virtual Machine, Disk, VPN Gateway)

1. 상단 우측 **"CSV 양식 다운로드"** 버튼(엑셀 내보내기 왼쪽)을 눌러 빈 양식을 받습니다. 양식 컬럼은 `Region, 분류, ServiceCategory, SKU, Qty, Hours, Options` 이며, 파일 하단 `#` 줄에 서비스별 허용 옵션 값이 안내되어 있습니다.
2. 양식을 채웁니다. `Options` 칸은 `키=값`을 세미콜론(;)으로 구분합니다(예: `os=Windows; tier=Standard; series=D-series v5`). `SKU` 칸에는 인스턴스/디스크/게이트웨이 이름을 넣습니다(프로비저닝형 디스크는 비움).
3. **"CSV 불러오기"** 버튼으로 채운 파일을 업로드합니다. 행이 생성되고 각 행의 가격이 자동 조회됩니다. 기존 행이 있으면 교체할지 뒤에 추가할지 묻습니다.

`#` 로 시작하는 줄과 빈 줄은 무시되며, 지원하지 않는 서비스나 Region 행은 건너뛰고 완료 후 제외 건수를 알려줍니다.

---

## 가격 표시 규칙

| 그룹 | 의미 |
|---|---|
| 용량제 (PAYG) | 시간당 종량제. 약정 없음 |
| 절약 플랜 1년/3년 | 시간당 환산 단가. 사용량 기반 약정 할인 |
| 예약 1년/3년 | 시간당 환산 단가. 인스턴스 단위 약정 할인 |

- **1 Monthly Cost** = Unit Price × Qty × 사용량
- **1 Year cost** = 1 Monthly Cost × 12

Storage 항목은 월 정액 청구이므로 사용량(Hours) 변경에 영향받지 않습니다.

---

## 자주 묻는 질문

### Q. 페이지를 열었더니 "✗ file:// 감지" 메시지가 떠요

HTML 파일을 더블클릭으로 열면 발생합니다. 위의 "방법 2. 로컬에서 실행"을 따라 로컬 웹서버로 띄우거나, GitHub Pages 등 호스팅된 주소로 접속하세요.

### Q. 회사 컴퓨터에서 "✗ 외부 네트워크 차단" 메시지가 뜰니다

회사 보안 정책 / 방화벽이 외부 도메인 접근을 차단하는 환경입니다. 화면 정중앙 모달에 표시되는 도메인 목록을 IT/보안팀에 전달하여 화이트리스트 추가를 요청하세요. 추가가 어려운 경우, 개인 환경에서 실행 후 엑셀로 내보내 사내 공유하는 방법을 권장합니다.

### Q. "✗ 브라우저 차단" 메시지가 뜰니다

광고 차단 확장(uBlock, AdGuard 등) 또는 보안 확장이 fetch를 가로막을 때 발생합니다. 다음을 시도해 보세요.

1. 시크릿 / InPrivate 창에서 다시 열기
2. 광고 차단 확장 일시 중지
3. 다른 브라우저로 시도 (Chrome ↔ Edge ↔ Firefox)

### Q. 가격이 실제 청구액과 다릅니다

이 도구는 Azure Retail Prices API의 **공시 가격**을 표시합니다. EA 계약, CSP, 스타트업 크레디트 등 별도 할인은 반영되지 않습니다.

### Q. 특정 SKU의 가격이 "-" 로 표시됩니다

해당 SKU에 대한 약정 가격(예약/절약 플랜)이 존재하지 않거나, 매칭 로직이 실패한 경우입니다. F12 키를 눌러 개발자 도구의 콘솔 탭을 열면 어떤 미터가 매칭에 실패했는지 자세한 로그를 볼 수 있습니다.

---

## 파일 구조

```
.
├── index.html                     메인 페이지 (Vite 엔트리: <script type=module src=/src/main.js>)
├── package.json  vite.config.js  tsconfig.json
├── css/
│   └── main.css                   전체 스타일 (Vite가 번들)
└── src/
    ├── main.js                    엔트리: 모든 모듈을 순서대로 import
    ├── core/
    │   ├── config.js              상수, CORS 프록시 목록, 리전 (순수 export)
    │   ├── network.js             fetch 폴백, API 호출, 캐시 (apiCache/activeProxyIndex 소유)
    │   ├── registry.js            REG(서비스 레지스트리) + SERVICE_CATEGORIES
    │   ├── kernel.js              서비스가 import 하는 단일 파사드(REG·apiFetch·헬퍼·UI훅)
    │   ├── ui-hooks.js            resolver/서비스 → UI 역호출 간접층(순환 의존 차단)
    │   ├── resolver-helpers.js    가격 정규화 순수 함수(테스트 대상)
    │   └── resolver-engine.js     가격 조회 엔진(REG[fnName] 디스패치)
    ├── services/                  서비스별 정의 + 가격 매칭 (35개, REG 에 등록)
    ├── diagnostics.js             연결 진단, 환경별 안내 모달
    └── ui-and-bootstrap.js        행/표/옵션 패널/엑셀/CSV/부트스트랩 + UI훅 등록
```

로드 순서는 `src/main.js`의 import 그래프가 결정합니다: 서비스(REG 등록) → resolver-engine → diagnostics → ui-and-bootstrap → remark. 각 파일은 ES 모듈이며 전역 스코프 대신 명시적 import/export 로 연결됩니다. 서비스는 문자열 디스패치(`window['_resolve_*']`) 대신 공유 레지스트리 `REG` 에 등록됩니다. 빌드/번들은 Vite가 담당합니다.

---

## 기술 정보

- **API**: `https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview`
- **CORS**: 직접 호출(direct)을 우선 시도하고, 실패 시 corsproxy.io → allorigins-raw → allorigins-get → codetabs.com → cors.x2u.in 순으로 폴백
- **외부 라이브러리**: SheetJS (xlsx), xlsx-js-style (모두 CDN 로드 — 번들 제외, 런타임 전역)
- **빌드**: Vite (ES 모듈 번들) · **프레임워크 의존성 없음** (Vanilla JavaScript)
- **테스트/타입**: Vitest, TypeScript(allowJs, 점진 도입) — devDependencies

---

## GitHub Pages 활성화 방법

처음 저장소를 만든 분을 위한 안내입니다.

1. 저장소 페이지에서 **Settings** 탭 클릭
2. 왼쪽 메뉴의 **Pages** 클릭
3. "Build and deployment" 섹션에서:
   - Source: **Deploy from a branch**
   - Branch: **main** / **/ (root)**
4. **Save** 클릭
5. 1~3분 후 페이지를 새로고침하면 상단에 다음 메시지가 표시됨

   ```
   Your site is live at https://<사용자명>.github.io/<저장소명>/
   ```

6. 위 주소를 클릭하여 접속

---

## 주의 사항

- 이 도구는 **읽기 전용**입니다. Azure 리소스를 생성하거나 변경하지 않으며, 외부에 어떤 데이터도 송신하지 않습니다.
- 표시된 가격은 참고용이며, 실제 청구는 Azure Cost Management 또는 청구서를 확인하세요.
- Azure 가격 정책은 수시로 변경될 수 있습니다.
