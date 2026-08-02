// ================================================================
// main.js — Vite 엔트리. 로드 순서: services(레지스트리 등록) → resolver → diagnostics → ui → remark
// 서비스는 import 시점에 REG 에 자기 정의를 등록(부수효과)하므로 ui 보다 먼저 import 한다.
// ================================================================

// 1) 서비스 정의 + resolve (순서 무관, ui 보다 먼저)
import './services/vm.js';
import './services/aks.js';
import './services/disk.js';
import './services/vpn-gateway.js';
import './services/load-balancer.js';
import './services/app-gateway.js';
import './services/public-ip.js';
import './services/firewall.js';
import './services/bandwidth.js';
import './services/nat-gateway.js';
import './services/sql-database.js';
import './services/sql-managed-instance.js';
import './services/sql-elastic-pool.js';
import './services/mysql.js';
import './services/app-service.js';
import './services/bastion.js';
import './services/azure-files.js';
import './services/blob-storage.js';
import './services/storage-account.js';
import './services/adls-gen2.js';
import './services/page-blob.js';
import './services/files-provisioned-v2.js';
import './services/backup.js';
import './services/virtual-network.js';
import './services/log-analytics.js';
import './services/sentinel.js';
import './services/synapse.js';
import './services/cosmos-db.js';
import './services/redis-cache.js';
import './services/api-management.js';
import './services/private-link.js';
import './services/container-registry.js';
import './services/azure-dns.js';
import './services/azure-devops.js';
import './services/azure-openai.js';
import './services/event-hubs.js';
import './services/service-bus.js';
import './services/container-apps.js';
import './services/front-door.js';

// 2) 엔진/진단/UI (부수효과: 이벤트 바인딩·초기 행 생성·진단 부팅)
import './core/resolver-engine.js';
import './diagnostics.js';
import './ui-and-bootstrap.js';

// 3) 안내(Remark) 팝업/본문 렌더링
import './core/remark.js';
