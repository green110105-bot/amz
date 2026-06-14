# Claude → Codex 交接文档

**交接日期**：2026-05-25
**交接人**：Claude (Opus 4.7)
**接手人**：Codex
**项目**：amz — 对标领星 ERP 的亚马逊卖家运营系统（mock-gated，逐步接真实凭证）

---

## 0. 这份文档为什么存在（用户原话转述）

用户的判断：**「我认为 Claude 并没有研究透领星的广告板块，不准备让它继续研究了，改用 Codex。」**

我（Claude）客观接受这个判断。下面第 4 节我会**如实列出我在领星广告 recon 上做得不到位的地方**，不粉饰。Codex 接手时请把这些当成「已知坑」，不要重蹈。

**给 Codex 的一句话**：用户对我（Claude）在「吃透领星广告模块交互细节」这件事上的表现不满意，认为我搞不到位。现在换你来继续。请重点补强 recon 的深度与准确性，以及把 P1 抽屉的 10 个 tab 从 mock 数据接到真实/可信数据源。下面是完整上下文。

---

## 1. 服务器访问凭据（机密）

### Linux 生产服务器
```
IP:        47.97.252.71
用户:      root
密码:      <REDACTED-SEE-SECURE-CHANNEL>
SSH 端口:  22 (OpenSSH 9.6p1, Ubuntu)
公网 URL:  http://47.97.252.71/   (HTTP 明文，未上 HTTPS)
机器名:    iZbp1eusnjm5nvktjznscmZ  (阿里云 ECS, Ubuntu, 4C/7.1G/40G, 16G 可用磁盘)
```

> ⚠️ 历史文档里写的 `demo/demo` 已失效。`Cs88china` 也失效。当前唯一可用的是上面这组。

### 从 Windows 本机怎么连（重要）
本机（Windows 11, `D:\amz`）**没有装 sshpass / plink / putty**，但**装了 Python 3.11 + paramiko 4.0.0**。所以自动化 SSH 走 paramiko。范例：

```python
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.252.71', username='root', password='<REDACTED-SEE-SECURE-CHANNEL>',
          timeout=15, look_for_keys=False, allow_agent=False)
stdin, stdout, stderr = c.exec_command('your command')
print(stdout.read().decode())
c.close()
```

**坑**：Python 是 Windows 原生进程，看不到 Git Bash 的 `/tmp`。scp 上传时本地路径要用 Windows 形式（如 `C:\Users\Administrator\AppData\Local\Temp\xxx`，可用 `cygpath -w` 转换）。SFTP 上传用 `paramiko.Transport` + `SFTPClient.from_transport`。

**坑**：paramiko 的 stdout 在 Python 端打印中文/✓ 时，Windows 默认 GBK 编码会崩 `UnicodeEncodeError`。脚本开头加：
```python
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
```

### GitHub
```
远端:   git@github.com-green110105:green110105-bot/amz.git  (SSH alias, 见 ~/.ssh/config)
HTTPS:  https://github.com/green110105-bot/amz.git  ← 国内访问经常 "Connection was reset"，别用
推送:   git push origin main   (origin 已切到上面的 SSH alias，用 id_ed25519_green110105 密钥)
```
本机 `~/.ssh/config` 里 `Host github.com-green110105` 指定了专用 deploy key。HTTPS 通道在国内不稳定，**一律走 SSH**。

---

## 2. 服务器架构与部署流程（已跑通，照抄即可）

### 线上拓扑
```
nginx :80  (/etc/nginx/sites-enabled/*.conf)
  ├── location /api/    → proxy_pass http://127.0.0.1:8090   (保留 /api 前缀)
  ├── location = /health → proxy_pass http://127.0.0.1:8090/health
  ├── location /assets/  → 静态, expires 7d
  └── location /         → try_files ... /index.html   (SPA fallback)
        root = /var/www/amz-web/      ← 前端 dist 的副本(不是软链)

systemd: amz-api.service
  ExecStart = /root/.nvm/versions/node/v24.15.0/bin/node /opt/amz/src/apps/api/src/server.mjs
  WorkingDirectory = /opt/amz/src
  Env: API_PORT=8090, DATA_DB_PATH=/opt/amz/data/store.db, NODE_ENV=production
  日志: /var/log/amz-api.log (stdout) + /var/log/amz-api.err.log (stderr, append 模式会累积旧错误)

数据: /opt/amz/data/store.db  (SQLite + WAL, ~3.6MB)  ← 千万别覆盖
代码: /opt/amz/src/            ← 部署时整体替换
```

