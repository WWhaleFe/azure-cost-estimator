// ==================================================================
// diagnostics.js
// ------------------------------------------------------------------
// 페이지 로드 직후 Azure Retail Prices API 도달 가능성을 진단하고
// 결과를 화면 상단 배너 / 정중앙 모달로 노출.
//
// 진단 단계:
//   1) file:// 스킴이면 → 즉시 모달 표시 후 종료 (네트워크 호출 안 함)
//   2) <img> 기반 reachability probe → prices.azure.com 자체에 도달 가능?
//   3) 실제 fetchWithCorsFallback로 데이터 받기 → 어떤 프록시가 작동?
//
// 진단 결과 분기:
//   - probe OK + fetch OK → 정상 (배너에 ✓ 표시)
//   - probe OK + fetch FAIL → CORS/확장 차단 (도메인 도달은 됨)
//   - probe FAIL + fetch FAIL → 네트워크/방화벽 차단 (도메인 도달 자체 안 됨)
//
// F12 콘솔 안 열어도 사용자가 화면에서 진단 결과를 볼 수 있도록
// 모든 메시지를 DOM에도 표시.
// ==================================================================

// 진단 결과 타입
//   'OK'              : 정상
//   'FILE_PROTOCOL'   : file:// 로 열림
//   'NETWORK_BLOCK'   : 도메인 도달 자체 안 됨 (방화벽/회사망 차단 의심)
//   'CORS_BLOCK'      : 도달은 되나 fetch 차단 (확장/CORS 정책 의심)
//   'PROXY_DOWN'      : 모든 외부 프록시가 동시에 다운 (드뭄)
const DIAG_STATUS = {
  OK: 'OK',
  FILE_PROTOCOL: 'FILE_PROTOCOL',
  NETWORK_BLOCK: 'NETWORK_BLOCK',
  CORS_BLOCK: 'CORS_BLOCK',
  PROXY_DOWN: 'PROXY_DOWN',
};

// <img> 태그로 도메인 reachability를 확인
// CORS와 무관하게 단순히 "DNS 해소 + TCP 연결 + HTTP 응답"이 가능한지만 봄
// HTTP 4xx/5xx도 onerror 발동시키지만, "도달은 한 것"이므로 onerror 시점의
// 시간으로 판별: timeout 안에 onerror가 빨리 떨어지면 = 도달함
//   - 즉시 onerror (보통 100ms 이내): 도달 확인 (서버가 404를 빠르게 응답)
//   - timeout으로 onerror: 도달 실패 (DNS/방화벽/네트워크 단절)
async function probeReachability(domain, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const img = new Image();
    const startedAt = Date.now();
    let settled = false;

    const finish = (reachable, reason) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      const elapsed = Date.now() - startedAt;
      resolve({ reachable, elapsed, reason });
    };

    // 도달 시 (4xx 응답이라도 onerror 발동 → 빠른 응답으로 도달 확인)
    img.onerror = () => finish(true, 'fast-error (server responded)');
    img.onload = () => finish(true, 'load');

    // 도달 안 됨: timeout 내 응답 없음
    setTimeout(() => finish(false, `timeout ${timeoutMs}ms`), timeoutMs);

    // 캐시 회피용 query string
    img.src = `https://${domain}/favicon.ico?_probe=${Date.now()}`;
  });
}

