const routes = [
  ["dashboard", "今日工作台", "先做什么"],
  ["m1-listing", "商品页", "诊断与改稿"],
  ["m2-profit-inventory", "利润库存", "补货与清库"],
  ["m3-ads", "广告", "止损与放量"],
  ["m4-monitoring", "异常", "差评与竞品"],
  ["audit-center", "审批", "所有改动先过这里"],
  ["commercial", "设置", "授权与交付"],
];

const roles = {
  operator: {
    label: "运营",
    hint: "你负责处理商品页、广告和异常任务；真实写入会先进入审批。",
    allowed: ["dashboard", "m1-listing", "m3-ads", "m4-monitoring", "audit-center", "commercial"],
  },
  buyer: {
    label: "采购",
    hint: "你负责库存、补货、清库；商品页和广告可以查看但不能处理。",
    allowed: ["dashboard", "m2-profit-inventory", "m4-monitoring", "audit-center", "commercial"],
  },
  finance: {
    label: "财务",
    hint: "你负责利润、费用、现金流；所有执行动作都只读或走审批。",
    allowed: ["dashboard", "m2-profit-inventory", "audit-center", "commercial"],
  },
  admin: {
    label: "管理员",
    hint: "你可以查看全部页面；真实执行仍需要凭证、审批和回滚方案。",
    allowed: routes.map(([route]) => route),
  },
};

const scenarios = {
  "ads-waste": ["广告烧钱 + 竞品攻击", "先停止浪费，再决定是否放量。", ["ads", "approval", "competitor"]],
  "listing-risk": ["商品页转化下滑", "先修复影响转化的商品页问题。", ["listing", "review"]],
  "margin-stockout": ["利润承压 + 断货风险", "先避免断货和亏损扩大。", ["inventory", "profit"]],
  "review-crisis": ["差评危机", "先处理会扩散的差评和质量问题。", ["review", "listing"]],
  "calm-growth": ["稳定增长", "优先做低风险、可提升利润的动作。", ["profit", "ads", "listing"]],
  "quota-security": ["权限/写入阻断演练", "先确认系统不会误改真实店铺。", ["approval", "security"]],
};

const tasks = [
  {
    id: "ads-zero-order",
    tags: ["ads", "approval"],
    severity: "先做",
    route: "m3-ads",
    owner: "运营",
    title: "停止一个正在烧钱的广告",
    summary: "SP Launch Discovery 已花 $692，但没有带来销售。",
    reason: "这里的 ACOS 不是优秀，而是因为没有销售无法解释。继续跑只会浪费预算。",
    action: "生成暂停浪费词 + 添加否词的广告草稿。",
    result: "预计先止损 $120-$180 / 周",
    evidence: "ad-timeseries.v1 · 17/17 广告场景覆盖 · confidence 90%",
  },
  {
    id: "stockout-red",
    tags: ["inventory", "profit"],
    severity: "紧急",
    route: "m2-profit-inventory",
    owner: "采购",
    title: "B0CASE-RED 还有 4 天断货",
    summary: "库存只够 4 天，断货会影响排名和广告学习。",
    reason: "这个 SKU 仍有 12% 净利，应该优先补货，而不是等广告和自然排名中断。",
    action: "生成补货 420 件的采购草稿，并查看现金占用。",
    result: "避免 7-14 天销售空窗",
    evidence: "mock:fba_inventory · PO blocked · confidence 88%",
  },
  {
    id: "listing-ddhifi",
    tags: ["listing", "review"],
    severity: "建议",
    route: "m1-listing",
    owner: "运营",
    title: "B0BM4274QM 商品页讲不清楚兼容性",
    summary: "用户评价里反复提到兼容性不清楚、噪音和静电。",
    reason: "商品页没有把用户顾虑讲清楚，也没有用竞品对比和 A+ 证明卖点。",
    action: "生成 3 个标题/五点草稿，人工选一个提交审批。",
    result: "Listing 评分预计 +22",
    evidence: "public ASIN snapshot + synthetic reviews · confidence 82%",
  },
  {
    id: "review-p1",
    tags: ["review", "listing"],
    severity: "关注",
    route: "m4-monitoring",
    owner: "运营",
    title: "新增差评提到包装破损和发热",
    summary: "一个 P1 事件已经形成，需要分派责任人。",
    reason: "如果不处理，后续会影响评分、退货和商品页转化。",
    action: "生成客服回复草稿，并把问题推给 M1 商品页和供应链复盘。",
    result: "30 分钟内确认 owner",
    evidence: "mock:review_stream · reply draft only · confidence 91%",
  },
  {
    id: "write-block",
    tags: ["approval", "security"],
    severity: "安全",
    route: "audit-center",
    owner: "管理员",
    title: "确认所有真实写入都被拦住",
    summary: "商品发布、广告调价、PO 创建、客户触达都不会直接执行。",
    reason: "当前没有真实店铺授权，必须只允许 mock execute 或 dry-run。",
    action: "查看审批中心的阻断队列。",
    result: "REAL_WRITES_ENABLED=false",
    evidence: "provider contracts · confidence 99%",
  },
];

