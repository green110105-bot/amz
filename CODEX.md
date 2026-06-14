# CODEX.md — 本项目开发工作法（Codex 每次开发都按此执行）

> 这是 amz 项目验证有效的工作方法。**凡是要开发/修复/验证一个"能力"（一个端点、一条跨模块联动、一个前端交互、一项安全不变量…），一律走下面这 7 步。**
> 它把"我觉得行 / 测试绿了"换成"**独立判据在真实行为上判定，可重跑、留证据**"。
>
> 本项目用血的教训证明过这条原则：**992 个测试全绿，仍然漏掉了一个 P0 安全 blocker**（M4 `counterBrand` 直写 `lx_targetings.bid`、绕过审计队列）——绿测试只能证明"我断言的东西成立"，不能证明"我没漏断言"。所以**测试绿 ≠ 可交付**，必须叠加独立对抗式核验。详见本文 §worked example。
>
> 与 `AGENTS.md`（角色/MVP 偏好/外部依赖策略）、`codex22claude.md`（安全不变量基线）配套使用：AGENTS.md 说"做什么"，本文说"怎么把它做实、做到能验收"。

---

## 七步工作法：先定性 → 找判据仪器 → 钉判据 → 建回路 → 看真值 → 容错守闸 → 留证据

| 步 | 动作 | 心法 |
|---|---|---|
| **0 先定性** | 动手前先问：**底座/现有代码是不是已经具备这个属性？** 是 → 任务从"造"塌缩成"**验证 + 别弄坏**"；否 → 才需要真造。还要问：**这件事有没有真实凭证/真实数据前提？** 没有（如真实 Amazon 写入）→ 任务边界塌缩成"mock/sandbox/工单台 + 诚实标注"，**严禁伪装 real**。 | **最高杠杆的一步**。选对边界能把"做不到的"变成"只需验证/只需诚实标注的"。 |
| **1 找判据仪器** | 找一个**独立于你这次改动**的权威判据来源：可断言的集成测试、跨 codepath 契约比对、对抗式审计（让一个只读视角专门证伪你"已完成"的声明）、`/health`·`/ready`·真实 HTTP 探针、检测站/oracle。 | **不能自证**。"我改的代码自己说它对"不算数。 |
| **2 钉判据** | 动手前，把通过/失败写成**具体可断言的条件**（即 worklist 里的 `acceptanceCriteria`），来源权威（安全不变量 / 真实契约 / 评审裁决）。判据**先于实现**。 | 杜绝"事后挪门"——先写死判据，再写实现，不准为了让红的变绿而偷偷改判据。 |
| **3 建回路** | 写**真正打端到端**的测试（真实 HTTP 请求、真实落库断言），一条命令可重跑：`npm.cmd test` / `npm.cmd run check`。**禁止"静态 grep 源码字符串"冒充端到端验证**。 | 可重跑 = 跟版/回归白捡。本项目曾出现"测试只 grep 源码 → 后端路由其实 404"的伪绿，就是回路没打到真实行为。 |
| **4 看真值** | 判 PASS 的唯一依据是**真实测量**：测试真跑绿、`node --check` 过、真实请求返回预期、落库行真的存在/不存在。**不是"编译过 / 代码写完 / agent 自报完成"**。 | "能跑 / 写完了"≠"过得了验收"。**Codex 必须自己重跑，不信任何自报。** |
| **5 容错守闸** | 严格区分**环境故障**（依赖缺失、超时、seed 冲突）和**真失败**，修 harness 再重跑，不误判。**一次只验一个能力，不过闸不前进**，失败单一归因。 | 跨域改动后必须重跑**全量**，因为后改的批次会回归前改的（本项目实测：分批自报全绿，全量却 77 fail）。 |
| **6 守安全不变量** | 任何改动都不得削弱 §安全不变量；**严禁靠删除/弱化安全断言来让测试变绿**。若两个测试/契约互相矛盾，按**业务逻辑 + 优先级**裁决，不是"satisfy 哪个都行"。 | 安全不变量是本项目的底线，高于"让 CI 绿"。 |
| **7 留证据** | 结论落盘：测试输出、`docs/implementation/*` 报告、`PROJECT_STATUS.md` / `MEMORY.md` 更新，让结论**可复现、可审计**。报告里**明确哪些能声明、哪些不能过度声明**。 | 别人（和未来的你 / Claude）能复跑确认。 |

---

## 本项目的"判据仪器"清单（找不到独立仪器就先造）

