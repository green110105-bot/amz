# Coverage Gate

## Source Coverage

| Source | Items | User Stories | Checklists | API Items | DDL Tables |
|---|---:|---:|---:|---:|---:|
| PRD.md | 223 | 0 | 31 | 0 | 27 |
| docs/cross-module/audit-center.md | 42 | 0 | 15 | 8 | 1 |
| docs/modules/M1-listing-optimization.md | 210 | 34 | 11 | 34 | 4 |
| docs/modules/M2-realtime-profit-inventory.md | 345 | 54 | 6 | 68 | 20 |
| docs/modules/M3-lifecycle-ad-optimization.md | 236 | 54 | 5 | 42 | 1 |
| docs/modules/M4-daily-ops-monitoring.md | 257 | 54 | 6 | 51 | 0 |

## Module Coverage

| Module | Items | Pending | Started/Documented | Mocked External Dependencies |
|---|---:|---:|---:|---:|
| AUDIT | 42 | 0 | 42 | 0 |
| M1 | 210 | 0 | 210 | 9 |
| M2 | 345 | 0 | 345 | 7 |
| M3 | 236 | 0 | 236 | 8 |
| M4 | 257 | 0 | 257 | 44 |
| PRD | 223 | 0 | 223 | 16 |

## Type Coverage

| Type | Count |
|---|---:|
| API_ROW | 203 |
| CHECKLIST | 74 |
| DDL_TABLE | 53 |
| SECTION | 787 |
| USER_STORY | 196 |

## No-Omission Rule
- Every source document above must have at least one traceability item.
- Every user-story row with an ID must have implementation and test ownership.
- Every external dependency must remain mock-gated until credentials and explicit write approval exist.
- A feature is not considered done until its status is not `pending`, tests exist, and real/sandbox/manual validation evidence is recorded.