### 关键事实
- 服务器**不是 git 部署**，是 **tarball 部署**（`/opt/amz/` 下有一堆历史 `*.tar.gz`）。`/opt/amz/src/` 不是 git repo。
- 服务器默认 `node` 是 v18.19.1，**但 systemd 用 nvm 的 v24.15.0**。任何手动跑 npm/vite 都要先 `export PATH=/root/.nvm/versions/node/v24.15.0/bin:$PATH`。
- monorepo 结构：根 `package.json` 只有 `better-sqlite3`（+ playwright devDep）；`apps/web-v2/` 有**独立** package.json（vue/element-plus/vite）。**要分别 npm install**。`apps/api/` 没有 package.json，纯 Node 内置 http + 根的 better-sqlite3。
- 前端 dist 要 **build 完再 cp 到 `/var/www/amz-web/`**（nginx 的 root），不是 `/opt/amz/src/apps/web-v2/dist/`（那只是 build 产物原地）。两者保持同 md5。

### 部署脚本（2026-05-25 实测跑通的步骤）
```bash
# 本地（Windows, D:\amz）打 tarball — 排除重物
tar -czf /tmp/amz-deploy.tar.gz \
  --exclude='./node_modules' --exclude='./apps/*/node_modules' \
  --exclude='./packages/*/node_modules' --exclude='./apps/web-v2/dist' \
  --exclude='./data' --exclude='./apps/api/data' --exclude='./.git' \
  --exclude='./test-results' --exclude='./tmp' --exclude='./tools/recon' \
  --exclude='./docs/test-evidence' --exclude='./.claude' \
  --exclude='*.log' --exclude='*.tar.gz' --exclude='*.bak.*' \
  --exclude='*.png' --exclude='*.jpg' .
# → 约 2.4MB / 577 文件。注意会含 .env(sandbox 凭据,服务器本来没有,可上传)

# 服务器端（paramiko exec）：
TS=$(date -u +%Y%m%dT%H%M%SZ)
cp -a /opt/amz/src /opt/amz/src.bak.$TS                    # 备份旧代码
sqlite3 /opt/amz/data/store.db "PRAGMA wal_checkpoint(FULL);"
cp /opt/amz/data/store.db /opt/amz/data/store.db.bak.$TS   # 备份 DB
find /opt/amz/src -mindepth 1 -delete                      # 清空
tar -xzf /opt/amz/amz-deploy.tar.gz -C /opt/amz/src/       # 解压新代码
export PATH=/root/.nvm/versions/node/v24.15.0/bin:$PATH
cd /opt/amz/src && npm install --no-audit --no-fund         # 根依赖(~41包)
cd apps/web-v2 && npm install --no-audit --no-fund          # 前端依赖(~82包)
npm run build                                               # vite build (~330 chunks)
mv /var/www/amz-web /var/www/amz-web.bak.$TS && mkdir /var/www/amz-web
cp -r /opt/amz/src/apps/web-v2/dist/* /var/www/amz-web/     # 同步到 nginx root
systemctl restart amz-api                                   # 重启 API
curl -sf http://localhost:8090/health                       # 验证
```

### 回滚
```bash
TS=<上面那个时间戳>
rm -rf /opt/amz/src && cp -a /opt/amz/src.bak.$TS /opt/amz/src
cp /opt/amz/data/store.db.bak.$TS /opt/amz/data/store.db
rm -rf /var/www/amz-web && mv /var/www/amz-web.bak.$TS /var/www/amz-web
systemctl restart amz-api
```

### 当前服务器上的备份（2026-05-25 部署留下的）
```
/opt/amz/src.bak.20260524T223141Z              ← 部署前的旧代码(Round 9 时代)
/opt/amz/data/store.db.bak.20260524T223141Z    ← 部署前 DB
/var/www/amz-web.bak.20260524T223520Z          ← 部署前旧 dist
```

