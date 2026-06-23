# Changelog

버전 번호는 정수 체계(vNN)를 따릅니다. 새 버전을 맨 위에 추가합니다.

## v80 — 2026-06-23
- feat: Azure SQL Database에 **중복성(재해 복구) 옵션** 추가 — '로컬 중복' / '영역 중복(ZR)'. 공식 Azure 가격 계산기의 재해복구·중복성 옵션에 대응하며, 선택이 용량제·절약·예약 가격에 즉시 반영됨(가격 하드코딩 없음, 전부 라이브 API 조회)
- 무엇을: redundancy 스텝(def.steps) 신설 + _resolve_Azure_SQL_Database가 ZR 선택 시 'Zone Redundancy vCore' 추가 미터를 용량제·절약(1년)·예약(1·3년)에 각각 합산. ZR 추가 미터가 없는 조합(BC/HS/Fsv2)은 로컬 기준으로 폴백하고 상태창에 안내(빈 가격 방지)
- 왜: 기존엔 중복성 옵션 자체가 없어 영역 중복 비용을 추정할 수 없었고(공식 계산기 대비 누락). 더불어 '예약이 빈칸'이라는 제보를 진단 — GP/Gen5 등 예약 제공 조합의 예약 매칭 로직 자체는 정상이었고(라이브 데이터 재현 시 RI1/RI3 산출됨), 별도 예약 호출이 일시 실패하면 조용히 빈칸이 되던 약점을 보강
- 어떻게: ZR add-on은 'N vCore Zone Redundancy' 정확가 우선/없으면 per-vCore('vCore ZR Zone Redundancy'/'1 vCore Zone Redundancy')×N. 예약 제공 조합(Provisioned·非Fsv2)인데 예약 조회가 비면 1회 재시도, 그래도 비면 '예약 조회 실패(새로고침 권장)' 표기. 서버리스/Fsv2는 '예약 미제공' 명시. DOM id 변경 없음(스텝은 제네릭 렌더) → index.html·ui-and-bootstrap.js 무변경
- 영향 파일: js/services/sql-database.js, CHANGELOG.md
- 검증: 실제 sql-database.js를 Node 하니스로 로드해 koreacentral 라이브 API 데이터로 실행 — GP/Gen5/Prov 2vCore 로컬 PAYG 516.32 / SP1 413.06 / RI1 335.48 / RI3 232.33, 영역중복(ZR) PAYG 826.12(=로컬 516.32 + ZR 309.79) / SP1 660.90 / RI1 536.97 / RI3 371.68, 8vCore 선형 확인. BC/Gen5는 ZR 미터 없어 로컬 폴백+안내 확인. 모든 경우 PAYG>SP1>RI1>RI3 정합. node --check 통과. 실제 행 표시는 브라우저에서 최종 확인 권장
- 비고: 직전 제안 번호는 v79였으나 원격 main에 이미 v79(SQL/MySQL/Synapse 절약·예약 추가)가 존재해 충돌 방지 규칙대로 v80으로 채번. docs/service-status.csv는 이미 v80 항목을 반영하고 있어 본 커밋으로 코드와 문서가 일치됨

@@CHANGELOG_TAIL@@
