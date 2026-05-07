// ================================================================
// services/firewall.js — Azure Firewall
// 수정 대상: 계층 옵션, 청구 항목 옵션
// ================================================================
window._svcDefs['Azure Firewall'] = {
  apiServiceName: 'Azure Firewall',
  steps: [
    { key:'tier',   label:'계층',    options:['Standard','Premium','Basic'] },
    { key:'metric', label:'청구 항목', options:['Deployment','Data Processed'] },
  ],
  instanceField: false,
};
window['_buildDetail_Azure_Firewall'] = function(r) {
  const o=r.options; r.skuName=o.tier||''; r.detail=`${o.tier||''} - ${o.metric||''}`.trim();
};