// 진단 결과를 통합 객체로 반환
async function runDiagnostics() {
  const result = {
    status: null,
    fileProtocol: location.protocol === 'file:',
    probe: null,           // { reachable, elapsed, reason }
    fetchOk: false,
    activeProxy: null,
    proxyErrors: [],       // [{ name, message }]
    blockedDomains: [],    // 차단 후보 도메인 목록 (회사망 안내용)
  };

  // 1) file:// 감지 - 가장 먼저 체크 (네트워크 호출 안 함)
  if (result.fileProtocol) {
    result.status = DIAG_STATUS.FILE_PROTOCOL;
    return result;
  }

  // 2) reachability probe - prices.azure.com 도달 여부
  result.probe = await probeReachability('prices.azure.com', 5000);

  // 3) 실제 fetch 시도 - 어떤 프록시가 작동하는가
  try {
    const data = await fetchWithCorsFallback(
      `${API_BASE}?api-version=${API_VERSION}&$top=1`
    );
    if (data && Array.isArray(data.Items)) {
      result.fetchOk = true;
      result.activeProxy = CORS_PROXIES[activeProxyIndex].name;
    }
  } catch (err) {
    // fetchWithCorsFallback이 던지는 에러 메시지 파싱
    // 형식: "모든 프록시 실패 (N개 시도): name1: msg1 | name2: msg2 ..."
    const parts = err.message.split('): ');
    if (parts.length >= 2) {
      const items = parts[1].split(' | ');
      items.forEach(item => {
        const [name, ...rest] = item.split(': ');
        result.proxyErrors.push({ name, message: rest.join(': ') });
      });
    } else {
      result.proxyErrors.push({ name: 'unknown', message: err.message });
    }
  }

  // 4) 결과 분류
  if (result.fetchOk) {
    result.status = DIAG_STATUS.OK;
  } else if (!result.probe.reachable) {
    // probe 자체 실패 = prices.azure.com 도메인 도달 불가
    // → 회사망/방화벽이 외부 도메인을 일괄 차단하는 상황
    result.status = DIAG_STATUS.NETWORK_BLOCK;
    result.blockedDomains = [...CORS_PROXY_DOMAINS];
  } else {
    // probe는 됐는데 fetch는 모두 실패 = CORS/확장 차단
    // (네트워크 자체는 살아있지만 브라우저가 fetch만 막고 있음)
    // 단, 모든 프록시 에러가 'Failed to fetch'이고 probe도 됐다면
    // 확장 또는 보안 브라우저가 막고 있을 가능성이 높음
    const allFailedToFetch = result.proxyErrors.every(
      e => /failed to fetch/i.test(e.message)
    );
    result.status = allFailedToFetch ? DIAG_STATUS.CORS_BLOCK : DIAG_STATUS.PROXY_DOWN;
  }

  return result;
}

// ==================================================================
// UI: 상단 배너 갱신 (#connectionStatus)
// ==================================================================
function updateConnectionBanner(diag) {
  const $status = document.getElementById('connectionStatus');
  if (!$status) return;

  if (diag.status === DIAG_STATUS.OK) {
    $status.textContent = `✓ 연결 정상 (프록시: ${diag.activeProxy})`;
    $status.style.color = '#0e7c0e';
    return;
  }

  // 실패 케이스 - 배너에 짧은 메시지, 자세한 내용은 모달로
  const labels = {
    [DIAG_STATUS.FILE_PROTOCOL]: '✗ file:// 감지 - 로컬 웹서버 필요',
    [DIAG_STATUS.NETWORK_BLOCK]: '✗ 외부 네트워크 차단 - 회사망 확인 필요',
    [DIAG_STATUS.CORS_BLOCK]:    '✗ 브라우저 차단 - 확장/보안 정책 확인 필요',
    [DIAG_STATUS.PROXY_DOWN]:    '✗ 모든 프록시 응답 없음',
  };
  $status.textContent = labels[diag.status] || '✗ 연결 실패';
  $status.style.color = '#d13438';
  $status.style.cursor = 'pointer';
  $status.style.textDecoration = 'underline';
  $status.title = '클릭하면 자세한 진단 결과를 봅니다';
  $status.onclick = () => showDiagnosticModal(diag);
}

