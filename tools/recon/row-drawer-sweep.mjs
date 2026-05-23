// row-drawer-sweep.mjs
// Per-row-type drawer sweep:
//   1) navigate to a master page
//   2) close any open drawer
//   3) click first row's `to-compare-data-list` icon → screenshot + probe
//   4) for each tab inside drawer: click + screenshot
//   5) close drawer, click `to-show-more` → screenshot popover
//   6) in popover, click `to-operate-log` → screenshot + probe
//   7) close
//
// All screenshots are FULL DESKTOP via PowerShell. All probes are written as JSON.
// Stops on first hard error; soft errors (missing icon) are logged.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, arr) => {
  if (!a.startsWith('--')) return [];
  return [[a.slice(2), arr[i + 1] || true]];
}));
const PAGE_PATH = args.page;
const ROW_LABEL = args.row || 'row';
if (!PAGE_PATH) { console.error('usage: --page /path --row name'); process.exit(1); }

const OUT = resolve(__dirname, 'output/row-drawers', ROW_LABEL);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /^https?:\/\/ads\.lingxing/.test(p.url() || ''));
if (!page) { console.error('no ads tab'); process.exit(2); }
console.log(`[sweep:${ROW_LABEL}] connected to`, page.url());
await page.bringToFront();

function shot(name) {
  const out = join(OUT, name + '.png');
  execFileSync('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    `Add-Type -AssemblyName System.Windows.Forms;` +
    `Add-Type -AssemblyName System.Drawing;` +
    `$b = [System.Windows.Forms.SystemInformation]::VirtualScreen;` +
    `$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height;` +
    `$g = [System.Drawing.Graphics]::FromImage($bmp);` +
    `$g.CopyFromScreen($b.X, $b.Y, 0, 0, $b.Size);` +
    `$bmp.Save('${out.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png);` +
    `$g.Dispose(); $bmp.Dispose();`,
  ], { stdio: 'pipe' });
  console.log(`  shot → ${name}.png`);
  return out;
}

function dump(name, obj) {
  writeFileSync(join(OUT, name + '.json'), JSON.stringify(obj, null, 2));
}

async function closeDrawers() {
  await page.evaluate(() => {
    const all = [...document.querySelectorAll('.modal, [role="dialog"], .left-drawer-container, .drawer-with-content')];
    for (const d of all) {
      const r = d.getBoundingClientRect();
      if (r.width < 200) continue;
      const close = d.querySelector('.close-drawer, .el-drawer__close-btn, .el-dialog__headerbtn, button.close, [aria-label="Close"], .modal-header .close');
      if (close) try { close.click(); } catch {}
    }
  });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
}

