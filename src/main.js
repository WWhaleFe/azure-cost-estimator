// ================================================================
// main.js — Vite 엔트리. 로드 순서: services(레지스트리 등록) → resolver → diagnostics → ui → remark
// 서비스는 import 시점에 REG 에 자기 정의를 등록(부수효과)하므로 ui 보다 먼저 import 한다.
// ================================================================

// 1) 서비스 정의 + resolve (순서 무관, ui 보다 먼저)
import './services/all.js';

// 2) 엔진/진단/UI (부수효과: 이벤트 바인딩·초기 행 생성·진단 부팅)
import './core/resolver-engine.js';
import './diagnostics.js';
import './ui-and-bootstrap.js';

// 3) 안내(Remark) 팝업/본문 렌더링
import './core/remark.js';
