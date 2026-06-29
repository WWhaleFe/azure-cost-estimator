// ================================================================
// services/sql-elastic-pool.js — Azure SQL Database 탄력적 풀(Elastic Pool, DTU 모델)
//
//   전용 resolver로 DTU 기반 탄력적 풀(eDTU 팩) 요금을 매칭합니다(가격 하드코딩 없음, 라이브 API).
//   serviceName='SQL Database'. 계층(tier) → productName, eDTU 팩 → skuName:
//     Basic    → 'SQL Database Elastic Pool - Basic'    (50~1600 eDTU)
//     Standard → 'SQL Database Elastic Pool - Standard'  (50~3000 eDTU)
//     Premium  → 'SQL Database Elastic Pool - Premium'   (125~4000 eDTU)
//   skuName='<N> DTU Pack', meter 'eDTUs', 단위 '1/Day'(일일 단가) → 시간당가=÷24로 엔진 합류.
//   월=시간당가×Qty(풀 수)×usage(시간, 예 730). 절약/예약 미제공.
//   참고: vCore 탄력적 풀은 단일 DB와 동일한 productName('Single/Elastic Pool')·단가라
//     별도 추가 없이 'Azure SQL Database'(vCore)에서 vCore 수로 동일하게 산출됩니다.
//   범위 외(매칭 실패 정상): 스토리지/백업, 표에 없는 eDTU 팩.
// ================================================================

var _SQLEP_PRODUCT = {
  'Basic':    'SQL Database Elastic Pool - Basic',
  'Standard': 'SQL Database Elastic Pool - Standard',
  'Premium':  'SQL Database Elastic Pool - Premium',
};
var _SQLEP_SIZES = {
  'Basic':    ['50','100','200','300','400','800','1200','1600'],
  'Standard': ['50','100','200','300','400','800','1200','1600','2000','2500','3000'],
  'Premium':  ['125','250','500','1000','1500','2000','2500','3000','3500','4000'],
};

window._svcDefs['Azure SQL Database Elastic Pool'] = {
  apiServiceName: 'SQL Database',
  steps: [
    { key:'tier',     label:'계층',      options:['Basic','Standard','Premium'] },
    { key:'poolSize', label:'eDTU 팩',   options:['50','100','200','300','400','800','1200','1600'] },
  ],
  instanceField: false,
  // 계층 변경 시 eDTU 팩 옵션을 다시 구성
  instanceParentKey: 'tier',
  _applyStepVisibility: function(r){ if (window['_sqlep_applyStepVisibility']) window['_sqlep_applyStepVisibility'](r); },
};

window['_sqlep_applyStepVisibility'] = function(r) {
  var def = window._svcDefs['Azure SQL Database Elastic Pool'];
  if (!def || !def.steps) return;
  var o = r.options || {};
  var tier = o.tier || 'Standard';
  var sizes = _SQLEP_SIZES[tier] || _SQLEP_SIZES['Standard'];
  for (var i = 0; i < def.steps.length; i++) {
    if (def.steps[i].key !== 'poolSize') continue;
    def.steps[i].options = sizes;
    if (sizes.indexOf(o.poolSize) < 0) r.options.poolSize = sizes[0];
  }
};

window['_buildDetail_Azure_SQL_Database_Elastic_Pool'] = function(r) {
  var o = r.options || {};
  window['_sqlep_applyStepVisibility'](r);
  r.skuName = o.poolSize ? (o.poolSize + ' eDTU') : '';
  r.detail  = ['탄력적 풀', o.tier, (o.poolSize ? o.poolSize + ' eDTU' : '')].filter(Boolean).join(', ');
};

// 가격 조회 — productName=계층, skuName='<N> DTU Pack'(eDTUs, '1/Day') → 시간당가(÷24)
window['_resolve_Azure_SQL_Database_Elastic_Pool'] = async function(row, cur) {
  var o = row.options || {};
  var tier = o.tier || 'Standard';
  var size = o.poolSize || (_SQLEP_SIZES[tier] || ['50'])[0];
  var product = _SQLEP_PRODUCT[tier];
  var label = '탄력적 풀 / ' + tier + ' / ' + size + ' eDTU';
  if (!product) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'SQL 탄력적 풀 ' + label + ': 지원하지 않는 계층입니다.');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var items = [];
  try {
    items = await apiFetch({ serviceName:'SQL Database', armRegionName:row.region, productName:product, priceType:'Consumption' }, cur, 300, 4, {pageSize:200, expectedSizeKB:80});
  } catch (err) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'SQL 탄력적 풀 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }
  // skuName 정확 일치(='<N> DTU Pack')
  var target = (size + ' dtu pack');
  var cands = items.filter(function(it){
    return String(it.type||'').toLowerCase()==='consumption' && String(it.skuName||'').toLowerCase() === target;
  }).sort(function(a,b){ return Number(a.unitPrice||0) - Number(b.unitPrice||0); });
  var chosen = cands[0] || null;
  if (!chosen) {
    row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
    setStatus('error', 'SQL 탄력적 풀 ' + label + ': 매칭 실패 (' + items.length + '건 조회).');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var dayPrice = Number(chosen.unitPrice);
  var hourly = dayPrice / 24;   // '1/Day' → 시간당. 엔진: 월=시간당×Qty×usage(예 730)
  row.paygItem = {
    currencyCode: cur, unitPrice: hourly, retailPrice: hourly,
    armRegionName: row.region, productName: product, skuName: size + ' eDTU',
    meterName: chosen.meterName, unitOfMeasure: '1 Hour (from 1/Day)', type: 'Consumption',
    _dtuDayPrice: dayPrice,
  };
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;  // 탄력적 풀 DTU는 절약/예약 미제공
  setStatus('ok', 'SQL 탄력적 풀 ' + label + ' 완료 · ' + hourly.toFixed(4) + ' /1 Hour (일 ' + dayPrice + ')');
  updatePriceCells(row); updateTotalsRow();
};
