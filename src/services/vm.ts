import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, showToast, normalizeReservationPrice, makeSpItem, spItemsFromBase, riItemsFromResv, probeRegions, regionHint } from '../core/kernel.js';
import { REGION_LABEL } from '../core/config.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/vm.js — Virtual Machine
// 수정 대상: VM 시리즈/인스턴스 목록, OS/유형(SW)/라이선스 옵션, 가격 매칭 로직
// ================================================================

// 전체 시리즈 목록(범주=전체에서 사용)
var _VM_ALL_SERIES = ['B-series','Bs-series v2','Bas-series v2 (AMD)','D-series v3','D-series v4','D-series v5','D-series v6','Dd-series v6','Das-series v5 (AMD)','Das-series v6 (AMD)','D-series v7','Dd-series v7','Das-series v7 (AMD)','Dad-series v7 (AMD)','E-series v3','E-series v4','E-series v5','E-series v6','Ed-series v6','Eas-series v5 (AMD)','Eas-series v6 (AMD)','Ead-series v6 (AMD)','E-series v7','Ed-series v7','Eas-series v7 (AMD)','Ead-series v7 (AMD)','F-series v2','Fas-series v7 (AMD)','Fals-series v7 (AMD)','L-series v3','Las-series v3 (AMD)','L-series v4','Las-series v4 (AMD)','M-series','Ms-series v3 (Medium Memory)','Mds-series v3 (Medium Memory)','N-series (GPU)','NC A100 v4 (GPU)','NC H100 v5 (GPU)','ND A100 v4 (GPU)','ND H100 v5 (GPU)','A-series v2','FX-series','HB-series v4 (HPC)','HC-series (HPC)','HX-series (HPC)'];
// 범주(계산기 'Category')별 시리즈 — 계산기 라벨과 동일
var _VM_CATEGORY_SERIES: Record<string,string[]> = {
  '전체':            _VM_ALL_SERIES,
  '일반적인 용도':    ['B-series','Bs-series v2','Bas-series v2 (AMD)','D-series v3','D-series v4','D-series v5','D-series v6','Dd-series v6','Das-series v5 (AMD)','Das-series v6 (AMD)','D-series v7','Dd-series v7','Das-series v7 (AMD)','Dad-series v7 (AMD)','A-series v2'],
  '컴퓨팅 최적화':    ['F-series v2','Fas-series v7 (AMD)','Fals-series v7 (AMD)','FX-series'],
  '메모리에 최적화':  ['E-series v3','E-series v4','E-series v5','E-series v6','Ed-series v6','Eas-series v5 (AMD)','Eas-series v6 (AMD)','Ead-series v6 (AMD)','E-series v7','Ed-series v7','Eas-series v7 (AMD)','Ead-series v7 (AMD)','M-series','Ms-series v3 (Medium Memory)','Mds-series v3 (Medium Memory)'],
  'Storage에 최적화': ['L-series v3','Las-series v3 (AMD)','L-series v4','Las-series v4 (AMD)'],
  'GPU':             ['N-series (GPU)','NC A100 v4 (GPU)','NC H100 v5 (GPU)','ND A100 v4 (GPU)','ND H100 v5 (GPU)'],
  '고성능 컴퓨팅':    ['HB-series v4 (HPC)','HC-series (HPC)','HX-series (HPC)'],
};

// 카테고리 정의 등록
REG._svcDefs['Virtual Machine'] = {
  apiServiceName: 'Virtual Machines',
  steps: [
    { key:'os',       label:'운영 체제', options:['Linux','Windows','Red Hat Enterprise Linux','SUSE'] },
    { key:'swType',   label:'유형',      options:['(OS Only)','SQL Server (Enterprise)','SQL Server (Standard)','SQL Server (Web)','BizTalk Server (Enterprise)','BizTalk Server (Standard)'] },
    { key:'tier',     label:'계층',      options:['Standard','Basic','Spot'] },
    { key:'license',  label:'라이선스',  options:['라이선스 포함','Azure Hybrid Benefit'] },
    { key:'category', label:'범주',      options:['전체','일반적인 용도','컴퓨팅 최적화','메모리에 최적화','Storage에 최적화','GPU','고성능 컴퓨팅'] },
    { key:'series',   label:'인스턴스 시리즈', options:_VM_ALL_SERIES.slice() },
  ],
  instanceField: true,
  instanceParentKey: 'series',
  // 범주·계층 변경 시 시리즈 옵션을 다시 구성(계산기 범주→시리즈→인스턴스 흐름. Basic 계층은 A-series Basic 전용)
  rebuildKeys: ['category','tier'],
  _applyStepVisibility: function(r){ if (REG['_vm_applyStepVisibility']) REG['_vm_applyStepVisibility'](r); },
};

REG['_vm_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Virtual Machine'];
  if (!def || !def.steps) return;
  var o = r.options || {};
  // Basic 계층은 A-series Basic 전용(범주 무관). 그 외는 범주별 시리즈.
  var isBasic = (o.tier === 'Basic');
  var cat = o.category || '전체';
  var list = isBasic ? ['A-series (Basic)'] : (_VM_CATEGORY_SERIES[cat] || _VM_ALL_SERIES);
  for (var i = 0; i < def.steps.length; i++) {
    var step = def.steps[i];
    if (step.key === 'category') { step._hidden = isBasic; continue; }  // Basic은 범주 비활성
    if (step.key !== 'series') continue;
    step.options = list;
    if (list.indexOf(o.series) < 0) { r.options.series = list[0]; r.options.instance = ''; }
  }
};

