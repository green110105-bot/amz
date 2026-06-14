# 硬边界与不可声明项 (各域 boundaryNotes)

## 全局工作台 + 全局 Action Inbox
- 真实 Amazon SP-API / Ads API 凭证缺失：W3/W14 的 REAL_WRITES_ENABLED='true' 真实写入分支只能验证『进入审批/ad_action_queue 闸门且不触达真实店铺』，无法做端到端真实店铺写入 E2E。无凭证时严禁前端伪装 real、严禁绕过 ad_action_queue（boundaryNotes 锁死为安全不变量）。
- [carryForward 需产品拍板·商业定性] 『一键执行永远 mock』是终态还是临时未决：决定安全文案写『纯演示·不会触达真实店铺』(终态) 还是『真实写入受审计闸门管控』(临时，需补 enqueue+二次确认+审批+回滚 E2E)。直接影响 W6 文案与省钱/省时间价值主张是否为营销话术。在产品定性前 W6 文案先采用可证伪的保守表述。
- [carryForward 需 M2 确认] DB 真实绑店 confidence<0.7 时 expectedImpact.savingMonthly 能否真算出未决：金额钩子估算/留空/标注『影响待评估』三选一，直接决定 W1 payload.expectedImpact 与 DecisionCard.vue:42 impactText number 分支断言口径。当前 W1 验收按『payload 含 expectedImpact 键』断言，金额精度待 M2 确认后再加严。
- [carryForward 需后端确认端点] W11 reject 落 dismissed 依赖 POST /api/v1/audit/dismiss——经核实当前后端无此端点(仅 m2/m4 有 dismiss)。若产品决定留痕则需后端新增端点(升级为 P1 backend 任务)；否则 W11 只能走『删除虚假文案改本次会话已隐藏』分支。
- [carryForward 测试盲区] REAL_WRITES_ENABLED='true' 态顶栏红色高危文案 E2E 依赖 W5 setSourceMeta 修通后才能编写；在数据流(W5/W6)落地前该 E2E 无法编写，应先修数据流再补测，不预先占位 skip。
- 部署/git 边界：本任务为代码契约与前端状态流修复，不涉及生产部署；release-safety/static-skeleton 既有测试已断言 REAL_WRITES_ENABLED=false 默认值，W3 改动须保持该默认安全态不被破坏(回归 tests/deploy/release-safety.test.mjs 与 tests/web/static-skeleton.test.mjs)。

## Amazon 授权接入中心 (OAuth/diagnostics/credentials/provider-mode)
- 真实 Amazon LWA client id/secret + 真实 refresh token 缺失:本期所有 live probe / 真实同步只能在 mock/sandbox 下验证;acceptanceCriteria 中涉及真实 token 交换的断言只能 stub fetch(参照现有 oauth-flow.test.mjs 的 fetchCalls stub 模式),不能跑通真实 Amazon 往返。
- CSRF 终极定级(P0 公网多租户 vs P1 单租户内网)、是否引入 PKCE、换账号覆盖严苛度(409 硬阻断 vs 确认+审计 previousId)均依赖部署形态裁决(运维/架构未表态),本期只落 spapi 路径 cookie==state 可断言拦截点,定级暂记 P1-待裁,carryForward。
- [B-4 已解决] ads CSRF 第二因子已落地:ads OAuth `/start`(已鉴权)下发 HttpOnly `aos_ads_oauth_state` cookie(path=/api/v1/integrations/oauth/ads,同 SP-API cookieHeader 模式),`handleOAuthCallback` 对 provider==='ads' 强制 cookieState===state,缺失/不匹配返回 400 `invalid_oauth_state` 且在 token 交换前拦截(fetchCalls 不增),成功/失败回调统一 clear ads cookie。先前『ads CSRF 在门禁内恒"跳过=通过" false-negative』blocker 已消除,负向用例(无 cookie / cookie!=state)与正向用例(cookie==state)均已可断言(tests/integrations/oauth-flow.test.mjs B-4 CSRF 三例 + tests/qa/amazon-auth-center-contract.test.mjs)。注:Ads OAuth 不经本系统 login handoff,cookie 由 callback 直接校验;PKCE / 换账号覆盖严苛度仍依赖部署形态裁决(carryForward)。
- 长耗时同步架构(异步 jobId 轮询+幂等键 vs 放大单请求 timeout)依赖架构裁决;本期只做不依赖裁决的 syncBusy 前端全局闸 + 渲染后端 steps,后端 in_progress 拦截/排队语义 carryForward。
- 授权后自动轻量首同步(A 的转化诉求)被工程否决:在 syncBusy 闸 + 后端 409 in_progress 落地前,自动首同步会与手动点击跨按钮并发导致配额/token 竞态,本期不引入,carryForward。
- Settings demo seed authorized 修复路线(seed 一律置 0 vs 保留绿标加 dataSource 标识)触及 demo 演示截图依赖,需产品确认是否必须显示'已接入';本期采纳'一致性不变量'(authorized=1 当且仅当存在 active credentials 行)作为底线,具体 seed 取值待产品确认。
- 生产强制禁用 ADS_API_MOCK(NODE_ENV=production 且 ADS_API_MOCK=1 拒绝启动)是否作硬约束需运维表态;未裁前 mock 降级 readiness 成为生产唯一防线,本期已落 mock_ready 降级作为兜底。

