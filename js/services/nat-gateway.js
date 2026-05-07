// ================================================================
// services/nat-gateway.js — NAT Gateway
// 수정 대상: 청구 항목 옵션
// ================================================================
window._svcDefs['NAT Gateway'] = {
  apiServiceName: 'Virtual Network',
  steps: [
    { key:'metric', label:'청구 항목', options:['Resource Hour','Data Processed'] },
  ],
  instanceField: false,
};
window['_buildDetail_NAT_Gateway'] = function(r) {
  r.skuName='NAT Gateway'; r.detail=`NAT Gateway - ${r.options.metric||''}`.trim();
};
