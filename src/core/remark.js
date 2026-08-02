// 안내(Remark) 모듈 — 본문 목록과 첫 진입 팝업을 같은 소스(REMARK_ITEMS)로 렌더링
// 한 곳(REMARK_ITEMS)만 수정하면 본문과 팝업이 함께 갱신됩니다.
// '오늘 하루 보지 않기'는 같은 브라우저에 당일 날짜를 저장(localStorage)해 다음 날 다시 표시합니다.
(function () {
  var REMARK_ITEMS = [
    '"분류"는 자유 입력 필드입니다.',
    'Service Category 선택 시 옵션 패널이 표 아래에 펼쳐집니다.',
    '가격 그룹 5종: 용량제, 절약 플랜 1Y/3Y, 예약 1Y/3Y를 동시 비교합니다.',
    '사용량(Hours)은 직접 숫자로 입력하세요. 한 달 = 730 Hours.',
    '<strong>엑셀 내보내기</strong>: 헤더의 체크박스(☑ 텍스트 앞)를 해제하면 해당 열이 엑셀에서 제외됩니다.',
    'Action: ⊕ 빈 절약·예약 칸을 용량제 값으로 채우기(수동), ⚙ 옵션, ⎘ 행 복사, ✕ 행 삭제. ⋮⋮ 드래그로 행 순서 변경. 채운 셀은 더블클릭으로 채움↔빈칸 토글.'
  ];
  // 다른 곳에서 참조/수정할 수 있도록 window에도 노출
  window.REMARK_ITEMS = REMARK_ITEMS;

  var HIDE_KEY = 'azureQuoteRemarkHideUntil'; // 값 'YYYY-MM-DD' : 이 날짜 동안 팝업 숨김

  function todayStr() {
    var d = new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function renderInto(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = REMARK_ITEMS.map(function (html) { return '<li>' + html + '</li>'; }).join('');
  }
  function renderAll() {
    renderInto('remarkList');
    renderInto('remarkModalList');
  }
  function openModal() {
    var ov = document.getElementById('remarkModalOverlay');
    if (ov) ov.style.display = 'flex';
  }
  function closeModal() {
    var ov = document.getElementById('remarkModalOverlay');
    if (ov) ov.style.display = 'none';
  }
  function hideToday() {
    try { localStorage.setItem(HIDE_KEY, todayStr()); } catch (e) { /* 저장이 막혀도 닫기는 진행 */ }
    closeModal();
  }
  function shouldHideToday() {
    try { return localStorage.getItem(HIDE_KEY) === todayStr(); } catch (e) { return false; }
  }

  function init() {
    renderAll();
    var bOpen = document.getElementById('btnRemarkOpen');
    var bX = document.getElementById('btnRemarkClose');
    var bFoot = document.getElementById('btnRemarkCloseFoot');
    var bHide = document.getElementById('btnRemarkHideToday');
    var ov = document.getElementById('remarkModalOverlay');
    if (bOpen) bOpen.addEventListener('click', openModal);   // '안내 다시 보기'는 하루 숨김과 무관하게 항상 표시
    if (bX) bX.addEventListener('click', closeModal);
    if (bFoot) bFoot.addEventListener('click', closeModal);
    if (bHide) bHide.addEventListener('click', hideToday);
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); }); // 바깥 영역 클릭 시 닫기
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
    if (!shouldHideToday()) openModal();                      // 첫 진입 자동 표시(당일 숨김이 아닐 때)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