// 전역 노출 (ui-and-bootstrap.js 에서 접근)
// koreacentral 라이브 API(serviceName='Virtual Machines', Consumption)로 가격 조회가 검증된 SKU만 수록.
// vCPU=SKU명 파싱, RAM=시리즈 표준 사양(M/N 일부 사이즈는 사양 미상이라 RAM 생략 → 라벨에 vCPU만 표시).
// 다른 리전에선 일부 SKU가 없을 수 있음(그 경우 해당 인스턴스는 "매칭 없음"으로 표시).
var VM_INSTANCE_CATALOG: Record<string, Array<{ name: string; vCPU: number; ram?: number }>> = REG.VM_INSTANCE_CATALOG = {
  'B-series': [{name:'B1ls',vCPU:1,ram:0.5},{name:'B1s',vCPU:1,ram:1},{name:'B1ms',vCPU:1,ram:2},{name:'B2s',vCPU:2,ram:4},{name:'B2ms',vCPU:2,ram:8},{name:'B4ms',vCPU:4,ram:16},{name:'B8ms',vCPU:8,ram:32},{name:'B12ms',vCPU:12,ram:48},{name:'B16ms',vCPU:16,ram:64},{name:'B20ms',vCPU:20,ram:80}],
  // 버스터블 v2 (Intel Bsv2 / AMD Basv2). armSkuName='Standard_<name>'으로 조회.
  'Bs-series v2': [{name:'B2ts_v2',vCPU:2,ram:1},{name:'B2ls_v2',vCPU:2,ram:4},{name:'B2s_v2',vCPU:2,ram:8},{name:'B4ls_v2',vCPU:4,ram:8},{name:'B4s_v2',vCPU:4,ram:16},{name:'B8ls_v2',vCPU:8,ram:16},{name:'B8s_v2',vCPU:8,ram:32},{name:'B16ls_v2',vCPU:16,ram:32},{name:'B16s_v2',vCPU:16,ram:64},{name:'B32ls_v2',vCPU:32,ram:64},{name:'B32s_v2',vCPU:32,ram:128}],
  'Bas-series v2 (AMD)': [{name:'B2ats_v2',vCPU:2,ram:1},{name:'B2als_v2',vCPU:2,ram:4},{name:'B2as_v2',vCPU:2,ram:8},{name:'B4als_v2',vCPU:4,ram:8},{name:'B4as_v2',vCPU:4,ram:16},{name:'B8als_v2',vCPU:8,ram:16},{name:'B8as_v2',vCPU:8,ram:32},{name:'B16als_v2',vCPU:16,ram:32},{name:'B16as_v2',vCPU:16,ram:64},{name:'B32als_v2',vCPU:32,ram:64},{name:'B32as_v2',vCPU:32,ram:128}],
  'D-series v3': [{name:'D2s_v3',vCPU:2,ram:8},{name:'D4s_v3',vCPU:4,ram:16},{name:'D8s_v3',vCPU:8,ram:32},{name:'D16s_v3',vCPU:16,ram:64},{name:'D32s_v3',vCPU:32,ram:128},{name:'D48s_v3',vCPU:48,ram:192},{name:'D64s_v3',vCPU:64,ram:256}],
  'D-series v4': [{name:'D2s_v4',vCPU:2,ram:8},{name:'D4s_v4',vCPU:4,ram:16},{name:'D8s_v4',vCPU:8,ram:32},{name:'D16s_v4',vCPU:16,ram:64},{name:'D32s_v4',vCPU:32,ram:128},{name:'D48s_v4',vCPU:48,ram:192},{name:'D64s_v4',vCPU:64,ram:256}],
  'D-series v5': [{name:'D2s_v5',vCPU:2,ram:8},{name:'D4s_v5',vCPU:4,ram:16},{name:'D8s_v5',vCPU:8,ram:32},{name:'D16s_v5',vCPU:16,ram:64},{name:'D32s_v5',vCPU:32,ram:128},{name:'D48s_v5',vCPU:48,ram:192},{name:'D64s_v5',vCPU:64,ram:256},{name:'D96s_v5',vCPU:96,ram:384}],
  'D-series v6': [{name:'D2s_v6',vCPU:2,ram:8},{name:'D4s_v6',vCPU:4,ram:16},{name:'D8s_v6',vCPU:8,ram:32},{name:'D16s_v6',vCPU:16,ram:64},{name:'D32s_v6',vCPU:32,ram:128},{name:'D48s_v6',vCPU:48,ram:192},{name:'D64s_v6',vCPU:64,ram:256},{name:'D96s_v6',vCPU:96,ram:384},{name:'D128s_v6',vCPU:128,ram:512},{name:'D192s_v6',vCPU:192,ram:768}],
  'Dd-series v6': [{name:'D2ds_v6',vCPU:2,ram:8},{name:'D4ds_v6',vCPU:4,ram:16},{name:'D8ds_v6',vCPU:8,ram:32},{name:'D16ds_v6',vCPU:16,ram:64},{name:'D32ds_v6',vCPU:32,ram:128},{name:'D48ds_v6',vCPU:48,ram:192},{name:'D64ds_v6',vCPU:64,ram:256},{name:'D96ds_v6',vCPU:96,ram:384},{name:'D128ds_v6',vCPU:128,ram:512},{name:'D192ds_v6',vCPU:192,ram:768}],
  'Das-series v5 (AMD)': [{name:'D2as_v5',vCPU:2,ram:8},{name:'D4as_v5',vCPU:4,ram:16},{name:'D8as_v5',vCPU:8,ram:32},{name:'D16as_v5',vCPU:16,ram:64},{name:'D32as_v5',vCPU:32,ram:128},{name:'D48as_v5',vCPU:48,ram:192},{name:'D64as_v5',vCPU:64,ram:256},{name:'D96as_v5',vCPU:96,ram:384}],
  'Das-series v6 (AMD)': [{name:'D2as_v6',vCPU:2,ram:8},{name:'D4as_v6',vCPU:4,ram:16},{name:'D8as_v6',vCPU:8,ram:32},{name:'D16as_v6',vCPU:16,ram:64},{name:'D32as_v6',vCPU:32,ram:128},{name:'D48as_v6',vCPU:48,ram:192},{name:'D64as_v6',vCPU:64,ram:256},{name:'D96as_v6',vCPU:96,ram:384}],
  // 범용 v7 (Intel Dsv7/Ddsv7=4GB/vCPU, AMD Dasv7/Dadsv7=4GB/vCPU). 248/372 사이즈는 GA 예정이라 제외.
  'D-series v7': [{name:'D2s_v7',vCPU:2,ram:8},{name:'D4s_v7',vCPU:4,ram:16},{name:'D8s_v7',vCPU:8,ram:32},{name:'D16s_v7',vCPU:16,ram:64},{name:'D32s_v7',vCPU:32,ram:128},{name:'D48s_v7',vCPU:48,ram:192},{name:'D64s_v7',vCPU:64,ram:256},{name:'D96s_v7',vCPU:96,ram:384},{name:'D128s_v7',vCPU:128,ram:512},{name:'D192s_v7',vCPU:192,ram:768}],
  'Dd-series v7': [{name:'D2ds_v7',vCPU:2,ram:8},{name:'D4ds_v7',vCPU:4,ram:16},{name:'D8ds_v7',vCPU:8,ram:32},{name:'D16ds_v7',vCPU:16,ram:64},{name:'D32ds_v7',vCPU:32,ram:128},{name:'D48ds_v7',vCPU:48,ram:192},{name:'D64ds_v7',vCPU:64,ram:256},{name:'D96ds_v7',vCPU:96,ram:384},{name:'D128ds_v7',vCPU:128,ram:512},{name:'D192ds_v7',vCPU:192,ram:768}],
  'Das-series v7 (AMD)': [{name:'D2as_v7',vCPU:2,ram:8},{name:'D4as_v7',vCPU:4,ram:16},{name:'D8as_v7',vCPU:8,ram:32},{name:'D16as_v7',vCPU:16,ram:64},{name:'D32as_v7',vCPU:32,ram:128},{name:'D48as_v7',vCPU:48,ram:192},{name:'D64as_v7',vCPU:64,ram:256},{name:'D96as_v7',vCPU:96,ram:384},{name:'D128as_v7',vCPU:128,ram:512},{name:'D160as_v7',vCPU:160,ram:640}],
  'Dad-series v7 (AMD)': [{name:'D2ads_v7',vCPU:2,ram:8},{name:'D4ads_v7',vCPU:4,ram:16},{name:'D8ads_v7',vCPU:8,ram:32},{name:'D16ads_v7',vCPU:16,ram:64},{name:'D32ads_v7',vCPU:32,ram:128},{name:'D48ads_v7',vCPU:48,ram:192},{name:'D64ads_v7',vCPU:64,ram:256},{name:'D96ads_v7',vCPU:96,ram:384},{name:'D128ads_v7',vCPU:128,ram:512},{name:'D160ads_v7',vCPU:160,ram:640}],
  'E-series v3': [{name:'E2s_v3',vCPU:2,ram:16},{name:'E4s_v3',vCPU:4,ram:32},{name:'E8s_v3',vCPU:8,ram:64},{name:'E16s_v3',vCPU:16,ram:128},{name:'E20s_v3',vCPU:20,ram:160},{name:'E32s_v3',vCPU:32,ram:256},{name:'E48s_v3',vCPU:48,ram:384},{name:'E64s_v3',vCPU:64,ram:432}],
  'E-series v4': [{name:'E2s_v4',vCPU:2,ram:16},{name:'E4s_v4',vCPU:4,ram:32},{name:'E8s_v4',vCPU:8,ram:64},{name:'E16s_v4',vCPU:16,ram:128},{name:'E20s_v4',vCPU:20,ram:160},{name:'E32s_v4',vCPU:32,ram:256},{name:'E48s_v4',vCPU:48,ram:384},{name:'E64s_v4',vCPU:64,ram:504}],
  'E-series v5': [{name:'E2s_v5',vCPU:2,ram:16},{name:'E4s_v5',vCPU:4,ram:32},{name:'E8s_v5',vCPU:8,ram:64},{name:'E16s_v5',vCPU:16,ram:128},{name:'E20s_v5',vCPU:20,ram:160},{name:'E32s_v5',vCPU:32,ram:256},{name:'E48s_v5',vCPU:48,ram:384},{name:'E64s_v5',vCPU:64,ram:512},{name:'E96s_v5',vCPU:96,ram:672}],
  'E-series v6': [{name:'E2s_v6',vCPU:2,ram:16},{name:'E4s_v6',vCPU:4,ram:32},{name:'E8s_v6',vCPU:8,ram:64},{name:'E16s_v6',vCPU:16,ram:128},{name:'E20s_v6',vCPU:20,ram:160},{name:'E32s_v6',vCPU:32,ram:256},{name:'E48s_v6',vCPU:48,ram:384},{name:'E64s_v6',vCPU:64,ram:512},{name:'E96s_v6',vCPU:96,ram:768},{name:'E128s_v6',vCPU:128,ram:1024}],
  'Ed-series v6': [{name:'E2ds_v6',vCPU:2,ram:16},{name:'E4ds_v6',vCPU:4,ram:32},{name:'E8ds_v6',vCPU:8,ram:64},{name:'E16ds_v6',vCPU:16,ram:128},{name:'E20ds_v6',vCPU:20,ram:160},{name:'E32ds_v6',vCPU:32,ram:256},{name:'E48ds_v6',vCPU:48,ram:384},{name:'E64ds_v6',vCPU:64,ram:512},{name:'E96ds_v6',vCPU:96,ram:768},{name:'E128ds_v6',vCPU:128,ram:1024}],
  'Eas-series v5 (AMD)': [{name:'E2as_v5',vCPU:2,ram:16},{name:'E4as_v5',vCPU:4,ram:32},{name:'E8as_v5',vCPU:8,ram:64},{name:'E16as_v5',vCPU:16,ram:128},{name:'E20as_v5',vCPU:20,ram:160},{name:'E32as_v5',vCPU:32,ram:256},{name:'E48as_v5',vCPU:48,ram:384},{name:'E64as_v5',vCPU:64,ram:512},{name:'E96as_v5',vCPU:96,ram:672}],
  // 메모리 최적화 AMD v6 (Easv6/Eadsv6 = EPYC Genoa, 8GB/vCPU, E96만 672GB). armSkuName='Standard_<name>'.
  'Eas-series v6 (AMD)': [{name:'E2as_v6',vCPU:2,ram:16},{name:'E4as_v6',vCPU:4,ram:32},{name:'E8as_v6',vCPU:8,ram:64},{name:'E16as_v6',vCPU:16,ram:128},{name:'E20as_v6',vCPU:20,ram:160},{name:'E32as_v6',vCPU:32,ram:256},{name:'E48as_v6',vCPU:48,ram:384},{name:'E64as_v6',vCPU:64,ram:512},{name:'E96as_v6',vCPU:96,ram:672}],
  'Ead-series v6 (AMD)': [{name:'E2ads_v6',vCPU:2,ram:16},{name:'E4ads_v6',vCPU:4,ram:32},{name:'E8ads_v6',vCPU:8,ram:64},{name:'E16ads_v6',vCPU:16,ram:128},{name:'E20ads_v6',vCPU:20,ram:160},{name:'E32ads_v6',vCPU:32,ram:256},{name:'E48ads_v6',vCPU:48,ram:384},{name:'E64ads_v6',vCPU:64,ram:512},{name:'E96ads_v6',vCPU:96,ram:672}],
  // 메모리 최적화 v7 (Intel Esv7/Edsv7 8GB/vCPU, AMD Easv7/Eadsv7). 248/372 사이즈는 GA 예정이라 제외.
  'E-series v7': [{name:'E2s_v7',vCPU:2,ram:16},{name:'E4s_v7',vCPU:4,ram:32},{name:'E8s_v7',vCPU:8,ram:64},{name:'E16s_v7',vCPU:16,ram:128},{name:'E20s_v7',vCPU:20,ram:160},{name:'E32s_v7',vCPU:32,ram:256},{name:'E48s_v7',vCPU:48,ram:384},{name:'E64s_v7',vCPU:64,ram:512},{name:'E96s_v7',vCPU:96,ram:768},{name:'E128s_v7',vCPU:128,ram:1024},{name:'E192s_v7',vCPU:192,ram:1536}],
  'Ed-series v7': [{name:'E2ds_v7',vCPU:2,ram:16},{name:'E4ds_v7',vCPU:4,ram:32},{name:'E8ds_v7',vCPU:8,ram:64},{name:'E16ds_v7',vCPU:16,ram:128},{name:'E20ds_v7',vCPU:20,ram:160},{name:'E32ds_v7',vCPU:32,ram:256},{name:'E48ds_v7',vCPU:48,ram:384},{name:'E64ds_v7',vCPU:64,ram:512},{name:'E96ds_v7',vCPU:96,ram:768},{name:'E128ds_v7',vCPU:128,ram:1024},{name:'E192ds_v7',vCPU:192,ram:1536}],
  'Eas-series v7 (AMD)': [{name:'E2as_v7',vCPU:2,ram:16},{name:'E4as_v7',vCPU:4,ram:32},{name:'E8as_v7',vCPU:8,ram:64},{name:'E16as_v7',vCPU:16,ram:128},{name:'E32as_v7',vCPU:32,ram:256},{name:'E48as_v7',vCPU:48,ram:384},{name:'E64as_v7',vCPU:64,ram:512},{name:'E96as_v7',vCPU:96,ram:768},{name:'E128as_v7',vCPU:128,ram:1024},{name:'E160as_v7',vCPU:160,ram:1280}],
  'Ead-series v7 (AMD)': [{name:'E2ads_v7',vCPU:2,ram:16},{name:'E4ads_v7',vCPU:4,ram:32},{name:'E8ads_v7',vCPU:8,ram:64},{name:'E16ads_v7',vCPU:16,ram:128},{name:'E32ads_v7',vCPU:32,ram:256},{name:'E48ads_v7',vCPU:48,ram:384},{name:'E64ads_v7',vCPU:64,ram:512},{name:'E96ads_v7',vCPU:96,ram:768},{name:'E128ads_v7',vCPU:128,ram:1024}],
  'F-series v2': [{name:'F2s_v2',vCPU:2,ram:4},{name:'F4s_v2',vCPU:4,ram:8},{name:'F8s_v2',vCPU:8,ram:16},{name:'F16s_v2',vCPU:16,ram:32},{name:'F32s_v2',vCPU:32,ram:64},{name:'F48s_v2',vCPU:48,ram:96},{name:'F64s_v2',vCPU:64,ram:128},{name:'F72s_v2',vCPU:72,ram:144}],
  // 컴퓨팅 v7 (AMD EPYC Turin, SMT 없는 풀코어). Fasv7=4GB/vCPU, Falsv7=2GB/vCPU(저메모리). 로컬디스크 없음.
  'Fas-series v7 (AMD)': [{name:'F1as_v7',vCPU:1,ram:4},{name:'F2as_v7',vCPU:2,ram:8},{name:'F4as_v7',vCPU:4,ram:16},{name:'F8as_v7',vCPU:8,ram:32},{name:'F16as_v7',vCPU:16,ram:64},{name:'F32as_v7',vCPU:32,ram:128},{name:'F48as_v7',vCPU:48,ram:192},{name:'F64as_v7',vCPU:64,ram:256},{name:'F80as_v7',vCPU:80,ram:320}],
  'Fals-series v7 (AMD)': [{name:'F1als_v7',vCPU:1,ram:2},{name:'F2als_v7',vCPU:2,ram:4},{name:'F4als_v7',vCPU:4,ram:8},{name:'F8als_v7',vCPU:8,ram:16},{name:'F16als_v7',vCPU:16,ram:32},{name:'F32als_v7',vCPU:32,ram:64},{name:'F48als_v7',vCPU:48,ram:96},{name:'F64als_v7',vCPU:64,ram:128},{name:'F80als_v7',vCPU:80,ram:160}],
  'L-series v3': [{name:'L8s_v3',vCPU:8,ram:64},{name:'L16s_v3',vCPU:16,ram:128},{name:'L32s_v3',vCPU:32,ram:256},{name:'L48s_v3',vCPU:48,ram:384},{name:'L64s_v3',vCPU:64,ram:512},{name:'L80s_v3',vCPU:80,ram:640}],
  'Las-series v3 (AMD)': [{name:'L8as_v3',vCPU:8,ram:64},{name:'L16as_v3',vCPU:16,ram:128},{name:'L32as_v3',vCPU:32,ram:256},{name:'L48as_v3',vCPU:48,ram:384},{name:'L64as_v3',vCPU:64,ram:512},{name:'L80as_v3',vCPU:80,ram:640}],
  // 스토리지 최적화 v4 (로컬 NVMe, 8GB/vCPU). Lsv4=Intel Emerald Rapids, Lasv4=AMD Genoa.
  'L-series v4': [{name:'L2s_v4',vCPU:2,ram:16},{name:'L4s_v4',vCPU:4,ram:32},{name:'L8s_v4',vCPU:8,ram:64},{name:'L16s_v4',vCPU:16,ram:128},{name:'L32s_v4',vCPU:32,ram:256},{name:'L48s_v4',vCPU:48,ram:384},{name:'L64s_v4',vCPU:64,ram:512},{name:'L80s_v4',vCPU:80,ram:640},{name:'L96s_v4',vCPU:96,ram:768}],
  'Las-series v4 (AMD)': [{name:'L2as_v4',vCPU:2,ram:16},{name:'L4as_v4',vCPU:4,ram:32},{name:'L8as_v4',vCPU:8,ram:64},{name:'L16as_v4',vCPU:16,ram:128},{name:'L32as_v4',vCPU:32,ram:256},{name:'L48as_v4',vCPU:48,ram:384},{name:'L64as_v4',vCPU:64,ram:512},{name:'L80as_v4',vCPU:80,ram:640},{name:'L96as_v4',vCPU:96,ram:768}],
  'M-series': [{name:'M8ms',vCPU:8,ram:218.75},{name:'M16ms',vCPU:16,ram:437.5},{name:'M32ms',vCPU:32,ram:875},{name:'M64ms',vCPU:64,ram:1750},{name:'M128ms',vCPU:128,ram:3892},{name:'M16s',vCPU:16},{name:'M32s',vCPU:32},{name:'M64s',vCPU:64},{name:'M128s',vCPU:128},{name:'M32ms_v2',vCPU:32},{name:'M64ms_v2',vCPU:64},{name:'M128ms_v2',vCPU:128},{name:'M208ms_v2',vCPU:208},{name:'M416ms_v2',vCPU:416},{name:'M64ds_v2',vCPU:64},{name:'M128ds_v2',vCPU:128}],
  // M v3 중간 메모리(Intel Sapphire Rapids). _1_/_2_/_3_/_4_ 는 메모리 구성 변형(armSkuName에 그대로 포함). Msv3=로컬디스크 없음, Mdsv3=로컬디스크.
  'Ms-series v3 (Medium Memory)': [{name:'M12s_v3',vCPU:12,ram:240},{name:'M24s_v3',vCPU:24,ram:480},{name:'M48s_1_v3',vCPU:48,ram:974},{name:'M96s_1_v3',vCPU:96,ram:974},{name:'M96s_2_v3',vCPU:96,ram:1946},{name:'M176s_3_v3',vCPU:176,ram:2794},{name:'M176s_4_v3',vCPU:176,ram:3892}],
  'Mds-series v3 (Medium Memory)': [{name:'M12ds_v3',vCPU:12,ram:240},{name:'M24ds_v3',vCPU:24,ram:480},{name:'M48ds_1_v3',vCPU:48,ram:974},{name:'M96ds_1_v3',vCPU:96,ram:974},{name:'M96ds_2_v3',vCPU:96,ram:1946},{name:'M176ds_3_v3',vCPU:176,ram:2794},{name:'M176ds_4_v3',vCPU:176,ram:3892}],
  'N-series (GPU)': [{name:'NC4as_T4_v3',vCPU:4,ram:28},{name:'NC8as_T4_v3',vCPU:8,ram:56},{name:'NC16as_T4_v3',vCPU:16,ram:110},{name:'NC64as_T4_v3',vCPU:64,ram:440},{name:'NC6s_v3',vCPU:6,ram:112},{name:'NC12s_v3',vCPU:12,ram:224},{name:'NC24s_v3',vCPU:24,ram:448},{name:'NV4as_v4',vCPU:4,ram:14},{name:'NV8as_v4',vCPU:8,ram:28},{name:'NV16as_v4',vCPU:16,ram:56},{name:'NV32as_v4',vCPU:32,ram:112}],
  // GPU 신규 계열(v101 이후). armSkuName='Standard_<name>'으로 조회. RAM은 시리즈 표준 사양(GiB).
  // NCads A100 v4: NVIDIA A100 80GB PCIe(1/2/4 GPU). koreacentral·polandcentral·italynorth 등 광범위 제공.
  'NC A100 v4 (GPU)': [{name:'NC24ads_A100_v4',vCPU:24,ram:220},{name:'NC48ads_A100_v4',vCPU:48,ram:440},{name:'NC96ads_A100_v4',vCPU:96,ram:880}],
  // NCads H100 v5: NVIDIA H100 NVL 94GB(1/2 GPU). skuName이 'NC40adsH100v5'(밑줄 없음)이라 정규화 매칭에 의존.
  'NC H100 v5 (GPU)': [{name:'NC40ads_H100_v5',vCPU:40,ram:320},{name:'NC80adis_H100_v5',vCPU:80,ram:640}],
  // NDamsr A100 v4: NVIDIA A100 80GB SXM ×8(InfiniBand). polandcentral·italynorth 등.
  'ND A100 v4 (GPU)': [{name:'ND96amsr_A100_v4',vCPU:96,ram:1900}],
  // NDsr H100 v5: NVIDIA H100 80GB SXM ×8(InfiniBand). koreacentral·polandcentral 등.
  'ND H100 v5 (GPU)': [{name:'ND96isr_H100_v5',vCPU:96,ram:1900}],
  'A-series v2': [{name:'A1_v2',vCPU:1,ram:2},{name:'A2_v2',vCPU:2,ram:4},{name:'A4_v2',vCPU:4,ram:8},{name:'A8_v2',vCPU:8,ram:16},{name:'A2m_v2',vCPU:2,ram:16},{name:'A4m_v2',vCPU:4,ram:32},{name:'A8m_v2',vCPU:8,ram:64}],
  'FX-series': [{name:'FX4mds',vCPU:4,ram:84},{name:'FX12mds',vCPU:12,ram:252},{name:'FX24mds',vCPU:24,ram:504},{name:'FX36mds',vCPU:36,ram:756},{name:'FX48mds',vCPU:48,ram:1008}],
  // HPC 시리즈(HB/HC/HX): 'HB176-Nrs_v4'는 제약 코어(실제 사용 vCPU=N) → vCPU를 명시값으로 지정.
  // RAM은 사양 확정이 까다로워 생략(라벨에 vCPU만 표시). armSkuName='Standard_<name>'으로 가격 조회.
  'HB-series v4 (HPC)': [{name:'HB176-24rs_v4',vCPU:24},{name:'HB176-48rs_v4',vCPU:48},{name:'HB176-96rs_v4',vCPU:96},{name:'HB176-144rs_v4',vCPU:144},{name:'HB176rs_v4',vCPU:176}],
  'HC-series (HPC)': [{name:'HC44-16rs',vCPU:16},{name:'HC44-32rs',vCPU:32},{name:'HC44rs',vCPU:44}],
  'HX-series (HPC)': [{name:'HX176-24rs',vCPU:24},{name:'HX176-48rs',vCPU:48},{name:'HX176-96rs',vCPU:96},{name:'HX176-144rs',vCPU:144},{name:'HX176rs',vCPU:176}],
  // Basic 계층(A0~A4) — armSkuName 접두사가 'Basic_' (Standard_ 아님). 계층=Basic일 때만 노출.
  'A-series (Basic)': [{name:'A0',vCPU:1,ram:0.75},{name:'A1',vCPU:1,ram:1.75},{name:'A2',vCPU:2,ram:3.5},{name:'A3',vCPU:4,ram:7},{name:'A4',vCPU:8,ram:14}],
};

