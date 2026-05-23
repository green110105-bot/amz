// E2E test for AdAnalysisDrawer in the local dev app.
// Login → nav to LX targeting → click row → click each tab → screenshot each.
// All screenshots are full desktop via PowerShell so I can SEE the real result.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output/dev-test');
mkdirSync(OUT, { recursive: true });

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
}

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /^http:\/\/localhost:5173/.test(p.url() || ''));
if (!page) { console.error('no localhost tab'); process.exit(1); }
console.log('[e2e] active tab:', page.url());
await page.bringToFront();
// Force a desktop-sized viewport so layout renders properly + dismiss popups
await page.setViewportSize({ width: 1920, height: 1080 }).catch(() => {});
await page.waitForTimeout(800);
// Dismiss browser password-save prompt by pressing Escape
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(500);

// 1) login if on login page
if (page.url().includes('/login')) {
  console.log('[e2e] → logging in as demo/demo');
  try {
    await page.locator('input[type=email], input[placeholder*="邮"], input[placeholder*="email" i], input[name=email]').first().fill('demo@amz.local', { timeout: 5000 });
  } catch {
    // try first input
    const inputs = await page.locator('input').all();
    if (inputs.length >= 1) await inputs[0].fill('demo@amz.local');
  }
  try {
    await page.locator('input[type=password], input[placeholder*="密"]').first().fill('demo', { timeout: 5000 });
  } catch {}
  shot('01_login_filled');
  await page.locator('button:has-text("登录"), button:has-text("登 录"), button[type=submit]').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2500);
  console.log('[e2e] after login:', page.url());
}
shot('02_after_login');

// 2) Navigate directly to LxCampaignDetail's TARGETING tab (URL-driven)
const TARGETING_URL = 'http://localhost:5173/#/ads/lx/campaigns/cmp-001?g=targeting';
console.log(`[e2e] → navigating to ${TARGETING_URL}`);
await page.goto(TARGETING_URL, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
await page.waitForTimeout(3000);
shot('03_targeting_page');

// 3) Click the first row's investment-name link to open drawer
//    The targeting table's "投放内容" column anchors have class "link" (added in our integration).
const rowClick = await page.evaluate(() => {
  // Look only INSIDE the targeting tab's table (avoid sidebar links)
  const tables = [...document.querySelectorAll('.el-table__body tbody tr')];
  for (const row of tables) {
    const link = row.querySelector('a.link, .link');
    if (link) {
      const r = link.getBoundingClientRect();
      if (r.width > 5 && r.height > 5) {
        link.click();
        return { ok: true, text: link.textContent.trim().slice(0, 40) };
      }
    }
  }
  return { ok: false, count: tables.length };
});
console.log('[e2e] clicked row link:', rowClick);
await page.waitForTimeout(2500);
shot('06_drawer_default');

// 4) Click each tab in drawer
const tabs = await page.evaluate(() => {
  const drawer = document.querySelector('.ad-analysis-drawer .el-tabs');
  if (!drawer) return [];
  return [...drawer.querySelectorAll('.el-tabs__item')].map((t) => t.textContent.trim());
});
console.log('[e2e] drawer tabs detected:', tabs);

for (let i = 0; i < tabs.length; i++) {
  const t = tabs[i];
  await page.evaluate((target) => {
    const items = [...document.querySelectorAll('.ad-analysis-drawer .el-tabs__item')];
    const match = items.find((el) => el.textContent.trim() === target);
    if (match) match.click();
  }, t);
  await page.waitForTimeout(2000);
  shot(`07_tab_${String(i + 1).padStart(2, '0')}_${t.replace(/\s/g, '')}`);
}

console.log('[e2e] all screenshots saved to', OUT);
process.exit(0);
