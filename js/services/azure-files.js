// ================================================================
// services/azure-files.js — Azure Files
// 수정 대상: 계층/중복성/청구항목 옵션, 가격 필터
// ================================================================
window._svcDefs['Azure Files'] = {
  apiServiceName: 'Storage',
  steps: [
    { key:'fileTier',  label:'계층',      options:['Premium','Hot','Cool','Transaction Optimized'] },
    { key:'redundancy',label:'중복성',    options:['LRS','ZRS','GRS'] },
    { key:'metric',    label:'청구 항목', options:['Data Stored','Snapshots','Metadata'] },
  ],
  instanceField: false,
};
window['_buildDetail_Azure_Files'] = function(r) {
  const o=r.options; r.skuName=`${o.fileTier||''} ${o.redundancy||''}`.trim(); r.detail=[o.fileTier,o.redundancy,o.metric].filter(Boolean).join(', ');
};
