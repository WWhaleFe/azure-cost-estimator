# Changelog

버전 번호는 정수 체계(vNN)를 따릅니다. 새 버전을 맨 위에 추가합니다.

## v43 — 2026-05-29
- docs: README "기술 정보"의 CORS 폴백 목록을 실제 설정과 일치시킴
- 변경 내용: 존재하지 않는 yacdn·cors.sh 제거, 실제 프록시 순서(direct → corsproxy.io → allorigins-raw → allorigins-get → codetabs.com → cors.x2u.in) 반영
- 영향 파일: README.md, CHANGELOG.md
- 검증: 라이브 파일 js/core/config.js의 CORS_PROXIES 배열을 직접 대조. JS 미변경

## v42 — 2026-05-29
- refactor: 미사용 고아 파일 제거 (루트 js/config.js, js/network-layer.js)
- docs: README "파일 구조" 섹션을 실제 js/core + js/services 구조로 동기화 (존재하지 않는 js/matchers.js 언급 제거)
- 영향 파일:
  - js/config.js (삭제)
  - js/network-layer.js (삭제)
  - README.md (수정)
  - CHANGELOG.md (신규)
- 검증: index.html이 두 고아 파일을 로드하지 않음을 직접 확인 (저장소 유일 HTML 진입점, <script>는 js/core 경로만 참조). 라이브 경로(js/core, js/services) 파일은 변경하지 않음
