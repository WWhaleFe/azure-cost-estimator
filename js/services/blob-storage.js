// ================================================================
// services/blob-storage.js — Blob Storage
// 수정 대상: 액세스 계층/중복성/청구항목 옵션
// ================================================================
window._svcDefs['Blob Storage'] = {
  apiServiceName: 'Storage',
  steps: [
    { key:'blobTier',  label:'액세스 계층', options:['Hot','Cool','Cold','Archive'] },
    { key:'redundancy',label:'중복성',      options:['LRS','ZRS','GRS','RA-GRS','GZRS','RA-GZRS'] },
    { key:'metric',    label:'청구 항목',   options:['Data Stored','Read Operations','Write Operations','Data Retrieval'] },
  ],
  instanceField: false,
};
window['_buildDetail_Blob_Storage'] = function(r) {
  const o=r.options; r.skuName=`${o.blobTier||''} ${o.redundancy||''}`.trim(); r.detail=[o.blobTier,o.redundancy,o.metric].filter(Boolean).join(', ');
};
