// One step at a time: close drawer, click a single element, screenshot desktop.
// Usage:
//   node step.mjs close                                   # close current drawer
//   node step.mjs click '.to-show-more'  more-popup       # click + screenshot

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output/drawer-tabs');
mkdirSync(OUT, { recursive: true });

const cmd = process.argv[2];
const arg1 = process.argv[3];
const label = process.argv[4] || arg1?.replace(/[^\w-]/g, '_') || 'step';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /^https?:\/\/ads\.lingxing/.test(p.url() || ''));
if (!page) { console.error('no ads tab'); process.exit(1); }
await page.bringToFront();

function shotDesktop(name) {
  const out = join(OUT, `desktop-${name}.png`);
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
  ], { stdio: 'inherit' });
  console.log('[step] saved', out);
}

if (cmd === 'close') {
  // Try close button first, then Escape
  const closedByButton = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.modal, [role="dialog"], .left-drawer-container, .drawer-with-content')];
    const visible = all.filter((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 200 && r.height > 200 && window.getComputedStyle(d).display !== 'none';
    });
    let n = 0;
    for (const d of visible) {
      const close = d.querySelector('.close-drawer, .el-drawer__close-btn, .el-dialog__headerbtn, button.close, [aria-label="Close"], .modal-header .close');
      if (close) { try { close.click(); n++; } catch {} }
    }
    return n;
  });
  console.log('[step] close-button clicked on', closedByButton, 'drawer(s)');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(800);
  shotDesktop(label);
  process.exit(0);
}

if (cmd === 'click') {
  // 1) Scroll the element into view (handles DataTables horizontal scroll)
  const scrolled = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)];
    if (els.length === 0) return { ok: false, reason: 'not_found', count: 0 };
    const el = els[0];
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    // For DataTables, also try scrolling the table-scroll container to expose far-right columns
    const scrollContainer = el.closest('.dataTables_scrollBody, .DTFC_ScrollWrapper, [class*="scroll"]');
    if (scrollContainer) {
      scrollContainer.scrollLeft = scrollContainer.scrollWidth;
    }
    return { ok: true, count: els.length, classes: el.className };
  }, arg1);
  console.log('[step] scroll:', JSON.stringify(scrolled));
  if (!scrolled.ok) { process.exit(3); }
  await page.waitForTimeout(700);
  // 2) Use Playwright locator.click (auto-scrolls + real mouse coords)
  try {
    await page.locator(arg1).first().click({ timeout: 5000, force: true });
    console.log('[step] locator click ok');
  } catch (e) {
    console.warn('[step] locator click failed:', e.message?.slice(0, 80), '— falling back to DOM click');
    await page.evaluate((sel) => { document.querySelector(sel)?.click(); }, arg1);
  }
  await page.waitForTimeout(2200);
  // 3) Probe what changed: count new "drawer" / "menu" / "dropdown" appearances
  const after = await page.evaluate(() => {
    const popups = [...document.querySelectorAll('.dropdown-menu, .el-dropdown-menu, .popover, .tooltip, .menu-open, [class*="popup"]')];
    return popups.filter((p) => {
      const r = p.getBoundingClientRect();
      const cs = window.getComputedStyle(p);
      return r.width > 30 && r.height > 20 && cs.display !== 'none' && cs.visibility !== 'hidden';
    }).map((p) => ({
      classes: p.className,
      rect: p.getBoundingClientRect(),
      text: (p.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    }));
  });
  console.log('[step] popups visible after click:', JSON.stringify(after, null, 2));
  shotDesktop(label);
  process.exit(0);
}

if (cmd === 'shot') {
  shotDesktop(label);
  process.exit(0);
}

console.error('unknown cmd. use: close | click <selector> [label] | shot [label]');
process.exit(2);