async function probeDrawer() {
  return await page.evaluate(() => {
    const all = [...document.querySelectorAll('.modal, [role="dialog"], .left-drawer-container, .drawer-with-content')];
    const drawers = all.filter((d) => {
      const r = d.getBoundingClientRect();
      const cs = window.getComputedStyle(d);
      return r.width > 300 && r.height > 200 && cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    return drawers.map((d) => {
      const tabs = [...d.querySelectorAll('a[role="tab"], a[data-toggle="tab"], .nav-tabs > li > a')];
      const activeTab = [...d.querySelectorAll('a[role="tab"][aria-selected="true"], .nav-tabs > li.active > a, .nav-tabs > li.active')];
      const titleEl = d.querySelector('.main-title, .modal-title, .el-drawer__title, .el-dialog__title');
      return {
        classes: d.className,
        id: d.id || '',
        rect: d.getBoundingClientRect(),
        title: titleEl?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || '',
        tabsCount: tabs.length,
        tabsText: tabs.map((t) => (t.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
        activeTabText: activeTab.map((t) => (t.textContent || '').replace(/\s+/g, ' ').trim()),
      };
    });
  });
}

async function probeFirstRow() {
  return await page.evaluate(() => {
    const tr = document.querySelector('tr[role="row"][data-id]');
    if (!tr) return null;
    const tds = [...tr.querySelectorAll('td')];
    const lastTd = tds[tds.length - 1];
    const icons = lastTd ? [...lastTd.querySelectorAll('a, button')].map((el) => ({
      classes: el.className || '',
      title: el.getAttribute('title') || el.getAttribute('data-text') || '',
      href: (el.getAttribute('data-href') || el.getAttribute('href') || '').slice(0, 80),
    })) : [];
    return {
      'data-id': tr.getAttribute('data-id'),
      'data-campaign_id': tr.getAttribute('data-campaign_id') || '',
      tdCount: tds.length,
      iconsInLastCell: icons,
    };
  });
}

async function clickFirstRowSelector(sel) {
  const target = await page.evaluate((selector) => {
    const tr = document.querySelector('tr[role="row"][data-id]');
    if (!tr) return null;
    const el = tr.querySelector(selector);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const sc = el.closest('.dataTables_scrollBody, .DTFC_ScrollWrapper');
    if (sc) sc.scrollLeft = sc.scrollWidth;
    const rect = el.getBoundingClientRect();
    return { found: true, rect, classes: el.className };
  }, sel);
  if (!target) return { ok: false, reason: 'not_found_in_first_row' };
  await page.waitForTimeout(500);
  try {
    await page.locator(`tr[role="row"][data-id] ${sel}`).first().click({ timeout: 4000, force: true });
    return { ok: true, target };
  } catch (e) {
    await page.evaluate((s) => document.querySelector(`tr[role="row"][data-id] ${s}`)?.click(), sel);
    return { ok: true, target, viaDom: true, locatorError: e.message?.slice(0, 80) };
  }
}

async function clickInPopover(selector) {
  return await page.evaluate((s) => {
    const pops = [...document.querySelectorAll('.popover, .dropdown-menu')];
    const visible = pops.find((p) => {
      const r = p.getBoundingClientRect();
      return r.width > 30 && r.height > 20 && window.getComputedStyle(p).display !== 'none';
    });
    if (!visible) return { ok: false, reason: 'no_popover' };
    const el = visible.querySelector(s);
    if (!el) return { ok: false, reason: 'not_in_popover' };
    el.click();
    return { ok: true, text: (el.textContent || '').trim().slice(0, 40) };
  }, selector);
}

async function clickTabInDrawer(name) {
  return await page.evaluate((target) => {
    const drawers = [...document.querySelectorAll('.modal, [role="dialog"]')];
    const drawer = drawers.find((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 300 && r.height > 200 && window.getComputedStyle(d).display !== 'none';
    });
    if (!drawer) return { ok: false, reason: 'no_drawer' };
    const tabs = [...drawer.querySelectorAll('a[role="tab"], a[data-toggle="tab"], .nav-tabs > li > a')];
    const norm = (s) => (s || '').replace(/\s+/g, '');
    const match = tabs.find((t) => norm(t.textContent) === norm(target));
    if (!match) return { ok: false, reason: 'tab_not_found', available: tabs.map((t) => (t.textContent || '').trim()) };
    match.click();
    return { ok: true };
  }, name);
}

// ----- MAIN SEQUENCE -----
console.log(`\n[sweep:${ROW_LABEL}] → navigate to ${PAGE_PATH}`);
const u = new URL(PAGE_PATH, page.url());
try { await page.goto(u.toString(), { waitUntil: 'networkidle', timeout: 30000 }); }
catch (e) { console.warn('  goto warn:', e.message?.slice(0, 80)); }
await page.waitForTimeout(3500);

// Step 0: close anything lingering, baseline shot
await closeDrawers();
shot('00_master');
const firstRow = await probeFirstRow();
dump('00_first-row', firstRow);
if (!firstRow) {
  console.error(`[sweep:${ROW_LABEL}] no data row on this page`);
  process.exit(0);
}
console.log(`  first row data-id=${firstRow['data-id']} icons=${firstRow.iconsInLastCell.length}`);

// Step 1: click to-compare-data-list (open MCompare drawer on default tab)
console.log(`\n[sweep:${ROW_LABEL}] step 1 → click to-compare-data-list`);
const r1 = await clickFirstRowSelector('.to-compare-data-list');
dump('01_click-compare-data-list', r1);
await page.waitForTimeout(3500);
shot('01_drawer-default');
const d1 = await probeDrawer();
dump('01_drawer-probe', d1);
if (d1.length === 0) {
  console.log('  no drawer opened — skip tabs');
} else {
  const drawer = d1[0];
  console.log(`  drawer ${drawer.id || drawer.classes}: tabs=${drawer.tabsCount} → [${drawer.tabsText.join(', ')}]`);
  for (let i = 0; i < drawer.tabsText.length; i++) {
    const tabName = drawer.tabsText[i];
    const r = await clickTabInDrawer(tabName);
    if (!r.ok) { console.log(`  ✗ tab "${tabName}":`, r.reason); continue; }
    await page.waitForTimeout(2500);
    shot(`02_tab-${String(i + 1).padStart(2, '0')}-${tabName.replace(/\s/g, '')}`);
  }
}

// Step 2: close drawer, click to-show-more
console.log(`\n[sweep:${ROW_LABEL}] step 2 → close drawer + click to-show-more`);
await closeDrawers();
const r2 = await clickFirstRowSelector('.to-show-more');
dump('03_click-show-more', r2);
await page.waitForTimeout(2000);
shot('03_more-popover');

// Step 3: in popover, click to-operate-log (if present)
console.log(`\n[sweep:${ROW_LABEL}] step 3 → click to-operate-log from popover`);
const r3 = await clickInPopover('a.to-operate-log, .to-operate-log a');
dump('04_click-operate-log', r3);
if (r3.ok) {
  await page.waitForTimeout(3000);
  shot('04_operate-log-drawer');
  const d3 = await probeDrawer();
  dump('04_log-drawer-probe', d3);
} else {
  console.log('  no operate-log in popover (this row type may not have it)');
}

await closeDrawers();
console.log(`\n[sweep:${ROW_LABEL}] done. outputs in ${OUT}`);
process.exit(0);