// 유형(소프트웨어) -> Retail Prices API의 productName ('Virtual Machines Licenses')
var VM_SW_PRODUCT: Record<string,string> = REG.VM_SW_PRODUCT = {
  'SQL Server (Enterprise)':  'SQL Server Enterprise',
  'SQL Server (Standard)':    'SQL Server Standard',
  'SQL Server (Web)':         'SQL Server Web',
  'BizTalk Server (Enterprise)':'BizTalk Server Enterprise',
  'BizTalk Server (Standard)': 'BizTalk Server Standard',
};

// 라이선스 응답에서 vCPU 구간 단가 1건 선택 (구간 파싱 공통)
REG['_vmSwLicensePick'] = function(items: ApiItem[], vcpu: number) {
  const bands = [];
  for (const it of items) {
    if ((it.type||'').toLowerCase() !== 'consumption') continue;
    if (!(it.unitOfMeasure||'').toLowerCase().includes('hour')) continue;
    const sk = String(it.skuName||'') + ' ' + String(it.meterName||'');
    const mPlus  = sk.match(/([0-9]+)[ ]*\+[ ]*vcpu/i);      // 'N+ vCPU' = N 이상 정액(상한 없음) — RHEL/SUSE
    const mRange = sk.match(/([0-9]+)[ ]*-[ ]*([0-9]+)[ ]*vcpu/i);
    const mOne   = sk.match(/([0-9]+)[ ]*vcpu/i);
    let lo=0, hi=0;
    if (mPlus) { lo=Number(mPlus[1]); hi=Infinity; }
    else if (mRange) { lo=Number(mRange[1]); hi=Number(mRange[2]); }
    else if (mOne) { lo=Number(mOne[1]); hi=Number(mOne[1]); }
    else continue;
    const price = Number(it.unitPrice);
    if (!isFinite(price) || price <= 0) continue;
    bands.push({ lo, hi, price, skuName:it.skuName, meterName:it.meterName, productName:it.productName });
  }
  if (bands.length === 0) return null;
  bands.sort((a,b)=>a.hi-b.hi);
  // vCPU를 포함하는 구간 우선, 없으면 vCPU 이상 중 가장 작은 구간(올림 라이선스)
  return bands.find(b=>vcpu>=b.lo && vcpu<=b.hi) || bands.find(b=>b.hi>=vcpu) || null;
};

