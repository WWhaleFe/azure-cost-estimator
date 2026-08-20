import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow, pickTieredMeter, tierNote } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/azure-monitor.ts — Azure Monitor (메트릭·경고·로그 부가 요금·약정 계층)
//
//   전용 resolver(_resolve_Azure_Monitor). 가격 하드코딩 없음(Azure Retail Prices API 실시간).
//   serviceName='Azure Monitor'. productName 은 전부 'Azure Monitor' 한 값이고, **skuName** 이
//   청구 항목 묶음(Alerts·Basic Logs·Metrics ingestion·<N> GB Commitment Tier …),
//   meterName 이 세부 항목이다. 그래서 매칭은 skuName + meterName 으로 한다.
//   항목이 많아 **그룹(group) → 청구 항목(item)** 2단으로 나눈다(instanceParentKey='group').
//
//   ※ Log Analytics 작업 영역의 **분석 로그 수집·보존·분석**은 별도 카테고리 'Log Analytics'
//     (serviceName='Log Analytics')를 쓰세요. 여기 '로그' 그룹은 그 위에 붙는 부가 요금
//     (기본/보조 로그, 플랫폼 로그, 보관·복원·복제·내보내기, 검색)입니다.
//
//   그룹별 usage 칸 단위
//     - 메트릭      : 10M 샘플 단위(Metrics Export 는 1K 샘플) → 샘플 수 ÷ 단위
//     - 경고        : 1/Month → usage=1, Qty=경고 규칙 수
//     - 로그        : GB (데이터 복원만 GB/일)
//     - 약정 계층   : 1/Day → usage=일수(예 30), Qty=1
//     - 웹 테스트   : 실행 1회 → usage=월 실행 횟수
//
//   월=단가×Qty×usage(엔진 기본). 절약/예약 미적용.
//   범위 외: 알림(Emails·SMS·Voice·Webhook — 국가코드별 미터가 200여 건이라 제외, 대부분 0원),
//           'Alerts Metric Monitored'(0원), API 호출·네이티브 메트릭 쿼리(0원).
// ================================================================

// 약정 계층(GB/일) — skuName/meterName 이 '<N> GB Commitment Tier …' 규칙을 따른다
var _MON_COMMIT = ['100','200','300','400','500','1000','2000','5000','10000','25000','50000'];

function _commitItems(): Record<string, { sku: string; meter: string }> {
  var out: Record<string, { sku: string; meter: string }> = {};
  _MON_COMMIT.forEach(function (gb) {
    out[gb + ' GB/일 약정'] = { sku: gb + ' GB Commitment Tier', meter: gb + ' GB Commitment Tier Capacity Reservation' };
  });
  return out;
}

// 그룹 → 청구 항목(노출명) → {skuName, meterName}
var _MON_ITEMS: Record<string, Record<string, { sku: string; meter: string }>> = {
  '메트릭': {
    '메트릭 수집 (10M 샘플)':            { sku:'Metrics ingestion',                          meter:'Metrics ingestion Metric samples' },
    '고급 플랫폼 메트릭 수집 (10M 샘플)': { sku:'Advanced Platform Metric Samples Ingested',   meter:'Advanced Platform Metric Samples Ingested Metric samples' },
    'Prometheus 메트릭 쿼리 (10M 샘플)':  { sku:'Prometheus Metrics Queries',                  meter:'Prometheus Metrics Queries Metric samples' },
    '메트릭 내보내기 (1K 샘플)':          { sku:'Metrics Export',                              meter:'Metrics Export Metric Samples Exported' },
  },
  '경고 (월)': {
    '리소스 모니터링 - 1분 주기':   { sku:'Alerts', meter:'Alerts Resource Monitored at 1 Minute Frequency' },
    '리소스 모니터링 - 5분 주기':   { sku:'Alerts', meter:'Alerts Resource Monitored at 5 Minute Frequency' },
    '리소스 모니터링 - 10분 주기':  { sku:'Alerts', meter:'Alerts Resource Monitored at 10 Minute Frequency' },
    '리소스 모니터링 - 15분 주기':  { sku:'Alerts', meter:'Alerts Resource Monitored at 15 Minute Frequency' },
    '시스템 로그 모니터링 - 1분 주기':  { sku:'Alerts', meter:'Alerts System Log Monitored at 1 Minute Frequency' },
    '시스템 로그 모니터링 - 5분 주기':  { sku:'Alerts', meter:'Alerts System Log Monitored at 5 Minute Frequency' },
    '시스템 로그 모니터링 - 10분 주기': { sku:'Alerts', meter:'Alerts System Log Monitored at 10 Minute Frequency' },
    '시스템 로그 모니터링 - 15분 주기': { sku:'Alerts', meter:'Alerts System Log Monitored at 15 Minute Frequency' },
    '동적 임계값':                    { sku:'Alerts', meter:'Alerts Dynamic Threshold' },
  },
  '로그': {
    '기본 로그 수집 (GB)':   { sku:'Basic Logs',                meter:'Basic Logs Data Ingestion' },
    '보조 로그 수집 (GB)':   { sku:'Auxiliary Logs',            meter:'Auxiliary Logs Data Ingestion' },
    '플랫폼 로그 처리 (GB)': { sku:'Platform Logs',             meter:'Platform Logs Data Processed' },
    '데이터 보관 (GB/월)':   { sku:'Data Archive',              meter:'Data Archive' },
    '데이터 복원 (GB/일)':   { sku:'Data Restore',              meter:'Data Restore' },
    '데이터 복제 (GB)':      { sku:'Data Replication',          meter:'Data Replication Data Replicated' },
    '로그 내보내기 (GB)':    { sku:'Log Analytics data export', meter:'Log Analytics data export Data Exported' },
    '검색 작업 (GB)':        { sku:'Search Jobs',               meter:'Search Jobs Scanned' },
    '검색 쿼리 (GB)':        { sku:'Search Queries',            meter:'Search Queries Scanned' },
  },
  '약정 계층 (일)': _commitItems(),
  '웹 테스트': {
    '표준 웹 테스트 (실행 1회)': { sku:'Standard Web Test', meter:'Standard Web Test Execution' },
  },
};

