// ================================================================
// core/registry.js — 서비스 레지스트리 (구 window 네임스페이스 대체)
// ----------------------------------------------------------------
// 각 services/*.js 는 REG 에 자신의 정의/조회함수를 등록한다.
//   REG._svcDefs['<카테고리>']        서비스 카테고리 정의 (구 window._svcDefs)
//   REG['_resolve_<키>']              가격 조회 함수      (구 window['_resolve_...'])
//   REG['_buildDetail_<키>']          상세/SKU 빌더        (구 window['_buildDetail_...'])
//   REG['_<svc>_applyStepVisibility'] 스텝 가시성 헬퍼(내부)
//   REG.<CATALOG>                     VM/Disk 카탈로그 (ui 가 읽음)
// resolver-engine 은 REG[fnName] 으로 조회, ui 는 REG.<CATALOG> 로 참조한다.
// ================================================================
export const REG = { _svcDefs: {} };

// SERVICE_CATEGORIES 는 REG._svcDefs 와 같은 객체를 가리킨다(라이브 참조).
// 서비스들이 REG._svcDefs 에 등록하면 이 참조로도 즉시 보인다.
export const SERVICE_CATEGORIES = REG._svcDefs;