// SW 라이선스 시간당 단가 조회 (vCPU 구간 매칭). 라이선스 미터는 리전 비종속이라 armRegionName 미사용. 못 찾으면 0 반환(가산 안 함).
REG['_vmSwLicenseHourly'] = async function(productName: string | null, vcpu: number, cur: string) {
  if (!productName || !(vcpu > 0)) return { hourly:0, band:null };
  // 1차: 정확한 productName으로 조회 (리전 비종속 -> armRegionName 미포함)
  let items: ApiItem[] = [];
  try { items = await apiFetch({ serviceName:'Virtual Machines Licenses', productName, priceType:'Consumption' }, cur, 500, 3); }
  catch (e) { console.warn('SW 라이선스 1차 조회 실패:', e); }
  let chosen = REG['_vmSwLicensePick'](items, vcpu);
  // 2차 폴백: productName eq가 빗나간 경우 전체 라이선스 목록에서 키워드(모두 포함)로 매칭
  if (!chosen) {
    let all: ApiItem[] = [];
    try { all = await apiFetch({ serviceName:'Virtual Machines Licenses', priceType:'Consumption' }, cur, 1000, 5); }
    catch (e) { console.warn('SW 라이선스 2차 조회 실패:', e); }
    const kws = String(productName).toLowerCase().split(' ').filter(Boolean);
    const filtered = all.filter(it=>{ const p=(it.productName||'').toLowerCase(); return kws.every(k=>p.includes(k)); });
    chosen = REG['_vmSwLicensePick'](filtered, vcpu);
  }
  if (!chosen) return { hourly:0, band:null };
  return { hourly: chosen.price, band: chosen };
};

