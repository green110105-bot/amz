# M1：AI Listing 迭代优化室 — 详细设计

> **状态**：开发就绪规格
> **版本**：v1.0
> **最后更新**：2026-05-07
> **依赖**：数据底座、AI 决策引擎、SP-API ListingsItems、第三方 Review 数据

---

## 目录

- [1. 模块概述](#1-模块概述)
- [2. 用户场景](#2-用户场景)
- [3. 用户故事（USR）](#3-用户故事usr)
- [4. 信息架构](#4-信息架构)
- [5. 评分系统详细设计](#5-评分系统详细设计)
- [6. 多轮迭代流程（状态机）](#6-多轮迭代流程状态机)
- [7. AI Prompt 设计](#7-ai-prompt-设计)
- [8. 类目特化](#8-类目特化)
- [9. 页面与交互详细设计](#9-页面与交互详细设计)
- [10. 数据模型（DDL）](#10-数据模型ddl)
- [11. API 端点规格](#11-api-端点规格)
- [12. 业务规则](#12-业务规则)
- [13. 边界条件与异常](#13-边界条件与异常)
- [14. 与其他模块的集成](#14-与其他模块的集成)
- [15. 验收测试用例](#15-验收测试用例)
- [16. 性能与扩展](#16-性能与扩展)

---

## 1. 模块概述

### 1.1 价值主张

> **不是一键生成，是"评分 → AI 改 → 评分 → 再改"的对话式表单迭代。运营和 AI 协作，看得见 AI 的判断逻辑，并能逐步学习。**

### 1.2 核心特性

| 特性 | 描述 |
|---|---|
| 优化范围 | **覆盖全部 Listing 元素：标题 / 五点 / 描述 / A+ 文案 / 主图 / A+ 图 / Gallery 图** |
| 多维评分 | 5 大维度 × 17 子项，百分制透明评分 |
| 多轮迭代 | 每轮聚焦 1 个改进点，最多 N 轮 |
| 协商式协作 | AI 给 3 个方案（文本和图像都是 3 候选），运营选/改/反馈 |
| **图像生成** | **AI 多模态生成主图、A+ 图（场景/对比/信息图等），3 候选迭代** |
| 推理可见 | 每条改动都有"为什么"，运营可学 |
| 真实数据驱动 | 基于自家 + 竞品 + 真实 Review，非凭空生成 |
| 一键发布 + A/B | 完成后同步亚马逊，可启动原生 A/B |
| 历史可回滚 | 每次发布都是新版本（含图像），可比较可回滚 |
| 类目特化 | 不同类目用不同评分权重 + Prompt + 图像风格 |

### 1.3 优化范围（明确清单）

| 元素 | 评估 | 生成/改写 | 备注 |
|---|---|---|---|
| 标题 (title) | ✅ | ✅ | 含品牌、关键词、规格 |
| 五点 (bullets, 5 个) | ✅ | ✅ | 含 USP / 实证 / 决策因素 |
| 描述 (description) | ✅ | ✅ | 长文本 |
| A+ 文案（模块化）| ✅ | ✅ | 各模块独立 |
| 主图 (main image) | ✅ | ✅ **AI 概念稿（非终图）** | 见 1.3a 合规策略 |
| Gallery 图（含场景/尺寸/使用） | ✅ | ✅ **AI 直接生成** | A+ 风格规则更宽松 |
| A+ 图（含对比表/信息图等） | ✅ | ✅ **AI 直接生成** | 模块化 |
| 视频 | ✅ | ❌ V2 再做 | 当前仅评估 |
| Brand Story（A+ 顶部） | ✅ | ✅ | 仅品牌备案 |

### 1.3a 主图 AI 生成的合规策略（关键设计）

> ⚠️ **亚马逊主图必须"实物拍摄风格"**。纯 DALL-E / Imagen 渲染极易被审核拒（即使白底合规）。本产品采用**三层方案**：

#### 方案 A（默认推荐）：AI 概念稿 + 用户拍摄

1. AI 生成 3 个**概念稿**（包含布光建议、角标位置、卖点排布）
2. 概念稿不直接发布，作为"拍摄简报"交给用户/拍摄团队
3. 用户拍真实照片后上传，系统做合规检查 + 角标合成
4. **用途**：替代昂贵的设计师/摄影师沟通，将"我想要 X 风格" → 可视化稿

#### 方案 B：AI 直接生成（仅限"产品已有真实图作底版"的微改场景）

适用：已有合规真实主图，只需微改（加角标、调亮度、换背景为纯白）。
- 不允许 AI 重新合成产品本体
- 仅做后期处理（合成角标、白底替换、亮度对比微调）
- 多模态合规检查 + 视觉相似度（embedding）双校验：与原图相似度 > 0.85 才允许

#### 方案 C：自部署 SD + 真实产品 LoRA fine-tune（高级套餐 P2）

- 用户提供 30+ 张产品多角度真实照片
- 系统训练专属 LoRA（仅该 SKU）
- 后续"换角度 / 换场景"基于真实产品特征生成
- **风险标注**：仍需用户确认"这看起来够真实"

#### A+ / Gallery 不受此限制

亚马逊 A+ 和 Gallery 允许插画、信息图、场景图，**直接 AI 生成无问题**，仍走 5.2.4 中的内容合规检查。

#### UI 上的明确告知

主图生成入口必须显示：
> ⚠️ AI 主图为"概念稿"，建议作为拍摄参考。如需直接发布，请使用"微改模式"或上传真实拍摄图。亚马逊主图审核拒绝率：纯 AI 生成 ~30%，AI 微改 ~5%，真实拍摄 ~1%。

### 1.3b 图像版权与侵权防范

- 所有"AI 生成"输出必须附带 `generation_metadata`（模型、prompt、参考图来源）
- 与竞品图像 embedding 相似度 > 0.92 → 阻止生成 + 提示风险
- 用户上传的"参考图"必须勾选"我有此图的合法使用权"
- 系统不存储未授权竞品图（仅短期分析后丢弃）

### 1.4 不做的事

- ❌ 不做视频生成（V2 再做，但当前评估视频质量）
- ❌ 不做关键词排名追踪（这是 M3 / M4 的事）
- ❌ 不做无品牌备案 SKU 的 A+ 修改（亚马逊限制）
- ❌ 不做实物拍摄（AI 生成是基于参考图 + 描述的合成，不替代真实产品摄影）

---

## 2. 用户场景

### 2.1 场景清单

| # | 场景 | 触发 | 频率 |
|---|---|---|---|
| **S1** | 新品上架前 Listing 准备 | 创建新 SKU 时 | 每月 1-5 次 |
| **S2** | 销量下滑诊断 | M4 异常报警"销量异常下降"时 | 每 SKU 每年 2-4 次 |
| **S3** | 竞品改动跟进 | M4 竞品作战室告警"竞品改了 Listing" | 每月 5-10 次 |
| **S4** | 差评聚类反馈 | M4B Review 分析推送"Listing 没回应这个差评" | 每月 3-5 次 |
| **S5** | A+ 内容刚通过审核 | A+ 审核通过事件 | 每 SKU 1-3 次 |
| **S6** | 季度优化复盘 | 用户主动 / 系统每季提醒 | 每季 1 次 |
| **S7** | 父子变体优化 | 用户从变体管理跳入 | 不定期 |
| **S8** | 主关键词调整 | M3 关键词分析推送"该词覆盖率低" | 每月 2-5 次 |

### 2.2 场景 → 模块入口映射

| 场景 | 入口 | 默认初始化 |
|---|---|---|
| S1 | M1 主入口 → 新建 SKU 优化 | 空白模板 + 类目最佳实践 |
| S2 | Dashboard 异常 → "诊断 Listing" | 自动诊断 + 标红可疑维度 |
| S3 | 竞品作战室 → "对比并优化" | 双栏对比模式（己方 vs 竞品） |
| S4 | Review 中心 → "推送到 Listing 优化" | 预选"用户痛点对齐"维度 |
| S5 | A+ 通过通知 → "立即评估" | 预选"视觉与 A+"维度 |
| S6 | M1 主入口"季度复盘"按钮 | 列出所有低分 SKU |
| S7 | 商品中心 → 变体 → "优化" | 限定当前变体 ASIN |
| S8 | 广告关键词分析 → "优化 Listing 覆盖" | 预选"关键词覆盖度"维度 |

---

## 3. 用户故事（USR）

> 编号规则：`US-M1-XXX`，按优先级排序。

### 3.1 P0（MVP 必须）

| ID | 用户故事 | 验收 |
|---|---|---|
| US-M1-001 | 作为运营，我希望选择一个 SKU 后系统能自动拉取其当前 Listing、5 个头部竞品 Listing、近 30 天搜索词报告、自家 + 竞品最近 50 条 Review，作为优化基础数据 | 数据齐全，10s 内呈现 |
| US-M1-002 | 作为运营，我希望看到当前 Listing 的 5 维度评分（百分制）+ 总分 | 评分有依据可展开 |
| US-M1-003 | 作为运营，我希望看到 AI 推荐的"最关键的 3-5 个改进点"（按 ROI 排序） | 每条带预期分数提升 |
| US-M1-004 | 作为运营，我希望选择 1 个改进点后，AI 给我 3 个不同风格的改写方案 | 3 案文风/侧重不同 |
| US-M1-005 | 作为运营，我希望对 AI 方案能"采纳 / 微调 / 拒绝并要求重写" | 反馈循环顺畅 |
| US-M1-006 | 作为运营，我希望每完成一轮迭代后能看到新评分 + 与上一轮的对比 | 对比直观 |
| US-M1-007 | 作为运营，我希望一键将优化后版本同步到亚马逊后台 | 同步成功率 ≥ 99% |
| US-M1-008 | 作为运营，我希望每次改动都生成新版本（含图像），可对比、可回滚 | 版本号递增 |
| US-M1-009 | 作为运营，我希望对每条改动都能看到"AI 为什么这么改"的推理 | 每条可展开 |
| US-M1-010 | 作为运营，我希望看到当前 SKU 的优化历史记录（哪轮做了什么） | 历史完整 |
| US-M1-IMG-1 | 作为运营，我希望对主图能让 AI 生成 3 个改进版本（基于现有主图为参考） | 3 候选 |
| US-M1-IMG-2 | 作为运营，我希望生成的主图符合亚马逊主图规则（白底、无文字水印、产品占比≥85%） | 100% 合规 |
| US-M1-IMG-3 | 作为运营，我希望对 A+ 模块图（信息图/对比图/场景图）能让 AI 生成 | 3 候选 |
| US-M1-IMG-4 | 作为运营，我希望对生成的图能"在 X 上微调（再生成）/ 用 Y 风格再来一版" | 反馈可调 |
| US-M1-IMG-5 | 作为运营，我希望对生成的图能在内置编辑器做微调（裁剪/角标/文字位置） | 简单编辑器 |
| US-M1-IMG-6 | 作为运营，我希望生成的图能直接同步到亚马逊（含主图触发审核流程跟踪） | 同步成功 |

### 3.2 P1（增强）

| ID | 用户故事 | 验收 |
|---|---|---|
| US-M1-011 | 作为运营，我希望针对差评聚类的某个问题（如"按键易松"），AI 直接告诉我应该在 Listing 哪里回应 | 定位精准 |
| US-M1-012 | 作为运营，我希望看到关键词覆盖度热力图（哪些词被覆盖、缺失） | 可视化清晰 |
| US-M1-013 | 作为运营，我希望对比自家 vs 竞品 Listing 的关键卖点表格 | 一眼能看出差距 |
| US-M1-014 | 作为运营，我希望优化完成后能一键启动亚马逊原生 A/B 测试（仅主图/A+ 模块） | 14 天后自动回收结果 |
| US-M1-015 | 作为运营，我希望 A/B 结果出来后系统自动告诉我谁赢、是否显著 | 显著性计算正确 |
| US-M1-016 | 作为运营，我希望优化的 SKU 列表中可看到"潜力分"（潜在提升空间） | 帮助优先级排序 |
| US-M1-017 | 作为运营，我希望可以批量诊断（如全部低于 60 分的 SKU），但优化仍需逐个进行 | 批量诊断高效 |
| US-M1-018 | 作为运营，我希望针对父子变体，优化时可选"仅当前 ASIN" / "应用到所有子变体" | 选项明确 |
| US-M1-019 | 作为运营，我希望主图改动后能看到亚马逊审核状态（pending/approved/rejected） | 状态实时更新 |
| US-M1-020 | 作为运营，我希望对系统识别的"用户痛点"能反馈"误识别 / 不重要" | 反馈可改进 AI |

### 3.3 P2（高级）

| ID | 用户故事 | 验收 |
|---|---|---|
| US-M1-021 | 作为运营，我希望能保存"我的偏好"（语调、卖点强调倾向），后续 AI 改写参考 | 持久化生效 |
| US-M1-022 | 作为运营，我希望能定义"品牌词库 / 禁用词"，AI 不会输出禁用词 | 100% 不出现禁用词 |
| US-M1-023 | 作为运营，我希望对优化前后的销量、排名、CVR 对比一目了然 | 数据归因清晰 |
| US-M1-024 | 作为运营经理，我希望能看团队中各运营优化的 SKU 数 + 平均提升幅度 | 团队报表可用 |
| US-M1-025 | 作为运营，我希望系统在我犹豫某个改动时，给"参考案例"（同类目类似优化的成功案例） | 案例库可查 |
| US-M1-026 | 作为运营，我希望可以为某 SKU 设置"暂不优化"标记（如即将下架） | 标记后系统不再推荐 |
| US-M1-027 | 作为运营，我希望对某些固定文案（如"FBA Prime"）能"锁定不改" | 锁定字段保留 |
| US-M1-028 | 作为运营，我希望多个国家站的同一 SKU 能基于一个母版进行本地化优化 | 多语言同步 |

---

## 4. 信息架构

### 4.1 页面树

```
M1 Listing 优化室
├ /listings                       SKU 列表（主入口）
│  ├ ?filter=                    筛选/排序
│  └ ?batch=diagnose             批量诊断
├ /listings/[productId]          单 SKU 优化室（核心页）
│  ├ /diagnose                   诊断结果
│  ├ /iterate                    迭代会话（多轮）
│  │  └ /round/[n]              单轮详情
│  ├ /preview                    应用前预览
│  └ /apply                      应用确认
├ /listings/[productId]/versions 历史版本
│  └ /compare?from=&to=         版本对比
├ /listings/[productId]/experiments  A/B 实验
│  ├ /new                        启动 A/B
│  └ /[experimentId]            实验详情
├ /listings/templates             类目模板
└ /listings/keywords-library     关键词库（个人/团队）
```

### 4.2 主导航位置

```
左侧主导航 → 「优化」 → 「Listing 优化」（即 M1 主入口 /listings）
```

### 4.3 跨模块跳入入口

- 从 Dashboard"今日待办"卡片
- 从 M4A 异常详情"诊断 Listing 问题"按钮
- 从 M4B Review 聚类"推送到 Listing 优化"
- 从 M4C 竞品作战室"对比并优化"
- 从 M3 关键词分析"优化 Listing 覆盖"
- 从商品中心 SKU 详情"优化"按钮

---

## 5. 评分系统详细设计

### 5.1 总评分公式

```
total_score = Σ (dimension_score × weight)
其中：
  dimension_score ∈ [0, 100]
  Σ weight = 1.0
```

### 5.2 5 大维度 × 17 子项

#### 5.2.1 维度 D1：关键词覆盖度（权重 25%）

| 子项 | 权重 | 评估方法 |
|---|---|---|
| D1.1 主词覆盖率 | 12/25 | 搜索词报告 Top 10（按曝光）在 标题 + 五点 中出现的比例 |
| D1.2 长尾词覆盖率 | 8/25 | 搜索词报告 Top 30 长尾词（4+ tokens）在 五点 + 描述 + A+ 中覆盖比例 |
| D1.3 否定词避免 | 5/25 | 用户/类目"禁用词库"中的词在 Listing 中是否出现（出现扣分） |

**评分逻辑：**
```python
D1.1 = min(100, coverage_ratio_top10 * 100) * (12/25)
D1.2 = min(100, coverage_ratio_top30_longtail * 100) * (8/25)
D1.3 = (100 - banned_words_present_count * 20) * (5/25)
D1 = D1.1 + D1.2 + D1.3
```

**显示：**
- 热力图：每个关键词标"已覆盖（绿）/ 部分（黄）/ 缺失（红）"
- 缺失关键词列表 + 建议加入位置（标题/五点 #N/A+）

#### 5.2.2 维度 D2：卖点清晰度（权重 20%）

| 子项 | 权重 | 评估方法 |
|---|---|---|
| D2.1 USP 强度 | 5/20 | LLM 评估五点首句是否突出独特卖点（与竞品差异） |
| D2.2 实证强度 | 5/20 | 是否包含数据/认证/规格（如"5000mAh"、"FCC 认证"） |
| D2.3 决策因素覆盖 | 5/20 | 5W2H 框架（What/Who/When/Where/Why/How/HowMuch）覆盖度 |
| D2.4 vs 竞品差异化 | 5/20 | 与头部竞品 Listing 的差异化程度（embedding 距离 + LLM） |

**评分逻辑：**
```python
D2.1 = LLM_score(usp_strength, prompt="评估五点首句的独特卖点强度") * (5/20)
D2.2 = count_evidence_phrases / 5 * 100 * (5/20)  # 计数实证短语
D2.3 = covered_factors / 7 * 100 * (5/20)  # 7 个决策因素
D2.4 = differentiation_score(self, competitors) * (5/20)
D2 = sum
```

#### 5.2.3 维度 D3：用户痛点对齐（权重 20%）

| 子项 | 权重 | 评估方法 |
|---|---|---|
| D3.1 差评高频问题回应度 | 8/20 | 自家差评 Top 5 痛点是否在 Listing 中有回应 |
| D3.2 好评高频卖点突出度 | 8/20 | 自家好评 Top 5 卖点是否在 Listing 中突出 |
| D3.3 类目共性痛点提及度 | 4/20 | 同类目竞品差评 Top 痛点是否在自家 Listing 中预防性提及 |

**评分逻辑：**
```python
D3.1 = covered_negative_pain_points / total_top5_pain_points * 100 * (8/20)
D3.2 = highlighted_positive_points / total_top5_highlights * 100 * (8/20)
D3.3 = mentioned_category_pain_points / total_category_pain_points * 100 * (4/20)
D3 = sum
```

#### 5.2.4 维度 D4：视觉与 A+（权重 15%）

> ⚠️ **本维度的子项不仅评估，还可触发 AI 图像生成**。改进点会直接给"生成新主图 / 生成 A+ 图"的可执行 action。

| 子项 | 权重 | 评估方法 | 是否支持生成 |
|---|---|---|---|
| D4.1 主图质量 | 4/15 | 多模态模型评估：纯白背景 / 主体清晰 / 卖点角标 / 产品占比 ≥ 85% | ✅ 生成主图 |
| D4.2 信息图丰富度 | 4/15 | Gallery 图数量 ≥ 6 ✓，含场景/尺寸/使用方式图 | ✅ 生成 Gallery 图 |
| D4.3 A+ 模块设计 | 4/15 | A+ 模块数（≥ 5 满分）+ 信息密度评估 + 模块图质量 | ✅ 生成 A+ 模块图 |
| D4.4 视频存在性 | 3/15 | 有视频满分，无视频 0 分 | ❌ V2 再做 |

**评分逻辑：**
```python
D4.1 = vision_model_score(main_image, prompt="评估亚马逊主图质量") * (4/15)
D4.2 = (min(gallery_count, 7)/7 * 60 + scene_image_present * 20 + size_image_present * 20) * (4/15)
D4.3 = (min(aplus_modules_count, 7)/7 * 30 + density_score * 30 + image_quality * 40) * (4/15)
D4.4 = (has_video ? 100 : 0) * (3/15)
D4 = sum
```

**主图合规检查（亚马逊硬性要求）：**
- 纯白背景（RGB 255,255,255）
- 产品占据画面 ≥ 85%
- 不含文字、水印、Logo（除产品本身）
- 不含人物（服装类除外）
- 实物拍摄风格（不允许插画 / 渲染过于失真）
- 主图分辨率 ≥ 1600×1600 px

任何违规子项 → D4.1 直接扣 50%。

#### 5.2.5 维度 D5：转化诱因（权重 20%）

| 子项 | 权重 | 评估方法 |
|---|---|---|
| D5.1 社会证明 | 5/20 | Review 数 / 评分（仅观察，不修改 Listing 改善） |
| D5.2 紧迫感 | 3/20 | 是否有"限量/限时/库存有限"等表达 |
| D5.3 风险消除 | 5/20 | 是否提到保修/退换/质量保证 |
| D5.4 对比/优势表 | 4/20 | A+ 是否含对比表 / 五点是否突出对比优势 |
| D5.5 CTA 明确性 | 3/20 | 整体语调是否引导购买（如"now"、"today"） |

**评分逻辑：**
```python
D5.1 = (review_count_score + rating_score) / 2 * (5/20)
  # review_count_score: log scale 至 1000 满分
  # rating_score: 4.0=60, 4.5=85, 4.7+=100
D5.2 = (urgency_phrases_count > 0 ? 100 : 0) * (3/20)
D5.3 = (warranty_phrases_count > 0) * 50 + (return_policy_phrases > 0) * 50 = 100 * (5/20)
D5.4 = (has_comparison_table * 60 + comparison_in_bullets * 40) * (4/20)
D5.5 = LLM_score(cta_strength) * (3/20)
D5 = sum
```

### 5.3 显示形态

```
┌───────────────────────────────────────────────────────┐
│ 📊 Listing 评分 (总分 67/100)         📈 上轮 +5      │
├───────────────────────────────────────────────────────┤
│ D1 关键词覆盖度    ████████░░ 78  (-)  [详情▼]       │
│   D1.1 主词覆盖     85% (10/12)                       │
│   D1.2 长尾词覆盖   72% (5.8/8)                       │
│   D1.3 否定词避免   100% (5/5)                        │
│                                                        │
│ D2 卖点清晰度      █████░░░░░ 52  ⚠️  [详情▼]        │
│   D2.1 USP 强度     2.5/5  AI: 五点首句"high quality"过弱│
│   D2.2 实证强度     3/5    包含 2 个数据，缺认证      │
│   D2.3 决策因素     3/5    缺 When（使用时机）        │
│   D2.4 vs 竞品差异化 1.5/5  与竞品相似度 78%         │
│                                                        │
│ ...                                                    │
└───────────────────────────────────────────────────────┘
```

### 5.3a 评分系统的校准计划（关键质量保障）

> ⚠️ 5 维评分本身的"是否真预测 CVR lift"必须事先验证，否则整个迭代驱动失效。

#### 校准方案

**Phase A：人工标注基线（开发期）**
- 选 100 个真实 SKU（覆盖 4 类目）
- 5 位资深运营人工评分（盲测）
- AI 评分 vs 人工平均分相关性 ≥ 0.80 才算合格

**Phase B：CVR lift 真实验证（Beta 期）**
- 取 30+ 个 Beta 卖家的优化案例
- 跟踪优化前后 14 天 CVR
- 评分提升 ↔ CVR 提升的相关性 ≥ 0.50（弱-中相关即合格）

**Phase C：持续监控（生产期）**
- 每月统计：评分提升 vs 实际 CVR 提升的散点图
- 维度级权重调优（如 D2 权重应该高 / 低）
- A/B 测试新评分版本（v2.0 → v2.1）

#### 失败兜底

如果 Phase A 相关性 < 0.80：
- 不上线 → 重做 prompt + 维度权重
- 暂停"评分驱动建议"功能，改为"AI 直接给改进点"

### 5.4 评分版本管理

- 每次 LLM 升级或权重调整 → 评分版本号 +1
- 历史评分保留版本号，避免新旧不可比
- UI 上显示"评分基于 v2.3 算法"

---

## 6. 多轮迭代流程（状态机）

### 6.1 完整状态图

```
[ 进入 SKU ] → [ Idle ]
                 │
                 ▼
       ┌──── [ Diagnosing ] ────┐
       │           │             │
       │           ▼             │
       │     [ Diagnosed ]       │ (失败)
       │           │             │
       │     选改进点              ▼
       │           │       [ Diagnose Failed ]
       │           ▼
       │     [ Proposing ]   ── (LLM 失败) ──→ [ Propose Failed ]
       │           │
       │     AI 给方案
       │           ▼
       │     [ Reviewing ]
       │      ├── 采纳
       │      ├── 微调 ──→ [ Editing ] ──→ [ Reviewing ]
       │      ├── 拒绝并重写 ──→ [ Proposing ]
       │      └── 跳过此项
       │           │
       │     选定后保存到草稿
       │           ▼
       │     [ Round Complete ]
       │           │
       │     重评分
       │           ▼
       │     [ Iteration In Progress ]
       │           │
       │      ├── 继续下一轮 ── [ Diagnosed ]（带新分数）
       │      └── 完成迭代
       │           │
       │           ▼
       │     [ Pending Apply ]
       │           │
       │     用户确认应用
       │           ▼
       │     [ Applying ]
       │           │
       │     SP-API 推送
       │      ├── 成功 ──→ [ Applied ]
       │      └── 失败 ──→ [ Apply Failed ]（保留草稿）
       │
       └────────────────────────────┘
```

### 6.2 状态详情

| 状态 | 说明 | 可用操作 | 持久化 |
|---|---|---|---|
| Idle | 进入 SKU 但未开始诊断 | 「开始诊断」 | — |
| Diagnosing | 后台拉取数据 + LLM 评分中 | 「取消」 | task in queue |
| Diagnosed | 评分完成，展示改进点 | 「选改进点」「重新诊断」「关闭」 | listing_diagnoses 表 |
| Proposing | LLM 生成 3 个改写方案 | 「取消」 | task in queue |
| Reviewing | 展示 3 方案给运营选 | 「采纳/微调/重写/跳过」 | iteration_rounds.proposals |
| Editing | 运营在编辑 AI 方案 | 「保存」「取消」 | iteration_rounds.user_choice (draft) |
| Round Complete | 单轮完成，重评分中 | （等待） | — |
| Iteration In Progress | 多轮迭代中 | 「继续」「完成」「放弃」 | listing_iterations |
| Pending Apply | 已选择完成，预览待发布 | 「应用」「再改」「放弃」 | listing_iterations.status='ready' |
| Applying | 推送到亚马逊中 | （等待） | task in queue |
| Applied | 已发布到亚马逊 | 「启动 A/B」「查看版本」 | listing_versions.applied=true |
| Apply Failed | SP-API 推送失败 | 「重试」「查看错误」 | error log |

### 6.3 单轮迭代步骤（详细）

#### 步骤 1：选择改进点

UI 显示按 ROI 排序的改进点列表（**含文本类与图像类**）：
```
推荐改进项（按预期分数提升排序）：

📝 文本类
☐ #1 D2.1 USP 强度低（+8 分）
   位置：标题 / 五点 #1
   AI 检测：标题"High Quality Phone Case for iPhone"过于通用
   建议方向：突出独特卖点（如材质/工艺/认证）
   
☐ #2 D3.1 差评未回应（+6 分）
   位置：五点 #3
   AI 检测：差评 Top 1"按键易松"在 Listing 中未提及
   建议方向：增加"经强化按键设计 / X 万次按压测试"

🖼️ 图像类
☐ #3 D4.1 主图卖点角标缺失（+5 分）
   位置：主图
   AI 检测：当前主图无任何卖点角标，竞品 4/5 都有
   建议方向：生成 3 版主图（含角标方案：质保/认证/规格）
   [⚡ 这一项会触发 AI 图像生成]
   
☐ #4 D4.2 缺尺寸对比图（+4 分）
   位置：Gallery 图 (新增第 7 张)
   AI 检测：竞品都有尺寸对比图，你没有
   建议方向：生成尺寸对比图（产品 vs 手机/手 / 标尺）
   [⚡ AI 图像生成]
   
☐ #5 D4.3 A+ 缺对比模块（+4 分）
   位置：A+ 第 4 模块
   AI 检测：A+ 中无对比表，竞品 4/5 有
   建议方向：生成 vs 竞品对比表图 + 文案
   [⚡ AI 图像生成 + 文案改写]
```

**文本类**改进 → 步骤 2A（文案方案生成）
**图像类**改进 → 步骤 2B（图像生成流程）

#### 步骤 2A：AI 提供 3 个文案方案（文本类改进）

```
✏️ 改写：D2.1 USP 强度
当前文本（五点 #1）：
> "High Quality Phone Case for iPhone 14"

AI 方案 A（侧重材质工艺）：
> "Military-Grade Drop Protection Phone Case for iPhone 14 — 
>  Made with TPU+PC Dual Layer, MIL-STD-810G Certified, 
>  Proven to Survive 12ft Drops"

AI 方案 B（侧重场景使用）：
> "Designed for Active Lifestyle iPhone 14 Case — 
>  Anti-Slip Grip, Ridged Edges, Perfect for Hiking, 
>  Sports & Daily Adventures"

AI 方案 C（侧重数据实证）：
> "iPhone 14 Case with 360° Protection — 
>  Tested 50,000 Times Drop Resistance, 
>  4-Corner Reinforced Bumpers, 1-Year Warranty Included"

选项：
[ 采纳 A ] [ 采纳 B ] [ 采纳 C ]
[ 在 A 上微调 ] [ 在 B 上微调 ] [ 在 C 上微调 ]
[ 让 AI 重写（请说明你想要什么） ]
[ 跳过此改进项 ]
```

#### 步骤 2B：AI 提供 3 个图像候选（图像类改进）

```
🖼️ 生成：D4.1 主图（添加卖点角标）

参考输入：
  • 当前主图（作为产品形态参考）
  • 类目主图风格规范（白底、产品 ≥ 85%）
  • 已选定文案中的卖点（"3-Year Warranty"、"MIL-STD-810G"）
  • 用户偏好（语调、品牌色 #C8102E）

AI 候选 A（左上角标方案）：
  [图片预览]
  ✓ 白底合规
  ✓ 产品占比 87%
  ✓ 角标"3 YEAR WARRANTY"在左上
  ✓ 主图分辨率 2000×2000
  风格：简洁、专业

AI 候选 B（右下徽章方案）：
  [图片预览]
  ✓ 白底合规
  ✓ 产品占比 86%
  ✓ 圆形徽章"MIL-STD-810G CERTIFIED"在右下
  风格：科技感、强调实证

AI 候选 C（双角标方案）：
  [图片预览]
  ✓ 白底合规
  ✓ 产品占比 85%
  ✓ 双角标：质保 + 认证（左上 + 右下）
  风格：信息密度高、卖点抢眼

合规检查：
  ✓ 全部 3 候选通过亚马逊主图规则
  ⚠️ 候选 C 的右下角标稍显拥挤，运营可微调

选项：
[ 采纳 A ] [ 采纳 B ] [ 采纳 C ]
[ 在 A/B/C 内置编辑器微调（裁剪/角标位置/文字大小） ]
[ 重新生成（请说明你想要什么）]
   例："换一个更深的红色品牌色"
   例："角标改成横幅样式"
   例："参考竞品 B0XXX 的风格"
[ 上传我自己的图替代 ]
[ 跳过此改进项 ]
```

**图像生成的关键约束（亚马逊主图）：**
- 自动加白底 RGB(255,255,255)
- 自动检查产品占比 ≥ 85%
- 自动剔除水印 / Logo / 文字（除产品本身的角标）
- 输出分辨率 ≥ 1600×1600 px
- 格式 JPG / PNG（按亚马逊要求）

**A+ 图与 Gallery 图相对宽松：**
- 可含文字、图标
- 可含场景背景（生活场景图）
- 可含人物（家居、母婴等品类）
- 仍需符合亚马逊 A+ 规则（无医疗声明、无第三方品牌等）

#### 步骤 3：用户决策

四种路径：

**路径 a：采纳**
- 选定方案直接进入草稿
- 进入步骤 4

**路径 b：微调**
- 弹出富文本编辑器，预填选定方案
- 用户编辑后保存为草稿
- 进入步骤 4

**路径 c：让 AI 重写**
- 用户填写"我想要什么"（自由文本）
- 例："更突出环保材质 / 减少营销味"
- AI 生成新的 3 个方案
- 回到步骤 2

**路径 d：跳过**
- 不改这个项
- 直接进入步骤 5

#### 步骤 4：保存到草稿

- 当前 SKU 的 listing_iterations 表追加 1 条 round
- 改动暂存到 listing_versions（is_current=false, status='draft'）
- 不立即推送亚马逊

#### 步骤 5：重新评分

- 后台异步：拿草稿版本重新跑评分
- 完成后通知用户："本轮提升 +X 分"
- 显示对比卡片

#### 步骤 6：循环或结束

```
本轮完成 ✓ +6 分
当前总分：73/100 (上轮 67)

下一步：
[ 继续下一轮（剩 2 个改进项） ]
[ 完成迭代，进入应用预览 ]
[ 放弃所有改动 ]
```

### 6.4 应用预览页

```
┌────── 应用前预览 ──────────────────────┐
│                                          │
│ SKU: B0XXXXXXXX                          │
│ 改动汇总：3 个改进项，共 5 处文案修改    │
│ 评分变化：67 → 79 (+12)                  │
│                                          │
│ [展开变更明细]                            │
│ ▼ 五点 #1                                │
│   - 旧: "High Quality Phone Case..."     │
│   + 新: "Military-Grade Drop..."         │
│                                          │
│ ▼ 五点 #3                                │
│   - 旧: "Premium Material"               │
│   + 新: "TPU+PC Dual Layer with..."      │
│                                          │
│ ▼ A+ 模块 #4 (新增)                      │
│   + 对比表 (vs 竞品)                     │
│                                          │
│ 主图：未改动                              │
│                                          │
│ ⚠️ 注意：                                 │
│ - 应用后将触发亚马逊审核（约 1-24h）     │
│ - 文本审核通常实时通过                   │
│                                          │
│ [ 立即应用 ] [ 返回继续编辑 ] [ 放弃 ]   │
│                                          │
│ 应用后下一步建议：                        │
│ ☐ 启动 A/B 测试 (仅主图未改时不可用)    │
└──────────────────────────────────────────┘
```

---

## 7. AI Prompt 设计

### 7.1 Prompt 列表（M1 全部 11 个）

| ID | 用途 | 输入 | 输出 |
|---|---|---|---|
| P-M1-DIAGNOSE | 诊断评分 | 完整 context | 5 维分数 + 改进点 |
| P-M1-PROPOSE | 文案改写方案 | 改进项 + context | 3 文案方案 |
| P-M1-REWRITE | 文案重写（用户自由反馈） | 用户反馈 + context | 3 新方案 |
| P-M1-EXPLAIN | 推理链解释 | 一条改动 | 详细推理 |
| P-M1-CATEGORY-PAIN | 类目共性痛点提取 | 类目 + 竞品差评 | 痛点列表 |
| **P-M1-IMG-MAIN-GEN** | **主图生成** | **当前主图 + 卖点 + 类目规则** | **3 候选图（含合规元数据）** |
| **P-M1-IMG-APLUS-GEN** | **A+ 图模块生成** | **模块类型 + 文案 + 风格** | **3 候选图** |
| **P-M1-IMG-GALLERY-GEN** | **Gallery 图生成（场景/尺寸/使用）** | **图类型 + 产品参考 + 场景描述** | **3 候选图** |
| **P-M1-IMG-CRITIQUE** | **图像质量评估** | **单图 + 类目规则** | **打分 + 缺陷清单** |
| **P-M1-IMG-COMPLIANCE** | **亚马逊主图合规检查** | **图 + 类目** | **pass/fail + 违规项** |
| **P-M1-IMG-REWRITE** | **图像重生成（用户反馈）** | **拒绝原因 + 上一轮 3 候选** | **3 新候选** |

### 7.2 P-M1-DIAGNOSE（诊断 Prompt）

```
[ROLE]
You are a Senior Amazon Listing Optimization Expert with 10+ years of 
experience in {category}. Your job is to evaluate Amazon Listings using 
a strict 5-dimension scoring system.

[SCORING SYSTEM]
D1 Keyword Coverage (25%):
  D1.1 Main Keywords (12): Top 10 high-impression search terms covered in title+bullets
  D1.2 Long-tail Keywords (8): Top 30 long-tail terms covered in bullets+description+A+
  D1.3 Banned Words (5): Brand-defined banned words must not appear

D2 USP Clarity (20%):
  D2.1 USP Strength (5): First line of bullets emphasizes unique selling proposition
  D2.2 Evidence (5): Data/certifications/specs included
  D2.3 Decision Factors (5): 5W2H framework coverage
  D2.4 Differentiation (5): Distinct from top competitors

D3 Pain Point Alignment (20%):
  D3.1 Negative Reviews Addressed (8): Top 5 own-brand negative pain points addressed
  D3.2 Positive Highlights Emphasized (8): Top 5 positive highlights emphasized
  D3.3 Category Pain Points Mentioned (4): Common category pain points preempted

D4 Visual & A+ (15%):
  D4.1 Main Image (4): Quality, focus, white background
  D4.2 Gallery Richness (4): ≥6 images, scene/size/usage included
  D4.3 A+ Modules (4): ≥5 modules, info density
  D4.4 Video (3): Presence

D5 Conversion Cues (20%):
  D5.1 Social Proof (5): Review count + rating
  D5.2 Urgency (3): Limited/time-bound phrases
  D5.3 Risk Removal (5): Warranty/return mention
  D5.4 Comparison Table (4): A+ comparison table or bullets-level comparison
  D5.5 CTA Strength (3): Action-oriented language

[CONTEXT]
Current Listing:
  Title: {title}
  Bullets: {bullets_array}
  Description: {description}
  A+ Content: {a_plus_modules_summary}
  Main Image URL: {main_image_url}
  Gallery: {gallery_urls}
  Has Video: {has_video}
  Review Count: {review_count}
  Average Rating: {average_rating}

Top 5 Competitors (titles + bullets only):
{competitor_summary}

Search Term Report (last 30 days, top 30 by impressions):
{search_terms_array}

Top Reviews:
  Own brand negative (top 50): {own_negative_reviews}
  Own brand positive (top 50): {own_positive_reviews}
  Competitor negative (top 50): {competitor_negative_reviews}

Brand Banned Words: {banned_words_list}

[INSTRUCTION]
1. Score each sub-dimension on a 0-100 scale, with explicit reasoning.
2. Calculate weighted dimension scores and total.
3. Identify TOP 5 improvement opportunities, ranked by expected_score_lift.
4. For each improvement, specify which sub-dimension, location (title/bullet#/A+module),
   and a concrete actionable description (not the rewrite itself).

[OUTPUT FORMAT]
Strict JSON matching this schema:
{
  "scores": {
    "D1": {"value": <float 0-100>, "subscores": {"D1.1": ..., "D1.2": ..., "D1.3": ...}, "reasoning": "..."},
    "D2": {...},
    "D3": {...},
    "D4": {...},
    "D5": {...}
  },
  "total_score": <float 0-100>,
  "improvements": [
    {
      "rank": 1,
      "sub_dimension": "D2.1",
      "location": "bullet_1",
      "issue": "First bullet starts with generic 'High Quality' phrase",
      "direction": "Highlight specific certification or material technology",
      "expected_score_lift": 8,
      "evidence": ["Top competitor uses MIL-STD-810G certification"]
    },
    ...
  ],
  "context_metadata": {
    "model_version": "claude-opus-4-7",
    "scoring_version": "2.3"
  }
}

DO NOT include rewrites in this output. Rewrites come in a separate step.
DO NOT hallucinate facts about the product. Only use provided context.
```

### 7.3 P-M1-PROPOSE（方案生成 Prompt）

```
[ROLE]
You are an expert Amazon Listing Copywriter for the {category} category.
Your job is to generate 3 distinct rewrite proposals for a specific 
improvement target.

[CONTEXT]
{Same context as P-M1-DIAGNOSE, plus:}

Selected Improvement:
  Sub-dimension: {sub_dimension}  (e.g., D2.1 USP Strength)
  Location: {location}  (e.g., bullet_1)
  Issue: {issue}
  Direction: {direction}
  Original Text: {original_text}

Brand Voice (if specified by user): {brand_voice}
User Preferences (if any): {user_preferences}

[INSTRUCTION]
Generate exactly 3 rewrite proposals for the specified location, each with:
- A different stylistic angle (data-driven / scenario-driven / aspirational / comparison-driven)
- Compliance with Amazon listing guidelines (no all-caps, no superlative claims without evidence)
- Length appropriate to location (bullet ≤ 250 chars, title ≤ 200 chars Amazon hard limit)
- Inclusion of relevant keywords from search term report (specify which)
- Avoidance of banned words

[OUTPUT FORMAT]
Strict JSON:
{
  "proposals": [
    {
      "id": "A",
      "angle": "evidence-driven",
      "text": "...",
      "rationale": "Emphasizes MIL-STD certification + specific drop test data",
      "keywords_included": ["military-grade", "drop protection", "MIL-STD-810G"],
      "compliance_check": {"passes_amazon_guidelines": true, "warnings": []}
    },
    {"id": "B", "angle": "scenario-driven", ...},
    {"id": "C", "angle": "comparison-driven", ...}
  ]
}
```

### 7.4 P-M1-REWRITE（用户反馈重写）

```
[ROLE]
{Same as P-M1-PROPOSE}

[CONTEXT]
{Same as P-M1-PROPOSE, plus:}

Previous Proposals (rejected by user):
  A: {previous_A_text}
  B: {previous_B_text}
  C: {previous_C_text}

User Feedback:
  "{user_freeform_feedback}"

[INSTRUCTION]
Generate 3 NEW rewrite proposals incorporating the user's feedback. 
The new proposals MUST address user feedback explicitly. 
DO NOT repeat themes from rejected proposals.

[OUTPUT FORMAT]
{Same as P-M1-PROPOSE, plus:}
Each proposal includes:
  "addresses_feedback": "Explanation of how this proposal addresses user's feedback"
```

### 7.5 P-M1-EXPLAIN（解释推理链）

```
[ROLE]
You are explaining your decisions to a user who wants to learn from AI 
suggestions. Be concise but specific.

[CONTEXT]
Original Text: {original}
New Text: {new}
Sub-dimension: {sub_dim}
Issue Identified: {issue}

[INSTRUCTION]
In ≤ 100 words, explain:
1. What was wrong with the original
2. Why this rewrite is better
3. What evidence supports this (data / competitor / review insight)

[OUTPUT FORMAT]
Plain text, ≤ 100 words.
```

### 7.6 P-M1-CATEGORY-PAIN（类目共性痛点提取）

```
[ROLE]
You analyze customer reviews across a category to identify common pain 
points that all sellers should preemptively address.

[CONTEXT]
Category: {category}
Sample of negative reviews from top 20 competitors (last 90 days, 1-3 stars):
{aggregated_negative_reviews}

[INSTRUCTION]
Identify the TOP 10 category-level pain points (not specific to one product). 
For each, provide frequency estimate, severity, and how a Listing could 
preemptively address it.

[OUTPUT FORMAT]
JSON array of 10 items, each with: pain_point, frequency_pct, severity, 
preemptive_listing_strategy.
```

### 7.7 P-M1-IMG-MAIN-GEN（主图生成 Prompt）

```
[ROLE]
You are a senior Amazon product photography art director with 10+ years 
of experience. You generate Amazon-compliant main image variants by 
creating prompts for an image generation model (or directly via 
multi-modal generation).

[CONTEXT]
Product: {product_name}, Category: {category}
Current Main Image URL: {main_image_url}  (used as visual reference)

Selected Improvement: {improvement}
  e.g., "Add 3-Year Warranty badge top-left"
  
Brand:
  - Primary color: {hex}
  - Secondary color: {hex}
  - Voice/style: {style}
  
Product Specs (to keep consistent):
  - Dimensions / shape / color / key features
  
Selling Points to Highlight (chosen badges):
  {badges_array}
  e.g., ["3-Year Warranty", "MIL-STD-810G", "12ft Drop Tested"]

Amazon Main Image Rules (HARD CONSTRAINTS):
  - Pure white background RGB(255,255,255)
  - Product fills ≥ 85% of frame
  - No watermarks, logos (other than product itself), or borders
  - No people (unless category is apparel)
  - Photographic style (no over-stylized illustration)
  - Min resolution 1600x1600 px
  - JPG or PNG format

Category-specific Style Reference:
  {category_style_guide}

[INSTRUCTION]
Generate 3 distinct main image candidates. Each should:
1. Use the current product as visual reference (preserve shape/color/specs)
2. Apply a different placement strategy for the badges (top-left / right-bottom / dual)
3. Vary in stylistic emphasis (clean / techy / info-dense)
4. PASS all Amazon main image hard constraints

For each candidate, output:
- Generation prompt (for image model, e.g., DALL-E / Imagen / Stable Diffusion)
- Compliance check details (resolution, white BG verification, product ratio)
- Style description in plain English
- Reasoning for placement choice

[OUTPUT FORMAT]
Strict JSON:
{
  "candidates": [
    {
      "id": "A",
      "style": "clean-minimal",
      "image_prompt": "Studio photograph of {product} on pure white seamless backdrop, ...",
      "negative_prompt": "people, watermark, logo, text overlays, illustration, ...",
      "post_processing": [
        "ensure white BG RGB(255,255,255)",
        "add badge 'X' top-left (size 8% of frame)"
      ],
      "compliance_check": {
        "white_bg": true, "product_ratio": 0.87, "no_text": true,
        "resolution_min": "2000x2000"
      },
      "rationale": "Top-left placement preserves product hero zone (right-center, eye-tracking)"
    },
    {"id": "B", ...},
    {"id": "C", ...}
  ]
}
```

### 7.8 P-M1-IMG-APLUS-GEN（A+ 模块图生成）

```
[ROLE]
A+ content designer for Amazon product detail pages.

[CONTEXT]
Product: ...
A+ Module Type: {module_type}
  // standard_image, comparison_table, infographic, lifestyle_scene
  // feature_callout, before_after, etc.

Module Text (companion copy): {text}
Brand Color: {hex}
Style: {brand_voice}
Target Aspect Ratio: {1464x600 | 1464x750 | 970x300 ...}

Reference Images:
  - Product photo: {url}
  - Competitor reference (optional): {url}

[INSTRUCTION]
Generate 3 candidates for this A+ module. Unlike main image, A+ allows:
- Text and infographics
- Lifestyle scenes
- Brand colors and graphics
- Comparison layouts

Constraints (Amazon A+ Rules):
- No medical claims (unless category allows)
- No third-party brand mentions
- No customer reviews / ratings citations
- No unverified superlatives ("#1 best")

[OUTPUT FORMAT]
{...same structure as P-M1-IMG-MAIN-GEN, scoped to A+...}
```

### 7.9 P-M1-IMG-GALLERY-GEN（Gallery 图生成）

```
[ROLE]
Product photographer specializing in Amazon listing gallery images.

[CONTEXT]
Image Type: {scene | size_comparison | usage | dimension_diagram | features_callout}
Product: {product_info}
Reference Image: {main_image_url}

For Scene Image:
  - Scene description: {scene_desc}
  - User persona in scene: {persona}
  
For Size Comparison:
  - Comparator object: {object}  // e.g., "iPhone", "ruler", "hand"
  - Show actual dimensions: {dimensions}

For Usage Image:
  - Action: {action_desc}
  - Step number (if multi-step): {n}

For Dimension Diagram:
  - Dimensions to show: {dim_array}
  - Annotation style: {style}

[INSTRUCTION]
Generate 3 candidates appropriate for the image type. Gallery images 
allow more flexibility than main image but should still feel cohesive 
with the brand.

[OUTPUT FORMAT]
{...same structure...}
```

### 7.10 P-M1-IMG-CRITIQUE（图像评估）

```
[ROLE]
You are a multi-modal model evaluating a single product image against 
Amazon listing best practices.

[CONTEXT]
Image URL: {url}
Image Type: {main | a_plus | gallery_scene | gallery_size | ...}
Category: {category}
Amazon Rules: {rules_summary}

[INSTRUCTION]
Score the image 0-100 with sub-scores:
- Composition (rule of thirds, focal point clarity)
- Product visibility (occlusion, focus, lighting)
- Compliance (per Amazon rules for this image type)
- Conversion appeal (does it sell? scroll-stopping?)
- Brand consistency (with provided style guide)

Identify specific defects (e.g., "shadow under product is too dark, suggest +20% fill light").

[OUTPUT FORMAT]
{
  "total_score": 78,
  "sub_scores": {...},
  "compliance": {"passes": true, "warnings": [...]},
  "defects": [
    {"defect": "...", "severity": "minor|major", "suggested_fix": "..."}
  ],
  "improvement_suggestions": [...]
}
```

### 7.11 P-M1-IMG-COMPLIANCE（合规检查）

```
[ROLE]
Strict Amazon image compliance auditor.

[CONTEXT]
Image: {url}
Image Type: {main | a_plus | gallery}
Category: {category}

[INSTRUCTION]
Check against the official Amazon image rules for this type.
For main image, verify:
  - White background (RGB threshold check)
  - Product ratio (≥ 85%)
  - No text/watermark/logo (other than product itself)
  - No people (unless apparel)
  - Photographic (not illustrated)
  - Resolution ≥ 1600x1600
  - File format

For A+:
  - No medical claims
  - No competitor brand mentions
  - No customer reviews quotation
  - No unverified superlatives

[OUTPUT FORMAT]
{
  "passes": true | false,
  "violations": [
    {"rule": "white_bg", "details": "..."}
  ],
  "warnings": [...],
  "auto_fix_available": true | false,
  "auto_fix_actions": [...]
}
```

### 7.12 P-M1-IMG-REWRITE（图像重生成）

```
[ROLE]
{Same as P-M1-IMG-MAIN-GEN / APLUS-GEN / GALLERY-GEN}

[CONTEXT]
{Same context as original generation, plus:}

Previous Candidates (rejected by user):
  A: {prev_A_thumb_+_metadata}
  B: ...
  C: ...

User Feedback:
  "{user_freeform_feedback}"
  // e.g., "Make the badge larger and use deeper red"
  // e.g., "Reference competitor B0XXX's style"
  // e.g., "Less cluttered, just one badge"

[INSTRUCTION]
Generate 3 NEW candidates incorporating feedback. Address the feedback 
explicitly. Avoid repeating the rejected approaches.

[OUTPUT FORMAT]
{...candidates with "addresses_feedback" field on each...}
```

### 7.13 Prompt 版本管理

- 每个 Prompt 有 v1 / v2 / ...
- 储存在 `packages/prompts/m1/` 目录，git 版控
- A/B 测试 Prompt 版本：50% 用户 v2，50% v1，比较输出质量评分
- 配置在 `prompts_config.yaml`
- **图像生成 Prompt 单独 A/B**（图像质量评估 → 反馈给图像 Prompt 迭代）

---

## 8. 类目特化

### 8.1 首批支持类目

| 类目 | 代码 | 特化内容 |
|---|---|---|
| 电子配件 | electronics_accessories | 强调认证（FCC/CE/RoHS）、兼容性表 |
| 家居用品 | home_kitchen | 强调材质安全、尺寸图、使用场景 |
| 母婴 | baby_products | 强调安全认证（CPSC）、年龄段、温和材料 |
| 服装 | apparel | 强调尺码表、面料、洗护、模特图 |

### 8.2 类目差异化点

#### 评分权重微调

| 维度 | 默认 | 电子 | 家居 | 母婴 | 服装 |
|---|---|---|---|---|---|
| D1 关键词 | 25% | 25% | 25% | 25% | 30% |
| D2 USP | 20% | 25% | 20% | 15% | 15% |
| D3 痛点 | 20% | 20% | 20% | 25% | 20% |
| D4 视觉 | 15% | 15% | 20% | 15% | 25% |
| D5 转化 | 20% | 15% | 15% | 20% | 10% |

#### 必备元素清单

每个类目有"必检清单"，未达成扣 5-15 分：

**电子配件：**
- 兼容性列表（具体型号）
- 主要认证（至少 1 项：FCC / CE / RoHS / Bluetooth SIG）
- 输出参数（功率 / 输入电压 / 数据传输速率）
- A+ 对比表

**家居用品：**
- 尺寸图（实物 / 包装）
- 材质说明
- 使用场景图（≥ 2 张）
- 清洁/保养指南

**母婴：**
- 年龄段（如 0-6m / 6-12m）
- 安全认证
- 材质（无毒 / 食品级 / BPA Free）
- 警告事项

**服装：**
- 尺码表（多区域）
- 面料成分
- 洗涤指南
- 模特上身图（多角度）

### 8.3 类目模板

每个类目提供"最佳实践模板"：
- 标题结构模板：`[Brand] [Core Keyword] [Differentiator] - [Material] [Compatibility/Spec] [Bonus]`
- 五点骨架（5 个空位 + 提示词）
- A+ 模块推荐顺序

用户新建 SKU 优化时可选择"基于类目模板"。

---

## 9. 页面与交互详细设计

### 9.1 页面 P1：SKU 列表（M1 主入口）

**路径：** `/listings`

**布局：**

```
┌──────────────────────────────────────────────────────────┐
│ 顶部条                                                    │
│  [面包屑] 优化 / Listing 优化室                           │
│  [筛选条] 店铺▾ 类目▾ 评分▾ 状态▾ [搜索框]              │
│  [操作] [批量诊断] [导出]                                 │
├──────────────────────────────────────────────────────────┤
│ 概览卡片（4 张）                                          │
│  [总 SKU 数] [低分 SKU 数<60] [优化中] [本月已优化]       │
├──────────────────────────────────────────────────────────┤
│ 表格                                                      │
│ ☐ 缩略图 | ASIN | 标题 | 类目 | 评分 | 潜力 | 状态 | 操作│
│ ☐ [📷]   B0... ABC.. 电子  62  +18  闲置 [诊断][进入]   │
│ ☐ [📷]   B0... XYZ.. 家居  78  +8   优化中 [继续]       │
│ ...                                                       │
│                                                           │
│ [分页] [每页 20/50/100]                                   │
└──────────────────────────────────────────────────────────┘
```

**状态枚举：**
- 🔵 闲置（未诊断）
- 🟢 已诊断（有评分）
- 🟡 优化中
- 🟠 待应用
- ✅ 已应用
- 🧪 A/B 测试中
- 🔒 已锁定（用户标记不优化）

**交互：**
- 行点击 → 跳转 `/listings/[productId]`
- 多选 → 批量诊断
- 评分列点击 → 排序
- 潜力列：评分版本 + 改进项数 hover 显示

### 9.2 页面 P2：单 SKU 优化室（核心页）

**路径：** `/listings/[productId]`

**布局（左右分栏）：**

```
┌──────────────────────────────────────────────────────────────┐
│ 顶栏                                                          │
│  [返回列表] | SKU 缩略图 + 标题 + ASIN + 类目 + 上架时长     │
│  评分 67/100  📈 趋势(7d) | [重新诊断] [历史] [启动 A/B]   │
├──────────────────────────────────────────────────────────────┤
│ 左侧 (40%)                  │ 右侧 (60%)                      │
│ ─────────────────           │ ─────────────────              │
│ Tab: [评分] [改进项]         │ Tab: [当前] [迭代] [预览]      │
│                              │                                 │
│ ── 评分 Tab ──              │ ── 当前 Tab ──                 │
│ 5 维度 + 子项                │ 标题 / 五点 / 描述 / A+ /     │
│ 雷达图                       │ 主图 / Gallery / 视频          │
│                              │                                 │
│ ── 改进项 Tab ──            │ ── 迭代 Tab ──                 │
│ 排序的改进项列表              │ 多轮迭代界面（见 6.3）         │
│ 选择 → 进入迭代               │                                 │
│                              │ ── 预览 Tab ──                 │
│                              │ 应用前预览（见 6.4）            │
└──────────────────────────────────────────────────────────────┘
```

**关键交互：**

1. **评分 Tab → 雷达图**
   - 5 维度雷达
   - 与类目均值对比（叠加灰色虚线）
   - 与本店"我的最高分 SKU"对比（可选）

2. **改进项 Tab**
   - 列表卡片，每张含：维度标签、问题描述、预期 +X 分、推荐方向
   - **图标区分**：📝 文本类 / 🖼️ 图像类 / 🎨 混合类（文本+图像）
   - 点击 "选择此项" → 右侧切换到 "迭代 Tab"

3. **迭代 Tab → 文本类改进**
   - 顶部进度条（第 N 轮 / 已完成 X 项）
   - 当前轮：3 个 AI 文案方案卡片（A/B/C）
   - 操作按钮区：采纳 / 微调 / 重写 / 跳过

4. **迭代 Tab → 图像类改进**（新）
   - 顶部进度条
   - 当前轮：3 个 AI 图像候选卡片（A/B/C 缩略图，悬停放大）
   - 每张图下方：风格描述 / 合规标记 / 推理
   - 操作按钮区：
     - 采纳 A/B/C
     - 内置编辑器微调（裁剪 / 角标位置 / 文字大小 / 滤镜）
     - 重新生成（输入反馈）
     - 上传我自己的图（替代 AI 生成）
     - 跳过此改进项
   - 编辑器面板：
     - 简单的图像编辑：裁剪、旋转、调亮度对比、文字叠加、角标
     - 不做复杂修图（PS 级），定位"快速微调"

5. **预览 Tab**
   - 完成所有迭代后激活
   - 显示完整变更对比 + 评分提升
   - **图像变更显示左右对比**（旧版 vs 新版缩略图）
   - 应用按钮 + 确认弹窗（含主图改动会触发亚马逊审核的提示）

### 9.3 页面 P3：历史版本

**路径：** `/listings/[productId]/versions`

**布局：**

```
┌────────────────────────────────────────────────────────┐
│ 版本时间线                                              │
│ ● v5 (current)   2026-05-07  AI 优化 +12 分            │
│ ○ v4             2026-04-15  手动                       │
│ ○ v3             2026-03-10  AI 优化 +8 分             │
│ ○ v2             2026-02-05  手动                       │
│ ○ v1             2026-01-01  初始                       │
│                                                         │
│ [选两个版本对比] [回滚到 v4]                           │
└────────────────────────────────────────────────────────┘
```

**对比模式：**
- 双栏 diff 显示（红删 / 绿增）
- 评分对比
- 时间间隔的销量/CVR 变化

**回滚：**
- 选择目标版本 → 点击"回滚"
- 二次确认（含影响说明：会触发亚马逊审核）
- 回滚记录到 audit log

### 9.4 页面 P4：A/B 实验

**路径：** `/listings/[productId]/experiments`

**列表：**
```
SKU 的 A/B 实验列表
- exp_001 主图 A vs B  | running 7/14 天  | CVR 5.2% vs 5.8%  | 显著性 60%
- exp_002 A+ 模块对比  | completed         | 6.1% vs 5.3% (winner: A) ✓ 95%
```

**单实验详情：**
- 实验配置（哪个版本 vs 哪个版本，哪个内容元素）
- 累计天数 + 倒计时
- 实时数据（亚马逊 API 14 天结束才给最终）
- CVR 趋势图（按天）
- 显著性置信度（贝叶斯方法 + 频率主义双显示）
- 结论 + 建议

**新建实验：**
- 选择实验类型（主图 / A+ 模块）— 仅亚马逊原生支持的
- 选择 control / treatment 版本
- 设置实验时长（默认 14 天）
- 提交到亚马逊 Manage Your Experiments API

### 9.4.5 图像生成室（独立子页面）

**路径：** `/listings/[productId]/iterate/image/[roundId]`

```
┌── 图像生成室 - 主图改进 ──────────────────────────────┐
│                                                          │
│ 改进目标: 添加 3 年质保 + MIL-STD-810G 角标             │
│ 类型: 主图（亚马逊主图规则适用）                         │
│                                                          │
│ ─── 参考输入 ───                                        │
│ 当前主图: [缩略图 缩略]                                  │
│ 卖点: ✓ 3-Year Warranty ✓ MIL-STD-810G                  │
│ 品牌色: ■ #C8102E    风格: clean / professional         │
│                                                          │
│ ─── AI 生成进度 ───                                      │
│ ⏳ 候选 A 生成中... (12/30s)                             │
│ ⏳ 候选 B 生成中... (8/30s)                              │
│ ⏳ 候选 C 生成中... (15/30s)                             │
│                                                          │
│ ─── 候选 ───                                            │
│ ┌────────┐  ┌────────┐  ┌────────┐                     │
│ │ A 缩略  │  │ B 缩略  │  │ C 缩略  │                    │
│ │ Top-Left│  │Right-Btm│  │ Dual    │                    │
│ │ 角标    │  │ 徽章    │  │ 角标    │                    │
│ └────────┘  └────────┘  └────────┘                     │
│ 合规✓        合规✓        合规⚠ 拥挤                    │
│                                                          │
│ [全屏对比]  [合规详情]                                    │
│                                                          │
│ ─── 操作 ───                                             │
│ [ 采纳 A ] [ 采纳 B ] [ 采纳 C ]                         │
│ [ 在 A 内置编辑 ] [ 在 B 内置编辑 ] [ 在 C 内置编辑 ]   │
│                                                          │
│ ─── 重新生成 ───                                         │
│ 反馈: [输入框：你想要什么？]                              │
│   建议短句: "更深的红色" / "横幅样式" / "参考竞品 X"     │
│ [ 重新生成 3 候选 ]                                      │
│                                                          │
│ ─── 备选 ───                                             │
│ [ 上传我自己的图 ]  [ 跳过此改进 ]                       │
└──────────────────────────────────────────────────────────┘
```

**内置编辑器（点击"在 X 内置编辑"后弹出）：**

```
┌── 内置编辑器 - 候选 A ──────────────────────────┐
│                                                   │
│ [大图预览区]                                      │
│                                                   │
│ 工具栏：                                          │
│   [裁剪]  [旋转]  [亮度/对比]  [角标]  [文字]   │
│                                                   │
│ 角标设置：                                         │
│   位置: 左上 ▾    大小: ●━━━○━ 8%               │
│   样式: [圆形/方形/横幅] 颜色: ■                 │
│   文字: "3-YEAR WARRANTY"                         │
│                                                   │
│ 实时合规检查：                                    │
│   ✓ 白底 RGB(255,255,255)                        │
│   ✓ 产品占比 87%                                  │
│   ✓ 分辨率 2000×2000                              │
│                                                   │
│ [ 保存为最终方案 ] [ 取消 ]                       │
└───────────────────────────────────────────────────┘
```

### 9.5 页面 P5：类目模板

**路径：** `/listings/templates`

**功能：**
- 浏览类目模板
- 复制模板到指定 SKU 作为起点
- （后期）自定义团队模板

### 9.6 页面 P6：关键词库

**路径：** `/listings/keywords-library`

**功能：**
- 个人 / 团队的关键词库
- 主词（应该用）+ 否词（应避免）
- 可从搜索词报告批量导入
- 标签分组

---

## 10. 数据模型（DDL）

### 10.1 核心表

```sql
-- 10.1.1 Listing 诊断记录
CREATE TABLE listing_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  product_id UUID NOT NULL REFERENCES products(id),
  diagnosed_at TIMESTAMP DEFAULT NOW(),
  
  -- 评分
  total_score FLOAT NOT NULL CHECK (total_score >= 0 AND total_score <= 100),
  scores JSONB NOT NULL,           -- {D1: {value, subscores, reasoning}, ...}
  improvements JSONB NOT NULL,     -- [{rank, sub_dimension, issue, direction, expected_lift}]
  
  -- 上下文快照（快照当时的数据，可重现）
  context_snapshot JSONB NOT NULL,
  
  -- 元数据
  ai_model_version VARCHAR(50),
  scoring_version VARCHAR(20),
  prompt_version VARCHAR(20),
  
  -- 关联
  triggered_by VARCHAR(50),        -- 'manual' / 'scheduled' / 'event_review_drop'
  triggered_user_id UUID REFERENCES users(id),
  
  CONSTRAINT idx_listing_diagnoses_product_time 
    UNIQUE (product_id, diagnosed_at)
);

CREATE INDEX idx_diagnoses_tenant ON listing_diagnoses(tenant_id);
CREATE INDEX idx_diagnoses_product ON listing_diagnoses(product_id);
CREATE INDEX idx_diagnoses_score ON listing_diagnoses(total_score);
```

```sql
-- 10.1.2 优化迭代会话
CREATE TABLE listing_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  
  -- 起源
  initial_diagnosis_id UUID REFERENCES listing_diagnoses(id),
  initial_score FLOAT NOT NULL,
  
  -- 终态
  final_score FLOAT,
  total_rounds INTEGER DEFAULT 0,
  
  -- 状态
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    -- in_progress / completed / abandoned / applied
  
  -- 时间
  started_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  applied_at TIMESTAMP,
  abandoned_at TIMESTAMP,
  
  -- 用户
  created_by UUID NOT NULL REFERENCES users(id),
  
  -- 应用结果
  applied_version_id UUID,         -- 引用 listing_versions.id
  
  -- 元数据
  metadata JSONB,                  -- 额外信息
  
  CONSTRAINT only_one_active_per_product 
    EXCLUDE (product_id WITH =) 
    WHERE (status = 'in_progress')
);

CREATE INDEX idx_iter_product ON listing_iterations(product_id);
CREATE INDEX idx_iter_status ON listing_iterations(status);
CREATE INDEX idx_iter_user ON listing_iterations(created_by);
```

```sql
-- 10.1.3 单轮迭代
CREATE TABLE iteration_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iteration_id UUID NOT NULL REFERENCES listing_iterations(id) ON DELETE CASCADE,
  
  round_number INTEGER NOT NULL,
  
  -- 改进点
  selected_improvement JSONB NOT NULL,
    -- {sub_dimension, location, issue, direction, expected_lift}
  
  -- AI 输出
  ai_proposals JSONB[] NOT NULL,
    -- [{id: A/B/C, angle, text, rationale, keywords_included}]
  
  -- 用户操作
  user_action VARCHAR(20),
    -- 'accept' / 'edit' / 'rewrite' / 'skip'
  user_choice JSONB,
    -- 最终选定的（包括 edit 后的）
  user_feedback TEXT,
    -- 用于 'rewrite' 时的反馈
  
  -- 评分
  before_score FLOAT,
  after_score FLOAT,
  score_lift FLOAT GENERATED ALWAYS AS (after_score - before_score) STORED,
  
  -- 改动应用到的字段
  changes JSONB,
    -- {field: 'bullet_1', old: '...', new: '...'}
  
  -- 时间
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  
  CONSTRAINT idx_round_unique UNIQUE (iteration_id, round_number)
);

CREATE INDEX idx_rounds_iter ON iteration_rounds(iteration_id);
```

```sql
-- 10.1.4 Listing 版本（每次发布一个新版本）
CREATE TABLE listing_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  
  version_number INTEGER NOT NULL,
  
  -- 内容
  title TEXT NOT NULL,
  bullets JSONB NOT NULL,          -- string[]
  description TEXT,
  a_plus_content JSONB,            -- structured A+ modules
  main_image_url TEXT,
  gallery_images JSONB,            -- string[]
  video_url TEXT,
  
  -- 来源
  source VARCHAR(30) NOT NULL,
    -- 'initial_import' / 'manual_edit' / 'ai_iteration' / 'rollback'
  iteration_id UUID REFERENCES listing_iterations(id),
  
  -- 状态
  status VARCHAR(20) NOT NULL,
    -- 'draft' / 'pending_amazon' / 'live' / 'rejected_by_amazon' / 'archived'
  
  is_current BOOLEAN DEFAULT FALSE,
    -- 仅 1 个 version 的 is_current=true（per product）
  
  -- 亚马逊 sync
  amazon_submission_id VARCHAR(100),
  amazon_review_status VARCHAR(50),
  amazon_review_message TEXT,
  
  -- 时间
  created_at TIMESTAMP DEFAULT NOW(),
  applied_at TIMESTAMP,
  applied_by UUID REFERENCES users(id),
  archived_at TIMESTAMP,
  
  CONSTRAINT idx_version_unique UNIQUE (product_id, version_number)
);

CREATE UNIQUE INDEX idx_one_current_version_per_product 
  ON listing_versions(product_id) WHERE is_current = TRUE;
```

```sql
-- 10.1.5 A/B 实验
CREATE TABLE ab_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  asin VARCHAR(20) NOT NULL,
  
  -- 实验配置
  experiment_type VARCHAR(20) NOT NULL,
    -- 'main_image' / 'a_plus'
  control_version_id UUID REFERENCES listing_versions(id),
  treatment_version_id UUID REFERENCES listing_versions(id),
  duration_days INTEGER DEFAULT 14,
  
  -- 亚马逊侧
  amazon_experiment_id VARCHAR(100) UNIQUE,
  
  -- 状态
  status VARCHAR(20) NOT NULL,
    -- 'pending' / 'running' / 'completed' / 'failed' / 'cancelled'
  
  -- 时间
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  
  -- 结果
  winner VARCHAR(20),              -- 'control' / 'treatment' / 'no_difference'
  cvr_lift FLOAT,                  -- 提升幅度
  confidence FLOAT,                -- 置信度
  significance VARCHAR(20),        -- 'significant' / 'not_significant'
  
  raw_results JSONB,
    -- 亚马逊返回的完整结果
  
  -- 用户
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_exp_product ON ab_experiments(product_id);
CREATE INDEX idx_exp_status ON ab_experiments(status);
```

```sql
-- 10.1.6 用户偏好（用于 AI 改写）
CREATE TABLE listing_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- 品牌声音
  brand_voice TEXT,                -- 自由文本描述
  preferred_tone VARCHAR(50),      -- 'professional' / 'casual' / 'aspirational'
  
  -- 关键词偏好
  banned_words JSONB,              -- string[]
  preferred_phrases JSONB,         -- string[]
  
  -- 锁定字段（不允许 AI 改）
  locked_fields JSONB,             -- {asin: ['bullet_5', 'title_brand_part']}
  
  -- 类目特定
  category_overrides JSONB,
  
  updated_at TIMESTAMP DEFAULT NOW()
);
```

```sql
-- 10.1.7 关键词库
CREATE TABLE keyword_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  keyword TEXT NOT NULL,
  type VARCHAR(20) NOT NULL,       -- 'preferred' / 'banned' / 'category_required'
  category VARCHAR(50),
  source VARCHAR(50),              -- 'user' / 'imported_from_search_terms' / 'system'
  
  metadata JSONB,                  -- {impressions, clicks, conversions if from search terms}
  
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  CONSTRAINT idx_keyword_unique UNIQUE (tenant_id, keyword, type)
);

CREATE INDEX idx_kw_tenant ON keyword_library(tenant_id);
CREATE INDEX idx_kw_type ON keyword_library(type);
```

```sql
-- 10.1.7b 图像生成历史
CREATE TABLE image_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  iteration_id UUID REFERENCES listing_iterations(id),
  round_id UUID REFERENCES iteration_rounds(id),
  
  -- 类型
  image_type VARCHAR(30) NOT NULL,
    -- 'main' / 'a_plus_module' / 'gallery_scene' / 'gallery_size' /
    -- 'gallery_usage' / 'gallery_dimension' / 'gallery_features'
  module_index INTEGER,                    -- 适用 a_plus / gallery
  
  -- 输入
  reference_image_url TEXT,                -- 参考图（通常是当前主图）
  generation_prompt TEXT NOT NULL,         -- 给图模型的 prompt
  negative_prompt TEXT,
  brand_settings JSONB,                    -- {primary_color, voice, ...}
  
  -- 候选输出（3 个）
  candidates JSONB NOT NULL,
    -- [{id: A, image_url, style, compliance_check, rationale, generation_time_ms, ...}]
  
  -- 用户决策
  user_choice VARCHAR(10),                 -- 'A' / 'B' / 'C' / 'none'
  user_action VARCHAR(20),                 -- 'accept' / 'edit' / 'regenerate' / 'upload_own' / 'skip'
  user_edited_image_url TEXT,              -- 如果 'edit'，最终编辑后的图
  user_uploaded_image_url TEXT,            -- 如果 'upload_own'
  user_feedback TEXT,                      -- 如果 'regenerate'
  
  -- 模型元数据
  image_model VARCHAR(50),                 -- 'dall-e-3' / 'imagen-3' / 'sd-xl' / ...
  image_model_version VARCHAR(20),
  prompt_version VARCHAR(20),
  
  -- 合规检查
  compliance_passed BOOLEAN,
  compliance_details JSONB,
  
  -- 成本
  generation_cost_usd DECIMAL(10, 4),      -- 单次生成的成本
  
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_imgen_product ON image_generations(product_id);
CREATE INDEX idx_imgen_iteration ON image_generations(iteration_id);
CREATE INDEX idx_imgen_type ON image_generations(image_type);
```

```sql
-- 10.1.7c 图像存储
-- 实际图像文件存 S3 / MinIO，DB 只存 URL + 元数据
-- 路径规范：s3://amz-images/{tenant_id}/{product_id}/{image_type}/{generation_id}_{candidate_id}.{ext}
-- 缓存：Cloudflare CDN 在前
```

```sql
-- 10.1.8 类目模板
CREATE TABLE listing_category_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL,
  marketplace VARCHAR(20),         -- 'US' / 'UK' / 'DE' / ...
  
  template_data JSONB NOT NULL,
    -- {title_template, bullet_skeleton, a_plus_recommended_modules, must_have_elements}
  
  scoring_weights JSONB,
    -- {D1: 0.25, D2: 0.25, ...}
  
  must_have_checklist JSONB,
    -- 必备元素清单
  
  version VARCHAR(20),
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 10.2 索引策略

```sql
-- 高频查询：按 product_id + 最新诊断
CREATE INDEX idx_diag_product_latest 
  ON listing_diagnoses(product_id, diagnosed_at DESC);

-- 高频查询：按租户 + 评分排序（找低分 SKU）
CREATE INDEX idx_diag_tenant_score 
  ON listing_diagnoses(tenant_id, total_score) 
  INCLUDE (product_id, diagnosed_at);

-- 高频查询：进行中的迭代
CREATE INDEX idx_iter_in_progress 
  ON listing_iterations(tenant_id, status, last_active_at) 
  WHERE status = 'in_progress';
```

---

## 11. API 端点规格

### 11.1 端点总览

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | /api/v1/listings | SKU 列表（带评分） |
| POST | /api/v1/listings/diagnose-batch | 批量诊断 |
| POST | /api/v1/listings/{productId}/diagnose | 单 SKU 诊断 |
| GET | /api/v1/listings/{productId}/diagnoses | 诊断历史 |
| GET | /api/v1/listings/{productId}/score | 当前评分 |
| POST | /api/v1/listings/{productId}/iterations | 启动迭代 |
| GET | /api/v1/listings/{productId}/iterations/active | 当前进行中迭代 |
| GET | /api/v1/iterations/{iterationId} | 迭代详情 |
| POST | /api/v1/iterations/{iterationId}/rounds | 添加新轮 |
| GET | /api/v1/iterations/{iterationId}/rounds/{n} | 单轮详情 |
| POST | /api/v1/iterations/{iterationId}/rounds/{n}/proposals | 生成方案 |
| PUT | /api/v1/iterations/{iterationId}/rounds/{n}/decision | 用户决策 |
| POST | /api/v1/iterations/{iterationId}/preview | 应用预览 |
| POST | /api/v1/iterations/{iterationId}/apply | 应用到亚马逊 |
| POST | /api/v1/iterations/{iterationId}/abandon | 放弃迭代 |
| GET | /api/v1/listings/{productId}/versions | 版本列表 |
| GET | /api/v1/listings/{productId}/versions/{vid} | 版本详情 |
| POST | /api/v1/listings/{productId}/versions/{vid}/rollback | 回滚 |
| POST | /api/v1/listings/{productId}/versions/compare | 对比版本 |
| GET | /api/v1/listings/{productId}/experiments | 实验列表 |
| POST | /api/v1/listings/{productId}/experiments | 启动实验 |
| GET | /api/v1/experiments/{expId} | 实验详情 |
| GET | /api/v1/listings/keywords-library | 关键词库 |
| POST | /api/v1/listings/keywords-library | 新增关键词 |
| GET | /api/v1/listings/templates | 模板列表 |
| GET | /api/v1/listings/templates/{category} | 单类目模板 |
| POST | /api/v1/listings/{productId}/images/generate | 生成图（主图/A+/Gallery） |
| GET | /api/v1/listings/images/generations/{generationId} | 生成结果 |
| POST | /api/v1/listings/images/generations/{generationId}/regenerate | 重新生成 |
| POST | /api/v1/listings/images/generations/{generationId}/select | 选定候选 |
| POST | /api/v1/listings/images/generations/{generationId}/edit | 内置编辑器保存 |
| POST | /api/v1/listings/{productId}/images/upload | 用户上传自有图 |
| POST | /api/v1/listings/images/critique | 图像评估 |
| POST | /api/v1/listings/images/compliance-check | 合规检查 |

### 11.2 关键端点详细规格

#### 11.2.1 POST /api/v1/listings/{productId}/diagnose

**功能：** 触发对单个 SKU 的诊断

**请求：**
```http
POST /api/v1/listings/B0XXXXXXXX/diagnose
Authorization: Bearer <token>
Content-Type: application/json

{
  "force_refresh": false,           // 是否强制重新拉取数据
  "context_overrides": {            // 可选：覆盖默认上下文
    "competitors": ["B0...", ...],
    "include_videos": true
  }
}
```

**响应（202 Accepted，异步）：**
```json
{
  "diagnosis_id": "uuid",
  "status": "queued",
  "estimated_seconds": 15,
  "poll_url": "/api/v1/diagnoses/{diagnosis_id}"
}
```

**响应（200 OK，同步如缓存命中）：**
```json
{
  "diagnosis_id": "uuid",
  "product_id": "...",
  "diagnosed_at": "2026-05-07T10:00:00Z",
  "total_score": 67.0,
  "scores": {
    "D1": {
      "value": 78.0,
      "subscores": {"D1.1": 85, "D1.2": 72, "D1.3": 100},
      "reasoning": "...",
      "details": {...}
    },
    "D2": {...},
    "D3": {...},
    "D4": {...},
    "D5": {...}
  },
  "improvements": [
    {
      "rank": 1,
      "sub_dimension": "D2.1",
      "location": "bullet_1",
      "issue": "...",
      "direction": "...",
      "expected_score_lift": 8,
      "evidence": [...]
    },
    ...
  ],
  "metadata": {
    "ai_model": "claude-opus-4-7",
    "scoring_version": "2.3"
  }
}
```

**错误：**
- 404 SKU 不存在
- 403 无权限
- 429 速率限制
- 503 上游 API（搜索词报告）暂不可用

#### 11.2.2 POST /api/v1/listings/{productId}/iterations

**功能：** 启动一个新的优化迭代

**请求：**
```json
{
  "based_on_diagnosis_id": "uuid",  // 必填
  "preferences": {                   // 可选
    "tone": "professional",
    "exclude_sub_dimensions": ["D5.2"]  // 不优化某些子项
  }
}
```

**响应：**
```json
{
  "iteration_id": "uuid",
  "status": "in_progress",
  "initial_score": 67.0,
  "remaining_improvements": 5
}
```

**业务规则：**
- 同一 SKU 同时只能有 1 个 in_progress 迭代
- 已存在则返回 409 + 现有迭代 ID

#### 11.2.3 POST /api/v1/iterations/{iterationId}/rounds

**功能：** 启动新一轮迭代（选择改进项）

**请求：**
```json
{
  "selected_improvement_rank": 1,    // 选第几个改进项
  "selected_sub_dimension": "D2.1",  // 双重确认
  "selected_location": "bullet_1"
}
```

**响应：**
```json
{
  "round_id": "uuid",
  "round_number": 1,
  "status": "proposing",             // 异步生成方案
  "poll_url": "/api/v1/iterations/{iterationId}/rounds/1"
}
```

#### 11.2.4 POST /api/v1/iterations/{iterationId}/rounds/{n}/proposals

**功能：** 生成 AI 方案（首次或重写）

**请求（首次，无 body）：** 直接调用 LLM

**请求（重写）：**
```json
{
  "user_feedback": "更突出环保材质，少营销味",
  "previous_proposal_ids": ["A", "B", "C"]
}
```

**响应：**
```json
{
  "proposals": [
    {
      "id": "A",
      "angle": "evidence-driven",
      "text": "Military-Grade Drop Protection Phone Case...",
      "rationale": "...",
      "keywords_included": ["military-grade", "drop protection"],
      "compliance_check": {"passes": true, "warnings": []}
    },
    {"id": "B", ...},
    {"id": "C", ...}
  ],
  "generated_at": "2026-05-07T10:00:30Z"
}
```

#### 11.2.5 PUT /api/v1/iterations/{iterationId}/rounds/{n}/decision

**功能：** 用户对方案的决策

**请求（采纳）：**
```json
{
  "action": "accept",
  "selected_proposal_id": "A"
}
```

**请求（微调）：**
```json
{
  "action": "edit",
  "selected_proposal_id": "B",
  "edited_text": "..."
}
```

**请求（重写）：**
```json
{
  "action": "rewrite",
  "feedback": "更突出环保..."
}
```
→ 重定向到 POST proposals

**请求（跳过）：**
```json
{
  "action": "skip"
}
```

**响应：**
```json
{
  "round_status": "completed",
  "before_score": 67.0,
  "after_score": 73.0,
  "score_lift": 6.0,
  "next_action_url": "/api/v1/iterations/{iterationId}"
}
```

#### 11.2.6 POST /api/v1/iterations/{iterationId}/apply

**功能：** 将迭代结果应用到亚马逊

**请求：**
```json
{
  "confirm": true,
  "apply_to_variants": ["B0...A", "B0...B"],  // 可选，应用到子变体
  "schedule_at": null                          // 可选，定时
}
```

**响应（202 Accepted）：**
```json
{
  "apply_job_id": "uuid",
  "status": "submitted_to_amazon",
  "amazon_submission_id": "...",
  "estimated_review_minutes": 60,
  "version_id": "uuid",
  "track_url": "/api/v1/listings/{productId}/versions/{vid}"
}
```

#### 11.2.7 POST /api/v1/listings/{productId}/images/generate

**功能：** 触发图像生成（主图 / A+ 模块 / Gallery）

**请求：**
```json
{
  "iteration_id": "uuid",
  "round_id": "uuid",
  "image_type": "main",
  // or: "a_plus_module" with "module_index"
  // or: "gallery_scene" / "gallery_size" / ...
  "module_index": null,
  "improvement_target": {
    "sub_dimension": "D4.1",
    "issue": "...",
    "direction": "Add 3-Year Warranty + MIL-STD-810G badges"
  },
  "selling_points": ["3-Year Warranty", "MIL-STD-810G"],
  "brand_settings": {
    "primary_color": "#C8102E",
    "voice": "professional"
  },
  "reference_image_url": null  // 默认用当前主图
}
```

**响应（202 Accepted，异步）：**
```json
{
  "generation_id": "uuid",
  "status": "queued",
  "estimated_seconds": 30,
  "poll_url": "/api/v1/listings/images/generations/{generation_id}"
}
```

#### 11.2.8 GET /api/v1/listings/images/generations/{generationId}

**响应（成功）：**
```json
{
  "generation_id": "uuid",
  "status": "completed",
  "image_type": "main",
  "candidates": [
    {
      "id": "A",
      "image_url": "https://cdn.amz.com/.../A.jpg",
      "thumbnail_url": "...",
      "style": "clean-minimal",
      "rationale": "Top-left badge placement",
      "compliance_check": {
        "passes": true,
        "white_bg": true,
        "product_ratio": 0.87,
        "resolution": "2000x2000",
        "warnings": []
      },
      "generation_time_ms": 18500
    },
    {"id": "B", ...},
    {"id": "C", ...}
  ],
  "metadata": {
    "image_model": "imagen-3",
    "prompt_version": "v1.2",
    "total_cost_usd": 0.18
  }
}
```

#### 11.2.9 POST /api/v1/listings/images/generations/{generationId}/regenerate

**请求：**
```json
{
  "feedback": "Make the badges larger and use deeper red"
}
```

**响应（202）：** 新 generation_id（保留前一次记录）

#### 11.2.10 POST /api/v1/listings/images/generations/{generationId}/select

**请求：**
```json
{
  "candidate_id": "A",
  "action": "accept"
  // or "edit": triggers built-in editor
  // or "skip"
}
```

**响应：**
```json
{
  "selected_image_url": "...",
  "next_step": "edit | save_to_round"
}
```

#### 11.2.11 POST /api/v1/listings/images/generations/{generationId}/edit

**请求（含编辑后图像 base64 或 URL）：**
```json
{
  "candidate_id": "A",
  "edited_image_base64": "data:image/png;base64,...",
  "edits_applied": [
    {"type": "crop", "params": {...}},
    {"type": "badge", "params": {...}}
  ]
}
```

**响应：**
```json
{
  "edited_image_url": "https://cdn.amz.com/.../A_edited.jpg",
  "compliance_check": {"passes": true, ...},
  "saved_to_round": true
}
```

### 11.3 错误码标准

```json
{
  "error": {
    "code": "M1_DIAGNOSE_QUOTA_EXCEEDED",
    "message": "Daily diagnosis limit reached for tenant",
    "details": {"limit": 100, "used": 100, "resets_at": "..."}
  }
}
```

| 错误码 | 含义 | HTTP |
|---|---|---|
| M1_PRODUCT_NOT_FOUND | SKU 不存在 | 404 |
| M1_NO_DATA_AVAILABLE | 数据未同步完成 | 503 |
| M1_LLM_FAILED | LLM 调用失败 | 502 |
| M1_LLM_QUOTA | LLM 配额用尽 | 429 |
| M1_ITER_ACTIVE_EXISTS | 已有进行中迭代 | 409 |
| M1_AMAZON_REJECTED | 亚马逊拒绝改动 | 422 |
| M1_AMAZON_API_ERROR | SP-API 错误 | 502 |
| M1_INSUFFICIENT_PERM | 权限不足 | 403 |
| M1_LOCKED_FIELD | 试图改锁定字段 | 422 |
| M1_IMG_GEN_FAILED | 图像生成失败 | 502 |
| M1_IMG_GEN_QUOTA | 图像生成配额超出 | 429 |
| M1_IMG_COMPLIANCE_FAIL | 生成图全部不合规 | 422 |
| M1_IMG_UPLOAD_INVALID | 上传图格式不符 | 400 |
| M1_IMG_TOO_LARGE | 图过大（> 10MB） | 413 |

### 11.4 速率限制

| 端点 | 限制 |
|---|---|
| POST diagnose | 10/min/user, 100/day/tenant |
| POST proposals | 30/min/user |
| POST apply | 5/min/user, 50/day/tenant |
| POST images/generate | 5/min/user, 200/day/tenant |
| POST images/regenerate | 10/min/user, 500/day/tenant |

---

## 12. 业务规则

### 12.1 通用规则

1. **诊断有效期**：30 天。超过则诊断结果标"过期"，建议重新诊断。
2. **迭代唯一性**：同 SKU 同时只允许 1 个进行中迭代，新建会冲突。
3. **轮数上限**：单次迭代最多 20 轮。
4. **草稿保留**：迭代闲置 48 小时无操作 → 自动状态变 'abandoned'，但数据保留。
5. **应用冷却（修订）**：
   - 默认：同 SKU 应用后 **7 天内不允许再次应用**（防止亚马逊将账号标为"频繁修改"）
   - 仅"紧急修复"（如违规词移除）允许越过冷却，需用户填写理由
   - 主图改动单独冷却 14 天（亚马逊审核压力大）
6. **多语言/多国家站母版同步**：
   - 用户可在一个国家站做"母版优化"，标记为"模板"
   - 系统自动用 LLM 翻译并适配其他国家站（保留品牌词、单位转换、文化适配）
   - 各国家站仍独立诊断 + 应用（亚马逊后台分别审核）
   - 母版改动 → 触发"是否同步到其他国家站"提示

### 12.2 改写规则

1. **字数限制**：
   - 标题：≤ 200 chars（亚马逊硬限）
   - 五点：≤ 250 chars/each
   - 描述：≤ 2000 chars
   - A+ 模块：按模块类型不同
2. **禁用模式**：
   - 不允许全大写（除品牌名）
   - 不允许"#1 Best"等绝对夸张
   - 不允许医疗声明（除非合规类目）
3. **必含元素**：
   - 标题首位必须是品牌名（除非用户解锁）
   - 五点 #1 必须是 USP

### 12.3 锁定字段

用户可锁定特定字段（在 listing_user_preferences）：
- 如锁定 "bullet_5"，AI 改写时跳过此字段
- 锁定字段在评分时仍参与（即不优化但仍计分）

### 12.4 类目限制

- 母婴类目：不允许"100% safe"等绝对声明
- 食品类目：禁止医疗效果声明
- 服装类目：尺码必须含官方对照表

### 12.5 品牌备案

- 已备案：可优化全部（含 A+、Brand Story）
- 未备案：仅可改标题、五点、描述、主图（不可 A+）

### 12.6 图像生成规则

1. **3 候选并行生成**：默认每次出 3 个候选，并发请求图像模型
2. **自动合规过滤**：候选生成后立即跑 P-M1-IMG-COMPLIANCE，全部不合规 → 自动重试 1 次（不计入配额）
3. **存储策略**：
   - 候选图保留 30 天后自动归档（仅保留被采纳的）
   - 已应用版本永久保留
4. **配额计算**：
   - 单次"生成"消耗 1 配额（含 3 候选）
   - 单次"重新生成"消耗 1 配额
   - 内置编辑不消耗
5. **模型选择**：
   - 主图：Imagen 3 / DALL-E 3（高保真，强合规）
   - A+ / Gallery：Imagen 3（更灵活）+ Stable Diffusion XL（备）
6. **缓存**：相同 prompt + reference 24h 内缓存（节省成本）
7. **应用主图**：触发 Amazon 审核（24-72h 通常）
8. **应用 A+ / Gallery**：通常实时（除非品牌词错误）

### 12.6 父子变体

- 父 ASIN 不可独立优化（只优化子变体）
- 应用时可选"仅当前变体" / "应用到所有子变体"
- 所有子变体共享主图（所以主图改动影响全部）

---

## 13. 边界条件与异常

### 13.1 数据不足场景

| 情况 | 处理 |
|---|---|
| 搜索词报告未授权 | D1 评分跳过，标"数据缺失"，扣 5 分提示 |
| Top Review 未拉取 | D3 用类目均值替代，标低置信度 |
| 竞品数据缺失 | 仅 5 个竞品时，缺失就用 3 个，标"少于推荐 5 个" |
| 主图无法访问 | D4.1 跳过，提示"图片 URL 失效" |
| 视频检测不到 | D4.4 = 0 |

### 13.2 API 失败处理

| 失败 | 处理 |
|---|---|
| LLM 超时（30s） | 重试 1 次，仍失败返回错误，保留诊断为 'partial' |
| LLM 输出格式错误 | 解析重试 → 提示用户"AI 临时异常" |
| SP-API 拉数据失败 | 用最近一次缓存（标"非实时"），最多 24h |
| 亚马逊推送失败 | 保留草稿，详细错误信息显示给用户 |

### 13.3 用户操作异常

| 情况 | 处理 |
|---|---|
| 用户中途关闭浏览器 | 状态自动保存，下次打开恢复 |
| 用户重复点击"应用" | 幂等处理，第二次返回首次的结果 |
| 用户应用后亚马逊审核拒绝 | 通知用户，保留草稿可修改后重提 |
| 多用户同时编辑 | 乐观锁，后提交者收到 conflict，需 reload |

### 13.4 极端规模

| 情况 | 处理 |
|---|---|
| 1 个 SKU 关键词数 > 1000 | 仅取 top 100 评估 |
| 1 个 SKU Review 数 > 10000 | 仅取最近 500 条评估 |
| 5 个竞品中 1 个被亚马逊下架 | 跳过该竞品，标提示 |
| Listing 文本含特殊字符 | UTF-8 处理，emoji 保留 |

### 13.5 图像生成异常

| 情况 | 处理 |
|---|---|
| 图像模型返回不合规图（白底失败/产品比例不足） | 自动重试 1 次，仍失败提示用户重新表述 |
| 图像模型 API 超时（> 60s） | 中止 + 提示用户重试 |
| 3 候选全部不合规 | 提示 + 让用户调整 prompt 或上传自有图 |
| 用户上传图格式不符（非 JPG/PNG） | 拒绝 + 提示 |
| 用户上传图分辨率不足（主图 < 1600×1600） | 警告 + 上传仍可（亚马逊侧会拒）|
| 候选图被竞品图像所"参考过度"（embedding 相似度高） | 警告：可能侵权风险，建议重新生成 |
| 编辑器输出图过大（> 10MB） | 自动压缩 |
| 主图改动后 Amazon 审核拒绝 | 通知用户 + 保留旧主图 + 给修改建议 |

---

## 14. 与其他模块的集成

### 14.1 接收

| 来源模块 | 数据 | 用途 |
|---|---|---|
| 数据底座 | Listing / 搜索词 / Review | 评分输入 |
| M3 广告 | 关键词表现数据 | 优化关键词覆盖 |
| M4B Review | 差评聚类 | 用户痛点对齐 |
| M4C 竞品 | 竞品 Listing 变化 | 触发再诊断 |

### 14.2 输出

| 目标模块 | 数据 | 用途 |
|---|---|---|
| Dashboard | 优化中 SKU 数 / 待审版本数 | 卡片显示 |
| M3 广告 | 新关键词 | 广告投放扩展 |
| M4A 监控 | Listing 改动事件 | 追踪审核状态 |

### 14.3 触发器

```yaml
M1 触发再诊断的条件:
  - M4A 检测销量异常下降 7 天连续
  - M4B 新增差评聚类有 ≥ 3 条新主题
  - M4C 竞品改了 Listing 关键字段
  - M3 关键词覆盖率发现下降
  - 上次诊断 30 天后

M1 触发其他模块的事件:
  - 应用成功后 → M4A 启动 14 天 CVR 跟踪
  - 启动 A/B 后 → 通知 Dashboard
  - 评分跌破阈值 → 推送给 SKU 负责人
```

---

## 15. 验收测试用例

### 15.1 功能测试

| TC | 用例 | 预期 |
|---|---|---|
| TC-M1-001 | 用真实 SKU 触发诊断 | 10s 内返回 5 维分数 + 改进点 |
| TC-M1-002 | 评分准确性：人工标注 50 个 SKU vs AI 评分 | 总分误差 ≤ 10 分（85% 样本）|
| TC-M1-003 | 启动迭代选改进点 | 5s 内返回 3 个方案 |
| TC-M1-004 | 用户采纳方案 → 重评分 | 评分确实变化、变化方向正确 |
| TC-M1-005 | 用户反馈"重写" | 新方案与旧方案差异 ≥ 50% |
| TC-M1-006 | 应用到亚马逊 | SP-API 200 响应、版本 +1 |
| TC-M1-007 | 亚马逊拒绝 | 状态正确、错误信息清晰、可修改 |
| TC-M1-008 | 启动 A/B（主图） | 亚马逊原生实验创建成功 |
| TC-M1-009 | 14 天后回收 A/B 结果 | 显著性计算正确、winner 判定 |
| TC-M1-010 | 回滚版本 | 旧版本恢复为 current |

### 15.2 数据测试

| TC | 用例 | 预期 |
|---|---|---|
| TC-M1-011 | 搜索词缺失场景 | D1 跳过、提示明确 |
| TC-M1-012 | 锁定字段不被 AI 改 | 改写不涉及锁定字段 |
| TC-M1-013 | 禁用词检查 | 含禁用词的方案不会出现 |
| TC-M1-014 | 字数超限 | 自动截断或重生成 |
| TC-M1-015 | 类目权重生效 | 服装类 D4 权重 25% 计算正确 |

### 15.3 边界测试

| TC | 用例 | 预期 |
|---|---|---|
| TC-M1-016 | 同 SKU 双开浏览器 | 第二个收到冲突提示 |
| TC-M1-017 | 迭代闲置 48h | 自动 abandoned |
| TC-M1-018 | 父子变体只改子 | 其他子不受影响 |
| TC-M1-019 | 主图改动触发审核 | 状态 pending、用户可见 |
| TC-M1-020 | 多语言 SKU | 各 marketplace 独立诊断 |

### 15.3a 图像生成测试

| TC | 用例 | 预期 |
|---|---|---|
| TC-M1-IMG-1 | 触发主图生成（3 候选） | 30s 内全部完成 |
| TC-M1-IMG-2 | 主图合规检查（白底/产品占比/分辨率） | 100% 通过项可识别 |
| TC-M1-IMG-3 | 主图全不合规自动重试 | 最多重试 1 次 |
| TC-M1-IMG-4 | A+ 模块图生成 | 各模块类型支持 |
| TC-M1-IMG-5 | Gallery 场景图生成 | 含人物 / 场景 |
| TC-M1-IMG-6 | Gallery 尺寸对比图生成 | 含标尺/对比物 |
| TC-M1-IMG-7 | 用户反馈"重新生成" | 新候选与旧明显不同 |
| TC-M1-IMG-8 | 内置编辑器（角标/文字） | 实时合规检查 |
| TC-M1-IMG-9 | 用户上传自有图替代 | 上传 + 合规检查 |
| TC-M1-IMG-10 | 主图应用后 Amazon 审核 | 状态跟踪 / 拒绝处理 |
| TC-M1-IMG-11 | 图像生成成本统计 | 每次记录 cost |
| TC-M1-IMG-12 | 配额限制 | 超配额返回 429 |
| TC-M1-IMG-13 | 缓存命中（相同 prompt 24h 内） | 不重复消费配额 |
| TC-M1-IMG-14 | 多模型路由（主选/备选） | 主选失败自动切换 |

### 15.4 性能测试

| TC | 指标 | 目标 |
|---|---|---|
| TC-M1-P1 | 单次诊断响应 | P95 < 15s |
| TC-M1-P2 | 单次方案生成（文本） | P95 < 8s |
| TC-M1-P3 | 评分查询响应 | P95 < 200ms |
| TC-M1-P4 | 100 并发诊断 | 错误率 < 1% |
| TC-M1-P5 | 列表页加载 1000 SKU | < 2s |
| TC-M1-P6 | 图像生成（3 候选并发） | P95 < 45s |
| TC-M1-P7 | 图像合规检查 | P95 < 3s |
| TC-M1-P8 | 内置编辑器交互 | < 100ms 反馈 |

### 15.5 端到端业务验证

| TC | 用例 | 验证 |
|---|---|---|
| TC-M1-E2E-1 | 选 10 个低分 SKU 全流程优化 | 平均评分提升 ≥ 12 分 |
| TC-M1-E2E-2 | 应用 + 14 天 A/B | CVR lift ≥ 8%（统计显著） |
| TC-M1-E2E-3 | 模拟 6 个用户场景（S1-S6） | 全流程顺畅、无阻断 |

---

## 16. 性能与扩展

### 16.1 性能指标

| 操作 | 目标响应（P95） |
|---|---|
| 列表页加载 | < 1s |
| 单 SKU 诊断 | < 15s |
| 方案生成（文本 3 候选） | < 8s |
| 评分查询 | < 200ms |
| 应用到亚马逊 | < 5s（提交，亚马逊侧异步审核） |
| 历史版本加载 | < 500ms |
| 图像生成（3 候选并发） | < 45s |
| 图像合规检查 | < 3s |
| 内置编辑器交互 | < 100ms |
| 上传自有图（处理 + 合规） | < 5s |

### 16.2 扩展性

- 诊断/方案生成走异步队列（NATS + Workers），可水平扩展
- LLM 调用可路由到多个 provider（Claude / GPT），按负载/成本/性能动态选择
- 评分缓存（同一 SKU 24h 内不重新算，除非 force_refresh）
- 重度计算（embedding 相似度、关键词覆盖）可缓存

### 16.3 成本控制

| 项 | 单次成本估算 | 缓解 |
|---|---|---|
| 诊断 LLM 调用 | $0.10-0.30 | 缓存 24h、按套餐限额 |
| 方案生成 LLM（文本） | $0.05-0.15 | 同上 |
| Embedding 计算 | $0.001 | 缓存 |
| 第三方数据（Top Review） | 按调用次数 | 缓存 24h |
| **图像生成（主图，3 候选）** | **$0.12-0.30** | 24h 缓存、套餐配额 |
| **图像生成（A+ / Gallery）** | **$0.10-0.25** | 同上 |
| **图像合规检查（多模态）** | **$0.02** | 强制不缓存（每次都查） |
| **图存储（S3 + CDN）** | **$0.001/月/图** | 30 天后自动归档 |

预估每个 SKU/月平均：
- LLM 文本：$0.5-2
- 图像生成：$1-5（取决于优化频率）
- **合计：$1.5-7 / SKU / 月**

对应套餐 ¥999/月（30-100 SKU）→ 月成本 $45-700，毛利充裕。

---

## 17. 实施 Checklist

开始 M1 开发前必须完成：

- [ ] 数据底座：products / listings / search_terms / reviews 表已就绪
- [ ] AI 决策引擎：Prompt 调用、解析、验证已就绪
- [ ] SP-API：ListingsItems / Catalog / Reports 接入完成
- [ ] 第三方：SellerSprite Review API 接入
- [ ] 类目模板：4 个首批类目模板录入
- [ ] 类目共性痛点：4 个类目预先跑过 P-M1-CATEGORY-PAIN
- [ ] 评分版本：v1.0 算法 + Prompt 全部冻结
- [ ] **图像生成模型选型 + 接入**：Imagen 3 / DALL-E 3 至少一个
- [ ] **图存储**：S3 / MinIO + CDN
- [ ] **多模态合规检查模型**：Claude Opus vision / GPT-4V
- [ ] **内置图像编辑器**：选型（如基于 fabric.js / konva.js）

M1 开发顺序建议：

**第 1 批：文本流程**
1. 数据接入 + 评分引擎（D1-D5 子项实现）
2. 诊断 API + 单元测试
3. 迭代会话 API + 状态机
4. 文案方案生成（P-M1-PROPOSE / REWRITE） + 用户决策 API
5. 版本管理 + 应用 API（标题/五点/描述/A+ 文案）
6. 前端 SKU 列表 + 诊断展示
7. 前端单 SKU 优化室（文本迭代界面）

**第 2 批：图像流程**
8. 图像存储基础设施（S3 / CDN）
9. 图像生成 API（P-M1-IMG-MAIN-GEN / APLUS-GEN / GALLERY-GEN）
10. 图像合规检查 API（P-M1-IMG-COMPLIANCE）
11. 图像评估 API（P-M1-IMG-CRITIQUE）
12. 图像生成室前端 UI
13. 内置编辑器（裁剪/角标/文字）
14. 用户上传自有图功能
15. 主图应用 + Amazon 审核状态跟踪

**第 3 批：版本与 A/B**
16. 前端版本管理 / A/B 实验
17. 端到端联调
18. 5 轮自迭代质量门禁

---

> **本文档是 M1 模块的开发圣经。任何代码、测试、UI 必须以此为准。**
