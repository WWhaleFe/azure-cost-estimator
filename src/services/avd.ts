import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/avd.ts — Azure Virtual Desktop (사용자당 접속 요금 · Azure Local 서비스 요금)
//
//   전용 resolver(_resolve_Azure_Virtual_Desktop). 가격 하드코딩 없음(Retail Prices API 실시간).
//   serviceName='Windows Virtual Desktop'(구 명칭 그대로), productName='Azure Virtual Desktop'.
//
//   AVD 비용은 세 덩어리로 나뉜다. 이 카테고리는 ②·③ 만 맡는다.
//     ① 세션 호스트 인프라 — VM·디스크·FSLogix 저장소·송신 트래픽. 일반 VM 과 같은 방식으로 과금되므로
//        기존 카테고리(Virtual Machine·Disk·Azure Files Provisioned v2·Bandwidth)로 적는다.
//        Windows 10/11 (멀티세션 포함) 세션 호스트는 **Linux 요율**로 과금된다(MS 공시)
//        → Virtual Machine 의 os='Windows 10/11 (AVD)' 를 고르면 Linux 요율로 조회한다(vm.ts).
//     ② 사용자 접속 권한 — 내부 사용자는 M365 E3/E5/F3 등 라이선스에 포함(요금 행 불필요).
//        **외부 고객**에게 제공할 때만 사용자당 월 요금(per-user access pricing)을 낸다.
//          'Desktop & App Hosting'   데스크톱+앱 (USD 10/사용자·월)
//          'App Hosting'             앱 전용   (USD 5.5/사용자·월)
//          'App to Desktop Upgrade'  앱 전용 → 데스크톱 업그레이드 (USD 4.5/사용자·월)
//     ③ Azure Local(구 Azure Stack HCI) 위 세션 호스트 — 'AVD for Azure Stack HCI' vCPU 시간당 서비스 요금.
//
//   API 특이점: 같은 skuName 에 meterName 이 2개씩 있다('… User' / '… Users', 단가 동일).
//   어느 쪽이든 값이 같으므로 단가 오름차순 → meterName 오름차순으로 하나만 고른다(결정론).
//   월=단가×Qty×usage(엔진 기본). 사용자 요금 usage=1(Qty=월 접속 사용자 수), Azure Local usage=730(Qty=vCPU 수).
//   절약/예약 미적용(해당 상품 없음).
// ================================================================

var _AVD_SVC = 'Windows Virtual Desktop';
var _AVD_PRODUCT = 'Azure Virtual Desktop';
// 청구 항목(노출명) → skuName + 단위(소문자 일부)
var _AVD_METRICS: Record<string, { sku: string; unit: string; usageNote: string }> = {
  '사용자 접속 - 데스크톱+앱 (사용자/월)':     { sku:'Desktop & App Hosting',   unit:'month', usageNote:'usage=1, Qty=월 접속 사용자 수' },
  '사용자 접속 - 앱 전용 (사용자/월)':         { sku:'App Hosting',             unit:'month', usageNote:'usage=1, Qty=월 접속 사용자 수' },
  '사용자 접속 - 앱→데스크톱 업그레이드 (사용자/월)': { sku:'App to Desktop Upgrade', unit:'month', usageNote:'usage=1, Qty=업그레이드 사용자 수' },
  'Azure Local 서비스 요금 (vCPU/시간)':       { sku:'AVD for Azure Stack HCI', unit:'hour',  usageNote:'usage=월 사용시간, Qty=세션 호스트 vCPU 수' },
};
var _AVD_METRIC_KEYS = Object.keys(_AVD_METRICS);

REG._svcDefs['Azure Virtual Desktop'] = {
  apiServiceName: _AVD_SVC,
  steps: [
    { key:'metric', label:'청구 항목', options:_AVD_METRIC_KEYS.slice(),
      tooltip:'사용자당 접속 요금은 외부 고객에게 제공할 때만 냅니다. 내부 사용자는 M365 E3/E5/F3 등 라이선스에 포함되어 행이 필요 없습니다. 세션 호스트 VM 은 Virtual Machine 행(os=Windows 10/11 (AVD))으로 따로 적으세요.' },
  ],
  instanceField: false,
};

REG['_buildDetail_Azure_Virtual_Desktop'] = function(r: Row) {
  var o = r.options || {};
  if (_AVD_METRIC_KEYS.indexOf(o.metric) < 0) o.metric = _AVD_METRIC_KEYS[0];
  r.skuName = _AVD_METRICS[o.metric].sku;
  r.detail = ['Azure Virtual Desktop', o.metric].join(' / ');
};

function _avdFail(row: Row, msg: string) {
  row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('error', msg);
  updatePriceCells(row); updateTotalsRow();
}

// 가격 조회 — skuName 정확 일치 + 단위 확인(리전별 단가: 대부분 동일, 일부 리전 상이)
REG['_resolve_Azure_Virtual_Desktop'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var metric = (_AVD_METRIC_KEYS.indexOf(o.metric) >= 0) ? o.metric : _AVD_METRIC_KEYS[0];
  var conf = _AVD_METRICS[metric];
  var label = 'Azure Virtual Desktop / ' + metric;

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:_AVD_SVC, armRegionName:row.region, productName:_AVD_PRODUCT, priceType:'Consumption' }, cur, 50, 1, {pageSize:50, expectedSizeKB:5});
  } catch (err: any) { return _avdFail(row, 'Azure Virtual Desktop 조회 실패: ' + String(err.message).slice(0,80)); }

  var chosen = items.filter(function(it: ApiItem){
    return String(it.type||'').toLowerCase() === 'consumption'
      && String(it.skuName||'').toLowerCase() === conf.sku.toLowerCase()
      && String(it.unitOfMeasure||'').toLowerCase().indexOf(conf.unit) >= 0
      && Number(it.tierMinimumUnits||0) === 0;
  }).sort(function(a: ApiItem, b: ApiItem){
    return (Number(a.unitPrice||0) - Number(b.unitPrice||0)) || String(a.meterName||'').localeCompare(String(b.meterName||''));
  })[0] || null;

  if (!chosen) return _avdFail(row, label + ': 매칭 실패 (' + items.length + '건 조회 · 이 리전에 없는 항목일 수 있음).');

  row.paygItem = Object.assign({}, chosen, { currencyCode: cur });
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(chosen.unitPrice) + ' / ' + chosen.unitOfMeasure + ' (' + conf.usageNote + ')');
  updatePriceCells(row); updateTotalsRow();
};
