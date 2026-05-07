// ================================================================
// services/app-gateway.js — Application Gateway
// 수정 대상: SKU 옵션
// ================================================================
window._svcDefs['Application Gateway'] = {
  apiServiceName: 'Application Gateway',
  steps: [
    { key:'sku', label:'SKU', options:['Standard_v2','WAF_v2','Standard_Small','Standard_Medium','Standard_Large'] },
  ],
  instanceField: false,
};
window['_buildDetail_Application_Gateway'] = function(r) {
  const o=r.options; r.skuName=o.sku||''; r.detail=o.sku||'';
};