## M1 Listing 作战室 (生成/版本/图片矩阵/A-B/资源中心)
- M1-007 PromoteToManual 与所有 A/B/采用 Winner 链路:真实 Amazon SP-API publish adapter 与 Ads API 凭证缺失,'写回 Amazon'/'执行手动转化'的真实态无法实现,只能做到 mock/draft 态。adoptAbWinner 后端已正确停在 ready_for_manual_publish(:1875,uploaded_to_amazon=0、amazon_receipt=null),这是受凭证硬边界约束的正确终态,不得伪装 real。执行态(uploaded_to_amazon=1)保留为 blocker。
- M1-005 amazon_experiment_id 恒 null 是因无亚马逊原生 Manage Your Experiments 接入凭证;本轮只能做到'合成演示数据'横幅诚实标注,真实接入为 blocker。A/B metrics 全部为 mulberry32 合成,zTestSignificance 计算逻辑可单测但数值不代表真实流量。
- M1-007 ad_action_queue 两态(draft→execute):mock 下只能产出并展示 draft 记录,execute 态需真实广告凭证,保留为 blocker。
- 真实数据接入(triggerResearch 竞品抓取、score 真实评分)受 Amazon/第三方数据源凭证缺失约束,M1-001 只整改'真假标签诚实性'(is_mock 强制为 true),不承诺真实数据;score 路径(data-store.mjs:632-637 同为 PRNG)同款问题本轮未纳入(carryForward,见 digest),如纳入需同样下沉 is_mock 列。

