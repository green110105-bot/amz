import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("web skeleton exposes static entry assets without build dependencies", async () => {
  const html = await read("apps/web/index.html");
  const server = await read("apps/web/server.mjs");

  assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css" \/>/);
  assert.match(html, /PRD full-scope \/ mock-only \/ local preview/);
  assert.match(html, /卖家运营工作台/);
  assert.match(html, /data-ui="seller-operation-workspace"/);
  assert.match(server, /createWebServer/);
  assert.match(server, /\/ready/);
});

test("web skeleton contains required product pages and navigation entries", async () => {
  const html = await read("apps/web/index.html");
  const js = await read("apps/web/app.js");

  for (const route of [
    "dashboard",
    "m1-listing",
    "m2-profit-inventory",
    "m3-ads",
    "m4-monitoring",
    "audit-center",
    "commercial",
  ]) {
    assert.match(html + js, new RegExp(route));
  }

  assert.match(js, /今日工作台/);
  assert.match(js, /操作记录/);
  assert.match(js, /商品页/);
  assert.match(js, /利润库存/);
  assert.match(js, /广告/);
  assert.match(js, /异常/);
  assert.match(js, /审批/);
});

test("web skeleton makes mock source, confidence and validation visible", async () => {
  const html = await read("apps/web/index.html");
  const js = await read("apps/web/app.js");

  assert.match(html, /Mock 数据已加载/);
  assert.match(html + js, /source/);
  assert.match(html + js, /confidence/);
  assert.match(js, /public ASIN snapshot \+ synthetic reviews/);
  assert.match(js, /mock:fba_inventory/);
  assert.match(js, /ad-timeseries\.v1/);
  assert.match(js, /mock:review_stream/);
  assert.match(js, /validation|dry-run|草稿/);
  assert.match(js, /mock verified/);
  assert.match(js, /addLog/);
});

test("web skeleton blocks real store writes and models role permissions", async () => {
  const html = await read("apps/web/index.html");
  const js = await read("apps/web/app.js");

  assert.match(html, /真实写入关闭/);
  assert.match(js, /真实店铺写入阻断队列/);
  assert.match(js, /PO blocked/);
  assert.match(js, /客户触达凭证未配置/);
  assert.match(js, /REAL_WRITES_ENABLED=false/);

  for (const role of ["operator", "buyer", "finance", "admin"]) {
    assert.match(js, new RegExp(`${role}: \\{`));
  }

  assert.match(js, /allowed:/);
  assert.match(js, /只读\/受限/);
  assert.match(js, /blocked|locked/);
});

test("web skeleton includes scenario switcher and polished responsive UI markers", async () => {
  const html = await read("apps/web/index.html");
  const js = await read("apps/web/app.js");
  const css = await read("apps/web/styles.css");

  assert.match(html, /id="scenarioSelect"/);
  for (const scenario of ["calm-growth", "listing-risk", "margin-stockout", "ads-waste", "review-crisis", "quota-security"]) {
    assert.match(html + js, new RegExp(scenario));
  }

  assert.match(js, /B0BM4274QM/);
  assert.match(js, /B0BMRZZRTW/);
  assert.match(js, /17\/17/);
  assert.match(js, /zero-order-spend/);
  assert.match(js, /guardrail-blocked/);
  assert.match(css, /--blue: #004fd3/);
  assert.match(css, /\.hero/);
  assert.match(css, /@media \(max-width: 860px\)/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});
