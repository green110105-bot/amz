# Competitor Recon — 领星广告模块全自动调研

只覆盖**广告模块**。结果不入 git（已 gitignored）。

## 1. 一次性准备（5 分钟）

```bash
# 装 playwright runtime（已有 @playwright/test 依赖，这一步可能不需要做）
cd D:/amz
npm i -D playwright
```

> Playwright 用你机器**已经装好的 Chrome**（`channel: 'chrome'`），不下载额外 70 MB 的 Chromium。

## 2. 三步跑完（半小时-数小时）

### 步骤 1 — 启动一个 debug 模式的 Chrome 窗口

```bash
npm run recon:open
```

会开一个**独立 profile** 的 Chrome 窗口（不影响你日常用的 Chrome）。debug 端口监听 `localhost:9222`。

**在这个窗口里手动做这 2 件事**：
1. 登录领星 ERP（一次性，profile 会记住）
2. 点开**广告模块**任意一个页面

**这个窗口不要关。** 终端那一侧的 Node 进程也可以 Ctrl+C 退出（Chrome 会继续跑）。

### 步骤 2 — 全自动爬

```bash
npm run recon:crawl
```

脚本干这些事（你不用动）：
- 连到 9222 端口的 Chrome
- 找你当前打开的领星 tab
- 把它的 URL 前缀作为"广告模块"基准
- 读取 sidebar 菜单，**自动展开每个折叠的子菜单**
- 枚举所有同前缀的链接 → `output/routes.json`
- 对每个路由：跳过去 → 全屏截图 → dump DOM → 抓 10 秒内所有 API 请求/响应
- 每页之间 sleep 3-5 秒（礼貌限速）
- 失败自动重试 1 次，跳过坏页继续

输出在 `tools/recon/output/pages/<route-slug>/{screenshot.png, dom.html, network.jsonl}`。

**断点续传**：再跑一次会跳过已抓到 `screenshot.png` 的路由。

### 步骤 3 — 出报告

```bash
npm run recon:analyze
```

合并所有 `network.jsonl` → 输出 4 份 markdown 到 `output/reports/`：
- `lingxing-ads-spec.md` — 完整路由 / 字段 / 状态机
- `api-inventory.md` — 唯一 API 端点 + 示例请求/响应
- `m3-gap-analysis.md` — 你的 M3 vs 领星，逐项对比
- `ui-inventory.md` — 表格列 / 按钮 / 表单字段

## 3. 故障排查

| 症状 | 原因 / 修法 |
|---|---|
| `Cannot connect to localhost:9222` | 你忘了跑 `npm run recon:open` 或 Chrome 关了 |
| `No Lingxing tab found` | 你没在那个 debug Chrome 里登录 + 打开广告模块 |
| 路由抓到 0 个 | 你不在广告模块页面 → 进广告模块再跑 |
| 每页都 timeout | 领星可能在做风控，加大 `--per-page-wait`（默认 10s） |
| 出现验证码 | 立刻 Ctrl+C，回 Chrome 里人工通过，再跑 |

## 4. 合法边界

- 你是付费用户，浏览**自己有权访问**的页面 — 合法
- **不要把你客户的真实业务数据（订单 / SKU）写进 git / 公开文档**
- **不要复刻 UI**，只学产品 idea 与流程
- 不要拿这套脚本扫别人账号

## 5. CLI 参数（可选）

```bash
# 只抓前 10 个路由，调试用
node tools/recon/crawl.mjs --limit 10

# 自定义模块前缀（默认从当前 tab 自动推断）
node tools/recon/crawl.mjs --prefix /erp/ads/

# 加大每页等待
node tools/recon/crawl.mjs --per-page-wait 15
```
