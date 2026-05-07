// ================================================================
// services/bandwidth.js — Bandwidth (인터넷 이그레스)
// 수정 대상: 전송 방향 옵션
// ================================================================
window._svcDefs['Bandwidth'] = {
  apiServiceName: 'Bandwidth',
  steps: [
    { key:'direction', label:'전송 방향', options:['Outbound (Internet Egress)','Inter-region','Intra-region'] },
  ],
  instanceField: false,
};
window['_buildDetail_Bandwidth'] = function(r) {
  const o=r.options; r.skuName=o.direction||''; r.detail=o.direction||'';
};
