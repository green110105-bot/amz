# Python AI Service Boundary

This folder is a migration boundary for decision intelligence and provider adapters. The actual application still runs through the Node mock-gated decision and service runner paths until real LLM/provider credentials and write approvals are supplied.

## Responsibility

- Evaluate M2 profit/inventory, M3 ad lifecycle, M4 monitoring, and M1 listing iteration decisions.
- Return deterministic explanations with `source`, `confidence`, and `freshness` metadata.
- Produce audit draft actions only; never directly mutate Amazon, Ads, payment, email, or store state.
- Keep LLM, Keepa, SellerSprite, Helium 10, SP-API, Ads API, and notification providers behind mock-first adapter contracts.

## Contract References

- Decision envelope schema: `contracts/decision-envelope.schema.json`
- Provider, worker, and ETL contract notes: `contracts/provider-contracts.md`
- Runtime source of truth today: Node mock-gated services and deterministic fixtures.

## Local Config Example

Use `config/ai-service.example.env` for local boundary experiments. All provider credential values must remain placeholders unless the environment is an approved sandbox.

## Worker/Provider/ETL Shape

- `worker/decision_worker.py` documents queue-oriented decision processing.
- `providers/README.md` documents adapter interfaces for LLM and marketplace intelligence providers.
- `etl/README.md` documents mock-backed snapshots consumed by decisions.