const products = [
  ["B0BM4274QM", "ddHiFi", "USB-C 音频转接头", 21.6, 43.6, "兼容性和噪音没讲清楚", "补兼容清单、抗干扰说明、保修提示、A+ 对比表", "兼容列表 / 噪音静电 / 技术规格 / 保修 / A+ 对比"],
  ["B0BPXKJSWY", "UGREEN", "100W USB-C 线缆 3 件装", 48.4, 67.4, "快充清楚，但数据和视频限制不清楚", "补功率边界、数据速率限制、认证说明", "数据传输限制 / 认证标准 / 技术规格 / 对比表"],
  ["B0CM3C9HRG", "GameSir", "G8 手机游戏手柄", 34.5, 56.5, "机型和保护壳适配说明不足", "做尺寸适配表、设置指南和 FAQ", "兼容列表 / 尺寸适配 / 设置说明 / A+ 指南"],
  ["B0CXJ3F5PD", "Pova", "5G 解锁手机", 31.1, 53.1, "运营商兼容和电池发热边界不清楚", "补运营商频段表、散热说明、设置步骤", "运营商兼容 / 电池发热 / 技术规格 / 合规 claim"],
  ["B0BMRZZRTW", "Generic", "藤编吊灯", 19.5, 41.5, "尺寸、安装、材质没有证据化", "补尺寸图库、安装步骤、灯泡限制和护理说明", "尺寸 / 材质 / 护理 / 安装说明 / 图库示意图"],
].map(([asin, brand, name, before, after, problem, suggestion, focus]) => ({
  asin,
  brand,
  name,
  before,
  after,
  lift: Number((after - before).toFixed(1)),
  problem,
  suggestion,
  focus,
  status: before < 30 ? "优先改" : "可优化",
}));

const skus = [
  ["B0CASE-RED", "手机壳红色", "4 天", "12.0%", "$5,820", "补货 420 件", "紧急"],
  ["LAMP-003", "桌面台灯", "96 天", "-6.4%", "$2,140", "清库或降广告", "亏损"],
  ["CABLE-100W", "100W 线缆", "37 天", "21.8%", "$1,880", "保持节奏", "健康"],
  ["GAMEPAD-G8", "游戏手柄", "15 天", "18.2%", "$4,300", "小批量补货", "观察"],
];

const campaigns = [
  ["cmp-launch-sp", "SP Launch Discovery", "新品探索", "$692", "$0", "0", "不可解释", "先暂停浪费词，添加否词", "zero-order-spend / negative-keyword-opportunity"],
  ["cmp-growth-sp", "SP Growth Exact", "成长期", "$1,716", "$8,649", "267", "19.85%", "晚间加权，但先考虑归因滞后", "budget-capped / dayparting-peaks / attribution-lag"],
  ["cmp-mature-brand", "SP Acme Brand Core", "成熟期", "$1,053", "$4,368", "156", "24.12%", "加强品牌词防守，降低 product_pages", "brand-defense-exposed / placement-waste"],
  ["cmp-decline-auto", "SP Decline Auto Harvest", "衰退期", "$991", "$440", "20", "225.43%", "禁止加预算，先降价/暂停/否词", "high-acos / outlier-drop / guardrail-blocked"],
  ["cmp-attack-sd", "SD Competitor Attack", "竞品攻击", "$747", "$2,660", "76", "28.09%", "库存不足，不扩大攻击预算", "competitor-attack / stockout-constrained / outlier-spike"],
].map(([id, name, stage, spend, sales, orders, acos, action, cases]) => ({ id, name, stage, spend, sales, orders, acos, action, cases }));