// detail 빌더
REG['_buildDetail_Virtual_Machine'] = function(r: Row) {
  const o = r.options;
  if (REG['_vm_applyStepVisibility']) REG['_vm_applyStepVisibility'](r);
  r.skuName = o.instance || '';
  const inst = (VM_INSTANCE_CATALOG[o.series]||[]).find(i=>i.name===o.instance);
  const parts = [];
  if (o.os) parts.push(o.os);
  if (inst) parts.push(`CPU:${inst.vCPU}core` + ((inst.ram!==undefined&&inst.ram!==null) ? ` RAM:${inst.ram}GB` : ''));
  if (o.tier && o.tier!=='Standard') parts.push(o.tier);
  if (o.os && o.os!=='Linux' && o.license) parts.push(o.license);
  if (o.swType && o.swType!=='(OS Only)') parts.push(o.swType);
  r.detail = parts.join(', ');
};

// 가격 조회
REG['_resolve_Virtual_Machine'] = async function(row: Row, cur: string) {
  // Basic 계층(A0~A4)은 armSkuName 접두사가 'Basic_', 그 외는 'Standard_'
  const armSku = ((row.options && row.options.tier === 'Basic') ? 'Basic_' : 'Standard_') + row.skuName;
  const bf = { serviceName:'Virtual Machines', armRegionName:row.region, armSkuName:armSku };
  try {
    const [cItems, rItems] = await Promise.all([
      apiFetch({...bf, priceType:'Consumption'}, cur, 200, 3),
      apiFetch({...bf, priceType:'Reservation'}, cur, 200, 3).catch(()=>[]),
    ]);
    const isWin =(it: ApiItem)=>/windows/i.test(it.productName||'');
    const isRHEL=(it: ApiItem)=>/red[ ]*hat/i.test(it.productName||'');
    const isSUSE=(it: ApiItem)=>/suse/i.test(it.productName||'');
    const isLinux=(it: ApiItem)=>!isWin(it)&&!isRHEL(it)&&!isSUSE(it);
    const isSpot=(it: ApiItem)=>{ const s=(it.skuName||'').toLowerCase(),m=(it.meterName||'').toLowerCase(),p=(it.productName||'').toLowerCase(); return s.includes('spot')||m.includes('spot')||s.includes('low priority')||m.includes('low priority')||p.includes('low priority'); };
    const isDev =(it: ApiItem)=>(it.type||'').toLowerCase()==='devtestconsumption';
    // skuName/meterName 정규화 매칭. 신형 시리즈(Dsv7·Msv3 등)는 값이 'Standard_D2s_v7'처럼
    // 접두사(Standard_/Basic_)와 Spot/Low Priority 토큰을 포함하므로 이를 벗겨내고 비교한다.
    // (구형은 'D4s v5'처럼 접두사 없음 → 양쪽 스타일 모두 지원)
    const norm=(x: any)=>String(x||'').toLowerCase()
      .replace(/\b(spot|low priority)\b/g,'')
      .replace(/^\s*(standard|basic)[_ ]/,'')
      .replace(/[_ ]/g,'');
    const skuM =(it: ApiItem)=>{ const t=norm(row.skuName); if(!t) return false; return norm(it.skuName)===t||norm(it.meterName)===t; };
    const osC=row.options.os||'Linux', tierC=row.options.tier||'Standard';
    const isRhelSuse = osC.includes('Red Hat') || osC==='SUSE';
    const licC=row.options.license||'라이선스 포함', isAHB=licC==='Azure Hybrid Benefit', isPaid=osC!=='Linux';
    const base=(it: ApiItem)=>{ if((it.type||'').toLowerCase()!=='consumption') return false; if(it.armSkuName!==armSku||!skuM(it)||isDev(it)) return false; if(tierC==='Spot'?!isSpot(it):isSpot(it)) return false; if(!(it.unitOfMeasure||'').toLowerCase().includes('hour')) return false; if(Number(it.tierMinimumUnits||0)!==0) return false; return true; };
    const low=(arr: ApiItem[])=>{ arr.sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0)); return arr[0]||null; };
    const lP=low(cItems.filter(it=>base(it)&&isLinux(it)));
    const wP=low(cItems.filter(it=>base(it)&&isWin(it)));
    const rP=low(cItems.filter(it=>base(it)&&isRHEL(it)));
    const sP=low(cItems.filter(it=>base(it)&&isSUSE(it)));
    let osP=osC==='Linux'?lP:osC==='Windows'?wP:osC.includes('Red Hat')?rP:sP;
    // RHEL/SUSE 는 Retail 피드에 전용 컴퓨팅 미터가 없음(별도 라이선스 미터로 과금).
    // → base 컴퓨팅은 Linux 요금(lP)을 쓰고, 라이선스는 아래에서 vCPU 밴드로 가산.
    if(isRhelSuse && !osP) osP = lP;
    let licH=0;
    if(isPaid&&osP&&lP){ const d=Number(osP.unitPrice)-Number(lP.unitPrice); licH=d>0?d:0; }
    let payg=!isPaid?lP:isAHB?(lP?{...lP,_licenseMode:'AHB'}:null):(osP?{...osP,_licenseMode:'License-included'}:null);
    let s1: ApiItem | null=null,s3: ApiItem | null=null;
    const exSp=(item: ApiItem | null)=>{ if(!item||!Array.isArray(item.savingsPlan)) return; for(const sp of item.savingsPlan){ const t=String(sp.term||'').toLowerCase(); if(!s1&&(t==='1 year'||t.startsWith('1 year')||t==='1'||t.startsWith('1 '))) s1=makeSpItem(item,sp); else if(!s3&&(t==='3 year'||t==='3 years'||t.startsWith('3 year')||t==='3'||t.startsWith('3 '))) s3=makeSpItem(item,sp); } };
    exSp(lP); if(!s1||!s3) exSp(osP);
    if(!s1||!s3){ for(const it of cItems){ if(!base(it)||it===lP||it===osP) continue; exSp(it); if(s1&&s3) break; } }
    const addL=(bi: ApiItem | null,lic: number)=>{ if(!bi) return null; const bh=Number(bi.unitPrice),t=bh+(lic>0?lic:0); return{...bi,unitPrice:t,retailPrice:t,_baseHourly:bh,_licenseHourly:lic,_licenseMode:isAHB?'AHB':'License-included'}; };
    const sp1=(isPaid&&!isAHB)?addL(s1,licH):s1;
    const sp3=(isPaid&&!isAHB)?addL(s3,licH):s3;
    const riAll=rItems.filter((it: ApiItem)=>{ if((it.type||'').toLowerCase()!=='reservation') return false; if(it.armSkuName!==armSku||Number(it.tierMinimumUnits||0)!==0||isSpot(it)||!skuM(it)) return false; return true; });
    const ri1C=riAll.filter(it=>/1[ ]*year/i.test(String(it.reservationTerm||''))).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const ri3C=riAll.filter(it=>/3[ ]*year/i.test(String(it.reservationTerm||''))).sort((a,b)=>Number(a.unitPrice||0)-Number(b.unitPrice||0));
    const nRi=(item: ApiItem | null,y: number)=>{ if(!item) return null; const t=Number(item.unitPrice); if(!isFinite(t)||t<=0) return null; return{...item,unitPrice:t/(y*8760),retailPrice:t/(y*8760),unitOfMeasure:'1 Hour (normalized)',_originalUnitPrice:t,_termYears:y}; };
    const ri1=(isPaid&&!isAHB)?addL(nRi(ri1C[0]||null,1),licH):nRi(ri1C[0]||null,1);
    const ri3=(isPaid&&!isAHB)?addL(nRi(ri3C[0]||null,3),licH):nRi(ri3C[0]||null,3);

    // 유형(SW) 라이선스: 컴퓨팅 가격에 시간당 라이선스 가산 (예약/절약 플랜은 컴퓨팅만 할인하므로 동일 가산)
    const swType=row.options.swType||'(OS Only)';
    const swProduct=VM_SW_PRODUCT[swType]||null;
    const instMeta=(VM_INSTANCE_CATALOG[row.options.series]||[]).find(i=>i.name===row.skuName);
    const vcpu=instMeta?Number(instMeta.vCPU):0;
    let swHourly=0, swMatched=false, swBandLabel='';
    if(swProduct){
      const sw=await REG['_vmSwLicenseHourly'](swProduct, vcpu, cur);
      swHourly=Number(sw.hourly)||0; swMatched=swHourly>0;
      if(sw.band) swBandLabel=String(sw.band.skuName||sw.band.meterName||'');
    }
    // OS 라이선스(RHEL/SUSE): vCPU 밴드 라이선스를 base(Linux 컴퓨팅)에 가산. AHB(BYOS)면 미가산.
    let osLicHourly=0, osLicMatched=false, osLicBand='';
    if(isRhelSuse && !isAHB){
      const osProd = osC.includes('Red Hat') ? 'Red Hat Enterprise Linux' : 'SUSE Linux Enterprise Server Standard';
      const ol=await REG['_vmSwLicenseHourly'](osProd, vcpu, cur);
      osLicHourly=Number(ol.hourly)||0; osLicMatched=osLicHourly>0;
      if(ol.band) osLicBand=String(ol.band.skuName||ol.band.meterName||'');
    }
    const extraHourly = swHourly + osLicHourly;
    const addSw=(it: ApiItem | null)=>{ if(!it||extraHourly<=0) return it; const b=Number(it.unitPrice)+extraHourly; return {...it,unitPrice:b,retailPrice:b,_swProduct:swProduct,_swHourly:swHourly,_osLicHourly:osLicHourly,_computeHourly:Number(it.unitPrice)}; };

    row.paygItem=addSw(payg); row.sp1Item=addSw(sp1); row.sp3Item=addSw(sp3); row.ri1Item=addSw(ri1); row.ri3Item=addSw(ri3);
    if(row.paygItem){
      const tags=['PAYG'];if(row.sp1Item)tags.push('SP1Y');if(row.sp3Item)tags.push('SP3Y');if(row.ri1Item)tags.push('RI1Y');if(row.ri3Item)tags.push('RI3Y');
      let swMsg='';
      if(swProduct) swMsg = swMatched ? ` +SW(${swType}${swBandLabel?' / '+swBandLabel:''}):${swHourly.toFixed(4)}/h` : ` +SW(${swType}):미매칭`;
      let osMsg='';
      if(isRhelSuse && !isAHB) osMsg = osLicMatched ? ` +${osC.includes('Red Hat')?'RHEL':'SUSE'}(${osLicBand}):${osLicHourly.toFixed(4)}/h` : ` +${osC.includes('Red Hat')?'RHEL':'SUSE'}:미매칭`;
      setStatus('ok',`${row.skuName} 완료 [${tags.join(', ')}] · PAYG ${Number(row.paygItem.unitPrice).toFixed(4)}/h${swMsg}${osMsg}`);
    }
    else {
      // 매칭 실패 → 이 SKU가 다른 리전엔 있는지 확인해 "리전 미제공" 여부를 구분해 안내
      await REG['_vmReportUnavailable'](row, armSku, cItems.length, cur);
    }
  } catch(err: any){ row.paygItem=null;row.sp1Item=null;row.sp3Item=null;row.ri1Item=null;row.ri3Item=null; setStatus('error',`API 실패: ${err.message.slice(0,100)}`); console.error('VM:',err); }
  updatePriceCells(row); updateTotalsRow();
};

