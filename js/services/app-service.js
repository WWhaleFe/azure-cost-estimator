// ================================================================
// services/app-service.js — App Service
// 수정 대상: 계층/OS/인스턴스 옵션
// ================================================================
window._svcDefs['App Service'] = {
  apiServiceName: 'Azure App Service',
  steps: [
    { key:'tier', label:'계층',     options:['Free','Shared','Basic','Standard','Premium v3','Isolated v2'] },
    { key:'os',   label:'OS',       options:['Windows','Linux'] },
    { key:'size', label:'인스턴스', options:['B1','B2','B3','S1','S2','S3','P1V3','P2V3','P3V3'] },
  ],
  instanceField: false,
};
window['_buildDetail_App_Service'] = function(r) {
  const o=r.options; r.skuName=o.size||''; r.detail=`${o.tier||''} - ${o.os||''} - ${o.size||''}`.trim();
};
