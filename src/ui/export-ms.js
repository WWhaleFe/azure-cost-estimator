// ================================================================
// ui/export-ms.js — "MS 형식으로 내보내기" 버튼 연결 (v129)
// 화면의 견적 행을 MS 가격 계산기 내보내기(ExportedEstimate.xlsx)와 같은 파일로 저장한다.
// 파일을 만드는 일은 DOM 비의존 모듈 ui/ms-estimate.js 가 한다(테스트가 원본과 대조).
// ================================================================
import { REGION_LABEL } from '../core/config.js';
import { REG } from '../core/registry.js';
import { getViewRows, calcGroup, setStatus, showToast } from '../ui-and-bootstrap.js';
import { buildMsEstimateModel, buildMsEstimateXlsx, MS_PLAN_LABEL, MS_PLAN_ITEM_KEY } from './ms-estimate.js';

/** 인스턴스 사양(vCPU/RAM) — MS 설명 문구의 "(2 vCPUs, 8 GB RAM)" 부분. */
function vmSpec(series, instance) {
  const cat = REG.VM_INSTANCE_CATALOG || {};
  const list = cat[series] || [];
  return list.find((i) => i.name === instance) || null;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportMsEstimate() {
  const rows = getViewRows().filter((r) => r.serviceCategory);
  if (rows.length === 0) { alert('내보낼 견적 행이 없습니다.'); return; }

  const planSel = document.getElementById('msExportPlan');
  const planKey = (planSel && planSel.value) || 'payg';
  const currency = document.getElementById('currencySelect').value;

  // 선택한 결제 옵션의 가격이 아직 없는 행은 0으로 나간다 — 조용히 틀리지 않도록 알린다.
  const itemKey = MS_PLAN_ITEM_KEY[planKey];
  const missing = rows.filter((r) => !r[itemKey]).length;

  const model = buildMsEstimateModel(rows, {
    planKey,
    currency,
    regionLabelMap: REGION_LABEL,
    calc: calcGroup,
    vmSpec,
  });

  const bytes = buildMsEstimateXlsx(model);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, 'ExportedEstimate.xlsx');

  const label = MS_PLAN_LABEL[planKey];
  setStatus('ok', `MS 형식 내보내기 완료 · ${rows.length}건 · ${label}`);
  if (missing > 0) {
    showToast(`${missing}개 행에 "${label}" 가격이 없어 0으로 나갔습니다. 조회 후 다시 내보내세요.`, 'info');
  }
}

const btn = document.getElementById('btnExportMs');
if (btn) btn.addEventListener('click', exportMsEstimate);