## M2 利润/库存/采购/调价/现金流/汇率/税务/LTV/告警
- 真实 Amazon SP-API/Ads 凭证缺失:executeInvLinkEvent 必须保持 _enqueueManualAction dryRun:true/needs_review/queued-not-written,不得绕过 ad_action_queue 真写广告;状态改 queued_pending_review 是本期可做的最大真实度,真实暂停广告需 M3 凭证接入后由 M3 执行(blocker)。
- 无真实汇率源:FxRisk recommendations/sensitivity 只能做到基于 seed/getFxRates 的规则提示+演示横幅+'示意非投资建议'标注,真实波动率建议需接入真实汇率 feed(blocker);fx_rates seed source 应由 central_bank 改 seed 以免伪装权威。
- 无真实税务引擎(Avalara/TaxJar)凭证:TaxAssist 只能本地标记+移除假 CSV 导出+'不向税局提交'文案,真实申报/导出为 blocker;real 模式是否硬禁用动作按钮需产品+法务裁定(carryForward)。
- LTV/Dimensions 缺 Subscribe&Save/Brand Analytics 真实信号:本期只能移除假控件或标'估算-不随周期变化',真实 range 重算需数据源接入(blocker)。
- 现金流双记账修复路线(删 transitionPO 出账三件套 vs 仅加唯一约束)与余额列追溯重写 vs 前端增量推导,涉及已建 seed ordered 态 PO 的 M2ControlTower 预测黄金值重新基线化,需架构确认后才能定回归测试形态(COUNT===1 vs already_paid);本工作清单按'删 transitionPO 出账+payPO 幂等+唯一索引'路线撰写,若架构改判需同步调整 M2-T-01 断言。
- scanAlerts 处置时序(本期真实化 vs 先删 /alerts/scan 路由止血+另行排期)范围/工期未拍板(carryForward);M2-P0-07 已写双方案验收,需 PM 拍板选哪一支。
- envelope 治理一次性 vs 分批、PaymentChannels 是否真功能化、InventoryTransfers 是否真实位移库存、lifecycle 筛选是否对外宣称可用,均为 carryForward,本清单给出可执行方向但最终范围待产品裁定。
- git/部署硬边界:本环境为分析裁决,不涉及真实部署;DB 唯一索引迁移需在迁移脚本中执行并对存量 seed 数据做去重清洗(否则唯一索引建立会因存量双记账行失败)。

## M3 广告 / 领星等价 (LX) / Strategy OS / Action Queue
- 真实 Amazon Ads/SP-API 凭证缺失:本期所有'写'仅能到 dry_run/sandbox。executeActionQueueItem 硬编码 dryRun=1 是正确边界;real 写唯一门控 live-action-executor 当前仅支持 ADJUST_BID/ADJUST_BUDGET,其余 primitive 必抛 unsupported_real_write_primitive,不得静默成功伪装 real。任何 UI/状态/审计均不得呈现 real 写已发生。
- provider-mode!=='real' 时 dataHealth 不得出现 healthy、aiContribution 不得以美元净额作 hero——healthy/真实金额是凭证+真实回流到位后的能力,本期为硬边界,只能标 mock/示例估算。
- BudgetAllocator/Dayparting 改走 enqueue 的后端实体 enqueue 端点若本期未就绪,则降级为按钮 disabled+'即将上线/Demo数据' 角标且严禁单独写审计;'立即改走 enqueue 可点击形态' 受后端端点就绪与测试收口约束,作为依赖项而非本期硬承诺。
- manual-change revert:后端 /manual-changes/:id/revert 端点未实现是硬 blocker;端点就绪前前端必须隐藏撤销/恢复按钮并禁止写 TIMELINE_REVERT 审计(M3-P0-07),不得用本地 state 改写假装已撤销。
- observation cron(observing→closed/succeeded/failed 自动结算)受'无定时任务运行环境/部署'约束,本期不补,降级为删死码+诚实文案(M3-P1-13);若中期补必须同步补可断言结算用例,否则仍是空头承诺。
- carryForward 架构未决项(沙箱可观测性三方案影子回写vs pending态vs纯审计、护栏分级阈值、去重 key 粒度跨域统一、LX 动作 Timeline 归宿)需架构裁决,本期先按 pending 角标范式(M3-P1-17)与 (entity,primitive) 去重粒度(M3-P1-10)落地,留架构二次定夺。

