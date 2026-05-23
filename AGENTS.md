# amz Agent Guide

This repository follows the PRD-driven, multi-role workflow described in `PRD.md`.

## Default Mode
- Work autonomously with minimal user interruption.
- Account, payment, real-store authorization, and production write operations must be mocked or sandboxed until credentials are provided.
- Do not revert user-authored changes in `PRD.md` or `docs/`.
- Keep `PROJECT_STATUS.md`, `MEMORY.md`, and `docs/implementation/*` current after each work round.

## Roles
- PM-Architect: turns PRD/docs into task cards and acceptance criteria.
- Data/API: owns adapters, mock fixtures, ETL contracts, and data freshness metadata.
- Domain: owns profit, inventory, ad lifecycle, monitoring, and audit decision logic.
- Frontend/API: owns HTTP endpoints and eventual UI integration contracts.
- QA: owns unit, integration, contract, and smoke tests.
- DevOps: owns local run, Docker, CI, and health checks.

## Current MVP Bias
1. Data foundation and mock adapters.
2. M2 profit/inventory decision loop.
3. M3 ad suggestion loop.
4. Audit center for all write-like operations.
5. Dashboard action cards.
6. M1/M4 advanced features after the first validated loop.

## External Dependencies Policy
- Amazon SP-API, Amazon Ads API, Keepa, SellerSprite, Helium 10, LLM APIs, email, WeCom, and real store actions are adapter interfaces first.
- Use deterministic mock data by default.
- Mark every mock-backed feature with source and confidence metadata.