const events = [
  ["P1", "差评", "包装破损与发热集中出现", "运营", "30 分钟", "生成回复草稿，推给供应链复盘"],
  ["P2", "竞品", "竞品降价并开启 Deal", "广告", "4 小时", "让 M2 算最低跟价，让 M3 调品牌防守"],
  ["P0", "库存", "库存天数跌破 guardrail", "采购", "1 小时", "确认补货草稿和现金占用"],
  ["P2", "商品页", "主图/A+ 证据不足", "内容", "1 天", "推送到商品页优化"],
];

const approvals = [
  ["M1", "改商品标题/五点", "B0BM4274QM", "BLOCKED", "缺少真实店铺授权 + 人工审批"],
  ["M2", "创建采购单", "B0CASE-RED", "BLOCKED", "PO provider 未配置"],
  ["M3", "提高广告预算", "cmp-decline-auto", "BLOCKED", "高 ACOS + protected tag"],
  ["M3", "添加否词", "cmp-launch-sp", "PENDING", "允许草稿，等待审批"],
  ["M4", "发送客服邮件", "review-event-042", "BLOCKED", "客户触达凭证未配置"],
];

const state = {
  product: products[0].asin,
  campaign: campaigns[0].id,
  replay: 0,
  logs: [
    ["系统", "Mock Store 数据已加载，真实写入关闭。"],
    ["审批", "审批中心已接管 Listing、广告、PO、客服触达动作。"],
  ],
};

const root = document.querySelector("#pageRoot");
const nav = document.querySelector("#moduleNav");
const pageTitle = document.querySelector("#pageTitle");
const roleSelect = document.querySelector("#roleSelect");
const scenarioSelect = document.querySelector("#scenarioSelect");
const roleHint = document.querySelector("#roleHint");
const toast = document.querySelector("#toast");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const currentRoute = () => location.hash.replace("#", "") || "dashboard";
const currentRole = () => roles[roleSelect.value] || roles.operator;
const currentScenario = () => scenarios[scenarioSelect.value] || scenarios["ads-waste"];
const canAccess = (route) => currentRole().allowed.includes(route);

function pill(text, type = "") {
  return `<span class="pill ${type}">${escapeHtml(text)}</span>`;
}

function tagList(text) {
  return `<div class="tags">${String(text).split(/\s*\/\s*|、/).filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function metric(label, value, note, type = "") {
  return `<article class="metric ${type}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function renderNav() {
  const active = currentRoute();
  nav.innerHTML = routes.map(([id, label, desc]) => `
    <a href="#${id}" class="${active === id ? "active" : ""} ${canAccess(id) ? "" : "locked"}">
      <span>${label.slice(0, 2)}</span>
      <b>${escapeHtml(label)}</b>
      <small>${canAccess(id) ? escapeHtml(desc) : "只读/受限"}</small>
    </a>
  `).join("");
}

function pageFrame({ title, subtitle, metrics, body, aside }) {
  const [scenarioName, scenarioText] = currentScenario();
  root.innerHTML = `
    <section class="hero">
      <div>
        <span class="eyebrow">${escapeHtml(scenarioName)} · ${escapeHtml(currentRole().label)}视角</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle)}</p>
        <div class="safe-note">所有按钮现在只生成草稿、dry-run 或审批记录，不会改真实店铺。</div>
      </div>
      <aside>
        <span>今天的判断</span>
        <strong>${escapeHtml(scenarioText)}</strong>
      </aside>
    </section>
    <section class="metrics">${metrics.join("")}</section>
    <section class="main-grid">
      <div class="main-column">${body}</div>
      <aside class="right-column">${aside || helpPanel()}${activityPanel()}</aside>
    </section>
  `;
}

function helpPanel() {
  return `<section class="panel">
    <span class="eyebrow">操作习惯</span>
    <h3>推荐顺序</h3>
    ${steps(["先处理红色任务", "确认为什么要做", "生成草稿", "提交审批", "观察结果"])}
  </section>`;
}

function activityPanel() {
  return `<section class="panel compact">
    <div class="panel-title"><div><span class="eyebrow">操作记录</span><h3>刚刚发生了什么</h3></div>${pill(`${state.logs.length} 条`, "ok")}</div>
    <div class="activity-list">${state.logs.slice(-5).reverse().map(([type, text]) => `<article><b>${escapeHtml(type)}</b><span>${escapeHtml(text)}</span></article>`).join("")}</div>
  </section>`;
}