---

## 3. 软件整体架构

### 技术栈
| 层 | 选型 |
|---|---|
| 持久层 | SQLite + better-sqlite3（WAL 模式），单文件 `store.db`，全模块共享 |
| API | Node 内置 `http` server（`apps/api/src/server.mjs`）+ 纯 ESM，无 Express。按 URL 前缀分发 |
| 前端 | Vue 3 SPA + Vite 6 + Element Plus 2.9 + Pinia + vue-router；移动端用 `@vueuse/core` 的 useMediaQuery 做断点自适应 |
| 共享 | `packages/` 下有 mock-data + domain-engines + contracts |

### 目录结构（重点）
```
D:\amz\
├── apps/
│   ├── api/src/
│   │   ├── server.mjs               # http 入口, 只 import extended-routes
│   │   ├── extended-routes.mjs      # 总路由派发器
│   │   ├── data-store{,-ads,-listings,-profit,-monitor}.mjs  # 4 模块数据层
│   │   ├── full-scope-routes.mjs
│   │   └── integrations/            # ★ Week1 接真实凭证的部分(见下)
│   └── web-v2/src/
│       ├── views/lx/                # 领星等价(LX)广告页: LxAllCampaigns/LxCampaignDetail/LxPortfolios...
│       ├── components/
│       │   ├── AdAnalysisDrawer.vue          # ★ P1 主组件(对标领星 MCompare 抽屉)
│       │   ├── ad-drawer-tabs/               # ★ 10 个 tab SFC + _mock-data.js
│       │   ├── BidAdjustModal.vue            # P0 批量调价
│       │   └── bid-adjust-engine.js          # 调价算法(5 模式)
│       ├── api/lx.js                # 前端 LX API client, BASE='/api/v1/store/ads/lx'
│       └── utils/ad-drawer-config.js # 抽屉 tab 按 entity-type 的映射表
├── packages/                        # mock-data / domain-engines / contracts
├── tools/recon/                     # ★ 领星 RPA 调研工具(40+ 脚本) — 见第4节
├── docs/                            # 大量报告; 领星 recon 三版在这
├── tests/                           # unit / integrations / qa / e2e ...
└── claude2codex.md                  # 本文件
```

### API 路由约定（实测）
- 全部走 `/api/v1/...`，nginx 保留前缀代理到 :8090。
- LX 广告：`/api/v1/store/ads/lx/{portfolios,campaigns,ad-groups,ads,...}` — **返回 401（需 auth），路由已注册**。
- 通用广告：`/api/v1/ads/campaigns` — 200，可直接取数。
- 集成状态：`/api/v1/integrations/spapi/status` — 401。
- audit：`/api/v1/store/audit-logs` — 401。
- 健康：`/health`（无前缀）— 200，返回 `{ok, service, mode:"mock", timestamp}`。
- ⚠️ 大量端点要 auth（返回 401）。前端通过登录后带 token 访问。Codex 若要直接打 API 取数，需要先搞清楚 auth 机制（在 extended-routes.mjs / 中间件里）。

### 4 个业务模块（M1-M4，都已部署且 mock 数据下全绿）
- **M1 Listing 优化室**：8 表 / 30 端点。own/external/new 三模式，5 维调研+打分，版本管理，A/B 测试。
- **M2 利润中枢 + 库存**：24 表 / 50 端点。利润 4 级下钻，PO 状态机，汇率敞口，自定义告警，M2→M3 库存联动。
- **M3 生命周期广告优化**：17 表 / ~70 端点。Strategy 库 / Timeline / LX 12 实体 / SQP / 抢位 / 策略↔Campaign 多对多 / 17 类 actionType revert。**这是广告核心模块，P0/P1 都挂在这里**。
- **M4 日常运营监控**：13 表 / 57 端点。异常状态机 / SLA / 跟卖→M3 暂停广告 / 评论聚类 / 申诉链 / 通知总线。

---

## 4. 我（Claude）的工作方法 + 做得不到位的地方（客观）