var _MON_GROUPS = Object.keys(_MON_ITEMS);

REG._svcDefs['Azure Monitor'] = {
  apiServiceName: 'Azure Monitor',
  steps: [
    { key:'group', label:'그룹',      options:_MON_GROUPS.slice() },
    { key:'item',  label:'청구 항목', options:Object.keys(_MON_ITEMS[_MON_GROUPS[0]]) },
  ],
  instanceField: false,
  instanceParentKey: 'group',
  _applyStepVisibility: function(r: Row){ if (REG['_mon_applyStepVisibility']) REG['_mon_applyStepVisibility'](r); },
};

// 그룹 변경 시 청구 항목 옵션 교체(현재 값이 새 목록에 없으면 첫 항목으로)
REG['_mon_applyStepVisibility'] = function(r: Row) {
  var def = REG._svcDefs['Azure Monitor'];
  if (!def || !def.steps) return;
  var group = (r.options && r.options.group) || _MON_GROUPS[0];
  var list = Object.keys(_MON_ITEMS[group] || {});
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'item') continue;
    def.steps[i].options = list.slice();
    if (r.options && list.indexOf(r.options.item) < 0) r.options.item = list[0] || '';
  }
};

REG['_buildDetail_Azure_Monitor'] = function(r: Row) {
  var o = r.options || {};
  REG['_mon_applyStepVisibility'](r);
  var conf = (_MON_ITEMS[o.group || ''] || {})[o.item || ''];
  r.skuName = conf ? conf.sku : (o.group || '');
  r.detail = ['Azure Monitor', o.group, o.item].filter(Boolean).join(' / ');
};

// 가격 조회 — skuName 으로 좁힌 뒤 meterName 정확 일치(대소문자 무시)
REG['_resolve_Azure_Monitor'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var group = o.group || _MON_GROUPS[0];
  var item = o.item || Object.keys(_MON_ITEMS[group] || {})[0] || '';
  var conf = (_MON_ITEMS[group] || {})[item];
  var label = 'Azure Monitor / ' + group + ' / ' + item;

  if (!conf) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 청구 항목을 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Azure Monitor', armRegionName:row.region, skuName:conf.sku, priceType:'Consumption' }, cur, 200, 3, {pageSize:200, expectedSizeKB:30});
  } catch (err: any) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'Azure Monitor 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var cands = items.filter(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return false;
    return String(it.meterName||'').toLowerCase() === conf.meter.toLowerCase();
  });
  // 수집 계열은 무료 허용량(0원) 구간이 섞여 있어 0원이 아닌 최저 구간을 쓴다
  var chosen = pickTieredMeter(cands);

  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 매칭 미터를 그대로 반환 → 엔진 기본 계산(월=단가×Qty×usage). 절약/예약 미적용.
  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + tierNote(chosen));
  updatePriceCells(row); updateTotalsRow();
};