function addLog(type, text) {
  state.logs.push([type, text]);
  if (state.logs.length > 30) state.logs.shift();
}

function steps(items) {
  return `<ol class="steps">${items.map((item, index) => `<li><span>${index + 1}</span>${escapeHtml(item)}</li>`).join("")}</ol>`;
}

function taskCard(task) {
  const blocked = !canAccess(task.route);
  const urgent = task.severity === "紧急" || task.severity === "先做";
  return `<article class="task ${blocked ? "blocked" : ""}">
    <div class="task-head">
      ${pill(task.severity, urgent ? "danger" : "warn")}
      <small>负责人：${escapeHtml(task.owner)}</small>
    </div>
    <h3>${escapeHtml(task.title)}</h3>
    <p class="summary">${escapeHtml(task.summary)}</p>
    <div class="explain">
      <b>为什么要做</b>
      <span>${escapeHtml(task.reason)}</span>
    </div>
    <div class="explain next">
      <b>下一步</b>
      <span>${escapeHtml(task.action)}</span>
    </div>
    <div class="task-foot">
      <strong>${escapeHtml(task.result)}</strong>
      <small>${escapeHtml(task.evidence)}</small>
    </div>
    <div class="actions">
      <a class="primary button" href="#${task.route}">${blocked ? "只读查看" : "去处理"}</a>
      <button data-toast="${escapeHtml(task.title)} 已生成审批草稿">提交审批</button>
    </div>
  </article>`;
}

function renderDashboard() {
  pageTitle.textContent = "今日工作台";
  const focus = currentScenario()[2];
  const sorted = [...tasks].sort((a, b) => Number(!a.tags.some((tag) => focus.includes(tag))) - Number(!b.tags.some((tag) => focus.includes(tag))));
  pageFrame({
    title: "打开系统后，只看今天该做什么",
    subtitle: "首页不再按模块堆功能，而是把商品、广告、库存、差评、审批合并成一张今日任务清单。你按顺序处理即可。",
    metrics: [
      metric("今日任务", "5 件", "系统已按优先级排序", "blue"),
      metric("最急风险", "4 天断货", "B0CASE-RED", "red"),
      metric("广告止损", "$692", "0 销售广告", "red"),
      metric("真实执行", "关闭", "REAL_WRITES_ENABLED=false", "green"),
    ],
    body: `<section class="panel">
      <div class="panel-title"><div><span class="eyebrow">Today Inbox</span><h3>今天按这个顺序处理</h3></div>${pill("mock verified", "ok")}</div>
      <div class="task-list">${sorted.map(taskCard).join("")}</div>
    </section>`,
    aside: `<section class="panel">
      <span class="eyebrow">看不懂时只记住</span>
      <h3>每张任务卡只回答 3 个问题</h3>
      ${steps(["发生了什么", "为什么要管", "下一步点哪里"])}
      <div class="mini-note"><b>证据放在哪里？</b><p>source / confidence / validation 被降级到卡片底部，不再占主视觉。</p></div>
    </section>
    <section class="panel compact">
      <span class="eyebrow">安全状态</span>
      <h3>不会误改真实店铺</h3>
      <p>Listing 发布、广告调价、PO 创建、客户触达都停在审批中心。</p>
    </section>`,
  });
}

