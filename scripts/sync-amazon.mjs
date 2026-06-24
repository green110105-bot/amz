#!/usr/bin/env node
// 领星 Amazon 数据定时同步 — cron 每小时调用, 拉美国店近30天落库。
// 用法: node scripts/sync-amazon.mjs [--days 30]
import { getDbInstance } from '../apps/api/src/data-store.mjs';
import { syncAmazonSnapshots } from '../apps/api/src/integrations/lingxing/amazon-store.mjs';
import { isLingxingConfigured } from '../apps/api/src/integrations/lingxing/client.mjs';

const days = Number((process.argv.find((a) => a.startsWith('--days='))?.split('=')[1]) || 30);

(async () => {
  const ts = new Date().toISOString();
  if (!isLingxingConfigured()) {
    console.log(`[sync-amazon] ${ts} SKIP: lingxing not configured (LINGXING_APP_ID/SECRET missing)`);
    process.exit(0);
  }
  try {
    const db = getDbInstance();
    const r = await syncAmazonSnapshots(db, { days });
    console.log(`[sync-amazon] ${ts} OK range=${r.startDate}~${r.endDate} stores=${r.storesOk}/${r.sellerCount}` +
      (r.errors.length ? ` errors=${JSON.stringify(r.errors)}` : ''));
    process.exit(0);
  } catch (err) {
    console.error(`[sync-amazon] ${ts} FAILED: ${err?.message || err}`);
    process.exit(1);
  }
})();