- **全量门禁**：`npm.cmd run check`（requirements / coverage / contracts / db:validate / ai-eval / `npm test` / web:build / health-check / replay / perf-smoke / mock-scenario / benchmark / release dry-run）。**这是发布前的总闸门，EXIT 必须为 0。**
- **真实 HTTP 集成测试**：通过 `handleAdsRequest`/`handleStoreRequest` 等真实派发 + 落库断言（参考 `tests/qa/m3-button-level.test.mjs` 的 `callAds` 范式），而非 grep 源码。
- **双 codepath 契约比对**：mock 路径与 DB 路径返回同构（参考 `tests/contract/dashboard-contract.test.mjs`、`workbench-dashboard-contract.test.mjs`）。
- **对抗式独立审计**：开发完成后，用一个**只读、专门证伪**的视角复核——找"伪绿 / 削弱了安全断言 / 实现被掏空 / 未真正落地"，带 `file:line` 证据。本项目靠这一步抓到了 992 全绿下的 1 blocker + 2 major。
- **线上探针**：部署后 `/health`、`/ready`、公网 `/`、认证 `/api/v1/dashboard`（看 `sourceMode/mock/realWritesEnabled` 真值）。

> **没有独立仪器的事，本方法关不了环。** 例：真实 Amazon 行为级是否真过检——无公开仪器，只能 mock/sandbox + 诚实承认"上线观察"，不许宣称已通过。

---

## 安全不变量（任何改动不得违反，不得为变绿而削弱其断言）

1. 写 Amazon Ads / 领星广告实体前**必经 `ad_action_queue`**；默认 `dryRun=1 / auditRequired=1 / guardrail.status='needs_review'`。
2. `REAL_WRITES_ENABLED!=='true'` 时，**服务端强制** `requiresRealStoreWrite=false`，**不信任前端 body**；真实写唯一门控是 `live-action-executor`，需 `isRealMode()` + 全部 env gate；**禁批量真实写**。
3. **不得把 mock/hybrid 数据伪装成 real**；`sourceMeta` 真实数据不得误标 mock，mock 不得冒充 real。
4. 真实写记录**未真正反向**时回滚必须**阻断**（409 / "申请人工回滚"），前端按 `dispatchedInverse` 真值分流；**严禁无条件 `UPDATE reverted=1`**。
5. 多租户：所有 store 写路径必须 `resolveStoreScope`，伪造 `x-store-id` 返回 403 `store_not_owned`。
6. 审计 payload **不得含 token/secret 明文**；不得删除未认证 dashboard mock fallback；`executeActionQueueItem` 的 `dryRun=1` 是正确边界，不得改成真写。
7. M2/M4 **不得直接** `UPDATE lx_campaigns / lx_targetings`，一律走队列 intent（`M2_* / M4_*`）。
8. **服务器密码 / Amazon token / LWA secret / GitHub token 绝不写入任何文件、日志、commit。**

---

## worked example：本项目怎么抓到"992 全绿下的 P0 blocker"

1. **定性**：评审裁决要求"M4 品牌反攻不得直写广告竞价"。任务 = 验证它真队列化了。
2. **找仪器**：不靠"测试绿"自证——加一个**对抗式只读审计**视角，专门证伪"已完成"。
3. **钉判据**（下手前写死）：调 `brand-defense/counter` 后，`lx_targetings.bid` **不变** 且 `ad_action_queue` **新增一条 `dryRun=1 / needs_review`** 项。
4. **建回路**：真实 HTTP 打 `/api/v1/store/m4/brand-defense/counter` → 查库断言 bid 未变 + 队列落行（不是 grep 源码）。
5. **看真值**：审计 `Read` 到 `data-store-monitor.mjs:2053` 真有 `UPDATE lx_targetings SET bid=...` 直写 → **判 blocker**（绿测试只是没断言这条）。
6. **容错守闸**：修 `counterBrand` 改走 `enqueueAdAction('M4_BRAND_COUNTER_BID')`，补回归测试；改动引入 2 处旧契约回归 → 按正确契约更新测试 → **重跑全量 996 全绿**。
7. **留证据**：`EXECUTION_REPORT_FINAL.md` 记录 blocker、修复、判据、最终 996/996 + 线上探针真值。

> 一句话：**测试绿只证明"我断言的成立"，不证明"我没漏断言"。**所以每个能力都要叠加独立对抗式核验 + 全量重跑 + 真实探针，再宣布通过。

---

## 适用边界（用错地方会翻车）

- **必须存在独立仪器 + 权威判据，本方法才闭环。** 全量门禁 / 双 codepath / 对抗审计 / 线上探针都是仪器。
- **没有仪器的事关不了环 → 只能诚实标注"上线观察"**，不许宣称已通过（真实 Amazon 行为级即属此类）。
- **判据要选对视角**：安全是"能不能被绕过"的攻击者视角，不是"正常流程能跑"的乐观视角——所以要写"伪造 / 越权 / 重复提交 / 未授权"的负向用例。