### 4.1 领星广告 recon 我是怎么做的
- 用 Playwright `connectOverCDP('http://localhost:9222')` 连接用户本机已开的 Chrome（已登录领星），不重新登录。
- 启动脚本 `tools/recon/launch-chrome.mjs`，截图脚本走 PowerShell 桌面截屏（`[Windows.Forms.SystemInformation]::VirtualScreen` + `CopyFromScreen`）+ `maximize-chrome.ps1`（Win32 ShowWindow API 最大化窗口）。
- 产出三版报告：`docs/LINGXING_ADS_RECON{,_v2,_v3}.md`。v3 是「抽屉层级完整版」，是目前最权威的一份。
- 安全红线：**全程 0 真实写动作**，347+ 非 GET 请求全是 list/get/dashboard/track 类。用户反复强调**绝不能动他真实的广告**（调价、启停等）。这条 Codex 必须继续守住。

### 4.2 我做得不到位的地方（用户不满意的根源，如实列出）
1. **一开始只做 URL 级 recon**（`page.goto` + 列 page-tab），完全漏掉了领星广告最核心的「抽屉（drawer）」交互形态——点行内图标弹出的顶部下拉 panel。直到 v3 才补，浪费了 v1/v2 两轮。
2. **多次把错误的 DOM 元素当成抽屉入口**：把 `twoLine`（CSS 类）、`JS-quick-view`（下拉菜单子项）、`to-compare-vs-list`（其实是 MCompare 的 deep-link 不是独立抽屉）都误判过。
3. **不截图凭空猜 DOM**：用户当场指出「你完全不知道自己在做什么」「你截图屏幕就能看到」。我前期靠 grep DOM 猜，错得离谱。后来才纠正成「每个交互前后都桌面截图，眼睛比 DOM grep 可靠」。
4. **没注意元素在屏幕外**（`to-show-more` 在 x=3262，DOM click 成功但弹窗在可视区外看不见），导致误判交互失败。
5. **抽屉的方向也搞错过**：领星是「顶部下拉（ttb）」，我一开始按侧边/全屏理解。
6. **整体上，我对领星广告的理解停留在「结构层」（有哪些 tab、哪些入口），但对每个 tab 内部的真实数据语义、领星实际的计算口径、卖家真实工作流的细节，挖得不够深**。这是用户判断我「没研究透」的核心。

→ 完整自查清单见 `docs/LINGXING_ADS_RECON_v3.md` 第 10 节「我承认的错误清单」。

### 4.3 我用的 recon 工具（Codex 可复用）
`tools/recon/` 下 40+ 脚本，关键的：
- `launch-chrome.mjs` — 启动带 remote-debugging 的 Chrome
- `maximize-chrome.ps1` / `screenshot-desktop.ps1` — 窗口最大化 + 桌面截屏
- `final-e2e.mjs` — 5 行类型 × 抽屉 × tab 数的 E2E 验证（**这是验证本地复刻品的**，不是领星）
- `row-drawer-sweep.mjs` / `drawer-crawl.mjs` — 抽屉逐 tab 扫描
- `deep-detail-batch2.mjs` / `discover-detail-routes.mjs` — 深度路由发现
- 截屏存档在 `tools/recon/output/`（已从 git 和部署 tarball 排除，体积大）

---

## 5. 详细进度

### 5.1 已完成（mock 数据下）
| 项 | 状态 | 位置 |
|---|---|---|
| M1-M4 四模块 + 跨模块联动 + 通知总线 | ✅ 部署上线 | `apps/api` + `apps/web-v2` |
| Round 1-9 全管道：Dev + QA + Mobile + Fix | ✅ 491/491 PASS | `docs/*_REPORT.md` |
| Week1 SP-API 集成（LWA OAuth / AES-256-GCM 加密 / rate-limiter / sandbox routing） | ✅ 代码完成 | `apps/api/src/integrations/sp-api/` |
| Week1 Ads API 集成（独立 host/header / endpoints / fixtures） | ✅ 代码完成 | `apps/api/src/integrations/ads-api/` |
| 调度器（setInterval + 单飞守护 + immediate first tick） | ✅ | `integrations/scheduler.mjs` |
| P0 批量调价（5 模式 + min/max clamp + validation） | ✅ | `BidAdjustModal.vue` + `bid-adjust-engine.js` |
| P1 AdAnalysisDrawer + 10 tab SFC（对标领星 MCompare） | ✅ UI 完成 | `AdAnalysisDrawer.vue` + `ad-drawer-tabs/` |
| 抽屉接入 5 个 LX master 页 | ✅ | `views/lx/Lx*.vue` |
| 测试：unit 25 + integration 79 + qa 418 = 522 全绿 | ✅ | `tests/` |
| Sandbox 真实网络 E2E（LWA + marketplaceParticipations HTTP 200） | ✅ 1 次成功 | `docs/test-evidence/` |
| 8 commit push GitHub + 部署到 Linux 47.97.252.71 | ✅ 2026-05-25 | — |