function renderListings() {
  pageTitle.textContent = "商品页";
  const product = products.find((item) => item.asin === state.product) || products[0];
  pageFrame({
    title: "商品页优化按三步走：选商品、看问题、生成草稿",
    subtitle: "这里展示 5 个 ASIN 的真实形态 mock benchmark。系统不会直接发布，只会给你标题、五点、A+ 的草稿。",
    metrics: [
      metric("已验证 ASIN", "5 个", "每个都有搜索词/评论/竞品", "blue"),
      metric("平均提分", "+21.4", "5/5 可优化", "green"),
      metric("草稿数量", "45 个", "5 ASIN × 3 轮 × 3 案"),
      metric("真实发布", "阻断", "spapi.patchListing blocked", "red"),
    ],
    body: `<section class="workflow">
      <div class="panel list-panel">
        <span class="eyebrow">1. 选商品</span>
        <h3>优先改低分商品</h3>
        <div class="select-list">${products.map((item) => `<button class="${item.asin === product.asin ? "selected" : ""}" data-product="${item.asin}"><b>${item.asin}</b><span>${escapeHtml(item.brand)} · ${escapeHtml(item.name)}</span><strong>+${item.lift}</strong></button>`).join("")}</div>
      </div>
      <div class="panel detail-panel">
        <div class="panel-title"><div><span class="eyebrow">2. 看问题</span><h3>${escapeHtml(product.brand)} · ${escapeHtml(product.name)}</h3></div>${pill(product.status, product.before < 30 ? "danger" : "warn")}</div>
        <div class="score-row">
          <div><span>现在评分</span><strong>${product.before}</strong>${bar(product.before)}</div>
          <div><span>改完预计</span><strong>${product.after}</strong>${bar(product.after)}</div>
          <div><span>预计提升</span><strong>+${product.lift}</strong><small>confidence 62%</small></div>
        </div>
        <div class="plain-two">
          <article><b>用户看不懂什么</b><p>${escapeHtml(product.problem)}</p></article>
          <article><b>应该怎么改</b><p>${escapeHtml(product.suggestion)}</p></article>
        </div>
        <div class="draft-area">
          <span class="eyebrow">3. 生成草稿</span>
          <h3>本次改稿重点</h3>
          ${tagList(product.focus)}
          <div class="actions">
            <button class="primary" data-toast="${product.asin} 已生成 3 个商品页草稿">生成 3 个草稿</button>
            <button data-toast="${product.asin} 已进入审批中心，不会真实发布">提交审批</button>
          </div>
        </div>
      </div>
    </section>`,
    aside: `<section class="panel">
      <span class="eyebrow">证据和边界</span>
      <h3>这些数据怎么来的</h3>
      <p>来源：public_asin_snapshot_plus_synthetic_reviews。</p>
      <p>评论痛点是 synthetic mock，只用于测试优化能力，不会当作真实用户证据发布。</p>
      <div class="mini-note danger"><b>不可自动发布</b><p>spapi.patchListing、spapi.createListing、notification.sendEmail 全部阻断。</p></div>
    </section>`,
  });
}

function renderProfitInventory() {
  pageTitle.textContent = "利润库存";
  pageFrame({
    title: "先看会不会断货，再看卖得赚不赚",
    subtitle: "利润库存页不让你先看复杂报表，而是先把 SKU 分成：必须补货、必须止损、观察、健康。",
    metrics: [
      metric("最急库存", "4 天", "B0CASE-RED", "red"),
      metric("亏损 SKU", "1 个", "LAMP-003", "red"),
      metric("净利率", "18.6%", "扣广告/FBA/仓储", "green"),
      metric("PO 创建", "阻断", "PO blocked", "red"),
    ],
    body: `<section class="panel">
      <div class="panel-title"><div><span class="eyebrow">SKU Queue</span><h3>SKU 处理顺序</h3></div>${pill("mock:fba_inventory", "ok")}</div>
      <div class="business-table">${skus.map(([sku, name, stock, margin, cash, action, status]) => `<article>
        <div><b>${sku}</b><span>${escapeHtml(name)}</span></div>
        <div><small>库存</small><strong>${stock}</strong></div>
        <div><small>净利</small><strong>${margin}</strong></div>
        <div><small>现金占用</small><strong>${cash}</strong></div>
        <div><small>建议</small><strong>${escapeHtml(action)}</strong></div>
        ${pill(status, status === "紧急" || status === "亏损" ? "danger" : status === "健康" ? "ok" : "warn")}
      </article>`).join("")}</div>
    </section>`,
    aside: `<section class="panel">
      <span class="eyebrow">采购怎么用</span>
      <h3>三步判断</h3>
      ${steps(["库存少于 7 天先补货", "净利为负先停止扩量", "补货前检查现金占用"])}
      <button class="primary full" data-toast="已生成 PO 草稿，真实 PO 创建仍被阻断">生成 PO 草稿</button>
    </section>`,
  });
}

