#!/usr/bin/env bash
# amz 健康监控 — 每 5 分钟检查 API; 连续失败则自动重启一次并记录。
# 静默挂掉/重启循环会留在日志里, 可用 journalctl/文件查看。
set -uo pipefail
LOG=/var/log/amz-health.log
URL=http://127.0.0.1:8090/health
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
code=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 8 "$URL" 2>/dev/null || echo "000")
if [ "$code" = "200" ]; then
  # 健康: 清除失败计数
  rm -f /tmp/amz-health-fails
  exit 0
fi
# 不健康: 累计失败次数
fails=$(( $(cat /tmp/amz-health-fails 2>/dev/null || echo 0) + 1 ))
echo "$fails" > /tmp/amz-health-fails
echo "[$ts] UNHEALTHY code=$code fails=$fails" >> "$LOG"
# 连续 2 次(约 10 分钟)失败才重启, 避免抖动误杀
if [ "$fails" -ge 2 ]; then
  echo "[$ts] RESTARTING amz-api after $fails consecutive failures" >> "$LOG"
  systemctl restart amz-api
  rm -f /tmp/amz-health-fails
fi
