// Launch a debug-mode Chrome window using a SEPARATE profile so it doesn't
// fight with your daily Chrome. Listens on localhost:9222 for CDP control.
// Exits as soon as Chrome is up; Chrome keeps running until you close it.

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = resolve(__dirname, '.chrome-profile');
if (!existsSync(PROFILE_DIR)) mkdirSync(PROFILE_DIR, { recursive: true });

console.log('[recon] launching Chrome (channel=chrome) with profile dir:', PROFILE_DIR);
console.log('[recon] debug port: 9222');

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: 'chrome',
  headless: false,
  args: ['--remote-debugging-port=9222', '--start-maximized'],
  viewport: null,
});

console.log('\n[recon] ✓ Chrome is up. Do this in the new window:');
console.log('       1. Log in to 领星 ERP');
console.log('       2. Navigate to the ad module (any page is fine)');
console.log('       3. Leave that tab open');
console.log('\n[recon] When ready, run:  npm run recon:crawl');
console.log('[recon] (you can also Ctrl+C this terminal — Chrome will keep running)');

// Keep the process alive so user can see hints; they can Ctrl+C anytime.
await new Promise(() => {});