### 5.2 AdAnalysisDrawer tab 映射（entity-type → tabs）
来自 `apps/web-v2/src/utils/ad-drawer-config.js`：
```
campaign : 9 tabs (daily/compare/hourly/overBudget/attribution/placement/timeSeries/keyKeywords/history)
keyword  : 5 tabs (daily/compare/hourly/placement/userSearchTerms)
target   : 5 tabs (同 keyword)
adgroup  : 3 tabs (daily/compare/hourly)
ad       : 3 tabs (daily/compare/hourly)
placement: 3 tabs (daily/compare/hourly)
portfolio: 2 tabs (daily/compare)
```
10 个 tab SFC：TabDaily / TabCompare / TabHourly / TabPlacement / TabUserSearchTerms / TabOverBudget / TabAttribution / TabTimeSeries / TabKeyKeywords / TabHistory。
**当前全部 tab 用 `ad-drawer-tabs/_mock-data.js` 的假数据**（TabUserSearchTerms 例外，它先试真 API 再 fallback mock）。

### 5.3 未完成 / 阻塞（交给 Codex 的活）
**A. 领星 recon 深挖（用户最不满意、最优先）**
- 每个 MCompare tab 内部的**真实数据语义 + 领星计算口径**（不只是「有这个 tab」，而是列怎么算、聚合维度、归因窗口具体逻辑）。
- 卖家真实工作流的细节验证（v3 第 6 节是「推断」，没坐实）。
- MHistoryLogV2 操作日志 drawer 的字段语义。
- 抽屉里的写动作入口（领星的「添加到抢位」等）我们**故意没碰**——要厘清哪些是写、对应我们 M3 哪个端点。

**B. P1 抽屉接真数据**
- 10 个 tab 从 `_mock-data.js` 换成真实数据源。`TabUserSearchTerms` 已有「先真 API 后 mock」的范式可参考。
- 数据要么来自我们已 sync 的 SQLite（Ads API sync），要么等 Amazon Ads Reports API 上线后接真。

**C. 真实凭证接入（阻塞中）**
- SP-API Production app 还在 Amazon 审核。当前只有 **sandbox** 凭据（在 `.env`）。
- Ads API 的 Developer 申请**还没开始**。
- 接入顺序见 `PRD.md §13` 和 `PROJECT_STATUS.md` Blocked 段。

**D. 已知技术债（backlog）**
- 11 个 spec 弱点（M1-W1..4 / M3-W1..7），在各模块 SPEC.md。
- M2-O2：revertAuditLog 不级联（M3 的 revertM3Action 风格没扩到 M2/M4）。
- M4 SLA 后台 tick 未实现（manual escalate 端点完整）。
- HTTPS 未上（当前 http 明文）。
- 服务器加固未做（root 密码登录 + UFW 未收紧）。

### 5.4 测试现状（本地 Windows, Node 24.13.1）
```
node --test tests/unit/*.test.mjs            → 25/25 PASS
node --test tests/integrations/*.test.mjs    → 79/79 PASS
node --test --test-concurrency=1 tests/qa/*.test.mjs → 418/418 PASS (必须串行,并行有 DB 竞争)
cd apps/web-v2 && npm run build              → 0 error, ~330 chunks
```
证据日志在 `docs/test-evidence/{01-unit,02-integration,03-qa,04-vite-build}.log` + `SUMMARY.md`。
⚠️ QA 套件**必须 `--test-concurrency=1` 串行跑**，否则 SQLite WAL 并发写有竞争（历史上 M3-revert-12 有 40% flake，已靠 `rowid DESC` tie-break 修掉）。

