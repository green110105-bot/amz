# amz Agent Guide

This repository follows the PRD-driven, multi-role workflow described in `PRD.md`.

> **必读且强制：开发/修复/验证任何能力前，先读并遵守 [`CODEX.md`](CODEX.md) 的七步工作法。**
> 🚫 **第 0 铁律（最高优先级）：新功能一律接真实数据源，绝对不可以再用 mock 数据充数。** 接不了真实源就先别做、把阻塞交给用户，绝不用 mock/随机数/写死示例假装做完。详见 CODEX.md 开头第 0 铁律。
> 核心铁律：测试绿 ≠ 可交付——必须叠加独立对抗式核验 + 全量重跑（`npm.cmd run check` EXIT=0）+ 真实探针，且不得为变绿而削弱安全不变量断言。安全不变量基线见 `codex22claude.md`。

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
