# Compliance, Data Retention, And Permissions

This document defines baseline privacy/retention and permission rules for mock completed and future live integrations.

## Data Classes

| Class | Examples | Handling |
|---|---|---|
| Seller operations | SKU, ASIN, listing, inventory, order metrics, fees | tenant scoped, least privilege |
| Ads data | campaign, ad group, keyword, bids, budget, search terms | profile scoped, Ads API terms apply |
| Buyer-related data | review, message metadata, order identifiers | mask PII, minimize exports |
| Audit data | approver, payload hash, rollback plan, decision trail | immutable, high retention |
| Commercial data | plan, quota, usage, billing status | sandbox until payment credentials provided |

## Privacy/Retention Rules

- Keep raw buyer PII out of prompts and logs unless explicitly approved and legally permitted.
- Retain audit records long enough to support rollback, dispute analysis, and compliance review.
- Retain mock fixtures as test data; label them as mock and never mix them with live seller exports.
- Delete or anonymize expired operational data according to tenant policy.
- Do not store SP-API, Ads API, payment, LLM, email, or third-party secrets in docs or logs.

## Permission Model

- Viewer: read dashboards and mock outputs.
- Operator: draft M1/M2/M3/M4 actions but cannot execute real writes.
- Approver: approve audit actions within scope and quota.
- Admin: manage credentials, RBAC, commercial plan, retention, and real-write allowlist.

## Forbidden Defaults

Real-write block is on by default. Listing publish, Ads API campaign mutations, buyer messages, refunds, payments, test buys, and destructive data deletion are forbidden until audit approval, rollback, credential validation, and SLA monitoring are in place.