---

## 6. 给 Codex 的工作建议（基于我踩过的坑）

1. **领星 recon 一定要先截图再下结论**。本机已有完整 Playwright CDP + PowerShell 桌面截屏工具链（`tools/recon/`）。用户的 Chrome 开在 `localhost:9222`，已登录领星。每个交互前后都截图，对照看，别 grep DOM 猜。
2. **守住安全红线**：领星是用户的真实账号，**绝对不能触发任何写操作**（调价/启停/创建/删除/添加抢位）。recon 只读。
3. **抽屉是领星广告的灵魂**：核心复杂度集中在「1 个 MCompare 组件 + 按 row 类型配 7 种 tab 集」。理解这个就理解了 80%。
4. **本地复刻品验证用 `tools/recon/final-e2e.mjs`**（连本机 5173 端口的 Vite dev / 或线上）。注意这个脚本验证的是「我们自己的抽屉」，跟 recon 领星是两回事。
5. **部署严格按第 2 节脚本**，每次先备份 src + DB，留时间戳，方便回滚。**永远不要碰 `/opt/amz/data/store.db`**。
6. **Node 版本**：本地 24.13.1，服务器 nvm 24.15.0。系统默认 node 18 不能用来 build。
7. **改 .env / 凭据**时小心：`token-cipher.mjs` 对 `CREDENTIAL_ENC_KEY` 是 fail-closed 的。

---

## 7. 关键文件索引（Codex 快速上手）

| 想了解 | 看这个 |
|---|---|
| 领星广告抽屉架构（最权威） | `docs/LINGXING_ADS_RECON_v3.md` |
| 整体进度 / 架构快照 | `PROJECT_STATUS.md` |
| Week1 真实凭证集成总结 | `docs/WEEK1_FINAL_REPORT.md` |
| 测试证据 | `docs/test-evidence/SUMMARY.md` |
| 4 模块详细规范 | `docs/M{1,2,3,4}_SPEC.md` |
| 抽屉主组件 | `apps/web-v2/src/components/AdAnalysisDrawer.vue` |
| 抽屉 tab 配置 | `apps/web-v2/src/utils/ad-drawer-config.js` |
| 10 个 tab + mock 数据 | `apps/web-v2/src/components/ad-drawer-tabs/` |
| 前端 LX API client | `apps/web-v2/src/api/lx.js` |
| SP-API 集成 | `apps/api/src/integrations/sp-api/` |
| Ads API 集成 | `apps/api/src/integrations/ads-api/` |
| recon 工具 | `tools/recon/`（README 散在脚本注释里） |

---

## 8. Git 状态

```
分支:  main
最新:  6781fd9 docs: capture full test evidence (522 tests green, sandbox E2E, drawer E2E)
       fc38143 docs: Week 1 final report + 领星 recon v1/v2/v3 + analysis
       eb45b56 tools: utility scripts + 领星 recon toolkit + deployment infra
       1d4dbf3 test: comprehensive unit + integration + QA suites
       5d0b455 feat(web-v2): Vue3 + P0 bulk ops + P1 AdAnalysisDrawer
       f5f2f60 feat(apps): backend API + Week1 SP-API + Ads API
       212a19b feat(packages): shared mock-data + domain engines
       444d384 chore: baseline scaffolding
本地与 origin/main 同步(已 push)。工作树干净。
```

---

## 9. 一句话总结

整个 mock-gated 系统（M1-M4 + 跨模块 + 通知）已经成熟并部署上线，522 测试全绿。Week1 的 SP-API / Ads API 集成代码已写好但只接到 sandbox。**真正没做到位的、用户最在意的，是「吃透领星广告模块的交互与数据细节」，以及把 P1 抽屉从 mock 接到真实数据**。Codex 请从这两点重点突破，工具链和服务器都已就绪。

— Claude (Opus 4.7), 2026-05-25
