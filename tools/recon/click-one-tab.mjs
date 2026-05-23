// Click a single named tab in the active drawer and screenshot desktop.
// Usage: node click-one-tab.mjs <tab-name> <output-label>

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'output/drawer-tabs');
mkdirSync(OUT, { recursive: true });

const targetTab = process.argv[2];
const label = process.argv[3] || targetTab;
if (!targetTab) { console.error('usage: node click-one-tab.mjs <tab-name> [label]'); process.exit(1); }

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /^https?:\/\/ads\.lingxing/.test(p.url() || ''));
if (!page) { console.error('no ads tab'); process.exit(2); }
console.log('[tab] target page:', page.url());
await page.bringToFront();
await page.waitForTimeout(800);

const r = await page.evaluate((target) => {
  const drawers = [...document.querySelectorAll('.modal, [role="dialog"], .left-drawer-container, .drawer-with-content')];
  const drawer = drawers.find((d) => {
    const r = d.getBoundingClientRect();
    const cs = window.getComputedStyle(d);
    return r.width > 300 && r.height > 200 && cs.display !== 'none' && cs.visibility !== 'hidden';
  });
  if (!drawer) return { ok: false, reason: 'no_drawer' };
  const tabs = [...drawer.querySelectorAll('a[role="tab"], a[data-toggle="tab"], .nav-tabs > li > a')];
  const norm = (s) => (s || '').replace(/\s+/g, '');
  const match = tabs.find((t) => norm(t.textContent) === norm(target));
  if (!match) {
    return { ok: false, reason: 'not_found', available: tabs.map((t) => (t.textContent || '').trim().slice(0, 30)) };
  }
  match.click();
  return { ok: true, text: (match.textContent || '').trim() };
}, targetTab);

console.log('[tab] click:', JSON.stringify(r));
if (!r.ok) process.exit(3);

await page.waitForTimeout(3500);

const out = join(OUT, `desktop-${label}.png`);
execFileSync('powershell', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
  `Add-Type -AssemblyName System.Windows.Forms;` +
  `Add-Type -AssemblyName System.Drawing;` +
  `$b = [System.Windows.Forms.SystemInformation]::VirtualScreen;` +
  `$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height;` +
  `$g = [System.Drawing.Graphics]::FromImage($bmp);` +
  `$g.CopyFromScreen($b.X, $b.Y, 0, 0, $b.Size);` +
  `$bmp.Save('${out.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png);` +
  `$g.Dispose(); $bmp.Dispose();` +
  `Write-Host saved`,
], { stdio: 'inherit' });
console.log('[tab] saved', out);
process.exit(0);