// 특정 armSkuName 이 Consumption 시간당 가격을 제공하는 리전 목록(공용 probeRegions 사용)
REG['_vmSkuRegions'] = async function(armSku: string, cur: string): Promise<string[]> {
  return probeRegions({ serviceName:'Virtual Machines', armSkuName:armSku }, cur, (it: ApiItem)=>
    String(it.unitOfMeasure||'').toLowerCase().includes('hour') && Number(it.tierMinimumUnits||0) === 0);
};

// 매칭 실패 상태 메시지: 리전 미제공이면 지원 리전을 함께 안내
REG['_vmReportUnavailable'] = async function(row: Row, armSku: string, nFetched: number, cur: string) {
  const here = String(row.region||'');
  const hereLabel = REGION_LABEL[here] || here;
  const regions = await REG['_vmSkuRegions'](armSku, cur);
  const hint = regionHint(regions, here, (r: string)=> REGION_LABEL[r] || r);
  if (hint.unavailable) {
    const msg = `${row.skuName}: ${hint.text}`;
    setStatus('error', msg);
    if (typeof showToast === 'function') showToast(msg, 'error');
  } else if (hint.known) {
    // 리전엔 존재하나 현재 옵션(OS/계층 등) 조합으로는 못 찾음
    setStatus('error', `${row.skuName}: 매칭 없음 — '${hereLabel}'에 존재하나 현재 옵션 조합과 불일치 (${nFetched}건)`);
  } else {
    setStatus('error', `${row.skuName}: 어느 리전에서도 조회되지 않음(SKU명 확인 필요) (${nFetched}건)`);
  }
};
