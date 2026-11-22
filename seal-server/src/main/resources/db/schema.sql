-- 海豹办公云端库（MySQL 8.0，utf8mb4）
-- 由 Node SQLite 版一比一移植；主键与业务标识保持 TEXT(uuid)，时间戳为毫秒 BIGINT。
-- 见 docs/后端重构-接口契约.md 第九节。

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 0,
  autosave TINYINT NOT NULL DEFAULT 0,
  envelope MEDIUMTEXT,
  consent MEDIUMTEXT,
  created BIGINT NOT NULL,
  vault_key MEDIUMTEXT,
  vault_revision BIGINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_users_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS passwords (
  user_id VARCHAR(36) PRIMARY KEY,
  salt VARCHAR(64) NOT NULL,
  digest VARCHAR(128) NOT NULL,
  updated BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_attempts (
  `key` VARCHAR(190) NOT NULL,
  `window` BIGINT NOT NULL,
  count INT NOT NULL,
  PRIMARY KEY (`key`, `window`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  hash VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  expires BIGINT NOT NULL,
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS session_devices (
  session_hash VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  device_id VARCHAR(36) NOT NULL,
  device_name VARCHAR(80) NOT NULL,
  created BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  KEY idx_devices_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS codes (
  phone VARCHAR(20) NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  hash VARCHAR(64) NOT NULL,
  expires BIGINT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  PRIMARY KEY (phone, purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sends (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  phone VARCHAR(20),
  ip VARCHAR(64),
  time BIGINT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nodes (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  `parent` VARCHAR(36),
  kind VARCHAR(16) NOT NULL,
  meta MEDIUMTEXT NOT NULL,
  `version` BIGINT NOT NULL DEFAULT 0,
  deleted TINYINT NOT NULL DEFAULT 0,
  updated BIGINT NOT NULL,
  KEY idx_nodes_user (user_id),
  KEY idx_nodes_parent (parent)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS versions (
  id VARCHAR(36) PRIMARY KEY,
  node_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  `version` BIGINT NOT NULL,
  `blob` VARCHAR(36) NOT NULL,
  bytes BIGINT NOT NULL,
  created BIGINT NOT NULL,
  upload_id VARCHAR(36),
  UNIQUE KEY uk_versions_node_version (node_id, `version`),
  KEY idx_versions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS uploads (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  node_id VARCHAR(36) NOT NULL,
  expected BIGINT NOT NULL,
  total BIGINT NOT NULL,
  received BIGINT NOT NULL DEFAULT 0,
  created BIGINT NOT NULL,
  automatic TINYINT NOT NULL DEFAULT 0,
  KEY idx_uploads_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS publications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  node_id VARCHAR(36),
  kind VARCHAR(16) NOT NULL,
  title VARCHAR(300) NOT NULL,
  description MEDIUMTEXT NOT NULL,
  cover MEDIUMTEXT,
  category VARCHAR(100),
  `blob` VARCHAR(36) NOT NULL,
  bytes BIGINT NOT NULL,
  `text` MEDIUMTEXT,
  name VARCHAR(300) DEFAULT '',
  status VARCHAR(16) NOT NULL,
  created BIGINT NOT NULL,
  KEY idx_publications_user (user_id),
  KEY idx_publications_status (status, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(64),
  action VARCHAR(64),
  time BIGINT,
  detail MEDIUMTEXT,
  KEY idx_audit_time (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shares (
  id VARCHAR(36) PRIMARY KEY,
  node_id VARCHAR(36) NOT NULL,
  owner_id VARCHAR(36) NOT NULL,
  recipient_id VARCHAR(36) NOT NULL,
  permission VARCHAR(16) NOT NULL,
  access_hash VARCHAR(64) NOT NULL,
  envelope MEDIUMTEXT NOT NULL,
  expires BIGINT NOT NULL,
  revoked TINYINT NOT NULL DEFAULT 0,
  created BIGINT NOT NULL,
  KEY idx_shares_owner (owner_id),
  KEY idx_shares_recipient (recipient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tags (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  meta MEDIUMTEXT NOT NULL,
  created BIGINT NOT NULL,
  KEY idx_tags_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS node_tags (
  user_id VARCHAR(36) NOT NULL,
  node_id VARCHAR(36) NOT NULL,
  tag_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (node_id, tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS share_links (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  node_id VARCHAR(36) NOT NULL,
  access_hash VARCHAR(64) NOT NULL,
  code_salt VARCHAR(64),
  code_digest VARCHAR(64),
  expires BIGINT,
  downloads BIGINT NOT NULL DEFAULT 0,
  revoked TINYINT NOT NULL DEFAULT 0,
  created BIGINT NOT NULL,
  KEY idx_share_links_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(36) PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL,
  meta MEDIUMTEXT NOT NULL,
  created BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_members (
  team_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role VARCHAR(16) NOT NULL,
  envelope MEDIUMTEXT NOT NULL,
  joined BIGINT NOT NULL,
  PRIMARY KEY (team_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_invites (
  id VARCHAR(36) PRIMARY KEY,
  team_id VARCHAR(36) NOT NULL,
  inviter_id VARCHAR(36) NOT NULL,
  recipient_id VARCHAR(36) NOT NULL,
  role VARCHAR(16) NOT NULL,
  access_hash VARCHAR(64) NOT NULL,
  envelope MEDIUMTEXT NOT NULL,
  expires BIGINT NOT NULL,
  revoked TINYINT NOT NULL DEFAULT 0,
  accepted TINYINT NOT NULL DEFAULT 0,
  created BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_nodes (
  id VARCHAR(36) PRIMARY KEY,
  team_id VARCHAR(36) NOT NULL,
  `parent` VARCHAR(36),
  kind VARCHAR(16) NOT NULL,
  meta MEDIUMTEXT NOT NULL,
  `version` BIGINT NOT NULL DEFAULT 0,
  updated BIGINT NOT NULL,
  KEY idx_team_nodes_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_versions (
  id VARCHAR(36) PRIMARY KEY,
  team_id VARCHAR(36) NOT NULL,
  node_id VARCHAR(36) NOT NULL,
  `version` BIGINT NOT NULL,
  `blob` VARCHAR(36) NOT NULL,
  bytes BIGINT NOT NULL,
  created BIGINT NOT NULL,
  actor_id VARCHAR(36) NOT NULL,
  UNIQUE KEY uk_team_versions_node_version (node_id, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS realtime_rooms (
  id VARCHAR(36) PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  scope_id VARCHAR(36) NOT NULL,
  node_id VARCHAR(36) NOT NULL,
  type VARCHAR(32) NOT NULL,
  seed MEDIUMTEXT NOT NULL,
  checkpoint MEDIUMTEXT,
  checkpoint_seq BIGINT NOT NULL DEFAULT 0,
  head BIGINT NOT NULL DEFAULT 0,
  `version` BIGINT NOT NULL,
  created BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS realtime_updates (
  room_id VARCHAR(36) NOT NULL,
  seq BIGINT NOT NULL,
  operation_id VARCHAR(64) NOT NULL,
  cipher MEDIUMTEXT NOT NULL,
  bytes BIGINT NOT NULL,
  actor_id VARCHAR(36) NOT NULL,
  created BIGINT NOT NULL,
  PRIMARY KEY (room_id, seq),
  UNIQUE KEY uk_updates_operation (room_id, operation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS realtime_receipts (
  room_id VARCHAR(36) NOT NULL,
  operation_id VARCHAR(64) NOT NULL,
  seq BIGINT NOT NULL,
  digest VARCHAR(64) NOT NULL,
  created BIGINT NOT NULL,
  PRIMARY KEY (room_id, operation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS realtime_presence (
  room_id VARCHAR(36) NOT NULL,
  client_id VARCHAR(64) NOT NULL,
  session_hash VARCHAR(64) NOT NULL,
  `reference` MEDIUMTEXT NOT NULL,
  cipher MEDIUMTEXT NOT NULL,
  updated BIGINT NOT NULL,
  PRIMARY KEY (room_id, client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS releases (
  id VARCHAR(36) PRIMARY KEY,
  platform VARCHAR(16) NOT NULL,
  `version` VARCHAR(64) NOT NULL,
  version_code BIGINT,
  channel VARCHAR(16) NOT NULL,
  mandatory TINYINT NOT NULL DEFAULT 0,
  min_version VARCHAR(64),
  notes MEDIUMTEXT,
  url VARCHAR(2048),
  sha256 VARCHAR(64),
  bytes BIGINT,
  published BIGINT NOT NULL,
  created_by VARCHAR(64),
  withdrawn TINYINT NOT NULL DEFAULT 0,
  asset_id VARCHAR(36),
  UNIQUE KEY uk_releases_pvc (platform, version, channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 管理授权（原 admin-rbac.sqlite 并入）
CREATE TABLE IF NOT EXISTS admins (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  salt VARCHAR(64) NOT NULL,
  digest VARCHAR(128) NOT NULL,
  enabled TINYINT NOT NULL,
  created BIGINT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_admins_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  permissions MEDIUMTEXT NOT NULL,
  created BIGINT NOT NULL,
  UNIQUE KEY uk_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_roles (
  admin_id VARCHAR(36) NOT NULL,
  role_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (admin_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus (
  `key` VARCHAR(32) PRIMARY KEY,
  title VARCHAR(60) NOT NULL,
  visible TINYINT NOT NULL,
  sort INT NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_audit (
  id VARCHAR(36) PRIMARY KEY,
  actor VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  detail MEDIUMTEXT NOT NULL,
  time BIGINT NOT NULL,
  KEY idx_admin_audit_time (time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