function renderAds() {
  pageTitle.textContent = "广告";
  const campaign = campaigns.find((item) => item.id === state.campaign) || campaigns[0];
  pageFrame({
    title: "广告只分三类：停掉浪费、放大有效、保护品牌",
    subtitle: "复杂的 17 个广告场景已经在后台验证。前台只告诉你每个广告现在该停、该调，还是该观察。",
    metrics: [
      metric("场景覆盖", "17/17", "所有 mock 广告情况已覆盖", "blue"),
      metric("日级数据", "450 行", "5 campaigns × 90 days"),
      metric("小时数据", "10,800 行", "分时段验证"),
      metric("真实改广告", "阻断", "Ads API 写入关闭", "red"),
    ],
    body: `<section class="workflow">
      <div class="panel list-panel">
        <span class="eyebrow">1. 选广告</span>
        <h3>先看异常广告</h3>
        <div class="select-list">${campaigns.map((item) => `<button class="${item.id === campaign.id ? "selected" : ""}" data-campaign="${item.id}"><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.stage)} · ${escapeHtml(item.acos)}</span><strong>${escapeHtml(item.sales)}</strong></button>`).join("")}</div>
      </div>
      <div class="panel detail-panel">
        <div class="panel-title"><div><span class="eyebrow">2. 看结论</span><h3>${escapeHtml(campaign.name)}</h3></div>${pill(campaign.stage)}</div>
        <div class="score-row four">
          <div><span>花费</span><strong>${campaign.spend}</strong></div>
          <div><span>销售额</span><strong>${campaign.sales}</strong></div>
          <div><span>订单</span><strong>${campaign.orders}</strong></div>
          <div><span>ACOS</span><strong>${campaign.acos}</strong></div>
        </div>
        <div class="plain-two">
          <article><b>一句话判断</b><p>${escapeHtml(campaign.action)}</p></article>
          <article><b>下一步</b><p>只生成广告 dry-run 草稿，提交审批后再决定是否真实执行。</p></article>
        </div>
        <div class="draft-area">
          <span class="eyebrow">3. 生成动作</span>
          ${tagList(campaign.cases)}
          <div class="actions">
            <button class="primary" data-toast="${campaign.id} 已生成广告 dry-run 草稿">生成 dry-run</button>
            <button data-toast="${campaign.id} 已检查护栏：真实写入仍阻断">检查护栏</button>
          </div>
        </div>
      </div>
    </section>`,
    aside: `<section class="panel">
      <span class="eyebrow">后台已覆盖的广告情况</span>
      <h3>17 个场景</h3>
      ${tagList("launch / growth / mature / decline / high-acos / zero-order-spend / budget-capped / dayparting-peaks / placement-waste / brand-defense-exposed / competitor-attack / stockout-constrained / outlier-spike / outlier-drop / attribution-lag / negative-keyword-opportunity / guardrail-blocked")}
      <div class="mini-note danger"><b>避免误判</b><p>zero-order-spend 中 ACOS 不可解释，不能当作广告健康。</p></div>
    </section>`,
  });
}

function renderMonitoring() {
  pageTitle.textContent = "异常";
  pageFrame({
    title: "异常页只回答：发生什么、谁处理、下一步是什么",
    subtitle: "差评、竞品、库存和商品页异常都先变成可分派的任务，不直接发消息给客户。",
    metrics: [
      metric("待处理异常", "7 个", "P0/P1/P2"),
      metric("最急事件", "P1 差评", "包装破损 + 发热", "red"),
      metric("超时 SLA", "0", "owner 已分配", "green"),
      metric("客户触达", "阻断", "reply draft only", "red"),
    ],
    body: `<section class="panel">
      <div class="panel-title"><div><span class="eyebrow">Event Inbox</span><h3>按严重度处理</h3></div>${pill("mock:review_stream", "ok")}</div>
      <div class="event-list">${events.map(([level, type, title, owner, sla, action]) => `<article>
        ${pill(level, level === "P0" || level === "P1" ? "danger" : "warn")}
        <div><b>${escapeHtml(type)} · ${escapeHtml(title)}</b><span>负责人：${escapeHtml(owner)} · SLA：${escapeHtml(sla)}</span><p>${escapeHtml(action)}</p></div>
        <button data-toast="${escapeHtml(title)} 已生成处理草稿">处理</button>
      </article>`).join("")}</div>
    </section>`,
    aside: `<section class="panel">
      <span class="eyebrow">通知边界</span>
      <h3>不会直接联系客户</h3>
      <p>客服邮件、企微、短信、外部通知都只是草稿。没有真实凭证和审批，不会发送。</p>
      ${steps(["确认异常", "分配负责人", "生成处理草稿", "推送到相关模块", "审批后再执行"])}
    </section>`,
  });
}

