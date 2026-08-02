// ================================================================
// ui/service-order.js — 서비스 카테고리 표시 순서(드롭다운·CSV 양식 공유)
// 순환 참조(ui-and-bootstrap ↔ export-csv)에서 eval 시점 TDZ를 피하려 별도 모듈로 분리.
// ================================================================
export const SERVICE_CATEGORY_ORDER = [
  'Virtual Machine','Azure Kubernetes Service','Container Apps','Azure Container Registry','Disk','Azure Files','Azure Files Provisioned v2','Blob Storage','Page Blob','Storage Account','Data Lake Storage Gen2','Backup',
  'Virtual Network','VPN Gateway','Load Balancer','Application Gateway','Azure Front Door','Public IP',
  'Azure Firewall','Bandwidth','NAT Gateway','Azure Private Link','Azure DNS',
  'Azure SQL Database','Azure SQL Database Elastic Pool','Azure SQL Managed Instance','Azure Database for MySQL','Azure Cosmos DB','Azure Cache for Redis','App Service','API Management','Azure Bastion',
  'Event Hubs','Service Bus',
  'Log Analytics','Microsoft Sentinel','Azure Synapse Analytics','Azure OpenAI','Azure DevOps',
];
