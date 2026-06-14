# 服务器运维脚本（已部署到 47.97.252.71）

> 这些是基础设施即代码。线上已安装；改动后用 deploy 脚本重新上传。

## 文件
- `amz-backup.sh` → 装在 `/usr/local/bin/`。SQLite 在线 `.backup` + 完整性校验 + gzip，留最近 7 份。cron 每天 03:17 UTC。备份目录 `/opt/amz/backups/db/`。
- `amz-healthcheck.sh` → 装在 `/usr/local/bin/`。每 5 分钟探 `127.0.0.1:8090/health`；连续 2 次失败自动 `systemctl restart amz-api`，记录到 `/var/log/amz-health.log`。
- `amz-https.conf` → `/etc/nginx/sites-available/amz.conf`。强制 HTTPS（IP/:80 → 301 跳 `amz.cloudcut.fun`，`/health` 除外）；HTTPS 用现有 `*.cloudcut.fun` 通配符证书。

## cron（`/etc/cron.d/amz`）
```
17 3 * * * /usr/local/bin/amz-backup.sh >> /var/log/amz-backup.log 2>&1
*/5 * * * * /usr/local/bin/amz-healthcheck.sh
```

## 证书续期
certbot.timer 已自动续期（系统自带），无需额外配置。

## 恢复备份
```
zcat /opt/amz/backups/db/store-<ts>.db.gz > /opt/amz/data/store.db
systemctl restart amz-api
```
