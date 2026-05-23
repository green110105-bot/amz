// playwright.config.mjs — M3 端到端测试配置
// 测试目标：Vite dev server (http://localhost:5180 → 5185 之间任意一个)
// 后端：http://localhost:8080 必须先起
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: false, // M3 tests share DB state — serialize
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PW_BASE_URL || 'http://localhost:5180',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // Use the full chromium browser (chrome-win64) rather than the headless-shell binary,
      // since the headless-shell variant may not always be downloaded.
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        launchOptions: {
          executablePath: process.env.PW_CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
        },
      },
    },
  ],
});
