# Test Evidence — 2026-05-23 全套绿灯

**Git HEAD**：`fc38143`  (main, ahead of origin/main by 7 commits)
**Node**：24.13.1 · **OS**：Windows 11 22631
**捕获时间**：2026-05-23T20:44:12+08:00

---

## 1. Unit Tests · 25/25 PASS · 49 ms

`node --test tests/unit/*.test.mjs` → `01-unit.log`

| 套件 | 用例数 |
|---|---:|
| `ad-drawer-config.test.mjs` | 10 |
| `bid-adjust-engine.test.mjs` | 15 |
| **合计** | **25** |

涵盖：entity-type → tabs 映射矩阵、5 模式调价计算、min/max clamp、validation 边界。

## 2. Integration Tests · 79/79 PASS · 8.7 s

`node --test tests/integrations/*.test.mjs` → `02-integration.log`

| 套件 | 用例数 |
|---|---:|
| sp-api-foundation | 10 |
| sp-api-orders-sync | 8 |
| sp-api-reports | 9 |
| sp-api-catalog | 5 |
| ads-api | 14 |
| provider-mode | 9 |
| sync-routes | 16 |
| scheduler | 8 |
| **合计** | **79** |

涵盖：AES-256-GCM 加解密、LWA token 刷新、rate-limiter token bucket、sandbox routing、429/5xx 退避、9 个 sync HTTP endpoint、调度器循环 + 单飞守护 + immediate first tick。

## 3. QA Tests · 418/418 PASS · 1.48 s (serial mode)

`node --test --test-concurrency=1 tests/qa/*.test.mjs` → `03-qa.log`

| 套件 | 用例数 |
|---|---:|
| m1-button-level | 94 |
| m2-functional | 100 |
| m3-button-level | 163 |
| m4-functional | 58 |
| **m4-regression-revertM4Action**（M4-R1 修复回归） | **3** |
| **合计** | **418** |

涵盖：4 模块全部 endpoint × happy/negative/state-machine、跨模块联动（M2→M3 库存暂停 / M4→M3 跟卖暂停）、17 类 actionType revert、SP-API/Ads sync 集成、audit-log 撤销、5 分钟通知 dedup 等。

## 4. Vite Build · 5.41 s · 0 编译错误

`cd apps/web-v2 && npm run build` → `04-vite-build.log`

- 10 个 ad-drawer-tabs SFC 各自独立 chunk（lazy-load 验证）
- 总产物 ~1.3 MB（gzip 408 KB）
- 0 type errors / 0 missing imports

## 5. 真实网络 Sandbox E2E

之前已验证（见 `tmp/sentinels/p48-spapi-sandbox-e2e.DONE`）：
```
LWA refresh→access     1125 ms  HTTP 200
GET /sellers/v1/marketplaceParticipations
                       803 ms   HTTP 200
                       returns sandbox seller "BestSellerStore"
sync_runs audit row    syr-4fa007e0 status=ok records_in=1
```

## 6. 浏览器 E2E — 5 行类型 × Drawer 全绿

`node tools/recon/final-e2e.mjs` → `[final] ✅ ALL GREEN`

| 行类型 | 入口 | tab 数 | 状态 |
|---|---|---:|---|
| Campaign | `LxAllCampaigns` 📊 icon | 9 | ✓ |
| AdGroup  | `LxTabAdGroups` 行点击 | 3 | ✓ |
| Ad       | `LxTabAds` 📊 icon + ASIN | 3 | ✓ |
| Keyword  | `LxTabTargeting` 行点击 + 3 icon | 5 | ✓ |
| Portfolio| `LxPortfolios` 📊 icon | 2 | ✓ |
| **合计** | | **22 个 drawer×tab 组合** | **5/5** |

截图见 `tools/recon/output/final-e2e/{campaign,adgroup,ad,keyword,portfolio}.png` 和 `tools/recon/output/hd-shots/`（43 张 desktop 实地截屏）。

## 7. 调研合规审计

`tools/recon/output/recon-audit.log` 包含 347 行非 GET 请求审计：
- 0 真实写动作（每条都是 list/get/dashboard/track 类）
- 1 处 M4-R1 真 bug 被发现 + 修复 + 加 3 个 regression 测试

---

## 累计绿灯

```
Unit          25  +
Integration   79  +
QA           418  =  522 个测试全绿
Build              0 编译错误
Sandbox E2E       1 真实网络成功
浏览器 E2E         5 行类型 × 22 个 drawer×tab 组合
```

**0 失败 / 0 跳过 / 0 已知 bug 未修**。

---

## 关于 Linux 服务器部署

测试**在本地 Windows 跑**（Node 24.13.1）。Linux 服务器（47.97.252.71）当前还跑的是 Round 9 阶段的旧代码，新 commit **尚未推送也未部署**。

如需部署：
1. `git push origin main` 推 7 个新 commit 到 GitHub
2. 服务器 `git pull` 拉新代码
3. `npm install`（无新依赖，应该是 no-op）
4. PM2 / systemd 重启 API + 重新 build Vite 静态
