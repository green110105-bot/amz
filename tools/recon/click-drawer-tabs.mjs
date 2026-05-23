// Click each named tab inside the OPEN drawer, screenshot whole desktop after each.
// Then user (and me) can compare what each tab looks like.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output/drawer-tabs');
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });

const TABS = ['对比分析', '小时数据', '广告位', '用户搜索词'];

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /lingxing.*keyword\/profile/.test(p.url() || ''))
          || ctx.pages().find((p) => /^https?:\/\/ads\.lingxing/.test(p.url() || ''));

if (!page) { console.error('no keyword page'); process.exit(1); }
console.log('[tabs] target:', page.url());
await page.bringToFront();
await page.waitForTimeout(1500);

// Sanity: drawer is open?
const drawerOk = await page.evaluate(() => {
  const all = [...document.querySelectorAll('.modal, [role="dialog"], .left-drawer-container, .drawer-with-content')];
  return all.some((el) => {
    const r = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    return r.width > 300 && r.height > 200 && cs.display !== 'none' && cs.visibility !== 'hidden';
  });
});
if (!drawerOk) {
  console.error('[tabs] ✗ no open drawer on this page — please re-open the keyword drawer first.');
  process.exit(2);
}

function screenshotDesktop(label) {
  const out = join(OUT, `desktop-${label}.png`);
  execFileSync('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-Command',
    `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing;` +
    `$b = [System.Windows.Forms.SystemInformation]::VirtualScreen;` +
    `$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height;` +
    `$g = [System.Drawing.Graphics]::FromImage($bmp);` +
    `$g.CopyFromScreen($b.X, $b.Y, 0, 0, $b.Size);` +
    `$bmp.Save('${out.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png);` +
    `$g.Dispose(); $bmp.Dispose();` +
    `Write-Host 'saved'`,
  ], { stdio: 'inherit' });
  return out;
}

async function clickTab(name) {
  const result = await page.evaluate((target) => {
    const drawers = [...document.querySelectorAll('.modal, [role="dialog"], .left-drawer-container, .drawer-with-content')];
    const drawer = drawers.find((d) => {
      const r = d.getBoundingClientRect();
      const cs = window.getComputedStyle(d);
      return r.width > 300 && r.height > 200 && cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    if (!drawer) return { ok: false, reason: 'no_drawer' };

    const tabSels = ['a[role="tab"]', 'a[data-toggle="tab"]', '.nav-tabs > li > a'];
    const tabs = new Set();
    for (const s of tabSels) for (const t of drawer.querySelectorAll(s)) tabs.add(t);
    const list = [...tabs];
    const norm = (s) => (s || '').replace(/\s+/g, '');
    const match = list.find((t) => norm(t.textContent) === norm(target));
    if (!match) {
      return { ok: false, reason: 'tab_not_found', available: list.map((t) => (t.textContent || '').trim().slice(0, 30)) };
    }
    match.click();
    return { ok: true, text: (match.textContent || '').trim() };
  }, name);
  return result;
}

for (const name of TABS) {
  console.log(`\n[tabs] → clicking "${name}" …`);
  const r = await clickTab(name);
  console.log('  result:', JSON.stringify(r));
  if (!r.ok) {
    console.warn('  skip due to:', r.reason, r.available?.slice(0, 8));
    continue;
  }
  // Wait for content to render
  await page.waitForTimeout(3500);
  const path = screenshotDesktop(name);
  console.log('  desktop saved:', path);
}

console.log('\n[tabs] all done. outputs in', OUT);
process.exit(0);
