// ================================================================
// custom-proxy-ui.js — 사용자 정의 CORS 프록시 설정 UI
//
// 이 파일은 부트스트랩이 끝난 후 다음을 수행합니다.
//   1) 상태바 옆에 "프록시 설정" 버튼 동적 삽입
//   2) 버튼 클릭 시 입력 모달 표시 (현재 값 기본 표시)
//   3) 사용자가 저장하면 LocalStorage 에 기록 후 reloadCustomCorsProxy() 호출
//   4) apiCache 비워서 다음 가격 조회부터 새 프록시 사용
//
// 의존성:
//   - config.js 의 LOCAL_STORAGE_KEYS, reloadCustomCorsProxy, apiCache
//   - ui-and-bootstrap.js 의 setStatus 함수
//
// index.html 에서 ui-and-bootstrap.js 다음에 로드되어야 합니다.
// ================================================================

(function () {
  // ----- 부트스트랩이 끝나길 기다린 후 버튼 설치 -----
  // ui-and-bootstrap.js 가 동기 스크립트이므로 DOM 이 이미 준비된 상태에서 실행됨.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _installButton);
  } else {
    _installButton();
  }

  function _installButton() {
    const statusContainer = document.getElementById('apiStatus');
    if (!statusContainer || !statusContainer.parentNode) {
      console.warn('[프록시 UI] 상태바 요소를 찾지 못했습니다');
      return;
    }
    if (document.getElementById('customProxyBtn')) return;  // 중복 설치 방지

    const btn = document.createElement('button');
    btn.id            = 'customProxyBtn';
    btn.type          = 'button';
    btn.textContent   = '프록시 설정';
    btn.title         = '회사 보안 정책으로 가격 조회가 안 될 때 자체 프록시 URL 입력';
    btn.style.cssText = [
      'margin-left:8px',
      'padding:4px 10px',
      'font-size:12px',
      'background:#5b9bd5',
      'color:#fff',
      'border:none',
      'border-radius:3px',
      'cursor:pointer',
      'vertical-align:middle',
    ].join(';');
    btn.addEventListener('mouseenter', () => { btn.style.background = '#4682c4'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#5b9bd5'; });
    btn.addEventListener('click', _openModal);

    statusContainer.parentNode.insertBefore(btn, statusContainer.nextSibling);
  }

  function _openModal() {
    const existing = document.getElementById('customProxyModal');
    if (existing) existing.remove();

    // 현재 저장된 값을 읽어와 입력란 기본값으로 표시
    let currentValue = '';
    try {
      currentValue = localStorage.getItem(LOCAL_STORAGE_KEYS.customProxyUrl) || '';
    } catch (err) {
      // 무시 (LocalStorage 미지원 환경)
    }

    const overlay = document.createElement('div');
    overlay.id            = 'customProxyModal';
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
      'background:rgba(0,0,0,0.4)', 'z-index:9999',
      'display:flex', 'align-items:center', 'justify-content:center',
    ].join(';');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:#fff', 'border-radius:6px',
      'padding:24px 28px', 'max-width:640px', 'width:90%',
      'box-shadow:0 4px 24px rgba(0,0,0,0.2)',
      'font-family:inherit', 'color:#222',
    ].join(';');

    panel.innerHTML = _buildPanelHtml();

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // 입력값 초기화, 포커스, 핸들러 바인딩
    const input = panel.querySelector('#customProxyInput');
    const hint  = panel.querySelector('#customProxyHint');
    input.value = currentValue;
    setTimeout(() => input.focus(), 50);

    input.addEventListener('input', () => _updateHint(input, hint));
    _updateHint(input, hint);

    panel.querySelector('#customProxyCancelBtn').addEventListener('click', () => overlay.remove());
    panel.querySelector('#customProxyClearBtn').addEventListener('click', () => _clearAndClose(overlay));
    panel.querySelector('#customProxySaveBtn').addEventListener('click', () => _saveAndClose(input.value, overlay));

    // Enter 키로 저장 가능하게
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') _saveAndClose(input.value, overlay);
      if (e.key === 'Escape') overlay.remove();
    });
  }

  // 모달 본문 HTML
  function _buildPanelHtml() {
    return `
      <h3 style="margin:0 0 12px 0;font-size:16px;color:#305496;">사용자 정의 CORS 프록시 URL</h3>
      <p style="margin:0 0 12px 0;font-size:13px;line-height:1.6;color:#444;">
        회사 보안 정책이나 광고 차단기가 기본 공개 프록시(corsproxy.io 등)를
        차단하여 가격을 조회할 수 없을 때, 자체 호스팅한 프록시 URL 을
        입력하면 그 프록시를 가장 먼저 사용합니다.
      </p>
      <p style="margin:0 0 8px 0;font-size:13px;color:#444;">
        <strong>플레이스홀더</strong> (자유롭게 사용):
      </p>
      <ul style="margin:0 0 12px 18px;font-size:12px;color:#555;line-height:1.7;">
        <li><code>{ENCODED_TARGET}</code> — URL 인코딩된 타겟 (가장 흔함)</li>
        <li><code>{TARGET}</code> — 원본 타겟 URL</li>
        <li>플레이스홀더 없으면 URL 끝에 자동 추가</li>
      </ul>
      <p style="margin:0 0 4px 0;font-size:12px;color:#555;">예시:</p>
      <ul style="margin:0 0 16px 18px;font-size:11px;color:#666;font-family:monospace;line-height:1.6;">
        <li>https://my-worker.workers.dev/?url={ENCODED_TARGET}</li>
        <li>https://proxy.mycompany.local/{TARGET}</li>
        <li>https://proxy.example.com/?url=</li>
      </ul>
      <label style="display:block;margin:0 0 6px 0;font-size:13px;color:#222;font-weight:bold;">
        프록시 URL
      </label>
      <input id="customProxyInput" type="text" placeholder="https://your-proxy.example.com/?url={ENCODED_TARGET}"
             style="width:100%;padding:8px 10px;font-size:13px;font-family:monospace;
                    border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
      <p id="customProxyHint" style="margin:8px 0 0 0;font-size:11px;color:#888;min-height:14px;"></p>
      <div style="margin-top:18px;text-align:right;">
        <button id="customProxyClearBtn" type="button"
                style="padding:7px 14px;margin-right:6px;font-size:13px;
                       background:#fff;color:#a00;border:1px solid #ccc;border-radius:3px;cursor:pointer;">
          삭제 (기본 프록시 사용)
        </button>
        <button id="customProxyCancelBtn" type="button"
                style="padding:7px 14px;margin-right:6px;font-size:13px;
                       background:#fff;color:#444;border:1px solid #ccc;border-radius:3px;cursor:pointer;">
          취소
        </button>
        <button id="customProxySaveBtn" type="button"
                style="padding:7px 16px;font-size:13px;
                       background:#305496;color:#fff;border:none;border-radius:3px;cursor:pointer;font-weight:bold;">
          저장
        </button>
      </div>
    `;
  }

  // 입력 미리보기 갱신
  function _updateHint(input, hint) {
    const v = input.value.trim();
    if (!v) {
      hint.textContent = '';
      return;
    }
    try {
      const sampleTarget = 'https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview';
      const result       = _previewCustomProxyUrl(v, sampleTarget);
      hint.style.color   = '#0a7';
      hint.textContent   = `미리보기: ${result.slice(0, 120)}${result.length > 120 ? '...' : ''}`;
    } catch (err) {
      hint.style.color = '#a00';
      hint.textContent = `오류: ${err.message}`;
    }
  }

  // _buildCustomProxyUrl 과 동일한 로직 (config.js 의 내부 함수가 export 되지 않아 중복 정의)
  function _previewCustomProxyUrl(template, targetUrl) {
    if (template.includes('{ENCODED_TARGET}')) {
      return template.replace('{ENCODED_TARGET}', encodeURIComponent(targetUrl));
    }
    if (template.includes('{TARGET}')) {
      return template.replace('{TARGET}', targetUrl);
    }
    const separator = template.endsWith('=') || template.endsWith('/') || template.endsWith('?')
      ? ''
      : (template.includes('?') ? '&' : '?url=');
    return `${template}${separator}${encodeURIComponent(targetUrl)}`;
  }

  // 저장 버튼 핸들러
  function _saveAndClose(rawValue, overlay) {
    const value = String(rawValue || '').trim();
    if (!value) {
      alert('프록시 URL 을 입력하세요. (삭제하려면 "삭제" 버튼)');
      return;
    }
    if (!/^https?:\/\//i.test(value)) {
      alert('프록시 URL 은 http:// 또는 https:// 로 시작해야 합니다.');
      return;
    }
    try {
      localStorage.setItem(LOCAL_STORAGE_KEYS.customProxyUrl, value);
    } catch (err) {
      alert(`LocalStorage 저장 실패: ${err.message}`);
      return;
    }
    if (typeof reloadCustomCorsProxy === 'function') reloadCustomCorsProxy();
    if (typeof apiCache !== 'undefined') apiCache.clear();
    if (typeof setStatus === 'function') {
      setStatus('ok', '사용자 정의 프록시 적용됨. 가격 컬럼이 다시 조회됩니다.');
    }
    overlay.remove();
  }

  // 삭제 버튼 핸들러
  function _clearAndClose(overlay) {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEYS.customProxyUrl);
    } catch (err) {
      alert(`LocalStorage 삭제 실패: ${err.message}`);
      return;
    }
    if (typeof reloadCustomCorsProxy === 'function') reloadCustomCorsProxy();
    if (typeof apiCache !== 'undefined') apiCache.clear();
    if (typeof setStatus === 'function') {
      setStatus('ok', '사용자 정의 프록시 제거됨. 기본 공개 프록시만 사용합니다.');
    }
    overlay.remove();
  }
})();
