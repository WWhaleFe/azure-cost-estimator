// ================================================================
// services/public-ip.js — Public IP
// 수정 대상: SKU 옵션, IP 유형 옵션
// ================================================================
window._svcDefs['Public IP'] = {
  apiServiceName: 'Virtual Network',
  steps: [
    { key:'sku',    label:'SKU',    options:['Standard','Basic'] },
    { key:'ipType', label:'IP 유형', options:['Static','Dynamic'] },
  ],
  instanceField: false,
};
window['_buildDetail_Public_IP'] = function(r) {
  const o=r.options; r.skuName=`${o.sku||''} ${o.ipType||''}`.trim(); r.detail=`${o.sku||''} ${o.ipType||''} IP`.trim();
};
