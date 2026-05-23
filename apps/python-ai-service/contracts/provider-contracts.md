# Provider, Worker, and ETL Mock Contracts

## Providers

- LLM provider defaults to `deterministic-mock`; real LLM API calls require sandbox credentials and explicit approval.
- Marketplace intelligence providers default to fixture-backed Keepa, SellerSprite, and Helium 10 adapters.
- Provider responses must include `source`, `confidence`, and `freshness` metadata.

## Workers

- Decision workers consume mock queue messages such as `m2.refresh`, `m3.refresh`, and `explanation.requested`.
- Worker outputs must match `decision-envelope.schema.json` and route write-like outputs to the audit draft sink.
- No worker may call a real store, Ads, payment, email, WeCom, or WeChat write path directly.

## ETL

- ETL inputs are mock snapshots for orders, inventory, listings, reports, campaigns, and search terms.
- ETL contracts must preserve adapter provenance and data freshness timestamps.
- SP-API and Ads API integrations remain adapter interfaces until credentials are supplied.

## OpenAPI/Mock References

- Gateway OpenAPI: `../../go-api-gateway/contracts/openapi.gateway.yaml`
- Next web mock view contract: `../../next-web/contracts/web-bff.mock.json`