// ==================================================================
// UI: 정중앙 진단 모달
// ==================================================================
function showDiagnosticModal(diag) {
  // 기존 모달 제거
  const existing = document.getElementById('diagModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'diagModal';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background: #fff; max-width: 640px; width: calc(100% - 40px);
    max-height: 85vh; overflow-y: auto;
    border-radius: 4px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    padding: 24px;
  `;
  card.innerHTML = renderDiagContent(diag);
  overlay.appendChild(card);

  // 닫기 동작 (모달 외부 클릭, 닫기 버튼)
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);

  const $closeBtn = card.querySelector('[data-action="close"]');
  if ($closeBtn) $closeBtn.onclick = close;

  // 명령어 복사 버튼들
  card.querySelectorAll('[data-copy]').forEach(btn => {
    btn.onclick = async () => {
      const text = btn.getAttribute('data-copy');
      try {
        await navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = '복사됨';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      } catch (e) {
        // clipboard API가 막힌 환경에서는 textarea 폴백
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch {}
        ta.remove();
        btn.textContent = '복사됨';
        setTimeout(() => { btn.textContent = '복사'; }, 1500);
      }
    };
  });
}

// 모달 본문 HTML 생성 - 진단 상태별로 분기
function renderDiagContent(diag) {
  const head = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="margin:0; font-size:18px; color:#d13438;">연결 진단 결과</h2>
      <button data-action="close" style="
        border:none; background:#f3f2f1; padding:6px 12px;
        border-radius:2px; cursor:pointer; font-size:13px;
      ">닫기</button>
    </div>
  `;

  let body = '';
  switch (diag.status) {
    case DIAG_STATUS.FILE_PROTOCOL:
      body = renderFileProtocolGuide();
      break;
    case DIAG_STATUS.NETWORK_BLOCK:
      body = renderNetworkBlockGuide(diag);
      break;
    case DIAG_STATUS.CORS_BLOCK:
      body = renderCorsBlockGuide(diag);
      break;
    case DIAG_STATUS.PROXY_DOWN:
      body = renderProxyDownGuide(diag);
      break;
    default:
      body = '<p>알 수 없는 상태</p>';
  }

  return head + body + renderDiagDetails(diag);
}

// file:// 가이드 - 가장 흔한 케이스
function renderFileProtocolGuide() {
  // 현재 파일 경로에서 디렉토리만 추출 (Windows/Unix 호환)
  // file:///C:/path/to/index.html → C:/path/to
  // file:///home/user/v29/index.html → /home/user/v29
  let dir = '';
  try {
    const path = decodeURIComponent(location.pathname);
    const lastSlash = path.lastIndexOf('/');
    dir = lastSlash > 0 ? path.slice(0, lastSlash) : '';
    // Windows: 앞의 / 제거 → /C:/path → C:/path
    if (/^\/[A-Za-z]:/.test(dir)) dir = dir.slice(1);
  } catch (e) {
    dir = '';
  }

  const cmdPython = dir ? `cd "${dir}" && python -m http.server 8000` : 'python -m http.server 8000';
  const cmdNode = dir ? `cd "${dir}" && npx http-server -p 8000` : 'npx http-server -p 8000';
  const targetUrl = 'http://localhost:8000/index.html';

  return `
    <p style="margin:0 0 12px 0; font-size:13px; color:#323130;">
      HTML을 <strong>file://</strong> 로 열었습니다.
      브라우저는 이 환경에서 외부 API 호출을 차단합니다.
      <strong>로컬 웹서버로 띄워야 합니다.</strong>
    </p>

    <h3 style="font-size:14px; margin:20px 0 8px 0;">1. 터미널/명령 프롬프트를 엽니다</h3>

    <h3 style="font-size:14px; margin:16px 0 8px 0;">2. 다음 명령 중 하나를 실행 (Python 권장)</h3>
    <div style="background:#f3f2f1; border-radius:2px; padding:10px; margin-bottom:8px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <code style="font-size:12px; color:#0050a0; word-break:break-all; flex:1;">${escapeHtmlSafe(cmdPython)}</code>
        <button data-copy="${escapeHtmlSafe(cmdPython)}" style="
          background:#0078d4; color:#fff; border:none;
          padding:4px 10px; border-radius:2px; cursor:pointer; font-size:12px;
          flex-shrink:0;
        ">복사</button>
      </div>
    </div>
    <div style="background:#f3f2f1; border-radius:2px; padding:10px; margin-bottom:8px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <code style="font-size:12px; color:#0050a0; word-break:break-all; flex:1;">${escapeHtmlSafe(cmdNode)}</code>
        <button data-copy="${escapeHtmlSafe(cmdNode)}" style="
          background:#0078d4; color:#fff; border:none;
          padding:4px 10px; border-radius:2px; cursor:pointer; font-size:12px;
          flex-shrink:0;
        ">복사</button>
      </div>
    </div>

    <h3 style="font-size:14px; margin:16px 0 8px 0;">3. 브라우저에서 열기</h3>
    <div style="background:#f3f2f1; border-radius:2px; padding:10px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <code style="font-size:12px; color:#0050a0;">${targetUrl}</code>
        <button data-copy="${targetUrl}" style="
          background:#0078d4; color:#fff; border:none;
          padding:4px 10px; border-radius:2px; cursor:pointer; font-size:12px;
        ">복사</button>
      </div>
    </div>

    <p style="margin:14px 0 0 0; font-size:11px; color:#605e5c;">
      Python 미설치 시: <a href="https://www.python.org/downloads/" target="_blank" style="color:#0078d4;">python.org</a> 에서 설치 (3.x 권장).
      Node.js: <a href="https://nodejs.org/" target="_blank" style="color:#0078d4;">nodejs.org</a>.
    </p>
  `;
}

// 네트워크 차단 (회사망/방화벽) 가이드
function renderNetworkBlockGuide(diag) {
  const probeMs = diag.probe ? diag.probe.elapsed : 0;
  const domainList = diag.blockedDomains.map(d => `<li><code>${d}</code></li>`).join('');

  return `
    <p style="margin:0 0 12px 0; font-size:13px; color:#323130;">
      <strong>prices.azure.com</strong> 도메인 자체에 도달하지 못했습니다 (probe ${probeMs}ms timeout).
      회사 보안 정책 / 방화벽이 외부 도메인 접근을 차단하고 있을 가능성이 높습니다.
    </p>

    <h3 style="font-size:14px; margin:16px 0 8px 0;">IT/보안팀에 다음을 요청하세요</h3>
    <p style="font-size:12px; color:#323130; margin:0 0 8px 0;">
      아래 도메인들을 화이트리스트(허용 목록)에 추가해 주세요.
      Azure 공시 가격 조회 및 CORS 우회를 위해 필요합니다.
    </p>
    <ul style="font-size:12px; margin:0 0 12px 0; padding-left:20px; line-height:1.8;">
      ${domainList}
    </ul>
    <button data-copy="${diag.blockedDomains.join('\n')}" style="
      background:#0078d4; color:#fff; border:none;
      padding:6px 14px; border-radius:2px; cursor:pointer; font-size:12px;
    ">전체 도메인 복사 (IT팀 전달용)</button>

    <h3 style="font-size:14px; margin:20px 0 8px 0;">대안: 개인 환경에서 한 번 실행 후 결과만 받기</h3>
    <p style="font-size:12px; color:#605e5c; margin:0;">
      이 도구는 <strong>읽기 전용</strong>이며 외부에 어떤 데이터도 송신하지 않습니다.
      회사망에서 사용 불가 시, 개인 노트북에서 실행 후 엑셀로 내보내 사내에 공유하는 방법을 권장드립니다.
    </p>
  `;
}

// CORS/확장 차단 가이드
function renderCorsBlockGuide(diag) {
  return `
    <p style="margin:0 0 12px 0; font-size:13px; color:#323130;">
      도메인 도달은 가능하나 (probe OK, ${diag.probe.elapsed}ms),
      모든 fetch 요청이 브라우저에서 차단됩니다.
      <strong>광고 차단/보안 확장 또는 회사 보안 브라우저 정책</strong>이 원인일 가능성이 큽니다.
    </p>

    <h3 style="font-size:14px; margin:16px 0 8px 0;">시도 1. 시크릿(InPrivate) 창에서 다시 열기</h3>
    <p style="font-size:12px; color:#605e5c; margin:0 0 12px 0;">
      대부분의 확장은 시크릿 창에서 비활성화됩니다.
      <br>Chrome: <code>Ctrl+Shift+N</code> · Edge: <code>Ctrl+Shift+N</code> · Firefox: <code>Ctrl+Shift+P</code>
    </p>

    <h3 style="font-size:14px; margin:16px 0 8px 0;">시도 2. 다음 확장을 일시 중지</h3>
    <ul style="font-size:12px; margin:0 0 12px 0; padding-left:20px; line-height:1.8;">
      <li>uBlock Origin / AdGuard / AdBlock Plus</li>
      <li>NoScript / Privacy Badger / Ghostery</li>
      <li>회사 배포 보안 확장 (이름은 환경마다 다름)</li>
    </ul>

    <h3 style="font-size:14px; margin:16px 0 8px 0;">시도 3. 다른 브라우저로 열기</h3>
    <p style="font-size:12px; color:#605e5c; margin:0 0 12px 0;">
      회사 표준 브라우저가 보안 프록시를 통해 외부 도메인을 가로챌 수 있습니다.
      Edge / Chrome / Firefox 중 다른 브라우저로 시도해 보세요.
    </p>

    <h3 style="font-size:14px; margin:16px 0 8px 0;">차단된 도메인 목록</h3>
    <p style="font-size:12px; color:#605e5c; margin:0 0 8px 0;">
      이 중 하나라도 화이트리스트에 추가되면 동작합니다 (가장 안정적인 것: corsproxy.io).
    </p>
    <button data-copy="${diag.blockedDomains.length ? diag.blockedDomains.join('\n') : CORS_PROXY_DOMAINS.join('\n')}" style="
      background:#0078d4; color:#fff; border:none;
      padding:6px 14px; border-radius:2px; cursor:pointer; font-size:12px;
    ">도메인 목록 복사</button>
  `;
}

// 프록시 일괄 다운 (드물지만 가능)
function renderProxyDownGuide(diag) {
  const errList = diag.proxyErrors.map(e =>
    `<li><strong>${e.name}</strong>: <code style="font-size:11px;">${escapeHtmlSafe(e.message)}</code></li>`
  ).join('');

  return `
    <p style="margin:0 0 12px 0; font-size:13px; color:#323130;">
      도메인 도달은 가능하지만, 시도한 모든 프록시가 다양한 이유로 실패했습니다.
      무료 CORS 프록시들이 동시에 다운되었거나 정책이 변경되었을 수 있습니다.
    </p>

    <h3 style="font-size:14px; margin:16px 0 8px 0;">프록시별 실패 사유</h3>
    <ul style="font-size:12px; margin:0; padding-left:20px; line-height:1.8;">
      ${errList}
    </ul>

    <p style="margin:16px 0 0 0; font-size:12px; color:#605e5c;">
      잠시 후 (5~10분) 다시 시도해 주세요. 문제가 지속되면 개발자에게 문의 바랍니다.
    </p>
  `;
}

// 진단 상세 정보 (모든 케이스 공통, 접을 수 있게)
function renderDiagDetails(diag) {
  const probeText = diag.probe
    ? `${diag.probe.reachable ? 'OK' : 'FAIL'} (${diag.probe.elapsed}ms, ${escapeHtmlSafe(diag.probe.reason)})`
    : 'skipped';
  const proxyErrText = diag.proxyErrors.length
    ? diag.proxyErrors.map(e => `  ${e.name}: ${e.message}`).join('\n')
    : '(no errors)';

  return `
    <details style="margin-top:20px; font-size:11px; color:#605e5c;">
      <summary style="cursor:pointer; user-select:none;">진단 상세 정보 (개발자용)</summary>
      <pre style="background:#f3f2f1; padding:10px; border-radius:2px; margin-top:8px; overflow-x:auto; font-size:11px; line-height:1.5;">status: ${diag.status}
location.protocol: ${location.protocol}
location.href: ${escapeHtmlSafe(location.href)}
userAgent: ${escapeHtmlSafe(navigator.userAgent)}
probe(prices.azure.com): ${probeText}
fetchOk: ${diag.fetchOk}
activeProxy: ${diag.activeProxy || 'n/a'}
proxyErrors:
${escapeHtmlSafe(proxyErrText)}</pre>
    </details>
  `;
}

// HTML escape (diagnostics.js 내부 전용 - matchers.js의 escapeHtml과 충돌 방지)
function escapeHtmlSafe(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================================================================
// 부트스트랩 - 페이지 로드 직후 실행
// main.js / ui-and-bootstrap.js에서 setStatus('ok', '준비 완료') 후
// 이 함수를 명시적으로 호출
// ==================================================================
async function bootDiagnostics() {
  // file:// 즉시 감지 → 모달 강제 표시 (네트워크 호출 안 함)
  if (location.protocol === 'file:') {
    const diag = {
      status: DIAG_STATUS.FILE_PROTOCOL,
      fileProtocol: true,
      probe: null,
      fetchOk: false,
      activeProxy: null,
      proxyErrors: [],
      blockedDomains: [],
    };
    updateConnectionBanner(diag);
    showDiagnosticModal(diag);
    console.error('[진단] file:// 환경에서는 외부 API 호출 불가. 로컬 웹서버 필요.');
    return diag;
  }

  // 정상 환경: 진단 실행 후 결과에 따라 분기
  const diag = await runDiagnostics();
  updateConnectionBanner(diag);

  // OK가 아닌 모든 케이스는 자동으로 모달 노출
  if (diag.status !== DIAG_STATUS.OK) {
    showDiagnosticModal(diag);
    console.error(`[진단] ${diag.status}`, diag);
  } else {
    console.log(`[진단] OK (프록시: ${diag.activeProxy})`);
  }

  return diag;
}
