// ================================================================
// services/mysql.js — Azure Database for MySQL
// 수정 대상: 계층 옵션, vCore 옵션
// ================================================================
window._svcDefs['Azure Database for MySQL'] = {
  apiServiceName: 'Azure Database for MySQL',
  steps: [
    { key:'tier',    label:'계층',  options:['Burstable','General Purpose','Business Critical'] },
    { key:'compute', label:'vCore', options:['B1ms','B2s','D2ds_v4','D4ds_v4','D8ds_v4','D16ds_v4','D32ds_v4'] },
  ],
  instanceField: false,
};
window['_buildDetail_Azure_Database_for_MySQL'] = function(r) {
  const o=r.options; r.skuName=o.compute||''; r.detail=`${o.tier||''} - ${o.compute||''}`.trim();
};
