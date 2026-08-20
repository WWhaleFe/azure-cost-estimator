import { REG, apiFetch, setStatus, updatePriceCells, updateTotalsRow } from '../core/kernel.js';
import type { Row, ApiItem } from '../core/kernel.js';
// ================================================================
// services/azure-openai.js — Azure OpenAI Service (토큰 기반)
//
//   전용 resolver(_resolve_Azure_OpenAI)로 모델 × 배포 유형 × 토큰 종류 미터를 매칭합니다
//   (가격 하드코딩 없음, Azure Retail Prices API 실시간 조회). serviceName='Foundry Models'.
//   API 구조(koreacentral): 모델 세대별 productName 이 다르다.
//     - GPT-5 계열   → 'Azure OpenAI GPT5', 단위 1M 토큰 (예 'GPT 5 Inpt Glbl' 1809.1875/1M)
//     - GPT-4.x/o1/o3 → 'Azure OpenAI', 단위 1K 토큰 (예 'gpt 4.1 Inp glbl' 0.002/1K)
//     - o4-mini      → 'Azure OpenAI Reasoning', 단위 1K 토큰
//     - 임베딩       → 'Azure OpenAI Embedding', 단위 1K 토큰 (입력만 존재)
//   1K 단위 미터는 ×1000 으로 1M 토큰당 단가로 환산해 usage 단위를 통일:
//   월=단가×Qty×usage(엔진 기본), usage 칸에 백만(1M) 토큰 수 입력.
//   절약/예약(Provisioned Throughput 포함) 미적용. 못 찾으면 "매칭 실패".
//
// [v128] 배포 유형(deploymentType) 옵션 신설 — 지정하지 않으면 최대 2배 오차
//   같은 모델이라도 배포 유형별로 미터와 단가가 다르다(japaneast GPT-4.1 mini 입력:
//   Global 0.5789/1K vs Regional 0.7005/1K). 예전에는 Global 미터 이름을 통째로
//   하드코딩해 두어 Data Zone·Regional·Batch 를 아예 고를 수 없었고, 리전에 그 배포
//   유형이 없으면 조용히 매칭 실패했다. 이제 skuName 을 **문법으로 해석**해 고른다.
//     skuName = <모델 base> + [pp] [batch] + <토큰 종류> + <배포 유형 꼬리>
//   API 의 표기가 리전·모델마다 제각각(glbl/global/Gl/glb, DZ/Dz/dzone/DataZone/Data Zone,
//   regnl/rgnl/regional · Inp/Input/Inpt · Outp/Out/Opt/Outpt · cached/cd/cchd/ccchd)
//   이라 각 자리를 동의어 집합으로 받는다. 모르는 토큰이 하나라도 남으면 후보에서 뺀다
//   — 미세 조정(ft·dev ft·rft·training·hosting)이나 다른 모델(mini/nano/pro/chat/codex)
//   미터가 base 접두사만 같다는 이유로 섞여 드는 것을 막는 장치다.
//
// [v128] GPT-5 계열 단가 2배 과다 산정 수정
//   'pp' 는 우선 처리(Priority Processing)로 표준 단가의 정확히 2배다
//   (koreacentral GPT-5 입력: 'GPT 5 Inpt Glbl' 1809.1875 vs '5 pp inp Gl' 3618.375).
//   예전 카탈로그가 GPT-5·5 mini·5.1·5.2 를 'pp' 미터로 가리키고 있어 전부 2배로
//   계산됐다. 이제 base 를 'gpt 5…' 로 잡아 표준 미터만 매칭한다(pp 는 범위 외).
//
//   범위 외: 우선 처리(pp), 미세 조정·호스팅, 오디오·이미지·실시간(realtime) 모델,
//           Provisioned Throughput(PTU), Assistants·Code Interpreter 같은 도구 과금.
// ================================================================

