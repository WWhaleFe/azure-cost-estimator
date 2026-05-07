// ================================================================
// services/load-balancer.js — Load Balancer
// 수정 대상: 계층 옵션, 청구 항목 옵션
// ================================================================
window._svcDefs['Load Balancer'] = {
  apiServiceName: 'Load Balancer',
  steps: [
    { key:'tier',   label:'계층',    options:['Standard','Basic','Gateway'] },
    { key:'metric', label:'청구 항목', options:['Rules','Data Processed','Inbound NAT Rules'] },
  ],
  instanceField: false,
};
window['_buildDetail_Load_Balancer'] = function(r) {
  const o=r.options; r.skuName=o.tier||''; r.detail=`${o.tier||''} - ${o.metric||''}`.trim();
};