## M4 监控 (异常/Review/跟卖/侵权/申诉/竞品/通知/日报)
- 真实 Amazon 凭证/外发通道缺失:跟卖申诉、IP 投诉、挽回信(BSM/邮件/微信)均无法真实外发到 Amazon。本期硬边界 = 全部降级为『工单台』(仅记录人工操作 + manual-evidence 护栏 + audit 标 _MANUAL,externalWrite:false),不得伪装 real。自动外发(BSM/邮件/微信 API、IP 投诉 API)排期为 blocker,待凭证与服务商接入。
- daily-report 定时推送:scheduler.mjs 仅含 orders/inventory/ads sync job 且默认 disabled(SYNC_SCHEDULER_ENABLED),无 cron 基础设施保障 09:30 准点推送。本期硬边界 = 文案降级『定时推送规划中』+ 时间选择器置灰;真实 daily-report cron 待部署/调度设施确认后再排,列为 blocker。
- categoryRank/竞品 BSR/review trend:无真实竞品采集源,底层为 mulberry32 伪随机种子噪声。本期只能降级为『竞品 BSR(示意)』+ sourceMeta 强制 mock:true;接入我方 catalog BSR / 真实竞品采集为后续 blocker。
- notifications email/wechat 通道:无真实推送通道,deliveryStatus 只能为 queued。本期只能 in_app 真实 + 其余通道置灰标注;真实多通道触达待通道接入。
- SLABoard 升级为『损失控制看板』、M4 价值回收汇总($止损/挽回估算)需 anomaly 表补『影响金额』字段(schema 迁移)且金额来源(估算 vs 实测)跨 M2/M3/M4 取数,成本与准确性争议未决,本期不纳入(carryForward)。
- notifications_read 多店隔离是否加 store_id 维度需历史表迁移;本期仅做 markNotificationRead 加 id+user_id+store_id 归属校验(低成本),全维度隔离迁移为后续决策。
- HIJACK_CONFIRM_COUNTERFEIT 复合 revert(撤草稿+经 ad_action_queue 恢复广告+回退 status,需绕开 24h dedup_key)方向未由产品最终拍板;本期 revert 修复先以『可回滚 case 或显式不可回滚白名单 + UI 置灰/tooltip』兜底,复合 revert 设计列 carryForward。
- manual-evidence 护栏是否扩展到 resolveAnomaly/dismissAnomaly 强制 reason 防 SLA 刷分:本期先落 anomaly from 状态机守卫(M4-P1-01),强制 reason 的护栏与运营摩擦权衡留待守卫上线后评估(carryForward)。

## 横切关注: provider-mode/sourceMeta 真假边界, audit/revert 级联, 多租户隔离, 真实写入 gate, 前端 IA 一致性
- 真实 Amazon LWA/SP-API/Ads-API 生产凭证缺失: 真实写端到端链路(execute → Amazon PUT → 真实回执)本期无法在生产环境验证, 仅能用 sandbox(advertising-api-test.amazon.com)+ mock fetch 验证 gate 行为与请求构造。这是 X-P0-07 采纳 B 方案(纯 mock 坦白)而非开发方案(打通真实写)的根因硬边界。
- 真实写自动回滚(反向写)工程上不可兑现: 反向写自身再过 assertRealWriteGate + assertChangeLimit(live-action-executor.mjs:69-78), previousValue 偏差>10% 触发 real_write_delta_too_large。在不引入独立可审计豁免通道前, 真实写记录只能走 '申请人工回滚' 阻断态(X-P0-06), 自动反向通道保留为 blocker。
- 若给 revert 豁免 change-limit 需独立可审计通道且测试须断言 '豁免路径不可被普通写伪造绕过 gate'; 当前代码无独立 revert 通道, 该断言本期无法编写, 需 M3/广告域 owner + 安全角色拍板后另立项, 本期保留为 carryForward blocker。
- deriveSource / audit origin 列的后端真相源 owner(由谁落表 mock-seed/local-real/ads-real-write)未最终指定; X-P1-01/X-P1-07 落地需该 owner 先确认行级 origin 写入点, 否则前端只能做最小区分。
- 对外 '已挽回¥X' 续费/营销话术合规口径(estimated vs realized 双字段、KPI 是否只汇总 realized)涉及销售/增长/合规三方商业冲突, 超出本功能域技术裁决范围, X-P1-09 仅修前端 reduce 语义 bug 并加 '模拟/预估' 水印, 对外口径单独立项交运营/合规。
- 522 测试全绿不能作为本期可发布证据: 已证实至少 ads-live-action-gate 与 m3-button-level(M3-audit-07/M3-cross-03)正反向锁死错误契约; 全量审计还有多少 '绿色断言' 锁死错误契约本期未完成, 审计完成前不得以全绿为发布门槛。