function renderAudit() {
  pageTitle.textContent = "审批";
  pageFrame({
    title: "审批中心决定哪些动作可以真的执行",
    subtitle: "当前没有真实店铺授权，所以所有写入类动作都停在这里。你可以看原因、看草稿、批准 mock 执行。",
    metrics: [
      metric("已阻断", "12 个", "真实写入默认关闭", "red"),
      metric("待审批", "3 个", "只允许草稿"),
      metric("回滚方案", "已准备", "审计日志可追溯", "green"),
      metric("Provider", "mock", "REAL_WRITES_ENABLED=false"),
    ],
    body: `<section class="panel">
      <div class="panel-title"><div><span class="eyebrow">Write Queue</span><h3>真实店铺写入阻断队列</h3></div>${pill("REAL_WRITES_ENABLED=false", "danger")}</div>
      <div class="approval-list">${approvals.map(([module, action, target, status, reason]) => `<article>
        <div><b>${escapeHtml(module)} · ${escapeHtml(action)}</b><span>${escapeHtml(target)}</span><p>${escapeHtml(reason)}</p></div>
        ${pill(status, status === "BLOCKED" ? "danger" : "warn")}
        <button data-toast="${escapeHtml(action)} 的证据已打开">看证据</button>
      </article>`).join("")}</div>
    </section>`,
    aside: `<section class="panel">
      <span class="eyebrow">审批前看 5 项</span>
      <h3>缺一项都不能执行</h3>
      ${steps(["来源和原因", "改动前后对比", "影响预估", "回滚方案", "审批人权限"])}
    </section>`,
  });
}

function renderCommercial() {
  pageTitle.textContent = "设置";
  pageFrame({
    title: "设置页只告诉你：现在能用什么，还缺什么",
    subtitle: "账号、店铺、支付和真实写入以后再接。现在先用 mock 数据把全流程看通。",
    metrics: [
      metric("当前套餐", "Growth", "mock subscription"),
      metric("用量", "82%", "AI decision quota"),
      metric("支付", "sandbox", "不会真实扣费", "green"),
      metric("店铺授权", "待补充", "用户后续添加", "warn"),
    ],
    body: `<section class="panel">
      <div class="panel-title"><div><span class="eyebrow">Onboarding</span><h3>上线前按这个顺序做</h3></div>${pill("sandbox checkout", "ok")}</div>
      <div class="check-list">${["先用 mock 数据跑通 M1-M4", "补充真实 Amazon 店铺授权", "配置 Ads/SP-API sandbox contract", "连续回放 5 次以上 mock 场景", "审批 RBAC 与额度", "最后打开生产写入人工开关"].map((item, index) => `<label><input type="checkbox" ${index === 0 ? "checked" : ""}> <span>${escapeHtml(item)}</span></label>`).join("")}</div>
    </section>`,
    aside: `<section class="panel">
      <span class="eyebrow">套餐权益</span>
      <h3>普通话解释</h3>
      <p>现在页面只展示 sandbox 付款和 mock 权益，不会扣费；真实支付凭证以后再接。</p>
      ${tagList("SKU额度 / 团队成员 / LLM token / 图像生成 / 自动操作 / API")}
    </section>`,
  });
}

function bar(value) {
  return `<span class="progress"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></span>`;
}

function render() {
  renderNav();
  roleHint.textContent = currentRole().hint;
  const pages = {
    dashboard: renderDashboard,
    "m1-listing": renderListings,
    "m2-profit-inventory": renderProfitInventory,
    "m3-ads": renderAds,
    "m4-monitoring": renderMonitoring,
    "audit-center": renderAudit,
    commercial: renderCommercial,
  };
  (pages[currentRoute()] || renderDashboard)();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

window.addEventListener("hashchange", render);
roleSelect.addEventListener("change", render);
scenarioSelect.addEventListener("change", render);
document.querySelector("#mockRunButton").addEventListener("click", () => {
  state.replay += 1;
  const message = `第 ${state.replay} 次模拟闭环完成：任务 → 草稿 → 审批 → 复盘`;
  addLog("模拟闭环", message);
  showToast(message);
  render();
});
document.addEventListener("click", (event) => {
  const product = event.target.closest("[data-product]");
  if (product) {
    state.product = product.dataset.product;
    renderListings();
  }
  const campaign = event.target.closest("[data-campaign]");
  if (campaign) {
    state.campaign = campaign.dataset.campaign;
    renderAds();
  }
  const toastButton = event.target.closest("[data-toast]");
  if (toastButton) {
    addLog("操作", toastButton.dataset.toast);
    showToast(toastButton.dataset.toast);
    render();
  }
});

render();
