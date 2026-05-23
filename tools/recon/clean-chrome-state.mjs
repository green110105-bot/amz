// Close all non-localhost tabs + dismiss any password popups + maximize via Playwright.
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const pages = ctx.pages();

console.log('[clean] tabs before:');
for (const p of pages) console.log('  ·', p.url().slice(0, 80));

// Close everything except localhost + about:blank
for (const p of pages) {
  const u = p.url();
  if (!u.startsWith('http://localhost:5173') && !u.startsWith('about:blank')) {
    console.log('[clean] closing:', u.slice(0, 80));
    await p.close().catch(() => {});
  }
}

// Ensure we have a localhost tab
let target = ctx.pages().find((p) => p.url().startsWith('http://localhost:5173'));
if (!target) {
  target = await ctx.newPage();
  await target.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
}
await target.bringToFront();

// Dismiss any password popup via Escape
for (let i = 0; i < 3; i++) {
  await target.keyboard.press('Escape').catch(() => {});
  await target.waitForTimeout(200);
}

console.log('[clean] tabs after:');
for (const p of ctx.pages()) console.log('  ·', p.url().slice(0, 80));
process.exit(0);
