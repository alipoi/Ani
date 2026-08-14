#!/usr/bin/env bash
# 每日备份 SQLite（SQLite 在线备份 API，WAL 安全，无需停服），保留 7 天
set -euo pipefail
STAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p /opt/ani-backup
cd /opt/ani
node -e "require('better-sqlite3')('data/resources.db',{readonly:true}).backup('/opt/ani-backup/resources_${STAMP}.db')"
echo "backup ok: resources_${STAMP}.db"
find /opt/ani-backup -name 'resources_*.db' -mtime +7 -delete
