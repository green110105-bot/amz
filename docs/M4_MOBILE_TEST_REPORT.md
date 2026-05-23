# M4 Mobile Production Test Report

- **Phase**: `p23-m4-mobile-test`
- **Target**: `http://47.97.252.71`
- **Device**: Playwright **iPhone 12** emulation (390×844, DPR 3, touch)
- **Browser**: Chromium (devices.iPhone 12 minus `defaultBrowserType=webkit`)
- **Spec**: `D:/amz/tests/e2e/m4-mobile.spec.mjs`
- **Raw log**: `D:/amz/tmp/m4-mobile-test.log`
- **Scope**: 16 M4 pages + 1 global `NotificationBell` test, **× 10 iterations** each (170 iters total)

## Summary

- **Tests**: 17
- **Passed**: 17 / 17 (after fixing test selector + Appeals dialog open)
- **Failed**: 0
- **Total duration**: ~1.5 min wall-clock (workers=1, sequential)

## Page coverage

### T1 — mobile first class (3)
| Page | Path | iters | Result |
|---|---|---|---|
| MonitorAnomalies | `/monitor/anomalies` | 10 | PASS — no horizontal overflow, content rendered |
| SLABoard | `/monitor/sla` | 10 | PASS |
| Notifications | `/notifications` | 10 | PASS |

### T3 — desktop-first + MobileFallback (1)
| Page | Path | iters | Result |
|---|---|---|---|
| Appeals | `/reviews/appeals` | 10 | PASS — MobileFallback present **inside "起草申诉" dialog** (not on default list view) |

### T2 — mobile usable list-style (12)
| Page | Path | iters | Result |
|---|---|---|---|
| ResolutionCases | `/monitor/cases` | 10 | PASS |
| Postmortems | `/monitor/postmortems` | 10 | PASS |
| Hijacking | `/monitor/hijacking` | 10 | PASS |
| Infringement | `/monitor/infringement` | 10 | PASS |
| ReviewList | `/reviews` | 10 | PASS |
| ReviewClusters | `/reviews/clusters` | 10 | PASS |
| ReviewTrends | `/reviews/trends` | 10 | PASS |
| RecoveryEmails | `/reviews/recovery` | 10 | PASS |
| Competitors | `/competitors` | 10 | PASS |
| ImageDiff | `/competitors/image-diff` | 10 | PASS |
| CompetitorAttack | `/ads/competitor-attack` | 10 | PASS |
| BrandDefense | `/ads/brand-defense` | 10 | PASS |

## Per-iter checks

Each iteration on each page asserts (soft):
1. `document.documentElement.scrollWidth <= clientWidth + 5` — **no horizontal overflow**
2. `body.textContent.trim().length > 50` — **non-empty content rendered**
3. T3 only: `.mfb` or text `桌面端推荐` ≥ 1 — **MobileFallback present**

## NotificationBell global × 10

**Test**: `NotificationBell mobile - 铃铛 visible + popover no overflow × 10`
**Result**: **PASS** (6.3s)

Verified on `/monitor/anomalies` (any M4 page mounts `DefaultLayout` → bell):

- Bell trigger selector: `.bell-badge button` (canonical, per `m4-prod.spec.mjs`); aux fallback `.notification-bell, [aria-label*="通知"], [aria-label*="notification"]`.
- All 10 iters: bell `Visible` on iPhone 12 viewport (right side of mobile top bar, not hidden behind hamburger).
- All 10 iters after tapping bell to open popover: `scrollWidth <= clientWidth + 5` (popover does **not** cause horizontal overflow on a 390 px wide viewport).
- Esc closes popover cleanly between iters.

## Bugs / Findings

1. **(test infra)** `m4-mobile.spec.mjs` initial draft used CSS selector `'.mfb, text=桌面端推荐'` which mixes Playwright text-engine with CSS comma — fixed to split into `page.locator('.mfb')` + `page.getByText('桌面端推荐')`.
2. **(test design)** Appeals MobileFallback lives **inside** the "起草申诉" `<ResponsiveDialog>` (`MobileFallback v-if="isMobile"` at `Appeals.vue:212`), not on the page list. Spec updated to click "起草申诉" before asserting `.mfb`. Product behavior is correct (list is mobile-usable via `ResponsiveTable`, only the multi-field editor falls back).
3. **(host-level, recovered)** First two attempts failed with Windows Sandbox `拒绝访问 (0x5)` accessing chrome.exe due to 4 concurrent agents launching the same binary, and a second attempt accidentally requested webkit (because `devices['iPhone 12']` carries `defaultBrowserType: webkit`). Fixed by deleting `defaultBrowserType` and passing `launchOptions: { executablePath: <chrome>, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] }` (same pattern used by `m1-mobile.spec.mjs`).
4. **No product bugs surfaced** on M4 mobile after Appeals fix: no horizontal overflow on any of 16 pages × 10 iters, content always rendered, NotificationBell always reachable on mobile.

## Blocking

None.

## Artifacts

- `D:/amz/tests/e2e/m4-mobile.spec.mjs`
- `D:/amz/tmp/m4-mobile-test.log`
- `D:/amz/test-results/m4-mobile/` (traces / screenshots only kept on failure — empty on green run)
- `D:/amz/tmp/sentinels/p23-m4-mobile-test.{STARTED,HEARTBEAT,DONE}`