// 모델(노출명) → productName + skuName base(접두사) 목록.
//   base 는 소문자·구분자 정규화 뒤의 접두사다. 한 모델에 표기가 여러 개면 모두 적는다.
//   inputOnly=true 는 토큰 종류 토큰이 아예 없는 미터(임베딩)를 입력으로 본다.
var _AOAI_CATALOG: Record<string, { prod: string; bases: string[]; inputOnly?: boolean }> = {
  'GPT-5':                  { prod:'Azure OpenAI GPT5', bases:['gpt 5'] },
  'GPT-5 mini':             { prod:'Azure OpenAI GPT5', bases:['gpt 5 mini'] },
  'GPT-5 nano':             { prod:'Azure OpenAI GPT5', bases:['gpt 5 nano'] },
  'GPT-5 pro':              { prod:'Azure OpenAI GPT5', bases:['gpt 5 pro'] },
  'GPT-5 chat':             { prod:'Azure OpenAI GPT5', bases:['gpt 5 chat'] },
  'GPT-5 codex':            { prod:'Azure OpenAI GPT5', bases:['gpt 5 codex'] },
  'GPT-5.1':                { prod:'Azure OpenAI GPT5', bases:['gpt 5.1'] },
  'GPT-5.1 chat':           { prod:'Azure OpenAI GPT5', bases:['gpt 5.1 chat'] },
  'GPT-5.2':                { prod:'Azure OpenAI GPT5', bases:['gpt 5.2'] },
  'GPT-5.2 chat':           { prod:'Azure OpenAI GPT5', bases:['gpt 5.2 chat'] },
  'GPT-5.2 pro':            { prod:'Azure OpenAI GPT5', bases:['gpt 5.2 pro'] },
  'GPT-4.1':                { prod:'Azure OpenAI', bases:['gpt 4.1'] },
  'GPT-4.1 mini':           { prod:'Azure OpenAI', bases:['gpt 4.1 mini'] },
  'GPT-4.1 nano':           { prod:'Azure OpenAI', bases:['gpt 4.1 nano'] },
  'GPT-4o (1120)':          { prod:'Azure OpenAI', bases:['gpt 4o 1120'] },
  'GPT-4o mini (0718)':     { prod:'Azure OpenAI', bases:['gpt 4o mini 0718'] },
  'o1 (1217)':              { prod:'Azure OpenAI', bases:['o1 1217'] },
  'o3 (0416)':              { prod:'Azure OpenAI', bases:['o3 0416'] },
  'o3 mini (0131)':         { prod:'Azure OpenAI', bases:['o3 mini 0131'] },
  'o4-mini (0416)':         { prod:'Azure OpenAI Reasoning', bases:['o4 mini 0416'] },
  'text-embedding-3-small': { prod:'Azure OpenAI Embedding', bases:['text embedding 3 small'], inputOnly:true },
  'text-embedding-3-large': { prod:'Azure OpenAI Embedding', bases:['text embedding 3 large'], inputOnly:true },
};

var _AOAI_METRIC_KEY: Record<string, 'inp' | 'out' | 'cache'> = {
  '입력 토큰': 'inp', '출력 토큰': 'out', '캐시 입력 토큰': 'cache',
};

// 배포 유형(노출명) → { deploy: 꼬리 종류, batch: 일괄 여부 }
var _AOAI_DEPLOY: Record<string, { deploy: string; batch: boolean }> = {
  'Global':           { deploy:'global',   batch:false },
  'Data Zone':        { deploy:'datazone', batch:false },
  'Regional':         { deploy:'regional', batch:false },
  'Batch Global':     { deploy:'global',   batch:true },
  'Batch Data Zone':  { deploy:'datazone', batch:true },
  'Batch Regional':   { deploy:'regional', batch:true },
};
// 꼬리 종류 → 사람이 읽는 이름(매칭 실패 안내에 쓴다)
var _AOAI_DEPLOY_LABEL: Record<string, string> = { global:'Global', datazone:'Data Zone', regional:'Regional' };

// 꼬리 토큰(마지막 1~2개) 동의어 → 배포 유형
var _AOAI_TAIL: Record<string, string> = {
  'glbl':'global', 'global':'global', 'gl':'global', 'glb':'global',
  'dz':'datazone', 'dzone':'datazone', 'datazone':'datazone', 'data zone':'datazone',
  'regnl':'regional', 'rgnl':'regional', 'regional':'regional',
};
var _AOAI_TOK_IN    = { inp:1, input:1, inpt:1 } as Record<string, number>;
var _AOAI_TOK_OUT   = { out:1, outp:1, output:1, opt:1, outpt:1 } as Record<string, number>;
var _AOAI_TOK_CACHE = { cached:1, cd:1, cchd:1, ccchd:1 } as Record<string, number>;

