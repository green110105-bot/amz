#!/usr/bin/env bash
# amz 每日数据库备份 — 安全在线备份 SQLite(含 WAL), 留 7 天, 控制磁盘占用。
set -euo pipefail
DB=/opt/amz/data/store.db
DEST=/opt/amz/backups/db
KEEP=7
mkdir -p "$DEST"
ts=$(date -u +%Y%m%dT%H%M%SZ)
out="$DEST/store-$ts.db"
# .backup 是 SQLite 官方在线备份命令: 即使服务正在写也能拿到一致快照(自动合并 WAL)。
/usr/bin/sqlite3 "$DB" ".backup '$out'"
# 完整性校验 — 备份不可信就报错(便于监控发现)。
ok=$(/usr/bin/sqlite3 "$out" "PRAGMA integrity_check;" 2>&1 | head -1)
if [ "$ok" != "ok" ]; then
  echo "[amz-backup] $ts INTEGRITY FAILED: $ok" >&2
  exit 1
fi
gzip -f "$out"
# 只留最近 KEEP 个
ls -1t "$DEST"/store-*.db.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
echo "[amz-backup] $ts OK -> ${out}.gz (kept $KEEP)"
