# M2 Mobile Production Test Report — p21-m2-mobile-test

- **Target**: http://47.97.252.71 (production, mobile-responsive build)
- **Emulation**: Playwright `devices['iPhone 12']` (390 × 844, DPR 3, touch=true)
- **Browser**: chromium (chrome-win64) with `--no-sandbox` (avoids Win11 concurrent-launch sandbox errors)
- **Spec**: `D:/amz/tests/e2e/m2-mobile.spec.mjs`
- **Log**: `D:/amz/tmp/m2-mobile-test.log`
- **Iterations**: 10 per page × 19 pages = 190 page loads
- **Workers**: 1 (serialized to coexist with 3 other mobile-test agents)
- **Duration**: ~1.7 min

## Per-iter Assertions

For each page × 10 iters:
1. **No horizontal overflow** — `documentElement.scrollWidth <= clientWidth + 5`
2. **Page renders content** — `body.textContent.trim().length > 50`
3. **T3 pages**: render `MobileFallback` component (CSS `.mfb` or text "桌面端推荐")

All assertions use `expect.soft` so a single bad iter does not abort the whole page.

## Summary

| Result | Count |
|---|---|
| Tests passed | 18 / 19 |
| Tests failed | 1 / 19 (PurchaseOrders — see Findings) |
| Iterations executed | 190 / 190 |
| Horizontal overflow violations | 0 |
| Empty/blank pages | 0 |

## Per-page Results (× 10 iters each)

| # | Page | Path | Tier | Result |
|---|---|---|---|---|
| 1 | ProfitOverview | `/profit/overview` | T1 | PASS |
| 2 | ProfitSkus | `/profit/skus` | T2 | PASS |
| 3 | OrderProfit | `/profit/orders/sample` | T2 | PASS |
| 4 | ProfitLeaks | `/profit/leaks` | T2 | PASS |
| 5 | ProfitCashflow | `/profit/cashflow` | T2 | PASS |
| 6 | ScenarioSimulator | `/profit/scenario` | T3 | PASS (MobileFallback rendered) |
| 7 | InventoryReorder | `/inventory/reorder` | T2 | PASS |
| 8 | SlowMovingDecision | `/inventory/slow-moving` | T2 | PASS |
| 9 | RepricingDecision | `/repricing` | T2 | PASS |
| 10 | PurchaseOrders | `/inventory/po` | T3 | **FAIL** — MobileFallback not on list view |
| 11 | Suppliers | `/inventory/suppliers` | T2 | PASS |
| 12 | InventoryTransfers | `/inventory/transfers` | T2 | PASS |
| 13 | MultiStore | `/profit/multi-store` | T2 | PASS |
| 14 | Dimensions | `/profit/dimensions` | T2 | PASS |
| 15 | FxRisk | `/profit/fx` | T2 | PASS |
| 16 | PaymentChannels | `/costs/payment-channels` | T2 | PASS |
| 17 | TaxAssist | `/tax` | T3 | PASS (MobileFallback rendered) |
| 18 | LTV | `/profit/ltv` | T2 | PASS |
| 19 | CustomAlerts | `/alerts/custom` | T2 | PASS |

## Findings

### F1 — PurchaseOrders T3 fallback only fires on PO detail, not on list (10/10 iters failed soft assertion)

`apps/web-v2/src/pages/PurchaseOrders.vue:232` guards the `MobileFallback`
with `v-if="isMobile && current"`, i.e. the fallback only appears once a
specific PO is selected ("current"). The list/index view at `/inventory/po`
is intentionally mobile-usable (ResponsiveTable card form) and does not
emit a MobileFallback. Spec `docs/MOBILE_RESPONSIVE_SPEC.md` §6 says
"PurchaseOrders 详情" is T3 (note: 详情 = detail), so this is **consistent
with spec**: only the detail editor falls back, the list view does not.

Test treated `/inventory/po` as fully T3, which is too strict.
Recommendation: scope the assertion to "MobileFallback visible after a row
is opened" rather than on the bare list URL. No production code change
needed — observed behavior matches design intent.

ScenarioSimulator (`/profit/scenario`) and TaxAssist (`/tax`) both render
MobileFallback unconditionally under `isMobile`, and passed all 10 iters.

### F2 — All 19 pages render non-empty content on first iPhone-12 hashroute load

Body text > 50 chars in 190 / 190 iterations. No 502s observed during
the run (login retried up to 3× when wrapping behavior was used). Login
auth, `localStorage.amz_auth_token`, and `amz_current_store_id` all
seed cleanly via `addInitScript` and survive subsequent `gotoHash` calls.

### F3 — No horizontal scroll on any page in 190 iterations

`document.documentElement.scrollWidth - clientWidth <= 5` on every iter.
Mobile responsive foundation (p15) + per-page migrations (p17) are holding.

## Bugs

None blocking. F1 above is a documentation/test-precision issue, not a
product bug.

## Artifacts

- `tests/e2e/m2-mobile.spec.mjs` — test spec
- `tmp/m2-mobile-test.log` — full run log
- `test-results/m2-mobile/` — trace.zip + screenshots for the 10 PurchaseOrders failure iters

## Conclusion

**Status: PASS** (with one expected-strict-locator note on PurchaseOrders).
M2 mobile production deployment at http://47.97.252.71 is healthy on
iPhone 12 emulation across all 19 pages: zero overflow, all pages render,
all T3 pages with full-page fallback (ScenarioSimulator, TaxAssist) work as
expected.
