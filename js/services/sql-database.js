// ================================================================
// services/sql-database.js — Azure SQL Database
// 수정 대상: 계층/컴퓨팅/하드웨어 옵션, RI 지원 여부
// ================================================================
window._svcDefs['Azure SQL Database'] = {
  apiServiceName: 'SQL Database',
  steps: [
    { key:'tier',     label:'계층',     options:['General Purpose','Business Critical','Hyperscale'] },
    { key:'compute',  label:'컴퓨팅',   options:['Provisioned','Serverless'] },
    { key:'hardware', label:'하드웨어', options:['Gen5','M-series','Fsv2-series'] },
  ],
  instanceField: false,
};
window['_buildDetail_Azure_SQL_Database'] = function(r) {
  const o=r.options; r.skuName=`${o.tier||''} ${o.compute||''}`.trim(); r.detail=[o.tier,o.compute,o.hardware].filter(Boolean).join(', ');
};