// skuName 정규화 — 소문자, 구분자(-·_)를 공백으로, 공백 축약
function _aoaiNorm(s: string): string {
  return String(s || '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * skuName 을 문법으로 해석한다. 해석되지 않으면 null(= 이 모델의 토큰 미터가 아님).
 * @returns {{metric:'inp'|'out'|'cache', deploy:string, batch:boolean}|null}
 */
export function parseAoaiSku(
  skuName: string, bases: string[], inputOnly?: boolean,
): { metric: 'inp' | 'out' | 'cache'; deploy: string; batch: boolean } | null {
  var n = _aoaiNorm(skuName);
  var rest: string | null = null;
  for (var i = 0; i < bases.length; i++) {
    var b = _aoaiNorm(bases[i]);
    if (n.length > b.length + 1 && n.slice(0, b.length + 1) === b + ' ') {
      var r = n.slice(b.length + 1);
      if (rest === null || r.length < rest.length) rest = r;   // 가장 짧게 남는 base 를 쓴다
    }
  }
  if (rest === null) return null;

  var toks = rest.split(' ');
  // 배포 유형 꼬리 — 마지막 두 토큰('data zone')을 먼저 본다
  var deploy: string | undefined;
  if (toks.length >= 2) deploy = _AOAI_TAIL[toks[toks.length - 2] + ' ' + toks[toks.length - 1]];
  if (deploy) toks = toks.slice(0, -2);
  else {
    deploy = _AOAI_TAIL[toks[toks.length - 1]];
    if (!deploy) return null;
    toks = toks.slice(0, -1);
  }

  // 남은 토큰 — 아는 것만 허용(모르는 토큰이 있으면 다른 모델·미세 조정 미터다)
  var batch = false, hasIn = false, hasOut = false, hasCache = false;
  for (var t = 0; t < toks.length; t++) {
    var tok = toks[t];
    if (tok === 'batch') { batch = true; continue; }
    if (_AOAI_TOK_CACHE[tok]) { hasCache = true; continue; }
    if (_AOAI_TOK_IN[tok])    { hasIn = true; continue; }
    if (_AOAI_TOK_OUT[tok])   { hasOut = true; continue; }
    return null;                                    // pp(우선 처리)·ft·mini·nano… 전부 여기서 걸린다
  }

  var metric: 'inp' | 'out' | 'cache';
  if (hasCache && !hasOut) metric = 'cache';
  else if (hasOut && !hasIn) metric = 'out';
  else if (hasIn) metric = 'inp';
  else if (inputOnly) metric = 'inp';               // 임베딩: 토큰 종류 토큰이 아예 없다
  else return null;
  return { metric: metric, deploy: deploy, batch: batch };
}

REG._svcDefs['Azure OpenAI'] = {
  apiServiceName: 'Foundry Models',
  steps: [
    { key:'model',          label:'모델',      options: Object.keys(_AOAI_CATALOG) },
    { key:'deploymentType', label:'배포 유형', options: Object.keys(_AOAI_DEPLOY),
      tooltip:'같은 모델이라도 배포 유형에 따라 단가가 다릅니다(Regional 이 Global 보다 비쌈). 리전마다 제공되는 배포 유형이 다르며, 없으면 매칭 실패로 알려 줍니다.' },
    { key:'metric',         label:'토큰 종류', options: Object.keys(_AOAI_METRIC_KEY) },
  ],
  instanceField: false,
};
REG['_buildDetail_Azure_OpenAI'] = function(r: Row) {
  var o = r.options || {};
  r.skuName = o.model || '';
  r.detail = ['Azure OpenAI', o.model, (o.deploymentType || 'Global') + ' 배포', o.metric].filter(Boolean).join(' / ');
};

// 가격 조회 — 모델 base 로 후보를 걸러 배포 유형·토큰 종류가 맞는 미터를 고른다
REG['_resolve_Azure_OpenAI'] = async function(row: Row, cur: string) {
  var o = row.options || {};
  var model = o.model || '';
  var metricName = o.metric || '입력 토큰';
  var deployName = o.deploymentType || 'Global';
  var conf = _AOAI_CATALOG[model];
  var dep = _AOAI_DEPLOY[deployName];
  var label = 'Azure OpenAI / ' + (model || '(모델 미선택)') + ' / ' + deployName + ' / ' + metricName;
  var clear = function () { row.paygItem=null; row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null; };

  if (!conf || !dep) {
    clear();
    setStatus('error', label + ': ' + (conf ? '배포 유형' : '모델') + '을 선택하세요.');
    updatePriceCells(row); updateTotalsRow(); return;
  }
  var wantMetric = _AOAI_METRIC_KEY[metricName];
  if (conf.inputOnly && wantMetric !== 'inp') {
    clear();
    setStatus('error', label + ': 이 모델에 없는 토큰 종류입니다(임베딩은 입력 토큰만).');
    updatePriceCells(row); updateTotalsRow(); return;
  }

  var items: ApiItem[] = [];
  try {
    items = await apiFetch({ serviceName:'Foundry Models', armRegionName:row.region, productName:conf.prod, priceType:'Consumption' }, cur, 1000, 5, {pageSize:500, expectedSizeKB:300});
  } catch (err: any) {
    clear();
    setStatus('error', 'Azure OpenAI 조회 실패: ' + String(err.message).slice(0,80));
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 이 모델의 토큰 미터만 추려 (배포 유형, 토큰 종류) 별로 모은다
  var parsed: Array<{ it: ApiItem; p: NonNullable<ReturnType<typeof parseAoaiSku>> }> = [];
  items.forEach(function(it: ApiItem){
    if (String(it.type||'').toLowerCase() !== 'consumption') return;
    var p = parseAoaiSku(String(it.skuName||''), conf.bases, conf.inputOnly);
    if (p) parsed.push({ it: it, p: p });
  });

  var cands = parsed.filter(function(x){
    return x.p.metric === wantMetric && x.p.deploy === dep.deploy && x.p.batch === dep.batch;
  }).sort(function(a, b){ return Number(a.it.unitPrice||0) - Number(b.it.unitPrice||0); });
  var chosen = cands.length ? cands[0].it : null;

  if (!chosen) {
    clear();
    // 이 리전·모델에서 실제로 고를 수 있는 배포 유형을 알려 준다(리전별 편차가 크다)
    var avail: string[] = [];
    parsed.forEach(function(x){
      if (x.p.metric !== wantMetric) return;
      var name = (x.p.batch ? 'Batch ' : '') + (_AOAI_DEPLOY_LABEL[x.p.deploy] || x.p.deploy);
      if (avail.indexOf(name) < 0) avail.push(name);
    });
    var hint = avail.length
      ? ' 이 리전에서 고를 수 있는 배포 유형 → ' + avail.join(', ')
      : ' 이 리전에 이 모델의 미터가 없습니다(다른 리전을 선택하세요).';
    setStatus('error', label + ': 매칭 실패 (' + items.length + '건 조회).' + hint);
    updatePriceCells(row); updateTotalsRow(); return;
  }

  // 1K 토큰 미터는 ×1000 → 1M 토큰당 단가로 통일 (usage 칸=백만 토큰)
  var uom = String(chosen.unitOfMeasure||'');
  var payg;
  if (/1\s*K/i.test(uom) && !/1M/i.test(uom)) {
    var p1 = Number(chosen.unitPrice) * 1000;
    payg = Object.assign({}, chosen, { currencyCode:cur, unitPrice:p1, retailPrice:p1, unitOfMeasure:'1M (normalized)' });
  } else {
    payg = Object.assign({}, chosen, { currencyCode:cur });
  }
  row.paygItem = payg;
  row.sp1Item=null; row.sp3Item=null; row.ri1Item=null; row.ri3Item=null;
  setStatus('ok', label + ' 완료 · ' + Number(payg.unitPrice).toFixed(4) + ' / 1M 토큰 (usage=백만 토큰, 미터 ' + chosen.skuName + ')');
  updatePriceCells(row); updateTotalsRow();
};
