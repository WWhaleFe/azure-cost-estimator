// ================================================================
// services/bastion.js — Azure Bastion
// 수정 대상: 계층 옵션
// ================================================================
window._svcDefs['Azure Bastion'] = {
  apiServiceName: 'Azure Bastion',
  steps: [
    { key:'tier', label:'계층', options:['Basic','Standard'] },
  ],
  instanceField: false,
};
window['_buildDetail_Azure_Bastion'] = function(r) {
  const o=r.options; r.skuName=o.tier||''; r.detail=`Azure Bastion ${o.tier||''}`.trim();
};
